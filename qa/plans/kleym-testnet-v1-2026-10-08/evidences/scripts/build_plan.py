"""Versioned Kleym QA plan. Run with bundled Python (reportlab/openpyxl/pypdf).

No network calls, wallet operations, deployment changes or real credentials.
Execution status is deliberately independent of historical development proof.
"""
from pathlib import Path
from collections import Counter
from xml.sax.saxutils import escape
import hashlib
import json

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.workbook.properties import CalcProperties
from pypdf import PdfReader

OUT = Path(__file__).resolve().parents[2]
ROOT = OUT.parents[2]
STATUSES = ['Not Run', 'Ongoing', 'Passed', 'Failed', 'Blocked', 'For Re-test', 'N/A']
PHASES = {
    'D1': 'Protocol, campaign terms and ledger accounting',
    'D2': 'Signing, authorization and recovery under faults',
    'D3': 'Desktop, Android and Lantern wallet journeys',
    'D4': 'Public candidate, operations and release qualification',
}
cases = []


def add(phase, area, title, pre, steps, expected, proof, issue='', kind='Positive', priority='P0', harness='Manual + independent Horizon'):
    n = 1 + sum(c['phase'] == phase and c['area'] == area for c in cases)
    cases.append(dict(id=f'KLM-{phase}-{area}-{n:03}', phase=phase, area=area, title=title,
                      type=kind, priority=priority, preconditions=pre, steps=steps,
                      expected=expected, evidence_required=proof, issue=issue,
                      harness=harness, status='Not Run', actual='', evidence='', defect='',
                      candidate='', tester='', executed_at_utc='', notes=''))


BASE = 'G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.'
SNAP = 'Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.'
AUTO = 'Source fixture tests only; no provider or wallet signing. Record exact candidate and full sanitized command output.'

# D1: Lantern D1's independent money/state accounting, adapted to classic Stellar.
for title, steps, expected in [
    ('Equal prizes: three 1-USDC links', 'Create a campaign with count 3, amount 1 and a future custom expiry. Review; save export privately. Fund once after approval.', 'Declared total is exactly 3.0000000 USDC; three distinct public link keys; only funded links can be shared.'),
    ('Custom prizes: 20, 15, 10 and two default 5', 'Create count 5/default 5. Set rows 1-3 to 20,15,10; leave rows 4-5 unchanged. Review, export and inspect public registration.', 'Row order is stable; amounts are 20,15,10,5,5; exact total 55.0000000; labels, CSV and ledger amounts match.'),
    ('Edit custom prizes across pages', 'Create 25 rows/default 5. Override row 1 and row 21. Move next/back through all pages and return to review.', 'Overrides persist at their original indices; no duplicate rows or lost edits; displayed total equals exact decimal sum.'),
    ('Shrink and expand the recipient count', 'Set overrides on rows 1 and 12; shrink count to 10; inspect review. Expand back to 12 and inspect again.', 'Only current rows affect totals. Removed overrides never silently fund additional rows; new rows use displayed default.'),
    ('Change default with existing overrides', 'Override one row, change default 5 to 7, then review and export the current list.', 'Explicit override is preserved; remaining rows reflect current default; review is the exact list sent for registration.'),
]:
    add('D1','TER',title,BASE,steps,expected,'Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.', '#99,#114', priority='P0' if 'Custom prizes:' in title else 'P1')

for title, value, expected in [
    ('Minimum positive amount','0.0000001','Accept exactly one stroop; no rounding to zero.'),
    ('Zero / negative / text / exponent','0; -1; abc; 1e3','Refuse each with a useful amount error; no registration or wallet request.'),
    ('Eighth decimal place','1.12345678','Refuse rather than round or truncate.'),
    ('Maximum classic int64 amount','922337203685.4775807','Pure validation accepts the exact maximum. Do not attempt funding this boundary fixture.'),
    ('Amount one stroop above int64','922337203685.4775808','Pure validation rejects overflow before envelope creation.'),
    ('Exact aggregate and persistence precision','20;15;10;5;5;0.0000001','Decimal/stroop total is 55.0000001; DB round trip retains all seven decimal places.'),
]:
    add('D1','AMT',title,'Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.',f'Validate {value} through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.',expected,'Validator output and API error; sanitized DB round-trip record when applicable.', '#99,#114', kind='Negative' if 'Refuse' in expected or 'rejects' in expected else 'Boundary',harness='tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB')

for title, steps, expected in [
    ('Relative expiry buttons','Select 1 hour, 24 hours, 7 days and 30 days from a fixed clock; inspect local and UTC summary for each.', 'Each deadline is rounded to minute precision without shortening the selected interval; rerenders do not extend it.'),
    ('Custom date and time entry','Choose Custom; type a future complete date/time; tab through fields and inspect the review summary.', 'Typed date/time works without calendar dragging; visible timezone and UTC conversion agree with submitted expiry.'),
    ('Invalid or past deadline','Try empty, partial, impossible calendar date, current instant and past time; continue after each.', 'Refuse each invalid/past expiry with a useful inline message; no keys generated or funding prepared.'),
    ('Timezone and DST boundaries','Run browser fixtures in Asia/Manila and America/New_York; test DST skipped and repeated local times.', 'Skipped local times are refused; chosen offset on a repeated hour is preserved; server and reviewed predicate agree.'),
    ('Expiry while review stays open','Hold a saved draft until its expiry, then try prepare/sign without changing the reviewed deadline.', 'Reject stale expiry; never silently extend a previously reviewed balance predicate.'),
]:
    add('D1','EXP',title,'Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.',steps,expected,'Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.', '#100,#114',kind='Negative' if title.startswith(('Invalid','Expiry while')) else 'Boundary',priority='P1',harness='tests/lib/campaign/expiry.test.ts; manual browser')

for title, steps, expected in [
    ('Private export is a funding gate','Generate keys; try sign before saving export. Save it privately and retry.', 'Funding stays blocked before export acknowledgment; save unlocks review/sign; no secret reaches the server.'),
    ('Recovery phrase normalization','Privately generate a disposable phrase, then paste it as words and as a numbered list in a new draft; compare public key derivation.', 'Valid supported BIP39 phrase normalizes deterministically; invalid checksum refuses. Never use a Freighter wallet phrase as test data.'),
    ('Lost export recovery from saved phrase','In a clean tab restore the campaign phrase and original derivation index/count; compare public keys offline.', 'Same phrase/index recreates the same keys; wrong phrase/index does not. Kleym cannot recover missing private material.'),
    ('Fragment removal and data minimization','Open a disposable private claim locally; inspect address bar and sanitized request body after initialization.', 'Fragment is cleared from visible history; only public key and signatures/intended public fields leave the browser; no full bearer URL in evidence.'),
]:
    add('D1','KEY',title,BASE,steps,expected,'Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.', '#108,#114',kind='Security',harness='e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual')

for sender_mode in ['literal-zero-XLM sponsored sender','funded sender with nonzero XLM']:
    for recipient_mode in ['absent account','existing zero-XLM account without USDC trustline','existing zero-XLM account with USDC trustline']:
        add('D1','MAT',f'USDC lifecycle: {sender_mode}; {recipient_mode}',BASE+f' Provision {sender_mode} and {recipient_mode}; reserve/capacity snapshots recorded.',
            'Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.',
            'Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.', SNAP+' Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.', '#97,#98,#99,#100,#101',harness='scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals')

