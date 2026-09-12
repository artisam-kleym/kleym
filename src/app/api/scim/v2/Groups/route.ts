/** GET / POST /api/scim/v2/Groups (#46). Membership drives the role through the connection's mappings. */
import { createGroup, listGroups, scimGroup } from '@/lib/auth/sso/scim'
import { parseFilter, readJson, requireScim, scimBase, scimError, scimJson, scimList } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const memberValues = (v: unknown): string[] => (Array.isArray(v) ? v : []).map((m) => (m && typeof m === 'object' && 'value' in m ? String((m as { value: unknown }).value) : String(m)))

export async function GET(request: Request) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const params = new URL(request.url).searchParams
  const filter = parseFilter(params.get('filter'))
  const startIndex = Math.max(1, Number(params.get('startIndex') ?? 1) || 1)
  const count = Math.max(1, Number(params.get('count') ?? 100) || 100)
  const { total, rows } = await listGroups(caller.organizationId, { displayName: filter.displayName }, startIndex, count)
  return scimList(rows.map((r) => scimGroup(r, scimBase())), total, startIndex)
}

export async function POST(request: Request) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const body = await readJson(request)
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  if (!displayName || displayName.length > 200) return scimError(400, 'displayName is required', 'invalidValue')
  const outcome = await createGroup(caller.organizationId, { displayName, externalId: typeof body?.externalId === 'string' ? body.externalId : undefined, members: memberValues(body?.members) }, caller.ip)
  if (outcome.kind === 'conflict') return scimError(409, 'A group with that displayName already exists.', 'uniqueness')
  return scimJson(scimGroup(outcome.row, scimBase()), 201, { location: `${scimBase()}/Groups/${outcome.row.id}` })
}
