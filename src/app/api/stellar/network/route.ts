/** Public, secret-free deployment identity for browser and SDK consumers. */
import { env } from '@/lib/config/env'
import { stellarMetadata } from '@/lib/stellar/network'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(stellarMetadata(env.STELLAR_NETWORK), { headers: { 'cache-control': 'no-store' } })
}
