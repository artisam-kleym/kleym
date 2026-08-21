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
import { seedFreeString, stellarPublicKey } from '@/lib/validation/stellar'

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
    linkCount: z.number().int().positive().max(env.MAX_LINKS_PER_CAMPAIGN),
    expiresAt: z.iso.datetime(),
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

export const registerLinksSchema = z
  .object({
    /*
     * PUBLIC keys only. `stellarPublicKey` rejects anything containing a
     * secret seed before checking the StrKey — a seed here is a security
     * event, not a validation error (SPEC.md §6.3).
     */
    publicKeys: z.array(stellarPublicKey).min(1).max(env.MAX_LINKS_PER_CAMPAIGN),
    labels: z.array(seedFreeString.max(200)).optional(),
  })
  .strict()
  .refine((v) => v.labels === undefined || v.labels.length === v.publicKeys.length, {
    message: 'labels must have one entry per public key',
    path: ['labels'],
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
