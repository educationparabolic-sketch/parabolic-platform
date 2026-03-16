# Documentation Index

This document provides an index of all documentation files used in the platform.

It serves as the entry point for AI agents and developers to understand the documentation system.

Before reading individual architecture files, AI agents should read this file to understand the purpose of each document.

---

# Documentation Categories

The documentation system is divided into the following categories:

1. AI Governance Documents
2. Architecture Documents
3. Engineering Rules
4. Build System Documents
5. Codebase Structure Documents
6. AI Prompt System

---

# AI Governance Documents

These documents define how AI agents behave during development.

| File | Purpose |
|-----|------|
|AI_OPERATING_SYSTEM.md|Defines AI behavior rules and architecture constraints|
|AGENT_WORKFLOW.md|Defines the daily development workflow|
|AI_BUILD_SUPERVISOR_PROMPT.md|Defines the build execution protocol for AI coding agents|

These files act as the **control layer for AI-assisted development**.

---

# Architecture Documents

These documents define the platform architecture.

| File | Purpose |
|-----|------|
|1_System_Summary.md|High-level overview of the platform|
|2_Portals_Architecture.md|Architecture of the Admin, Student, Exam, and Vendor portals|
|3_Core_Architectures.md|Detailed backend architecture and system engines|

These documents define **how the system is designed**.

---

# Engineering Rules

These documents define the constraints used during development.

| File | Purpose |
|-----|------|
|architecture_rules.md|Global engineering rules and design principles|
|firestore_schema.md|Authoritative Firestore data schema|
|api_contract.md|API structure, validation rules, and response formats|

These documents define **how the system must be implemented**.

---

# Build System Documents

These documents define the deterministic build process.

| File | Purpose |
|-----|------|
|build_plan.md|Complete list of all platform builds|
|build_log.md|Tracks completed builds and next build|
|build_dependencies.md|Defines build dependency relationships|
|build_checklist.md|Checklist used before marking a build complete|
|build_orchestrator.md|Step-by-step build execution protocol|

These documents ensure the platform is built in a **deterministic sequence**.

---

# System Mapping Documents

These documents describe the system structure and event topology.

| File | Purpose |
|-----|------|
|system_topology.md|High-level interaction between system domains|
|SYSTEM_EVENT_MAP.md|Event-driven architecture map|
|MODULE_REGISTRY.md|Registry of implemented APIs, services, and engines|

These documents help AI agents avoid:

• duplicate modules  
• duplicate triggers  
• architecture drift

---

# Codebase Structure Documents

These documents describe the repository structure.

| File | Purpose |
|-----|------|
|code_index.md|Map of the repository directory structure|

This document helps AI agents place code in the correct directories.

---

# AI Prompt System

These documents support AI-assisted code generation.

| File | Purpose |
|-----|------|
|codex_prompt_template.md|Template for generating build implementations|
|prompt_library.md|Reusable prompts for development tasks|

These documents standardize AI interactions.

---

# Recommended AI Reading Order

When a new AI session starts, the following order should be used:

1. DOC_INDEX.md
2. AI_OPERATING_SYSTEM.md
3. AGENT_WORKFLOW.md
4. AI_BUILD_SUPERVISOR_PROMPT.md
5. build_log.md
6. build_plan.md

This ensures the AI understands:

• documentation structure  
• development workflow  
• architecture constraints  
• next build to implement

---

# Purpose

The documentation index ensures that both AI agents and developers can quickly understand the documentation ecosystem and navigate the platform architecture efficiently.