# Single sign-on and SCIM

Issue #46. Corporate IT will not federate a tool it cannot deprovision. Kleym
now speaks OpenID Connect for sign-in and SCIM 2.0 for provisioning and —
the part large buyers actually test — **deprovisioning**, per organisation.
SAML 2.0 is not shipped: the connection model (`SsoConnection.protocol`,
issuer, subject claim, mappings) is what SAML needs too, so it is a follow-up
for the buyer that demands it, not a rewrite.

## What stays the same

Sessions. After the IdP handshake Kleym issues its **own** opaque, SHA-256
hashed, `__Host-` cookie session, exactly as for a password sign-in. No IdP
access, refresh or ID token is stored anywhere or logged: the ID token is
verified and reduced to claims in memory, the access token is used for at
most one `userinfo` call, and both are dropped before anything else happens.
`verify:sso` scans every log line and every row for them.

## Setting it up (Owner, Settings → Single sign-on)

| Field | Meaning |
|---|---|
| Handle | what members type on `/login/sso` to find their IdP |
| Issuer URL | the OIDC issuer; discovery is read from `<issuer>/.well-known/openid-configuration` |
| Client ID / secret | the app registration at the IdP; the secret is sent once and stored AES-256-GCM under `CREDENTIAL_ENCRYPTION_KEY` (new, required, in `SECRET_ENV_KEYS`) |
| Subject claim | the **stable** identifier identities link on: `sub` for Okta and Google, `oid` for Entra ID |
| Groups claim | where the IdP puts group names (ID token or userinfo) |
| Default role | for a member no mapping reaches — `VIEWER` means *anyone the IdP will authenticate can read this organisation's campaigns and links*; the IdP's app assignment is the real gate, so assign the app narrowly, or map every group and treat the default as the floor |
| Mappings | `group=ROLE` lines; a member's role is the highest mapped role among their groups, re-derived on every sign-in and every SCIM group change |
| SSO only | refuse password sign-in for members, server-side |

Redirect URI for the IdP: `<APP_URL>/api/auth/sso/callback`. SCIM base:
`<APP_URL>/api/scim/v2`, bearer tokens issued on the same page, shown once.

## The discovery document is tenant-controlled input

The issuer URL an Owner enters goes through the same `outboundUrl` rule as a
screening callback or a webhook (HTTPS, no credentials, loopback only outside
production) — and so does **every endpoint the discovery document names**
(`authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`),
because the token exchange POSTs the client secret, the code and the verifier
wherever `token_endpoint` says. The document's `issuer` must equal the
configured one (OIDC Discovery §4.3): a document served from one host that
claims another issuer would have that issuer's tokens accepted for a
connection nobody configured for it. Both checks run at save time and again on
every `start` and `callback`, since the document can change after the
connection was saved; a refusal is `discovery-refused` on the form and
`/login/sso?error=idp` on the flow. The ID token is verified against the
**configured** issuer. A `userinfo` response whose `sub` is not the ID
token's is ignored (OIDC Core §5.3.2).

## Sign-in

`/login/sso` → `GET /api/auth/sso/start?handle=…` → the IdP (authorization
code + PKCE S256, state and nonce held in Redis for five minutes and consumed
on the callback) → `GET /api/auth/sso/callback` → code exchanged
(`client_secret_post` + `code_verifier`), ID token verified against the JWKS
(issuer, audience, nonce, expiry) → a Kleym session. Login answers as before;
MFA (#47), once merged, applies to the resulting session like any other.

## Account linking — never on email

An IdP that lets a user set an unverified email, matched against an existing
Kleym account, is an account takeover. So an identity links **only** on
`(connection, subject)`:

- subject known → that user; membership role re-derived from groups.
- subject unknown, and a local account's name matches the asserted email
  (verified or not) → **refused** (`/login/sso?error=link-required`), audited
  as `sso.link_refused`. The user signs in with their password and links from
  Settings ("Link my account to single sign-on"), which runs the same flow as
  `purpose=link` bound to their signed-in session.
- subject unknown, nobody matches → provisioned: a user with an unusable
  password, a membership at the mapped role, the identity.

SCIM-provisioned users carry an identity whose subject is the SCIM
`externalId` — the same stable id the IdP asserts in the configured subject
claim (Okta: user id in `sub`; Entra: object id in `oid` and as SCIM
`externalId`). Provisioning and sign-in meet on an id, never on an address.

## SSO only

`SsoConnection.ssoOnly` refuses password sign-in for every member of the
organisation at `POST /api/auth/login` — after the password verification has
been paid for, and identically whether the password was right or wrong, so the
refusal is not a password oracle. The form shows the SSO link; the API is what
enforces it.

## SCIM 2.0

`/api/scim/v2` with `Authorization: Bearer scim_…` (per organisation, hashed
at rest, revocable, 120/min). `ServiceProviderConfig`, `Users`, `Groups`;
filters `userName eq`, `externalId eq`, `displayName eq`; `startIndex`/`count`.

- `POST /Users` creates a member at the default role with the identity on
  `externalId`. A `userName` that belongs to a Kleym account which is *not* a
  member is **409** — the same no-email-link rule.
- `PATCH /Users/{id}` with `active: false` (or `DELETE`) **ends the membership
  and revokes every live session for that user in the same request**; when
  this was the user's only organisation the account is deactivated too.
  Audited as `scim.user_deactivated` with the sessions ended. `active: true`
  restores the membership at the group-mapped role.
- `POST /Groups`, `PUT`, `PATCH` (add / remove / replace members, by list or
  `members[value eq "…"]`, and `displayName`), `DELETE`. Every change
  re-derives the role of each affected member in that request.
- A user or group is visible only through its own organisation's token.

## Verified by

`pnpm verify:sso` (CI) with a local OpenID Provider signing RS256 ID tokens
and the login and SCIM route handlers in-process: sign-in provisions a user at
the mapped role and issues a normal Kleym session; a later sign-in with a
changed group changes the role; state is single-use; wrong audience and wrong
issuer are refused; SSO-only refuses right and wrong passwords identically
with no session; SCIM creates (201), rejects a duplicate (409), lists by
filter, the SCIM `externalId` and the OIDC `sub` resolve to the same user,
group create/patch-remove/patch-add move the role APPROVER→VIEWER→APPROVER in
the same request, `active:false` ends the membership and revokes four live
sessions in one request with the audit row counting them, sign-in for the
deactivated identity is refused, reactivation and DELETE behave, another
organisation's token sees nothing; an unknown subject asserting a local
account's email is refused for `email_verified` false and true with no
identity, user or membership created and the refusal audited, while the
explicit link flow binds the subject and only that subject then signs in as
her; no issued token or the client secret appears in any log line or row, the
secret decrypts from its ciphertext, and planted tokens are redacted.
