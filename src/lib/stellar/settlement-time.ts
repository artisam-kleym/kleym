/** Parse only an explicit UTC transaction/operation timestamp reported by Horizon. */
export function ledgerSettlementTime(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  // Date.parse normalises impossible dates (e.g. February 30); do not accept them.
  if (date.toISOString().slice(0, 19) !== value.slice(0, 19)) return null
  return date
}
