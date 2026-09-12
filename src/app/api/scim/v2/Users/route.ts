/** GET / POST /api/scim/v2/Users (#46). */
import { createUser, listUsers, scimUser } from '@/lib/auth/sso/scim'
import { parseFilter, readJson, requireScim, scimBase, scimError, scimJson, scimList } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const params = new URL(request.url).searchParams
  const filter = parseFilter(params.get('filter'))
  const startIndex = Math.max(1, Number(params.get('startIndex') ?? 1) || 1)
  const count = Math.max(1, Number(params.get('count') ?? 100) || 100)
  const { total, rows } = await listUsers(caller.organizationId, { userName: filter.userName, externalId: filter.externalId }, startIndex, count)
  return scimList(rows.map((r) => scimUser(r, scimBase())), total, startIndex)
}

export async function POST(request: Request) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const body = await readJson(request)
  const userName = typeof body?.userName === 'string' ? body.userName : null
  if (!userName || userName.length < 3 || userName.length > 120) return scimError(400, 'userName is required', 'invalidValue')
  const outcome = await createUser(caller.organizationId, { userName, externalId: typeof body?.externalId === 'string' ? body.externalId : undefined, active: body?.active !== false }, caller.ip)
  if (outcome.kind === 'conflict') return scimError(409, outcome.detail, 'uniqueness')
  return scimJson(scimUser(outcome.row, scimBase()), 201, { location: `${scimBase()}/Users/${outcome.row.id}` })
}
