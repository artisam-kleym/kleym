/** SCIM 2.0 HTTP conventions: bearer auth, `application/scim+json`, the error schema, filters. Issue #46. */
import { env } from '@/lib/config/env'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { resolveScimToken, SCIM_ERROR_SCHEMA, SCIM_LIST_SCHEMA } from './scim'

export const SCIM_JSON = 'application/scim+json; charset=utf-8'
/** AGENT.md §5.6: per token, like the API. */
export const SCIM_RATE_LIMIT = { limit: 120, windowSeconds: 60 } as const

export function scimBase(): string {
  return `${env.APP_URL.replace(/\/$/, '')}/api/scim/v2`
}

export function scimJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': SCIM_JSON, 'cache-control': 'no-store', ...headers } })
}

export function scimError(status: number, detail: string, scimType?: string): Response {
  return scimJson({ schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) }, status)
}

export function scimList<T>(resources: T[], total: number, startIndex: number): Response {
  return scimJson({ schemas: [SCIM_LIST_SCHEMA], totalResults: total, startIndex, itemsPerPage: resources.length, Resources: resources })
}

export type ScimCaller = { organizationId: string; tokenId: string; ip: string | null; response?: never } | { organizationId?: never; tokenId?: never; ip?: never; response: Response }

export async function requireScim(request: Request): Promise<ScimCaller> {
  const ip = clientIp(request)
  const caller = await resolveScimToken(request)
  if (!caller) return { response: scimError(401, 'A live SCIM bearer token is required.') }
  const limit = await rateLimit(`scim:${caller.tokenId}`, SCIM_RATE_LIMIT.limit, SCIM_RATE_LIMIT.windowSeconds)
  if (!limit.allowed) return { response: scimError(429, 'Too many requests.') }
  return { organizationId: caller.organizationId, tokenId: caller.tokenId, ip }
}

/** `userName eq "x"` / `externalId eq "x"` / `displayName eq "x"` — the filters provisioning actually sends. */
export function parseFilter(filter: string | null): Record<string, string> {
  if (!filter) return {}
  const m = /^\s*(userName|externalId|displayName)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(filter)
  if (!m) return {}
  return { [m[1]!.replace(/^u/, 'u').replace(/^e/, 'e').replace(/^d/, 'd')]: m[2]!.replace(/\\"/g, '"') }
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
