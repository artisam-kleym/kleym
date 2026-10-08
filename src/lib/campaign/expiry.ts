/** datetime-local expects local clock fields, not a truncated UTC string. */
export function localExpiry(instant: Date): string {
  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export const EXPIRY_PRESETS = [
  { id: '1h', label: '1 hour', minutes: 60 },
  { id: '24h', label: '24 hours', minutes: 1_440 },
  { id: '7d', label: '7 days', minutes: 10_080 },
  { id: '30d', label: '30 days', minutes: 43_200 },
] as const

export type ExpiryChoice = typeof EXPIRY_PRESETS[number]['id'] | 'custom'

/** Freeze a deadline when selected; later renders must never extend it. */
export function presetExpiry(choice: Exclude<ExpiryChoice, 'custom'>, now = Date.now()): string {
  const preset = EXPIRY_PRESETS.find((item) => item.id === choice)!
  // Round up so minute precision never shortens the selected duration.
  const instant = new Date(Math.ceil(now / 60_000) * 60_000 + preset.minutes * 60_000)
  // An offset distinguishes the two occurrences of a repeated local clock time.
  const offset = -instant.getTimezoneOffset()
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${localExpiry(instant)}${offset >= 0 ? '+' : '-'}${hours}:${minutes}`
}

export function expiryError(local: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?$/.test(local)) return 'Enter a complete expiry date and time.'
  const date = new Date(local)
  if (!Number.isFinite(date.getTime())) return 'Choose a valid date and time in your timezone.'
  const clock = local.slice(0, 16)
  const canonical = local.length > 16 ? new Date(`${clock}Z`).toISOString().slice(0, 16) : localExpiry(date)
  // Reject impossible dates and local times skipped by daylight saving changes.
  if (canonical !== clock) return 'Choose a valid date and time in your timezone.'
  if (date.getTime() <= now) return 'Choose an expiry in the future.'
  return null
}

export function expiryDescription(local: string): string {
  const date = new Date(local)
  if (Number.isNaN(date.getTime())) return 'Choose a valid expiry date and time.'
  return `${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) · ${date.toISOString().replace('T', ' ')} UTC`
}
