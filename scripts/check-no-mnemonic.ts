/**
 * CI guard (#77): no BIP39 recovery phrase is committed anywhere a seed guard
 * would look. The existing greps match `S[A-Z2-7]{55}`; a phrase is words.
 *
 * Scans the paths the seed guards scan — src/, prisma/, docs/, the env
 * example — and refuses on a checksum-valid phrase. tests/ and scripts/ are
 * exempt for the same reason they are exempt from the seed grep: testing
 * phrase DETECTION needs a phrase to detect. The wordlist itself is a
 * dependency, not a committed file, so it is never in scope.
 *
 *   pnpm tsx scripts/check-no-mnemonic.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { containsMnemonic } from '../src/lib/validation/mnemonic'

const ROOTS = ['src', 'prisma', 'docs', '.env.example', 'README.md', 'SPEC.md', 'AGENT.md', 'BRAND.md']
const SKIP = new Set(['node_modules', '.next', 'generated'])
const TEXT = /\.(ts|tsx|js|mjs|json|md|prisma|sql|css|example|txt|yml|yaml)$/

function* files(path: string): Generator<string> {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return
  }
  if (stat.isFile()) {
    if (TEXT.test(path) || path.endsWith('.env.example')) yield path
    return
  }
  for (const entry of readdirSync(path)) {
    if (SKIP.has(entry)) continue
    yield* files(join(path, entry))
  }
}

let failures = 0
for (const root of ROOTS) {
  for (const file of files(root)) {
    const text = readFileSync(file, 'utf8')
    if (containsMnemonic(text)) {
      console.error(`::error file=${relative('.', file)}::contains a BIP39 recovery phrase (AGENT.md §1, #77)`)
      failures += 1
    }
  }
}

if (failures > 0) process.exit(1)
console.log('clean: no recovery phrase in application code, schema, docs or env example')
