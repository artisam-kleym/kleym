import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { expect, it } from 'vitest'

it('Next ESLint discovers globbed roots through the scoped braces-free replacement', () => {
  const configRequire = createRequire(import.meta.resolve('eslint-config-next'))
  const pluginRequire = createRequire(configRequire.resolve('@next/eslint-plugin-next'))
  const { getRootDirs } = pluginRequire(join(dirname(pluginRequire.resolve('@next/eslint-plugin-next')), 'utils/get-root-dirs.js'))
  const root = mkdtempSync(join(tmpdir(), 'kleym-eslint-'))
  try {
    mkdirSync(join(root, 'apps', 'sender'), { recursive: true })
    mkdirSync(join(root, 'apps', 'claim'), { recursive: true })
    const pattern = `${root.replace(/\\/g, '/')}/apps/{sender,claim}`
    const discovered = getRootDirs({ cwd: root, settings: { next: { rootDir: pattern } } }) as string[]
    expect(discovered.map((path) => path.replace(/\\/g, '/')).sort()).toEqual([
      `${root.replace(/\\/g, '/')}/apps/claim`, `${root.replace(/\\/g, '/')}/apps/sender`,
    ])
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root])
    expect(pluginRequire.resolve('fast-glob')).toContain('tinyglobby')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
