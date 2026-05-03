# Reusable Controller Prompt

Use this exact prompt at the start of each milestone context window.

---
Read `docs/MASTER_STATUS.md`, `docs/ROUTE_API_MATRIX.md`, `docs/MISSING_ITEMS_CHECKLIST.md`, and the latest `docs/CHANGELOG_MILESTONE_*.md` first.

Milestone selection:
1. If `<ID>` is explicitly provided, use it.
2. Otherwise, read `Next Milestone` from `docs/MASTER_STATUS.md` and use that value as `<ID>`.
3. If `Next Milestone` is missing, infer `<ID>` as: increment `Last Completed Milestone` by 1 (example: `M7` -> `M8`).
4. If both are missing, stop and ask to initialize milestone control fields in `docs/MASTER_STATUS.md`.

Execute only Milestone `<ID>` scope from `docs/MILESTONE_TEMPLATE.md`.
If milestone section fields are placeholders, auto-bootstrap them from the highest-priority `todo` item(s) in `docs/MISSING_ITEMS_CHECKLIST.md` and continue in the same run.

Rules:
1. Modify only milestone-allowed files/modules.
2. Keep `docs/ROUTE_API_MATRIX.md` in sync while coding.
3. Update `docs/MISSING_ITEMS_CHECKLIST.md` statuses for impacted IDs.
4. Do not start next milestone tasks.

Before finishing:
1. Update `docs/MASTER_STATUS.md` with progress + decisions.
   - Set `Last Completed Milestone` to `<ID>`.
   - Set `Next Milestone` to incremented ID.
2. Update `docs/ROUTE_API_MATRIX.md` with truth changes.
3. Create `docs/CHANGELOG_MILESTONE_<ID>.md` with:
- changed files
- APIs changed
- tests run
- residual risks
- next-step handoff

Completion gate:
- Run milestone-required tests.
- Run at least one end-to-end check for the flow touched by this milestone.
- If any required test needs elevated permission/sandbox escape, request approval and run it after approval.
- Record test commands and pass/fail status in `docs/CHANGELOG_MILESTONE_<ID>.md`.
- Record whether elevated permission was required and granted.
- If any required test fails or cannot run, do not mark milestone complete; keep status `in_progress` and document blockers + remaining work.
---
