/**
 * BRAND.md §5.8: blurred accent orbs at 10% opacity behind content.
 * TWO PER SCREEN MAXIMUM — the effect is atmosphere, and a third makes it soup.
 * Disabled under prefers-reduced-motion via globals.css.
 */
export function AmbientOrbs({ variant = 'dashboard' }: { variant?: 'dashboard' | 'claim' }) {
  if (variant === 'claim') {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="ambient-glow"
          style={{
            width: 520,
            height: 520,
            background: 'var(--color-accent-pink)',
            filter: 'blur(90px)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    )
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="ambient-glow"
        style={{ width: 600, height: 600, background: 'var(--color-accent-pink)', filter: 'blur(100px)', top: -200, right: -150 }}
      />
      <div
        className="ambient-glow"
        style={{ width: 400, height: 400, background: 'var(--color-accent-yellow)', filter: 'blur(80px)', bottom: -120, left: -100 }}
      />
    </div>
  )
}
