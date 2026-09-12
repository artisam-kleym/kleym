/**
 * Compliance screening callback (#52). SPEC.md §1.2, AGENT.md §5.6.
 *
 * Kleym takes no compliance position: it ships the INTERFACE. An organisation
 * that must screen its distributions points `screeningUrl` at its own
 * provider, and every batch is screened before an envelope is handed over —
 * the last moment where nothing has happened on-chain and a hold costs
 * nothing. docs/compliance.md is the contract the receiver implements.
 *
 * Fail-closed, like `rateLimit` and `otpSatisfied`: a callback that times out,
 * errors, answers with anything but 2xx, or answers with a body this module
 * cannot read is a HOLD. A screening step that fails open is not a control.
 *
 * With no URL configured nothing here runs: no request, no row written, no
 * audit entry. The signing path is byte-identical to before this existed.
 */
import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import type { ScreeningDecision } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { recordAudit } from './audit'
import { canonicalJson } from './audit-chain'
import { LINK_ORDER } from './link-order'

export const SCREENING_REQUEST_VERSION = 1

/** How the callback's answer is surfaced to the sender. Never the provider's internals. */
export const SCREENING_DETAIL = {
  hold: 'Screening hold: this campaign cannot be signed yet.',
  block: 'Screening block: this campaign cannot be signed.',
  unavailable: 'Screening hold: the screening service did not answer; try again later.',
} as const

/** The reason as shown to the sender: short, single-line, provider-chosen. */
const REASON_LIMIT = 300

const responseSchema = z.object({
  decision: z.enum(['allow', 'hold', 'block']),
  reason: z.string().max(2000).optional(),
  /** The provider's own case reference. Audited, never shown. */
  reference: z.string().max(200).optional(),
})

export interface ScreeningRequest {
  version: typeof SCREENING_REQUEST_VERSION
  campaign: {
    id: string
    name: string
    network: string
    assetCode: string
    assetIssuer: string | null
    amountPerLink: string
    linkCount: number
    expiresAt: string
    createdBy: string
  }
  organization: { id: string; name: string }
  recipients: { linkId: string; label: string | null; reference: string | null; category: string | null; note: string | null }[]
}

export type ScreeningOutcome =
  | { decision: 'allow' }
  | { decision: 'hold' | 'block'; detail: string }

export interface ScreeningDeps {
  fetch?: typeof fetch
  now?: () => Date
}

const CAMPAIGN_SELECT = {
  id: true, name: true, network: true, assetCode: true, assetIssuer: true, amountPerLink: true,
  linkCount: true, expiresAt: true, screeningDecision: true, screeningReason: true, screeningHash: true,
  user: { select: { username: true } },
  organization: { select: { id: true, name: true, screeningUrl: true } },
  links: { select: { id: true, label: true, reference: true, category: true, note: true }, orderBy: LINK_ORDER },
} as const

type ScreenedCampaign = NonNullable<Awaited<ReturnType<typeof loadForScreening>>>

function loadForScreening(campaignId: string) {
  return prisma.campaign.findUnique({ where: { id: campaignId }, select: CAMPAIGN_SELECT })
}

export function buildScreeningRequest(campaign: ScreenedCampaign): ScreeningRequest {
  return {
    version: SCREENING_REQUEST_VERSION,
    campaign: {
      id: campaign.id, name: campaign.name, network: campaign.network, assetCode: campaign.assetCode,
      assetIssuer: campaign.assetIssuer, amountPerLink: campaign.amountPerLink.toFixed(), linkCount: campaign.linkCount,
      expiresAt: campaign.expiresAt.toISOString(), createdBy: campaign.user.username,
    },
    organization: { id: campaign.organization.id, name: campaign.organization.name },
    recipients: campaign.links.map((l) => ({ linkId: l.id, label: l.label, reference: l.reference, category: l.category, note: l.note })),
  }
}

/**
 * What an ALLOW is bound to. The URL is part of it: a decision from one
 * provider does not carry over to another.
 */
export function screeningHash(request: ScreeningRequest, url: string): string {
  return createHash('sha256').update(canonicalJson({ url, request })).digest('hex')
}

/** `x-kleym-signature: sha256=<hex>` over the exact body bytes, when a secret is set. */
export function signScreeningBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function senderReason(raw: string | undefined): string | null {
  const line = (raw ?? '').replace(/\s+/g, ' ').trim()
  return line ? line.slice(0, REASON_LIMIT) : null
}

/**
 * The gate. Null when the campaign may be signed.
 *
 * `fresh` (prepare) always asks the callback. Otherwise (submit) a recorded
 * ALLOW for exactly this request is honoured, so the provider is asked once
 * per prepare rather than once per envelope; anything else asks again. A
 * recorded BLOCK is final either way — the sender has been told, and asking
 * again would let a flapping provider un-block a campaign it blocked.
 */
