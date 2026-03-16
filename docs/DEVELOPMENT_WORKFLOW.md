# Daily Development Workflow

This document defines the daily workflow used to develop the platform using AI-assisted coding.

It ensures that development follows the architecture, respects build dependencies, and keeps the system stable.

Every development session should follow this workflow.

---

# Development Philosophy

The platform is built through a deterministic build system.

Each build corresponds to a subsystem defined in:

docs/build_plan.md

The next build to implement is always recorded in:

docs/build_log.md

Only one build should be implemented at a time.

---

# Daily Workflow

The development process follows three phases:

1. Environment Preparation
2. Build Execution
3. Build Finalization

---

# Phase 1 — Environment Preparation

## Step 1 — Pull Latest Code

Start by synchronizing the repository.

git pull

This ensures that both development machines remain identical.

---

## Step 2 — Start Firebase Emulator

From the project root directory run:

firebase emulators:start

This launches the local development environment.

Services started include:

- Firestore Emulator
- Cloud Functions Emulator
- Hosting Emulator

Access points:

http://localhost:4000 → Emulator Dashboard  
http://localhost:5000 → Local Hosting  

---

## Step 3 — Open Project in VS Code

Open the project folder:

parabolic-platform

Ensure the AI coding agent (Codex / ChatGPT) is active.

---

# Phase 2 — Determine the Next Build

## Step 4 — Check Build Log

Open:

docs/build_log.md

Locate:

Next Build

Example:

Next Build: 12

This is the only build that should be implemented.

Never skip builds.

---

## Step 5 — Locate Build Specification

Open:

docs/build_plan.md

Find the section corresponding to the build number.

Each build specifies:

- Architecture File
- Section Number
- Section Header

Example:

Build 12  
File: 3_Core_Architectures.md  
Section: Question Search Indexing

---

# Phase 3 — Verify Build Safety

Before generating code, verify the system state.

---

## Check Build Dependencies

Open:

docs/build_dependencies.md

Confirm that the required phases are already completed.

If dependencies are not satisfied, do not proceed.

---

## Check Module Registry

Open:

docs/MODULE_REGISTRY.md

Verify whether the required module already exists.

If it exists, reuse the existing module instead of creating a new one.

---

## Check Event Map

Open:

docs/SYSTEM_EVENT_MAP.md

If the build introduces triggers, analytics pipelines, or scheduled jobs, verify that the event already exists.

Do not create duplicate triggers.

---

# Phase 4 — Generate Code Using AI

## Step 6 — Prepare Codex Prompt

Open:

docs/codex_prompt_template.md

Fill the following values:

Build Number  
Architecture File  
Section

Example:

Build Number: 12  
Architecture File: 3_Core_Architectures.md  
Section: Question Search Indexing

Send the prompt to the AI coding agent.

---

## Step 7 — Review AI Output

Carefully review generated code.

Verify that:

- Firestore schema matches firestore_schema.md
- API endpoints follow api_contract.md
- architecture rules are respected
- existing modules are reused
- correct repository structure is used

Do not blindly accept generated code.

---

# Phase 5 — Implement Code

Place code in the correct directories.

Backend structure:

functions/src/api  
functions/src/services  
functions/src/engines  
functions/src/middleware  

Shared models:

shared/types

Frontend portals:

apps/admin  
apps/student  
apps/exam  
apps/vendor  

Follow repository rules defined in:

docs/code_index.md

---

# Phase 6 — Test the Build

## Step 8 — Compile TypeScript

Run:

npm run build

Resolve any compilation errors.

---

## Step 9 — Test Using Emulator

Verify that:

- Cloud Functions compile
- APIs respond correctly
- Firestore writes succeed
- frontend loads correctly

Testing tools:

- Thunder Client
- Postman
- Browser

---

# Phase 7 — Commit the Build

## Step 10 — Commit Code

Use deterministic commit messages.

Example:

git add .
git commit -m "Build 12: Question search indexing"
git push

Git history must match the build sequence.

Example commit history:

Build 1: Platform initialization  
Build 2: Environment configuration  
Build 3: Secret management  

---

# Phase 8 — Update Documentation

## Step 11 — Update Build Log

Open:

docs/build_log.md

Update:

Completed Builds  
Next Build  

Add a short description of the completed build.

---

## Step 12 — Update Module Registry

If new modules were created, add them to:

docs/MODULE_REGISTRY.md

Example:

SessionService — Build 26  
POST /exam/start — Build 26  

This prevents duplicate modules.

---

# End of Build Cycle

After completing the steps above, the system is ready for the next build.

---

# Workflow Summary

The daily development workflow is:

Start Development  
↓  
git pull  
↓  
firebase emulators:start  
↓  
Check build_log.md  
↓  
Locate build in build_plan.md  
↓  
Verify dependencies  
↓  
Generate code with Codex  
↓  
Review generated code  
↓  
Implement subsystem  
↓  
Test locally  
↓  
Commit and push  
↓  
Update build_log.md  

---

# Goal

The goal of this workflow is to ensure that the platform is built in a deterministic, architecture-driven sequence using AI-assisted development.

Following this workflow ensures:

- architecture consistency
- safe AI-generated code
- reproducible builds
- stable system evolution