# Changelog Milestone M3

## Summary
Implemented the backend admin question upload bridge behind `POST /admin/questions/bulk` so question package rows can be validated before commit, accepted as JSON or CSV, written into institute `questionBank` documents, and tracked through immutable `questionUploadLogs`.

## Changed Files
- functions/src/api/adminQuestionsBulk.ts
- functions/src/index.ts
- functions/src/services/questionBulkUpload.ts
- functions/src/tests/adminQuestionsBulkApi.test.ts
- functions/src/tests/questionBulkUpload.test.ts
- functions/src/types/questionBulkUpload.ts
- docs/MASTER_STATUS.md
- docs/MILESTONE_TEMPLATE.md
- docs/ROUTE_API_MATRIX.md
- docs/MISSING_ITEMS_CHECKLIST.md
- docs/CHANGELOG_MILESTONE_M3.md

## APIs Changed
- Added `POST /admin/questions/bulk`.
- Request supports either `questions: []` JSON rows or `csvContent` text plus optional `commit`.
- Response now returns row-level validation results, warning counts, created-vs-updated summary totals, and immutable upload-log identifiers when commit succeeds.

## Tests Run
- `cd functions && npm run build`
  - Status: PASS
- `cd functions && node --test lib/tests/adminQuestionsBulkApi.test.js`
  - Status: PASS
- `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/questionBulkUpload.test.js"`
  - Status: PASS
  - Notes: Serves as the required end-to-end check for question upload commit behavior, immutable upload-log creation, and downstream-ingestion-ready question document shape.

## Elevated Permission
- Required: yes
- Granted: yes
- Commands requiring elevation:
  - `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/questionBulkUpload.test.js"`
- Reason: Firestore emulator startup required localhost port binding and Firebase CLI config writes that were blocked inside the sandbox.

## Residual Risks
- The mounted `/admin/question-bank` page is still fixture-driven and does not yet call `POST /admin/questions/bulk`.
- Image asset upload is still separate milestone work, so uploaded rows currently rely on direct image URL fields rather than managed asset ingestion.
- Production ingestion still depends on the existing downstream question create/update processing path after bridge writes; this milestone validated bridge output compatibility rather than adding new trigger orchestration.

## Next-Step Handoff
- Start `M4` with `MI-004` by adding managed question image upload/storage handling and linking those asset URLs into the new bulk-upload row contract.
- When frontend scope opens, wire the admin question-bank upload form to `POST /admin/questions/bulk` and replace its local simulated upload log state with live API results.
- Consider a follow-up guard for structural in-place updates on previously used questions if version-enforcement needs to move from UI guidance into backend policy.
