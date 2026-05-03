# Master Status

## Program Goal
Deliver a fully functional, end-to-end portal flow with backend-backed routes and production-ready UI quality.

## Milestone Control
- Last Completed Milestone: `M4`
- Next Milestone: `M5`

## Current Scope (Active)
- In scope: bounded milestone work only (see `docs/MILESTONE_TEMPLATE.md`).
- Out of scope: any task not listed in the active milestone.

## Core Rules
1. Read before coding:
- `docs/MASTER_STATUS.md`
- `docs/ROUTE_API_MATRIX.md`
- Latest `docs/CHANGELOG_MILESTONE_*.md`
- Active milestone section in `docs/MILESTONE_TEMPLATE.md`

2. During coding:
- Modify only milestone-allowed files/modules.
- Keep `ROUTE_API_MATRIX.md` in sync.

3. Before finishing:
- Update this file with decisions/progress.
- Update `ROUTE_API_MATRIX.md` truth state.
- Add new `CHANGELOG_MILESTONE_<ID>.md`.
- Update `MISSING_ITEMS_CHECKLIST.md` status for impacted items.

## Architecture Decisions
- `support` role is not planned currently.
- Route registry and mounted router must remain aligned.
- No route should be exposed in nav unless backend + tests are ready.
- Registry-defined admin routes without dedicated pages now redirect to a canonical mounted admin page instead of rendering a blank outlet.
- Student bulk ingestion uses an all-or-nothing validate-before-commit contract with row-level error reporting and optional roster-sync deactivation.
- Student auth provisioning for ingestion uses `studentId` as the Firebase Auth uid and mirrors the acting admin's license layer into student custom claims.
- Question bulk upload uses an all-or-nothing validate-before-commit contract with immutable `questionUploadLogs` and derives `questionId` from `uniqueKey` plus `version` when the upload omits an explicit id.
- Question assets now upload through a managed backend workflow into the canonical versioned question-assets bucket, and question metadata accepts only canonical managed asset paths instead of arbitrary image URLs.

## Milestone Progress
- M0: Project operating system files created (this baseline).
- M1: Admin route registry aligned with mounted router using explicit redirect resolution for known unmapped subroutes and a nested admin not-found fallback.
- M2: Added `POST /admin/students/bulk` backend ingestion with validate/commit modes, CSV-or-JSON intake, row-level conflict reporting, auth provisioning, and roster-sync deactivation coverage.
- M3: Added `POST /admin/questions/bulk` backend upload bridging with validate/commit modes, CSV-or-JSON intake, question-bank writes, immutable upload logs, and emulator-backed downstream-ingestion compatibility checks.
- M4: Added `POST /admin/questions/assets` for managed question/solution asset uploads, returned preview-safe signed URLs and canonical asset paths, and enforced managed-asset path validation inside `POST /admin/questions/bulk`.

## Risks / Watchlist
- Route definition vs route mounting drift.
- UI fixture-mode masking missing backend APIs.
- Question-bank UI still masks the new upload bridge and asset-upload workflow behind simulated local interactions.
- Local preview auth uses fallback credentials (`admin.test@parabolic.local`) that differ from the admin login form defaults.

## Next Milestone Start Notes
- Resolve milestone from `Next Milestone` above and set active milestone in `docs/MILESTONE_TEMPLATE.md`.
- Update `ROUTE_API_MATRIX.md` rows touched by that milestone.
- M5 should focus on workbook/ZIP package ingestion and sample-generation alignment so the Question Bank flow can move beyond JSON/CSV-only metadata upload.
