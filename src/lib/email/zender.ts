/** Server-only Zender API v1 transport. Never accepts a private claim URL. */
import { env } from '@/lib/config/env'
import { z } from 'zod'
import type { Message } from './provider'

/** Safe diagnostic fields only; never retain a provider response or mail body. */
export class ZenderError extends Error {
  constructor(public readonly status: number | null, public readonly requestId: string | null = null,
    public readonly retryAfterSeconds: number | null = null) {
    super(status === null ? 'Zender request could not complete' : `Zender rejected mail (${status})`)
    this.name = 'ZenderError'
  }
}

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1000
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : null
}

function requestId(response: Response): string | null {
  const value = response.headers.get('X-Request-Id')
  return value && /^[a-f0-9-]{16,64}$/i.test(value) ? value : null
}

const acceptedMail = z.object({ data: z.object({
  messages: z.array(z.object({ id: z.string().min(1).max(200) })).length(1),
  suppressed: z.array(z.unknown()).max(0).default([]),
}) })

export async function sendZender(message: Message): Promise<{ id: string }> {
  if (!env.ZENDER_API_KEY || !message.idempotencyKey) throw new Error('Zender mail is not configured or has no event identity')
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(message.idempotencyKey) || message.idempotencyKey.startsWith('cmp:')) throw new Error('Invalid Zender event identity')
  // This transport must remain secret-free even if a future caller misroutes a legacy job.
  if ([message.text, message.html].some((body) => /S[A-Z2-7]{55}|(?:\/claim[^\s"<>]*#)/.test(body))) {
    throw new Error('Private claim material cannot be emailed')
  }
  const body = JSON.stringify({
      from: { email: env.EMAIL_FROM, name: 'Kleym' }, to: [{ email: message.to }],
      subject_override: message.subject, content: { text: message.text, html: message.html },
      tags: ['kleym-transactional'],
    })
  // One business event, one immutable body/key, at most three attempts within
  // fifteen seconds. Never turn a timeout or 409 into a new mail event.
  const deadline = Date.now() + 15_000
  let response: Response | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    let failure: ZenderError
    try {
      response = await fetch(`${env.ZENDER_BASE_URL.replace(/\/$/, '')}/emails`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        headers: { authorization: `Bearer ${env.ZENDER_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': message.idempotencyKey }, body,
      })
      if (response.ok) break
      const delay = retryAfterMs(response.headers.get('Retry-After'))
      failure = new ZenderError(response.status, requestId(response), delay === null ? null : Math.ceil(delay / 1000))
      if (response.status !== 429 && response.status < 500) throw failure
    } catch (error) {
      if (error instanceof ZenderError) throw error
      failure = new ZenderError(null)
      response = undefined
    }
    const delay = response ? retryAfterMs(response.headers.get('Retry-After')) : null
    const wait = delay ?? (250 * 2 ** attempt + Math.floor(Math.random() * 150))
    await response?.body?.cancel().catch(() => undefined)
    // Respect a long Retry-After by stopping, never retrying earlier than asked.
    if (attempt === 2 || wait + 100 >= deadline - Date.now()) throw failure
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  // Do not echo provider bodies: they may contain the recipient or an OTP.
  if (!response?.ok) throw new ZenderError(response?.status ?? null)
  const result = acceptedMail.safeParse(await response.json().catch(() => { throw new Error('Zender returned an invalid response') }))
  if (!result.success) throw new Error('Zender did not queue the message')
  return { id: result.data.data.messages[0]!.id } // Queued, never evidence of inbox delivery.
}

const mailStatus = z.object({ data: z.object({
  id: z.string(), status: z.enum(['queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'suppressed', 'cancelled']),
  delivered_at: z.iso.datetime().nullable().optional(),
}) })

/** Polling needs emails:read; return no address, content or metadata. */
export async function zenderMessageStatus(id: string): Promise<string> {
  if (!env.ZENDER_API_KEY || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid Zender status lookup')
  const response = await fetch(`${env.ZENDER_BASE_URL.replace(/\/$/, '')}/emails/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${env.ZENDER_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new ZenderError(null) })
  if (!response.ok) {
    const delay = retryAfterMs(response.headers.get('Retry-After'))
    throw new ZenderError(response.status, requestId(response), delay === null ? null : Math.ceil(delay / 1000))
  }
  const parsed = mailStatus.safeParse(await response.json().catch(() => null))
  if (!parsed.success || parsed.data.data.id !== id) throw new Error('Invalid Zender status response')
  const data = parsed.data.data
  // Engagement may come from a scanner: require delivery evidence, not a click.
  if (['opened', 'clicked'].includes(data.status) && !data.delivered_at) return 'sent'
  return data.status
}
