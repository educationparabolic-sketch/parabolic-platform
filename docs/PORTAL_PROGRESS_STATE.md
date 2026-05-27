# Portal Progress State

This file is the persistent handoff state for portal checklist implementation across separate context windows.

## Current State

- `Current Target Portal`: `student`
- `Current Priority Band`: `P2`
- `Last Completed Checklist ID`: `STUDENT-WORKSPACE-ALIGNMENT`
- `Next Suggested Checklist ID`: `STP-DB-003`
- `Last Updated`: `2026-05-27`
- `Saved Scope Note`: Student workspace/design alignment completed before starting student P2. The student shell now uses an admin-aligned route workspace header across dedicated student routes, with route title/description, route path, summary-only data boundary, and role/layer-aware access context. The top Student Routes card was removed, and the student sidebar now mirrors the admin route shell treatment with brand header, route path chip, session/role/layer context, sign-out button, badge-style route links, and summary-only guidance while preserving student-facing tone. No student P2 checklist item was marked complete; continue with `STP-DB-003`.

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
