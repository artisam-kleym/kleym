/** GET / PUT / PATCH / DELETE /api/scim/v2/Groups/[id] (#46). A member change re-derives roles in this request. */
import { deleteGroup, getGroup, patchGroup, replaceGroup, scimGroup, type GroupPatchOp } from '@/lib/auth/sso/scim'
import { readJson, requireScim, scimBase, scimError, scimJson } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const memberValues = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map((m) => (m && typeof m === 'object' && 'value' in m ? String((m as { value: unknown }).value) : String(m))) : undefined)

export async function GET(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const row = await getGroup(caller.organizationId, id)
  return row ? scimJson(scimGroup(row, scimBase())) : scimError(404, 'No such group.')
}

export async function PUT(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const body = await readJson(request)
  if (!body) return scimError(400, 'A SCIM Group is required.', 'invalidSyntax')
  const row = await replaceGroup(caller.organizationId, id, { displayName: typeof body.displayName === 'string' ? body.displayName : undefined, externalId: typeof body.externalId === 'string' ? body.externalId : undefined, members: memberValues(body.members) }, caller.ip)
  return row ? scimJson(scimGroup(row, scimBase())) : scimError(404, 'No such group.')
}

export async function PATCH(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  const body = await readJson(request)
  const ops = Array.isArray(body?.Operations) ? (body!.Operations as GroupPatchOp[]) : null
  if (!ops) return scimError(400, 'A PatchOp with Operations is required.', 'invalidSyntax')
  const row = await patchGroup(caller.organizationId, id, ops, caller.ip)
  return row ? scimJson(scimGroup(row, scimBase())) : scimError(404, 'No such group.')
}

export async function DELETE(request: Request, { params }: Params) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  const { id } = await params
  return (await deleteGroup(caller.organizationId, id, caller.ip)) ? new Response(null, { status: 204 }) : scimError(404, 'No such group.')
}
