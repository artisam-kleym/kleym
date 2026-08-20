import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// eslint-config-next 16 ships flat config directly — no FlatCompat needed.
export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react auto-detects the React version by walking node_modules,
    // which fails under pnpm's non-flat layout. Pin it explicitly.
    settings: { react: { version: '19.2' } },
  },
  {
    // The spike scripts read Horizon responses through fields the SDK does not
    // type — num_sponsoring, subentry_count, base_reserve_in_stroops, and the
    // result_codes on a rejection. Narrowing each would mean hand-writing types
    // for Horizon's wire format, which is exactly the fragile thing the spike
    // exists to avoid. Application code under src/ keeps the rule.
    files: ['scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
]