for title, steps, expected in [
    ('Funding envelope ownership','Prepare a fresh 3-link USDC campaign; decode operations, source accounts, signers, asset and predicates before approving.', 'Classic source is operational sponsor; sender supplies principal in createClaimableBalance ops; sponsoring brackets wrap funding; no fee bump substitutes for reserve sponsorship.'),
    ('Funding signer rejection','Remove sender signature, then sponsor signature from disposable prepared fixture; submit to isolated API.', 'Missing/wrong required signature is refused before network submission; pending journal cannot mark funding confirmed.'),
    ('Balance ID derivation and reserve units','Fund 3 links once; compare stored IDs against createClaimableBalance operation order and Horizon.', 'Three exact asset/amount/claimant predicates and balance IDs match; sponsor adds 6 reserve units for two claimants per balance.'),
    ('200 links across batches','With approved Testnet budget, create 200 one-USDC links; prepare and sign sequentially using configured batch size; wait for every batch confirmation.', 'All 200 IDs unique and confirmed exactly once. Number/signature count follows effective per-envelope operation cap; no invalid >100-op envelope; campaign active only after all required confirmations.'),
    ('Principal shortage','Use sender with 2 USDC and request three 1-USDC links; try funding.', 'Fresh preflight refuses insufficient USDC before wallet signature; no link marked funded or active.'),
    ('Sponsor shortage / liabilities','Use isolated sponsor fixtures with low spendable XLM and native selling liabilities; prepare full remaining campaign.', 'Spendable uses fresh base reserve, entries, sponsorship and selling liabilities; insufficient full remaining capacity refuses before signing.'),
    ('Account clone and sequence stability','Prepare twice from shared account fixture and compare originals; then perform actual sequential confirmed batches in isolated harness.', 'SDK builder does not mutate cached sender/sponsor account records; each accepted envelope uses coordinated correct source sequence.'),
    ('Legacy native-XLM compatibility','Create a small XLM campaign using explicitly approved test identity with spendable XLM; fund, claim and reclaim unused balance.', 'Legacy native funding path remains compatible; exact native principal, fees and reserves reconcile; sponsor policy follows reviewed envelope.'),
]:
    add('D1','FUN',title,BASE,steps,expected,SNAP, '#98,#99,#103,#105',kind='Negative' if any(x in title for x in ['rejection','shortage']) else 'Regression',harness='tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet')

for title, steps, expected in [
    ('Claim exactly once','For a funded link, connect recipient; record no mutation on connect; claim once and reload/click again.', 'Only explicit claim moves funds; exact amount credited once; claimed screen shows confirmed hash; repeated claim cannot pay again.'),
    ('One-stroop custom claim','Fund a custom 0.0000001-USDC link after approval; claim to trusted recipient.', 'Recipient gets exactly 0.0000001; totals and receipt preserve seven decimals; no zero rounding.'),
    ('Frozen / unauthorized / full trustline','Use disposable issuer fixture with unauthorized or full receiving trustline; try prepare and claim.', 'Refuse unusable destination without losing balance or misreporting success; Circle USDC must not be altered for this test.'),
    ('Claim before / at / after expiry','Using controlled ledger close-time fixture, test T-1,T,T+1. In approved live boundary run, compare actual Horizon predicate seconds and ledger close time.', 'Ephemeral claimant eligible only abs_before T; sender reclaim eligible at/after T. Host clock and millisecond UI cannot redefine predicate.'),
    ('Temporary reserve release','Record sponsor before materialisation, after materialisation and after claim. Independently check temporary account absence and removed balance.', 'Temporary account 2 plus trustline 1 reserve units released; claimable-balance 2 units released; permanent recipient sponsored entries remain and are separately explained.'),
    ('Sender-authorized reclaim after expiry','Keep third link unused. Wait for on-chain expiry; select sender; review single reclaim amount/signers; approve once.', 'Unused 1 USDC returns only to original sender; balance disappears; 2 claimant reserve units released; sponsor pays actual fee; recipient state unchanged.'),
    ('Pre-expiry reclaim / wrong sender','Try reclaim one second before deadline and with another sender identity in controlled API/ledger fixtures.', 'Refuse both; no sender refund, no removed balance and no journal settlement from a rejection.'),
    ('Partial reclaim and duplicate reconciliation','Use 3 expired links with one already claimed; reclaim remaining links; replay worker/event and refresh campaign.', 'Only reclaimable amounts are returned; sum/receipt count matches exact settled links; duplicate processing cannot credit twice.'),
    ('Renewal uses verified refunded budget','Expire an equal-amount campaign, reclaim remaining links, wait for confirmed accounting, then renew from original campaign.', 'Original lineage retained; renewed link count and principal equal verified refund only; claimed links are excluded; renewed funding still requires sender review.'),
    ('Renewal refuses unsafe terms','Try renewal before expiry, before refund settles, with changed sender/asset/count, after second renewal, and on custom-amount campaign.', 'Refuse invalid terms; variable-amount renewal is currently unsupported and clearly refused; no second principal distribution hidden as renewal.'),
    ('Ledger-derived receipt time','Claim, stop UI before DB settles, and run reconciliation; compare direct and recovered receipt timestamps with confirmed operation created_at.', 'Both paths use ledger settlement time consistently. Current issue #110 remains a known gap until verified/fixed; app wall-clock time is insufficient.'),
]:
    add('D1','SET',title,BASE,steps,expected,SNAP+' Sanitized receipt canonical bytes/signature/public verification key when relevant.', '#100,#101,#110,#114',kind='Negative' if title.startswith(('Pre-expiry','Frozen','Renewal refuses')) else 'Regression')

