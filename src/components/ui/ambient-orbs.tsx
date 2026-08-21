/**
 * BRAND.md §5.8: blurred accent orbs at 10% opacity behind content.
 * TWO PER SCREEN MAXIMUM — the effect is atmosphere, and a third makes it soup.
 * Disabled under prefers-reduced-motion via globals.css.
 */
export function AmbientOrbs({ variant = 'dashboard' }: { variant?: 'dashboard' | 'claim' }) {
  if (variant === 'claim') {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="ambient-glow orb-claim" />
      </div>
    )
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-glow orb-dashboard-a" />
      <div className="ambient-glow orb-dashboard-b" />
    </div>
  )
}
