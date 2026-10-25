/**
 * The mail provider. Zender is selectable without adding an SDK. SPEC.md §8.
 *
 * Both transports use plain `fetch` rather than an SDK. The only call this system
 * makes is "send one message", and a dependency that ships its own retry and
 * telemetry is more surface than that is worth on the one path a claim URL
 * travels.
 *
 * Kleym templates contain no tracking assets. Resend tracking is disabled
 * explicitly below. Zender's provider tracking is operator-controlled and
 * must be verified separately; the API exposes no per-message switch.
 */
import { env } from '@/lib/config/env'
import { sendZender } from './zender'

export interface Message {
  to: string
  subject: string
  text: string
  html: string
  /** Stable for retries of one mail event; never contains a code or address. */
  idempotencyKey?: string
}

export type Mailer = (message: Message) => Promise<{ id: string }>

/**
 * Sends through Resend.
 *
 * Tracking is disabled EXPLICITLY rather than relied upon to be off by
 * default: a provider changing its default would silently start pixelling
 * every claim email, and nothing in this codebase would notice.
 */
export const resend: Mailer = async (message) => {
  if (env.EMAIL_PROVIDER === 'zender') return sendZender(message)
  if (!env.RESEND_API_KEY) throw new Error('Mail provider is not configured')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // Resend's names for open-pixel and link-rewriting.
      track_opens: false,
      track_clicks: false,
    }),
  })

  if (!response.ok) {
    /*
     * The provider's body is read for a reason, not echoed anywhere.
     *
     * It is thrown so BullMQ can retry on it, and the worker logs only the
     * status — a provider that echoes the request back would otherwise put the
     * claim URL into a log line (AGENT.md §4.5).
     */
    throw new Error(`mail provider rejected the message (${response.status})`)
  }

  const body = (await response.json()) as { id?: string }
  return { id: body.id ?? 'unknown' }
}