# D2: deterministic fail-closed boundaries and exact reviewed signing payload.
for title, steps, expected, issue in [
    ('Network/provider mismatch','Configure Testnet passphrase with public Horizon or vice versa; attempt every write preparation.', 'Refuse mismatched network identity before wallet or network write; read-only Mainnet checks cannot submit.', '#96,#98'),
    ('Wrong asset issuer','Alter prepared or requested USDC issuer while keeping display code USDC.', 'Match full asset code+issuer+network; refuse unauthorized issuer, never silently map by ticker.', '#98'),
    ('Reviewed XDR tampering','Alter amount, destination, source, operation order, predicates, timebounds and fee separately in signing fixtures.', 'Every altered reviewed transaction hash is refused; no mutation accepted because a wallet signed it.', '#98,#101'),
    ('Signed envelope preservation','Return signed fixtures missing sponsor/local signatures or containing a signature for another passphrase/account.', 'Require exact reviewed hash and all required valid signatures; do not reconstruct or drop prior signatures.', '#98,#101'),
    ('Wallet account/network changes mid-review','Connect sender, prepare; switch selected wallet or network before sign. Retry only after fresh review.', 'Refuse changed identity; reconnect/review clearly; no automatic retry with different account/network.', '#106'),
    ('Cancel / timeout / lock wallet','Cancel connection and signing separately; lock wallet; let acknowledgment/review timeout; retry from saved draft.', 'Useful bounded error; no funding or claim on cancel; cleanup permits safe retry; no leaked wallet error contents.', '#106,#114'),
    ('Unknown submission outcome','Drop response after provider accepts exact signed hash; refresh/retry and run reconciliation.', 'Exact signed bytes/hash retained durably; lookup same hash before any retry; no replacement payment or duplicate funding.', '#104'),
    ('Process crash at durable boundaries','Kill isolated worker before send, after send, after confirm and during settlement; restart for each journal fixture.', 'Recover prepared/submitted/confirmed/settled state deterministically; exactly one final accounting mutation per hash.', '#104'),
    ('Real source concurrency across processes','Run two processes sharing sponsor and separate web/worker instances against fresh PostgreSQL; prepare claims/funding/reclaim simultaneously.', 'PostgreSQL advisory source lock serializes all spenders; fresh sequence/headroom under lock; no stale capacity double admission.', '#102,#103'),
    ('Unresolved legacy attempt','Seed old submitted row with missing signed XDR and ambiguous hash; attempt new prepare and recovery.', 'Do not discard unresolved financial liability by guessing; refuse/reconcile explicitly; no duplicate operation.', '#104'),
    ('Strictly later ledger enforcement','Hold TX1 confirmed ledger N; provide provider latest ledger N for TX2 then N+1; attempt claim preparation both times.', 'Refuse N; permit after verified N+1. Fixed sleep or browser time alone is insufficient.', '#101'),
    ('Queue/DB unavailable','Interrupt Redis/PG before and after financial write; restore and replay pending jobs.', 'No false success; durable attempts survive lost queue notification; recover accounting after reconnection without duplicate payout.', '#104,#113'),
    ('Source rejection classification','Inject tx_bad_seq, insufficient balance, expired timebound and operation failure into isolated submission/reconcile harness.', 'Distinguish explicit rejection from unknown outcome; settle nothing on rejection; preserve useful safe correlation metadata.', '#104'),
    ('SDK sequential multi-batch handling','Use published SDK/API client for >one batch; introduce delayed confirmation and exercise resume.', 'SDK waits/queries confirmation or surfaces actionable resumable state before next preparation; SUBMITTED is not CONFIRMED. Issue #105 remains open.', '#105'),
]:
    add('D2','SIG',title,'Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.',steps,expected,'Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.', issue,kind='Security' if 'tamper' in title or 'Signed' in title else 'Negative',harness='tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness')

for title, steps, expected, issue in [
    ('Cross-organisation and role controls','Create two disposable orgs; try reading/registering/funding/reclaiming other org campaign with session and API key; try read-only role.', 'Resource/role denial without secret/object leakage; no rows or chain submissions created for unauthorized request.', '#114'),
    ('Idempotency scope and request mismatch','Reuse same key with same request, changed body and different user/org; run concurrently.', 'Same authorized request replays one result; changed body refuses; key never returns another org response.', '#102,#114'),
    ('API key underscores and secret at rest','Use deterministic full API-key fixtures with underscores in suffix; verify authentication, revoke/wrong-key denial and database representation.', 'Parser/hash covers whole token; no probabilistic generation assumption or partial split token check; no cleartext key at rest. Issue #112 harness gap must be fixed.', '#112'),
    ('Claim proof and body guard','Submit malformed/oversize body, planted secret field, wrong preparation proof, replayed nonce and altered recipient.', 'Refuse at API boundary; no logs reflect bearer material; only valid matching proof advances intended claim.', '#101,#114'),
    ('Frame-origin and message spoofing','Send bridge replies from wrong origin/window with wrong ID; trusted parent attempts changed XDR.', 'Ignore untrusted replies and refuse tampered trusted replies; no wildcard origins, no broad frame access.', '#114'),
    ('Session cookie and CSRF boundaries','Enable exact Lantern origin; login in trusted partition; issue cookie mutation from foreign/originless browser; log out.', 'HttpOnly/Secure/Partitioned cookie matches deployment; unsafe browser mutations require exact Kleym origin; logout revokes/clears matching partition.', '#114'),
    ('Outbound URL canonicalization and redirects','Configure webhook/screening/OIDC/federation URL fixtures with local/private/reserved hosts, credentials, alternative numeric IPs, backslashes and 3xx.', 'Public HTTPS guard rejects unsafe forms and redirects; permitted loopback only in explicit development; network errors are safe and bounded.', '#107'),
    ('DNS rebinding and deployment egress','In controlled deployment resolve a public-looking allowed hostname to private IP; test socket egress policy with security owner.', 'No connection to private/internal address; DNS/socket or platform egress enforcement must prove this. Current URL-only guards do not satisfy this case.', '#107'),
    ('Audit seed emitted log and future key guard','Run secret-classification focused tests and guard using planted root/nested fields; add unclassified seed fixture; verify fixed public signature.', 'Audit/sponsor/encryption/provider fields censored; future seed name fails classification; safe public IDs observable; signature bytes/verification format unchanged.', '#109'),
    ('Client bundle and evidence leak scan','Scan candidate source/build and proposed report text for seeds, mnemonic fixtures, bearer URLs, tokens and credentials; inspect all intended screenshots.', 'No real secret or complete claim fragment is published; public IDs/hashes permitted; scan scope/limitations recorded, not called security assurance.', '#108,#109'),
    ('Bearer-email exclusion for pilot','Enable campaign/self-delivery mode; invoke legacy email/reminder queue path and inspect sanitized message metadata.', 'Pilot cannot enqueue/send full bearer links via built-in email; server never receives browser link key. Legacy behavior requires explicit gated product decision.', '#108'),
]:
    add('D2','SEC',title,'Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.',steps,expected,'Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.',issue,kind='Security',harness='Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check')

# D3: actual supported wallets, not simulated bridge claims.
for title, steps, expected in [
    ('Desktop Freighter sender connection','Cold-open approved HTTPS sender page with unlocked desktop Freighter/Testnet. Connect intended public sender and prepare one funding batch.', 'Desktop extension control only; no Android app button; exact address/network visible; connection alone moves no funds.'),
    ('Desktop Freighter funding approval','Save private export; sign intended batch; inspect popup and submit; wait for campaign ledger confirmation.', 'Popup appears; correct official issuer/principal/signers; sender XLM warning, if wallet displays it, does not substitute for sponsor-paid ledger proof.'),
    ('Desktop recipient claim','Open link A privately in recipient browser; connect intended recipient; click Claim; review signatures and wait for settlement.', 'Exact one USDC credited once; confirmed transaction link uses Testnet; cleanup/reserves satisfy D1 accounting.'),
    ('Stale extension tab recovery','Keep saved draft, invalidate/restart extension bridge, compare original/fresh tabs, reopen only after private backup.', 'No endless spinner or false funded state; helpful reconnect guidance; new tab can recover public draft and keys only from user-held backup.'),
    ('Android Chrome phone controls','Open link B privately in Android Chrome without desktop extension. Inspect wallet controls and press phone connect.', 'No desktop-specific Connect wallet button. Freighter phone open/pair action is clear; connection is distinct from claim; installed/uninstalled fallback is truthful.'),
    ('Android Freighter connection return','Approve connection in installed Android Freighter, return to original Chrome tab and inspect account/network.', 'Tab reaches explicit Claim control with intended public account; connection alone cannot transfer; return guidance explains next step.'),
    ('Android Freighter full claim signing','From connected link B in Chrome press Claim; open wallet review, explicitly approve, return and confirm independently.', 'Actual v1.25.28 or recorded installed-version mobile signatures work for required operations; exact one USDC; no manual raw-XDR or key entry.'),
    ('Android reconnect/background lifecycle','Background Chrome/Freighter during connection, review and submission; resume; test expiry and user rejection separately.', 'No duplicate submission on resume; usable safe recovery; stale wallet context cannot sign a changed transaction; keys remain private.'),
    ('App not installed / pairing expiry','Use Android without installed app or expired WalletConnect pairing; press connect and cancel/retry.', 'Usable fallback/help and bounded timeout; no claim or phantom connected state; no promise that app opening equals approval.'),
]:
    add('D3','FRE',title,BASE+' Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.',steps,expected,'Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.', '#97,#106,#114',kind='UAT',harness='Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures')

