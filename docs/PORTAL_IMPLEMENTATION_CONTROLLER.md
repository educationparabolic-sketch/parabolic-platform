# Portal Implementation Controller

Use this file as the single control prompt for implementing the four portal checklist documents without rewriting instructions each time.

This controller is designed to work across separate context windows. If a fresh session reads this file together with `docs/PORTAL_PROGRESS_STATE.md`, it must resume from the next valid unresolved item automatically.

Persistent run state is stored in:

- `docs/PORTAL_PROGRESS_STATE.md`

## Goal

Drive implementation directly from the portal spec gap checklists and always work on the next highest-value unresolved slice automatically.

## Source Checklists

- `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
- `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Detailed Spec Sources

Before implementing any checklist item, read the corresponding detailed source file and treat it as the implementation source of truth.

Detailed source mapping:

- `docs/student_portal_detailed/`
  - one file for the full student portal
  - use that file for any item from `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/exam_portal_detailed/`
  - one file for the full exam portal
  - use that file for any item from `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/vendor_portal_detailed/`
  - one file for the full vendor portal
  - use that file for any item from `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/admin_portal_detailed/`
  - multiple files, one per admin section
  - for any item from `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`, read the section-matching file first
  - examples:
    - Overview items -> overview file
    - Students items -> students file
    - Question Bank items -> question bank file
    - Tests items -> tests file

## Default Execution Order

1. `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
2. `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
3. `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
4. `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Automatic Selection Rule

When this controller is used:

1. Read `docs/PORTAL_PROGRESS_STATE.md` first.
2. Read all four checklist files, or at minimum the files needed to validate the current recorded state.
3. Find unresolved items where status is `missing` or `partial`.
4. If `Next Suggested Checklist ID` in `docs/PORTAL_PROGRESS_STATE.md` is still unresolved and still matches current scope restrictions, use it.
5. Otherwise recompute the next item using this order:
   - highest priority first: `P0`, then `P1`, then `P2`
   - within the same priority, prefer the checklist's `Suggested Fix Order`
   - if still tied, use the `Default Execution Order` above
6. Select exactly `1` unresolved checklist item for the run.
7. If a portal has no remaining unresolved items at the current priority level, move to the next portal automatically.

## Stepwise Approval Mode

This controller runs in checkpoint mode by default.

For each run:

1. Pick exactly one checklist item using the automatic selection rule.
2. Implement only that one item.
3. Update the checklist status and note.
4. Update `docs/PORTAL_PROGRESS_STATE.md` with:
   - `Last Completed Checklist ID`
   - `Next Suggested Checklist ID`
   - `Current Target Portal`
   - `Current Priority Band`
   - `Last Updated`
5. Summarize what changed.
6. Stop and wait for user confirmation before starting the next item.

The next item must not start automatically.

Accepted continue messages:

- `continue`
- `next`
- `do the next step`
- `continue with P0`
- `continue with student portal`

## Working Rules

1. Before implementation, identify the selected checklist item's portal and section, then read the corresponding detailed source file from the appropriate `*_portal_detailed` folder.
2. Treat the detailed source as the implementation source of truth for that item.
3. If the checklist is high-level and the detailed source is more specific, implement according to the detailed source and then update the checklist note if needed.
4. Inspect the existing codebase before editing and infer:
   - route mounting style
   - shared layout/component patterns
   - auth/guard behavior
   - API/data wiring style
   - mock versus live data conventions
5. Reuse existing components and architecture patterns instead of recreating them.
6. Prefer complete end-to-end implementation for the single selected item over superficial placeholders.
7. Avoid unrelated refactors.
8. If backend support is missing, implement the maximum safe UI/workflow layer and mark the checklist item `partial` with a blocker note.
9. After changes, update the affected checklist item statuses and notes.

## Completion Rules For Each Run

For the chosen item:

1. Implement the code.
2. Update the checklist markdown.
3. Update `docs/PORTAL_PROGRESS_STATE.md`.
4. Run relevant validation/build/tests when available and relevant to the changed area.
5. If an important test or verification command fails because of sandbox or requires access outside sandbox:
   - request permission
   - after approval, rerun the command with escalation
   - include the command outcome in the report
6. Do not mark the item fully complete if required verification fails or cannot be run.
7. Report:
   - what was implemented
   - which checklist ID changed
   - which tests/build/verifications were run
   - whether escalation permission was needed
   - which unresolved `P0` or `P1` items remain
   - blockers or assumptions

## Test And Verification Policy

After each item implementation:

1. Run the narrowest relevant checks first.
2. Prefer route- or app-specific validation before broad repo-wide commands when appropriate.
3. If no precise test exists, run the closest meaningful build/typecheck/lint verification for the touched area.
4. If verification requires elevated permission or outside-sandbox execution, explicitly ask for approval through the command approval flow before rerunning.
5. Record whether verification:
   - passed
   - failed
   - could not run

Examples of acceptable verification depending on the change:

- app-specific build
- typecheck
- lint
- targeted test suite
- relevant end-to-end or integration check

## Minimal User Trigger

Use this exact message to start a run:

`Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and implement the next portal slice.`

For strict checkpoint mode, preferred trigger:

`Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and implement exactly one next item, then stop and ask me to continue.`

For a fresh context window, preferred trigger:

`Read docs/PORTAL_PROGRESS_STATE.md and docs/PORTAL_IMPLEMENTATION_CONTROLLER.md, continue from the recorded state, implement exactly one next item, update both files, then stop and ask me to continue.`

The same trigger should work in any future context window and must resume from the next valid unresolved item based on the saved state plus current checklist contents.

## Optional Variants

To force a specific portal:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md.`

To force a specific priority:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do P0 items.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do the next unresolved P1 item in the vendor portal.`
