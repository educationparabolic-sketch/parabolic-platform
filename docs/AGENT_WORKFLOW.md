# AI Agent Development Workflow

This document defines the daily workflow used when developing the platform using an AI coding agent.

The AI agent and the human developer must follow this process to ensure the system remains stable and consistent with the architecture.

---

# Daily Development Workflow

1. Pull the latest code from the repository.

2. Start the local development environment.

   firebase emulators:start

3. Open the project in VS Code.

4. Open the docs folder and read the following files:

   AI_OPERATING_SYSTEM.md  
   architecture_rules.md  
   build_plan.md  
   build_log.md  

5. Determine the next build to implement.

6. Verify that all dependencies for the build are satisfied using:

   build_dependencies.md

7. Generate the implementation using the Codex prompt template.

---

# Build Execution Process

For every build the following steps must be executed:

Step 1 — Identify the build

Read build_log.md and locate the first build marked "Pending".

Step 2 — Review architecture

Locate the architecture section referenced by the build inside:

3_Core_Architectures.md  
or  
2_Portals_Architecture.md

Step 3 — Generate code

Use the Codex prompt template:

docs/codex_prompt_template.md

The AI must implement only the architecture section referenced by the build.

Step 4 — Review generated code

Verify that the generated code:

• follows architecture rules  
• uses the correct Firestore schema  
• reuses existing modules  

Step 5 — Run the emulator

firebase emulators:start

Verify that:

• functions compile  
• no runtime errors appear  
• API endpoints respond correctly  

Step 6 — Manual testing

Test the new functionality using:

Thunder Client  
Postman  
browser  

Step 7 — Commit the build

git add .
git commit -m "Build <number>: <build description>"
git push

Step 8 — Update build log

Edit:

docs/build_log.md

Mark the build as completed.

---

# Example Build Cycle

Example:

Build 26 — Session Start API

1. Check build_log.md
2. Identify Build 26 as pending
3. Read architecture section:
   Session Execution Domain
4. Generate code
5. Run emulator
6. Test endpoint
7. Commit build
8. Update build log

---

# Safety Rules

Before committing any build, ensure that:

• Firestore schema has not changed unexpectedly
• TypeScript compilation succeeds
• Existing APIs remain functional
• No duplicate services were created

---

# Development Environment

Local development should always use the Firebase Emulator Suite.

firebase emulators:start

Production deployments should only occur after successful local testing.

---

# Git Commit Convention

Every commit must correspond to a build.

Example:

Build 1: Platform initialization  
Build 2: Environment configuration  
Build 3: Secret management  

This keeps the Git history aligned with the architecture roadmap.

---

# Goal

The purpose of this workflow is to ensure that the platform is built in a deterministic, architecture-driven sequence using AI-assisted development.