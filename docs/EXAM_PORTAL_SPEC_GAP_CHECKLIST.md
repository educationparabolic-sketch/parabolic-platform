# Exam Portal Spec Gap Checklist

Purpose: track exam portal implementation gaps against the reviewed execution-engine specification.

Detailed implementation requirements for this checklist live in the corresponding `*_portal_detailed` source file(s) and should be read before implementing any item.

Status values:
- `completed` = implemented closely enough to the reviewed spec
- `partial` = exists but thinner, simulated, not fully server-backed, or only partly aligned
- `missing` = not implemented

Priority guide:
- `P0` = structural blocker or core execution/security gap
- `P1` = important portal-completeness or enforcement gap
- `P2` = secondary polish, realism, or proof-of-contract gap

## Global

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-GLB-001 | Global | Separate isolated exam app/build | completed | P0 | `apps/exam` exists as separate frontend |
| EXP-GLB-002 | Global | Session route shape `/session/{sessionId}?token=...` | completed | P0 | Implemented |
| EXP-GLB-003 | Global | Signed short-lived token required before load | completed | P0 | Token validation gate exists |
| EXP-GLB-004 | Global | No analytics queries in exam runtime | completed | P1 | Runtime focuses on session execution only |
| EXP-GLB-005 | Global | JEE-style execution layout and palette structure | completed | P1 | Strongly implemented structurally |
| EXP-GLB-006 | Global | 99% JEE-style mimic quality target | partial | P2 | Strong structural resemblance, exact mimic target is subjective |

## Entry Flow

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-ENT-001 | Entry | Student start flow launches exam runtime with signed token | completed | P0 | Implemented through start flow and redirect |
| EXP-ENT-002 | Entry | Session token validated server-side before load | partial | P0 | Client validates token shape/expiry; full server-side pre-render proof is indirect |
| EXP-ENT-003 | Entry | No parallel active session guard | completed | P0 | Browser/session guard exists |
| EXP-ENT-004 | Entry | Session snapshot carries template/phase/timing/mode/license flags | partial | P1 | Runtime snapshot model contains these concepts; current build is still partly mocked/runtime-constructed |
| EXP-ENT-005 | Entry | Token refresh flow | completed | P1 | Implemented |

## Instructions Screen

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-INS-001 | Instructions | Mandatory instruction screen before test loads | completed | P0 | Implemented |
| EXP-INS-002 | Instructions | General Instructions section | completed | P1 | Implemented |
| EXP-INS-003 | Instructions | Marking Scheme section | completed | P1 | Implemented |
| EXP-INS-004 | Instructions | Question Palette Explanation section | completed | P1 | Implemented |
| EXP-INS-005 | Instructions | Navigation Instructions section | completed | P1 | Implemented |
| EXP-INS-006 | Instructions | Mode-Specific Instructions section | completed | P1 | Implemented |
| EXP-INS-007 | Instructions | Declaration checkbox gates Start Test button | completed | P0 | Implemented |
| EXP-INS-008 | Instructions | Exact JEE-style instructional structure and realism | partial | P2 | Strongly aligned structurally, but exact production polish may still differ |

## Main Interface

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-UI-001 | Main UI | Header + left palette + question area + footer controls structure | completed | P0 | Implemented |
| EXP-UI-002 | Main UI | Candidate name display | missing | P2 | Not clearly surfaced in current header |
| EXP-UI-003 | Main UI | Subject tabs in header | completed | P1 | Implemented |
| EXP-UI-004 | Main UI | Question count display | completed | P1 | Implemented |
| EXP-UI-005 | Main UI | Global timer top-right with red final-window behavior | completed | P0 | Implemented |
| EXP-UI-006 | Main UI | Phase indicator in header for L1+ | completed | P1 | Implemented |
| EXP-UI-007 | Main UI | Calculator button in header | completed | P1 | Implemented |

## Palette & Navigation

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-PAL-001 | Palette | Left vertical question palette | completed | P0 | Implemented |
| EXP-PAL-002 | Palette | JEE-style status colors: not visited / not answered / answered / marked / answered+marked | completed | P0 | Implemented |
| EXP-PAL-003 | Palette | Click numbered tile to jump | completed | P1 | Implemented |
| EXP-PAL-004 | Palette | Section tabs above palette | completed | P1 | Implemented |
| EXP-PAL-005 | Palette | Hard-mode revisit/locking behavior integrated with palette | completed | P1 | Implemented |

