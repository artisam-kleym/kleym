/** Stellar amounts are positive int64 stroops, never floating-point numbers. */
export const MAX_STELLAR_AMOUNT = '922337203685.4775807'
const MAX_STROOPS = 9223372036854775807n

export function isStellarAmount(value: string): boolean {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) return false
  const [whole, fraction = ''] = value.split('.')
  const integer = whole!.replace(/^0+/, '') || '0'
  // Refuse oversized input before constructing a potentially enormous BigInt.
  if (integer.length > 12) return false
  const stroops = BigInt(integer + fraction.padEnd(7, '0'))
  return stroops > 0n && stroops <= MAX_STROOPS
}
