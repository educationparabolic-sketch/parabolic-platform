# Route API Matrix

Legend:
- Mounted UI: `yes/no`
- Backend API Ready: `yes/partial/no`
- Data Ready: `yes/partial/no`
- Test Ready: `yes/partial/no`

| Route | Mounted UI | Backend API Ready | Data Ready | Test Ready | Notes |
|---|---|---|---|---|---|
| /admin/overview | yes | partial | partial | partial | Uses fixtures in local mode in some flows |
| /admin/students | yes | partial | partial | partial | List UI exists; backend now includes `POST /admin/students/bulk` ingestion, but `GET /admin/students` still falls back in local mode and detail flows remain unbuilt |
| /admin/students/bulk-upload | yes | yes | partial | partial | Direct URL still redirects to `/admin/students`; backend bulk-ingestion API now validates/commits JSON or CSV roster uploads with row-level errors, but no dedicated upload page exists yet |
| /admin/question-bank | yes | yes | partial | partial | Backend now includes `POST /admin/questions/assets` for managed question/solution asset uploads and `POST /admin/questions/bulk` now accepts only canonical managed asset paths; mounted page is still fixture-backed and not wired to the APIs |
| /admin/tests | yes | partial | partial | partial | Registry-only create/detail analytics subroutes now redirect here until dedicated pages ship |
| /admin/assignments | yes | partial | partial | partial | Registry-only create/live subroutes now redirect here until dedicated pages ship |
| /admin/analytics | yes | partial | partial | partial | Summary dashboard mounted; registry-only overview/run/student/template/trend paths now redirect here |
| /admin/analytics/run/:runId | yes | no | no | partial | Direct URL now redirects to `/admin/analytics`; dedicated run analytics API/page still missing |
| /admin/analytics/student/:studentId | yes | no | no | partial | Direct URL now redirects to `/admin/analytics`; dedicated student analytics API/page still missing |
| /admin/insights/interventions | yes | yes | partial | partial | Backed by adminInterventions API |
| /admin/governance | yes | partial | partial | partial | Subroutes not mounted |
| /student/dashboard | yes | partial | partial | partial | Frontend expects API; fallback mode exists |
| /student/my-tests | yes | partial | partial | partial | Frontend expects API; fallback mode exists |
| /session/:sessionId | yes | yes | yes | partial | Submit pipeline + triggers exist |

## Update Rule (Mandatory Each Milestone)
1. Update rows impacted by the milestone.
2. Add/remove rows only when routes are created/removed.
3. Keep notes concrete (what changed, what still blocks ready state).
