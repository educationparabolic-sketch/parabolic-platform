# Shared Capability Policy

This document explains the canonical role, license-layer, and institute feature-flag matrix defined in `shared/contracts/capabilityPolicy.ts`.

The code-level `CAPABILITY_MATRIX` is authoritative. Frontend visibility and backend authorization must eventually consume the same capability entries; BWM-008's later substeps own that enforcement work.

## Decision Rules

Access to a capability requires every declared axis to pass:

1. the authenticated role is listed in `allowedRoles`;
2. the current license meets `minimumLicenseLayer`, including any stricter `roleMinimumLicenseLayers` override; and
3. every `requiredFeatureFlags` value is exactly `true` in the authoritative institute license.

Missing roles, layers, or required flags fail closed. A sufficient layer never bypasses a disabled required flag. Eligibility flags describe upgrade readiness and never grant runtime access. Vendor capabilities are global and therefore have no institute license minimum. Director is a valid institute role only at L3, so every capability granted to Director has an effective L3 minimum.

This matrix assumes an authenticated, active, non-suspended identity. The shared Functions authentication middleware rejects a verified token whose `isSuspended` claim is truthy before attaching identity/request data or invoking downstream middleware. Later BWM-008 substeps bind route visibility, handlers, tenant targeting, and broader negative tests to this policy.

## Portal and Admin Capabilities

| Capability | Allowed roles | Minimum layer | Role override | Required feature flags |
|---|---|---|---|---|
| `portal.admin.access` | teacher, admin, director | L0 | director: L3 | - |
| `portal.student.access` | student | L0 | - | - |
| `portal.exam.access` | student | L0 | - | - |
| `portal.vendor.access` | vendor | N/A | - | - |
| `admin.overview.read` | teacher, admin, director | L0 | director: L3 | - |
| `admin.students.read` | teacher, admin | L0 | - | - |
| `admin.students.manage` | admin | L0 | - | - |
| `admin.question_bank.read` | teacher, admin | L0 | - | - |
| `admin.question_bank.manage` | teacher, admin | L0 | - | - |
| `admin.tests.read` | teacher, admin | L0 | - | - |
| `admin.tests.manage` | teacher, admin | L0 | - | - |
| `admin.assignments.read` | teacher, admin | L0 | - | - |
| `admin.assignments.manage` | teacher, admin | L0 | - | - |
| `admin.analytics.read` | teacher, admin, director | L0 | director: L3 | - |
| `admin.analytics.advanced` | teacher, admin, director | L2 | director: L3 | - |
| `admin.insights.read` | teacher, admin, director | L1 | director: L3 | riskOverview |
| `admin.interventions.manage` | teacher, admin | L1 | - | riskOverview |
| `admin.governance.read` | director | L3 | - | governanceAccess |
| `admin.governance.export` | director | L3 | - | governanceAccess |
| `admin.settings.read` | admin, director | L0 | director: L3 | - |
| `admin.settings.manage` | admin | L0 | - | - |
| `admin.license.read` | admin, director | L0 | director: L3 | - |
| `admin.license.upgrade_request` | admin | L0 | - | - |
| `admin.support.manage` | teacher, admin, director | L0 | director: L3 | - |
| `admin.mode.controlled.configure` | teacher, admin | L2 | - | controlledMode |
| `admin.mode.adaptive.configure` | teacher, admin | L2 | - | adaptivePhase |
| `admin.mode.hard.configure` | teacher, admin | L2 | - | hardMode |

Read and manage capabilities are deliberately separate. Director may read only the explicitly granted Admin summaries, settings/license views, and governance surfaces; Director never inherits teacher/admin mutation capabilities. Teacher question/test/assignment management grants record the architecture policy even where current handlers are narrower—the later route/handler-alignment substep must resolve those existing mismatches against this matrix.

## Student and Exam Capabilities

| Capability | Allowed roles | Minimum layer | Required feature flags |
|---|---|---|---|
| `student.dashboard.read` | student | L0 | - |
| `student.assignments.read` | student | L0 | - |
| `student.analytics.read` | student | L0 | - |
| `student.analytics.advanced` | student | L2 | - |
| `student.insights.read` | student | L1 | riskOverview |
| `student.discipline.read` | student | L2 | - |
| `student.profile.manage_own` | student | L0 | - |
| `student.solutions.read_current_year` | student | L0 | - |
| `exam.session.start` | student | L0 | - |
| `exam.session.answer` | student | L0 | - |
| `exam.session.submit` | student | L0 | - |
| `exam.mode.controlled.execute` | student | L2 | controlledMode |
| `exam.mode.adaptive.execute` | student | L2 | adaptivePhase |
| `exam.mode.hard.execute` | student | L2 | hardMode |

Student capabilities never grant access to another student's data. Session ownership and institute matching remain mandatory server-side checks and are handled by BWM-008's tenant-boundary substep.

## Vendor Capabilities

| Capability | Allowed roles | Minimum layer | Required feature flags |
|---|---|---|---|
| `vendor.overview.read` | vendor | N/A | - |
| `vendor.institutes.read` | vendor | N/A | - |
| `vendor.institutes.manage_lifecycle` | vendor | N/A | - |
| `vendor.licenses.manage` | vendor | N/A | - |
| `vendor.calibration.manage` | vendor | N/A | - |
| `vendor.intelligence.read` | vendor | N/A | - |
| `vendor.system_health.read` | vendor | N/A | - |
| `vendor.audit.read` | vendor | N/A | - |

Vendor capabilities are global control-plane permissions. They do not grant direct mutation of institute academic records, student documents, or exam sessions.

## License Feature Defaults

| Feature flag | Earliest layer | Capabilities |
|---|---|---|
| `riskOverview` | L1 | Admin/Student insights and Admin interventions |
| `controlledMode` | L2 | Assignment configuration and Exam execution |
| `adaptivePhase` | L2 | Assignment configuration and Exam execution |
| `hardMode` | L2 | Assignment configuration and Exam execution |
| `governanceAccess` | L3 | Director governance read/export |

These are minimum eligibility floors, not automatic grants. The corresponding flag must also be enabled by the authoritative license object.
