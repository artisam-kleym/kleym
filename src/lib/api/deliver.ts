/**
 * Email delivery. SPEC.md §6.5 — the ONE deliberate exception to the rule that
 * no link material transits the server.
 *
 * AGENT.md §1: do not extend this exception anywhere else.
 *
 * The server does not know the claim URLs. The sender's browser holds them, and
 * sends them here per recipient. Every mitigation SPEC.md §6.5 lists is
 * mandatory and each one is implemented somewhere specific:
 *
 *   passed to the provider and discarded  — the URL lives in the job payload
 *                                           and a local, and is never returned
 *   never written to the database         — `Delivery` has no url column, and
 *                                           the CI schema guard enforces that
 *   never logged                          — nothing here logs the payload; the
 *                                           worker logs a delivery id
 *   payload deleted from Redis            — lib/queue/email.ts, removeOnComplete
 *                                           AND removeOnFail, both true
 *
 * The sender chooses this. If they want zero exposure they distribute the CSV
 * themselves, and the UI says so at the point of choosing (BRAND.md, §6.5).
 */
import { Keypair } from '@stellar/stellar-sdk'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { owned } from './session-guard'
import { enqueueDelivery } from '@/lib/queue/email'

/**
 * A claim URL, checked against its shape and nothing more permissive.
 *
 * `.url()` would accept `https://evil.example/phish`, and Kleym would then
 * send that from its own domain to an address the sender chose — turning this
 * endpoint into a hosted phishing service. The origin must be this
 * deployment's and the path must be the claim page.
 */
const recipientSchema = z.object({
  publicKey: z.string().regex(/^G[A-Z2-7]{55}$/, 'must be a Stellar public key (G…)'),
  email: z.email(),
  claimUrl: z.string().min(1),
})

export const deliverSchema = z
  .object({ recipients: z.array(recipientSchema).min(1).max(1000) })
  .strict()

export type DeliverInput = z.infer<typeof deliverSchema>

export type DeliverOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

const conflict = (detail: string) => ({ kind: 'conflict' as const, detail })

/**
 * Whether a URL is a claim link for exactly this ephemeral key.
 *
 * The fragment carries the ephemeral SEED, and deriving its public key is the
 * only way to prove the URL belongs to the link it claims to. Without this,
 * a compromised sender page could have Kleym email any URL it liked, signed
 * with Kleym's own from-address and reputation.
 *
 * The seed is derived and dropped. It reaches no log, no database column and
 * no return value — deriving a public key in memory is strictly less exposure
 * than the send this same request is about to perform.
 */
export function urlMatchesLink(claimUrl: string, ephemeralPublicKey: string): boolean {
  let parsed: URL
  let expected: URL
  try {
    parsed = new URL(claimUrl)
    expected = new URL(env.APP_URL)
  } catch {
    return false
  }

  if (parsed.origin !== expected.origin) return false
  if (parsed.pathname.replace(/\/$/, '') !== '/claim') return false
  if (parsed.search !== '') return false

  const fragment = /^#s=(S[A-Z2-7]{55})$/.exec(parsed.hash)
  if (!fragment) return false

  try {
    return Keypair.fromSecret(fragment[1]!).publicKey() === ephemeralPublicKey
  } catch {
    return false
  }
}

export interface DeliverReport {
  queued: number
  skipped: { publicKey: string; reason: string }[]
}

/**
 * Queues one email per recipient.
 *
 * Returns which recipients were skipped and why, because a sender who uploaded
 * 500 addresses needs to know that four of them did not go out — a bare count
 * of successes reads as complete.
 */
export async function queueDeliveries(
  campaignId: string,
  organizationId: string,
  input: DeliverInput,
): Promise<DeliverOutcome<DeliverReport>> {
  const campaign = await prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      id: true, name: true, assetCode: true, amountPerLink: true, expiresAt: true,
      user: { select: { username: true } },
    },
  })
  if (!campaign) return { kind: 'not-found' }

  if (campaign.expiresAt.getTime() <= Date.now()) {
    return conflict('This campaign has expired. Sending its links now would deliver claims that cannot be made.')
  }

  const keys = input.recipients.map((recipient) => recipient.publicKey)
  const links = await prisma.claimLink.findMany({
    where: { campaignId: campaign.id, ephemeralPublicKey: { in: keys } },
    select: { id: true, ephemeralPublicKey: true, status: true },
  })
  const byKey = new Map(links.map((link) => [link.ephemeralPublicKey, link]))

  const report: DeliverReport = { queued: 0, skipped: [] }

  for (const recipient of input.recipients) {
    const link = byKey.get(recipient.publicKey)
    if (!link) {
      report.skipped.push({ publicKey: recipient.publicKey, reason: 'not a link in this campaign' })
      continue
    }
    if (link.status !== 'ACTIVE') {
      report.skipped.push({
        publicKey: recipient.publicKey,
        reason: `the link is ${link.status.toLowerCase()}, so there is nothing to claim`,
      })
      continue
    }
    if (!urlMatchesLink(recipient.claimUrl, recipient.publicKey)) {
      /*
       * Logged as a security event's shape, without the URL.
       *
       * A mismatch is either a bug in the sender's page or an attempt to have
       * Kleym send something else. Both are worth seeing; neither is worth
       * putting the offending URL into a log line to see it.
       */
      logger.warn(
        { campaignId: campaign.id, publicKey: recipient.publicKey },
        'refused a delivery whose URL is not this link',
      )
      report.skipped.push({
        publicKey: recipient.publicKey,
        reason: 'the link URL does not match this link',
      })
      continue
    }

    /*
     * The Delivery row records the ADDRESS and nothing about the URL. It is
     * created before the job is queued so a send can never happen without a
     * row to record the outcome against.
     */
    const delivery = await prisma.delivery.upsert({
      where: { linkId: link.id },
      create: { linkId: link.id, email: recipient.email },
      update: { email: recipient.email, sentAt: null },
      select: { id: true },
    })

    await enqueueDelivery({
      deliveryId: delivery.id,
      linkId: link.id,
      email: recipient.email,
      claimUrl: recipient.claimUrl,
      senderName: campaign.user.username,
      amount: campaign.amountPerLink.toString(),
      assetCode: campaign.assetCode,
      expiresAt: campaign.expiresAt.toISOString(),
      // Every email-delivered link is OTP-gated. Delivery by email is what
      // makes the address a second factor worth having (SPEC.md §6.4).
      otpRequired: true,
    })
    report.queued += 1
  }

  logger.info(
    { campaignId: campaign.id, queued: report.queued, skipped: report.skipped.length },
    'deliveries queued',
  )
  return { kind: 'ok', value: report }
}
