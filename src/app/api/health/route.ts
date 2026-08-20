/**
 * Liveness. SPEC.md §6.7: no auth, no detail.
 *
 * Deliberately returns nothing about versions, dependencies, or internal state
 * — an unauthenticated endpoint should not be a reconnaissance surface.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
