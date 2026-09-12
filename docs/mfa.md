# Second factors

Issue #47. The credential that can sign a campaign distributing a treasury
was a password with a lockout counter. Now it can be a password plus an
authenticator app or a passkey — and the actions that move money ask for the
factor again, freshly, whatever the session's age.

## Factors

| Factor | How | At rest |
|---|---|---|
| **TOTP** (RFC 6238) | any authenticator app; SHA-1, 30 s, six digits, ±1 step | the shared key AES-256-GCM-encrypted under `MFA_ENCRYPTION_KEY` (`MfaTotp.ciphertext`); never in the clear |
| **Passkey** (WebAuthn) | a security key or the platform authenticator; attestation `none`, user verification preferred | the credential's public key, id and signature counter (`MfaPasskey`) |
| **Recovery codes** | eight `xxxx-xxxx-xxxx`, shown once with the **first** factor of either kind | argon2id-hashed with the password parameters; single-use (`MfaRecoveryCode.usedAt`) |

Enrolment lives at `/settings/security`. The TOTP key and the recovery codes
are shown once, from the response, and there is no endpoint that shows either
again. Removing a factor takes a fresh factor — and so does **adding** one
when the account already has one: otherwise a hijacked session could enrol its
own authenticator and step itself up with it. A first enrolment has nothing to
present and is exempt; it is also the only enrolment that counts as
verification of the session that made it. An additional factor leaves the
session's `mfaAt`/`stepUpAt` exactly as they were.

WebAuthn is asked for user verification `preferred`, not `required`: the
passkey is the *second* factor — the password is the first — so a touch on a
security key is enough.

## Session states

Resolved on **every request** (`resolveSession` in `lib/auth/session.ts`), not
only at login, so enrolling a factor or setting a policy changes what an
existing session may do the moment it happens:

| State | When | Reaches |
|---|---|---|
| `ok` | no factor and no policy, or the factor was presented on this session | everything |
| `mfa-pending` | the user has a factor this session has not presented | `/login/mfa`, the verify routes |
| `enrol-required` | an organisation policy requires a factor the user lacks | `/settings/security`, the enrolment routes |

`getSessionUser()` admits only `ok`; every page and route behind it is
therefore closed to a pending session whatever the URL. Login answers
`{ ok, next: 'mfa' | 'enrol' | null }` and the form goes where it says.

## Policy

Per organisation, Owner-set (`PATCH /api/org { mfaPolicy }`): `OFF`,
`APPROVERS` (Approver and Owner roles), `ALL`. A user in several organisations
is bound by the strictest policy that reaches their role. Audited as
`org.mfa_policy`.

## Step-up

MFA at sign-in protects a session; MFA at batch signing protects the money.
With a twelve-hour session, sign-in-only MFA lets a laptop stolen mid-session
disburse. So these routes call `requireStepUp` after `requireUser`:

- `POST /api/campaigns/{id}/batches/prepare` and `/submit`
- `POST /api/campaigns/{id}/reclaim/prepare` and `/submit`
- `POST /api/settings/api-keys`
- removing a factor

A factor verified within the last **300 s** (`Session.stepUpAt`) passes;
otherwise `403 problems/step-up-required`, and the wizard, the reclaim panel
and the key form show the factor prompt inline and retry. A user with no
factor is not asked — there is nothing to present — unless a policy requires
one, in which case they cannot sign in at all until enrolled. Sign-in
verification counts as a step-up.

## Replay

A TOTP code is accepted **once** (RFC 6238 §5.2). `MfaTotp.lastUsedStep`
records the step that matched, written in the same statement that checks it
is newer than the last accepted one, so two concurrent replays cannot both
pass; the loser counts as a wrong guess. A code seen over a shoulder or in a
screenshot is worthless the moment it has been used, which — with step-up on
the money routes — is exactly when it would be replayed.

## Brute force

`checkTotp` mirrors `lib/api/otp.ts`: lockout checked first (so a locked
factor never reads as "wrong", and the right code is refused while locked), the
attempt counted **before** the comparison (a guess whose connection dies has
still been made), five wrong then a fifteen-minute lock logged at warn, counter
reset on success. A wrong recovery code costs a TOTP attempt. In front of both
verify routes: 20 per 15 minutes per IP. Passkey assertions answer a
per-session challenge that lives five minutes in Redis and is consumed on
first use.

## Recovery codes

Single-use: the row is marked used in the same statement that checks it is
unused, so two concurrent uses cannot both succeed. Use is logged at **warn**
and audited (`mfa.recovery_code_used`, `severity: warn`, codes left) — a
recovery code in use means a device is gone or a factor is. Case and whitespace
are forgiven; the code never appears in the log or the audit row.

## Secrets and logs

`MFA_ENCRYPTION_KEY` is in `SECRET_ENV_KEYS`, so the logger redacts it wherever
it is spread. The logger also redacts `totpSecret`, `totpKey`, `code`,
`recoveryCode(s)` at any depth — the verify script plants all of them in a log
call and asserts none survives.

## Verified by

`pnpm verify:mfa` (CI) with a synthetic P-256 authenticator: enrol TOTP
(wrong confirmation counted, right one confirms, eight codes once), a new
session pending until the app code or the passkey assertion unlocks it, a
consumed challenge refused, another account's credential unknown, the counter
advancing; policy `APPROVERS` holding the Owner's *existing* session at
enrolment while the Viewer passes, `ALL` holding both, enrolment moving the
session to pending, `OFF` releasing the un-enrolled while the enrolled still
owe the factor; a six-hour-old session `ok` but step-up `required`, fresh
after a factor, required again after 301 s, not asked of a user without a
factor, audited, and the five routes statically shown to call the gate; the
key encrypted in its column and absent from every log line including one it
was planted in, alongside codes and the encryption key; a recovery code once,
warn-logged and audited without the code; five wrong TOTP guesses counting
down to a lock, the right code refused while locked, a recovery code refused
while locked, the counter resetting after, one step of skew accepted and
three refused.
