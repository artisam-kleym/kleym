# Repository backup — 29 October 2026

The owner requested removal of completed `codex/` branches and designated
`develop-ade` as the backup branch. `develop` remains the release branch used by
the team Railway deployment; this cleanup changes no deployment configuration.

`develop-ade` was fast-forwarded from `f68bfc2756b04065dde56f1f016804fbf62fff49`
to `4ff8adb57133116073f1d4d340f49a14c928b29b`, preserving all 17 newer commits
from `develop`, including the security fixes, email verification and complete
26 October QA checkpoint. There were no uncommitted application changes.

All 24 remote `codex/` branches were verified as ancestors of `develop`, with
zero unique commits and no open pull requests, before deletion. Their commits
remain reachable through both retained branches and merged pull requests.
A verified local Git bundle was also saved under the ignored
`.runtime/repository-cleanup-20261029/` directory before cleanup.

Unused, fully merged local `codex/` branches were removed. Local branch names
attached to other worktrees were retained so those checkouts remain usable;
their remote branches were removed. No worktree directory, private runtime
data or emulator data was deleted. Non-`codex/` branches were left intact because
their ownership and continued use were not established.

This checkpoint is a documentation-only commit on `develop-ade`. No application
code was changed and no new test or Mainnet readiness claim is made. Continue
from `docs/checkpoints/2026-10-26-qa-and-android.md` for the saved development and
Android testing state.
