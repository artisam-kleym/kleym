/** Framework-independent enhancement shared by the app compatibility page and static site. */
export function startHomeMotion(
  root: Element | null,
  scrollClass: string,
): () => void {
  if (!root || !('IntersectionObserver' in window)) return () => {}
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const sections = Array.from(root.querySelectorAll('[data-home-reveal]'))
  const visited = new Set<Element>()
  let observer: IntersectionObserver | undefined

  function syncPreference() {
    observer?.disconnect()
    sections.forEach((section) => section.classList.remove(scrollClass))
    if (preference.matches) return
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.05) continue
          if (!visited.has(entry.target)) {
            visited.add(entry.target)
            entry.target.classList.add(scrollClass)
          }
          observer?.unobserve(entry.target)
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -24px 0px' },
    )
    sections.forEach((section) => {
      if (!visited.has(section)) observer?.observe(section)
    })
  }

  syncPreference()
  preference.addEventListener('change', syncPreference)
  return () => {
    observer?.disconnect()
    preference.removeEventListener('change', syncPreference)
    sections.forEach((section) => section.classList.remove(scrollClass))
  }
}
