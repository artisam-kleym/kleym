import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { MarketingHome } from '../src/components/marketing/marketing-home'
import { landingConfiguration } from '../landing/config'

const configuration = landingConfiguration(
  process.env,
  process.argv.includes('--allow-local'),
)
const output = resolve('landing/dist')
mkdirSync(output + '/assets', { recursive: true })
const files: Record<
  string,
  { file: string; contentType: string; etag: string }
> = {}
function add(path: string, content: string | Buffer, contentType: string) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content)
  writeFileSync(output + path, bytes)
  files[path] = {
    file: path.slice(1),
    contentType,
    etag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
  }
  return path
}
function asset(
  name: string,
  content: string | Buffer,
  extension: string,
  contentType: string,
) {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  return add(`/assets/${name}.${hash}.${extension}`, content, contentType)
}

const faces = [
  ['Kleym Inter', 'inter-latin', '100 900', 'swap'],
  ['Kleym Mono', 'jetbrains-mono-latin', '100 800', 'swap'],
  ['Kleym Symbols', 'material-symbols-subset', '100 700', 'block'],
]
  .map(([family, file, weight, display]) => {
    const url = asset(
      file,
      readFileSync(`src/fonts/${file}.woff2`),
      'woff2',
      'font/woff2',
    )
    return `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-weight:${weight};font-style:normal;font-display:${display}}`
  })
  .join('\n')
const globals = readFileSync('src/app/globals.css', 'utf8')
const theme = globals.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1]
if (!theme) throw new Error('Missing shared design tokens')
const tokens = [...theme.matchAll(/^\s*(--[\w-]+:\s*[^;]+;)/gm)]
  .map((match) => match[1])
  .join('\n')
const icons = [...globals.matchAll(/\.icon(?:-\d+|-filled)?\s*\{[^}]+\}/g)]
  .map((match) => match[0])
  .join('\n')
const homeCss = readFileSync('src/app/(public)/home.module.css', 'utf8')
const styles = Object.fromEntries(
  [...homeCss.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((match) => [
    match[1],
    match[1],
  ]),
)
const css =
  `${faces}\n:root{${tokens}\n--font-sans:'Kleym Inter',ui-sans-serif,system-ui,sans-serif;--font-mono:'Kleym Mono',ui-monospace,monospace;--font-icons:'Kleym Symbols';}\n` +
  `*,::before,::after{box-sizing:border-box}html{line-height:1.5;-webkit-text-size-adjust:100%}body{margin:0;font-family:var(--font-sans);color:var(--color-on-surface);background:var(--color-surface)}button,input,select,textarea{font:inherit}a{color:inherit}table{border-collapse:collapse}ol,ul{margin:0;padding:0;list-style:none}figure{margin:0}svg{display:block;vertical-align:middle}summary{display:list-item}\n${icons}\n${homeCss}`
const cssUrl = asset('home', css, 'css', 'text/css; charset=utf-8')
const controller = readFileSync(
  'src/components/marketing/home-motion-controller.ts',
  'utf8',
)
const motion =
  ts.transpileModule(controller, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText +
  `\nlet stop=()=>{};function start(){stop();stop=startHomeMotion(document.querySelector('[data-home-motion-root]'),'scrollEnter')}start();addEventListener('pagehide',()=>stop());addEventListener('pageshow',e=>{if(e.persisted)start()});\n`
const jsUrl = asset(
  'home-motion',
  motion,
  'js',
  'text/javascript; charset=utf-8',
)
const markup = renderToStaticMarkup(
  createElement(MarketingHome, {
    styles,
    appHref: configuration.appOrigin,
    testnet: configuration.network === 'testnet',
    year: new Date().getUTCFullYear(),
    openNewTab: true,
  }),
)
const head = renderToStaticMarkup(
  createElement(
    'head',
    null,
    createElement('meta', { charSet: 'utf-8' }),
    createElement('meta', {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1',
    }),
    createElement('title', null, 'Kleym — Send prizes with a link'),
    createElement('meta', {
      name: 'description',
      content:
        'Create a Stellar asset campaign, set individual prizes and share personal claim links.',
    }),
    createElement('link', {
      rel: 'canonical',
      href: configuration.siteOrigin + '/',
    }),
    createElement('link', { rel: 'stylesheet', href: cssUrl }),
    createElement('link', {
      rel: 'icon',
      href: '/favicon.svg',
      type: 'image/svg+xml',
    }),
    createElement('script', { type: 'module', src: jsUrl }),
  ),
)
add(
  '/index.html',
  '<!doctype html><html lang="en">' +
    head +
    '<body>' +
    markup +
    '</body></html>',
  'text/html; charset=utf-8',
)
add(
  '/favicon.svg',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="27" cy="24" r="17" fill="#354f6e"/><path d="M13 7a18 18 0 0 0 0 34" fill="none" stroke="#354f6e" stroke-width="4"/></svg>',
  'image/svg+xml',
)
add('/robots.txt', `User-agent: *\nAllow: /\n`, 'text/plain; charset=utf-8')
writeFileSync(
  output + '/manifest.json',
  JSON.stringify({ version: 1, files }, null, 2),
)
console.log(
  JSON.stringify({
    result: 'Built static landing',
    appOrigin: configuration.appOrigin,
    siteOrigin: configuration.siteOrigin,
    network: configuration.network,
    files: Object.keys(files).length,
  }),
)
