# Changelog Milestone M2

## Summary
Implemented the backend student ingestion flow behind `POST /admin/students/bulk` so admin uploads can be validated before commit, return row-level errors, create or update student identity records, provision student auth accounts, and optionally deactivate missing roster entries during roster sync.

## Changed Files
- functions/src/api/adminStudentsBulk.ts
- functions/src/index.ts
- functions/src/services/studentBulkIngestion.ts
- functions/src/tests/adminStudentsBulkApi.test.ts
- functions/src/tests/studentBulkIngestion.test.ts
- functions/src/types/studentBulkIngestion.ts
- docs/MASTER_STATUS.md
- docs/MILESTONE_TEMPLATE.md
- docs/ROUTE_API_MATRIX.md
- docs/MISSING_ITEMS_CHECKLIST.md
- docs/CHANGELOG_MILESTONE_M2.md

## APIs Changed
- Added `POST /admin/students/bulk`.
- Request supports either `students: []` JSON rows or `csvContent` text plus optional `commit` and `deactivateMissing` flags.
- Response now returns row-level validation results and commit summary counts for created, updated, and deactivated student records.

## Tests Run
- `cd functions && npm run build`
  - Status: PASS
- `cd functions && node --test lib/tests/adminStudentsBulkApi.test.js`
  - Status: PASS
- `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/studentBulkIngestion.test.js"`
  - Status: PASS
  - Notes: Serves as the required end-to-end ingestion-flow check for create, update, and roster-sync deactivation behavior.

## Elevated Permission
- Required: yes
- Granted: yes
- Commands requiring elevation:
  - `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/studentBulkIngestion.test.js"`
- Reason: Firestore emulator startup and localhost port binding were blocked inside the sandbox.

## Residual Risks
- The admin `/admin/students/bulk-upload` route still has no dedicated upload screen; the milestone only delivered backend ingestion primitives.
- `GET /admin/students` remains separate work, so the admin roster page can still fall back locally even though bulk import is now implemented.
- Auth provisioning uses best-effort compensation around Firestore writes; full cross-system atomicity between Firebase Auth and Firestore is still constrained by platform primitives.

## Next-Step Handoff
- Start `M3` with `MI-003` and reuse the same validate-preview-versus-commit pattern for question package uploads.
- Wire a dedicated admin bulk-upload experience to the new API when the milestone plan allows frontend work.
- Consider follow-up coverage for auth-conflict rollback edge cases beyond the current happy-path and validation-path tests.
