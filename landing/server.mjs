import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// No application modules, database access, authentication, wallet SDK or request logging.
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
const manifest = JSON.parse(readFileSync(root + '/manifest.json', 'utf8'))
if (manifest.version !== 1) throw new Error('Unsupported static manifest')
const assets = new Map(
  Object.entries(manifest.files).map(([path, entry]) => {
    if (
      !path.startsWith('/') ||
      !/^[a-zA-Z0-9./-]+$/.test(entry.file) ||
      entry.file.includes('..')
    )
      throw new Error('Invalid static asset manifest')
    return [path, { ...entry, body: readFileSync(root + '/' + entry.file) }]
  }),
)
const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port')
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"

createServer((request, response) => {
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  )
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
    })
    response.end('Method not allowed')
    return
  }
  let path
  try {
    path = new URL(request.url ?? '/', 'http://localhost').pathname
  } catch {
    response.writeHead(400)
    response.end()
    return
  }
  if (path === '/health') {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    response.end(
      request.method === 'HEAD'
        ? undefined
        : '{"ok":true,"service":"kleym-landing"}',
    )
    return
  }
  // Manifest lookup, never a filesystem path constructed from a visitor's input.
  const asset = assets.get(path === '/' ? '/index.html' : path)
  if (!asset) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(request.method === 'HEAD' ? undefined : 'Page not found')
    return
  }
  response.setHeader('Content-Type', asset.contentType)
  response.setHeader(
    'Cache-Control',
    path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
  )
  response.setHeader('ETag', asset.etag)
  if (request.headers['if-none-match'] === asset.etag) {
    response.writeHead(304)
    response.end()
    return
  }
  response.setHeader('Content-Length', asset.body.length)
  response.writeHead(200)
  response.end(request.method === 'HEAD' ? undefined : asset.body)
}).listen(port, '0.0.0.0', () =>
  console.log(JSON.stringify({ service: 'kleym-landing', listening: port })),
)
