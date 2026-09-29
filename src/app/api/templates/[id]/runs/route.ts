/** GET /api/templates/[id]/runs — every campaign the template produced, with status and total (#82). */
import { requireUser } from '@/lib/api/session-guard'
import { notFound } from '@/lib/api/problems'
import { loadTemplate, runHistory } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id } = await params
  if (!(await loadTemplate(id, org.id))) return notFound()
  return Response.json({ runs: await runHistory(id, org.id) })
}
