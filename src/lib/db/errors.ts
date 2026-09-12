/**
 * A duplicate-key error, in either shape Prisma 7 reports it.
 *
 * It surfaces as `P2002` through the client and as a bare
 * `UniqueConstraintViolation` from the driver adapter, with no code on the
 * outer error. Matching only the code lets the second shape through — the
 * trap lib/api/links.ts documents for write conflicts. Two older private
 * copies live in lib/api/reclaim.ts and lib/api/idempotency.ts; new callers
 * use this one.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: string }).code === 'P2002') return true
  const cause = (error as { cause?: { kind?: string } }).cause
  if (cause?.kind === 'UniqueConstraintViolation') return true
  return /UniqueConstraintViolation|duplicate key value/.test(error instanceof Error ? error.message : '')
}
