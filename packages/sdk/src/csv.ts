/**
 * The secrets file, written to the caller's disk. Same columns as the
 * browser's download, so a file from either re-imports in the other:
 * label, public_key, secret, claim_url, reference, category, note.
 */
import { writeFile } from 'node:fs/promises'
import type { LinkKeys } from './keys.js'

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function claimUrl(appUrl: string, secret: string): string {
  return `${appUrl.replace(/\/$/, '')}/claim#s=${secret}`
}

export function buildSecretsCsv(keys: LinkKeys, appUrl: string): string {
  const header = ['label', 'public_key', 'secret', 'claim_url', 'reference', 'category', 'note'].join(',')
  const lines = keys.map((k) =>
    [
      quote(k.label ?? ''), quote(k.publicKey), quote(k.secret), quote(claimUrl(appUrl, k.secret)),
      quote(k.attestation?.reference ?? ''), quote(k.attestation?.category ?? ''), quote(k.attestation?.note ?? ''),
    ].join(','),
  )
  return `${[header, ...lines].join('\n')}\n`
}

/** Writes with mode 0600: the file IS the campaign's funds. */
export async function writeSecretsCsv(path: string, keys: LinkKeys, appUrl: string): Promise<void> {
  await writeFile(path, buildSecretsCsv(keys, appUrl), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}
