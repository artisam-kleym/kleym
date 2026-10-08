# Kleym comprehensive Testnet QA package v1

Prepared 2026-10-08 using Lantern D1–D4 plans as methodology references.

- **PDF:** `kleym-testnet-test-plan-v1.pdf` — 38 pages, setup, fixtures,
  step-by-step three-link tutorial, release gates and all 118 detailed cases.
- **Excel:** `kleym-testnet-test-cases-v1.xlsx` — README, Test Cases, Summary,
  Environment, Defects, References and Prior Proof sheets.
- **Readable source:** `TEST-PLAN-v1.md`.
- **Evidence/support files:** `evidences/` contains versioned case specifications,
  reference SHA256 metadata, generator and layout renders. New executed proof
  belongs in `evidences/runs/<run-id>/<case-id>/`.

Coverage: D1 48; D2 28; D3 25; D4 17. All **118 Not Run**, with no fabricated
execution pass. Existing development evidence is documented separately and tied
to its actual candidate/scope. A historical local green suite cannot qualify the
new public deployment or physical Android/Lantern signatures.

## Readiness and ownership

Freeze the final PR head in the Environment sheet and every execution row.
Owner review is required before accepting the plan's product and operational
thresholds. Infrastructure, approved disposable Testnet balances, public HTTPS
deployment and physical-device gates precede actual money-path execution.
Railway stays paused. Lantern 0.6.2 needs a curated Kleym entry and rebuild first.
This package authorizes no restart, wallet approval or Mainnet asset movement.

## Artifact verification

Reopened workbook: 118 unique IDs, all statuses Not Run, empty observed/evidence
fields, status validation and summary formulas checked. Excel recalculates
formulas on open; no evaluator refreshed formula caches during generation.

Rendered all 38 PDF pages; reviewed contact sheets and full-size accounting page.
No extracted text block exceeded the page margins; every case ID appears in PDF.
Complete renders remain locally under `evidences/layout/`; contact sheets are
included for review. Original Lantern reference PDFs were not modified or copied
into the Kleym repository. Local extracted reference text is inspection scratch,
not a Kleym deliverable.

Generator: `evidences/scripts/build_plan.py`, using the bundled Python runtime
with ReportLab, openpyxl and pypdf. Rendering uses the installed system PyMuPDF.
Rerun preserves the same v1 specifications; create a new version for revised scope
or execution results rather than overwriting accepted historical outputs.
