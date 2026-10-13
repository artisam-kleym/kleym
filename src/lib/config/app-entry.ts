/** App entry preserves unfinished authentication instead of asking for a password twice. */
export function appEntryPath(
  state: 'ok' | 'mfa-pending' | 'enrol-required' | null,
): string {
  if (state === 'ok') return '/dashboard'
  if (state === 'mfa-pending') return '/login/mfa'
  if (state === 'enrol-required') return '/settings/security?required=1'
  return '/login'
}
