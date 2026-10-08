/** Export current source through an allowlist. Never copy .env, ignored files or symlinks. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const outputArg = process.argv[2]
if (!outputArg) throw new Error('Supply a new release directory inside D:/kleym/.runtime/deploy-source')
const output = resolve(outputArg)
const releaseRoot = resolve(source, '../../.runtime/deploy-source')
const within = (root, path) => { const value = relative(root, path); return !!value && !value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value) }
if (!within(releaseRoot, output) || existsSync(output)) throw new Error('Release must be a new directory within the intended release root')

const roots = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'prisma.config.ts', 'Dockerfile', '.dockerignore', '.railwayignore'])
// Frozen installs require the exact tracked patch files referenced by package.json.
const packageConfig = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'))
const patches = new Set(Object.values(packageConfig.pnpm?.patchedDependencies ?? {}))
for (const path of patches) {
  if (typeof path !== 'string' || !/^patches\/[A-Za-z0-9_@.\-]+\.patch$/.test(path)) throw new Error('Unsafe dependency patch path')
}
const scripts = new Set(['check-public-deployment.ts', 'check-stellar-network.ts', 'recover.ts', 'audit-verify.ts', 'audit-verify-export.ts', 'receipts-verify.ts'])
const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: source }).toString().split('\0').filter(Boolean)
const selected = [...new Set(candidates)].filter((path) =>
  roots.has(path) || patches.has(path) || path === 'tests/env-placeholders.ts' || path.startsWith('src/') || path.startsWith('prisma/') || path.startsWith('packages/') || (path.startsWith('scripts/') && scripts.has(path.slice(8))),
).sort()
const entries = []
for (const path of selected) {
  if (/(^|\/)(node_modules|generated|dist|\.git|\.env[^/]*)\//.test(path) || /\.(csv|log|tsbuildinfo)$/.test(path)) throw new Error(`Unexpected release path: ${path}`)
  const absolute = resolve(source, path)
  if (!within(source, absolute) || !lstatSync(absolute).isFile() || !within(source, realpathSync(absolute))) throw new Error(`Unsafe source path: ${path}`)
  if (lstatSync(absolute).isSymbolicLink()) throw new Error(`Symlink refused: ${path}`)
  const bytes = readFileSync(absolute)
  // Print only the affected path, never credential bytes.
  if (/\bS[A-Z2-7]{55}\b/.test(bytes.toString('utf8')) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString('utf8'))) throw new Error(`Secret-shaped material refused: ${path}`)
  entries.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
for (const required of roots) if (!entries.some((entry) => entry.path === required)) throw new Error(`Required build input missing: ${required}`)
for (const required of patches) if (!entries.some((entry) => entry.path === required)) throw new Error(`Required dependency patch missing: ${required}`)
const sourceDigest = createHash('sha256').update(JSON.stringify(entries)).digest('hex')
// All paths and contents are checked before writing the release.
mkdirSync(output, { recursive: true })
for (const { path } of entries) {
  const destination = resolve(output, path)
  if (!within(output, destination)) throw new Error('Unsafe destination')
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(resolve(source, path), destination)
}
const manifest = { preparedAt: new Date().toISOString(), base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source }).toString().trim(), sourceDigest, fileCount: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), secretsCopied: false, entries }
writeFileSync(resolve(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ output, sourceDigest, fileCount: entries.length, secretsCopied: false }, null, 2))
