# Architecture Rules

This document defines non-negotiable architectural constraints for the platform.

All AI generated code must follow these rules.

These rules exist to prevent architectural drift, schema corruption, and inconsistent service implementations.

---

# 1. Multi-Tenancy Isolation

The platform is multi-tenant.

All institute data must exist under the following root path:

institutes/{instituteId}

No collections containing institute data may exist outside this hierarchy.

Correct example:

institutes/{instituteId}/students/{studentId}

Incorrect example:

students/{studentId}

---

# 2. Academic Year Partitioning

Academic data must be partitioned by academic year.

Structure:

institutes/{instituteId}/academicYears/{yearId}

All exam execution data must exist inside the academic year scope.

---

# 3. Test Execution Hierarchy

The exam execution hierarchy must follow this exact structure:

institutes/{instituteId}
  academicYears/{yearId}
    runs/{runId}
      sessions/{sessionId}

No alternative hierarchy is allowed.

---

# 4. Analytics Isolation

Analytics engines must never read raw session collections for aggregation.

Analytics must operate on summary collections such as:

runAnalytics/{runId}

studentYearMetrics/{studentId}

This ensures scalability and prevents expensive queries.

---

# 5. Immutable Historical Data

Certain collections must be immutable after creation.

Examples:

auditLogs
vendorAuditLogs
licenseHistory
governanceSnapshots

These documents must never be updated or deleted.

---

# 6. Firestore Query Rules

All queries must:

• use indexed fields  
• use cursor pagination  
• avoid full collection scans  

Offset-based pagination must not be used.

---

# 7. Server-Side Enforcement

The following validations must occur on the backend:

• authentication
• role verification
• license checks
• tenant isolation

These must never rely on frontend validation.

---

# 8. Shared Types

All shared TypeScript interfaces must live in:

shared/types

Frontend and backend must both use these interfaces.

---

# 9. Service Layer Pattern

Backend services must follow this structure:

functions/src

controllers/
services/
middleware/
models/
routes/

Business logic must exist in services, not controllers.

---

# 10. Naming Conventions

Maintain consistent naming across the project.

Examples:

SessionService
AssignmentService
RunAnalyticsService

Avoid duplicate naming patterns such as:

sessionManager
sessionHandler
sessionController

---

# 11. No Duplicate Modules

Before creating a new service or middleware, verify that a similar module does not already exist.

Use:

docs/code_index.md

to locate existing services.

---

# 12. Architecture Source of Truth

The following files are the authoritative architecture sources:

1_System_Summary.md  
2_Portals_Architecture.md  
3_Core_Architectures.md  

If generated code conflicts with these documents, the architecture documents take precedence.

---

# 13. Build Discipline

The system must be implemented according to the build sequence defined in:

docs/build_plan.md

AI must not implement modules belonging to future builds.

---

# 14. Code Quality Expectations

All generated code must:

• compile successfully
• include proper TypeScript types
• follow modular architecture
• avoid placeholder implementations