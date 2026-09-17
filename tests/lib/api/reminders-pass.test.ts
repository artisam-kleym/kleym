import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * #78, round 2. The reminder pass records the due points BEFORE it enqueues
 * and rolls the row back only if the enqueue fails; erasure removes queued
 * reminders beside the claim email. Both are ordering guarantees about
 * side effects, so they are pinned here with the database and the queue
 * replaced by recording fakes.
 */
const db = vi.hoisted(() => ({
  delivery: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  campaign: { findMany: vi.fn() },
}))
/** A queue with BullMQ's dedup surface: `deduplication.id` → job id, and `getJob` by id. */
const queue = vi.hoisted(() => {
  const dedup = new Map<string, string>()
  const jobs = new Map<string, { remove: () => Promise<void> }>()
  return {
    dedup,
    jobs,
    add: vi.fn(async (_name: string, _data: unknown, opts: { deduplication: { id: string } }) => {
      const jobId = `job-${dedup.size + 1}`
      dedup.set(opts.deduplication.id, jobId)
      jobs.set(jobId, { remove: async () => { jobs.delete(jobId) } })
    }),
    getDeduplicationJobId: vi.fn(async (id: string) => dedup.get(id) ?? null),
    getJob: vi.fn(async (id: string) => jobs.get(id) ?? null),
    removeDeduplicationKey: vi.fn(async (id: string) => { dedup.delete(id) }),
  }
})

vi.mock('@/lib/db/client', () => ({ prisma: db }))
vi.mock('@/lib/redis/client', () => ({ redis: {} }))
vi.mock('@/lib/queue/email', () => ({
  deliveryJobs: () => queue,
  enqueueReminder: vi.fn(),
}))
vi.mock('@/lib/webhooks/emit', () => ({ emitWebhook: vi.fn() }))
vi.mock('@/lib/api/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/api/suspend', () => ({ outstandingLinks: vi.fn() }))

const { sendReminders } = await import('@/lib/api/reminders')
const { eraseByEmail } = await import('@/lib/api/privacy')

const DAY = 86_400_000
const NOW = new Date('2026-09-24T12:00:00Z')
const EXPIRES = new Date(NOW.getTime() + 2 * DAY)

const delivery = {
  id: 'd1',
  email: 'alice@example.com',
  sentAt: new Date(NOW.getTime() - 5 * DAY),
  reminderPoints: [7],
  remindedAt: new Date(NOW.getTime() - 3 * DAY),
  link: {
    id: 'l1',
    amount: '12.5',
    campaign: { id: 'c1', name: 'Q3', assetCode: 'XLM', expiresAt: EXPIRES, reminderDaysBefore: [7, 3, 1], user: { username: 'acme' } },
  },
}

const deps = () => ({
  allowRecipient: vi.fn(async () => true),
  releaseRecipient: vi.fn(async () => undefined),
  enqueue: vi.fn(async () => undefined),
})
const cursor = { get: async () => null, set: async () => undefined }
const sink = async () => undefined

beforeEach(() => {
  vi.clearAllMocks()
  queue.dedup.clear()
  queue.jobs.clear()
  db.delivery.findMany.mockResolvedValue([delivery])
  db.delivery.update.mockResolvedValue({})
  db.delivery.count.mockResolvedValue(0)
  db.campaign.findMany.mockResolvedValue([])
})

describe('sendReminders records before it enqueues', () => {
  it('happy path: one update, then the enqueue, and the reminder counted', async () => {
    const d = deps()
    const report = await sendReminders(d, NOW, { cursor, report: sink })

    expect(db.delivery.update).toHaveBeenCalledTimes(1)
    expect(db.delivery.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { reminderPoints: { push: [3] }, remindedAt: NOW } })
    expect(d.enqueue).toHaveBeenCalledTimes(1)
    expect(d.enqueue.mock.invocationCallOrder[0]!).toBeGreaterThan(db.delivery.update.mock.invocationCallOrder[0]!)
    expect(d.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reminder', deliveryId: 'd1', point: 3, amount: '12.5' }))
    expect(d.releaseRecipient).not.toHaveBeenCalled()
    expect(report.reminded).toBe(1)
  })

  it('enqueue rejects: the row is rolled back to what it was and the floor released', async () => {
    const d = deps()
    d.enqueue.mockRejectedValueOnce(new Error('redis gone'))
    const report = await sendReminders(d, NOW, { cursor, report: sink })

    expect(db.delivery.update).toHaveBeenCalledTimes(2)
    expect(db.delivery.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'd1' },
      data: { reminderPoints: { set: [7] }, remindedAt: delivery.remindedAt },
    })
    expect(d.releaseRecipient).toHaveBeenCalledWith('alice@example.com')
    expect(report.reminded).toBe(0)
  })

  it('the record rejects: nothing is enqueued and the floor is released', async () => {
    const d = deps()
    db.delivery.update.mockRejectedValueOnce(new Error('db gone'))
    const report = await sendReminders(d, NOW, { cursor, report: sink })

    expect(db.delivery.update).toHaveBeenCalledTimes(1)
    expect(d.enqueue).not.toHaveBeenCalled()
    expect(d.releaseRecipient).toHaveBeenCalledWith('alice@example.com')
    expect(report.reminded).toBe(0)
  })

  it('enqueue "fails" after the job landed: the rollback also removes the job, so no second copy can follow', async () => {
    const d = deps()
    d.enqueue.mockImplementationOnce(async () => {
      await queue.add('email', {}, { deduplication: { id: 'remind:d1:3' } })
      throw new Error('connection dropped after the write')
    })
    await sendReminders(d, NOW, { cursor, report: sink })

    expect(await queue.getDeduplicationJobId('remind:d1:3')).toBeNull()
    expect(queue.jobs.size).toBe(0)
  })
})

describe('eraseByEmail removes queued reminders beside the claim email', () => {
  it('leaves no deliver: or remind: job for the delivery', async () => {
    db.delivery.findMany.mockResolvedValue([{ id: 'd1', reminderPoints: [7, 3] }])
    db.delivery.updateMany.mockResolvedValue({ count: 1 })
    for (const id of ['deliver:d1', 'remind:d1:7', 'remind:d1:3']) await queue.add('email', {}, { deduplication: { id } })
    expect(queue.jobs.size).toBe(3)

    const result = await eraseByEmail('admin', 'Alice@Example.com', null)

    expect(result).toEqual({ redacted: 1 })
    for (const id of ['deliver:d1', 'remind:d1:7', 'remind:d1:3']) expect(await queue.getDeduplicationJobId(id)).toBeNull()
    expect(queue.jobs.size).toBe(0)
  })
})