export async function screeningGate(campaignId: string, opts: { fresh: boolean }, deps: ScreeningDeps = {}): Promise<string | null> {
  const campaign = await loadForScreening(campaignId)
  if (!campaign) return null
  const url = campaign.organization.screeningUrl
  if (!url) return null

  if (campaign.screeningDecision === 'BLOCK') return withReason(SCREENING_DETAIL.block, campaign.screeningReason)

  const request = buildScreeningRequest(campaign)
  const hash = screeningHash(request, url)
  if (!opts.fresh && campaign.screeningDecision === 'ALLOW' && campaign.screeningHash === hash) return null

  const outcome = await callScreening(url, request, deps)
  const decision: ScreeningDecision = outcome.decision === 'allow' ? 'ALLOW' : outcome.decision === 'block' ? 'BLOCK' : 'HOLD'
  const reason = outcome.decision === 'allow' ? null : outcome.reason
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { screeningDecision: decision, screeningReason: reason, screeningHash: hash, screenedAt: (deps.now ?? (() => new Date()))() },
  })
  await recordAudit({
    userId: null, organizationId: campaign.organization.id, action: 'campaign.screening', entityType: 'campaign', entityId: campaign.id,
    metadata: { decision, source: outcome.source, recipients: request.recipients.length, providerReference: outcome.reference ?? null, hash },
    ip: null,
  })
  if (outcome.decision === 'allow') return null
  if (outcome.source !== 'callback') return SCREENING_DETAIL.unavailable
  return withReason(outcome.decision === 'block' ? SCREENING_DETAIL.block : SCREENING_DETAIL.hold, reason)
}

function withReason(detail: string, reason: string | null): string {
  return reason ? `${detail} ${reason}` : detail
}

/** Why the provider was not the one who decided. Audited, so an outage is visible as one. */
type Source = 'callback' | 'timeout' | 'error' | 'status' | 'invalid'

interface CallResult {
  decision: 'allow' | 'hold' | 'block'
  reason: string | null
  reference?: string
  source: Source
}

async function callScreening(url: string, request: ScreeningRequest, deps: ScreeningDeps): Promise<CallResult> {
  const body = JSON.stringify(request)
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'kleym-screening/1' }
  if (env.SCREENING_WEBHOOK_SECRET) headers['x-kleym-signature'] = signScreeningBody(body, env.SCREENING_WEBHOOK_SECRET)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.SCREENING_TIMEOUT_MS)
  const doFetch = deps.fetch ?? fetch
  try {
    const response = await doFetch(url, { method: 'POST', headers, body, signal: controller.signal, redirect: 'error' })
    if (!response.ok) {
      logger.warn({ campaignId: request.campaign.id, status: response.status }, 'screening callback refused; holding')
      return { decision: 'hold', reason: null, source: 'status' }
    }
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    const parsed = responseSchema.safeParse(json)
    if (!parsed.success) {
      logger.warn({ campaignId: request.campaign.id }, 'screening callback answered with an unreadable body; holding')
      return { decision: 'hold', reason: null, source: 'invalid' }
    }
    return { decision: parsed.data.decision, reason: senderReason(parsed.data.reason), reference: parsed.data.reference, source: 'callback' }
  } catch (error) {
    const timedOut = controller.signal.aborted
    logger.warn({ campaignId: request.campaign.id, reason: timedOut ? 'timeout' : error instanceof Error ? error.message : 'unknown' }, 'screening callback failed; holding')
    return { decision: 'hold', reason: null, source: timedOut ? 'timeout' : 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Owner-set — and the Owner is a tenant, not staff. This is the first place
 * a tenant-controlled value drives a request from Kleym's own process, so
 * what it may point at is narrow: HTTPS, no credentials, and never a
 * redirect (`redirect: 'error'` above). Plain HTTP to a loopback address is
 * allowed OUTSIDE production only, for the verify script and a local
 * receiver; in production it would let any tenant Owner POST to whatever
 * shares the application host. Kleym does not resolve the hostname before
 * connecting — see docs/compliance.md for the deployment-side half.
 */
export function screeningUrlSchemaFor(nodeEnv: string) {
  const loopbackAllowed = nodeEnv !== 'production'
  return z
    .object({
      screeningUrl: z.union([
        z.string().trim().url().max(2000).refine((v) => {
          try {
            const u = new URL(v)
            if (u.username || u.password) return false
            if (u.protocol === 'https:') return true
            return loopbackAllowed && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')
          } catch {
            return false
          }
        }, loopbackAllowed ? 'an https URL (http only for a loopback address), without credentials' : 'an https URL, without credentials'),
        z.null(),
      ]),
    })
    .strict()
}

/*
 * Bound to the raw NODE_ENV rather than `env.NODE_ENV`: route handlers are
 * evaluated during `next build`, which has no environment, and touching the
 * validated env at module load would fail the build (see lib/db/client.ts).
 */
export const screeningUrlSchema = screeningUrlSchemaFor(process.env.NODE_ENV ?? 'development')
