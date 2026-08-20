/**
 * Boundary-guard demonstration endpoint.
 *
 * Exists so the seed-rejection path in AGENT.md §5.4 is exercisable before the
 * real campaign endpoints land in #7. It accepts only public keys and labels,
 * and returns nothing but a count.
 *
 * TODO(#7): delete this once /api/campaigns/[id]/links carries the same guard.
 */
import { z } from 'zod'
import { guardRequestBody, clientIp } from '@/lib/security/guard'
import { seedFreeString, stellarPublicKey } from '@/lib/validation/stellar'

export const runtime = 'nodejs'

const schema = z
  .object({
    publicKeys: z.array(stellarPublicKey).max(10_000),
    labels: z.array(seedFreeString).optional(),
  })
  .strict() // reject unknown keys — SPEC.md §6.1

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ title: 'Malformed JSON', status: 400 }, { status: 400 })
  }

  // Before Zod: a seed hiding in an unknown key must still be caught.
  const blocked = guardRequestBody(body, { route: '/api/echo', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        type: 'https://kleym.app/problems/validation',
        title: 'Invalid request',
        status: 400,
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    )
  }

  return Response.json({ accepted: parsed.data.publicKeys.length })
}
