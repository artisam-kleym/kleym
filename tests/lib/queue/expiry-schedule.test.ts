import { expect, it, vi } from 'vitest'

const schedules = vi.hoisted(() => vi.fn())
vi.mock('bullmq', () => ({ Queue: class { upsertJobScheduler = schedules } }))
vi.mock('@/lib/queue/connection', () => ({
  queueConnection: () => ({}),
  QUEUE: { reconcile: 'reconcile', expirySweep: 'expiry-sweep', ephemeralWatch: 'ephemeral-watch', deliveryRetention: 'delivery-retention', reminders: 'reminders', templates: 'templates', valuations: 'valuations' },
}))

it('updates the existing expiry scheduler to each minute on worker restart', async () => {
  const { scheduleMaintenance } = await import('@/lib/queue/maintenance')
  await scheduleMaintenance()
  await scheduleMaintenance()
  const expiry = schedules.mock.calls.filter(([id]) => id === 'expiry-sweep-hourly')
  expect(expiry).toEqual([
    ['expiry-sweep-hourly', { pattern: '*/1 * * * *' }],
    ['expiry-sweep-hourly', { pattern: '*/1 * * * *' }],
  ])
})
