# Portal Implementation Controller

Use this file as the single control prompt for implementing the four portal checklist documents without rewriting instructions each time.

## Goal

Drive implementation directly from the portal spec gap checklists and always work on the next highest-value unresolved slice automatically.

## Source Checklists

- `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
- `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Default Execution Order

1. `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
2. `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
3. `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
4. `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Automatic Selection Rule

When this controller is used:

1. Read all four checklist files.
2. Find unresolved items where status is `missing` or `partial`.
3. Pick work using this order:
   - highest priority first: `P0`, then `P1`, then `P2`
   - within the same priority, prefer the checklist's `Suggested Fix Order`
   - if still tied, use the `Default Execution Order` above
4. Implement a coherent vertical slice of `3-5` unresolved items from the same portal if possible.
5. If a portal has no remaining unresolved items at the current priority level, move to the next portal automatically.

## Working Rules

1. Inspect the existing codebase before editing and infer:
   - route mounting style
   - shared layout/component patterns
   - auth/guard behavior
   - API/data wiring style
   - mock versus live data conventions
2. Reuse existing components and architecture patterns instead of recreating them.
3. Prefer complete end-to-end slices over superficial placeholders.
4. Avoid unrelated refactors.
5. If backend support is missing, implement the maximum safe UI/workflow layer and mark the checklist item `partial` with a blocker note.
6. After changes, update the affected checklist item statuses and notes.

## Completion Rules For Each Run

For the chosen slice:

1. Implement the code.
2. Update the checklist markdown.
3. Run relevant validation/build/tests when available.
4. Report:
   - what was implemented
   - which checklist IDs changed
   - which unresolved `P0` or `P1` items remain
   - blockers or assumptions

## Minimal User Trigger

Use this exact message to start a run:

`Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and implement the next portal slice.`

## Optional Variants

To force a specific portal:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md.`

To force a specific priority:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do P0 items.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do the next 3 unresolved P1 items in the vendor portal.`
