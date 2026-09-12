/** GET /api/scim/v2/ServiceProviderConfig — what this provider supports (#46). */
import { requireScim, scimJson } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const caller = await requireScim(request)
  if (caller.response) return caller.response
  return scimJson({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'A per-organisation SCIM token issued under Settings → Single sign-on.' }],
  })
}
