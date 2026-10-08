# Public sender Freighter detection investigation

## Observed failure

On the public `/campaigns/new` Review & create screen, Sign 1 batch displays “Open Freighter in this desktop browser, unlock it, then try again.” The user confirms the same desktop browser/profile and extension hover text “Has access to this site”. Retrying produces no browser Console error. The recovered sender identity remains the original GBV6…OQQY5A account; no new three-link funding receipt is available.

## Trace and evidence

- `src/lib/wallet/signing.ts` throws this message only when the kit's `FreighterModule.isAvailable()` returns false. The wizard calls `connectWallet` before campaign creation, registration, funding preparation or signing. This particular failing attempt therefore does not create a campaign or submit a funding batch.
- Installed kit 2.6.0 calls `@stellar/freighter-api` 6.0.0 `isConnected()`. Its bundled message helper sends `REQUEST_CONNECTION_STATUS` and returns false after a two-second response timeout. It can also receive an unsuccessful response; the UI alone cannot distinguish these cases.
- Installed Freighter 5.48.0's public manifest declares a content script at `document_start` for all URLs. Its public source map shows a `window.postMessage` to extension-runtime bridge; its background connection-status handler returns `{ isConnected: true }`. Only extension package code/manifest were inspected, never wallet storage or keys. A stale or missing bridge is plausible following the reported extension restore, but not yet proven.
- Official API guidance distinguishes installed-extension detection from origin access authorization: [Freighter connection documentation](https://github.com/stellar/freighter-developer-docs/blob/main/extension/connecting.md). Detection should succeed before requesting access. No network/account/signature check should be bypassed to address this failure.

## Deployed browser proof

At 2026-10-03T14:15:17Z, the existing Playwright harness exercised the actual public sender wizard and bundled API under production HTTPS/CSP in an isolated browser. The fixture omitted `window.freighter`, forcing the SDK's real message handshake. All subsequent POST writes were intercepted before reaching the server, and disposable generated fixture keys were never funded or recorded.

1. No extension responder: the exact user-facing error was reproduced; only `REQUEST_CONNECTION_STATUS` was sent, with no access request or campaign write.
2. Enable a synthetic responder and retry the same in-memory draft: detection, `REQUEST_ACCESS`, public address retrieval and Testnet network verification succeeded. The campaign creation request was intercepted with a deliberate fixture refusal. No signing request occurred.

Full safe evidence: [freighter-bridge-probe.json](./freighter-bridge-probe.json). This proves the deployed sender integration can use a responding bridge. It does not prove the actual user's extension responds or opens a wallet popup. No application source change or new deployment was made.

## Pending discriminator and recovery

An asynchronous request asks the user to open a second fresh `/campaigns/new` tab, preserving the original tab's keys, and run a read-only connection-status probe. It reports only a detection boolean or no response; it requests no access, key, signature or transfer. Compare fresh-tab detection with the original failure before changing product code or rebuilding an unfunded draft. Do not reload the original tab without verifying the private phrase/export backup. Do not repeat funding, expose either private backup, or share complete claim URLs.

The three-link public acceptance test, actual desktop signature, Android destination/version/signature and Mainnet qualification remain pending.

### Probe copy failure

The user's returned Console text contains rearranged lines and spaces inside optional chaining, ending with `Uncaught SyntaxError: Unexpected token '.'`. The probe did not execute, so this is not evidence of an extension response or wallet failure. Provide the corrected probe as a normal response code block with a copy button, using plain property checks instead of optional chaining. Real fresh-tab detection is still pending; no code patch or browser reset follows from that syntax error.

### Fresh-tab extension detection confirmed by user

The corrected read-only probe returned `Freighter detected: true` in the user's fresh second tab. The initial Console `undefined` is the probe's normal return value. This confirms the actual extension's connection-status response reaches a fresh page on the public origin. It is user-reported evidence, separate from the synthetic deployed-browser qualification; response latency and original-tab behavior have not been measured.

The user was asked to select and unlock restored sender GBV6…OQQY5A on Testnet, return to the ORIGINAL Review tab and click Sign 1 batch once. Report whether the wallet opens or the same error remains. If it opens, review the intended 3 links × 1 test USDC and return the public confirmed funding receipt. Keep both tabs and the private export intact. This retry distinguishes a recovered transient bridge from a continuing original-tab problem without discarding keys or rebuilding a draft. Detection alone is not approval, signing or funding proof. Application code and deployment remain unchanged.

### Original draft still fails after the fresh-tab success

The user reports the ORIGINAL Review tab still shows the same availability error on one Sign 1 batch retry. The earlier controlled deployed-browser proof demonstrated that the SDK can recover on the same draft after the message responder becomes available, so the available evidence does not establish a cached false SDK result. A fresh-tab connection-status success does not establish the original tab's bridge, response timing or provider state.

Next discriminator requested: run the already successfully copied read-only connection-status probe in the ORIGINAL tab and report true, false or no response. Preserve both tabs and original phrase/export. If it times out, the original tab's bridge is the immediate recovery target; if it responds true, investigate the SDK's two-second cutoff and mobile-provider guard before changing detection behavior. This retry remains before campaign creation and funding preparation; no new confirmed funding receipt or wallet popup proof is available. No app change, deployment or agent ledger submission.

## Immediate cause confirmed and unfunded recovery qualified

The user ran the corrected probe in the ORIGINAL tab and returned `No Freighter response` after three seconds. The same probe in the fresh tab returned true. The immediate failure is therefore an absent or unresponsive extension bridge in the original page, rather than proof of a host-wide HTTPS integration failure. The underlying reason that the original bridge stopped responding was not independently established; extension restoration remains a plausible trigger. The app cannot restore that extension-owned bridge merely by retrying its SDK.

Read-only preflight at 2026-10-03T14:28:43Z verified official Testnet identity, sender15.0000000 USDC /0.0000000 XLM, public organization's campaign count0, and readiness200. See [unfunded-draft-recovery.json](./unfunded-draft-recovery.json). These attempts did not register or fund a new public campaign. Historical local obligations remain separate and are not erased by the cloud count0.

Recovery: keep the original tab/private export; use the already-working fresh tab to rebuild an unfunded 3×1USDC draft, with a distinct campaign/export name and a future expiry. The saved **Kleym campaign** phrase may be entered privately using the existing-phrase option, or a new campaign phrase may be backed up. A new draft uses a new derivation index and new link keys, even with the same phrase; its new CSV must be downloaded and used for distribution. The original export's unfunded links should not be shared. Select restored sender/Testnet/unlock, Sign1batch once, review3USDC and wait for confirmed funding before any claim. Expected sender12USDC after funding, then13after the third unused link's expiry refund, assuming no other activity. Desktop first claim and distinct Android second claim follow funding verification.

No application source change, redeployment, extension reset, secret access or agent asset transfer was performed. A real popup/signature/funding receipt in the fresh tab remains required before calling recovery complete.
