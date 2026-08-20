/** §9.7: the year is dynamic, not a hardcoded 2024. */
export function Footer() {
  return (
    <footer className="border-t border-outline-variant/40 px-margin-mobile py-lg md:px-lg">
      <p className="font-mono text-label-sm text-on-surface-variant">
        © {new Date().getFullYear()} Kleym · Non-custodial claim links on Stellar
      </p>
    </footer>
  )
}
