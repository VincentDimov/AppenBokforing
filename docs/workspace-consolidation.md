# Workspace consolidation — 2026-10-12

The main working directory is `AppenBokforing`, on Git branch `master` after
consolidation. FAS 37.1 work and the production Neon migration automation are
merged, not discarded. The duplicate branch name in the cleanup request refers
to one branch: `codex/fas37-1-ci-catalog-validation`.

Private local artifacts remain inside the main working directory:

| Previous sibling directory | Current location in AppenBokforing |
| -------------------------- | ---------------------------------- |
| `LedgerApp-Backups`        | `.local-artifacts/backups`         |
| `LedgerApp-Source-Review`  | `.local-artifacts/source-review`   |

`.local-artifacts/` is Git-ignored. Database dumps may contain personal or
accounting data. BAS PDF/XLSX source material is not authorized for redistribution
merely because it was downloaded for review; no source documents or dumps are
committed or uploaded. File contents are preserved and SHA-256 checked during
the move. Moving these backups does not restore, reset or modify any database.

The former `LedgerApp-neon-automation` temporary worktree had already been
removed after its committed automation was integrated. The local upgrade helper
now writes future backups to `.local-artifacts/backups`, not the old sibling
directory. Historical backup references have been updated to the retained files.

Older phase reports describing an unmerged draft PR are dated historical
snapshots. Consolidating the code does not resolve the official BAS licensing,
source classification, accounting or regulatory release blockers in those
reports. Existing production migration gates remain enabled.
