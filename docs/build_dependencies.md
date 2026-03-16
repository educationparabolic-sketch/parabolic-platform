# BUILD DEPENDENCY MAP

This document defines the dependency relationships between platform builds.

The purpose of this document is to ensure that AI coding agents generate modules only after their required subsystems have been implemented.

Each phase depends on the successful completion of earlier phases.

AI agents must always verify dependencies before implementing a build.

---

# DEPENDENCY RULES

1. Builds must be executed strictly in numerical order.
2. Each build assumes all previous builds exist and are stable.
3. If a build requires a subsystem from another phase, that dependency must already exist.
4. AI agents must never generate modules that depend on non-existent builds.

---

# PHASE DEPENDENCY MAP

Phase | Build Range | Depends On
---|---|---
Phase 1 — Platform Foundation | 1–5 | None
Phase 2 — Audit & Governance Core | 6–10 | Phase 1
Phase 3 — Content Domain | 11–15 | Phase 1
Phase 4 — Template Domain | 16–20 | Phase 3
Phase 5 — Assignment Domain | 21–25 | Phase 4
Phase 6 — Session Execution Engine | 26–30 | Phase 5
Phase 7 — Timing Engine | 31–35 | Phase 6
Phase 8 — Submission Engine | 36–40 | Phase 6, Phase 7
Phase 9 — Analytics Engine | 41–45 | Phase 8
Phase 10 — Insights Engine | 46–50 | Phase 9
Phase 11 — Search Architecture | 51–55 | Phase 3
Phase 12 — Firestore Index Strategy | 56–60 | Phase 3
Phase 13 — Middleware Security Layer | 61–65 | Phase 1
Phase 14 — Routing & Portal Architecture | 66–70 | Phase 13
Phase 15 — CDN & Asset Delivery | 71–75 | Phase 1
Phase 16 — Synthetic Simulation Engine | 76–80 | Phase 9
Phase 17 — Vendor Intelligence Layer | 81–85 | Phase 9
Phase 18 — Governance Snapshot System | 86–90 | Phase 9
Phase 19 — Billing & License Intelligence | 91–95 | Phase 13
Phase 20 — Calibration System | 96–100 | Phase 9
Phase 21 — Archive & Data Lifecycle | 101–105 | Phase 9
Phase 22 — Unified Event Topology | 106–110 | All previous backend phases

---

# FRONTEND PHASE DEPENDENCIES

Frontend systems depend heavily on backend APIs being available.

Phase | Build Range | Depends On
---|---|---
Phase 23 — Frontend Platform Foundation | 111–115 | Phase 22
Phase 24 — Admin Portal Core | 116–120 | Phase 23
Phase 25 — Admin Analytics & Governance | 121–125 | Phase 24, Phase 9
Phase 26 — Student Portal Core | 126–130 | Phase 23, Phase 9
Phase 27 — Exam Portal Engine | 131–135 | Phase 6, Phase 7, Phase 8
Phase 28 — Vendor Portal | 136–140 | Phase 17, Phase 19, Phase 20
Phase 29 — Frontend Performance Optimization | 141–145 | Phase 23
Phase 30 — Final Frontend Integration | 146–150 | All previous frontend phases

---

# CRITICAL SYSTEM DEPENDENCIES

Some subsystems form the backbone of the entire platform.

These systems must exist before many other modules can operate.

Core System | Implemented In
---|---
Firebase Infrastructure | Phase 1
Audit Logging | Phase 2
Question Content Domain | Phase 3
Template Engine | Phase 4
Assignment Engine | Phase 5
Session Execution Engine | Phase 6
Timing Engine | Phase 7
Submission Engine | Phase 8
Analytics Engine | Phase 9
Security Middleware | Phase 13
Billing & License System | Phase 19
Calibration Engine | Phase 20
Event Topology | Phase 22

---

# HIGH-RISK DEPENDENCIES

The following subsystems are particularly sensitive to build order:

Subsystem | Required Before
---|---
Session Execution Engine | Exam Portal
Analytics Engine | Insights Engine
Security Middleware | All API endpoints
Billing System | Vendor Portal
Calibration Engine | Risk Analytics
Event Topology | Full system orchestration

AI agents must ensure these dependencies exist before generating code.

---

# SAFE BUILD EXECUTION STRATEGY

To avoid architecture drift:

1. Always start from the **next pending build** in `build_log.md`.
2. Verify the build's **phase dependency** in this document.
3. Confirm required subsystems already exist.
4. Implement the build as defined in `build_plan.md`.
5. Update `build_log.md` after completion.

---

# AI EXECUTION NOTICE

Before implementing any build, AI agents must read:

1. `build_plan.md`
2. `build_dependencies.md`
3. `build_log.md`
4. `architecture_rules.md`

Failure to follow build dependencies may result in incompatible system modules.