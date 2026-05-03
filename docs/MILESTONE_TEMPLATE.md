# Milestone Template

## Active Milestone
- Milestone ID: `M4`
- Must match `Next Milestone` from `docs/MASTER_STATUS.md` at milestone start.
- Title: `Implement Question Image Upload Workflow`
- Status: `completed`

## Goal
Implement the backend question image upload workflow so admin-managed question and solution assets are stored in the canonical question-assets bucket and the question upload bridge only accepts managed asset paths instead of arbitrary image URLs.

## In Scope
- Add a backend admin question-asset upload endpoint for question images and solution assets.
- Store uploaded assets in the canonical versioned question-assets bucket structure.
- Return managed asset metadata suitable for immediate preview and later question-document linking.
- Tighten the question bulk-upload bridge so image fields accept only canonical managed asset paths or CDN URLs that normalize to those managed paths.
- Update route/API matrix truth and milestone-control docs for the question image workflow.

## Out of Scope
- ZIP/XLSX workbook parsing.
- Admin question-bank UI wiring.
- Student dashboard/test live-result APIs.

## Allowed Files / Modules
- `functions/src/api/adminQuestionAssets.ts`
- `functions/src/api/adminQuestionsBulk.ts`
- `functions/src/services/questionAssetUpload.ts`
- `functions/src/services/questionBulkUpload.ts`
- `functions/src/types/questionAssetUpload.ts`
- `functions/src/types/questionBulkUpload.ts`
- `functions/src/tests/adminQuestionAssetsApi.test.ts`
- `functions/src/tests/adminQuestionsBulkApi.test.ts`
- `functions/src/tests/questionAssetUpload.test.ts`
- `functions/src/tests/questionBulkUpload.test.ts`
- `functions/src/index.ts`
- `docs/ROUTE_API_MATRIX.md`
- `docs/MISSING_ITEMS_CHECKLIST.md`
- `docs/MASTER_STATUS.md`
- `docs/MILESTONE_TEMPLATE.md`
- `docs/CHANGELOG_MILESTONE_M4.md`

## API Contracts Affected
- New backend contract: `POST /admin/questions/assets`.
- `POST /admin/questions/bulk` now requires managed asset paths for image fields when image references are supplied.

## Data Model Impact
- Writes binary question assets into the managed question-assets bucket under `/{instituteId}/questions/{questionId}/v{version}/...`.
- Persists canonical managed asset paths into question documents through the existing question bulk-upload bridge.

## Tests Required (Gate)
- `cd functions && npm run build`
- `cd functions && node --test lib/tests/adminQuestionAssetsApi.test.js`
- `cd functions && node --test lib/tests/adminQuestionsBulkApi.test.js`
- `cd functions && node --test lib/tests/questionAssetUpload.test.js`
- `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/questionBulkUpload.test.js"`
- At least one end-to-end validation command/check for the question upload flow touched in this milestone.
- If any test requires elevated permission, request approval and run after approval; log this in milestone changelog.
- E2E check: validate commit-mode question upload against the Firestore emulator using managed asset paths, including question writes and downstream-ingestion-ready document shape.

## Definition Of Done
- [x] All in-scope code completed.
- [x] Route/API matrix updated.
- [x] Missing items checklist updated.
- [x] Required tests passed with recorded command outputs in milestone changelog.
- [x] If any required test did not run or failed, milestone remains `in_progress` and blocker is documented.
- [x] Milestone changelog created.

## Handoff Notes For Next Milestone
- M5 should focus on workbook/ZIP package ingestion or the next highest-priority question-bank gap once managed asset uploads are stable.
