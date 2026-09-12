/** POST /api/org/sso/scim-tokens { name } — issue a SCIM bearer token (Owner). Shown once. */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { connectionForOrg } from '@/lib/auth/sso/connections'
import { issueScimToken } from '@/lib/auth/sso/scim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ name: z.string().trim().min(1).max(60) }).strict()

export async function POST(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  if (!(await connectionForOrg(org.id))) return conflict('Configure the SSO connection first; SCIM provisions against it.')
  const issued = await issueScimToken(user.id, org.id, parsed.data.name, clientIp(request))
  return Response.json({ ...issued, warning: 'This is the only time this token will be shown.' }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
