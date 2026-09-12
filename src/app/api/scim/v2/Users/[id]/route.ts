/** GET / PUT / PATCH / DELETE /api/scim/v2/Users/[id] (#46). Deactivation revokes every session. */
import { activateUser, deactivateUser, getUser, scimUser } from '@/lib/auth/sso/scim'
import { readJson, requireScim, scimBase, scimError, scimJson } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const row = await getUser(caller.organizationId, id)
  return row ? scimJson(scimUser(row, scimBase())) : scimError(404, 'No such user.')
}

/** `active` is the only attribute Kleym lets the IdP change after creation; the rest is Kleym's. */
async function setActive(organizationId: string, id: string, active: boolean, ip: string | null): Promise<Response> {
  if (active) {
    const row = await activateUser(organizationId, id, ip)
    return row ? scimJson(scimUser(row, scimBase())) : scimError(404, 'No such user.')
  }
  const outcome = await deactivateUser(organizationId, id, ip)
  if (outcome.kind === 'not-found') return scimError(404, 'No such user.')
  const row = await getUser(organizationId, id)
  return row ? scimJson(scimUser(row, scimBase())) : scimError(404, 'No such user.')
}

export async function PUT(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const body = await readJson(request)
  if (!body) return scimError(400, 'A SCIM User is required.', 'invalidSyntax')
  const current = await getUser(caller.organizationId, id)
  if (!current) return scimError(404, 'No such user.')
  const active = body.active !== false
  return setActive(caller.organizationId, id, active, caller.ip)
}

export async function PATCH(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const body = await readJson(request)
  const ops = Array.isArray(body?.Operations) ? (body!.Operations as { op: string; path?: string; value?: unknown }[]) : null
  if (!ops) return scimError(400, 'A PatchOp with Operations is required.', 'invalidSyntax')
  let active: boolean | undefined
  for (const op of ops) {
    const kind = String(op.op).toLowerCase()
    if (kind !== 'replace' && kind !== 'add') continue
    if ((op.path ?? '').toLowerCase() === 'active') active = op.value === true || op.value === 'True' || op.value === 'true'
    else if (!op.path && op.value && typeof op.value === 'object' && 'active' in op.value) {
      const v = (op.value as { active: unknown }).active
      active = v === true || v === 'True' || v === 'true'
    }
  }
  if (active === undefined) {
    const row = await getUser(caller.organizationId, id)
    return row ? scimJson(scimUser(row, scimBase())) : scimError(404, 'No such user.')
  }
  return setActive(caller.organizationId, id, active, caller.ip)
}

export async function DELETE(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const outcome = await deactivateUser(caller.organizationId, id, caller.ip)
  if (outcome.kind === 'not-found') return scimError(404, 'No such user.')
  return new Response(null, { status: 204 })
}
