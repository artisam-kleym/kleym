import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const reservation = createServer()
await new Promise(resolveReady => reservation.listen(0, '127.0.0.1', resolveReady))
const port = reservation.address().port
await new Promise(resolveClosed => reservation.close(resolveClosed))
const child = spawn(process.execPath, [resolve('landing/server.mjs')], {
  env: { PORT: String(port), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
  windowsHide: true, stdio: 'ignore',
})
const base = `http://127.0.0.1:${port}`, checks = []
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(base + '/health')).ok } catch {}
    if (ready) break
    await setTimeout(100)
  }
  assert(ready, 'Static server failed to start without app environment')
  const response = await fetch(base)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/)
  assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/)
  const html = await response.text()
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
  assert.match(html, /Open App/)
  assert.doesNotMatch(html, /_next\/|self\.__next_f|<input|<form|data-kleym-wallet/)
  checks.push('Public HTML works without app credentials, cookies, Next runtime or wallet forms')
  const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '')
  const cached = await fetch(base, { headers: { 'If-None-Match': response.headers.get('etag') } }); assert.equal(cached.status, 304)
  checks.push('HEAD and conditional HTML caching work')
  const manifest = JSON.parse(readFileSync('landing/dist/manifest.json', 'utf8'))
  for (const path of Object.keys(manifest.files)) {
    const asset = await fetch(base + path); assert.equal(asset.status, 200)
    assert.equal(asset.headers.get('content-type'), manifest.files[path].contentType)
    if (path.startsWith('/assets/')) assert.match(asset.headers.get('cache-control'), /immutable/)
  }
  checks.push('All eight allowlisted files have exact content types; hashed assets cache immutably')
  for (const path of ['/api/auth/login', '/login', '/claim', '/.env', '/manifest.json', '/%2e%2e/package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path)
  }
  checks.push('App/API/claim/private-file/traversal paths are absent from the website')
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const refusal = await fetch(base, { method }); assert.equal(refusal.status, 405); assert.equal(refusal.headers.get('allow'), 'GET, HEAD')
  }
  checks.push('Static service refuses mutations')
  console.log(JSON.stringify({ result: 'PASS', checks, applicationEnvironmentProvided: false }))
} finally { child.kill(); await new Promise(resolveExit => child.once('exit', resolveExit)) }
