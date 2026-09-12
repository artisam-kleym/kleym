'use client'

/**
 * The URL fragment, which is where the seed lives. SPEC.md §3.6.
 *
 * BROWSER ONLY. `client-only` makes that the compiler's rule rather than a
 * comment: the module throws under the react-server condition, so a server
 * component or route handler importing it fails the build by name. A seed that
 * reached a server component would be rendered into the RSC payload, which is a
 * response body.
 *
 * Nothing here logs. AGENT.md §4.5 forbids logging anything derived from
 * `window.location.hash`, and the safest way to honour that is for this module
 * to have no logging in it at all — including in its error paths, which is
 * where a value most often escapes by accident.
 */
import 'client-only'
import { Keypair, StrKey } from '@stellar/stellar-sdk'

/**
 * `#s=<seed>` — the seed RAW, not base64url-encoded.
 *
 * SPEC.md §3.6 first specified base64url. Encoding it defeats Kleym's own leak
 * detection: `scanForSecretSeed`, the env leak scan and the CI guard all match
 * `S[A-Z2-7]{55}`, and none of them sees `U0FTWkJXWkRDUll…`. A format that
 * hides a leaked seed from the machinery built to catch leaked seeds is worse
 * than one that does not, and the fragment never reaches a server either way.
 * The `s=` parameter is kept, so a second field can be added later without
 * changing how the first is read.
 */
const FRAGMENT = /^#?s=(S[A-Z2-7]{55})$/

export type FragmentResult =
  | { ok: true; secret: string; ephemeralPublicKey: string }
  | { ok: false }

/**
 * Reads and validates the fragment.
 *
 * Returns a bare `false` on every failure — no reason, no echo of the input.
 * A caller cannot then accidentally render or report the malformed value, and
 * the only thing the user needs is "this link is not valid", which the page
 * says without help.
 */
export function readFragment(hash: string): FragmentResult {
  const match = FRAGMENT.exec(hash)
  if (!match) return { ok: false }

  const secret = match[1]!
  if (!StrKey.isValidEd25519SecretSeed(secret)) return { ok: false }

  try {
    return { ok: true, secret, ephemeralPublicKey: Keypair.fromSecret(secret).publicKey() }
  } catch {
    return { ok: false }
  }
}

/**
 * Removes the fragment from the address bar and from this history entry.
 *
 * `replaceState` rather than `pushState`: pushing would leave the seed in the
 * entry behind, one Back away. SPEC.md §3.6 asks for this to reduce
 * shoulder-surfing and history leakage — it does not remove the seed from the
 * browser's session history store entirely, and nothing client-side can.
 */
export function clearFragment(): void {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}`)
}
