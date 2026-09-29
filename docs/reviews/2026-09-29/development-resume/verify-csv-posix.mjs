/** Execute the unchanged SDK writer on an isolated Linux filesystem. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { writeSecretsCsv } from '/verification/csv.ts'

process.umask(0)
const directory = await mkdtemp('/tmp/kleym-csv-')
const file = `${directory}/links.csv`
const keys = Array.from({ length: 5 }, (_, index) => ({
  publicKey: `inert-public-${index}`, secret: `inert-private-${index}`,
}))
await writeSecretsCsv(file, keys, 'https://kleym.invalid')
const mode = (await stat(file)).mode & 0o777
const content = await readFile(file, 'utf8')
assert.equal(mode, 0o600)
assert.equal(content.trim().split('\n').length, 6)
await assert.rejects(writeSecretsCsv(file, keys, 'https://kleym.invalid'), { code: 'EEXIST' })
assert.equal(await readFile(file, 'utf8'), content)
console.log(JSON.stringify({ platform: process.platform, node: process.version,
  fileMode: mode.toString(8), permissiveUmask: '000', rows: 5,
  overwriteRefused: true, existingContentPreserved: true,
  fixtures: 'inert strings; no spending material', passed: true }, null, 2))
