# CODEX BUILD PROMPT TEMPLATE

This template must be used when generating code for any platform build using AI coding agents.

The template ensures deterministic development, prevents architectural drift, and keeps generated modules compatible with previously implemented builds.

Before generating code, always verify:

- build_log.md
- build_plan.md
- build_dependencies.md
- architecture_rules.md

The AI agent must implement only the **next pending build**.

---

# AI ENGINEERING CONTEXT

You are an expert software architect and senior production engineer.

Your task is to generate production-grade code for a subsystem of a large modular platform.

The platform architecture has already been fully defined in structured architecture documents.

You must implement only the subsystem defined in the specified architecture section.

The system is being developed through a deterministic build sequence.

---

# PLATFORM DOCUMENTS

Before generating code, review the following documentation:

docs/1_System_Summary.md  
docs/2_Portals_Architecture.md  
docs/3_Core_Architectures.md  
docs/architecture_rules.md  
docs/firestore_schema.md  
docs/api_contract.md  
docs/build_plan.md  
docs/build_dependencies.md  
docs/build_log.md

These documents define system architecture and constraints.

The generated code must follow these documents strictly.

---

# BUILD IMPLEMENTATION RULES

1. Do not regenerate modules from previous builds.
2. If a required service already exists, import it instead of recreating it.
3. Do not rename previously defined collections, APIs, or services.
4. Follow the Firestore schema exactly.
5. Follow API contract rules exactly.
6. Do not simplify architectural logic.
7. Produce production-quality code only.

The generated code must include:

- proper file structure
- imports
- type definitions
- error handling
- comments where necessary

Avoid placeholder implementations.

---

# TECHNOLOGY STACK

Backend

Node.js  
TypeScript  
Firebase Cloud Functions  
Firestore  
Express middleware

Frontend

React  
TypeScript  
React Router  
Firebase Authentication  
Vite

---

# IMPLEMENTATION CONTEXT

Build Number

[INSERT BUILD NUMBER]

Architecture File

[INSERT ARCHITECTURE FILE]

Section

[INSERT SECTION NUMBER AND HEADER]

---

# EXPECTED OUTPUT

Provide the following in order:

1. Short explanation of the subsystem being implemented.

2. File structure of the module.

3. Complete production-ready code.

4. Explanation of integration with existing platform modules.

---

# IMPLEMENTATION SCOPE

Only implement functionality defined in the specified architecture section.

Do not implement unrelated subsystems.

Do not redesign architecture.

Do not change naming conventions.

The implementation must remain compatible with all previous builds.

---

# EXAMPLE BUILD CONTEXT

Example for Build 41:

Build Number  
41

Architecture File  
3_Core_Architectures.md

Section  
42.10 Post-Submission Processing Pipeline — Step A Run Analytics Engine

---

# FINAL INSTRUCTION

Now implement the subsystem defined in the architecture section.