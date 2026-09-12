/**
 * The export response, shared by the admin and the owner routes: the body is
 * signed byte-for-byte and the signature and public key travel in headers,
 * so the file an auditor saves is exactly what was signed.
 */
import { z } from 'zod'
import { buildExport, exportRows } from './audit-chain'

export const exportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['csv', 'json']).default('json'),
})

export async function exportResponse(organizationId: string, raw: Record<string, string | undefined>): Promise<Response> {
  const parsed = exportQuerySchema.safeParse(raw)
  if (!parsed.success) return new Response(null, { status: 400 })
  const { from, to, format } = parsed.data
  const rows = await exportRows({ organizationId, from, to })
  const out = buildExport(rows, { organizationId, from, to }, format)
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(out.body), {
    headers: {
      'content-type': out.contentType,
      'content-disposition': `attachment; filename="kleym-audit-${organizationId}-${stamp}.${format}"`,
      'x-kleym-signature': out.signature,
      'x-kleym-signing-key': out.publicKey,
      'x-kleym-signature-alg': 'ed25519-over-body-bytes',
      'cache-control': 'no-store',
    },
  })
}
