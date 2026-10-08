# Open issue reconciliation — 2026-10-08

Read against current source and fresh GitHub issue criteria. Planning a case is
not executing it. Local test passes do not establish physical-device, current
database, independent ledger or release qualification.

| Issue | Decision | Evidence / remaining acceptance |
|---|---|---|
| #109 | Qualified for implementation closure | Actual emitted-log redaction, future seed classification rejection, public verification and receipt compatibility; 17 focused passes. Fix published through reviewable feature PR; deployment still paused. |
| #97 | Keep open | Historical recipient-mode Testnet proof exists; full fresh sender/recipient/native/expiry negative and supported-wallet matrix remains. Plan D1-MAT, D3-FRE/LAN. |
| #98 | Keep open | Sponsored classic funding implemented; explicit rollout/version gate and populated migration/rollback qualification remain. D1-FUN, D4-OPS. |
| #99 | Keep open | Exact amounts/IDs/cost arithmetic and custom prizes implemented; current 200-link wallet+ledger and persistence/retry qualification pending. D1-AMT/FUN. |
| #100 | Keep open | Sponsor-paid reclaim/renewal implemented; full current boundary, retry/partial/zero-XLM accounting proof required. D1-SET. |
| #101 | Keep open | Exact preparation/signature/later-ledger recovery checks implemented; current full DB/device/ledger fault matrix pending. D1-SET, D2-SIG. |
| #102 | Keep open | Fresh source admission under PostgreSQL advisory lock; current real multiprocess DB/worker proof and contention measurements pending. D2-SIG. |
| #103 | Keep open | Fresh reserve/liability arithmetic qualified locally; whole-lifecycle reservations/caps, refill ownership and operational limits incomplete. D1-FUN, D4-OPS. |
| #104 | Keep open | Durable exact-hash attempts/reconciliation implemented; current real DB/queue interruption matrix and restore proof pending. D2-SIG, D4-OPS. |
| #105 | Keep open | Nullable labels aligned; SDK loop still advances after SUBMITTED while server requires CONFIRMED. D2-SIG-014, D4-DOC. |
| #106 | Keep open | Desktop/phone controls, bridge and layout fixtures improved; latest physical Android and curated Lantern end-to-end signing pending. D3. |
| #107 | Keep open | Canonical public HTTPS and redirect/runtime consumer guard passes local tests; private DNS answers/rebinding and deployment socket egress not qualified. D2-SEC-008. |
| #108 | Keep open | Sender self-delivery documented; legacy bearer-email/reminder path must be explicitly gated and executed to prove exclusion. D2-SEC-011. |
| #110 | Keep open | Direct claim uses application clock; reconciliation uses ledger created_at. Parity remains concrete implementation gap. D1-SET-011. |
| #111 | Keep open | Queue packaging fixed; full hosted persistence gates and operational signed evidence cadence need qualification. D4-OPS. |
| #112 | Keep open | API-key harness still has probabilistic underscore sampling and partial split-token secret check; isolated deterministic DB suite required. D2-SEC-003. |
| #113 | Keep open | Monitoring/recovery mechanisms exist; operator-owned drain, shortage, backup/restore and incident rehearsals pending. D4-OPS. |
| #114 | Keep open | Comprehensive D1-D4 adapted plan/tracker created; 118 cases begin Not Run. Full execution is a separate qualification campaign. |
| #115 | Keep open | Real-funds caps, capital, owners, rollback and mandatory tested release gates are unresolved; local dependency audit reports 34 findings including critical/high. No Mainnet authorization inferred. D4-OPS-013. |
| #116 | Keep open | Existing native/issued/receive-as paths require regression proof and issue #115 before broader asset support claims. D1-POL. |
| #95 | Keep open | Roadmap remains active with the release/financial criteria above. One independent security implementation item qualified. |
| #83 | Keep open | Sandbox feature has unresolved product decisions; source/fixture tests are not delivery of the requested sandbox. |
| #76 | Keep open | Vesting tranche product decisions and implementation remain outside current equal/custom prize link delivery. |

Senior developer's `develop` branch is not changed by this task. `develop-ade`
will hold the review baseline, with `codex/app-sending-pilot` as feature PR head.
No issue above is closed merely because a PR compiles or a test plan includes it.
