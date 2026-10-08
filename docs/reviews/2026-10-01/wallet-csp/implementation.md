# Freighter connection failure

The actual user reached signing after generating keys and saving the CSV.
The pilot database contained zero campaigns: connection failed before campaign
creation, preparation or submission. No funding batch had been created.

An isolated production Chromium run reproduced the exact `insertRule` null
error and a `style-src-elem` violation for inline styles. The installed wallet
kit's root export evaluates its Twind modal styles, whose stylesheet is null
under Kleym's `style-src 'self'` policy.

Funding, reclaim and the separate recipient wallet boundary now lazily import
the existing kit's Freighter module directly. No CSP exception, dependency
upgrade or server signing change. The desktop pilot supports Freighter;
general wallet selection and mobile remain unqualified. Network mismatches,
empty signed envelopes and returned signer mismatches are rejected. Error
formatting no longer imports the failing modal.

Focused tests: 17 passed. TypeScript and changed-file lint passed. Browser
before/after evidence is alongside this report. The browser has no extension:
the after check establishes loading and actionable missing-extension handling,
not a real Freighter signature. Actual user signing remains the next step.

Webpack production build passed; app restarted with the final source at PID
26120 on port 3220. `after.json` records the missing-extension message and zero
CSP violations. Worker processes were not restarted. Fix remains local and
uncommitted on top of 4163d79; no GitHub/public-network action.

Reloading the old tab loses its in-memory keys; the phrase and saved CSV remain
private recovery material. With no campaign funded, recreate the test with a
fresh expiry and download its new CSV before signing. Use that new CSV for the
test; the earlier export has no funded links.
