/**
 * Structured logging. AGENT.md §4.5.
 *
 * Redaction is by ALLOWLIST, not denylist — log named fields explicitly rather
 * than dumping objects. A denylist only redacts what someone remembered to add.
 *
 * Never log: anything derived from window.location.hash, request bodies on
 * claim routes, SPONSOR_SECRET_KEY, session tokens, API keys, OTP codes, or
 * email link URLs.
 */
import pino from 'pino'
import { env } from './env'

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Belt and braces. The allowlist discipline above is the real defence; these
  // paths are a backstop for accidental object spreads during development.
  redact: {
    paths: [
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
      'token',
      '*.token',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
})
