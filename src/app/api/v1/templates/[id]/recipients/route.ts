/**
 * PUT /api/v1/templates/[id]/recipients — replace a template's recipient
 * list (#82). The seam a payroll system pushes through, so the operator only
 * signs. Takes the wizard's CSV (`recipientsCsv`) or a structured list
 * (`recipients: [{ label, amount?, reference?, category?, note? }]`), which
 * is rendered to the same CSV. Never keys: a Stellar address or a seed in
 * any cell is refused, as in the wizard.
 */
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { apiConflict, apiNotFound, apiServerError, apiValidationProblem, jsonWithHeaders, requireApiWriter } from '@/lib/api/v1'
import { zodErrors } from '@/lib/api/campaigns'
import { loadTemplate, parseRecipients, updateTemplate } from '@/lib/api/templates'
import { seedFreeString } from '@/lib/validation/stellar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const recipientSchema = z
  .object({
    label: seedFreeString.max(200),
    amount: z.string().regex(/^\d+(\.\d{1,7})?$/).nullable().optional(),
    reference: seedFreeString.max(200).nullable().optional(),
    category: seedFreeString.max(100).nullable().optional(),
    note: seedFreeString.max(500).nullable().optional(),
  })
  .strict()

const schema = z
  .object({
    recipientsCsv: seedFreeString.max(2_000_000).optional(),
    recipients: z.array(recipientSchema).max(10_000).optional(),
  })
  .strict()
  .refine((v) => (v.recipientsCsv === undefined) !== (v.recipients === undefined), { message: 'send recipientsCsv or recipients, not both' })

const cell = (v: string | null | undefined) => {
  const t = v ?? ''
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/templates/[id]/recipients')
  if (!auth.caller) return auth.response
  const ip = clientIp(request)
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/templates/[id]/recipients', ip })
  if (blocked) return blocked.response
  const { id } = await params
  const parsed = schema.safeParse(auth.body)
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))

  const csv =
    parsed.data.recipientsCsv ??
    ['label,amount,reference,category,note', ...parsed.data.recipients!.map((r) => [cell(r.label), cell(r.amount), cell(r.reference), cell(r.category), cell(r.note)].join(','))].join('\n') + '\n'
  const check = parseRecipients(csv, env.MAX_LINKS_PER_CAMPAIGN)
  if (!check.ok) return apiConflict(check.detail)

  try {
    if (!(await loadTemplate(id, auth.caller.organizationId))) return apiNotFound()
    const org = { id: auth.caller.organizationId, name: '', role: 'OPERATOR' as const, approvalThreshold: null, approvalsRequired: 1, screeningUrl: null, mfaPolicy: 'OFF' as const }
    const outcome = await updateTemplate({ userId: auth.caller.userId, org, ip }, id, { recipientsCsv: csv }, env.MAX_LINKS_PER_CAMPAIGN)
    if (outcome.kind === 'not-found') return apiNotFound()
    if (outcome.kind === 'invalid') return apiConflict(outcome.detail)
    logger.info({ keyId: auth.caller.keyId, templateId: id, recipients: check.recipients.labels.length }, 'v1 template recipients replaced')
    return jsonWithHeaders({ id, recipients: check.recipients.labels.length }, auth.headers)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 template recipients failed')
    return apiServerError()
  }
}
