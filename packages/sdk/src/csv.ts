/**
 * The secrets file, written to the caller's disk. Same columns as the
 * browser's download, so a file from either re-imports in the other:
 * label, public_key, secret, claim_url, reference, category, note.
 */
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
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

const privateWindowsExport = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$targetPath = ConvertFrom-Json ([Console]::In.ReadLine())
$stream = $null
$created = $false
try {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $security = New-Object System.Security.AccessControl.FileSecurity
  $security.SetAccessRuleProtection($true, $false)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
  $security.AddAccessRule($rule)
  $stream = [System.IO.FileStream]::new($targetPath, [System.IO.FileMode]::CreateNew, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::None, $security)
  $created = $true
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $bytes = $encoding.GetBytes([Console]::In.ReadToEnd())
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Dispose()
} catch {
  if ($null -ne $stream) { $stream.Dispose() }
  if ($created) { [System.IO.File]::Delete($targetPath) }
  [Console]::Error.WriteLine('Private export could not be created.')
  exit 1
}
`

/** Exclusive creation: POSIX 0600 or an owner-only Windows ACL at creation. */
export async function writeSecretsCsv(path: string, keys: LinkKeys, appUrl: string): Promise<void> {
  if (process.platform !== 'win32') {
    await writeFile(path, buildSecretsCsv(keys, appUrl), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return
  }
  // Paths and secret contents travel over stdin, never command arguments.
  await new Promise<void>((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', privateWindowsExport], { windowsHide: true }, (error) => {
      if (error) reject(new Error('Private CSV could not be created with Windows permissions.'))
      else resolve()
    })
    child.stdin?.on('error', () => {}) // The completion callback reports a failed child.
    child.stdin?.end(`${JSON.stringify(path)}\n${buildSecretsCsv(keys, appUrl)}`)
  })
}
