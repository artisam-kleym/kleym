/**
 * Campaign request schemas and shared helpers. SPEC.md §6.1, §6.3.
 *
 * Every schema is `.strict()` — unknown keys are rejected, not stripped.
 * Note that stripping is not enough on its own: the seed scanner in
 * lib/security/guard.ts runs BEFORE parsing precisely because a stripped key
 * is a key we never looked at.
 */
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { env } from '@/lib/config/env'

/*
 * Read LAZILY, inside a refine, never at schema-construction time.
 *
 * `z.number().max(env.MAX_LINKS_PER_CAMPAIGN)` evaluates `env` the moment this
 * module is imported — and route handlers import it, so `next build` would
 * validate the whole environment while collecting page data and demand
 * SPONSOR_SECRET_KEY to compile. That is the coupling #20 removed and the
 * fourth time it has come back. A refine runs at PARSE time, when the
 * environment genuinely exists.
 */
const withinLinkLimit = (count: number) => count <= env.MAX_LINKS_PER_CAMPAIGN
const linkLimitMessage = () => `must not exceed MAX_LINKS_PER_CAMPAIGN`
import { seedFreeString, stellarPublicKey } from '@/lib/validation/stellar'
import { prisma } from '@/lib/db/client'
import { recordAudit } from './audit'
import { chooseSponsor } from '@/lib/stellar/sponsors'
import { emitWebhook } from '@/lib/webhooks/emit'

/**
 * Money crosses the API boundary as a STRING. AGENT.md §4.1.
 *
 * A JSON number is an IEEE double: 0.1 + 0.2 !== 0.3, and Stellar's seven
 * decimal places do not survive the round trip. Parsed with decimal.js and
 * re-emitted as a string so the value the sender typed is the value stored.
 */
export const stellarAmount = z
  .string()
  .refine((v) => /^\d+(\.\d{1,7})?$/.test(v), {
    message: 'must be a decimal with at most 7 places, as a string',
  })
  /*
   * Constructed defensively. Zod runs every refine even after an earlier one
   * fails, so a value that failed the format check above still reaches this
   * one — and `new Decimal('')` THROWS rather than returning a falsy value.
   * An uncaught throw here escapes safeParse entirely and the endpoint answers
   * 500 to what is plainly a 400.
   */
  .refine(
    (v) => {
      try {
        return new Decimal(v).greaterThan(0)
      } catch {
        return false
      }
    },
    { message: 'must be greater than zero' },
  )

/** One asset a recipient may receive as (#74): `XLM`, or a code with its issuer. */
export const receiveAsAssetSchema = z
  .object({
    assetCode: z.string().regex(/^[A-Za-z0-9]{1,12}$/, 'must be XLM or a 1–12 character asset code'),
    assetIssuer: stellarPublicKey.optional(),
  })
  .strict()
  .refine((v) => v.assetCode === 'XLM' || v.assetIssuer !== undefined, {
    message: 'a non-native asset requires an issuer',
    path: ['assetIssuer'],
  })
  .refine((v) => v.assetCode !== 'XLM' || v.assetIssuer === undefined, {
    message: 'the native asset must not have an issuer',
    path: ['assetIssuer'],
  })

const sameAsset = (a: { assetCode: string; assetIssuer?: string | undefined }, b: { assetCode: string; assetIssuer?: string | undefined }) =>
  a.assetCode === b.assetCode && (a.assetIssuer ?? null) === (b.assetIssuer ?? null)

