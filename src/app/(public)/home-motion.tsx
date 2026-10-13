'use client'

import { useEffect } from 'react'
import { startHomeMotion } from '@/components/marketing/home-motion-controller'
import s from './home.module.css'

export function HomeMotion() {
  useEffect(
    () =>
      startHomeMotion(
        document.querySelector('[data-home-motion-root]'),
        s.scrollEnter,
      ),
    [],
  )
  return null
}
