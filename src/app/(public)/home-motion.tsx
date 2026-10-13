'use client'

import { useEffect } from 'react'
import s from './home.module.css'

/** Progressive enhancement only. Content is visible before hydration and if JS fails. */
export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector('[data-home-motion-root]')
    if (!root || !('IntersectionObserver' in window)) return

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sections = Array.from(root.querySelectorAll('[data-home-reveal]'))
    const visited = new Set<Element>()
    let observer: IntersectionObserver | undefined

    function syncPreference() {
      observer?.disconnect()
      sections.forEach((section) => section.classList.remove(s.scrollEnter))
      if (preference.matches) return

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.05) continue
            if (!visited.has(entry.target)) {
              visited.add(entry.target)
              entry.target.classList.add(s.scrollEnter)
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
      sections.forEach((section) => section.classList.remove(s.scrollEnter))
    }
  }, [])

  return null
}
