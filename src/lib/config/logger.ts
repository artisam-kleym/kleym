/**
 * Structured logging. AGENT.md Â§4.5.
 *
 * Redaction is by ALLOWLIST, not denylist â€” log named fields explicitly rather
 * than dumping objects. A denylist only redacts what someone remembered to add.
 *
 * Never log: anything derived from window.location.hash, request bodies on
 * claim routes, SPONSOR_SECRET_KEY, session tokens, API keys, OTP codes, or
 * email link URLs.
 */
import pino from 'pino'
import { SECRET_ENV_KEYS } from './env'

/**
 * Read straight from process.env, NOT through the validated `env` proxy.
 *
 * Touching `env` here would validate the whole schema at module scope â€” and
 * because route handlers import the logger transitively, that would drag the
 * full environment (SPONSOR_SECRET_KEY included) back into `next build`. That
 * is the coupling #20 removed; the CI build-with-no-env step caught it
 * returning the moment a route pulled the logger in.
 *
 * NODE_ENV is neither secret nor worth validating: any value other than
 * 'production' simply means "not production".
 */
const isProduction = process.env.NODE_ENV === 'production'

export function createLogger(destination?: pino.DestinationStream) {
  return pino({
    level: isProduction ? 'info' : 'debug',
    // Belt and braces. The allowlist discipline above is the real defence; these
    // paths are a backstop for the case where someone forgets it.
    //
    // pino's redact paths are EXACT and CASE-SENSITIVE. Lowercase entries such as
    // `secret` or `*.secretKey` do not match the SCREAMING_SNAKE_CASE names the
    // environment actually uses, so every real secret in this system needs its
    // own entry spelled exactly as the variable is named. Classify new secrets
    // in the shared env registry.
    redact: {
      paths: [
        // The whole config object. `env` is the most spreadable thing in the
        // codebase and holds every secret at once, so censor it wholesale rather
        // than relying on the per-key entries below to be exhaustive.
        'env',
        '*.env',

        // Environment secrets, derived from the single source of truth in
        // env.ts so this list cannot drift out of step with the schema.
        ...SECRET_ENV_KEYS.flatMap((key) => [key, `*.${key}`]),

        // Application-level field names.
        'seed',
        '*.seed',
        'secret',
        '*.secret',
        'secretKey',
        '*.secretKey',
        'password',
        '*.password',
        'otp',
        '*.otp',
        // SSO (#46): IdP tokens and client secrets never reach a log line.
        'id_token',
        '*.id_token',
        'access_token',
        '*.access_token',
        'refresh_token',
        '*.refresh_token',
        'clientSecret',
        '*.clientSecret',
        'client_secret',
        '*.client_secret',
        // MFA (#47): a TOTP key, a code or a recovery code in a log call is a credential.
        'totpSecret',
        '*.totpSecret',
        'totpKey',
        '*.totpKey',
        'code',
        '*.code',
        'recoveryCode',
        '*.recoveryCode',
        'recoveryCodes',
        '*.recoveryCodes',
        'token',
        '*.token',
        'authorization',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[redacted]',
    },
    transport:
      !destination && process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  }, destination)
}

export const logger = createLogger()
