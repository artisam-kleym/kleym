import { afterEach, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { useExpiryTime } from '@/lib/campaign/use-expired'

afterEach(() => vi.unstubAllEnvs())

function Expiry() {
  return createElement('time', null, useExpiryTime('2026-10-08T17:39:00.000Z'))
}

it.each(['UTC', 'Asia/Manila'])('renders the same hydration snapshot with server timezone %s', (timezone) => {
  vi.stubEnv('TZ', timezone)
  expect(renderToString(createElement(Expiry))).toBe('<time>2026-10-08 17:39 UTC</time>')
})
