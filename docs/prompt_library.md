# PROMPT LIBRARY

This document contains reusable prompts used when interacting with AI coding agents during platform development.

The prompts ensure that AI responses remain aligned with the platform architecture and deterministic build process.

Always verify the next build using:

build_log.md

before running any prompts.

---

# 1. BUILD IMPLEMENTATION PROMPT

Use this prompt when implementing the next subsystem build.

Prompt Template

You are an expert software architect and senior production engineer.

Implement the following subsystem according to the platform architecture.

Follow these rules:

• Do not redefine modules from previous builds  
• Reuse existing services if available  
• Follow Firestore schema defined in firestore_schema.md  
• Follow API rules defined in api_contract.md  
• Follow architecture constraints defined in architecture_rules.md  
• Generate production-grade TypeScript code  

Build Number: [INSERT BUILD NUMBER]

Architecture File: [INSERT FILE NAME]

Section: [INSERT SECTION NUMBER AND HEADER]

Technology Stack:

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
Firebase Auth  

Expected Output:

1. Short explanation of subsystem  
2. File structure  
3. Full production code  
4. Integration explanation

---

# 2. CODE REVIEW PROMPT

Use this after implementing a build to verify correctness.

Prompt

Review the following code and verify that it follows the platform architecture.

Check the following:

• Firestore schema compliance  
• API contract compliance  
• authentication enforcement  
• tenant isolation  
• role-based authorization  
• proper error handling  
• deterministic behavior  

Identify any architecture violations.

Suggest corrections if necessary.

---

# 3. FIRESTORE QUERY OPTIMIZATION PROMPT

Use this when designing queries.

Prompt

Optimize the following Firestore queries for scalability.

Constraints:

• Avoid collection scans  
• Use indexed queries only  
• Use cursor-based pagination  
• Respect composite index strategy  

Provide optimized query patterns.

---

# 4. SECURITY AUDIT PROMPT

Use periodically to audit backend security.

Prompt

Audit the following backend code for security vulnerabilities.

Check for:

• missing authentication validation  
• tenant isolation violations  
• privilege escalation risks  
• improper Firestore permissions  
• input validation gaps  

Recommend secure implementations.

---

# 5. TEST GENERATION PROMPT

Use when writing automated tests.

Prompt

Generate test cases for the following API endpoint.

Required tests:

• successful request  
• authentication failure  
• role violation  
• cross-tenant access attempt  
• invalid request payload  
• immutable entity modification attempt

Output test code using the existing testing framework.

---

# 6. ERROR HANDLING PROMPT

Use to standardize error responses.

Prompt

Refactor the following backend code to ensure deterministic error handling.

Rules:

• return structured error responses  
• include requestId and timestamp  
• follow error codes defined in api_contract.md

---

# 7. FIRESTORE SCHEMA VALIDATION PROMPT

Use when introducing new collections.

Prompt

Verify that the following Firestore collection structure follows the platform schema rules.

Check:

• naming conventions  
• index compatibility  
• multi-tenant isolation  
• analytics immutability rules

Recommend improvements if needed.

---

# 8. PERFORMANCE OPTIMIZATION PROMPT

Use to improve performance of services.

Prompt

Analyze the following service and identify performance bottlenecks.

Focus on:

• Firestore read/write optimization  
• caching opportunities  
• batch operations  
• concurrency safety

Suggest improvements.

---

# 9. FRONTEND COMPONENT GENERATION PROMPT

Use when building UI components.

Prompt

Generate a React component using TypeScript.

Requirements:

• follow the shared UI component system  
• integrate with existing API client  
• maintain strict type safety  
• avoid unnecessary re-renders  

Return production-ready React code.

---

# 10. ARCHITECTURE CONSISTENCY PROMPT

Use periodically to verify overall architecture.

Prompt

Review the current platform architecture implementation.

Verify alignment with:

• 1_System_Summary.md  
• 2_Portals_Architecture.md  
• 3_Core_Architectures.md  

Identify inconsistencies or architectural drift.

Provide recommended corrections.

---

# PROMPT USAGE RULES

When using AI coding agents:

1. Always verify the next build in build_log.md.
2. Use the build implementation prompt for new subsystems.
3. Use review prompts before committing code.
4. Never allow AI to modify architecture documents automatically.
5. Ensure all code aligns with Firestore schema and API contracts.

Following these rules ensures deterministic platform development.