# 🏗 PARABOLIC PLATFORM — SYSTEM OVERVIEW
Version: 1.0
Status: Frozen Architecture
Last Updated: 2026-03-03

---

# 0️⃣ SYSTEM OVERVIEW

## 0.1 Vision

Parabolic Platform is a multi-tenant, layer-based assessment intelligence system designed for educational institutes.

The system combines secure test execution, behavioral diagnostics, execution discipline modeling, and institutional governance into a unified SaaS architecture.

It is built on:
- Strict tenant isolation
- Versioned analytics engines
- License-enforced capability layers (L0–L3)
- HOT–WARM–COLD data partitioning
- Immutable historical audit trails

The platform evolves through calibrated behavioral models powered by cross-institute aggregated intelligence, without retroactive mutation of historical data.

The architectural goal is long-term scalability, deterministic analytics, institutional stability measurement, and commercial sustainability.

## 0.2 Core Principles

The platform operates under the following architectural principles:

### 1. Strict Tenant Isolation
All institute data is fully isolated at the Firestore path level.  
No cross-tenant queries are permitted.  
All API requests must pass tenant enforcement middleware.

### 2. Backend-Enforced Licensing
Feature access is controlled exclusively by the license object.  
Frontend visibility does not grant capability.  
All restrictions are validated server-side.

### 3. Layer-Based Capability Model (L0–L3)
System behavior evolves across four execution layers:
- L0 — Operational
- L1 — Diagnostic
- L2 — Controlled
- L3 — Governance

Each layer progressively enables deeper analytics, enforcement, and institutional visibility.

### 4. Deterministic & Immutable Analytics
Historical sessions are never retroactively recalculated.  
All analytics are versioned at time of computation.  
Snapshots preserve historical truth.

### 5. HOT–WARM–COLD Data Partitioning
- HOT: Current academic year active data
- WARM: Completed runs (current year)
- COLD: Archived session data in BigQuery

Dashboards must not read raw session logs.

### 6. Engine Versioning
All critical engines (risk, calibration, template, schema) are versioned.  
Each session stores engine version snapshots used at execution time.

### 7. Submission Immutability
Once submitted, session data cannot be modified.  
All post-processing is asynchronous and idempotent.

### 8. Calibration-Driven Intelligence
Behavioral intelligence models are governed by global calibration versions.  
Calibration changes affect only future sessions.

### 9. Auditability
All structural actions (license changes, calibration pushes, archive triggers, overrides) must produce immutable audit logs.

### 10. Separation of Academic and Commercial Logic
Academic execution logic must never depend on billing logic.  
Licensing governs capability, not academic computation correctness.

## 0.3 Actor Map

The system operates with the following actors.  
Each actor has a defined authority boundary and portal access scope.

---

### 1. Student
Type: Human  
Primary Portal: Student Portal (portal.yourdomain.com/student)  
Execution Portal: Exam Portal (exam.yourdomain.com)  

Capabilities:
- View assigned tests
- Attempt tests
- View performance summaries (Raw % + Accuracy %)
- View solutions (current academic year only)
- View behavioral insights (Layer-dependent)

Restrictions:
- Cannot access question bank
- Cannot access other students' data
- Cannot modify analytics
- Cannot bypass execution enforcement

---

### 2. Teacher
Type: Human  
Primary Portal: Admin Dashboard  

Capabilities:
- Create tests
- Create assignments
- Monitor active sessions
- View analytics (layer-dependent)
- Trigger post-test emails (controlled)

Restrictions:
- Cannot modify license
- Cannot modify calibration
- Cannot access cross-institute data
- Cannot override global feature flags

---

### 3. Institute Admin
Type: Human  
Primary Portal: Admin Dashboard  

Capabilities:
- Full institute-level management
- Manage students
- Configure academic year
- Manage roles
- Access analytics (layer-dependent)
- View licensing status (read-only)
- Trigger archive

Restrictions:
- Cannot modify global calibration
- Cannot access vendor dashboard
- Cannot alter engine versions

---

### 4. Director (L3 Only)
Type: Human  
Primary Portal: Admin Dashboard (Governance Module)  

Capabilities:
- View governance snapshots
- View institutional stability metrics
- View longitudinal trends
- View override audits

Restrictions:
- Cannot modify session data
- Cannot alter calibration
- Cannot access vendor-level aggregates

---

### 5. Vendor
Type: Human (Platform Owner)  
Primary Portal: Vendor Dashboard  

Capabilities:
- Manage institutes
- Control licensing
- Manage calibration versions
- Push global feature flags
- Access cross-institute intelligence
- Access revenue metrics
- View system health
- Trigger simulation engine

Restrictions:
- Cannot directly modify institute session data
- Cannot retroactively mutate analytics

---

### 6. Stripe
Type: External System Actor  

Capabilities:
- Send webhook events
- Confirm payment status
- Trigger license updates

Restrictions:
- No direct database write access
- Interacts only via validated webhook endpoint

---

### 7. Email Service
Type: External System Actor  

Capabilities:
- Send notification emails
- Deliver monthly summaries

Restrictions:
- No database read access
- Receives prepared payload only

---

### 8. Firebase (Platform Infrastructure)
Type: Infrastructure Actor  

Components:
- Firestore
- Cloud Functions
- Authentication
- Hosting
- Cloud Storage

Role:
- Executes backend logic
- Stores tenant-isolated data
- Enforces security rules

---

### 9. BigQuery
Type: Data Infrastructure Actor  

Role:
- Stores archived session data (COLD partition)
- Stores governance snapshots
- Stores vendor-level aggregate analytics

Restrictions:
- Never queried by execution portal
- Never used for live student dashboards
---