export const createCampaignSchema = z
  .object({
    name: seedFreeString.min(1).max(120),
    network: z.enum(['testnet', 'public']),
    senderPublicKey: stellarPublicKey,
    assetCode: z
      .string()
      .regex(/^[A-Za-z0-9]{1,12}$/, 'must be XLM or a 1–12 character asset code'),
    // Absent for native XLM; required for anything else (refined below).
    assetIssuer: stellarPublicKey.optional(),
    amountPerLink: stellarAmount,
    linkCount: z.number().int().positive().refine(withinLinkLimit, { message: linkLimitMessage() }),
    expiresAt: z.iso.datetime(),
    /**
     * Regenerable links (#77): the campaign's index in the sender's derivation
     * path and a fingerprint of a PUBLIC key from their phrase. Both or
     * neither. Neither is secret, and the phrase itself would be refused by
     * the seed guard before this schema ever saw it.
     */
    derivationIndex: z.number().int().min(0).max(2 ** 31 - 1).optional(),
    keyFingerprint: z.string().regex(/^[0-9a-f]{16}$/, 'must be 16 hex characters').optional(),
    /*
     * Receive-as (#74): assets a recipient may convert into at claim time. At
     * most five, none of them the campaign's own asset, none repeated. Omitted
     * or empty: conversion is not offered and TX2 is exactly what it was.
     */
    receiveAs: z.array(receiveAsAssetSchema).max(5).optional(),
  })
  .strict()
  .refine((v) => !v.receiveAs || v.receiveAs.every((a) => !sameAsset(a, v)), {
    message: 'receive-as assets must differ from the campaign asset',
    path: ['receiveAs'],
  })
  .refine((v) => !v.receiveAs || v.receiveAs.every((a, i) => v.receiveAs!.findIndex((b) => sameAsset(a, b)) === i), {
    message: 'receive-as assets must not repeat',
    path: ['receiveAs'],
  })
  .refine((v) => (v.derivationIndex === undefined) === (v.keyFingerprint === undefined), {
    message: 'derivationIndex and keyFingerprint come together',
    path: ['derivationIndex'],
  })
  .refine((v) => v.assetCode === 'XLM' || v.assetIssuer !== undefined, {
    message: 'a non-native asset requires an issuer',
    path: ['assetIssuer'],
  })
  .refine((v) => v.assetCode !== 'XLM' || v.assetIssuer === undefined, {
    message: 'the native asset must not have an issuer',
    path: ['assetIssuer'],
  })
  .refine((v) => new Date(v.expiresAt).getTime() > Date.now(), {
    message: 'must be in the future',
    path: ['expiresAt'],
  })

export const patchCampaignSchema = z
  .object({
    name: seedFreeString.min(1).max(120).optional(),
    status: z.literal('CANCELLED').optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.status !== undefined, {
    message: 'nothing to update',
  })

/**
 * The sender's own reference data for a recipient (#52). Free text, but
 * seed-free like every other string that reaches the server, and capped so
 * the export stays a table rather than a document store.
 */
export const attestationSchema = z
  .object({
    reference: seedFreeString.max(120).nullable().optional(),
    category: seedFreeString.max(60).nullable().optional(),
    note: seedFreeString.max(500).nullable().optional(),
  })
  .strict()

export const registerLinksSchema = z
  .object({
    /*
     * PUBLIC keys only. `stellarPublicKey` rejects anything containing a
     * secret seed before checking the StrKey — a seed here is a security
     * event, not a validation error (SPEC.md §6.3).
     */
    publicKeys: z
      .array(stellarPublicKey)
      .min(1)
      .refine((keys) => withinLinkLimit(keys.length), { message: linkLimitMessage() }),
    labels: z.array(seedFreeString.max(200)).optional(),
    /** Attestation fields (#52), one entry (or null) per public key. */
    attestations: z.array(attestationSchema.nullable()).optional(),
    /**
     * Per-link amounts (#73), one entry per public key, as STRINGS. `null`
     * means "the campaign's amountPerLink". Omitted entirely for a uniform
     * campaign, so that request is what it always was.
     */
    amounts: z.array(stellarAmount.nullable()).optional(),
  })
  .strict()
  .refine((v) => v.labels === undefined || v.labels.length === v.publicKeys.length, {
    message: 'labels must have one entry per public key',
    path: ['labels'],
  })
  .refine((v) => v.amounts === undefined || v.amounts.length === v.publicKeys.length, {
    message: 'amounts must have one entry per public key',
    path: ['amounts'],
  })
  .refine((v) => v.attestations === undefined || v.attestations.length === v.publicKeys.length, {
    message: 'attestations must have one entry per public key',
    path: ['attestations'],
  })

export const patchLinkSchema = z.object({ label: seedFreeString.max(200).nullable() }).strict()

export const listQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'CREATING', 'ACTIVE', 'PARTIAL', 'EXPIRED', 'RECLAIMED', 'CANCELLED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
})

