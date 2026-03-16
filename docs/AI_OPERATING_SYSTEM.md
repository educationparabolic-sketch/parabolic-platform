# AI Development Operating System

This repository uses an AI-assisted development workflow.

Before generating or modifying code, the AI agent must read the following documents:

1_System_Summary.md  
2_Portals_Architecture.md  
3_Core_Architectures.md  
architecture_rules.md  
firestore_schema.md  
api_contract.md  
build_plan.md  
build_log.md  
build_dependencies.md  
code_index.md  

These documents define the architecture, constraints, and development roadmap.

---

# Core Principles

The AI must follow these principles when generating code.

1. Follow the architecture exactly as defined in the architecture documents.
2. Do not invent database schemas.
3. Do not redesign system modules.
4. Reuse existing modules whenever possible.
5. Maintain consistent naming conventions.
6. Implement only the build currently being executed.
7. Do not implement modules belonging to future builds.
8. Do not modify architecture files unless explicitly instructed.
9. Generate production-quality TypeScript code.
10. Respect the Firestore schema and data hierarchy.

---

# Firestore Rules

All institute data must exist under the following root path:

institutes/{instituteId}

Session data must exist under:

institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

Analytics must not read session documents directly.

Analytics must use summary collections such as:

runAnalytics  
studentYearMetrics  

---

# Build Execution Rules

Development follows a deterministic build sequence.

Before implementing code:

1. Read build_plan.md to identify the full build roadmap.
2. Read build_log.md to determine the next build.
3. Read build_dependencies.md to verify prerequisites are satisfied.

The AI must only implement the current build.

---

# Code Generation Rules

When generating code:

• Prefer modular design.
• Use TypeScript for backend and frontend.
• Follow existing repository structure.
• Place shared interfaces inside shared/types.
• Place backend services inside functions/src/services.
• Place middleware inside functions/src/middleware.
• Place route handlers inside functions/src/routes.

---

# Safety Rules

The AI must not:

• change Firestore collection structures
• rename existing services
• create duplicate modules
• generate placeholder code

If an existing module already implements a feature, reuse it.

---

# Expected Output Format

When implementing a build, the AI should output:

1. Explanation of the subsystem
2. File structure
3. Full code implementation
4. Integration points with existing modules