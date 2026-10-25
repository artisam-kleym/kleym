# Railway credential rotation follow-up

Railway's [23 October incident announcement](https://railway.com/changelog/2026-10-23-october-21-security-incident) recommends replacing sensitive credentials stored before 21 October. This is a provider precaution, not evidence of a Kleym-specific compromise. Runtime patching does not fulfil credential rotation.

Before Mainnet enablement, the team must inventory credentials privately and coordinate rotation across web, worker and external providers. Revoke old credentials after consumers have successfully switched. Invalidate application sessions when replacing session signing credentials. Review GitHub/Railway access and database public exposure. Record sanitized completion dates and service health, never credential values.

Do not blindly replace credential-encryption keys: existing encrypted integrations need a compatible decrypt/re-encrypt transition and verified backup. Preserve verification of historical signed receipts and audit chains during key transitions. Sponsor-key replacement requires authorization, ledger reconciliation and treatment of existing sponsored reserves; do not move assets as an incidental dependency upgrade.

Acceptance: named incident owner; private credential inventory and rotation plan; completed/revoked credentials documented without values; old sessions denied; encrypted integrations and historical receipt verification preserved; web/worker/recovery checks pass. Until those checks are complete, this remains an operational release gap.