export function zodErrors(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

/** Decimal columns come back as objects; the wire format is a string. */
export function serialiseAmount(value: unknown): string {
  return new Decimal(String(value)).toFixed()
}

/* ── creation, shared by the session route and the v1 write API (#51) ─── */

export interface CampaignCreator {
  /** Provenance: the signed-in user, or the user who issued the API key. */
  userId: string
  organizationId: string
}

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/**
 * Creates a draft: bound to a sponsor for life (#48), the organisation's
 * dual-control policy snapshotted (#45), audited, and announced outward
 * (`campaign.created`, #51). Public keys are registered separately — nothing
 * here has seen one, and nothing here will ever see a seed.
 */
export async function createCampaign(creator: CampaignCreator, input: CreateCampaignInput, ip: string | null) {
  const [{ sponsor }, org] = await Promise.all([
    chooseSponsor(),
    prisma.organization.findUniqueOrThrow({ where: { id: creator.organizationId }, select: { approvalThreshold: true, approvalsRequired: true } }),
  ])
  const campaign = await prisma.campaign.create({
    data: {
      userId: creator.userId,
      organizationId: creator.organizationId,
      sponsorPublicKey: sponsor.publicKey,
      approvalThreshold: org.approvalThreshold,
      approvalsRequired: org.approvalsRequired,
      name: input.name,
      network: input.network,
      senderPublicKey: input.senderPublicKey,
      assetCode: input.assetCode,
      assetIssuer: input.assetIssuer ?? null,
      amountPerLink: input.amountPerLink,
      linkCount: input.linkCount,
      expiresAt: new Date(input.expiresAt),
      derivationIndex: input.derivationIndex ?? null,
      keyFingerprint: input.keyFingerprint ?? null,
      // Stored as refs ("XLM" / "CODE:ISSUER"); read back through parseAssetRef, never trusted raw.
      receiveAsAssets: (input.receiveAs ?? []).map((a) => (a.assetCode === 'XLM' ? 'XLM' : `${a.assetCode}:${a.assetIssuer}`)),
    },
    select: { id: true, name: true, status: true, network: true, assetCode: true, assetIssuer: true, amountPerLink: true, linkCount: true, expiresAt: true, createdAt: true, receiveAsAssets: true },
  })
  await recordAudit({
    userId: creator.userId, organizationId: creator.organizationId, action: 'campaign.create', entityType: 'campaign', entityId: campaign.id,
    metadata: { name: campaign.name, linkCount: campaign.linkCount }, ip,
  })
  await emitWebhook(creator.organizationId, 'campaign.created', {
    campaignId: campaign.id, name: campaign.name, network: campaign.network, assetCode: campaign.assetCode, assetIssuer: campaign.assetIssuer,
    amountPerLink: serialiseAmount(campaign.amountPerLink), linkCount: campaign.linkCount, expiresAt: campaign.expiresAt.toISOString(),
  })
  return campaign
}

export type ExportMarkOutcome = { kind: 'not-found' } | { kind: 'no-links' } | { kind: 'ok'; csvExportedAt: Date }

/**
 * Records that the caller wrote the secrets file. The server cannot verify
 * it and records the assertion; the consequence of lying falls on the sender
 * alone (their funds strand until expiry). Refused before any link exists —
 * an export of nothing would satisfy the gate with nothing to export.
 */
export async function markCsvExported(campaignId: string, organizationId: string): Promise<ExportMarkOutcome> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, csvExportedAt: true, _count: { select: { links: true } } },
  })
  if (!campaign) return { kind: 'not-found' }
  if (campaign._count.links === 0) return { kind: 'no-links' }
  if (campaign.csvExportedAt) return { kind: 'ok', csvExportedAt: campaign.csvExportedAt }
  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { csvExportedAt: new Date() }, select: { csvExportedAt: true } })
  return { kind: 'ok', csvExportedAt: updated.csvExportedAt! }
}
