/**
 * The fee a transaction actually paid, from its result XDR (#80). Horizon's
 * submit response carries `fee_charged` too, but the SDK does not type it;
 * the result XDR is the ledger's own word and is always present.
 */
import { xdr } from '@stellar/stellar-sdk'

/** Stroops charged, as a string — or null when the result cannot be read. */
export function feeChargedOf(resultXdr: string | undefined): string | null {
  if (!resultXdr) return null
  try {
    return xdr.TransactionResult.fromXDR(resultXdr, 'base64').feeCharged().toString()
  } catch {
    return null
  }
}
