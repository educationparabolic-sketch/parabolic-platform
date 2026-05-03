# Changelog Milestone M4

## Summary
Implemented the backend question image upload workflow behind `POST /admin/questions/assets` so admin-managed question and solution assets are stored in the canonical versioned question-assets bucket, returned with preview-safe signed URLs, and linked into question metadata through canonical managed asset paths only.

## Changed Files
- functions/src/api/adminQuestionAssets.ts
- functions/src/api/adminQuestionsBulk.ts
- functions/src/index.ts
- functions/src/services/questionAssetUpload.ts
- functions/src/services/questionBulkUpload.ts
- functions/src/tests/adminQuestionAssetsApi.test.ts
- functions/src/tests/adminQuestionsBulkApi.test.ts
- functions/src/tests/questionAssetUpload.test.ts
- functions/src/tests/questionBulkUpload.test.ts
- functions/src/types/questionAssetUpload.ts
- docs/MASTER_STATUS.md
- docs/MILESTONE_TEMPLATE.md
- docs/ROUTE_API_MATRIX.md
- docs/MISSING_ITEMS_CHECKLIST.md
- docs/CHANGELOG_MILESTONE_M4.md

## APIs Changed
- Added `POST /admin/questions/assets`.
- Endpoint accepts admin-authenticated question asset uploads with `assetKind`, `questionId`, `version`, `contentBase64`, and optional `extension`.
- `POST /admin/questions/bulk` now accepts image references only when they normalize to canonical managed question-asset paths for that question/version.

## Tests Run
- `cd functions && npm run build`
  - Status: PASS
- `cd functions && node --test lib/tests/adminQuestionAssetsApi.test.js`
  - Status: PASS
- `cd functions && node --test lib/tests/adminQuestionsBulkApi.test.js`
  - Status: PASS
- `cd functions && node --test lib/tests/questionAssetUpload.test.js`
  - Status: PASS
- `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/questionBulkUpload.test.js"`
  - Status: PASS
  - Notes: Serves as the required end-to-end regression check for question upload commit behavior after managed asset path enforcement was added.

## Elevated Permission
- Required: yes
- Granted: yes
- Commands requiring elevation:
  - `cd functions && firebase emulators:exec --only firestore "node --test lib/tests/questionBulkUpload.test.js"`
- Reason: Firestore emulator startup required localhost port binding that the sandbox blocks.

## Residual Risks
- The mounted `/admin/question-bank` page is still fixture-driven and does not yet call either `POST /admin/questions/assets` or `POST /admin/questions/bulk`.
- ZIP/XLSX workbook parsing, sample download generation, and package-level image-file matching are still separate follow-up work.
- The new asset endpoint uploads single managed assets, but there is not yet a higher-level package orchestration flow that batches workbook validation with asset presence checks.

## Next-Step Handoff
- Start `M5` with workbook/ZIP package ingestion so the Question Bank upload flow can validate `questions.xlsx`, image file references, and distribution preview in one run.
- When frontend scope opens, wire the admin Question Bank screen to upload assets first, then feed returned canonical asset paths into `POST /admin/questions/bulk`.
- Consider introducing backend policy for structural overwrite blocking on used questions so version enforcement moves from UI guidance into server-side guarantees.