for title, steps, expected in [
    ('Curated directory entry and package identity','Hash senior-provided Lantern APK/extension; inspect Apps directory for exact approved Kleym HTTPS origin/session=true; compare effective installed extension origin.', 'Kleym is explicitly curated; Android directory metadata generated; exact approved frame origins. Current 0.6.2 without Kleym cannot pass this prerequisite.'),
    ('Android public sender handoff','From public Kleym sender/login in Chrome select Open in Lantern; inspect opened page and browser fallback with app absent.', 'Only public path handed off; query/fragment removed; app opens curated Kleym, fallback is intended public page; no private claim fragment copied into intent.'),
    ('Lantern sender authenticated session','Inside curated trusted Lantern frame login, connect wallet, create draft, leave/reopen Apps and log out.', 'Authenticated sender experience works in correct cookie partition; desktop browser session is separate; logout terminates partition session.'),
    ('Lantern desktop funding and management','In rebuilt extension open Apps > Kleym. Create saved 3-link campaign; approve funding; inspect campaign and reclaim unused link after expiry.', 'Lantern receives exact sign-only XDR; no external Freighter phone control; API submits and confirms exactly once; auth/organization management remains intact.'),
    ('Lantern Android funding and management','Repeat saved 3-link campaign creation/funding in rebuilt APK; inspect scrolling, approve review and confirmed dashboard.', 'Full creator journey works on physical phone, not only mocked bridge; exact hash/account/network preserved; no overflow or inaccessible signing action.'),
    ('Recipient claim already in trusted Lantern frame','Open disposable link inside curated trusted frame using owner-approved private-link route; connect Lantern and explicitly claim.', 'Connect Lantern selected; no Freighter pairing control; exact claim review inside wallet; confirmed asset reaches selected recipient; public launcher is not claimed to move private links.'),
    ('Uncurated generic URL sandbox','Open Kleym via Lantern generic URL bar instead of approved Apps directory; attempt login/connect safely.', 'Opaque sandbox is not treated as trusted authenticated integration; honest guidance; no fallback widening origins or copying private fragments.'),
    ('Lantern delayed idless connection reply','Delay getPublicKey reply past timeout, retry without reopening, then deliver old response in bridge fixture.', 'Late response cannot complete a different connection; reopen requirement visible; signing still correlates exact request ID/source/origin.'),
    ('Lantern wrong network / account / permissions','Switch network/account or revoke app grant before sign; return wrong identity or tampered signature via fixture.', 'Fresh grant/account/network checks refuse; never signAndSubmit behind Kleym journal; original reviewed transaction unchanged.'),
]:
    add('D3','LAN',title,BASE+' G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.',steps,expected,'Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.', '#106,#114',kind='UAT',harness='Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures')

for title, steps, expected in [
    ('Keyboard and focus order','Use Tab/Shift-Tab/Enter/Space from login through amount editor, expiry picker, review, export and wallet controls.', 'All interactive elements reachable with visible focus; logical order; no keyboard trap.'),
    ('TalkBack / NVDA status announcements','Use Android TalkBack and desktop NVDA for invalid amount, funding pending and claim result.', 'Errors and new states announced meaningfully; controls labelled; no reliance on colour alone.'),
    ('Phone viewport and 200% zoom','Test 360px/393px portrait, landscape, keyboard-open state and desktop 200% zoom across creation/review/claim.', 'No sideways scrolling or clipped primary controls; amount/date input and signing return usable.'),
    ('Cold recipient without team help','Give independent reviewer only their private test link and minimal Testnet warning; time connection/claim and record hesitation.', 'Reviewer identifies asset/network, connection versus claim and result without keys/raw-XDR instruction; friction recorded as UAT findings, not fabricated passes.'),
]:
    add('D3','UX',title,'Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.',steps,expected,'Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.', '#106,#114',kind='UAT',priority='P1',harness='Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary')

# D4: Lantern's cold public review, honest unavailable-state copy and operational gates.
for title, steps, expected, issue in [
    ('Candidate freeze and deployed parity','Record feature commit, dependency lock hash, migrations, runtime/package-manager versions, effective public URL and server build identity; compare release manifest; run dependency audit with supported package manager.', 'Tested source, built bytes and deployed candidate match; unknown identity blocks qualification. Unresolved critical/high dependency advisories block release until remediated or explicitly assessed by the security owner.', '#111,#114'),
    ('Migration and rollback on populated copy','Backup isolated seeded DB with campaigns/attempts/receipts; apply candidate migration; exercise old/new states; rehearse documented rollback from copy.', 'No precision/history/lineage loss; safe recovery of pending attempts; rollback decision tested and source/deploy artifact preserved.', '#98,#115'),
    ('Real DB/Redis CI qualification','Run full isolated PostgreSQL/Redis suites from candidate in CI; include keys, receipts, batches, claims, source coordination, backup and recovery.', 'Green evidence for candidate includes meaningful assertions; unavailable Docker/local services mean Blocked for execution, not pass from mocks.', '#111,#112,#114'),
    ('Public HTTPS cold sender and recipient','After owner-approved deployment, cold-open public URL on desktop and Android outside team network; execute 3-link tutorial.', 'HTTPS reachable, Testnet clearly labelled; no localhost dependency; account/claim links work without team browser profile.' ,'#114'),
    ('200-link cost/capacity budget','Record fresh base reserve, fees, sponsor liabilities and configured campaign/recipient caps; quote 200 one-USDC links then enforce limiting budgets.', 'Principal separate from operational XLM; fee bid versus charged fee distinguished; persistent recipient reserves included in lifecycle budget; configured limits enforced before spend.', '#99,#103,#115'),
    ('Performance latency/provider-read budget','Measure 30 representative prepare/resolve requests at agreed concurrency with recorded network and fixture dataset; report median/p95, provider calls and errors.', 'Baseline and candidate measured comparably; no invented speedup; static 10-to-5 provider call reduction is not latency evidence. Owner sets SLO before sign-off.', '#103,#114'),
    ('API throttling / provider rate limits','Use bounded local load within agreed test budget; return 429/503/timeouts from isolated provider; observe recovery and queues.', 'Useful bounded response/backoff; no storm, duplicate spend or false active state; rate limit shown honestly and financial journal retained.', '#104,#113'),
    ('Sponsor failover / shortage / refill','Exhaust primary fixture below working threshold; select secondary; test total pool shortage and alert routing; rehearse refill procedure without cold signing.', 'Fresh sponsor choice respects outstanding liability and pinned campaign sponsor; alerts actionable; no unauthorized automatic cold refill; approved owners recorded.', '#103,#113,#115'),
    ('Worker pause and drain','Pause creation with pending submitted attempts; drain/reconcile workers before planned shutdown, then restart isolated services.', 'User-facing pause clear; accepted attempts remain durable and settle; no stranded state hidden by queue deletion.', '#104,#113'),
    ('Backup restore and disaster recovery','Restore encrypted DB backup to isolated environment; restore matching configuration via secret store; reconcile exact pending hashes before unpausing.', 'Audit/history and financial journals preserved; no key in reports; measured recovery time/loss against owner-approved RTO/RPO.', '#113,#115'),
    ('Monitoring and signed evidence cadence','Trigger stale pending attempt, low spendable reserve, queue delay and mismatch fixture; inspect dashboards/alerts and generate verified export.', 'Owner can trace safe correlation ID/hash; alerts reach approved operator; signed receipts verify; production cadence/gates documented and actually wired.', '#111,#113'),
    ('Mainnet read-only config and issuer','Inspect public passphrase/official USDC issuer and exact public Horizon identity; verify release checklist without signing or submission.', 'Public issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN matches configured asset; no Testnet address/passphrase/issuer crossover. No live movement authorized by this plan.', '#115'),
    ('Capped Mainnet pilot approval','After mandatory Testnet/operations cases pass, obtain recorded owner-approved limits, sponsor capital, incident/refill owners and rollback criteria.', 'Separate explicit approval required before any real-USDC transaction. Unresolved P0/financial evidence blocks live pilot regardless of local green suite.', '#115'),
    ('Issue closure and evidence consistency','For each proposed closure map every criterion to candidate source and executed case log; verify tracker totals/evidence/defect references.', 'Close only satisfied criteria; keep missing device/DB/ledger/deployment proof open; roadmap reflects qualified scope rather than promised launch date.', '#95,#114'),
]:
    add('D4','OPS',title,'G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.',steps,expected,'Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.',issue,kind='Load' if 'Performance' in title or 'throttling' in title else 'UAT',harness='Existing verification scripts and deployment/runbook procedures; no automatic production writes')

