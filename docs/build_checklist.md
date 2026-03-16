# BUILD EXECUTION CHECKLIST

This checklist must be followed for every build in the platform development roadmap.

The checklist ensures that each build is implemented correctly, tested, documented, and integrated safely into the system.

This process prevents architectural drift and ensures deterministic system development when using AI coding agents.

---

# BUILD IMPLEMENTATION CHECKLIST

Before marking any build as complete, verify the following:

### 1. Correct Build Number
Confirm the build number from:

build_log.md

Ensure the build being implemented matches the **Next Build** listed in the log.

---

### 2. Architecture Section Verified

Locate the architecture specification referenced in:

build_plan.md

Confirm the section exists in the appropriate document:

- 3_Core_Architectures.md
- 2_Portals_Architecture.md
- 1_System_Summary.md

The implementation must strictly follow that architecture section.

---

### 3. Dependencies Verified

Before coding, verify dependencies using:

build_dependencies.md

Ensure all required phases and subsystems are already implemented.

Do not implement builds that depend on missing subsystems.

---

### 4. Code Generation Scope

When using AI coding agents:

- Generate only the subsystem described in the build.
- Do not regenerate existing modules.
- Reuse previously created services when required.

The build must remain isolated to the defined subsystem.

---

### 5. File Structure Confirmed

Verify new files are placed in the correct project directories.

Example structure:
apps/
functions/
shared/
config/
docs/


Ensure modules follow established project structure.

---

### 6. API Contracts Verified

If the build introduces APIs:

Verify they follow the rules defined in:

api_contract.md

Required checks:

- authentication
- role enforcement
- tenant validation
- consistent response structure

---

### 7. Firestore Schema Compliance

If the build interacts with Firestore:

Verify collections and fields match:

firestore_schema.md

Rules:

- no undocumented collections
- no undocumented fields
- schema naming conventions respected

---

### 8. Middleware & Security Validation

If the build involves backend APIs:

Verify enforcement of:

- authentication middleware
- tenant guard
- role guard
- license guard

Security rules must follow:

architecture_rules.md

---

### 9. Logging & Error Handling

Verify the subsystem implements:

- structured logging
- deterministic error responses
- error codes defined in API contract

Errors must not expose internal implementation details.

---

### 10. Local Testing

Test the implementation locally.

Required checks:

- emulator runs successfully
- frontend loads without errors
- API endpoints respond correctly
- Firestore operations function as expected

Run:
firebase emulators:start


Verify the system operates normally.

---

### 11. Linting & Type Safety

Ensure code passes:

- TypeScript compilation
- ESLint rules
- formatting checks

Run:
npm run build


Errors must be resolved before commit.

---

### 12. Git Commit

Commit the implementation with a deterministic message.

Example:
Build 27 — Session Lifecycle State Machine implemented


Commit must clearly reference the build number.

---

### 13. Update Build Log

After successful commit:

Update:

build_log.md

Actions required:

- increment completed builds
- update next build number
- add summary of completed build

---

### 14. Repository Push

Push the commit to GitHub.
git push


Ensure the remote repository reflects the new build.

---

# BUILD COMPLETION CRITERIA

A build is considered complete only when:

- architecture section implemented
- subsystem tested locally
- commit pushed to repository
- build_log.md updated
- checklist fully verified

---

# AI CODING AGENT NOTICE

AI agents must always perform the following before generating code:

1. Read build_log.md
2. Identify the next build
3. Verify dependencies in build_dependencies.md
4. Locate architecture section
5. Implement only the defined subsystem

Failure to follow this checklist may result in incompatible modules or architectural drift.