/** GET /api/campaigns/[id]/template — a campaign's terms and list in template shape, ready to save (#82). */
import { requireUser } from '@/lib/api/session-guard'
import { notFound } from '@/lib/api/problems'
import { templateFromCampaign } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id } = await params
  const template = await templateFromCampaign(id, org.id)
  if (!template) return notFound()
  return Response.json(template)
}