def p(text, style='Body'):
    return Paragraph(escape(str(text)).replace('\n', '<br/>'), styles[style])


# Existing supported adjuncts must not regress while the prize pilot is qualified.
for title, steps, expected in [
    ('Bearer policy versus named recipient', 'Share a disposable bearer link with a different controlled recipient; compare with an explicitly configured strict-policy fixture.', 'Bearer policy is not email/address binding; strict policy follows its documented authorization. Never describe sender labels as claimant enforcement.'),
    ('Receive-as quote and slippage floor', 'In an approved disposable asset pair, quote an allowlisted receive-as asset; change quote liquidity and try below-minimum destination before submission.', 'Delivered asset and minimum are explicitly reviewed; failed conversion preserves claimable principal; no silent ticker/issuer substitution.'),
    ('Exchange deposit memo boundaries', 'Use controlled exchange-style account fixture; test required ID/text memo, missing/wrong-type/overflow memo and disabled exchange-deposit campaign.', 'Only permitted reviewed destination/memo is accepted; no recipient account merge; missing or altered memo is refused before transfer; actual delivered asset appears on receipt.'),
]:
    add('D1','POL',title,BASE+' Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.',steps,expected,SNAP+' Safe policy result, destination asset/minimum and memo type; no OTP/token capture.','#101,#114,#116',kind='Regression',harness='verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases')

for title, steps, expected in [
    ('Fresh-auth and MFA protected operations', 'With disposable sender/admin, exercise protected operations with missing/expired fresh auth; complete TOTP/WebAuthn, revoke session and retry.', 'Required second factor and fresh-auth gate cannot be bypassed; no protected mutation with revoked session; recovery material never enters evidence.'),
    ('Approval / screening hold and outage', 'Create approval-required and screened campaign fixtures; attempt funding before approval, on explicit hold and while screening dependency is unreachable.', 'Authorization and hold gates enforced; unavailable screening fails closed with safe actionable result; only authorized approved campaign can advance.'),
    ('Signed export tampering and key history', 'Generate receipts/audit export with disposable signing configuration; verify publicly; alter row/amount/signature and verify again; verify archived public-key fixture.', 'Valid evidence verifies without a signing seed; tamper fails; canonical/version/key history preserved; private credentials and bearer metadata absent.'),
]:
    add('D2','AUTH',title,'Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.',steps,expected,'Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.', '#109,#111,#114',kind='Security',harness='verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain')

for title, steps, expected in [
    ('Campaign list, filters and per-link history', 'Create mixed-status equal/custom campaigns in two orgs; filter/search/page dashboard and campaign details; refresh after settlement.', 'No cross-org data; stable paging/counts; exact per-link amount and confirmed lifecycle status; no stale active totals from submitted-only attempts.'),
    ('Templates and historical funding compatibility', 'Create draft from existing template and inspect funding mode; compare with new sponsored API campaign and historical sender-paid campaign.', 'Template/historical mode remains explicit and supported; no silent migration to sponsored version; funding signatures/costs match actual reviewed protocol.'),
    ('Claimed / expired / invalid link copy', 'Open safe local fixtures for already claimed, expired-unclaimed, invalid/missing fragment and provider outage.', 'Correct distinct states and actionable messages; no false funds-in-wallet message before confirmation; no spinner stuck or secret-bearing error.'),
]:
    add('D3','ADM',title,'Isolated UI/API fixtures or approved public candidate; private claim URL never captured.',steps,expected,'Scoped API snapshots, dashboard screenshots and safe state fixture output.', '#100,#106,#114',kind='Regression',priority='P1',harness='verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts')

for title, steps, expected in [
    ('Privacy deletion and organization isolation', 'With disposable org/test user, export personal data, request allowed erasure, and verify financial audit retention and unrelated org isolation.', 'Only permitted personal data returned/erased; immutable financial proof preserved under documented retention; keys/bearer URLs absent.'),
    ('Telemetry and error observability minimization', 'Trigger bounded funding/claim failures; inspect emitted logs and tracing attributes using planted secret/bearer fixtures.', 'Safe correlation IDs/hash/state observable; no mnemonic, seed, complete bearer URL, signed-body dump or private token retained in logs/traces.'),
    ('API documentation and support limits', 'Compare public write API/SDK examples, wallet support matrix, funding versions and recovery help with executed candidate cases.', 'Docs describe only proved support, explicit async confirmation and custom-amount renewal limitation; unsupported Android/Lantern/Mainnet claims withheld.'),
]:
    add('D4','DOC',title,'Isolated data and telemetry sinks; source candidate and API docs frozen.',steps,expected,'Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.', '#105,#108,#111,#114',kind='Regression',priority='P1',harness='verify:privacy; verify:observability; source/docs review')


