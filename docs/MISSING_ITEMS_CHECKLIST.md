# Missing Items Checklist

Use this file as the single execution checklist for portal completion.
Update status at end of every milestone.

Status values: `todo | in_progress | blocked | done`
Priority: `P0 | P1 | P2`

| ID | Item | Priority | Area | Status | Depends On | Done Criteria |
|---|---|---|---|---|---|---|
| MI-001 | Align admin route registry with mounted router | P0 | Frontend Routing | done | None | All route-registry pages either mounted or intentionally removed/hidden |
| MI-002 | Implement student ingestion API (validate + commit) | P0 | Backend API | done | MI-001 | Upload file accepted, validated, committed with row-level errors |
| MI-003 | Implement admin question upload bridge (file/parse/write) | P0 | Fullstack | done | MI-001 | Admin upload writes question docs and triggers ingestion |
| MI-004 | Implement question image upload workflow | P1 | Fullstack | done | MI-003 | Images uploaded + URLs linked in question docs |
| MI-005 | Wire missing student-facing live result APIs | P0 | Backend API | todo | Session submit pipeline | `/student/dashboard` and `/student/tests` return live data |
| MI-006 | Wire missing admin analytics APIs for dynamic routes | P1 | Backend API | todo | MI-001 | `/admin/analytics/run/:runId` and `/student/:studentId` data available |
| MI-007 | Mount missing high-priority admin routes in UI | P1 | Frontend Routing | todo | Related backend API ready | Mounted pages render and pass route guard checks |
| MI-008 | Remove fixture-only masking in production-like mode | P1 | Frontend Data | todo | MI-002, MI-003, MI-005 | Live API paths default on configured environments |
| MI-009 | End-to-end local workflow test automation | P0 | QA/Automation | todo | MI-002, MI-003, MI-005 | Script validates full loop: ingest -> assign -> exam -> results |
| MI-010 | Premium UI pass after functional stability | P2 | Frontend UX | todo | P0/P1 flow stability | Final design polish across core pages with consistent design system |

## Milestone Update Log
- Update format:
  - Date:
  - Milestone:
  - IDs changed:
  - Notes:

- Date: 2026-05-03
- Milestone: M0
- IDs changed: Baseline file created
- Notes: Initial backlog captured from current repo audit.

- Date: 2026-05-03
- Milestone: M1
- IDs changed: MI-001
- Notes: Admin registry-only student/test/assignment/analytics/governance/settings/licensing paths now resolve through explicit mounted-page redirects or admin not-found handling instead of blank outlet states.

- Date: 2026-05-03
- Milestone: M2
- IDs changed: MI-002
- Notes: Added `POST /admin/students/bulk` with validate-only and commit modes, CSV-or-JSON intake, row-level duplicate/conflict reporting, student auth provisioning, and roster-sync deactivation support backed by emulator coverage.

- Date: 2026-05-03
- Milestone: M3
- IDs changed: MI-003
- Notes: Added `POST /admin/questions/bulk` with validate-only and commit modes, CSV-or-JSON intake, derived-question-id fallback, immutable `questionUploadLogs`, and emulator-backed verification that uploaded question docs are ready for downstream ingestion.

- Date: 2026-05-03
- Milestone: M4
- IDs changed: MI-004
- Notes: Added `POST /admin/questions/assets` for managed question and solution asset uploads into the versioned question-assets bucket, returned preview-safe signed URLs plus canonical asset paths, and hardened `POST /admin/questions/bulk` so image fields accept only those managed asset paths or equivalent CDN URLs.
