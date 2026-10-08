/** Blank overrides inherit the campaign default; inputs stay strings throughout. */
export function updatePrizeAmount(
  current: (string | null)[], index: number, value: string, linkCount: number,
): (string | null)[] {
  if (!Number.isInteger(index) || index < 0 || index >= linkCount) throw new Error('That prize is outside this campaign.')
  const next = Array.from({ length: Math.min(linkCount, Math.max(current.length, index + 1)) }, (_, row) => current[row] ?? null)
  next[index] = value === '' ? null : value
  return next
}