SECTIONS = [
 ('0. Scope and qualification boundary',
  'This is a detailed plan for the current Kleym source candidate, not a completed full-wallet or Mainnet test report. Classic Stellar claimable balances, sponsor-funded XLM fees/reserves and sender-owned USDC are under test. Lantern plans provide test discipline, not their contract IDs, scanner risk rules or registry assumptions. Source access is available for Kleym; Lantern artifacts remain packaged builds.\n'
  'Freeze the final feature commit and deployment identity before execution. Initial cases are Not Run. Local development proof is listed separately; it cannot qualify a different deployed build. Railway remains paused. No service restart, wallet approval, asset movement or Lantern rebuild is authorized by generating this plan.'),
 ('1. Entry gates and exact environment',
  'G0: record feature commit, clean/dirty source state, lockfile hash, build mode, generated client version, runtime versions and manifest. Halt on unknown candidate.\n'
  'G1: use disposable isolated migrated PostgreSQL and Redis, restorable fixtures, safe credential injection and reachable approved Horizon. Current local Docker/DB environment is unavailable; infrastructure execution is gated.\n'
  'G2: owner approves small Testnet balances and signs privately; official Testnet USDC issuer is GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5; passphrase Test SDF Network ; September 2015; Horizon https://horizon-testnet.stellar.org. Verify live provider identity before each write. Testnet resets require new snapshots, not recycled historical passes.\n'
  'G3: approved public HTTPS candidate, exact browser/device/wallet versions and WalletConnect origin configured. Public host previously used: https://kleym-web-testnet.up.railway.app, currently paused; this plan does not assert availability.\n'
  'G3-Lantern: senior supplies rebuilt curated Apps entry with session=true for exact Kleym origin, verified installed extension ID and Android https://android.golantern.xyz origin. Packaged 0.6.2 does not list Kleym. Generic URL sandbox is not a substitute.'),
 ('2. Fixtures, budgets and lifecycle matrix',
  'Provision two separate sender modes: literal zero XLM with sponsored account+official USDC trustline, and funded/nonzero XLM. Each must own enough test USDC. Use three recipient modes: absent account, existing zero XLM without USDC trustline, existing zero XLM with official USDC trustline. Use six independent small campaigns to cover all sender/recipient combinations; do not mutate a shared wallet while another case depends on its before state.\n'
  'Primary tutorial fixture: three links x 1 USDC; A desktop claim, B Android claim, C unused until expiry reclaim. Final net sender debit 2 USDC, two distinct recipients gain 1 each, third balance removed only after sender reclaim; sponsor pays charged fees and reserves. Keep A/B separate recipients for clear snapshots.\n'
  'Custom prizes fixture: 20,15,10,5,5 = 55 USDC. Capacity fixture: 200 x 1 = 200 USDC, only after operator approves operational budget. Pure int64 extreme amounts never go on-chain. Frozen trustlines use a disposable custom issuer fixture, never tamper with Circle USDC.\n'
  'Always record base reserve from ledger. Claimable balance with two claimants costs 2 reserve units. Temporary claim account costs 2 plus trustline 1; recipient persistent additions: absent account 3, existing no-trustline 1, already-trusting 0. Sponsor numSponsoring includes unrelated liabilities; use differences and explain retained entries. Fee bid is an upper offer, actual charged fee comes from Horizon. Account spendable = native minus minimum reserve and native selling liabilities.'),
 ('3. First guided run: three links, three outcomes',
  '1. Pass G0-G3, privately select the intended Testnet sender and record public before balances. Set count 3/amount 1 and a near-future custom expiry that allows both claims.\n'
  '2. Review exact total, official asset, sponsor reserve/fee bid and expiry UTC. Generate locally and privately save phrase/export. Give no keys, full CSV or claim URLs to logs/chat.\n'
  '3. Sign exactly the reviewed funding batch; wait for all three funded balances and independent ledger confirmation before sharing. Save public hash/IDs only.\n'
  '4. Open A privately on desktop, connect recipient then deliberately claim. Record materialisation ledger and strictly later claim ledger, exact USDC credit, zero-XLM state and temporary account removal.\n'
  '5. Open B privately on Android Chrome/Freighter. Connection does not claim. Explicitly review and approve Claim in wallet; return for confirmed receipt. Lantern repeats require curated rebuilt package first.\n'
  '6. Leave C unused. After actual on-chain expiry, sender approves reclaim returning exactly 1 USDC. Independently verify recipient balances unchanged and two claimant reserve units released.\n'
  '7. Refresh campaign, verify statuses and signed receipts. Retry only exact unresolved transaction hashes; never repeat successful funding/claim to obtain a screenshot. Preserve private backups before closing tabs.'),
 ('4. Execution order and evidence discipline',
  'Run G0 identity and secret-handling checks first; then pure D1/D2 fixtures; real isolated DB/concurrency/recovery; small wallet D1/D3 lifecycle; custom-prize and 200-link performance/capacity; D4 operational qualification. Re-run affected lifecycle and fault cases after code changes. Split source fixture proof from physical device and independently confirmed ledger proof.\n'
  'Case IDs KLM-D1..D4-AREA-NNN are stable. Status: Not Run -> Ongoing -> Passed/Failed/Blocked; Failed -> For Re-test -> Passed/Failed. Blocked means a named missing prerequisite/proof; record whether infrastructure, dependency, product gap or tester access. N/A requires owner-approved scope reason, never a substitute for missing proof.\n'
  'For every execution record candidate, UTC time, tester, expected, observed, evidence and defect when Failed. Store files under evidences/runs/<run-id>/<case-id>/; filenames <case-id>_<UTC>_<sequence>. Capture before/after JSON, exact public transaction hashes/ledgers, decoded operations and database journal states. Screenshot explorer/UI with private address bar/phrases/keys excluded. HAR/traces may contain bearer request data: use allowlisted metadata capture or sanitize offline before sharing.\n'
  'Defect report must name reproducible steps, concrete impact, exact candidate/environment, expected versus actual, severity and priority, source/evidence location and known dependencies. Do not label an unreachable environment a product failure. A negative test passes only when it refuses for the intended reason with no unauthorized financial/state effects.'),
 ('5. Stop conditions and release criteria',
  'Stop immediately on seed/phrase/bearer disclosure, unintended signing/submission, wrong network/issuer, unexplained principal loss, double payout, missing required signature enforcement, invalid source admission, false ledger success or candidate identity mismatch. Capture only safe evidence and keep affected funds isolated.\n'
  'P0 money, signing, authorization, journal/recovery and release-gate cases must pass on the frozen candidate with required DB/device/ledger evidence. Any Failed/Blocked/Not Run mandatory case prevents release sign-off. P1 usability findings require explicit owner disposition; excluded cases need reason and owner. Performance SLO, caps, capital, incident/refill ownership, RTO/RPO and rollback triggers must be decided and measured.\n'
  'No blanket Mainnet-ready claim follows from this plan or local green tests. Mainnet is a separate capped pilot requiring verified Testnet coverage, populated migration/restore, egress enforcement, queue/incident rehearsal and explicit owner approval. Kleym operational treasury sponsors XLM; sender treasury controls USDC principal. Hot/cold split is a design guideline, not an implemented automated refill guarantee.'),
 ('6. Reference adaptation and known gaps',
  'Lantern D1: borrowed independent before/after money and state accounting, exact artifact identity, negative authorization and hard-stop gates. Kleym uses classic transactions; Lantern Soroban registry IDs, admin operations and fees do not apply.\n'
  'Lantern D2: borrowed deterministic fixture expectations, malformed/tampered payloads, unavailable dependency handling and source/package separation. Kleym signature/hash/asset/network checks define acceptance; scanner verdict policy is not copied.\n'
  'Lantern D3 build acceptance and extension plan: borrowed installed artifact hashes, supported-platform repeat, pre-sign review/cancel, actual-versus-spec deviation register and physical device proof. Mock parent tests are not actual Lantern signatures.\n'
  'Lantern D4 v3: borrowed independent cold reviewer, public URL usability, offline/unavailable honesty, privacy/accessibility and row-by-row evidence/coverage. Kleym requires authenticated sender and wallet signatures; D4 demo no-wallet promises are not copied.\n'
  'Known release gaps: local dependency audit reports 34 advisories including critical/high (qualify with supported pnpm; remediate/assess); unavailable current local PG/Redis qualification; actual curated Lantern rebuild; latest physical Android signing; SDK delayed multibatch behavior (#105); ledger receipt timestamp parity (#110); DNS/socket egress (#107); bearer-email gate (#108); lifecycle caps and runbooks (#103/#113); pilot approval (#115). Variable-amount renewal currently refuses and is not advertised as supported. GitHub issues are closed only against their full acceptance criteria.'),
]