## Question Area

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-QA-001 | Question Area | Question image rendering | completed | P1 | Implemented |
| EXP-QA-002 | Question Area | Answer options for MCQ / Numeric / Matrix | completed | P0 | Implemented |
| EXP-QA-003 | Question Area | Clear Response button | completed | P1 | Implemented |
| EXP-QA-004 | Question Area | Mark for Review control | completed | P1 | Implemented |
| EXP-QA-005 | Question Area | Save & Next | completed | P0 | Implemented |
| EXP-QA-006 | Question Area | Previous | completed | P1 | Implemented |
| EXP-QA-007 | Question Area | Preload next question image | partial | P2 | Not clearly proven from current review |
| EXP-QA-008 | Question Area | Max 1 read per question load | partial | P2 | Runtime intent exists, but exact backend read pattern is not proven from frontend alone |

## Calculator

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-CAL-001 | Calculator | Built-in scientific calculator modal | completed | P0 | Implemented |
| EXP-CAL-002 | Calculator | Arithmetic operations | completed | P1 | Implemented |
| EXP-CAL-003 | Calculator | Scientific functions: sqrt, square, cbrt, cube, log, ln, sin, cos, tan, pi, e | completed | P1 | Implemented |
| EXP-CAL-004 | Calculator | Client-side only, no backend persistence/history | completed | P1 | Implemented |
| EXP-CAL-005 | Calculator | JEE-style visual treatment | partial | P2 | Structurally aligned, exact mimic quality is subjective |

## Layer Behavior Engine

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-LAY-001 | Behavior Engine | L0 free navigation and submit-anytime baseline | completed | P0 | Implemented |
| EXP-LAY-002 | Behavior Engine | L1 diagnostic advisory layer | partial | P1 | Some advisory behavior exists, full planned advisory set is incomplete |
| EXP-LAY-003 | Behavior Engine | L2 controlled mode enforcement | completed | P0 | Strongly implemented |
| EXP-LAY-004 | Behavior Engine | Hard Mode strict enforcement | partial | P1 | Major restrictions exist, but full spec parity is incomplete |
| EXP-LAY-005 | Behavior Engine | L1 easy remaining reminder | missing | P1 | Not clearly implemented |
| EXP-LAY-006 | Behavior Engine | L1 rapid answering advisory | partial | P1 | Some advisory structure exists, exact behavior unclear |
| EXP-LAY-007 | Behavior Engine | L1 submit warning if <50% attempted | missing | P1 | Current submit warnings are more discipline/unanswered based |
| EXP-LAY-008 | Behavior Engine | L2 min-time enforcement with countdown and blocked Save & Next | completed | P0 | Implemented |
| EXP-LAY-009 | Behavior Engine | L2 consecutive-wrong slowdown | completed | P1 | Implemented |
| EXP-LAY-010 | Behavior Engine | L2 overstay advisory | partial | P1 | Related signals exist, explicit advisory treatment is less clear |
| EXP-LAY-011 | Behavior Engine | L2 early submit confirmation based on provisional discipline | completed | P1 | Implemented |
| EXP-LAY-012 | Behavior Engine | Hard Mode max-time enforcement and auto-lock | completed | P1 | Implemented |
| EXP-LAY-013 | Behavior Engine | Hard Mode sequential navigation restriction | completed | P1 | Implemented |
| EXP-LAY-014 | Behavior Engine | Hard Mode no revisiting | completed | P1 | Implemented |
| EXP-LAY-015 | Behavior Engine | Hard Mode no advisory banners / minimal distractions | partial | P2 | Hard mode is stricter, but full visual simplification is not clearly distinct |

