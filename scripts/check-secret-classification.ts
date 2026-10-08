import { ENV_SCHEMA_KEYS, SECRET_ENV_KEYS } from '../src/lib/config/env'
import { assertSecretClassification } from '../src/lib/config/secret-classification'

try {
  assertSecretClassification(ENV_SCHEMA_KEYS, SECRET_ENV_KEYS)
  console.log(`PASS: ${ENV_SCHEMA_KEYS.length} schema keys classified; ${SECRET_ENV_KEYS.length} secret keys registered`)
} catch (error) {
  // Names only: runtime secret values are never accessed by this guard.
  console.error((error as Error).message)
  process.exitCode = 1
}
