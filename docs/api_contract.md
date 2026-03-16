
---

# Core API Groups

The API is divided into the following endpoint groups.

### Admin APIs

Administrative operations for institute management.

Examples:

POST /admin/tests  
POST /admin/runs  
POST /admin/students/bulk  
POST /admin/academicYear/archive  

Roles allowed:

admin  
teacher

---

### Student APIs

Student dashboard and performance endpoints.

Examples:

GET /student/dashboard  
GET /student/tests  
GET /student/performance  

Role required:

student

---

### Exam APIs

Endpoints used during test execution.

Examples:

POST /exam/start  

POST /exam/session/{sessionId}/answers  

POST /exam/session/{sessionId}/submit  

Role required:

student

---

### Vendor APIs

Vendor-level administrative endpoints.

Examples:

POST /vendor/license/update  

POST /vendor/calibration/push  

POST /vendor/calibration/simulate  

Role required:

vendor

---

### Internal APIs

Internal service endpoints used by backend workflows.

Example:

POST /internal/email/queue

These endpoints are restricted to backend service roles.

---

# Core API Workflows

The API layer enforces the following checks for every request.

### Authentication

• Firebase token must exist  
• Token signature must be valid  
• Token must not be expired  

If validation fails:

UNAUTHORIZED

---

### Tenant Isolation

For institute-scoped endpoints:

request.instituteId must match token.instituteId.

Otherwise:

TENANT_MISMATCH

Vendor endpoints bypass this rule.

---

### License Enforcement

Certain operations require specific license layers.

Example:

Controlled exam mode requires L2 or higher.

If license requirements are not satisfied:

LICENSE_RESTRICTED

---

# Session Execution Contract

Exam sessions follow this lifecycle:

created → started → active → submitted → expired → terminated

Session endpoints must enforce forward-only state transitions.

---

# Answer Write Contract

Answer updates must follow batching rules.

Constraints:

Maximum answers per batch: 10  
Minimum write interval: 5 seconds  

Answers must merge into:

session.answerMap

---

# API Error Codes

Standard error codes include:

UNAUTHORIZED  
FORBIDDEN  
TENANT_MISMATCH  
LICENSE_RESTRICTED  
VALIDATION_ERROR  
NOT_FOUND  
SESSION_LOCKED  
WINDOW_CLOSED  
INTERNAL_ERROR

All API responses must follow the standardized response format.

---

# Implementation Notes

Backend services are implemented using:

Node.js  
TypeScript  
Firebase Cloud Functions  
Firestore  
Express middleware

All endpoint logic must enforce:

authentication  
RBAC authorization  
tenant validation  
license checks  
request schema validation