# Portal Progress State

This file is the persistent handoff state for portal checklist implementation across separate context windows.

## Current State

- `Current Target Portal`: `admin`
- `Current Priority Band`: `P1`
- `Last Completed Checklist ID`: `GBL-004`
- `Next Suggested Checklist ID`: `STU-012`
- `Last Updated`: `2026-05-19`
- `Saved Scope Note`: `GBL-004` is complete enough for admin P0 after verifying secured `GET /admin/students` and secured `POST /admin/runs` coverage, enriching the live student roster/profile payload with rolling summary history, risk/discipline/guess trends, per-student override summaries, and last-active data for `/admin/students/:studentId`, and removing production fallback from that deep profile route to deterministic fixtures when live reads fail. The next checkpoint moves to admin P1 at `STU-012`; deterministic local fallbacks or deeper summary-source parity should not reopen `GBL-004` unless they mask missing production backend coverage.

## Active Checklist Set

- `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
- `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Selection Policy

- If `Current Target Portal` is `auto`, choose according to `docs/PORTAL_IMPLEMENTATION_CONTROLLER.md`.
- If `Current Priority Band` is set, prefer unresolved items from that priority first.
- If an unresolved `P0` item exists, it takes precedence over any saved `P1` or `P2` suggestion from an older checkpoint.
- If `Next Suggested Checklist ID` is not `auto`, try that item first if it is still unresolved and still valid.
- If the suggested item is already completed or no longer valid, recompute from the controller rules and update this file.

## Detailed Source Policy

- Before implementing a checklist item, read the matching detailed source file.
- For student, exam, and vendor portals, use the single file in the corresponding `*_portal_detailed` folder.
- For admin portal items, use the section-specific file in `docs/admin_portal_detailed/`.

## Update Rules

After every run:

1. Set `Last Completed Checklist ID` to the item just worked on.
2. Set `Last Updated` to the current date.
3. Recompute `Next Suggested Checklist ID`.
4. If the current portal has no more unresolved items in the active priority band:
   - advance to the next portal or next priority according to the controller
   - update `Current Target Portal` and `Current Priority Band`
5. If the user explicitly restricts scope in a prompt, reflect that here for the next handoff.
6. If a saved checklist ID uses a legacy naming scheme and no longer exists in the active checklist, treat it as stale, recompute from the controller, and save the new canonical ID.

## Fresh Session Bootstrap

At the start of a new context window:

1. Read this file first.
2. Read `docs/PORTAL_IMPLEMENTATION_CONTROLLER.md`.
3. Read the relevant checklist files needed to confirm the current state.
4. Read the corresponding detailed source file for the selected portal/section.
5. Implement exactly one next item.
6. Update both the checklist and this file.
7. Stop and ask the user whether to continue.

## Recommended Starter Prompt

`Read docs/PORTAL_PROGRESS_STATE.md and docs/PORTAL_IMPLEMENTATION_CONTROLLER.md, continue from the recorded state, implement exactly one next item, update both files, then stop and ask me to continue.`
