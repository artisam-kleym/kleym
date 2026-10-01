import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3210'

/**
 * End-to-end tests. AGENT.md §7.1.
 *
 * These exist for one acceptance criterion that cannot be checked any other
 * way: the CSV gate in SPEC.md §10.11 must be verified in a browser, because
 * "the Continue button is disabled" is a claim about a rendered page and not
 * about a component's source.
 *
 * No testnet, no Horizon: the wizard steps under test stop before any
 * transaction is built. AGENT.md §7.2 keeps network-dependent tests out of the
 * commit gate, and these are not that.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/session.json' },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    /*
     * Production build, not `next dev`: the CSP that governs the real page is
     * the one worth testing against, and dev relaxes it.
     *
     * NODE_ENV is forced, not inherited. A local `.env` carrying
     * NODE_ENV=development makes `next build` prerender against a development
     * React and fail on `/_global-error` with a null `useContext` — which
     * looks like a bug in the app and is a build run against the wrong React.
     */
    command: 'NODE_ENV=production pnpm build && NODE_ENV=production pnpm start -p 3210 -H 127.0.0.1',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