## Adaptive Phase Engine

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-PHS-001 | Phase Engine | Phase snapshot loaded at session start | completed | P1 | Implemented in runtime snapshot |
| EXP-PHS-002 | Phase Engine | Timing profile loaded at session start | completed | P1 | Implemented |
| EXP-PHS-003 | Phase Engine | Tracks phase adherence, overspend, difficulty compliance, skip patterns | completed | P1 | Implemented in adaptive snapshot logic |
| EXP-PHS-004 | Phase Engine | Stored incrementally in session context without analytics recomputation in UI | partial | P1 | Runtime tracks and batches data; persistence path is only partly verified from frontend review |

## Session Lifecycle & Recovery

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-SES-001 | Session | Session lifecycle states: created, started, active, submitted, expired, terminated | completed | P0 | Implemented |
| EXP-SES-002 | Session | Server-authoritative timer model | completed | P0 | Strongly implemented |
| EXP-SES-003 | Session | Refresh resumes session | completed | P1 | Recovery model supports resume |
| EXP-SES-004 | Session | IndexedDB recovery snapshot | completed | P1 | Implemented |
| EXP-SES-005 | Session | Auto sync on reconnect / periodic batching | completed | P1 | Implemented through batching + recovery model |
| EXP-SES-006 | Session | Auto-submit on expiry | completed | P0 | Implemented |

## Security Hardening

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-SEC-001 | Security | Signed JWT session token gate | completed | P0 | Implemented |
| EXP-SEC-002 | Security | Token expiration + refreshable flow | completed | P1 | Implemented |
| EXP-SEC-003 | Security | Strict CSP | partial | P1 | Not verified from current frontend files alone |
| EXP-SEC-004 | Security | Disable embedding / iframe blocking | completed | P1 | Entry validation includes iframe block reason |
| EXP-SEC-005 | Security | No direct questionId exposure | partial | P2 | Internal IDs still exist in runtime state/UI artifacts, though direct asset access is controlled |
| EXP-SEC-006 | Security | Single session enforcement | completed | P0 | Implemented |
| EXP-SEC-007 | Security | Anti-tamper timestamp validation | partial | P1 | Timing validation exists conceptually, full anti-tamper coverage not fully provable here |
| EXP-SEC-008 | Security | Server-validated MinTime/MaxTime | partial | P0 | Frontend enforces strongly; full backend validation contract not fully verified from UI review |
| EXP-SEC-009 | Security | No trust in frontend principle | completed | P1 | Strong architectural alignment |

## Performance & Storage

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-PERF-001 | Performance | Batch write answers every 5–10 seconds | completed | P1 | Implemented |
| EXP-PERF-002 | Performance | Heartbeat ping every 20 seconds | completed | P1 | Implemented |
| EXP-PERF-003 | Performance | Lazy-load large images | completed | P1 | Implemented |
| EXP-PERF-004 | Performance | No analytics queries in exam runtime | completed | P1 | Implemented |
| EXP-PERF-005 | Performance | HOT-only operational data access | partial | P1 | Strong architectural alignment, but exact storage boundaries are partly outside frontend proof |
| EXP-PERF-006 | Performance | Test portal never touches BigQuery | completed | P1 | No BigQuery interaction in runtime |

## Visual / JEE-style Rules

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| EXP-VIS-001 | Visual | White background / blue headers / red countdown / square palette buttons | completed | P1 | Implemented structurally |
| EXP-VIS-002 | Visual | Instruction page structurally JEE-style | completed | P1 | Implemented strongly |
| EXP-VIS-003 | Visual | Minimal animation / simple typography / similar confirmation modal structure | completed | P2 | Broadly aligned |
| EXP-VIS-004 | Visual | Remove branding/trademark elements | completed | P0 | No JEE/NTA branding copied |
| EXP-VIS-005 | Visual | 99% visual similarity target | partial | P2 | Strongly aligned structurally, exact similarity target is subjective |

## Suggested Fix Order

1. `P0`
   - EXP-ENT-002
   - EXP-LAY-008
   - EXP-SES-001
   - EXP-SES-006
   - EXP-SEC-001
   - EXP-SEC-006
   - EXP-SEC-008
2. `P1`
   - EXP-ENT-004
   - EXP-LAY-002 through EXP-LAY-014
   - EXP-PHS-004
   - EXP-SEC-003
   - EXP-SEC-007
3. `P2`
   - EXP-UI-002
   - EXP-QA-007 through EXP-QA-008
   - EXP-VIS-005
