# Recovery phrase copy formatting

User reported numbered and space-separated copies being rejected. Before fixing,
the production browser accepted a fresh generated plain phrase, but rejected
its numbered version and its version with invisible copy spacing. The user's
private words were never requested or inspected; their plain-input rejection
cannot be attributed to a specific spelling/order mistake from this evidence.

Client-only normalization now accepts sequential 1..N numbering (`1.`, `1)` or
`1 word`), Unicode spacing/copy artifacts and existing case/whitespace variants.
It never sorts words or strips arbitrary punctuation, headings or digits. Wrong,
duplicate or missing numbering remains invalid. Standard word-list and BIP39
checksum validation remains required. Existing valid plain phrases preserve
their derived keys and fingerprint; fixtures prove numbered equivalents match.

The wizard shows the detected word count and distinguishes missing words,
unknown entries, and checksum failure without transmitting or printing words.
The reusable normalization also applies to local CSV recovery. No API, stored
keys, campaign index or signing/settlement change.

Proof: 19 focused derivation/input tests. Browser before/after uses disposable
generated words retained only in page memory, with no screenshot, trace, key
export, campaign creation or signing. Actual user phrase validation remains a
local user action. The current unfunded test may use a new campaign phrase if
the saved copy cannot be validated; that is not recovery for a funded campaign.

Final proof: production webpack build/TypeScript, changed-file ESLint, whitespace
check and two existing phrase confirmation/privacy browser tests passed. The
after browser accepts plain, numbered and invisible-spacing fixtures, while
showing separate count/word-list/checksum diagnostics for invalid fixtures.
App restarted PID16148 on port3220; worker unchanged. Changes remain local,
uncommitted over4163d79 together with the prior Freighter fix; no chain writes.
