# Portal Progress State

This file is the persistent handoff state for portal checklist implementation across separate context windows.

## Current State

- `Current Target Portal`: `admin`
- `Current Priority Band`: `P1`
- `Last Completed Checklist ID`: `INS-005`
- `Next Suggested Checklist ID`: `INS-006`
- `Last Updated`: `2026-05-23`
- `Saved Scope Note`: `INS-005` is complete after tightening `/admin/insights/student/:studentId` into the L1 diagnostic student view from `studentYearMetrics` plus rolling-window summaries: Rushed Pattern, Easy Neglect, Hard Bias, Topic Weakness, and Time Misallocation behavior cards now include source fields and no risk-state label, the page states the last-5-runs-or-last-30-days rolling model, and execution-only trendlines/risk state are kept behind L2 access. Continue admin Insights P1 with `INS-006`.

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
