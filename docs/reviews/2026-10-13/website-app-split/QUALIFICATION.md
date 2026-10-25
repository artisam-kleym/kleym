# Website/app split qualification — October 13, 2026

## Scope

Implement HeyPay's static homepage → Open App → authenticated application structure for Kleym, retaining the accepted homepage design. Public destinations remain Railway previews until the senior developer attaches the domains. No campaign, transaction, secret export or native-wallet approval was performed.

## Local evidence

| Check | Result |
| --- | --- |
| Public-only configuration and four session-state destination mappings | 5 unit tests passed |
| Static build without app credentials | Passed; eight public files |
| Static HTTP boundaries, assets, MIME types, HEAD/ETag/cache and refused mutations | 5 groups passed |
| Production Next build | Passed |
| TypeScript and source/scripts/landing/e2e lint | Passed |
| Responsive static website at 10 profiles, including 320px, Android portrait/landscape, desktop and no JS | 10 passed; `evidences/static-local/results.json` |
| Finite animation, live reduced-motion preference, missing observer, no JS and cleanup | 4 passed; `evidences/static-motion-local/results.json` |

The local app preview ran in compatibility mode, so local Open App checks traversed the existing app homepage to login. A local command activating a placeholder marketing origin was rejected by automatic approval review; that action was not retried. Active root navigation is explicitly covered by the CI browser job and will be independently checked against the owned Railway preview. Unit mapping proof does not replace those browser checks.

The local screenshots reuse synthetic marketing data. Native Android/Freighter/Lantern approvals and real transfers were not repeated; responsive Chromium checks alone cannot establish them. Mainnet remains disabled. See `RELEASE.md` for final CI and deployment results once rollout completes.