def generate():
    OUT.mkdir(parents=True, exist_ok=True)
    metadata = dict(plan_version='v1', prepared='2026-10-08', source_base='4163d7954bff9c1582c0c405174cddbe6951da33',
                    candidate='Fill final PR head commit before execution; local accumulated candidate plus issue #109 fix',
                    access='Kleym source; Lantern reference packaged artifacts only', case_count=len(cases),
                    counts=dict(Counter(c['phase'] for c in cases)), statuses=dict(Counter(c['status'] for c in cases)))
    (OUT/'evidences/case-specs.json').write_text(json.dumps(dict(metadata=metadata,cases=cases),indent=2),encoding='utf-8')
    refnames = ['test-plan-QA-SANDBOX.pdf','lantern-d1-blacklist-registry-test-plan.pdf','test-plan-QA-D2-scanner-v2.pdf','d3-build-acceptance-test-plan.pdf','test-plan-QA-D3-extension.pdf','d4-playground-test-plan-v3.pdf']
    refs = []
    for name in refnames:
        path = Path('D:/lantern')/name
        refs.append(dict(path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), pages=len(PdfReader(path).pages)))
    (OUT/'evidences/references/manifest.json').write_text(json.dumps(refs,indent=2),encoding='utf-8')

    md = ['# Kleym comprehensive Testnet test plan v1', '', f'Prepared 2026-10-08. {len(cases)} cases. All new cases: **Not Run**. Owner review and candidate freeze required before execution.', '']
    for title, body in SECTIONS:
        md += ['## '+title, '', body, '']
    for phase, title in PHASES.items():
        md += [f'## {phase}: {title}', '']
        for c in [c for c in cases if c['phase']==phase]:
            md += [f'### {c["id"]} — {c["title"]}', '', f'**{c["priority"]} | {c["type"]} | {c["status"]} | {c["issue"]}**', '',
                   '**Preconditions:** '+c['preconditions'], '', '**Steps:** '+c['steps'], '', '**Expected:** '+c['expected'], '',
                   '**Evidence:** '+c['evidence_required'], '', '**Harness / mode:** '+c['harness'], '']
    (OUT/'TEST-PLAN-v1.md').write_text('\n'.join(md),encoding='utf-8')

    global styles
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Body',fontName='Helvetica',fontSize=9,leading=13,spaceAfter=8))
    styles.add(ParagraphStyle(name='Small',fontName='Helvetica',fontSize=8,leading=11))
    styles.add(ParagraphStyle(name='Band',fontName='Helvetica-Bold',fontSize=17,leading=21,textColor=white))
    styles.add(ParagraphStyle(name='Case',fontName='Helvetica-Bold',fontSize=10,leading=14,textColor=HexColor('#0f172a')))
    styles['Heading2'].textColor=HexColor('#0f172a')
    styles['Heading2'].spaceBefore=10
    pdf = SimpleDocTemplate(str(OUT/'kleym-testnet-test-plan-v1.pdf'),pagesize=A4,leftMargin=40,rightMargin=40,topMargin=40,bottomMargin=38,title='Kleym comprehensive Testnet test plan v1',author='Kleym QA')
    width=A4[0]-80
    band=Table([[p('QA / MANUAL + SOURCE TEST PLAN\nKleym prize distribution\nComprehensive Testnet qualification v1','Band')]],colWidths=[width])
    band.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),HexColor('#0f172a')),('BOX',(0,0),(-1,-1),1,HexColor('#eab308')),('TOPPADDING',(0,0),(-1,-1),18),('BOTTOMPADDING',(0,0),(-1,-1),18)]))
    flow=[band,Spacer(1,18),p(f'{len(cases)} detailed cases | D1-D4 reference approach | Prepared 8 October 2026'),
          p('PLAN, NOT EXECUTION RESULTS. All new cases are Not Run. Freeze final PR candidate before running. Railway remains paused.'),
          p('Coverage: '+', '.join(f'{k}: {v}' for k,v in metadata['counts'].items())),
          p('Source base: '+metadata['source_base'],'Small'),p(metadata['access'],'Small'),Spacer(1,12)]
    for title,body in SECTIONS:
        if title.startswith(('1.','3.','5.')): flow.append(PageBreak())
        flow += [p(title,'Heading2'),p(body)]
    for phase,title in PHASES.items():
        flow += [PageBreak(),p(f'{phase} / {title}','Heading2'),p('Every case below starts Not Run. Record exact candidate, observed result and evidence before changing status.')]
        for c in [c for c in cases if c['phase']==phase]:
            rows=[]
            for label,key in [('Preconditions','preconditions'),('Steps','steps'),('Expected','expected'),('Required evidence','evidence_required'),('Harness / mode','harness')]:
                rows.append([p(label,'Small'),p(c[key],'Small')])
            table=Table(rows,colWidths=[88,width-88])
            table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),HexColor('#f1f5f9')),('LINEBELOW',(0,0),(-1,-1),.3,HexColor('#d8dee9')),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
            flow += [KeepTogether([p(c['id']+' / '+c['title'],'Case'),p(c['priority']+' | '+c['type']+' | Not Run | Issues: '+c['issue'],'Small'),Spacer(1,4),table,Spacer(1,13)])]
    def footer(canvas,doc):
        canvas.saveState();canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#64748b'))
        canvas.drawString(40,22,'Kleym QA | Testnet plan v1 | 2026-10-08 | Not execution results')
        canvas.drawRightString(A4[0]-40,22,str(doc.page));canvas.restoreState()
    pdf.build(flow,onFirstPage=footer,onLaterPages=footer)

    wb=Workbook(); overview=wb.active; overview.title='README'
    for row in [['Kleym comprehensive QA tracker v1'],['Prepared 2026-10-08; source base '+metadata['source_base']],
                [f'{len(cases)} planned cases; all Not Run. This is not a full execution report.'],
                ['Fill candidate/tester/UTC and actual result/evidence per execution. Failed rows need defect links.'],
                ['Statuses: '+', '.join(STATUSES)],['Railway paused; infrastructure/device approval gates in Environment sheet.'],
                ['Summary formulas recalculate in Excel; no external evaluator has refreshed cached values.'],
                ['Reference method: Lantern D1 money/state, D2 fail-closed, D3 installed bytes/devices, D4 public UAT.'],
                ['New runs go under evidences/runs/<run-id>/<case-id>; keep all private phrases/CSV/bearer URLs out.']]: overview.append(row)
    overview.column_dimensions['A'].width=125
    for row in overview: row[0].alignment=Alignment(wrap_text=True,vertical='top')
    for i in range(1,10): overview.row_dimensions[i].height=35
    ws=wb.create_sheet('Test Cases')
    fields=['id','phase','title','type','priority','preconditions','steps','expected','evidence_required','harness','issue','status','actual','evidence','defect','candidate','tester','executed_at_utc','notes']
    headers=['Case ID','Phase','Case','Type','Priority','Preconditions','Steps','Expected result','Required evidence','Harness / mode','GitHub issues','Status','Actual result','Evidence link','Defect link','Candidate commit','Tester','Executed UTC','Notes / blocker cause']
    ws.append(headers)
    for c in cases: ws.append([c[k] for k in fields])
    widths=[25,9,50,14,10,60,85,85,60,55,20,16,70,45,32,44,20,26,55]
    for n,w in enumerate(widths,1): ws.column_dimensions[ws.cell(1,n).column_letter].width=w
    for row in ws.iter_rows(min_row=2):
        for cell in row: cell.alignment=Alignment(wrap_text=True,vertical='top');cell.font=Font(name='Calibri',size=11)
        ws.row_dimensions[row[0].row].height=118
    ws.freeze_panes='F2';ws.auto_filter.ref=ws.dimensions;ws.row_dimensions[1].height=28
    dv=DataValidation(type='list',formula1='"'+','.join(STATUSES)+'"',allow_blank=False);ws.add_data_validation(dv);dv.add(f'L2:L{len(cases)+1}')
    palette={'Passed':'DCFCE7','Failed':'FEE2E2','Blocked':'E2E8F0','Not Run':'FEF3C7','For Re-test':'DBEAFE','Ongoing':'E0E7FF','N/A':'F3F4F6'}
    for status,color in palette.items(): ws.conditional_formatting.add(f'L2:L{len(cases)+1}',FormulaRule(formula=[f'L2="{status}"'],fill=PatternFill('solid',fgColor=color)))
    summary=wb.create_sheet('Summary');summary.append(['Status','Count','Rule'])
    for n,status in enumerate(STATUSES,2): summary.append([status,f'=COUNTIF(\'Test Cases\'!L2:L{len(cases)+1},A{n})','Counts current tracker status; cached values not refreshed'])
    summary.append(['Total',f'=SUM(B2:B{len(STATUSES)+1})',f'Expected total {len(cases)}'])
    summary.append(['Initial factual snapshot',len(cases),'Not Run at generation; zero execution passes claimed'])
    for phase,count in metadata['counts'].items(): summary.append([phase,count,'Static planned-case count'])
    summary.column_dimensions['A'].width=30;summary.column_dimensions['B'].width=15;summary.column_dimensions['C'].width=85
    env=wb.create_sheet('Environment');env.append(['Gate','Required before execution','Current planning state','Owner / evidence'])
    for row in [
        ['G0','Exact candidate commit, lockfile hash, build mode, version manifest','Pending final PR candidate',''],
        ['G1','Isolated migrated PostgreSQL/Redis; restorable fixtures','Local Docker/DB qualification unavailable',''],
        ['G2','Owner-approved disposable Testnet principal/sponsor balances','No new funding or wallet approvals in this planning task',''],
        ['G3','Approved public HTTPS release and physical Freighter device','Railway paused; physical latest-flow proof pending',''],
        ['G3-Lantern','Curated Kleym session entry, rebuilt APK/extension and verified origins','Supplied 0.6.2 does not list Kleym',''],
        ['Mainnet','All mandatory gates, capital/caps/owners, separate real-funds approval','NOT qualified by this plan','']]: env.append(row)
    for col,width_ in zip('ABCD',[20,90,85,55]): env.column_dimensions[col].width=width_
    defects=wb.create_sheet('Defects');defects.append(['Defect ID','Case IDs','Title','Severity','Priority','Candidate / environment','Repro steps','Expected','Actual','Evidence','GitHub link','State','Cause classification'])
    for n in range(1,14): defects.column_dimensions[defects.cell(1,n).column_letter].width=40
    refs_sheet=wb.create_sheet('References');refs_sheet.append(['Reference','SHA256','Pages','How adapted'])
    for r in refs: refs_sheet.append([r['path'],r['sha256'],r['pages'],'See plan section 6; no Lantern contract/network policy copied'])
    for col,w in zip('ABCD',[75,70,10,90]):refs_sheet.column_dimensions[col].width=w
    prior=wb.create_sheet('Prior Proof');prior.append(['Evidence','Observed result','Scope limitation'])
    prior.append(['docs/reviews/2026-10-08/reliability-readiness/verification.json','734 source tests; 5 production Chromium fixture checks; webpack build/typecheck/focused lint','Earlier dirty candidate; mocked bridge/API; no physical wallet or new ledger qualification'])
    prior.append(['docs/reviews/2026-10-08/issue-109/focused-tests-v3.log','See source-qualified logs, not copied automatically into plan cases','Issue-specific planted credentials and public signature; no real signing seed'])
    for col,w in zip('ABC',[90,85,100]):prior.column_dimensions[col].width=w
    for sheet in wb:
        sheet.freeze_panes=sheet.freeze_panes or 'A2'
        for cell in sheet[1]:cell.fill=PatternFill('solid',fgColor='0F172A');cell.font=Font(color='FFFFFF',bold=True,size=11);cell.alignment=Alignment(wrap_text=True)
        if sheet.title!='Test Cases':
            for row in sheet.iter_rows(min_row=2):
                for cell in row:cell.alignment=Alignment(wrap_text=True,vertical='top')
                sheet.row_dimensions[row[0].row].height=44
        sheet.sheet_view.showGridLines=False
    wb.calculation=CalcProperties(calcMode='auto',fullCalcOnLoad=True)
    target=OUT/'kleym-testnet-test-cases-v1.xlsx';wb.save(target)
    check=load_workbook(target);rows=list(check['Test Cases'].values)[1:]
    assert len(rows)==len(cases) and len(set(r[0] for r in rows))==len(cases)
    assert all(r[11]=='Not Run' and not r[12] and not r[13] for r in rows)
    assert len(check['Test Cases'].data_validations.dataValidation)==1
    text='\n'.join(pg.extract_text() or '' for pg in PdfReader(OUT/'kleym-testnet-test-plan-v1.pdf').pages)
    assert all(c['id'] in text for c in cases)
    manifest=dict(metadata=metadata, pdf_pages=len(PdfReader(OUT/'kleym-testnet-test-plan-v1.pdf').pages), validation='Unique IDs, row counts, initial status, formulas and all PDF case IDs checked; no formula evaluator used')
    (OUT/'evidences/artifact-validation.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest,indent=2))


if __name__ == '__main__': generate()
