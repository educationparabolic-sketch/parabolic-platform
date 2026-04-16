Correction Mode — Single Build Only

Build:
- Build <NUMBER> — <TITLE>
Repo:
- /home/sumeer/parabolic-platform

Source of truth (working tree, including uncommitted changes):
1) docs/build_plan.md
2) docs/2_Portals_Architecture.md
3) docs/build_dependencies.md

Startup checklist:
1) Check git status.
2) Read Build <NUMBER> block from build_plan.md.
3) Read mapped architecture sections from 2_Portals_Architecture.md.
4) If mapping is ambiguous, choose best match and state rationale.
5) Validate dependencies from build_dependencies.md.

Execution rules:
- Correct/refactor existing implementation to match current plan exactly.
- Implement only this build; no future-build features.
- Prefer minimal diffs; avoid unnecessary rewrites.
- Reuse existing modules/patterns; avoid duplicates.
- If plan conflicts with existing code, plan wins.
- Enforce referenced constraints (security, RBAC, data flow, performance, HOT/WARM/COLD, normalization, structural guarantees).
- Preserve backward compatibility unless architecture requires break.
- If already compliant, make no functional changes and provide evidence.

Testing (mandatory before commit):
- Run relevant: lint, typecheck, tests, production build (affected scope).
- Frontend builds: verify affected routes at:
  - Desktop 1366x768
  - Mobile 390x844
  - Check responsive behavior, route guards, console errors, network/API failures.
- If blocked by sandbox, request escalation.
- Do not commit until required checks pass.

Commit rules:
- If verdict is COMPLIANT, do not commit; return evidence-only report.
- If changes are needed: one build = one commit.
- No unrelated changes.
- Commit message exactly:
  Build <NUMBER> — <TITLE> rebuilt

If blocked:
- No partial commit.
- Report blocker, impact, and minimal unblock options.

Final response format:
1) Build implemented
2) Build-plan summary
3) Architecture sections used (+ mapping rationale if fallback)
4) Dependency check result
5) Requirement checklist (PASS/FAIL with evidence)
6) Files/elements changed
7) Tests run + results (exact commands)
8) Frontend verification matrix (if applicable)
9) Self-review (regression/security/performance)
10) Verdict: COMPLIANT / PARTIAL / NOT COMPLIANT
11) Gaps + minimal fix list (if not compliant)
12) Commit hash + message (if committed)
13) Carry-forward notes
14) Correction delta (before vs after, and what remained unchanged)
