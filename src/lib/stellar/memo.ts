/**
 * Deposit memos (#75): claiming straight into an exchange or custodian.
 *
 * An exchange holds one pooled account and identifies the depositor by the
 * transaction memo. A missing or wrong memo is the most common way people
 * lose money on this network — the funds land in the omnibus account and are
 * credited to nobody. Kleym builds TX2, so it can refuse to build one that
 * cannot arrive: the memo is required, typed and bounded here, BEFORE any
 * signature, and it rides on the transaction the payment is in.
 *
 * No `client-only` / `server-only`: the page validates as the recipient types
 * and the server validates again before it builds.
 */
import { Memo } from '@stellar/stellar-sdk'

export type MemoType = 'id' | 'text' | 'hash'
export const MEMO_TYPES: readonly MemoType[] = ['id', 'text', 'hash'] as const

/** Stellar's limit for MEMO_TEXT: 28 BYTES of UTF-8, not 28 characters. */
export const MEMO_TEXT_MAX_BYTES = 28
const UINT64_MAX = 18_446_744_073_709_551_615n

export interface DepositMemo {
  type: MemoType
  value: string
}

export type MemoCheck = { ok: true; memo: DepositMemo } | { ok: false; detail: string }

/** Validates a memo as the exchange will read it. The message names the limit it hit. */
export function checkMemo(input: { type?: string | null; value?: string | null } | null | undefined): MemoCheck {
  if (!input || !input.type || input.value === undefined || input.value === null) {
    return { ok: false, detail: 'A memo is required. Without it the exchange cannot tell whose deposit this is.' }
  }
  const value = input.value.trim()
  if (value.length === 0) {
    return { ok: false, detail: 'A memo is required. Without it the exchange cannot tell whose deposit this is.' }
  }
  switch (input.type) {
    case 'id': {
      if (!/^\d{1,20}$/.test(value) || BigInt(value) > UINT64_MAX) {
        return { ok: false, detail: 'A memo ID is a whole number up to 18446744073709551615.' }
      }
      return { ok: true, memo: { type: 'id', value } }
    }
    case 'text': {
      const bytes = new TextEncoder().encode(value).length
      if (bytes > MEMO_TEXT_MAX_BYTES) {
        return { ok: false, detail: `A text memo is at most ${MEMO_TEXT_MAX_BYTES} bytes; this one is ${bytes}.` }
      }
      return { ok: true, memo: { type: 'text', value } }
    }
    case 'hash': {
      if (!/^[0-9a-fA-F]{64}$/.test(value)) {
        return { ok: false, detail: 'A memo hash is 64 hexadecimal characters.' }
      }
      return { ok: true, memo: { type: 'hash', value: value.toLowerCase() } }
    }
    default:
      return { ok: false, detail: 'The memo type must be id, text or hash.' }
  }
}

/** The SDK memo for a checked value. Throws on an unchecked one — call `checkMemo` first. */
export function toMemo(memo: DepositMemo): Memo {
  switch (memo.type) {
    case 'id':
      return Memo.id(memo.value)
    case 'text':
      return Memo.text(memo.value)
    case 'hash':
      return Memo.hash(memo.value)
  }
}

/** Reads a transaction's memo back as the recorded shape, or null for MEMO_NONE / anything else. */
export function memoOf(memo: Memo): DepositMemo | null {
  switch (memo.type) {
    case 'id':
      return { type: 'id', value: String(memo.value) }
    case 'text':
      return { type: 'text', value: Buffer.isBuffer(memo.value) ? memo.value.toString('utf8') : String(memo.value) }
    case 'hash':
      return { type: 'hash', value: Buffer.isBuffer(memo.value) ? memo.value.toString('hex') : String(memo.value) }
    default:
      return null
  }
}

/** Federation's `memo_type` vocabulary onto ours. Anything else is refused rather than guessed. */
export function memoTypeFromFederation(memoType: string | undefined): MemoType | null {
  if (memoType === 'id' || memoType === 'text' || memoType === 'hash') return memoType
  return null
}
