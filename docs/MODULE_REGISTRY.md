# MODULE REGISTRY

This document records all modules implemented in the platform.

Its purpose is to prevent duplicate subsystem creation during AI-assisted development.

Before implementing any build, AI agents must consult this registry.

If a module already exists, it must be reused rather than recreated.

---

# MODULE TYPES

Modules are categorized into the following groups:

API Endpoints  
Services  
Processing Engines  
Firestore Collections  
Frontend Modules

---

# API ENDPOINTS

Endpoint | Build | Description
---|---|---
GET /student/dashboard | TBD | Student dashboard summary
POST /admin/tests | TBD | Create test template
POST /admin/runs | TBD | Create test assignment
POST /exam/start | Build 26 | Start exam session
POST /exam/session/{sessionId}/answers | Build 30 | Answer batching
POST /exam/session/{sessionId}/submit | Build 36 | Session submission

---

# SERVICES

Service | Build | Purpose
---|---|---
SessionService | Build 26 | Manage exam session lifecycle
AnswerBatchService | Build 30 | Persist incremental answers
SubmissionService | Build 36 | Handle exam submission logic
LicenseService | Phase 19 | License validation and enforcement
BillingService | Phase 19 | Billing computation and Stripe sync
EnvironmentConfigLoader | Build 2 | Centralized environment variable and endpoint configuration loader
SecretManagerService | Build 3 | Resolve backend secrets from local environment variables or Google Secret Manager
StructuredLogger | Build 4 | Centralized structured Cloud Logging service with request tracing and log level enforcement

---

# PROCESSING ENGINES

Engine | Build | Purpose
---|---|---
RunAnalyticsEngine | Build 41 | Compute run-level analytics
QuestionAnalyticsEngine | Build 42 | Update question performance metrics
StudentMetricsEngine | Build 43 | Update yearly student metrics
RiskEngine | Build 44 | Risk classification model
PatternEngine | Build 45 | Behavioral pattern detection

---

# FIRESTORE COLLECTIONS

Collection | Scope | Description
---|---|---
institutes | Global | Institute root namespace
students | Institute | Student records
questionBank | Institute | Question storage
tests | Institute | Test templates
runs | AcademicYear | Test assignments
sessions | Run | Exam execution sessions
runAnalytics | AcademicYear | Run-level analytics
studentYearMetrics | AcademicYear | Student performance metrics
usage | Institute | Billing usage metering
license | Institute | License configuration

---

# FRONTEND MODULES

Module | Portal | Description
---|---|---
AdminDashboard | Admin | Institute overview dashboard
StudentDashboard | Student | Student performance summary
ExamRunner | Exam | Exam session interface
VendorDashboard | Vendor | Vendor analytics interface

---

# REGISTRY UPDATE RULE

After completing each build:

1. Identify newly created modules
2. Add them to this registry
3. Record the build number

This ensures the platform remains deterministic.
