# BUILD ORCHESTRATOR

This document defines the execution protocol used to build the platform using the deterministic build system.

The platform consists of 150 sequential builds defined in `build_plan.md`.

The build orchestrator ensures that builds are executed safely, in the correct order, and with all dependencies satisfied.

The orchestrator is designed for AI-assisted development using stateless AI sessions.

---

# PURPOSE

The build orchestrator ensures that:

• builds are executed sequentially  
• dependencies are respected  
• architecture documents are followed  
• AI coding agents remain deterministic  
• code generation does not break earlier modules  

The orchestrator acts as the operational controller for the platform development lifecycle.

---

# BUILD EXECUTION FLOW

Every build follows this exact workflow.

Step 1 — Identify Next Build

Open:

docs/build_log.md

Locate:

Next Build

Example:

Next Build: 27

---

Step 2 — Locate Build Specification

Open:

docs/build_plan.md

Find the matching build section.

Example:

Build 27 — Session Lifecycle State Machine

Record the following:

Architecture File  
Section Number  
Section Header  

---

Step 3 — Verify Dependencies

Open:

docs/build_dependencies.md

Confirm that all required phases and builds have already been completed.

If dependencies are missing:

STOP execution.

---

Step 4 — Load Architecture Documents

Review the relevant architecture documents:

docs/3_Core_Architectures.md  
docs/2_Portals_Architecture.md  
docs/1_System_Summary.md  

These documents define the subsystem behavior.

---

Step 5 — Prepare Codex Prompt

Open:

docs/codex_prompt_template.md

Fill in the following values:

Build Number  
Architecture File  
Section  

Example:

Build Number  
27

Architecture File  
3_Core_Architectures.md

Section  
10.1 Session Lifecycle State Machine

---

Step 6 — Run AI Code Generation

Send the prepared prompt to the AI coding agent.

Expected output:

• subsystem explanation  
• module file structure  
• production-ready code  
• integration description  

Generated code must follow architecture rules strictly.

---

Step 7 — Implement Code

Add generated code to the repository.

Follow the structure defined in:

docs/code_index.md

Typical directories:

functions/src/api  
functions/src/services  
functions/src/engines  
shared/types  
apps/admin  
apps/student  

---

Step 8 — Local Testing

Run Firebase emulators:

firebase emulators:start

Verify:

• APIs respond correctly  
• Firestore operations work  
• frontend loads successfully  

---

Step 9 — Build Verification

Run TypeScript build:

npm run build

Verify:

• no compilation errors  
• no type violations  

Resolve all issues before committing.

---

Step 10 — Commit Changes

Commit with deterministic message:

Build <number> — <subsystem name> implemented

Example:

Build 27 — Session Lifecycle State Machine implemented

---

Step 11 — Update Build Log

Open:

docs/build_log.md

Update:

Completed Builds  
Next Build  

Add a summary entry describing the build.

---

Step 12 — Push Repository

Push changes to GitHub.

git push

Ensure repository state matches completed build.

---

# BUILD FAILURE HANDLING

If a build fails:

1. Do not proceed to the next build.
2. Investigate error using logs.
3. Fix implementation.
4. Re-run tests.
5. Only mark build complete after system stability is verified.

Skipping builds is strictly prohibited.

---

# BUILD ORCHESTRATION RULES

The following rules must always be enforced.

1. Builds must execute strictly in numerical order.
2. Architecture documents cannot be changed by AI agents.
3. Code generation must not overwrite existing modules.
4. Firestore schema must remain consistent.
5. API contracts must remain stable.

Violating these rules can break platform architecture.

---

# SAFE AI BUILD EXECUTION

Before executing any build, AI agents must read:

docs/build_plan.md  
docs/build_log.md  
docs/build_dependencies.md  
docs/architecture_rules.md  
docs/firestore_schema.md  
docs/api_contract.md  

These documents form the governance layer for AI-driven development.

---

# ORCHESTRATION SUMMARY

Platform build process:

Check Build Log  
↓  
Locate Build Specification  
↓  
Verify Dependencies  
↓  
Load Architecture Section  
↓  
Generate Code  
↓  
Implement Code  
↓  
Test Locally  
↓  
Commit Changes  
↓  
Update Build Log  
↓  
Push Repository  

This deterministic workflow ensures the platform can be built safely using AI coding agents.

---

# FINAL NOTE

The build orchestrator acts as the operational control layer for the platform development process.

When used together with:

build_plan.md  
build_dependencies.md  
build_checklist.md  

it creates a fully deterministic AI-assisted engineering workflow.