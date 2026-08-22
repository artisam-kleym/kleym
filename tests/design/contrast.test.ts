/**
 * The BRAND.md §10 contrast floor, measured from the tokens themselves.
 *
 * §10 asked for `#7DCCAD` and "every accent-on-white pairing" to be verified,
 * and three of them failed: 1.80, 1.15 and 1.95 against the page surface, where
 * WCAG 1.4.11 wants 3:1 for anything that identifies a UI component. The values
 * were darkened. This test reads globals.css so the check cannot drift back with
 * a palette edit — a contrast floor recorded only in prose is a floor nobody
 * measures again.
 *
 * Ratios are computed against the real page surface, not white. #faf9fc is what
 * a button actually sits on, and using white flatters every pairing slightly.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/app/globals.css', 'utf8')

/** Reads a custom property out of the stylesheet by name. */
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!match) throw new Error(`--color-${name} not found in globals.css`)
  return match[1]!.toLowerCase()
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Composites `fg` at `alpha` over `bg`, as a browser would. */
function over(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const f = parse(fg)
  const b = parse(bg)
  const mix = f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const SURFACE = () => token('surface')

describe('the contrast the maths agrees on', () => {
  it('matches a hand-checked pair, so the formula itself is not the bug', () => {
    // Black on white is 21:1 by definition.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
})

describe('UI component fills reach 3:1 against the page (WCAG 1.4.11)', () => {
  it.each(['action', 'accent-yellow', 'accent-pink'])('%s', (name) => {
    expect(contrast(token(name), SURFACE())).toBeGreaterThanOrEqual(3)
  })

  /*
   * The hover state is still the control. A hover that lightens from the
   * darkened base measures 2.62 — it would drop the button below the floor it
   * just met, at the moment the user is pointing at it.
   */
  it('action-hover stays above the floor too', () => {
    expect(contrast(token('action-hover'), SURFACE())).toBeGreaterThanOrEqual(3)
  })

  it('action-hover is perceptibly different from action', () => {
    expect(contrast(token('action-hover'), token('action'))).toBeGreaterThan(1.05)
  })
})

describe('text on those fills still reaches 4.5:1', () => {
  it('the primary button label', () => {
    expect(contrast(token('action-on'), token('action'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('action-on'), token('action-hover'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the completed stepper marker', () => {
    expect(contrast(token('on-surface'), token('accent-yellow'))).toBeGreaterThanOrEqual(4.5)
  })

  // The tinted metric cards composite the accent at 20% over the surface, so
  // the text rides on the composite and not on the accent itself.
  it('text on the 20% accent tints', () => {
    expect(contrast(token('tertiary'), over(token('accent-yellow'), SURFACE(), 0.2))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('error'), over(token('accent-pink'), SURFACE(), 0.2))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('body text', () => {
  it.each([
    ['on-surface', 'surface'],
    ['on-surface-variant', 'surface'],
    ['on-primary', 'primary'],
  ])('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it('form field borders reach 3:1 — they identify the control', () => {
    expect(contrast(token('outline'), token('surface-container-low'))).toBeGreaterThanOrEqual(3)
  })
})
