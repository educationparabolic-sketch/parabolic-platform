# 🏗 PARABOLIC PLATFORM - CORE ARCHITECTURES
Version: 1.0
Status: Frozen Architecture
Last Updated: 2026-03-03





# 1. Initialisation

## 1.1 Overview
The Initialisation module establishes the foundational infrastructure required to begin development of the platform. This phase prepares the cloud environment, local development tooling, repository structure, and deployment pipeline.

The goal of this phase is to ensure that:

- Cloud infrastructure is provisioned
- Development and production environments exist
- Local machines can run the full system
- Codebase is portable across machines
- Firebase deployment and emulation are functional
- Version control is configured

Completion of this phase ensures that the platform development environment is operational.

---

## 1.2 Key Responsibilities

- Create development and production cloud environments
- Enable required Firebase services
- Install local development dependencies
- Initialize the project repository
- Configure Firebase CLI and emulators
- Establish the monorepo structure
- Setup a frontend development environment
- Configure environment variables
- Validate deployment pipeline
- Ensure cross-machine portability

---

## 1.3 Inputs

### Cloud Accounts
- Dedicated Google account for the platform.

Example:

    parabolic.platform@gmail.com

### Required Software

| Software | Purpose |
|---|---|
|Node.js (LTS)|Backend and frontend runtime|
|npm|Package manager|
|Firebase CLI|Cloud infrastructure management|
|Git|Version control|
|Browser|Authentication and console access|

---

## 1.4 Outputs

Upon completion of initialization, the system will contain:

- Two Firebase projects
- Active Firebase services
- Monorepo project structure
- Local development environment
- Firebase emulator environment
- Deployable hosting environment
- Git repository linked to remote origin

---

## 1.5 Workflow

### 1.5.1 Create Google Cloud and Firebase Projects

Create a dedicated account for platform management.

Example:

    parabolic.platform@gmail.com

Open Firebase Console:

    https://console.firebase.google.com

Create the first project.

Development project:

    Project Name: parabolic-dev

Disable Google Analytics during setup.

Create a second project for production.

Production project:

    Project Name: parabolic-prod

Production project will remain unused until later deployment phases.

---

### 1.5.2 Enable Required Firebase Services (Development Project)

Within the development project enable the following services.

Firestore Database

Configuration:

- Mode: Native
- Region: asia-south1 (or closest available region)

Authentication

Enable authentication provider:

- Email/Password

Hosting

Enable Firebase Hosting.

Cloud Functions

Cloud Functions will activate automatically during deployment.

Cloud Storage

Enable Firebase Storage for file assets.

BigQuery Integration

Link BigQuery using Firebase integrations.

BigQuery will remain unused initially and incur no cost until queries are executed.

---

### 1.5.3 Upgrade Billing Plan

Upgrade the development project to the Blaze plan.

Access:

    Firebase Console → Billing → Upgrade to Blaze

Important behavior:

- No charges occur while within free quotas
- Cloud Functions deployment requires Blaze plan
- Stripe webhooks require Blaze plan

Expected idle cost:

    ₹0–₹100/month

---

### 1.5.4 Install Local Development Tools

Perform installation on both development machines.

Install Node.js LTS version.

Download:

    https://nodejs.org

Verify installation:

    node -v
    npm -v

Both commands must output version numbers.

---

### 1.5.5 Install Firebase CLI

Install globally:

    npm install -g firebase-tools

Authenticate CLI:

    firebase login

Browser authentication will open automatically.

Login using the platform Google account.

---

### 1.5.6 Create Project Folder (Monorepo Initialization)

Create project root directory.

Example paths:

Linux:

    /home/<user>/parabolic-platform

Windows:

    C:\Users\<user>\parabolic-platform

Initialize Firebase project.

Run:

    firebase init

Select services:

- Firestore
- Functions
- Hosting
- Emulators

Select Firebase project:

    parabolic-dev

Configuration selections:

| Prompt | Selection |
|---|---|
|Functions Language|JavaScript|
|Use ESLint|Yes|
|Default filenames|Yes|

Initial project structure generated:

    functions/
    public/
    firebase.json
    .firebaserc

---

### 1.5.7 Convert to Monorepo Structure

Create additional directories manually.

Required structure:

    parabolic-platform
    │
    ├── apps
    │    ├── admin
    │    ├── student
    │    ├── exam
    │    └── vendor
    │
    ├── functions
    ├── shared
    ├── config
    ├── docs
    ├── firebase.json
    └── .firebaserc

Purpose of directories:

| Directory | Purpose |
|---|---|
|apps|Frontend portals|
|functions|Backend serverless code|
|shared|Reusable modules|
|config|Environment configuration|
|docs|Architecture documentation|

---

### 1.5.8 Setup React Admin Portal (Development Test)

Navigate to admin application directory.

    /apps/admin

Initialize React application using Vite.

Command:

    npm create vite@latest

Configuration selections:

- Framework: React
- Language: JavaScript

Install dependencies.

    cd admin
    npm install

Run development server.

    npm run dev

Browser should open automatically.

Successful launch confirms frontend tooling works.

Stop development server after verification.

---

### 1.5.9 Configure Environment Variables

Create environment configuration files in project root.

Required files:

    .env.development
    .env.production

Example development environment configuration:

    VITE_FIREBASE_PROJECT_ID=parabolic-dev
    VITE_FIREBASE_API_KEY=<firebase_api_key>

Retrieve Firebase configuration values from:

    Firebase Console → Project Settings → General → Your Apps

Register a Web App under the development project.

Copy Firebase configuration values.

Paste required values into `.env.development`.

Security rule:

Production environment variables must never be committed to version control.

---

### 1.5.10 Setup Firebase Emulator

Run local emulation environment.

Command:

    firebase emulators:start

Expected emulator services:

- Firestore Emulator
- Functions Emulator
- Hosting Emulator

Successful startup indicates local infrastructure simulation works.

Stop emulator after verification.

---

### 1.5.11 Test Deployment Pipeline

Deploy project to Firebase.

Command:

    firebase deploy

Deployment will include:

- Hosting
- Firestore rules
- Firestore indexes
- Cloud Functions (initially empty)

Firebase console will display hosting URL.

Open URL in browser.

If default hosting page loads successfully, deployment pipeline is operational.

---

### 1.5.12 Initialize Git Repository

Initialize version control in project root.

Commands:

    git init
    git add .
    git commit -m "Phase 0 completed"

Create remote repository on GitHub.

Connect repository:

    git remote add origin <repository_url>

Push repository:

    git push -u origin main

---

### 1.5.13 Verify Cross-Machine Portability

On the second development machine:

Clone repository.

    git clone <repository_url>

Enter project directory.

    cd parabolic-platform

Install dependencies.

    npm install

Authenticate Firebase.

    firebase login

Select development project.

    firebase use parabolic-dev

Run emulator.

    firebase emulators:start

If emulators start successfully, development environment is portable across machines.

---

## 1.6 Dependencies

The initialization process depends on:

- Google Cloud Platform account
- Firebase Console access
- Node.js runtime environment
- npm package manager
- Firebase CLI
- Git version control
- Web browser authentication

All dependencies must be installed prior to development.

---

## 1.7 Error Handling

Common initialization errors include:

| Error | Resolution |
|---|---|
|Node.js not installed|Install Node LTS from official website|
|Firebase CLI authentication failure|Re-run `firebase login`|
|Deployment failure|Verify Blaze billing enabled|
|Emulator startup error|Verify ports not already in use|
|Git push failure|Verify remote repository access|

All initialization failures must be resolved before progressing to development modules.

---

## 1.8 Completion Checklist

Initialization phase is complete when the following conditions are met.

| Condition | Status |
|---|---|
|Development and production Firebase projects created|Required|
|Blaze billing plan enabled|Required|
|Firestore, Authentication, Hosting, Storage enabled|Required|
|Monorepo project structure created|Required|
|React admin application runs locally|Required|
|Firebase emulator environment operational|Required|
|Deployment pipeline verified|Required|
|Git repository initialized and pushed|Required|
|Environment portable across machines|Required|

Successful completion confirms the development infrastructure is fully operational.




# 2 Multi-Tenancy Isolation Model
## 2.1 Overview

The Multi-Tenancy Isolation Model enables multiple institutes to operate within a single Firebase project while maintaining strict data isolation. Each institute behaves as if it owns an independent database despite sharing the same Firestore infrastructure.

Core objectives:

- Ensure complete logical isolation between institutes.
- Prevent cross-institute data access or leakage.
- Maintain independent analytics and operational data per institute.
- Enforce tenant binding through authentication and backend validation.

All institute-owned data must reside strictly within the institute-specific namespace.

---

## 2.2 Key Responsibilities

- Enforce strict tenant-level data partitioning.
- Bind authenticated users to a single institute via identity claims.
- Ensure all database queries remain scoped to the institute namespace.
- Prevent cross-tenant queries and joins.
- Provide vendor-level access to aggregated cross-institute data only.
- Enforce access controls via backend validation and Firestore security rules.

---

## 2.3 Inputs

### Authentication Token

User identity and tenant binding are provided via Firebase Custom Claims.

Example structure:

    {
      "uid": "user_id",
      "role": "admin | teacher | student | director | vendor",
      "instituteId": "abc123"
    }

### Request Context

Requests must reference the institute implicitly through the authenticated token.  
Client-provided institute identifiers must never be trusted.

---

## 2.4 Outputs

The system produces:

- Isolated institute-level data storage
- Role-based access enforcement
- Secure cross-institute aggregation for vendor analytics
- Segregated academic, operational, and governance datasets

All outputs are stored within institute-scoped Firestore paths unless explicitly aggregated.

---

## 2.5 Workflow

### 2.5.1 Data Partitioning

All institute data is stored under a strict hierarchical namespace.

Root structure:

    institutes/{instituteId}
        ├── profile
        ├── license
        ├── students/{studentId}
        ├── tests/{testId}
        ├── questionBank/{questionId}
        ├── academicYears/{yearId}
              ├── runs/{runId}
                    ├── sessions/{sessionId}
              ├── runAnalytics/{runId}
              ├── studentYearMetrics/{studentId}
              ├── templateAnalytics/{testId}
              ├── governanceSnapshots/{monthId}

Constraints:

- No institute-owned document may exist outside the institute subtree.
- Root-level collections must never contain institute-specific data.

---

### 2.5.2 Identity-to-Tenant Binding

User authentication binds each user to exactly one institute.

Enforcement logic:

    user.instituteId = auth.token.instituteId

Validation rule:

    request.instituteId == user.instituteId

Client-supplied institute identifiers must never be used for authorization decisions.

---

### 2.5.3 Portal-Level Access Isolation

Admin Portal

- Institute ID extracted from authentication claims.
- All queries scoped to:

      institutes/{instituteId}/...

- Admin users cannot switch institutes.

Student Portal

- Student bound to institute via claims.
- Access restricted to their own student document and permitted resources within the institute subtree.

Exam Portal

Session creation flow:

1. Student initiates test session.
2. Backend validates:
   - Student belongs to the institute.
   - Run belongs to the same institute.
3. Session stored at:

      institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

No global session collection is permitted.

---

### 2.5.4 Vendor Access Model

Vendor users operate outside the institute-bound identity model.

Vendor characteristics:

- No instituteId in authentication claims.
- Access limited to aggregated and metadata collections.

Accessible collections:

    vendorAggregates/*
    calibrationVersions/*
    globalFeatureFlags/*
    institutes/* (metadata only)

Vendor restrictions:

- No direct access to student documents.
- No access to raw session data.
- No scanning of institute subtrees.

---

### 2.5.5 Backend Enforcement

All backend functions must enforce tenant isolation.

Required validation sequence:

1. Extract authentication token.
2. Read instituteId from token.
3. Validate request path matches token instituteId.

Pseudo enforcement logic:

    if (request.instituteId !== auth.instituteId) {
        throw Unauthorized
    }

Client-provided institute identifiers must not be trusted.

---

### 2.5.6 Firestore Security Rules

Security rules enforce subtree-level access.

Institute subtree protection:

    match /institutes/{instituteId}/{document=**} {
        allow read, write:
            if request.auth.token.instituteId == instituteId
    }

Vendor access rule:

    match /vendorAggregates/{docId} {
        allow read, write:
            if request.auth.token.role == "vendor"
    }

Role-specific restrictions are applied for student, teacher, admin, and director roles.

---

### 2.5.7 Hard Isolation Safeguards

To prevent accidental cross-tenant exposure:

Safeguard 1  
Never create global collections for institute-owned data.

Safeguard 2  
Never rely on field-based isolation.

Preferred pattern:

    institutes/{instituteId}/...

Not:

    globalCollection/{docId} with instituteId field

Safeguard 3  
Disallow cross-institute joins in queries.

Safeguard 4  
Store analytics within institute namespaces unless explicitly aggregated.

---

### 2.5.8 Scaling Model

Deep namespace partitioning provides automatic horizontal scaling.

Benefits:

- Firestore distributes write loads per document path.
- High concurrency within one institute does not affect others.
- Vendor aggregation runs asynchronously without impacting institute workloads.

Supported scale:

- Approximately 500–1000 institutes within a single Firebase project.

---

### 2.5.9 Isolation Testing Strategy

Isolation must be verified before production deployment.

Testing procedure:

1. Create Institute A and Institute B.
2. Authenticate as Admin of Institute A.
3. Attempt queries against Institute B paths.

Expected result:

- Access denied.

Testing layers:

- Firestore security rules
- Backend APIs
- Frontend UI access control

---

### 2.5.10 Vendor Aggregation Model

Vendor analytics operate through precomputed aggregates.

Nightly aggregation pipeline:

1. Backend function scans institute analytics.
2. Generates summarized data.
3. Stores results in:

       vendorAggregates/{aggregateId}

Vendor users read only aggregated summaries rather than raw operational data.

Advantages:

- Prevents high-volume reads across institutes.
- Eliminates cross-tenant exposure risk.
- Improves analytics performance.

---

## 2.6 Dependencies

- Firebase Authentication
- Firebase Custom Claims
- Firestore hierarchical document model
- Firestore Security Rules
- Backend API layer (Cloud Functions or equivalent)
- Scheduled aggregation functions

---

## 2.7 Error Handling

Unauthorized access conditions include:

- Missing authentication token.
- Token without instituteId (for institute roles).
- Mismatch between request instituteId and token instituteId.
- Vendor attempting access to restricted collections.

Typical enforcement behavior:

    if (!auth.token) {
        throw AuthenticationError
    }

    if (auth.token.instituteId != path.instituteId) {
        throw UnauthorizedAccess
    }

Errors must terminate request execution immediately.

---

## 2.8 Final Multi-Tenancy Rules Summary

| Role | Access Scope |
|-----|--------------|
| Student | Own student document |
| Teacher | Full institute subtree |
| Admin | Full institute subtree |
| Director | Institute subtree + governance data |
| Vendor | Global aggregates and institute metadata |

System guarantees:

- Single Firebase project
- Strict institute-rooted partitioning
- Identity-bound tenant access
- Backend validation enforcement
- Firestore rule-level protection
- Separate vendor aggregation layer
- No global storage of institute-owned data
- Mandatory isolation testing


# 3 The Identity & RBAC (Role-Based Access Control) architecture
## 3.1 Overview

The Identity & RBAC (Role-Based Access Control) architecture governs authentication, authorization, and permission enforcement across the system. It extends Firebase Authentication identities with role, institute binding, and license-based capability controls.

The architecture ensures:

- Secure identity management.
- Institute-scoped access for most actors.
- Global operational access for vendor roles.
- Functional permission enforcement through roles and license layers.
- Backend and rule-based validation to prevent privilege escalation.

Authentication is handled through Firebase Authentication, while authorization is enforced using Custom Claims and backend validation.

---

## 3.2 Key Responsibilities

- Authenticate users via Firebase Authentication.
- Extend user identity using Firebase Custom Claims.
- Enforce role-based access control across all portals and APIs.
- Enforce institute-scoped data access.
- Implement license-layer feature gating.
- Prevent role escalation and unauthorized privilege changes.
- Bind sessions to identity snapshots to prevent mid-session privilege changes.
- Maintain immutable audit logs for identity and permission changes.

---

## 3.3 Inputs

### Authentication Credentials

Primary authentication method:

- Email + Password

Optional future extension:

- Google OAuth login

### Firebase Identity Attributes

Firebase provides base identity fields:

- uid
- email
- displayName

### Custom Claims Payload

Extended identity attributes stored in Firebase Custom Claims.

Standard claim structure:

    {
      "role": "student | teacher | admin | director | vendor",
      "instituteId": "abc123",
      "licenseLayer": "L0 | L1 | L2 | L3",
      "isVendor": false,
      "isSuspended": false
    }

Vendor claim structure:

    {
      "role": "vendor",
      "instituteId": null,
      "isVendor": true
    }

Constraints:

- Claims are server-assigned only.
- Claims cannot be modified by clients.
- Claims must update when roles or license layers change.

---

## 3.4 Outputs

The RBAC system produces:

- Role-scoped portal access control.
- Institute-bound data access.
- License-layer gated feature visibility.
- Secure API authorization decisions.
- Immutable audit records for identity changes.

---

## 3.5 Workflow

### 3.5.1 Role Model

The system defines five primary actors.

| Role | Scope |
|-----|------|
| Student | Institute-scoped |
| Teacher | Institute-scoped |
| Admin | Institute-scoped |
| Director | Institute-scoped (L3 license only) |
| Vendor | Global |

---

### 3.5.2 Role Hierarchy

Authority order:

    Vendor
      ↓
    Director
      ↓
    Admin
      ↓
    Teacher
      ↓
    Student

Important constraint:

Authority is functional, not strictly hierarchical.

Example:

- Director cannot create or modify tests.
- Director focuses on governance analytics only.

---

### 3.5.3 Portal Access Mapping

Each portal enforces role validation before rendering.

Student Portal

Allowed role:

    student

All other roles redirected.

Admin Portal

Allowed roles:

    admin
    teacher
    director

Feature visibility varies by role.

Vendor Portal

Allowed role:

    vendor

Institute users are denied access.

Exam Portal

Allowed role:

    student

Additional validations:

- Session must belong to the authenticated student.
- Session must belong to the student's institute.

---

### 3.5.4 Permission Matrix

Functional permissions per role.

Student

Allowed:

- View own assignments
- Start test sessions
- Submit tests
- View personal analytics
- View insights
- Download current-year solutions

Forbidden:

- View other students
- Access question bank
- Access admin interfaces
- Access governance dashboards
- Modify core profile attributes

---

Teacher

Allowed:

- Create tests
- Create assignments
- View student lists
- Access analytics within license limits
- Access insights within license limits

Forbidden:

- Modify license plans
- Access vendor systems
- Modify calibration models
- Access governance unless director

---

Admin

Allowed:

- All teacher capabilities
- Bulk student upload
- Academic year archiving
- User management
- Execution policy configuration
- Assign roles (excluding vendor)
- View license status (read-only)

Forbidden:

- Modify license plans
- Access vendor financial metrics
- Modify global calibration models

---

Director (L3 License Only)

Allowed:

- Governance dashboard access
- Longitudinal performance trends
- Batch risk distribution maps
- Governance report exports

Forbidden:

- Test creation
- Assignment management
- Execution policy changes
- License modification
- Calibration management

Directors are primarily analytics and governance users.

---

Vendor

Allowed:

- View all institutes
- Modify institute licenses
- Push calibration updates
- View global revenue metrics
- Access cross-institute analytics
- Access audit logs

Forbidden:

- Modify institute academic records
- Modify student documents directly
- Modify session documents

Vendor operations remain at the system governance layer.

---

### 3.5.5 Layer-Based Access Logic

Role and license layer operate independently.

Two-axis access model:

Axis 1:

    Role Permission

Axis 2:

    License Layer Permission

Access allowed only if both conditions pass.

Example:

    if (user.role == "teacher" AND licenseLayer >= L2)

Implications:

- Feature depth depends on license layer.
- UI, backend, and middleware must all enforce layer checks.

UI-only enforcement is prohibited.

---

### 3.5.6 Backend Authorization Enforcement

Every backend API must validate:

1. User authentication
2. Allowed role
3. Matching institute
4. License layer permissions

Example validation flow:

    if role not in [admin, teacher]
        reject

    if licenseLayer < requiredLayer
        reject

    if instituteId mismatch
        reject

Authorization must never rely on frontend validation.

---

### 3.5.7 Role Escalation Prevention

Security constraints prevent unauthorized privilege elevation.

Key rules:

- Only Admin can assign Teacher role within an institute.
- Only Vendor can assign Admin roles across institutes.
- Director role requires license layer L3.
- Role change events must trigger audit logs.

Role update procedure:

1. Update backend role record.
2. Update Firebase Custom Claims.
3. Force token refresh.

---

### 3.5.8 Session Binding Model

Session documents store identity snapshots to preserve execution integrity.

Session structure:

    {
      "studentId": "...",
      "instituteId": "...",
      "runId": "...",
      "calibrationVersion": "...",
      "licenseLayer": "L2"
    }

Purpose:

- Prevent privilege escalation during a running session.
- Preserve session validity if license or role changes mid-test.

---

### 3.5.9 Role + License Interaction Model

Authorization requires simultaneous validation of:

    rolePermission AND licensePermission

Examples:

- Teacher may have access to analytics.
- However, deeper analytics may require higher license layers.

This model ensures fine-grained feature control.

---

### 3.5.10 Token Refresh Strategy

Custom claims must be refreshed when identity state changes.

Trigger conditions:

- Role changes
- License layer upgrades or downgrades
- User suspension

Required actions:

1. Update custom claims on server.
2. Force client token refresh.
3. Force logout if required.

Failure to refresh tokens may cause permission inconsistencies.

---

### 3.5.11 Future Role Extensibility

The role system must support future expansion.

Potential future roles:

- Support Engineer
- QA Auditor
- Regional Director
- Data Analyst

Design requirements:

- Claim-based authorization.
- Avoid hardcoded role logic.
- Modular permission evaluation.

---

## 3.6 Dependencies

- Firebase Authentication
- Firebase Custom Claims
- Backend API authorization middleware
- Firestore Security Rules
- Portal-level route guards
- Audit logging infrastructure

---

## 3.7 Error Handling

Common authorization errors:

Unauthenticated Request

    if !auth.token
        throw AuthenticationError

Suspended User

    if auth.token.isSuspended == true
        throw AccessDenied

Unauthorized Role

    if role not allowed
        throw UnauthorizedAction

Institute Mismatch

    if auth.token.instituteId != request.instituteId
        throw UnauthorizedAccess

License Restriction

    if licenseLayer < requiredLayer
        throw LicenseRestrictionError

All authorization failures must immediately terminate request execution.

---

## 3.8 Audit Logging

Identity and permission changes must generate immutable audit records.

Logged events:

- Role assignments
- License modifications
- Calibration pushes
- Vendor overrides
- Account suspensions

Storage location:

    auditLogs/{logId}

Audit logs must be append-only and immutable.

---

## 3.9 Identity & RBAC Summary

Key system guarantees:

- Firebase Authentication as identity provider.
- Extended identity via Custom Claims.
- Strict role-based access control.
- License-layer feature gating.
- Mandatory backend authorization enforcement.
- Portal-level route guards.
- Immutable audit logging.
- Role escalation protection.
- Vendor isolation from institute operations.
- Session snapshot binding for runtime integrity.


# 4 Complete Firestore Tree Schema — Exact Field-Level Specification

## 4.1 Overview

This document defines the authoritative Firestore data schema used across the platform. The schema specifies global collections, institute-scoped data structures, academic partitions, analytics layers, governance data, calibration storage, and system infrastructure collections.

Design principles:

- Strict institute-rooted partitioning
- Immutable analytics layers
- Snapshot-based execution records
- Versioned entities for schema evolution
- Global collections reserved for vendor and infrastructure services

This specification serves as the definitive contract for backend models and Firestore structure.

---

## 4.2 Global Collections

These collections exist at the Firestore root and are not scoped to any institute.

| Collection | Purpose |
|---|---|
| vendorConfig | Vendor-level configuration |
| vendorAggregates | Cross-institute analytics summaries |
| globalCalibration | Global calibration model versions |
| emailQueue | Asynchronous email dispatch queue |
| auditLogs | Immutable system audit trail |
| systemFlags | Feature toggles and system-level flags |

Structure:

    vendorConfig/{docId}
    vendorAggregates/{aggregateId}
    globalCalibration/{versionId}
    emailQueue/{emailId}
    auditLogs/{logId}
    systemFlags/{flagId}

---

## 4.3 Institute Root Collection

Primary namespace for all institute-scoped data.

Path:

    institutes/{instituteId}

Fields:

    {
      instituteId: string,
      name: string,
      logoUrl: string,
      contactEmail: string,
      contactPhone: string,
      timezone: string,
      defaultExamType: string,
      academicYearFormat: string,
      createdAt: timestamp,
      status: "active | suspended",
      currentAcademicYear: string,
      calibrationVersion: string,
      licenseVersion: string
    }

All operational data for the institute resides under this root.

---

## 4.4 License Object

Location:

    institutes/{instituteId}/license/main

Fields:

    {
      currentLayer: "L0 | L1 | L2 | L3",
      billingPlan: string,
      startDate: timestamp,
      expiryDate: timestamp,
      billingCycle: "monthly | annual",
      activeStudentLimit: number,
      featureFlags: {
        adaptivePhase: boolean,
        controlledMode: boolean,
        hardMode: boolean,
        governanceAccess: boolean
      },
      eligibilityFlags: {
        l1Eligible: boolean,
        l2Eligible: boolean,
        l3Eligible: boolean
      },
      lastUpdated: timestamp
    }

The license object governs system capabilities and feature access.

---

## 4.5 Students Collection

Location:

    institutes/{instituteId}/students/{studentId}

Fields:

    {
      studentId: string,
      name: string,
      email: string,
      batch: string,
      status: "invited | active | inactive | archived | suspended",
      enrollmentYear: string,
      parentEmail: string,
      phone: string,
      totalTestsThisYear: number,
      rollingRiskState: string,
      avgRawScorePercent: number,
      avgAccuracyPercent: number,
      avgPhaseAdherence: number,
      disciplineIndex: number,
      guessRate: number,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    }

---

## 4.6 Question Bank

Location:

    institutes/{instituteId}/questionBank/{questionId}

Fields:

    {
      questionId: string,
      uniqueKey: string,
      version: number,
      parentQuestionId: string | null,
      examType: string,
      subject: string,
      chapter: string,
      difficulty: "Easy | Medium | Hard",
      questionType: string,
      marks: number,
      negativeMarks: number,
      correctAnswer: string,
      questionImageUrl: string,
      solutionImageUrl: string,
      tutorialVideoLink: string | null,
      simulationLink: string | null,
      tags: string[],
      usedCount: number,
      lastUsedAt: timestamp,
      status: "active | used | archived | deprecated",
      createdAt: timestamp
    }

---

## 4.7 Test Templates

Location:

    institutes/{instituteId}/tests/{testId}

Fields:

    {
      testId: string,
      name: string,
      examType: string,
      academicYear: string,
      totalQuestions: number,
      questionIds: string[],
      difficultyDistribution: {
        easy: number,
        medium: number,
        hard: number
      },
      phaseConfigSnapshot: {
        phase1Percent: number,
        phase2Percent: number,
        phase3Percent: number
      },
      timingProfile: {
        easy: { min: number, max: number },
        medium: { min: number, max: number },
        hard: { min: number, max: number }
      },
      allowedModes: string[],
      status: "draft | ready | assigned | archived | deprecated",
      version: number,
      calibrationVersion: string,
      createdAt: timestamp,
      totalRuns: number
    }

---

## 4.8 Academic Year Partition

Location:

    institutes/{instituteId}/academicYears/{yearId}

Fields:

    {
      yearId: string,
      startDate: timestamp,
      endDate: timestamp,
      status: "active | locked | archived",
      governanceSnapshotVersion: string,
      createdAt: timestamp
    }

This collection partitions all operational activity by academic cycle.

---

## 4.9 Runs (Assignments)

Location:

    institutes/{instituteId}/academicYears/{yearId}/runs/{runId}

Fields:

    {
      runId: string,
      testId: string,
      mode: "Operational | Diagnostic | Controlled | Hard",
      phaseConfigSnapshot: object,
      timingProfileSnapshot: object,
      startWindow: timestamp,
      endWindow: timestamp,
      recipientStudentIds: string[],
      recipientCount: number,
      status: "scheduled | active | collecting | completed | archived | cancelled",
      calibrationVersion: string,
      createdAt: timestamp,
      totalSessions: number
    }

Runs represent test assignments distributed to students.

---

## 4.10 Sessions

Location:

    institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

Fields:

    {
      sessionId: string,
      studentId: string,
      instituteId: string,
      licenseLayer: string,
      calibrationVersion: string,
      status: "created | started | active | submitted | expired | terminated",
      startedAt: timestamp,
      submittedAt: timestamp,
      totalTimeSpent: number,
      rawScorePercent: number,
      accuracyPercent: number,
      phaseAdherencePercent: number,
      guessRate: number,
      disciplineIndex: number,
      minTimeViolationPercent: number,
      maxTimeViolationPercent: number,
      riskState: string,
      overrideUsed: boolean,
      answerMap: {
        questionId: {
          selectedOption: string,
          timeSpent: number,
          isCorrect: boolean
        }
      }
    }

Sessions capture the full execution record of a student attempting a test.

---

## 4.11 Run Analytics

Location:

    institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}

Fields:

    {
      avgRawScorePercent: number,
      avgAccuracyPercent: number,
      stdDeviation: number,
      completionRate: number,
      riskDistribution: object,
      disciplineAverage: number,
      phaseAdherenceAverage: number,
      guessRateAverage: number,
      overrideCount: number,
      createdAt: timestamp
    }

---

## 4.12 Student Year Metrics

Location:

    institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}

Fields:

    {
      avgRawScorePercent: number,
      avgAccuracyPercent: number,
      avgPhaseAdherence: number,
      easyNeglectRate: number,
      hardBiasRate: number,
      guessRate: number,
      disciplineIndex: number,
      riskState: string,
      riskScore: number,
      totalTests: number,
      lastUpdated: timestamp
    }

---

## 4.13 Template Analytics

Location:

    institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId}

Fields:

    {
      totalRuns: number,
      avgRawScorePercent: number,
      avgAccuracyPercent: number,
      stabilityIndex: number,
      difficultyConsistencyScore: number,
      phaseVariance: number,
      riskShiftIndex: number,
      lastUpdated: timestamp
    }

---

## 4.14 Governance Snapshots

Location:

    institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{monthId}

Fields:

    {
      stabilityIndex: number,
      disciplineTrend: number,
      riskClusterDistribution: object,
      overrideFrequency: number,
      phaseCompliancePercent: number,
      createdAt: timestamp
    }

Governance snapshots store monthly institutional performance indicators.

---

## 4.15 Calibration Collections

Global calibration versions:

    globalCalibration/{versionId}

Institute-specific overrides:

    institutes/{instituteId}/calibration/{versionId}

Fields:

    {
      versionId: string,
      weights: {
        guessWeight: number,
        phaseWeight: number,
        easyNeglectWeight: number,
        hardBiasWeight: number,
        wrongStreakWeight: number
      },
      thresholds: {
        guessFactorEasy: number,
        guessFactorMedium: number,
        guessFactorHard: number,
        phaseDeviationThreshold: number
      },
      createdBy: string,
      activationDate: timestamp,
      isActive: boolean
    }

---

## 4.16 Email Queue

Location:

    emailQueue/{emailId}

Fields:

    {
      recipientEmail: string,
      instituteId: string,
      subject: string,
      templateType: string,
      payload: object,
      status: "pending | sent | failed",
      retryCount: number,
      createdAt: timestamp,
      sentAt: timestamp
    }

The email queue supports asynchronous notification delivery.

---

## 4.17 Audit Logs

Location:

    auditLogs/{logId}

Fields:

    {
      actorUid: string,
      actorRole: string,
      instituteId: string | null,
      actionType: string,
      targetCollection: string,
      targetId: string,
      metadata: object,
      timestamp: timestamp
    }

Audit logs must be immutable.

---

## 4.18 Vendor Aggregates

Location:

    vendorAggregates/monthly/{monthId}

Fields:

    {
      totalInstitutes: number,
      totalStudents: number,
      avgStabilityIndex: number,
      avgDisciplineIndex: number,
      riskClusterGlobalDistribution: object,
      revenueProjection: number,
      generatedAt: timestamp
    }

Vendor aggregates contain cross-institute metrics without exposing raw institute data.

---

## 4.19 Versioning Strategy

Every major entity must include versioning metadata.

Standard fields:

    {
      version: number,
      calibrationVersion: string,
      schemaVersion: string
    }

Versioning rules:

- Structural schema changes require version increments.
- Calibration references must remain immutable within snapshots.
- Schema version ensures backward compatibility across deployments.


# 5 FIRESTORE SECURITY RULES (FULL SPEC)

## 5.1 Overview

This document defines the production-grade Firestore Security Rules that enforce tenant isolation, role-based access control (RBAC), session integrity, license gating, and immutable data protection.

The rules operate as the final access control layer protecting the Firestore database. All client interactions must pass these rules before data access or modification is allowed.

Primary enforcement goals:

- Tenant-level isolation across institutes
- Role-based data access restrictions
- Student session isolation
- License-layer feature gating
- Immutable protection for critical entities
- Vendor-only access for global system collections
- Read-only enforcement for analytics collections

Rules are implemented using Firestore Security Rules v2.

---

## 5.2 Key Responsibilities

The Firestore security layer enforces:

- Authentication validation
- Tenant isolation based on instituteId
- Role-based authorization
- Immutable field guards
- Protection against unauthorized updates
- License-based feature access
- Vendor-only system configuration access

These rules complement backend validation performed by Cloud Functions.

---

## 5.3 Inputs

### Authentication Token

All requests must include a Firebase Authentication token with the following claims.

    {
      uid: string,
      role: "student | teacher | admin | director | vendor",
      instituteId: string | null,
      licenseLayer: "L0 | L1 | L2 | L3"
    }

### Request Context

Security rule evaluations reference:

- request.auth
- request.resource.data
- resource.data
- request.auth.token.*

---

## 5.4 Outputs

The rule engine produces one of two outcomes:

| Result | Meaning |
|------|------|
| allow | Operation permitted |
| deny | Operation rejected |

Denied operations immediately terminate without database access.

---

## 5.5 Workflow

### 5.5.1 Helper Functions

Common logic used across rule evaluations.

    function isAuthenticated() {
      return request.auth != null;
    }

    function getRole() {
      return request.auth.token.role;
    }

    function getInstituteId() {
      return request.auth.token.instituteId;
    }

    function getLicenseLayer() {
      return request.auth.token.licenseLayer;
    }

    function isVendor() {
      return request.auth.token.role == "vendor";
    }

    function isAdmin() {
      return request.auth.token.role == "admin";
    }

    function isTeacher() {
      return request.auth.token.role == "teacher";
    }

    function isDirector() {
      return request.auth.token.role == "director";
    }

    function isStudent() {
      return request.auth.token.role == "student";
    }

    function isInstituteUser(instituteId) {
      return isAuthenticated() &&
             request.auth.token.instituteId == instituteId;
    }

    function isAdminOrTeacher() {
      return isAdmin() || isTeacher();
    }

    function isAdminTeacherOrDirector() {
      return isAdmin() || isTeacher() || isDirector();
    }

---

### 5.5.2 License Layer Validation

License layers determine feature access eligibility.

    function licenseAtLeast(layer) {
      return getLicenseLayer() == layer
        || (getLicenseLayer() == "L3")
        || (getLicenseLayer() == "L2" && layer != "L3")
        || (getLicenseLayer() == "L1" && (layer == "L0" || layer == "L1"))
        || (getLicenseLayer() == "L0" && layer == "L0");
    }

License gating is applied to advanced analytics and governance access.

---

### 5.5.3 Global Collection Rules

Global collections are restricted to vendor users only.

    match /vendorAggregates/{docId} {
      allow read, write: if isVendor();
    }

    match /globalCalibration/{docId} {
      allow read, write: if isVendor();
    }

    match /vendorConfig/{docId} {
      allow read, write: if isVendor();
    }

    match /systemFlags/{docId} {
      allow read, write: if isVendor();
    }

    match /emailQueue/{emailId} {
      allow read, write: if isVendor();
    }

Audit logs are immutable from client contexts.

    match /auditLogs/{logId} {
      allow read: if isVendor();
      allow write: if false;
    }

---

### 5.5.4 Institute Root Access

Institute documents enforce strict tenant isolation.

    match /institutes/{instituteId} {

      allow read: if isInstituteUser(instituteId);
      allow write: if isVendor();

Vendor users manage institute-level metadata.

---

### 5.5.5 Student Collection Rules

Students can only access their own records. Teachers and admins can access all institute students.

    match /students/{studentId} {

      allow read: if isInstituteUser(instituteId)
                   && (isAdminTeacherOrDirector()
                       || (isStudent() && request.auth.uid == studentId));

      allow create: if isInstituteUser(instituteId)
                     && isAdminOrTeacher();

      allow update: if isInstituteUser(instituteId)
                     && isAdminOrTeacher();

      allow delete: if false;
    }

Hard deletion is prohibited.

---

### 5.5.6 Question Bank Rules

Question bank edits are restricted to authorized staff.

Structural properties are immutable.

    match /questionBank/{questionId} {

      allow read: if isInstituteUser(instituteId)
                   && isAdminTeacherOrDirector();

      allow create: if isInstituteUser(instituteId)
                     && isAdminOrTeacher();

      allow update: if isInstituteUser(instituteId)
                     && isAdminOrTeacher()
                     && request.resource.data.difficulty
                        == resource.data.difficulty
                     && request.resource.data.marks
                        == resource.data.marks
                     && request.resource.data.negativeMarks
                        == resource.data.negativeMarks
                     && request.resource.data.correctAnswer
                        == resource.data.correctAnswer;

      allow delete: if false;
    }

---

### 5.5.7 Test Template Rules

Templates cannot be structurally modified once assigned.

    match /tests/{testId} {

      allow read: if isInstituteUser(instituteId)
                   && isAdminTeacherOrDirector();

      allow create: if isInstituteUser(instituteId)
                     && isAdminOrTeacher();

      allow update: if isInstituteUser(instituteId)
                     && isAdminOrTeacher()
                     && resource.data.status != "assigned";

      allow delete: if false;
    }

---

### 5.5.8 Academic Year Rules

Academic year partitions are managed by administrators.

    match /academicYears/{yearId} {

      allow read: if isInstituteUser(instituteId);

      allow update: if isInstituteUser(instituteId)
                     && isAdmin();

      allow create: if isInstituteUser(instituteId)
                     && isAdmin();

      allow delete: if false;

---

### 5.5.9 Run Management Rules

Test assignments (runs) are managed by teachers and administrators.

    match /runs/{runId} {

      allow read: if isInstituteUser(instituteId);

      allow create: if isInstituteUser(instituteId)
                     && isAdminOrTeacher();

      allow update: if isInstituteUser(instituteId)
                     && isAdminOrTeacher()
                     && resource.data.status != "completed";

      allow delete: if false;

---

### 5.5.10 Session Security Rules

Students can only interact with their own sessions.

Sessions cannot be modified after submission.

    match /sessions/{sessionId} {

      allow read: if isInstituteUser(instituteId)
                   && (
                        isAdminTeacherOrDirector()
                        || (isStudent()
                            && request.auth.uid == resource.data.studentId)
                      );

      allow create: if isInstituteUser(instituteId)
                     && isStudent()
                     && request.auth.uid == request.resource.data.studentId;

      allow update: if isInstituteUser(instituteId)
                     && isStudent()
                     && request.auth.uid == resource.data.studentId
                     && resource.data.status != "submitted";

      allow delete: if false;
    }

---

### 5.5.11 Analytics Access Rules

Analytics collections are read-only for users.

Writes occur only through backend systems.

    match /runAnalytics/{runId} {
      allow read: if isInstituteUser(instituteId)
                   && isAdminTeacherOrDirector();
      allow write: if false;
    }

    match /studentYearMetrics/{studentId} {
      allow read: if isInstituteUser(instituteId)
                   && (
                        isAdminTeacherOrDirector()
                        || (isStudent()
                            && request.auth.uid == studentId)
                      );
      allow write: if false;
    }

    match /templateAnalytics/{testId} {
      allow read: if isInstituteUser(instituteId)
                   && isAdminTeacherOrDirector();
      allow write: if false;
    }

---

### 5.5.12 Governance Snapshot Rules

Governance analytics are restricted to directors with appropriate license layers.

    match /governanceSnapshots/{monthId} {
      allow read: if isInstituteUser(instituteId)
                   && isDirector()
                   && licenseAtLeast("L3");
      allow write: if false;
    }

---

### 5.5.13 Calibration Rules

Calibration models can only be modified by vendor administrators.

    match /calibration/{versionId} {
      allow read: if isInstituteUser(instituteId)
                   && isAdmin();
      allow write: if isVendor();
    }

---

### 5.5.14 License Rules

License documents are vendor-controlled.

    match /license/{docId} {
      allow read: if isInstituteUser(instituteId);
      allow write: if isVendor();
    }

---

## 5.6 Dependencies

Security rules rely on:

- Firebase Authentication
- Custom claims for role and instituteId
- Backend Cloud Functions for complex validation
- Immutable schema enforcement in Firestore documents

---

## 5.7 Error Handling

Requests are rejected when:

- Authentication token is missing
- instituteId does not match the document path
- User role lacks required privileges
- License layer requirements are not satisfied
- Immutable fields are modified
- Attempted writes target restricted collections

Denied operations return permission errors to the client and no database operation is executed.


# 6 API Endpoint Contract — Full Engineering Specification.

## 6.1 Overview

This document defines the REST API contract used by the platform backend. The contract governs how frontend clients, administrative systems, and vendor tools interact with backend services implemented using Firebase Cloud Functions.

The API architecture enforces:

- Token-based authentication using Firebase ID tokens
- Tenant isolation via instituteId
- Role-based authorization
- License-layer feature gating
- Strict request validation
- Consistent response format

Base API domain:

    https://api.yourdomain.com/v1/

All endpoints require an Authorization header:

    Authorization: Bearer <firebase_id_token>

The backend extracts the following fields from the token:

- uid
- role
- instituteId
- licenseLayer

---

## 6.2 Key Responsibilities

The API layer is responsible for:

- Authenticating incoming requests using Firebase ID tokens
- Enforcing RBAC (Role-Based Access Control)
- Validating tenant ownership
- Enforcing license-layer feature availability
- Validating request schema and field types
- Enforcing immutable entity constraints
- Triggering backend workflows (analytics, pattern engine, aggregations)

The API must assume that the frontend is untrusted.

---

## 6.3 Inputs

### Authentication Header

All API requests must include:

    Authorization: Bearer <firebase_id_token>

### Token Claims Used

    {
      uid: string,
      role: "student | teacher | admin | director | vendor",
      instituteId: string | null,
      licenseLayer: "L0 | L1 | L2 | L3"
    }

### Request Payload

Payloads must:

- Match endpoint schema exactly
- Contain no unknown fields
- Respect enum constraints
- Pass type validation

---

## 6.4 Outputs

### Standard Success Response

    {
      "success": true,
      "data": { ... },
      "meta": {
        "timestamp": "ISO_DATE",
        "requestId": "uuid"
      }
    }

### Standard Error Response

    {
      "success": false,
      "error": {
        "code": "ERROR_CODE",
        "message": "Human readable message"
      },
      "meta": {
        "timestamp": "ISO_DATE",
        "requestId": "uuid"
      }
    }

---

## 6.5 Standard Error Codes

| Code | Meaning |
|-----|------|
| UNAUTHORIZED | No valid authentication token |
| FORBIDDEN | Role does not have permission |
| TENANT_MISMATCH | Request institute differs from token |
| LICENSE_RESTRICTED | License layer insufficient |
| VALIDATION_ERROR | Request schema invalid |
| NOT_FOUND | Resource does not exist |
| SESSION_LOCKED | Session immutable |
| WINDOW_CLOSED | Assignment window expired |
| INTERNAL_ERROR | Server failure |

---

## 6.6 Workflow

### 6.6.1 Authentication Validation

Every request must pass the following checks:

1. Firebase token exists
2. Token signature valid
3. Token not expired
4. Token claims parsed
5. Token contains role and instituteId (except vendor)

If validation fails:

    return UNAUTHORIZED

---

### 6.6.2 Tenant Isolation Enforcement

For institute-scoped endpoints:

    if request.instituteId != token.instituteId
        return TENANT_MISMATCH

Vendor endpoints bypass institute matching.

---

### 6.6.3 License Enforcement

Certain features require minimum license layers.

Example:

    if mode == "Controlled" AND licenseLayer < L2
        return LICENSE_RESTRICTED

License checks must be enforced in backend logic.

---

## 6.7 Admin Endpoints

### Create Test Template

Endpoint:

    POST /admin/tests

Allowed roles:

- admin
- teacher

Request:

    {
      "name": "Mock Test 1",
      "examType": "JEE Main",
      "academicYear": "2025-26",
      "questionIds": ["q1","q2","q3"],
      "durationMinutes": 180,
      "allowedModes": ["Operational","Diagnostic","Controlled"]
    }

Validation rules:

- Questions must belong to same institute
- Question count > 0
- Controlled mode requires license support

---

### Create Assignment (Run)

Endpoint:

    POST /admin/runs

Request:

    {
      "testId": "test123",
      "mode": "Controlled",
      "startWindow": "ISO_DATE",
      "endWindow": "ISO_DATE",
      "recipientStudentIds": ["s1","s2"]
    }

Validation rules:

- Role must be admin or teacher
- License must allow selected mode
- startWindow > current time
- Students must belong to institute

---

### Bulk Upload Students

Endpoint:

    POST /admin/students/bulk

Request:

    {
      "students": [
        {
          "studentId": "S101",
          "name": "John",
          "email": "john@example.com",
          "batch": "A1"
        }
      ],
      "deactivateMissing": true
    }

Validation rules:

- Admin role required
- Duplicate student IDs rejected
- Email format validation required

---

### Archive Academic Year

Endpoint:

    POST /admin/academicYear/archive

Validation rules:

- Admin role required
- Double confirmation flag required
- Governance snapshot must be generated

---

## 6.8 Student Endpoints

### Get Dashboard Summary

Endpoint:

    GET /student/dashboard

Response fields:

    {
      avgRawScorePercent: number,
      avgAccuracyPercent: number,
      riskState: string,
      disciplineIndex: number,
      upcomingTests: [...]
    }

Validation:

- Role must be student
- Token institute must match session institute

---

### Get Student Tests

Endpoint:

    GET /student/tests?status=completed

Returns:

- testId
- rawScorePercent
- accuracyPercent
- solutionDownloadUrl (if permitted)

---

### Get Student Performance

Endpoint:

    GET /student/performance?lastN=10

Returns performance trends:

- score trend arrays
- phase adherence metrics
- guess rate trend
- risk timeline

---

## 6.9 Exam Endpoints

### Start Session

Endpoint:

    POST /exam/start

Request:

    {
      "runId": "run123"
    }

Response:

    {
      "sessionId": "sess456",
      "signedToken": "JWT_TOKEN"
    }

Validation rules:

- Student role required
- Run must be active
- Current time within assignment window
- Student must not have active session

---

### Submit Answer Batch

Endpoint:

    POST /exam/session/{sessionId}/answers

Request:

    {
      "answers": [
        {
          "questionId": "q1",
          "selectedOption": "A",
          "timeSpent": 45
        }
      ]
    }

Validation rules:

- Session belongs to authenticated student
- Session not submitted
- timeSpent ≥ 0
- Hard mode rules enforced

---

### Submit Session

Endpoint:

    POST /exam/session/{sessionId}/submit

Response:

    {
      "rawScorePercent": 74,
      "accuracyPercent": 82,
      "riskState": "Drift-Prone"
    }

Backend operations:

- Lock session
- Compute scoring metrics
- Execute pattern engine
- Update runAnalytics
- Update studentYearMetrics

---

## 6.10 Vendor Endpoints

### Update Institute License

Endpoint:

    POST /vendor/license/update

Request:

    {
      "instituteId": "abc123",
      "newLayer": "L2",
      "billingPlan": "Controlled"
    }

Vendor role required.

---

### Push Calibration Model

Endpoint:

    POST /vendor/calibration/push

Request:

    {
      "versionId": "v5",
      "targetInstitutes": ["abc123","xyz456"]
    }

Backend must create calibrationVersion entries.

---

### Run Calibration Simulation

Endpoint:

    POST /vendor/calibration/simulate

Request:

    {
      "weights": { ... },
      "institutes": ["abc123"]
    }

Response:

    {
      "before": {...},
      "after": {...},
      "delta": {...}
    }

Simulation uses aggregated metrics only.

---

## 6.11 Session Write Batching Contract

Exam answer writes must follow batching rules.

Constraints:

- Maximum answers per batch: 10
- Minimum write interval: 5 seconds
- Server merges answers into session.answerMap

Example structure:

    answerMap: {
      questionId: {
        selectedOption: string,
        timeSpent: number,
        isCorrect: boolean
      }
    }

---

## 6.12 Email Queue Contract

Internal endpoint for backend-triggered notifications.

Endpoint:

    POST /internal/email/queue

Request:

    {
      "recipientEmail": "...",
      "templateType": "onboarding",
      "payload": { ... }
    }

Access restriction:

- Backend service role only

---

## 6.13 Testing Requirements

Every endpoint must include automated tests.

Required test categories:

- Valid request success path
- Authentication failure
- Role violation attempt
- Cross-tenant access attempt
- License restriction violation
- Invalid request payload
- Immutable entity modification attempt

All endpoints must support deterministic error responses.

---

## 6.14 Dependencies

API functionality depends on:

- Firebase Authentication
- Firebase Custom Claims
- Firestore database
- Cloud Functions backend
- License validation middleware
- Pattern engine analytics services

---

## 6.15 Error Handling

The API must return structured errors for:

- Missing authentication tokens
- Unauthorized roles
- Institute mismatches
- License restrictions
- Validation failures
- Immutable data violations
- Session lock attempts

All errors must include:

- error.code
- error.message
- requestId
- timestamp


# 7 Complete Routing Map (All Portals)

## 7.1 Overview

This document defines the complete frontend routing architecture across all portals in the platform. The routing map includes domain mapping, route guards, role enforcement, license-layer gating, redirect behavior, and module-level lazy loading.

The routing layer enforces:

- Authentication validation
- Role-based route access
- License-layer feature gating
- Institute status checks
- Suspension checks
- Secure redirect handling

The specification is designed to allow deterministic generation of React routing structures with middleware guards.

---

## 7.2 Domain Structure

| Domain | Purpose |
|------|------|
| yourdomain.com | Public marketing site |
| portal.yourdomain.com | Admin and Student portal |
| exam.yourdomain.com | Test execution engine |
| vendor.yourdomain.com | Vendor dashboard |

Director users operate within the Admin portal under governance routes.

---

## 7.3 Global Route Guard Rules

Every protected route must enforce the following validations:

1. User must be authenticated
2. Role must be permitted for the route
3. License layer must satisfy route requirements
4. Institute must be active
5. User account must not be suspended

If any validation fails:

- Redirect to `/login` when unauthenticated
- Redirect to `/unauthorized` when access denied

---

## 7.4 Admin Portal Routes

Base domain:

portal.yourdomain.com/admin/*

Accessible roles:

- admin
- teacher
- director (restricted areas)

---

### Admin Overview

Route:

/admin/overview

Visible to:

- admin
- teacher
- director

Page content adjusts based on role and license layer.

---

### Students Management

Routes:

/admin/students  
/admin/students/list  
/admin/students/bulk-upload  
/admin/students/lifecycle  
/admin/students/batches  
/admin/students/archive  
/admin/students/{studentId}

Accessible roles:

- admin
- teacher

Director users do not access student management.

---

### Test Templates

Routes:

/admin/tests  
/admin/tests/create  
/admin/tests/{testId}  
/admin/tests/analytics/{testId}

Accessible roles:

- admin
- teacher

---

### Assignments (Runs)

/admin/assignments  
/admin/assignments/create  
/admin/assignments/live/{runId}

Accessible roles:

- admin
- teacher

---

### Analytics

Routes:

/admin/analytics/overview  
/admin/analytics/run/{runId}  
/admin/analytics/student/{studentId}  
/admin/analytics/template/{testId}  
/admin/analytics/trends  

Accessible roles:

- admin
- teacher
- director

---

### Insights

Routes:

/admin/insights/risk  
/admin/insights/student/{studentId}  
/admin/insights/patterns  
/admin/insights/interventions  
/admin/insights/execution  

License layer gating:

| Layer | Access |
|------|------|
| L1 | Basic insights |
| L2 | Execution analytics |
| L3 | Same as L2 |

Accessible roles:

- admin
- teacher
- director (read-only advanced view)

---

### Governance (L3 Only)

Routes:

/admin/governance/stability  
/admin/governance/integrity  
/admin/governance/override-audit  
/admin/governance/batch-risk  
/admin/governance/trends  
/admin/governance/reports  

Access rules:

- Role must be `director`
- License layer must be `L3`

Redirect if violation:

redirect("/admin/overview")

---

### Settings

Routes:

/admin/settings/profile  
/admin/settings/academic-year  
/admin/settings/execution-policy  
/admin/settings/users  
/admin/settings/security  
/admin/settings/data  
/admin/settings/system  

Accessible role:

- admin only

---

### Licensing

Routes:

/admin/licensing/current  
/admin/licensing/features  
/admin/licensing/eligibility  
/admin/licensing/usage  
/admin/licensing/history  

Accessible roles:

- admin
- director (read-only)

License modification is restricted to vendor systems.

---

## 7.5 Student Portal Routes

Base path:

portal.yourdomain.com/student/*

Required role:

- student

---

### Student Dashboard

Route:

/student/dashboard

Displays:

- performance summary
- risk status
- upcoming assignments

---

### My Tests

Routes:

/student/my-tests  
/student/my-tests/completed  
/student/my-tests/archived  

---

### Performance

Routes:

/student/performance  
/student/performance/{testId}

Displays historical trends and analytics.

---

### Insights (L1+)

/student/insights

Hidden for license layer L0.

---

### Discipline Metrics (L2+)

/student/discipline

Visible only for license layer L2 and above.

---

### Profile

Route:

/student/profile

Editable fields limited to personal information.

---

## 7.6 Exam Portal Routes

Domain:

exam.yourdomain.com

Single execution route:

/session/{sessionId}

Execution flow:

1. Validate session token
2. Validate session ownership
3. Load session snapshot
4. Load test template snapshot
5. Initialize exam engine

If token invalid:

redirect to student portal.

---

## 7.7 Vendor Portal Routes

Base path:

vendor.yourdomain.com/vendor/*

Required role:

- vendor

---

### Vendor Overview

Route:

/vendor/overview

Displays global operational metrics.

---

### Institutes

Routes:

/vendor/institutes  
/vendor/institutes/{instituteId}

---

### Licensing Management

Route:

/vendor/licensing

Used for modifying institute licenses.

---

### Calibration

Routes:

/vendor/calibration  
/vendor/calibration/simulate  
/vendor/calibration/history  

Provides calibration simulation and deployment tools.

---

### Global Intelligence

Route:

/vendor/intelligence

Cross-institute behavioral analytics.

---

### Revenue Dashboard

Route:

/vendor/revenue

Displays subscription and billing metrics.

---

### System Health

Route:

/vendor/system-health

Displays:

- Firestore usage
- Cloud Function usage
- error logs

---

### Audit Logs

Route:

/vendor/audit

Full system audit viewer.

---

## 7.8 Route Permission Matrix

| Route | Student | Teacher | Admin | Director | Vendor |
|------|------|------|------|------|------|
| /admin/* | No | Partial | Yes | Governance only | No |
| /student/* | Yes | No | No | No | No |
| /session/* | Yes | No | No | No | No |
| /vendor/* | No | No | No | No | Yes |

---

## 7.9 Route Guard Middleware Flow

Example middleware logic:

    if (!authenticated)
        redirect("/login")

    if (route.startsWith("/admin") && role not allowed)
        redirect("/unauthorized")

    if (route == "/admin/governance" && licenseLayer != "L3")
        redirect("/admin/overview")

    if (route.startsWith("/student") && role != "student")
        redirect("/unauthorized")

    if (route.startsWith("/vendor") && role != "vendor")
        redirect("/unauthorized")

---

## 7.10 Redirect Logic

Post-login redirect behavior:

| Role | Redirect |
|------|------|
| Student | /student/dashboard |
| Teacher | /admin/overview |
| Admin | /admin/overview |
| Director | /admin/governance |
| Vendor | /vendor/overview |

---

## 7.11 Performance Strategy

Frontend routing should use code splitting and lazy loading.

Principles:

- Lazy-load major route modules
- Split vendor portal build separately
- Split exam portal build separately
- Load only required feature bundles

Example:

    const GovernancePage = lazy(() => import('./GovernancePage'));

---

## 7.12 Folder Structure for Code Generation

Recommended React project structure:

    src/
      admin/
        overview/
        students/
        tests/
        assignments/
        analytics/
        insights/
        governance/
        settings/
        licensing/
      student/
        dashboard/
        myTests/
        performance/
        insights/
        discipline/
      exam/
        session/
      vendor/
        overview/
        institutes/
        licensing/
        calibration/
        intelligence/
        revenue/
        systemHealth/
        audit/
      shared/
        components/
        guards/
        hooks/

This structure supports modular routing, code-splitting, and maintainable guard logic.

---

## 7.13 Dependencies

Routing architecture depends on:

- React Router
- Firebase Authentication
- Token claim extraction
- Middleware guard utilities
- Lazy-loading infrastructure
- Role and license-layer validation hooks

---

## 7.14 Error Handling

Routing errors occur when:

- User attempts unauthorized route
- License layer insufficient
- User suspended
- Institute inactive
- Session token invalid

Handling rules:

- Unauthorized access → `/unauthorized`
- Unauthenticated access → `/login`
- License violation → redirect to nearest valid route
- Invalid session → redirect to `/student/dashboard`



# 8 Middleware Enforcement Rules 

## 8.1 Overview

The Middleware Enforcement Layer acts as the primary backend protection mechanism for all API endpoints. It ensures that requests are validated, authorized, and constrained before reaching business logic or database operations.

Middleware is implemented within the API gateway layer using Node.js Cloud Functions and Express-style middleware.

Objectives:

- Prevent unauthorized API access
- Enforce tenant isolation
- Enforce role-based permissions
- Enforce license-layer restrictions
- Prevent immutable data modification
- Attach verified context to request objects
- Standardize failure handling

Firestore Security Rules remain the final defensive layer but must not be relied upon as the primary enforcement mechanism.

---

## 8.2 Middleware Stack Architecture

Every request must pass through a strict middleware chain before business logic executes.

Execution chain:

    Auth → Suspension → Tenant → Role → License → Layer → Mode → Immutable → Validation → Controller

Execution must stop immediately if any middleware fails.

No middleware may be skipped unless explicitly defined (e.g., vendor endpoints skipping tenant guard).

---

## 8.3 Auth Middleware

Purpose:

- Validate Firebase ID token
- Decode token claims
- Extract identity attributes

Expected token payload:

    {
      uid: string,
      role: "student | teacher | admin | director | vendor",
      instituteId: string | null,
      licenseLayer: "L0 | L1 | L2 | L3",
      isVendor: boolean,
      isSuspended: boolean
    }

Validation steps:

1. Authorization header exists
2. Token signature valid
3. Token not expired
4. Token contains required claims

Failure result:

    UNAUTHORIZED

On success, attach token claims to request context.

---

## 8.4 Tenant Guard

Purpose:

Prevent cross-institute data access.

Rule:

    if request.context.instituteId != token.instituteId
        reject

Important constraints:

- Never trust instituteId from request body
- Never derive instituteId from client input
- All Firestore paths must derive instituteId from token

Vendor exception:

- Vendor tokens contain no instituteId
- Tenant guard skipped for vendor endpoints

Failure code:

    TENANT_MISMATCH

---

## 8.5 Role Guard

Purpose:

Ensure that the caller's role is permitted for the endpoint.

Each endpoint defines:

    allowedRoles = ["admin", "teacher"]

Middleware logic:

    if token.role not in allowedRoles
        reject

Example mapping:

| Endpoint | Allowed Roles |
|--------|---------------|
| Create Test | admin, teacher |
| Archive Academic Year | admin |
| Start Session | student |
| Push Calibration | vendor |

Failure code:

    FORBIDDEN

---

## 8.6 License Guard

Purpose:

Enforce commercial feature restrictions based on license layer.

Each endpoint defines:

    requiredLayer = "L2"

Layer hierarchy:

    L0 < L1 < L2 < L3

Validation:

    if token.licenseLayer < requiredLayer
        reject

Example feature gating:

| Feature | Required Layer |
|-------|---------------|
| Insights | L1 |
| Controlled Mode | L2 |
| Governance | L3 |

Failure code:

    LICENSE_RESTRICTED

---

## 8.7 Layer Guard

Purpose:

Control feature depth inside otherwise permitted endpoints.

Example:

Endpoint:

    GET /admin/analytics/template/{testId}

Access rules:

| License Layer | Allowed Depth |
|--------------|--------------|
| L1 | Basic statistics |
| L2 | Advanced analytics |
| L3 | Full analytics |

Middleware behavior:

Attach license depth to request context.

    request.context.maxDepth = token.licenseLayer

Controllers must respect depth limits when building responses.

---

## 8.8 Mode Restriction Guard

Purpose:

Restrict assignment modes based on license level.

Applicable to assignment creation endpoints.

Example request:

    {
      "mode": "Controlled"
    }

Validation rules:

| Mode | Required Layer |
|-----|---------------|
| Operational | L0 |
| Diagnostic | L1 |
| Controlled | L2 |
| Hard | L2 |

Validation logic:

    if mode == "Controlled" AND licenseLayer < L2
        reject

    if mode == "Hard" AND licenseLayer < L2
        reject

Failure code:

    LICENSE_RESTRICTED

---

## 8.9 Vendor-Only Guard

Purpose:

Restrict system-level endpoints to vendor users.

Applicable endpoints:

    /vendor/*
    /vendor/calibration/*
    /vendor/licensing/*
    /vendor/analytics/*

Validation rule:

    if token.role != "vendor"
        reject

Additional restrictions:

- Vendor must not access raw student data
- Vendor must not access session documents
- Vendor must only access aggregated datasets

Failure code:

    FORBIDDEN

---

## 8.10 Suspension Guard

Purpose:

Prevent suspended accounts from accessing system functionality.

Validation:

    if token.isSuspended == true
        reject

Applies to:

- student
- teacher
- admin
- director
- vendor

Failure code:

    FORBIDDEN

---

## 8.11 Immutable Guard Hook

Purpose:

Prevent modification of immutable resources.

Guard must run before any database update.

Protected entities:

| Entity | Immutable Condition |
|------|---------------------|
| Session | status == submitted |
| Template | status == assigned |
| Academic Year | status == archived |
| Run | status == completed |

Example logic:

    if resource.status == "submitted"
        reject update

Immutable enforcement must exist both in middleware and Firestore rules.

---

## 8.12 Example Enforcement Flow

Example endpoint:

    POST /admin/runs

Execution flow:

1. Auth middleware validates token
2. Suspension guard verifies account status
3. Tenant guard validates institute ownership
4. Role guard verifies admin or teacher role
5. License guard verifies feature availability
6. Mode restriction guard validates assignment mode
7. Request schema validation executes
8. Controller performs database write

If any step fails, execution terminates immediately.

---

## 8.13 Failure Response Standard

All middleware failures must return a standardized response.

Response structure:

    {
      "success": false,
      "error": {
        "code": "FORBIDDEN",
        "message": "Insufficient role privileges"
      },
      "meta": {
        "timestamp": "ISO_DATE",
        "requestId": "UUID"
      }
    }

Requirements:

- No internal implementation details exposed
- Consistent error codes
- Unique requestId for traceability

---

## 8.14 Context Attachment Strategy

After authentication and validation, middleware attaches identity context to the request.

Structure:

    request.context = {
      uid: string,
      role: string,
      instituteId: string,
      licenseLayer: string,
      isVendor: boolean
    }

Controllers must only read identity information from `request.context`.

Token parsing must not occur inside business logic.

---

## 8.15 Security Principles

The middleware layer must follow strict security practices.

Key rules:

1. Never trust frontend input
2. Never rely solely on Firestore rules
3. Always validate role permissions
4. Always validate enum values
5. Always validate object schema
6. Always enforce tenant boundaries
7. Always enforce immutable resource protection
8. Always centralize identity context

Middleware enforcement forms the core security backbone of the backend API architecture.

---

## 8.16 Dependencies

Middleware enforcement depends on:

- Firebase Authentication token verification
- Express middleware framework
- Role-based permission configuration
- License-layer configuration
- API request validation library
- Logging and monitoring infrastructure


# 9 Firestore Index Strategy

## 9.1 Overview

This document defines the Firestore Index Strategy used across the platform. The strategy ensures predictable query performance, prevents full collection scans, enforces controlled query patterns, and maintains cost efficiency at scale.

Key objectives:

- Guarantee that all queries are index-supported
- Prevent runtime index errors in production
- Restrict queries to approved patterns
- Enforce pagination across list operations
- Protect Firestore cost structure
- Enable scalable vendor analytics through precomputed aggregates

This specification governs all Firestore read patterns generated by backend APIs.

---

## 9.2 Index Philosophy

Firestore automatically creates indexes for:

- Document IDs
- Single fields
- Timestamp fields

However, composite indexes must be explicitly defined for multi-field filtering and sorting.

Design principles:

- All queries must be pre-approved
- All filters must map to defined composite indexes
- Dynamic multi-field filtering is prohibited
- Full collection scans are disallowed
- Query patterns must remain deterministic

---

## 9.3 Query Approval Policy

Before introducing any new query in backend code, the following constraints must be satisfied:

1. Query must be scoped to an institute namespace

    institutes/{instituteId}/...

2. Query must filter only on indexed fields

3. Query must include an indexed orderBy clause

4. Query must implement pagination

5. Query must avoid full collection scans

6. Query must not use OR conditions across large datasets

Queries violating these rules must not be implemented.

---

## 9.4 Composite Index Matrix

### Students Collection

Path:

    institutes/{instituteId}/students

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| batch + status + orderBy(name) | Yes |
| status + orderBy(lastActiveAt) | Yes |
| riskState + orderBy(disciplineIndex) | Yes |
| avgRawScorePercent + orderBy(desc) | Yes |

Index definitions:

Collection: students

    Fields:
    - batch (ASC)
    - status (ASC)
    - name (ASC)

Collection: students

    Fields:
    - riskState (ASC)
    - disciplineIndex (DESC)

Collection: students

    Fields:
    - status (ASC)
    - lastActiveAt (DESC)

---

### Question Bank

Path:

    institutes/{instituteId}/questionBank

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| subject + chapter + difficulty | Yes |
| difficulty + orderBy(lastUsedAt) | Yes |
| status + subject + orderBy(createdAt) | Yes |

Index definitions:

Collection: questionBank

    Fields:
    - subject (ASC)
    - chapter (ASC)
    - difficulty (ASC)

Collection: questionBank

    Fields:
    - difficulty (ASC)
    - lastUsedAt (DESC)

Collection: questionBank

    Fields:
    - status (ASC)
    - subject (ASC)
    - createdAt (DESC)

---

### Test Templates

Path:

    institutes/{instituteId}/tests

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| academicYear + status | Yes |
| examType + academicYear | Yes |
| status + orderBy(createdAt) | Yes |

---

### Runs (Assignments)

Path:

    institutes/{instituteId}/academicYears/{yearId}/runs

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| status + orderBy(startWindow) | Yes |
| mode + academicYear | Yes |
| startWindow range + status | Yes |

Composite index definition:

Collection: runs

    Fields:
    - status (ASC)
    - startWindow (ASC)

---

### Sessions

Path:

    institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| studentId + status | Yes |
| status + submittedAt | Yes |

Most session access occurs via document ID, minimizing composite index requirements.

---

### Run Analytics

Path:

    institutes/{instituteId}/academicYears/{yearId}/runAnalytics

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| createdAt range | Yes |
| avgRawScorePercent orderBy | Yes |

---

### Student Year Metrics

Path:

    institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| riskState + disciplineIndex | Yes |
| avgRawScorePercent orderBy desc | Yes |
| batch + riskState | Yes |

---

### Governance Snapshots

Path:

    institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots

Approved query pattern:

| Query Pattern | Composite Index Required |
|---|---|
| orderBy(monthId) | Yes |

---

## 9.5 Vendor Aggregate Index Plan

Vendor analytics must never query raw institute collections.

Collection:

    vendorAggregates/monthly

Approved query patterns:

| Query Pattern | Composite Index Required |
|---|---|
| orderBy(generatedAt) | Yes |
| orderBy(revenueProjection) | Yes |

Vendor dashboards must only read aggregated summary documents.

---

## 9.6 Pagination Enforcement Rules

All list endpoints must implement cursor-based pagination.

Example pattern:

    query.limit(20).startAfter(lastDoc)

Requirements:

- limit() must always be applied
- startAfter() must be used for pagination
- offset() pagination is prohibited

Default limits:

| Collection | Default Limit |
|---|---|
| Students | 20 |
| Question Bank | 25 |
| Runs | 20 |
| Analytics Lists | 20 |

Maximum allowed limit:

    100

---

## 9.7 Read Limit Guardrails

Backend validation must enforce read limits.

Example:

    if (requestedLimit > 100) {
      throw VALIDATION_ERROR
    }

Prohibited patterns:

- Unlimited query exports
- UI-based full database exports
- Multi-year bulk reads

Large exports must use:

- Cloud Function batch jobs
- BigQuery pipelines

---

## 9.8 Indexed Query Enforcement Rule

Before deploying any backend query:

1. Query must match an approved query pattern
2. Query must match a predefined composite index
3. Query must be scoped by instituteId
4. Query must include pagination

Dynamic filtering based on user input is not allowed.

Example prohibited pattern:

    where(fieldNameFromUser, "==", value)

All filters must be explicitly defined.

---

## 9.9 Anti-Pattern Prevention

The following query patterns are prohibited:

- collectionGroup queries on sessions
- cross-institute joins
- OR conditions across multiple fields
- IN queries with more than 10 values
- offset() based pagination

Only cursor-based pagination is permitted.

---

## 9.10 Cost Safety Strategy

Estimated reads per dashboard load:

| Dashboard Section | Expected Reads |
|---|---|
| Overview | < 10 |
| Student List | 20–30 |
| Run Analytics | < 10 |
| Vendor Dashboard | < 20 |

Cost remains stable even with:

- 100 institutes
- 200+ students per institute

Provided that:

- Only summary documents are queried
- Sessions are never bulk-read
- Analytics are precomputed

---

## 9.11 Index Deployment Strategy

All composite indexes must be stored in the Firestore index configuration file:

    firestore.indexes.json

This file must contain all indexes defined in this specification.

Deployment command:

    firebase deploy --only firestore:indexes

Index configuration must be version-controlled to ensure consistent environments across staging and production.

---

## 9.12 Dependencies

The indexing strategy relies on:

- Firestore composite index configuration
- Backend query enforcement middleware
- Pagination utilities
- Precomputed analytics collections
- Vendor aggregate pipelines


# 10. Submission Engine Event Flow

## Overview
The Submission Engine manages the lifecycle of an exam session, handles incremental answer persistence, executes atomic submission transactions, and triggers downstream analytics. It ensures deterministic scoring, strict state transitions, concurrency safety, and idempotent operations to prevent data corruption.

## Key Responsibilities
- Manage session lifecycle states and enforce valid transitions.
- Initialize and authorize exam sessions.
- Persist incremental answer updates efficiently.
- Execute atomic submission transactions with deterministic scoring.
- Prevent duplicate submissions and analytics processing.
- Protect against concurrency issues (multi-tab, retries).
- Trigger analytics processing pipelines after successful submission.
- Enforce server-authoritative timers and session expiry logic.
- Guarantee system performance and reliability constraints.

## Inputs
- Authenticated student token.
- Exam run identifier.
- Session identifier.
- Incremental answer updates.
- Test snapshot and timing profile snapshot.
- Cached question metadata.

## Outputs
- Persisted session state and answerMap updates.
- Deterministic score metrics.
- Submission confirmation response.
- Analytics trigger events.
- Error responses when validation or transaction failures occur.

## Workflow

### 10.1 Session Lifecycle State Machine
Session states:

- created
- started
- active
- submitted
- expired
- terminated

State transitions:

created → started → active → submitted  
               ↓  
             expired  
              ↓  
            terminated  

Rules:

- Only students may transition a session to active.
- Only backend services may transition a session to submitted.
- State transitions are strictly forward-only.
- submitted is a terminal state.

---

### 10.2 Session Start Flow

Endpoint:

POST /exam/start

Steps:

1. Validate authentication token.
2. Validate role == student.
3. Validate run exists.
4. Validate assignment window.
5. Check that no active session exists.
6. Create session document.

Initial session structure:

    {
      status: "created",
      startedAt: null,
      submittedAt: null,
      answerMap: {},
      version: 1,
      submissionLock: false
    }

7. Return signed session token.

---

### 10.3 Incremental Answer Write Flow

Endpoint:

POST /exam/session/{sessionId}/answers

Purpose:

Avoid rewriting the entire answerMap on every update.

Flow:

1. Validate session ownership.
2. Validate session.status == active.
3. Merge new answers into answerMap.
4. Update lastModifiedAt timestamp.
5. Defer analytics computation until submission.

Write strategy:

- Batch writes every 5 seconds, or
- Batch writes after every 5 answers.

Implementation rules:

- Use merge:true updates.
- Never overwrite the full session document.

---

### 10.4 Atomic Submission Transaction

Endpoint:

POST /exam/session/{sessionId}/submit

All operations must occur inside a Firestore transaction.

Transaction steps:

Step 1: Begin transaction

Inside transaction:

1. Fetch session document.
2. If status == submitted → return existing result (idempotent).
3. If submissionLock == true → reject submission.
4. Validate session.status == active.
5. Set submissionLock = true.

Step 2: Compute score

Load:

- test snapshot
- timing profile snapshot

Iterate answerMap and compute:

- rawScorePercent
- accuracyPercent
- guessRate
- phaseAdherence
- disciplineIndex
- riskState
- minTimeViolationPercent
- maxTimeViolationPercent

Computation must be deterministic.

Step 3: Update session document

    {
      status: "submitted",
      submittedAt: now,
      rawScorePercent,
      accuracyPercent,
      disciplineIndex,
      riskState,
      submissionLock: false
    }

Step 4: Commit transaction.

After successful commit:

Trigger analytics processing chain.

---

### 10.5 Idempotency Control

Critical cases:

- Double-click submission
- Network retries
- Frontend retry logic

Rule:

If session.status == "submitted":

    return existing score

Implications:

- Prevents duplicate analytics updates.
- Prevents incorrect metric aggregation.
- Prevents repeated submission processing.

---

### 10.6 Concurrency Protection

Potential risks:

- Multiple browser tabs
- Slow network retries
- Parallel submission attempts

Protection mechanisms:

- submissionLock boolean flag
- Firestore transactional isolation
- session.status validation
- atomic document updates

Guarantee:

Only one submission transaction can succeed.

---

### 10.7 Failure Handling

Scenario A: Error during scoring inside transaction

Action:

- Abort transaction.
- Return INTERNAL_ERROR.

Outcome:

- Session remains active.
- Student may retry submission.

Scenario B: Transaction commits successfully but analytics trigger fails

Action:

- Submission remains committed.
- Analytics engine retries processing independently.

Submission transactions must never roll back due to analytics failure.

---

### 10.8 Analytics Trigger Flow

Trigger source:

Cloud Function triggered on session document write where status changes to submitted.

Processing chain:

1. Update runAnalytics.
2. Update studentYearMetrics.
3. Update questionAnalytics.
4. Recalculate risk state.
5. Update templateAnalytics.
6. Update governance snapshot if required.
7. Enqueue email summary notification.

Requirements:

- All operations must be idempotent.
- Processing must rely on submittedAt timestamp.
- Re-execution must produce consistent results.

---

### 10.9 Protection Against Double Analytics Processing

Each analytics document must store processing markers.

Example:

    {
      lastProcessedSessionId: "sess123"
    }

Logic:

If sessionId already processed → skip execution.

---

### 10.10 Performance Guarantees

Submission processing must satisfy:

- Maximum completion time: 500 ms (excluding analytics).
- Data loaded during submission:
  - session document
  - test snapshot
  - question metadata (preferably cached)

Never load:

- entire question bank
- all session documents
- cross-institute datasets

---

### 10.11 Session Expiry Flow

When exam time expires:

Frontend calls:

POST /exam/session/{id}/auto-submit

Behavior:

- Uses the same submission engine.

Reconnect behavior:

- If browser reconnects after timer expiry → force auto-submit.

Timer authority:

- Server time is authoritative.

---

### 10.12 Data Corruption Risk Prevention

Risk | Protection
---- | ----
Double submission | session.status validation
Multi-tab submission | submissionLock
Network retries | idempotency logic
Partial answer writes | merge-based updates
Backend crash | transactional writes
Analytics duplication | idempotent triggers

---

### 10.13 Submission Flow Diagram

Student clicks submit  
  ↓  
API validation  
  ↓  
Begin transaction  
  ↓  
Check session status  
  ↓  
Compute metrics  
  ↓  
Update session document  
  ↓  
Commit transaction  
  ↓  
Trigger analytics chain  
  ↓  
Return response

---

### 10.14 Submission Response

Response structure:

    {
      "success": true,
      "data": {
        "rawScorePercent": 72,
        "accuracyPercent": 81,
        "disciplineIndex": 76,
        "riskState": "Drift-Prone"
      }
    }

Restrictions:

- Internal risk calculation weights must never be exposed.
- Only final computed metrics are returned to the client.

## Dependencies
- Firestore transactional engine.
- Auth service for token validation.
- Test snapshot storage.
- Timing profile snapshot service.
- Cached question metadata layer.
- Cloud Functions event trigger system.
- Analytics engine modules.

## Error Handling
- INVALID_TOKEN: authentication validation failure.
- UNAUTHORIZED_ROLE: non-student attempting session start.
- RUN_NOT_FOUND: invalid run identifier.
- SESSION_CONFLICT: active session already exists.
- SESSION_NOT_ACTIVE: invalid session state during answer write.
- SUBMISSION_LOCKED: concurrent submission detected.
- INTERNAL_ERROR: scoring or transaction failure.

All errors must return deterministic responses and must not corrupt session state.




# 11. Session Write Batching Logic

## Overview
The Session Write Batching Logic governs how student answers are persisted during an exam session. It minimizes database write frequency, ensures safe incremental updates, supports offline recovery, and prevents race conditions. The system buffers client-side changes and periodically flushes them to the backend using merge-based updates.

## Key Responsibilities
- Buffer answer updates locally within the browser.
- Batch answer writes to reduce database load.
- Prevent overwriting the entire session document.
- Ensure deterministic merge behavior with timestamp validation.
- Provide resilience against network interruptions and browser crashes.
- Maintain synchronization between client state and server state.
- Enforce throttling and write frequency constraints.

## Inputs
- Question interaction events from the student interface.
- Updated answer selections and timeSpent metrics.
- Session identifier.
- Client timestamps.
- Network connectivity state.

## Outputs
- Incremental updates to the session answerMap.
- Updated lastModifiedAt timestamp.
- Updated totalTimeSpent metric.
- Buffered client-side state persistence in localStorage.

## Workflow

### 11.1 Write Interval Policy

A write operation is triggered when any of the following conditions are met:

- 5 seconds have elapsed since the last write.
- 5 answers have changed since the last write.
- The student navigates away from the page.
- The student clicks "Submit".

Throttle rule:

- Never perform writes more frequently than once every 3 seconds.

Configuration constants:

    WRITE_INTERVAL_MS = 5000
    MAX_PENDING_ANSWERS = 5
    MIN_WRITE_INTERVAL_MS = 3000

---

### 11.2 Local Buffer Strategy

The browser maintains a local answer buffer.

Structure:

    let localAnswerBuffer = {
      questionId: {
        selectedOption,
        timeSpent,
        lastModified
      }
    }

Additional tracking variables:

    let lastWriteTimestamp
    let pendingChangeCount

On answer selection:

- Update localAnswerBuffer entry.
- Increment pendingChangeCount.
- Reset batching timer.

Immediate backend writes are avoided.

---

### 11.3 Flush Logic (Write Execution)

Flush function:

    flushIfNeeded()

Flush conditions:

    (Date.now() - lastWriteTimestamp >= WRITE_INTERVAL_MS)
    OR
    (pendingChangeCount >= MAX_PENDING_ANSWERS)

Flush execution steps:

1. Extract only changed answers from localAnswerBuffer.
2. Send batch payload to backend endpoint.

Endpoint:

POST /exam/session/{id}/answers

On successful response:

- Clear localAnswerBuffer entries that were written.
- Reset pendingChangeCount.
- Update lastWriteTimestamp.

---

### 11.4 Write Payload Format

Only modified answers are transmitted.

Payload example:

    {
      "answers": [
        {
          "questionId": "q12",
          "selectedOption": "A",
          "timeSpent": 43
        }
      ]
    }

Backend merge strategy:

    update({
      `answerMap.${questionId}`: answerObject
    })

Rules:

- Full answerMap updates are prohibited.
- Only incremental fields are updated.

---

### 11.5 Conflict Resolution Strategy

Potential conflicts:

- Multiple browser tabs.
- Rapid sequential writes.
- Network retries.

Each answer payload includes:

    {
      selectedOption,
      timeSpent,
      clientTimestamp
    }

Backend merge rule:

If incoming clientTimestamp < storedTimestamp → ignore update.

Resolution policy:

- Newest update always wins.

---

### 11.6 Offline Recovery Strategy

When network disconnect is detected:

1. Stop the flush timer.
2. Continue buffering answers locally.
3. Display offline indicator to the user.
4. On reconnect:
   - Immediately flush all buffered answers.
   - Resume batching timer.

Browser refresh handling:

Before page unload:

    window.addEventListener("beforeunload", flushImmediately)

Crash recovery:

On re-login:

1. Load server-side session answerMap.
2. Load cached answers from localStorage.
3. Merge both datasets.
4. Apply latest timestamp rule for reconciliation.

---

### 11.7 Local Storage Backup

Client maintains a backup in browser storage.

Key:

    localStorage["session_{sessionId}"]

Stored data:

- localAnswerBuffer
- questionTimeSpentMap
- lastKnownServerSyncTime

Data cleanup:

- Clear localStorage after successful submission.

---

### 11.8 Write Optimization Rules

Never perform the following:

- Overwrite the entire answerMap.
- Write on every user click.
- Write when no answer change exists.
- Write during submission transaction.
- Write after session status equals submitted.

Always enforce:

- Write only modified questions.
- Use merge-based document updates.
- Apply throttling rules.
- Include clientTimestamp for conflict resolution.
- Use server timestamp during merge operations.

---

### 11.9 Server Merge Strategy

Backend operations:

1. Validate session.status == active.
2. For each answer in payload:
   - Compare clientTimestamp with stored timestamp.
   - Merge update if incoming timestamp is newer.
3. Update session metadata fields:

    lastModifiedAt
    totalTimeSpent (incrementally)

Restrictions:

- Scoring computations must never occur during answer writes.
- Score calculation occurs only during submission.

---

### 11.10 Double Tab Protection

Risk scenario:

- Student opens multiple tabs for the same session.

Behavior:

- Both tabs may attempt writes simultaneously.
- Timestamp conflict resolution ensures the latest update persists.

Optional stricter enforcement:

Session initialization generates a lock token.

    sessionLockToken

Workflow:

1. Token stored in session document.
2. Client sends token with every write request.
3. Backend validates token.
4. If token mismatch detected:
   - Reject write.
   - Terminate second tab session.

---

### 11.11 Write Frequency Expectation

Example scenario:

- Test size: 60 questions
- Duration: 3 hours
- Average answer modifications: 90

Expected writes with batching:

- Approximately 20 writes per session.

Expected writes without batching:

- 90–120 writes.

Cost reduction:

- Approximately 80% fewer database writes.

---

### 11.12 Submission Override

When student submits the exam:

1. Force immediate buffer flush.
2. Await successful flush confirmation.
3. Invoke submission endpoint.
4. Disable all further answer writes.

Guarantee:

Submission always operates on the most recent answer state.

---

### 11.13 Edge Cases

Case: Student answers but never navigates  
Resolution: Timer-triggered flush ensures writes occur.

Case: Repeated modifications to the same question  
Resolution: Only the latest buffered change is written.

Case: Page refresh during test  
Resolution: Restore answers from localStorage and reconcile with server.

Case: Session expires during offline period  
Resolution:
- Backend rejects further writes.
- Client forces auto-submit or session termination.

---

### 11.14 Write Safety Metrics

Operational monitoring must track:

- avgWritesPerSession
- writeFailureRate
- flushRetryCount
- sessionSyncLag

These metrics should be exposed in the system health monitoring dashboard.

## Dependencies
- Firestore incremental merge updates.
- Client-side buffering logic in the browser runtime.
- Network connectivity detection layer.
- Local storage persistence.
- Session validation service.
- Submission Engine.

## Error Handling
- SESSION_NOT_ACTIVE: Attempted write on inactive session.
- INVALID_SESSION_TOKEN: Session authentication failure.
- WRITE_THROTTLED: Write attempted before minimum interval.
- TIMESTAMP_CONFLICT: Stale client update ignored.
- NETWORK_ERROR: Temporary network failure during flush.
- SESSION_EXPIRED: Write attempted after session expiry.

All failures must preserve buffered client data until a successful flush occurs.


# 12. Timing Engine Architecture

## 12.1 Overview

The Timing Engine governs question-level time behavior during a test session. It enforces difficulty-based timing windows and mode-specific restrictions to ensure disciplined test-taking and prevent rapid guessing or excessive overthinking.

Core design goals:

- Deterministic and mode-aware timing behavior
- Server-authoritative validation
- Difficulty-based time windows
- Integration with discipline and risk evaluation
- Resistance to client-side tampering
- Compatibility with revisit and navigation flows

Timing logic influences:

- Discipline measurement
- Guess detection accuracy
- Risk state calculation
- Phase adherence validation
- Hard mode enforcement

Timing configuration is snapshot-based and must remain immutable during an active session.

---

## 12.2 Key Responsibilities

- Apply difficulty-based timing constraints per question
- Enforce MinTime and MaxTime rules depending on session mode
- Track cumulative time spent across revisits
- Detect timing violations
- Feed violation metrics to the Discipline Engine
- Integrate with Phase Engine boundaries
- Ensure server-side validation of client timing data
- Protect against time manipulation and anomalies

---

## 12.3 Inputs

### Question Metadata

Each question includes a difficulty label.

    {
      difficulty: "Easy | Medium | Hard"
    }

### Test Template Timing Profile

Each test template stores a timing configuration.

    {
      timingProfile: {
        easy:   { min: 30,  max: 60 },
        medium: { min: 60,  max: 150 },
        hard:   { min: 150, max: 210 }
      }
    }

Values are defined in seconds.

### Timing Snapshot Sources

Timing profiles must be snapshotted and stored in:

- Test template
- Test run
- Session

Live configuration must never be referenced during an active exam.

---

## 12.4 Outputs

The Timing Engine produces the following outputs for downstream systems:

- Question-level cumulative time records
- MinTime violation count
- MaxTime violation count
- MinTime violation percentage
- MaxTime violation percentage
- Phase deviation flags
- Discipline index inputs
- Server-validated timing metrics

---

## 12.5 Workflow

### 12.5.1 Timing Profile Snapshot Loading

At session start:

1. Load `timingProfileSnapshot`.
2. Extract timing windows per difficulty level.
3. Assign values to each question.

Example:

    const minTime = timingProfile[difficulty].min
    const maxTime = timingProfile[difficulty].max

These values remain immutable during the session.

---

### 12.5.2 Question Time Tracking Model

Each question tracks the following fields:

    {
      enteredAt,
      exitedAt,
      cumulativeTimeSpent,
      lastEntryTimestamp
    }

Key behavior:

- Time accumulates across revisits
- Timing events occur on:
  - Question load
  - Question navigation
  - Answer submission
- Client records provisional timing
- Server validates timing during write operations

---

### 12.5.3 MinTime Enforcement

MinTime prevents impulsive answering or rapid guessing.

#### Mode Behavior

| Mode | Enforcement |
|-----|-------------|
| L0 | No enforcement |
| L1 Diagnostic | Violation tracked only |
| L2 Controlled | Soft enforcement |
| Hard Mode | Strict enforcement |

#### L1 Diagnostic Behavior

If:

    timeSpent < minTime

Record a potential guess event. No blocking occurs.

#### L2 Controlled Mode Behavior

If answer selected before `minTime`:

- Disable **Save & Next** until `minTime` is reached

Optional warning if attempting navigation:

    "Minimum recommended time not reached."

User may confirm navigation once.

#### Hard Mode Behavior

Strict enforcement rules:

- Save & Next disabled
- Navigation blocked
- Question cannot be exited until `minTime` satisfied

---

### 12.5.4 MaxTime Enforcement

MaxTime prevents excessive fixation or overthinking.

#### Mode Behavior

| Mode | Enforcement |
|-----|-------------|
| L0 | None |
| L1 | Track only |
| L2 Controlled | Advisory |
| Hard Mode | Strict |

#### L1 Diagnostic

If:

    timeSpent > maxTime

Event is logged without UI intervention.

#### L2 Controlled Mode

If `timeSpent > maxTime`:

- Display advisory warning banner
- Suggest moving forward

No navigation lock occurs.

#### Hard Mode

When:

    cumulativeTimeSpent >= maxTime

System automatically:

- Locks the question
- Saves current answer
- Disables further edits
- Forces navigation to next question

Optional configuration:

- Revisit disabled after lock

---

### 12.5.5 Mode Restriction Matrix

| Mode | MinTime | MaxTime | Navigation |
|-----|--------|---------|------------|
| L0 | None | None | Free |
| L1 | Track only | Track only | Free |
| L2 Controlled | Soft enforcement | Advisory | Free |
| L2 Hard | Strict enforcement | Strict enforcement | Sequential optional |

---

### 12.5.6 Server Validation

During answer batch writes:

Server verifies:

    if session.status != active → reject

Server responsibilities:

- Store `cumulativeTimeSpent`
- Validate timing data
- Prevent invalid client reporting

Client timing must never be blindly trusted.

---

### 12.5.7 Violation Metrics Calculation

For each session:

    minTimeViolations = count(timeSpent < minTime)
    maxTimeViolations = count(timeSpent > maxTime)

Percentages:

    minTimeViolationPercent = (minTimeViolations / totalQuestions) * 100
    maxTimeViolationPercent = (maxTimeViolations / totalQuestions) * 100

Metrics are stored in the session document and forwarded to discipline analysis.

---

### 12.5.8 Discipline Index Integration

Timing metrics contribute to discipline scoring.

Example formula:

    disciplineIndex =
      100
      - (minTimeViolationPercent * guessWeight)
      - (maxTimeViolationPercent * overstayWeight)

Timing behavior contributes to:

- GuessWeight
- OverstayWeight
- PhaseDeviationWeight

Weights are configured via system calibration.

---

### 12.5.9 Phase Engine Interaction

Each test phase has a defined time boundary.

Example:

| Phase | Time Allocation |
|------|----------------|
| Phase 1 | 40% |
| Phase 2 | 45% |
| Phase 3 | 15% |

If a student remains on a Hard question during Phase 1:

- Timing Engine raises a phase deviation flag
- Event feeds `phaseAdherencePercent`

---

## 12.6 Dependencies

The Timing Engine interacts with:

- Test Template Service
- Session Management System
- Discipline Engine
- Phase Engine
- Client Navigation Controller
- Server Validation Layer

External APIs used by client runtime:

- Browser Visibility API
- Server clock synchronization

---

## 12.7 Error Handling

### Idle Tab Detection

If the browser tab becomes inactive:

Possible strategy:

- Use Visibility API
- Optionally pause client-side timing

Server must detect abnormal inactivity patterns.

---

### Page Refresh

On reload:

System restores:

    cumulativeTimeSpent
    lastEntryTimestamp

Timing continues based on server clock.

---

### Network Disconnect

If network connection drops:

- Client continues tracking locally
- Timing data syncs on reconnect
- Server reconciles cumulative values

---

### Time Anomaly Protection

Server rejects invalid timing conditions:

- Negative time values
- Time greater than total session duration
- Abnormal delta spikes

Example rule:

    if clientReportedTime > totalSessionTime → reject

Session start and end timestamps define the authoritative timing boundary.

---

## 12.8 Storage Contract

Session document must include a question-level timing map.

    {
      questionTimeMap: {
        questionId: {
          cumulativeTimeSpent: number,
          minTime: number,
          maxTime: number
        }
      }
    }

Important rules:

- Timing values must be stored inside the session
- Template configuration must not be referenced during runtime
- Session snapshots act as the authoritative timing source



# 13. Adaptive Phase Engine Architecture

## 13.1 Overview

The Adaptive Phase Engine converts total test duration into structured execution stages to guide disciplined test-taking behavior. It tracks how closely a student follows the recommended execution strategy and generates measurable adherence metrics.

Core design principles:

- Deterministic phase calculation
- Snapshot-based configuration
- Mode-aware enforcement behavior
- Server-authoritative phase detection
- Integration with Timing Engine outputs
- Behavioral telemetry generation

The engine transforms test duration into three structured stages:

- Phase 1 — Early solving phase
- Phase 2 — Optimization phase
- Phase 3 — Review phase

Outputs feed downstream behavioral analytics, discipline scoring, and the Pattern Engine.

---

## 13.2 Key Responsibilities

- Convert total test duration into deterministic phase boundaries
- Detect the current phase during session execution
- Track phase transitions
- Evaluate student behavior relative to phase strategy
- Produce phase adherence metrics
- Provide enforcement logic based on session mode
- Integrate with Timing Engine signals
- Prevent client-side manipulation of phase calculations

---

## 13.3 Inputs

### Phase Configuration Snapshot

Defined during test template creation for L2 and higher modes.

    {
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15
      }
    }

Configuration is snapshotted and copied into:

- Test template
- Test run
- Session

Phase splits must never be computed dynamically during an active session.

---

### Test Duration

    durationMinutes

Used to derive total test duration in seconds.

---

### Session Timing

    session.startedAt

Used to compute elapsed time based on server clock.

---

### Calibration Weights

    {
      weights: {
        phaseDeviationWeight: number,
        earlyHardWeight: number,
        lateEasyWeight: number
      }
    }

Weights determine penalty magnitude during adherence calculation.

---

## 13.4 Outputs

The Adaptive Phase Engine produces the following outputs:

- Current phase (Phase 1, Phase 2, Phase 3)
- Phase transition events
- Phase deviation metrics
- Difficulty-phase alignment statistics
- Late easy-question penalty metrics
- Phase adherence percentage

Stored within the session document.

---

## 13.5 Workflow

### 13.5.1 Phase Boundary Calculation

At session initialization:

    totalTime = durationMinutes * 60

Boundaries are computed using the snapshot configuration.

    phase1End = totalTime * 0.40
    phase2End = totalTime * 0.85
    phase3End = totalTime

Values are stored inside the session.

    {
      phaseBoundaries: {
        phase1EndSeconds: number,
        phase2EndSeconds: number,
        phase3EndSeconds: number
      }
    }

These values remain immutable throughout the session.

---

### 13.5.2 Phase Detection Logic

The current phase is derived using server time.

    elapsedTime = currentServerTime - session.startedAt

Phase determination logic:

    if elapsedTime <= phase1End
        phase = 1
    else if elapsedTime <= phase2End
        phase = 2
    else
        phase = 3

Server time is the authoritative reference for elapsed time.

---

### 13.5.3 Mode-Based Phase Behavior

| Mode | Behavior |
|-----|---------|
| L0 | Phase engine disabled |
| L1 Diagnostic | Visual phases only, no enforcement |
| L2 Controlled | Soft guidance |
| Hard Mode | Optional strict restrictions |

---

#### L1 Diagnostic Mode

Phases are displayed visually.

Behavioral telemetry recorded:

- Difficulty attempted within each phase
- Easy questions remaining after Phase 1
- Hard questions attempted during Phase 1

No restrictions or warnings are applied.

---

#### L2 Controlled Mode

Soft guidance based on phase context.

Phase 1:

If a Hard question is attempted:

    Show warning:
    "High difficulty early. Consider marking for review."

Phase 2:

Encourage revisiting marked questions.

Phase 3:

Encourage final review.

No blocking or forced navigation occurs.

---

#### Hard Mode

Strict enforcement may be enabled through template configuration.

Possible restrictions:

- Phase 1 limited to Easy and Medium questions
- Hard questions deferred to later phases
- Phase 2 limited to marked questions
- Phase boundaries enforced
- Submit disabled before Phase 3 (optional)

Strict mode must be explicitly configured at template level.

---

### 13.5.4 Phase Transition Tracking

Each phase change is recorded in the session document.

Example:

    {
      phaseEvents: [
        {
          phase: 1,
          enteredAt: timestamp
        },
        {
          phase: 2,
          enteredAt: timestamp
        }
      ]
    }

Phase transitions are derived server-side and must not rely on client signals.

---

### 13.5.5 Phase Adherence Metrics

Phase adherence quantifies how closely a student followed the recommended strategy.

Three primary metrics contribute to the final score.

---

#### Metric 1 — Phase Timing Deviation

Compare actual time spent in a phase against recommended allocation.

Example:

    actualPhase1Time = min(phase1End, submissionTime)

Deviation formula:

    phaseDeviationPercent =
      | actualPhase1Time - recommendedPhase1Time |
      / recommendedPhase1Time

---

#### Metric 2 — Difficulty Alignment

Phase strategy recommends prioritizing Easy questions in Phase 1.

Metrics calculated:

    easyInPhase1 / totalEasy
    hardInPhase1 / totalHard

These values contribute to weighted adherence penalties.

---

#### Metric 3 — Late Easy Penalty

If Easy questions remain unattempted after Phase 1:

    easyRemainingAfterPhase1Percent

This indicates inefficient early-phase prioritization.

Penalty applied during adherence calculation.

---

### 13.5.6 Phase Adherence Score

Example formula:

    phaseAdherence =
      100
      - (phaseDeviationWeight * phaseDeviationPercent)
      - (earlyHardWeight * hardInPhase1Percent)
      - (lateEasyWeight * easyRemainingPercent)

Final result stored in the session.

    {
      phaseAdherencePercent: number
    }

Phase adherence is computed once at test submission.

---

### 13.5.7 Timing Engine Interaction

The Phase Engine and Timing Engine operate independently but share behavioral signals.

Examples of combined analysis:

- Hard question in Phase 1 with MinTime violation → impulsive solving pattern
- Hard question in Phase 1 with MaxTime violation → early overextension
- Easy questions left for Phase 3 → inefficient phase strategy

These combined metrics feed the Pattern Engine.

---

## 13.6 Dependencies

The Adaptive Phase Engine interacts with:

- Timing Engine
- Session Management System
- Calibration Configuration Service
- Pattern Engine
- Server Time Synchronization

Client applications only display phase state; computation occurs server-side.

---

## 13.7 Error Handling

### Early Submission

If:

    submissionTime < phase1End

Then Phase 2 and Phase 3 are never reached.

Adherence calculations are adjusted accordingly.

---

### Offline or Paused Sessions

Elapsed time must always be derived from:

    serverClock - session.startedAt

Client clocks are not trusted.

---

### Run Window Expiry

If the test run window expires during a phase:

- Session is force-submitted
- Adherence metrics computed based on elapsed time.

---

### Phase Boundary Integrity

Phase boundaries are immutable once the session begins.

Any client attempt to modify or override phase logic must be rejected.

---

## 13.8 Storage Contract

Session documents must store the following fields:

    {
      phaseConfigSnapshot,
      phaseBoundaries,
      phaseEvents,
      phaseAdherencePercent
    }

Important rules:

- Phase configuration must be snapshotted before session start
- Phase adherence must be computed at submission
- Phase adherence must not be recalculated dynamically at read time
- Server is the sole authority for phase evaluation





# 14. Risk Engine Architecture

## 14.1 Overview
The Risk Engine is the behavioral evaluation layer that converts performance and behavior signals into quantified risk metrics. It evaluates session-level performance using normalized behavioral indicators and produces deterministic risk outputs.

Characteristics:
- Deterministic computation
- Calibration-driven weighting
- Vendor-adjustable parameters
- Idempotent evaluation
- Snapshot-based session storage

Operational Levels:
- Session level (per test)
- Rolling window level (recent tests)
- Batch aggregate level

Primary Output Structure:
  {
    riskScore: number,
    riskCluster: string,
    disciplineIndex: number,
    controlledModeDelta: number
  }

---

## 14.2 Key Responsibilities

- Normalize behavioral signals into comparable numeric scales
- Apply weighted risk computation using calibration configuration
- Classify behavioral stability into predefined risk clusters
- Compute discipline index from instability patterns
- Maintain rolling risk metrics across recent sessions
- Measure Controlled Mode performance improvement
- Aggregate risk data at template and batch levels
- Enforce deterministic and idempotent server-side execution

---

## 14.3 Inputs

Primary behavioral metrics derived from upstream engines:

| Metric | Raw Range | Description |
|------|------|------|
| minTimeViolationPercent | 0–100 | Percentage of questions answered too quickly |
| maxTimeViolationPercent | 0–100 | Percentage of questions exceeding max allowed time |
| phaseDeviationPercent | 0–100 | Deviation from expected phase pacing |
| guessRate | 0–100 | Estimated guess probability |
| consecutiveWrongStreakMax | 0–n | Maximum consecutive incorrect answers |

Additional contextual inputs:

| Input | Description |
|------|------|
| accuracyPercent | Overall session accuracy |
| operationalAvgScore | Avg score in operational mode |
| controlledAvgScore | Avg score in controlled mode |
| calibrationWeights | Vendor-configured weight distribution |

---

## 14.4 Outputs

Session-level output snapshot:

  {
    riskScorePercent: number,
    riskCluster: string,
    disciplineIndex: number,
    controlledModeDeltaPercent: number
  }

Additional aggregated outputs:

| Output | Level |
|------|------|
| rollingRiskScore | Student year metrics |
| rollingRiskCluster | Student year metrics |
| avgRiskScore | Template analytics |
| riskVariance | Template analytics |
| riskClusterDistribution | Batch analytics |

---

## 14.5 Workflow

### 14.5.1 Signal Normalization

All behavioral inputs must be normalized to the range 0–1.

Normalization logic:

  normMinTime = minTimeViolationPercent / 100  
  normMaxTime = maxTimeViolationPercent / 100  
  normPhaseDev = phaseDeviationPercent / 100  
  normGuess = guessRate / 100  
  normWrongStreak = min(consecutiveWrongStreakMax / 5, 1)

Validation rules:
- Normalized values must be capped at 1
- No negative values allowed

---

### 14.5.2 Weight Configuration

Calibration configuration example:

  {
    weights: {
      minTimeWeight: 0.25,
      maxTimeWeight: 0.20,
      phaseWeight: 0.20,
      guessWeight: 0.20,
      wrongStreakWeight: 0.15
    }
  }

Validation constraint:

  sum(weights) == 1

Weights are controlled by the vendor calibration engine.

---

### 14.5.3 Risk Score Calculation

Weighted sum calculation:

  riskScore =
      (normMinTime * minTimeWeight)
    + (normMaxTime * maxTimeWeight)
    + (normPhaseDev * phaseWeight)
    + (normGuess * guessWeight)
    + (normWrongStreak * wrongStreakWeight)

Scale to percentage:

  riskScorePercent = riskScore * 100

Range: 0–100  
Higher score indicates greater behavioral instability.

---

### 14.5.4 Risk Cluster Assignment

Cluster classification based on score thresholds.

| Score Range | Cluster |
|------|------|
| 0–20 | Stable |
| 21–40 | Drift-Prone |
| 41–60 | Impulsive |
| 61–80 | Overextended |
| 81–100 | Volatile |

Example stored value:

  {
    riskCluster: "Impulsive"
  }

Thresholds are vendor-adjustable.

---

### 14.5.5 Discipline Index Calculation

Discipline index represents inverse instability.

Base formula:

  disciplineIndex = 100 - riskScorePercent

Optional smoothing to incorporate accuracy:

  disciplineIndex =
    (disciplineIndex * 0.7)
    + (accuracyPercent * 0.3)

Final range: 0–100.

Stored in:
- Session record
- studentYearMetrics

---

### 14.5.6 Rolling Window Risk

Computed across the most recent N tests.

Default configuration:

  N = 5

Computation:

  rollingRiskScore =
    average(lastN riskScorePercent)

If available tests < N:
- Use existing tests only.

Cluster assignment uses the same cluster thresholds.

Stored structure:

  {
    rollingRiskScore,
    rollingRiskCluster
  }

---

### 14.5.7 Controlled Mode Delta

Evaluates improvement when using Controlled Mode.

Inputs:

- operationalAvgScorePercent
- controlledAvgScorePercent

Calculation:

  controlledModeDelta =
    controlledAvgScorePercent - operationalAvgScorePercent

Interpretation:
- Positive value → Controlled Mode improves performance.

Stored value:

  {
    controlledModeDeltaPercent: number
  }

Used by:
- Student dashboards
- Behavioral insights
- Governance analytics

---

### 14.5.8 Template-Level Risk Aggregation

TemplateAnalytics aggregates risk across sessions.

Metrics:

  avgRiskScore = average(session riskScorePercent)

  riskVariance =
    standardDeviation(session riskScorePercent)

Purpose:
- Detect template difficulty stress
- Identify unstable test structures

---

### 14.5.9 Batch-Level Risk Map

Batch analytics compute cluster distribution.

Structure:

  riskClusterDistribution = {
    Stable: percentage,
    Drift-Prone: percentage,
    Impulsive: percentage,
    Overextended: percentage,
    Volatile: percentage
  }

Used for:
- Governance dashboards
- Batch stability monitoring
- Institutional risk evaluation

---

## 14.6 Dependencies

The Risk Engine depends on upstream analytics systems:

| Dependency | Purpose |
|------|------|
| Timing Engine | Time violation detection |
| Phase Engine | Phase pacing deviation |
| Answer Evaluation Engine | Accuracy computation |
| Guess Probability Model | Guess rate estimation |
| Calibration Engine | Weight configuration |
| Session Submission Engine | Trigger execution |

---

## 14.7 Error Handling

### Validation Failures

- Reject computation if weight sum ≠ 1
- Reject negative metric inputs
- Cap normalized values at 1

### Edge Case Overrides

Override rule for extreme wrong streaks:

  if consecutiveWrongStreakMax >= 5
      riskCluster = "Volatile"

Overrides standard cluster thresholds.

### Behavioral Edge Cases

| Condition | Behavior |
|------|------|
| High accuracy with high guessRate | Classified as Impulsive |
| High maxTimeViolation with low guess | Classified as Overextended |
| Balanced but unstable across tests | Classified as Drift-Prone |
| Extreme wrong streak | Forced Volatile classification |

### Execution Constraints

Risk computation must follow strict execution rules:

- Execute only during session submission
- Never compute during read operations
- Must be deterministic
- Must be idempotent
- Results stored in session snapshot
- Recompute only when calibrationVersion changes

Recalibration procedure:
- Background recomputation job
- Store updated calibrationVersion



# 15. Pattern Engine Rule Architecture

## 15.1 Overview
The Pattern Engine detects repeated behavioral signals across multiple sessions. It operates above the Risk Engine and converts recurring micro-behaviors into persistent behavioral patterns.

Operational Scope:
- Risk Engine evaluates a single session.
- Pattern Engine evaluates behavioral repetition across sessions.

Design Requirements:
- Rolling-window based evaluation
- Threshold-driven pattern detection
- Escalation-aware logic
- Idempotent execution
- Lightweight data access
- Execution only during submission

Primary Storage Location:
studentYearMetrics/{studentId}

Primary Outcomes:
- Pattern flags
- Escalation states
- Intervention triggers

---

## 15.2 Key Responsibilities

- Detect recurring behavioral signals across recent tests
- Maintain rolling behavioral aggregates
- Identify behavioral patterns using threshold rules
- Trigger escalation recommendations
- Store pattern states in studentYearMetrics
- Update batch-level pattern analytics
- Enforce deterministic submission-time computation

---

## 15.3 Inputs

Session summary fields provided by the submission pipeline:

| Field | Description |
|------|------|
|minTimeViolationPercent|Percentage of answers submitted below minimum time threshold|
|maxTimeViolationPercent|Percentage of answers exceeding maximum allowed time|
|phaseAdherencePercent|Adherence to defined phase pacing|
|easyRemainingAfterPhase1Percent|Unattempted easy questions after Phase 1|
|hardInPhase1Percent|Hard questions attempted during Phase 1|
|guessRatePercent|Estimated probability of guessing|
|skipBurstCount|Number of rapid skip sequences|
|consecutiveWrongStreakMax|Maximum consecutive incorrect answers|
|riskCluster|Session-level behavioral cluster|
|rawScorePercent|Score percentage|
|accuracyPercent|Accuracy percentage|
|submittedAt|Submission timestamp|

Constraint:
- Pattern Engine never reads question-level data.

---

## 15.4 Outputs

Pattern state stored in studentYearMetrics:

  {
    patterns: {
      rush: {
        active: boolean,
        severity: "Moderate" | "High",
        frequency: number
      },
      easyNeglect: {
        active: boolean,
        frequency: number
      },
      hardBias: {
        active: boolean,
        frequency: number
      },
      skipBurst: {
        active: boolean,
        frequency: number
      },
      wrongStreak: {
        active: boolean,
        severity: "Moderate" | "Critical"
      }
    },
    lastPatternUpdatedAt
  }

Escalation output:

  {
    interventionSuggestion: string,
    escalationLevel: "Moderate" | "High" | "Critical"
  }

Batch-level aggregates are also updated.

---

## 15.5 Workflow

### 15.5.1 Rolling Window Management

Default rolling window:

- Last 5 tests
- Or last 30 days (whichever is smaller)

Vendor configurable.

Stored structure:

  {
    rollingWindowSize: 5,
    lastNTestIds: [],
    rollingAggregates: {}
  }

Submission update procedure:

1. Append current testId
2. Trim list to window size
3. Recompute pattern metrics

---

### 15.5.2 Rush Detection

Definition:
Student answers questions excessively fast relative to difficulty.

Derived Signals:
- minTimeViolationPercent
- guessRatePercent

Single session rush signal:

  rushSignal =
  (minTimeViolationPercent > 20%)
  AND
  (guessRatePercent > 25%)

Rolling rule:

  if rushSignal occurs in ≥ 3 of last 5 tests
      RushPattern = true

Severity classification:

| Frequency | Severity |
|------|------|
|3 of 5|Moderate|
|4 of 5 or higher|High|

---

### 15.5.3 Easy Neglect Detection

Definition:
Student leaves easy questions unattempted during early phases.

Derived Signal:
easyRemainingAfterPhase1Percent

Single session condition:

  easyRemainingAfterPhase1Percent > 30%

Rolling rule:

  if ≥ 3 occurrences in last 5 tests
      EasyNeglectPattern = true

---

### 15.5.4 Hard Bias Detection

Definition:
Student attempts difficult questions prematurely.

Derived Signal:
hardInPhase1Percent

Single session rule:

  hardInPhase1Percent > 40%

Rolling rule:

  if ≥ 3 occurrences in last 5 tests
      HardBiasPattern = true

---

### 15.5.5 Skip Burst Detection

Definition:
Rapid skipping behavior indicating pacing instability.

Skip burst defined by session engine as:

  ≥ 3 questions skipped within 60 seconds

Single session signal:

  skipBurstCount ≥ 2

Rolling rule:

  if skipBurstSignal occurs in ≥ 3 of last 5 tests
      SkipBurstPattern = true

---

### 15.5.6 Consecutive Wrong Detection

Definition:
Emotional instability or confusion leading to error streaks.

Derived Signal:
consecutiveWrongStreakMax

Immediate critical condition:

  consecutiveWrongStreakMax ≥ 5

Result:

  WrongStreakAlert = Critical

Rolling instability rule:

  if ≥ 3 streak events (≥4)
      ChronicInstabilityPattern = true

This pattern overrides other behavioral signals.

---

### 15.5.7 Pattern Escalation Logic

Escalation recommendations based on active patterns.

| Pattern | Escalation Condition | Intervention |
|------|------|------|
|Rush|High severity|Recommend Controlled Mode|
|Easy Neglect|3+ recurrence|Recommend Phase Training|
|Hard Bias|3+ recurrence|Recommend Structured Strategy|
|Skip Burst|3+ recurrence|Recommend Pacing Control|
|Wrong Streak|Critical|Recommend Hard Mode|

Escalation stored separately from pattern state.

---

### 15.5.8 Cross-Pattern Interaction Rules

Certain pattern combinations influence higher behavioral classification.

Rule set:

  if RushPattern = true
  AND EasyNeglectPattern = true
      Elevated Impulsive Cluster

  if HardBiasPattern = true
  AND MaxTimeViolationHigh = true
      Overextended Cluster

Pattern engine may override risk cluster classifications.

---

### 15.5.9 Computation Flow

Pattern evaluation is triggered only after session submission.

Execution sequence:

1. Session risk computed
2. Session summary stored
3. Pattern engine triggered
4. Load last N session summaries
5. Compute pattern signals
6. Evaluate rolling rules
7. Update studentYearMetrics
8. Update batch aggregates

Constraint:
- No pattern computation occurs during read operations.

---

## 15.6 Dependencies

| Dependency | Purpose |
|------|------|
|Session Submission Engine|Triggers pattern evaluation|
|Risk Engine|Provides session risk cluster|
|Session Summary Store|Source of recent session metrics|
|Calibration Engine|Threshold configuration|
|Student Metrics Store|Pattern state persistence|
|Batch Aggregates Store|Batch-level analytics|

---

## 15.7 Error Handling

### Data Availability

If fewer than required sessions exist:

- Use available sessions only
- Pattern frequency adjusted accordingly

---

### Rolling Window Validation

- Ensure window size ≤ configured limit
- Trim excess testIds
- Maintain chronological order by submittedAt

---

### Threshold Validation

All thresholds validated against calibration configuration.

Invalid configuration examples:

- Negative thresholds
- Window size < 1
- Threshold percentages outside 0–100

Such configurations must be rejected by the calibration engine.

---

### Performance Constraints

Pattern engine must guarantee efficient execution.

Indexed query pattern:

  where studentId == X
  orderBy submittedAt desc
  limit N

Constraints:

- Never scan entire student history
- Only access last N session summaries
- All computations occur in memory after retrieval



# 16. AI Summary Pipeline

## 16.1 Overview
The AI Summary Pipeline generates structured, motivating performance summaries for students and batches. It operates as an Insights-layer augmentation and runs on a scheduled monthly basis.

Design Principles:
- Monthly execution only
- Structured metric inputs only
- No raw session or question-level data
- Batch-processed architecture
- Cached results
- Cost-controlled AI usage
- Vendor-configurable prompts
- Deterministic regeneration rules

Execution Triggers:
- Monthly scheduled cron job
- Manual vendor/admin trigger

Scope:
- Current academic year only

Data Restrictions:
Never access:
- Raw session data
- Question-level responses
- Large contextual inputs

---

## 16.2 Key Responsibilities

- Generate motivating monthly summaries for students
- Generate analytical monthly summaries for batches
- Use aggregated metrics from system summary documents
- Enforce token usage limits
- Store generated summaries in Firestore
- Cache results to avoid repeated AI calls
- Provide vendor-level configuration controls
- Ensure predictable AI cost usage

---

## 16.3 Inputs

### Student Summary Inputs

Source:
studentYearMetrics/{studentId}

Allowed structured metrics:

| Metric | Description |
|------|------|
|avgRawScorePercent|Average score across sessions|
|avgAccuracyPercent|Average accuracy|
|rollingRiskScore|Rolling risk score|
|rollingRiskCluster|Current behavioral risk cluster|
|disciplineIndex|Calculated discipline index|
|phaseAdherenceAverage|Average phase adherence|
|rushPatternActive|Rush pattern flag|
|easyNeglectActive|Easy neglect pattern flag|
|hardBiasActive|Hard bias pattern flag|
|skipBurstActive|Skip burst pattern flag|
|wrongStreakActive|Wrong streak pattern flag|
|controlledModeDelta|Controlled mode improvement|
|totalTestsAttempted|Total tests attempted|

Constraint:
Only aggregated numeric fields allowed.

---

### Batch Summary Inputs

Source:
batchAggregates/{batchId}

| Metric | Description |
|------|------|
|avgRawScorePercent|Average batch score|
|avgAccuracyPercent|Average batch accuracy|
|avgDisciplineIndex|Average discipline index|
|riskClusterDistribution|Distribution of risk clusters|
|rushPatternPercent|Rush pattern prevalence|
|easyNeglectPercent|Easy neglect prevalence|
|hardBiasPercent|Hard bias prevalence|
|skipBurstPercent|Skip burst prevalence|
|wrongStreakPercent|Wrong streak prevalence|
|controlledModeImprovement|Batch controlled mode improvement|

---

## 16.4 Outputs

### Student Monthly Summary

Storage Path:

studentYearMetrics/{studentId}/monthlySummaries/{YYYY_MM}

Structure:

  {
    generatedAt,
    summaryText,
    tokenUsed,
    modelVersion,
    calibrationVersion
  }

---

### Batch Monthly Summary

Storage Path:

batchAggregates/{batchId}/monthlySummaries/{YYYY_MM}

Structure identical to student summary.

---

## 16.5 Workflow

### 16.5.1 Monthly Execution Trigger

Execution pipeline:

Cloud Scheduler → Pub/Sub → Cloud Function

Execution conditions:
- Runs once per month
- Processes only active students in current academic year
- Can be manually triggered by vendor/admin

---

### 16.5.2 Student Summary Generation

Processing sequence:

1. Retrieve studentYearMetrics document
2. Extract aggregated fields
3. Inject metrics into fixed prompt template
4. Call AI model
5. Store generated summary
6. Record token usage and metadata

Student Prompt Template:

You are an academic performance coach.

Write a short, motivating monthly performance summary for a student.

Use the following structured metrics only.
Do not invent data.
Do not compare with other students.
Be optimistic and constructive.
Keep length under 150 words.

Metrics:
- Average Raw Score: {avgRawScorePercent}%
- Average Accuracy: {avgAccuracyPercent}%
- Discipline Index: {disciplineIndex}/100
- Phase Adherence: {phaseAdherenceAverage}%
- Risk Cluster: {rollingRiskCluster}
- Controlled Mode Impact: {controlledModeDelta}%
- Tests Attempted: {totalTestsAttempted}

Behavior Flags:
Rush Pattern: {rushPatternActive}
Easy Neglect: {easyNeglectActive}
Hard Bias: {hardBiasActive}
Skip Burst: {skipBurstActive}
Wrong Streak: {wrongStreakActive}

---

### 16.5.3 Batch Summary Generation

Processing steps:

1. Load batchAggregates document
2. Extract aggregated metrics
3. Insert metrics into batch prompt template
4. Generate AI summary
5. Store result in Firestore

Batch Prompt Template:

You are an academic performance analyst.

Write a professional monthly batch performance summary.

Do not name individual students.
Focus on collective improvement.
Keep tone strategic and optimistic.
Length under 200 words.

Metrics:
- Average Raw Score: {avgRawScorePercent}%
- Average Accuracy: {avgAccuracyPercent}%
- Average Discipline Index: {avgDisciplineIndex}
- Risk Distribution: {riskClusterDistribution}
- Controlled Mode Improvement: {controlledModeImprovement}%

Behavior Signals:
Rush: {rushPatternPercent}%
Easy Neglect: {easyNeglectPercent}%
Hard Bias: {hardBiasPercent}%
Skip Burst: {skipBurstPercent}%
Wrong Streak: {wrongStreakPercent}%

---

## 16.6 Dependencies

| Dependency | Purpose |
|------|------|
|studentYearMetrics|Source of student aggregated metrics|
|batchAggregates|Source of batch-level analytics|
|Cloud Scheduler|Monthly job trigger|
|Pub/Sub|Distributed processing queue|
|Cloud Function|Batch processing worker|
|AI Model API|Summary generation|
|Vendor Config Store|Prompt and model configuration|

---

## 16.7 Token Cost Optimization

### Structured Input Rule

Only aggregated numeric metrics allowed.

Disallowed:
- Raw arrays
- Historical session lists
- Question-level details

---

### Fixed Prompt Template

Prompt template must remain static.
No dynamic expansion allowed.

Benefits:
- Predictable token usage
- Consistent output structure

---

### Token Limits

Student summary:

  max_tokens = 250

Batch summary:

  max_tokens = 350

---

### Temperature Control

Configuration:

  temperature = 0.3

Purpose:
- Reduce variability
- Control output length
- Minimize token usage

---

### API Call Limits

Policy:

- Maximum one AI call per entity per month
- No regeneration unless explicitly triggered

---

## 16.8 Batch Processing Architecture

Monthly job processing pipeline:

1. Fetch all active students
2. Load studentYearMetrics
3. Generate student summaries
4. Persist Firestore documents
5. Repeat for each batch

Operational constraints:

- Concurrency limit: 5 parallel calls
- Automatic retry for failures
- Token usage logging

---

## 16.9 Caching Strategy

Dashboard behavior:

- Load summary directly from Firestore
- Never call AI in real time

If summary exists:

  display cached summary

If summary missing:

  "Monthly summary will be available soon."

---

## 16.10 Regeneration Rules

Summary regeneration occurs only if:

- Calibration version updated
- Metric schema change detected
- Manual regeneration requested

Regeneration policy:

- Overwrite current month summary only
- Previous months remain immutable

---

## 16.11 Cost Estimation Model

Estimated token usage:

Student summary:

  ~150 input + ~200 output = ~350 tokens

Batch summary:

  ~200 input + ~250 output = ~450 tokens

Example deployment scenario:

| Parameter | Value |
|------|------|
|Institutes|100|
|Students per institute|200|
|Total students|20,000|

Estimated monthly usage:

  20,000 × 350 tokens ≈ 7,000,000 tokens

Optimized usage with batching:

  ≈ 5,000,000 tokens per month

Vendor controls may cap:
- Maximum summaries per institute
- AI availability for lower license tiers

---

## 16.12 License Control

AI Summary availability by system layer:

| Layer | Student Summary | Batch Summary |
|------|------|------|
|L0|Disabled|Disabled|
|L1|Enabled|Disabled|
|L2|Enabled|Enabled|
|L3|Enabled|Enabled|

License enforcement handled server-side.

---

## 16.13 Vendor Control Panel

Vendor configuration stored at:

vendor/config/aiSummarySettings

Configurable parameters:

| Setting | Description |
|------|------|
|Prompt Template|Editable AI prompt|
|Tone Adjustment|Control messaging tone|
|Word Limit|Maximum summary length|
|Model Selection|Change AI model|
|Layer Enablement|Enable/disable per license layer|
|Token Monitoring|Track usage per institute|

---

## 16.14 Error Handling

Failure management procedure:

1. Retry AI request up to 2 times
2. Log failure event
3. Mark summary status = failed
4. Allow manual regeneration

Failure must not affect dashboard loading.

Dashboard always reads cached Firestore data.


# 17. Calibration Simulation Engine

## 17.1 Overview
The Calibration Simulation Engine is the vendor-level intelligence system used to adjust behavioral model parameters and simulate their impact across the platform. It enables safe tuning of risk evaluation logic without modifying historical session data.

Core Capabilities:
- Behavioral weight adjustment
- Threshold modification
- Impact simulation
- Risk distribution preview
- Cross-institute comparison
- Version-controlled calibration models
- Safe deployment of updated models

Critical Constraint:
Simulation must operate only on stored summary metrics. Raw session data or question-level attempts must never be recomputed.

Primary Storage Location:
vendor/calibration

High-Level Module Structure:

  Calibration Engine
  ├── Parameter Editor
  ├── Simulation Workspace
  ├── Impact Comparison
  ├── Batch Comparison
  ├── Version Manager
  └── Deployment Control

---

## 17.2 Key Responsibilities

- Provide a controlled interface for modifying behavioral model parameters
- Validate risk weight distributions and threshold configurations
- Simulate recalculated risk scores using stored normalized metrics
- Compare simulated results against live model outcomes
- Provide cluster shift and discipline impact analytics
- Manage versioned calibration models
- Enforce safety thresholds before deployment
- Maintain audit logs for all calibration changes

---

## 17.3 Inputs

Simulation engine reads only aggregated and normalized metrics.

Primary sources:

| Source | Description |
|------|------|
|runAnalytics|Aggregated run-level performance metrics|
|studentYearMetrics|Student-level summary metrics|
|questionAnalytics (optional)|Aggregated question-level performance indicators|

Example stored session-level normalized components:

  {
    normMinTime,
    normMaxTime,
    normPhaseDev,
    normGuess,
    normWrongStreak,
    currentRiskScore,
    currentCluster
  }

Explicitly prohibited inputs:

- sessions/{questionAttempts}
- per-question timestamps
- raw behavioral event streams

---

## 17.4 Outputs

Simulation results are temporary and not persisted to primary analytics collections.

Typical outputs:

| Output | Description |
|------|------|
|newRiskScore|Simulated risk score|
|newCluster|Simulated cluster assignment|
|newDisciplineIndex|Simulated discipline index|
|clusterShiftPercent|Distribution change per cluster|
|disciplineMeanShift|Mean discipline index change|
|riskVarianceChange|Change in risk score variance|

Deployment results update only:

vendor/calibration/liveVersion

---

## 17.5 Workflow

### 17.5.1 Parameter Editing

Vendor can modify model parameters via the parameter editor.

Risk Weight Configuration:

  {
    minTimeWeight: 0.25,
    maxTimeWeight: 0.20,
    phaseWeight: 0.20,
    guessWeight: 0.20,
    wrongStreakWeight: 0.15
  }

Validation Rules:

- Each weight ≥ 0
- Sum(weights) == 1

Threshold Configuration:

  {
    rushMinTimeThreshold: 20,
    rushGuessThreshold: 25,
    easyNeglectThreshold: 30,
    hardBiasThreshold: 40,
    wrongStreakCritical: 5,
    clusterThresholds: {
      stableMax: 20,
      driftMax: 40,
      impulsiveMax: 60,
      overextendedMax: 80
    }
  }

Phase Weight Modifiers:

  {
    earlyHardWeight: 0.3,
    lateEasyWeight: 0.4,
    phaseDeviationWeight: 0.3
  }

Model parameters stored at:

vendor/calibration/models/{versionId}

---

### 17.5.2 Simulation Execution

Simulation process:

1. Select calibration model version (draft).
2. Select simulation scope.
3. Load session-level normalized metrics.
4. Apply new parameter configuration.
5. Recalculate risk scores and clusters.
6. Compare simulated results with live model.

Simulation Scope Options:

- All institutes
- Selected institutes
- Selected academic year

All computations performed in memory or temporary compute environment.

No Firestore data mutation allowed.

---

### 17.5.3 Risk Recalculation Logic

Simulation recalculates risk scores using stored normalized metrics.

Formula:

  newRiskScore =
    normMinTime * newMinTimeWeight
  + normMaxTime * newMaxTimeWeight
  + normPhaseDev * newPhaseWeight
  + normGuess * newGuessWeight
  + normWrongStreak * newWrongWeight

Cluster assignment determined using updated threshold configuration.

No recalculation of raw behavioral signals is permitted.

---

### 17.5.4 Impact Comparison

Simulation compares results against the live model.

Cluster Distribution Shift Example:

| Cluster | Before | After | Delta |
|------|------|------|------|
|Stable|42%|38%|-4%|
|Impulsive|21%|27%|+6%|

Additional metrics evaluated:

1. Discipline Index Mean Shift

  avgDisciplineBefore vs avgDisciplineAfter

2. Risk Score Variance Change

Measures whether distribution becomes overly volatile or excessively compressed.

3. Template-Level Stress Change

  avgRiskPerTemplateBefore vs avgRiskPerTemplateAfter

---

### 17.5.5 Batch Comparison

Simulation can compare behavioral impact across institutional groups.

Supported comparisons:

- Institute A vs Institute B
- Academic Year 2024 vs 2025
- Batch 1 vs Batch 2

Evaluated indicators:

| Metric | Description |
|------|------|
|Batch Risk Distribution Change|Cluster shifts within batch|
|Batch Discipline Index Change|Mean discipline movement|

Purpose:

- Detect disproportionate model impact
- Identify institutional vulnerability to recalibration

---

### 17.5.6 Version Management

Each calibration change creates a new model version.

Example:

  versionId: cal_v2026_01

Model states:

| Status | Meaning |
|------|------|
|draft|Editable configuration|
|simulated|Simulation completed|
|approved|Ready for deployment|
|live|Currently deployed model|
|archived|Inactive historical model|

Vendor workflow:

1. Create draft version
2. Modify parameters
3. Run simulation
4. Review results
5. Approve model
6. Deploy to production

---

### 17.5.7 Deployment Control

Deployment updates the active calibration version.

Live version pointer:

vendor/calibration/liveVersion

Deployment behavior:

- New submissions use updated model
- Historical sessions remain unchanged
- Rolling metrics may optionally recompute in background jobs

Historical session data must never be overwritten.

---

## 17.6 Dependencies

| Dependency | Purpose |
|------|------|
|runAnalytics|Aggregated run performance metrics|
|studentYearMetrics|Student-level behavioral summaries|
|questionAnalytics|Optional question-level aggregates|
|Vendor Config Store|Calibration parameter storage|
|BigQuery Export (optional)|Large-scale offline simulations|
|Batch Analytics|Cross-batch comparisons|

---

## 17.7 Error Handling

### Parameter Validation Errors

Deployment blocked if:

- Weight values are negative
- Sum of weights ≠ 1
- Threshold values outside expected range

Validation must occur before simulation execution.

---

### Safety Threshold Enforcement

Deployment automatically blocked if simulation produces unsafe shifts.

Safety rules:

| Condition | Deployment Block |
|------|------|
|Stable cluster drop > 15%|Blocked|
|Volatile cluster increase > 20%|Blocked|
|Discipline mean drop > 10%|Blocked|

Safety thresholds configurable via vendor settings.

---

### Performance Constraints

Simulation must enforce strict compute limits.

Rules:

- Use aggregation queries only
- Limit maximum sessions per institute
- Support sampling (e.g., 10% dataset)

Large-scale recalibrations must run through:

- BigQuery export
- Offline simulation pipeline
- Aggregated results returned to vendor dashboard

---

### Audit Logging

Every calibration modification must generate an immutable audit record.

Storage location:

vendor/auditLogs

Structure:

  {
    action: "Calibration Update",
    oldVersion,
    newVersion,
    changedBy,
    changedFields,
    timestamp
  }

Audit records cannot be edited or deleted.




# 18. Global Calibration Versioning Strategy

## 18.1 Overview
The Global Calibration Versioning Strategy governs how behavioral model parameters are versioned, deployed, and applied across the system. It ensures safe production updates while preserving historical determinism.

Core objectives:

- Safe deployment of behavioral model updates
- Deterministic calibration selection per submission
- Scheduled model activation
- Institute-level override capability
- Immediate rollback support
- Zero mutation of historical session data
- Full audit compliance

Calibration impacts:

- Risk score computation
- Risk cluster assignment
- Discipline index calculation
- Pattern detection thresholds
- Escalation trigger logic

Core principles:

- All calibration models are versioned
- Live models are immutable
- Historical sessions remain permanently bound to their original calibration version
- New submissions always reference the active version pointer
- Model evaluation is snapshot-based at submission time

---

## 18.2 Key Responsibilities

- Maintain version-controlled behavioral calibration models
- Provide a single global live calibration pointer
- Support scheduled activation of approved calibration versions
- Enable institute-level calibration overrides
- Provide rollback capability without historical mutation
- Enforce deployment safety guardrails
- Maintain audit logs for all calibration lifecycle events
- Guarantee backward compatibility across schema versions

---

## 18.3 Inputs

Primary configuration sources:

| Source | Purpose |
|------|------|
|vendor/calibration/models|Calibration model definitions|
|vendor/calibration/live|Global active version pointer|
|institutes/{instituteId}/calibrationOverride|Institute-specific calibration override|
|vendor/calibration/safetyRules|Deployment guardrail thresholds|
|vendor/calibration/versionComparisons|Simulation comparison results|

---

## 18.4 Outputs

Calibration metadata stored in sessions:

  {
    calibrationVersion: "cal_v2026_01"
  }

Live calibration pointer:

  {
    activeVersionId: "cal_v2026_01",
    activatedAt: timestamp
  }

Version comparison records:

  {
    comparedAgainst,
    clusterShiftSummary,
    disciplineShift,
    simulatedAt
  }

Audit log entry:

  {
    type: "Calibration Activation",
    oldVersion,
    newVersion,
    changedBy,
    timestamp
  }

---

## 18.5 Workflow

### 18.5.1 Calibration Model Storage

All calibration models stored at:

vendor/calibration/models/{versionId}

Example structure:

  {
    versionId: "cal_v2026_01",
    createdAt: timestamp,
    createdBy: vendorUserId,
    status: "draft",
    activationAt: null,
    parameters: {
      riskWeights: {...},
      thresholds: {...},
      phaseWeights: {...},
      rollingWindowSize: 5
    },
    schemaVersion: 2,
    notes: "Adjusted rush sensitivity for JEE cohort"
  }

Status values:

| Status | Meaning |
|------|------|
|draft|Editable calibration model|
|approved|Ready for scheduling|
|scheduled|Pending timed activation|
|live|Currently active calibration|
|archived|Historical inactive model|

Rules:

- Live models are immutable
- Changes require creating a new version document

---

### 18.5.2 Global Live Version Pointer

Single authoritative pointer:

vendor/calibration/live

Structure:

  {
    activeVersionId: "cal_v2026_01",
    activatedAt: timestamp
  }

Operational rules:

- All new submissions read this pointer
- Calibration weights must never be embedded in application code
- Pointer update instantly changes behavior for new submissions

---

### 18.5.3 Activation Scheduling

Delayed activation supported via timestamp scheduling.

Activation workflow:

1. Vendor creates draft model
2. Vendor approves model
3. Vendor sets activationAt timestamp
4. Model status changes to scheduled

Cloud Scheduler runs every 5 minutes:

  if currentTime >= activationAt:
      update live pointer
      change model status → live
      record audit event

---

### 18.5.4 Calibration Snapshot at Submission

During session submission:

1. System reads active calibration version
2. Calibration parameters loaded
3. Risk and pattern engines execute
4. Calibration version stored in session

Session metadata:

  {
    calibrationVersion: "cal_v2026_01"
  }

Critical rule:

Historical sessions remain permanently tied to the version used at submission.

Reprocessing occurs only through explicit administrative recompute jobs.

---

### 18.5.5 Institute-Level Override

Institutes may use custom calibration models.

Override configuration:

institutes/{instituteId}/calibrationOverride

Example:

  {
    overrideVersionId: "cal_custom_A1",
    active: true
  }

Submission resolution order:

1. Check institute override
2. If active → use overrideVersionId
3. Otherwise → use global live version

Overrides are vendor-managed only.

---

### 18.5.6 Rollback Mechanism

Rollback procedure:

1. Vendor selects previous calibration version
2. Update global live pointer

Example rollback:

  {
    activeVersionId: "cal_v2025_09"
  }

Effects:

- All new submissions immediately use previous model
- Historical sessions remain unchanged

Optional advanced rollback actions:

- Recompute rolling risk aggregates
- Flag affected institutes for monitoring

---

### 18.5.7 Deployment Guardrails

Calibration activation requires safety validation.

Guardrails stored at:

vendor/calibration/safetyRules

Example thresholds:

| Condition | Activation Result |
|------|------|
|Stable cluster drop > threshold|Activation blocked|
|Volatile cluster spike > threshold|Activation blocked|
|Discipline mean drop > threshold|Activation blocked|

Validation performed after simulation results are generated.

Unsafe models cannot be activated.

---

### 18.5.8 Version Comparison Tracking

Simulation comparisons stored for governance analysis.

Storage path:

vendor/calibration/versionComparisons/{versionId}

Example record:

  {
    comparedAgainst: "cal_v2025_09",
    clusterShiftSummary: {...},
    disciplineShift: {...},
    simulatedAt: timestamp
  }

Purpose:

- Model validation
- Governance reporting
- Historical impact analysis

---

### 18.5.9 Compatibility Rules

Calibration models must support schema evolution.

Version documents include:

  {
    schemaVersion: number
  }

Compatibility requirements:

- New parameters must include defaults
- Risk engine must support older schema versions
- Parameter readers must tolerate missing fields

This guarantees backward compatibility for historical sessions.

---

### 18.5.10 Archiving Strategy

Old calibration models transitioned to:

status = archived

Archived models:

- Cannot be deployed
- Remain accessible for historical interpretation
- Remain immutable

---

### 18.5.11 Governance Integration

Governance dashboards must display:

- Current calibration version
- Last activation timestamp
- Stability metrics before and after calibration updates
- Institute override usage

Institution directors can view calibration versions associated with each academic year.

---

## 18.6 Dependencies

| Dependency | Purpose |
|------|------|
|Calibration Simulation Engine|Validates model impact before activation|
|Risk Engine|Consumes calibration parameters|
|Pattern Engine|Uses threshold configuration|
|Cloud Scheduler|Activation monitoring|
|Cloud Functions|Submission-time model loading|
|Vendor Configuration Store|Calibration parameter storage|
|Governance Dashboard|Model monitoring|

---

## 18.7 Error Handling

### Activation Validation Failure

Deployment blocked if:

- Simulation guardrails violated
- Required parameters missing
- Calibration schema incompatible

Vendor must modify model before resubmission.

---

### Missing Calibration Pointer

If global pointer missing:

- Block submission processing
- Log system error
- Notify vendor monitoring service

System must never default to hardcoded calibration values.

---

### Override Validation Failure

If institute override references invalid version:

- Ignore override
- Fallback to global live calibration
- Log warning event

---

### Audit Logging

Every lifecycle event recorded in immutable logs:

vendor/auditLogs

Example:

  {
    type: "Calibration Activation",
    oldVersion: "cal_v2025_09",
    newVersion: "cal_v2026_01",
    changedBy: vendorUserId,
    timestamp
  }

Audit logs cannot be modified or deleted.




# 19. HOT–WARM–COLD Partition Model

## 19.1 Overview
The HOT–WARM–COLD Partition Model defines the full lifecycle of system data across execution, analytics, and archival phases. It ensures long-term scalability, predictable Firestore costs, stable query performance, and audit integrity across multiple academic years.

Data lifecycle is organized by the hierarchy:

Institute → Academic Year → Runs → Sessions

Data temperature tiers:

| Tier | Purpose | Query Frequency |
|-----|-----|-----|
|HOT|Active execution and real-time analytics|High|
|WARM|Completed runs within current academic year|Medium|
|COLD|Archived academic years|Rare|

Core objectives:
- Maintain high performance for active workloads
- Reduce long-term storage cost
- Preserve governance and audit records
- Enforce strict academic-year boundaries
- Prevent unbounded database growth

---

## 19.2 Key Responsibilities

- Manage lifecycle transitions of academic data
- Maintain separate operational tiers for active, historical, and archived data
- Control Firestore storage growth through archival
- Generate governance snapshots before archival
- Export raw historical data to BigQuery
- Enforce immutability after academic year archival
- Ensure queries remain bounded within academic year partitions

---

## 19.3 Inputs

Primary lifecycle metadata stored at:

institutes/{id}/academicYears/{year}

Example structure:

  {
    status: "active" | "locked" | "archived",
    startDate,
    endDate,
    archivedAt,
    snapshotGenerated: boolean
  }

Operational data sources:

| Collection | Purpose |
|-----|-----|
|runs|Test runs within academic year|
|sessions|Student attempt sessions|
|studentYearMetrics|Per-student annual metrics|
|batchAggregates|Batch-level analytics|
|runAnalytics|Run-level analytics|
|templateAnalytics|Template-level analytics|
|questionAnalytics|Question-level aggregates|

---

## 19.4 Outputs

Archival outputs include:

| Artifact | Storage Location |
|-----|-----|
|Session archive|BigQuery dataset|
|Governance snapshot|Firestore governanceSnapshots collection|
|Run analytics summary|Firestore runAnalytics|
|Template analytics|Firestore templateAnalytics|
|Student annual metrics snapshot|Firestore studentYearMetrics|

Example governance snapshot:

  {
    stabilityIndex,
    disciplineMean,
    riskDistribution,
    templateStability,
    batchRiskMap,
    overrideSummary,
    calibrationVersionUsed,
    generatedAt
  }

---

## 19.5 Workflow

### 19.5.1 HOT Tier (Active Zone)

Definition:
Data actively used for execution and analytics in the current academic year.

Storage:

institutes/{id}/academicYears/{year}/runs/{runId}  
runs/{runId}/sessions/{sessionId}

Primary collections:

- studentYearMetrics
- batchAggregates
- runAnalytics
- templateAnalytics
- questionAnalytics

HOT tier characteristics:

- Current academic year only
- Heavy indexing
- High read/write throughput
- Summary documents preferred over deep joins

---

### 19.5.2 WARM Tier (Current-Year History)

Definition:
Completed runs within the active academic year.

Transition condition:

run.status = completed

Effects:

- runAnalytics marked finalized
- session documents locked
- no recalculation allowed
- analytics queries permitted

Sessions remain in Firestore but are no longer modified.

---

### 19.5.3 COLD Tier (Archived Academic Years)

Definition:
Academic years that have been archived after completion.

Archive trigger:

Admin → Settings → Archive Academic Year

Archive process:

1. Generate governance snapshot
2. Export session-level data to BigQuery
3. Mark academicYear.status = archived
4. Delete session documents from Firestore
5. Retain summary analytics documents

Firestore retains only summarized data required for governance and reporting.

---

### 19.5.4 Cold Storage Architecture

Raw historical data exported to BigQuery.

Dataset naming convention:

  institute_{id}_archive

Example tables:

| Table | Content |
|-----|-----|
|sessions_2025|Session attempt data|
|sessions_2024|Session attempt data|
|riskMetrics_2025|Session risk metrics|
|patternMetrics_2025|Pattern detection outputs|

Firestore retains only:

- runAnalytics
- templateAnalytics
- governanceSnapshots
- final studentYearMetrics snapshot

---

### 19.5.5 Academic Year Lifecycle States

Academic year state machine:

| State | Behavior |
|-----|-----|
|active|Full read/write allowed|
|locked|No new runs or sessions; metrics finalize|
|archived|Session data removed; read-only summary access|

State transitions:

active → locked → archived

---

### 19.5.6 Archive Trigger Rules

Archive allowed only when:

- All runs completed
- No active sessions
- Governance snapshot generated
- Admin confirmation received

Double confirmation required before archival execution.

---

### 19.5.7 Governance Snapshot Generation

Before archival, system generates a governance snapshot.

Storage location:

governanceSnapshots/{year}

Example structure:

  {
    stabilityIndex,
    disciplineMean,
    riskDistribution,
    templateStability,
    batchRiskMap,
    overrideSummary,
    calibrationVersionUsed,
    generatedAt
  }

Snapshots ensure long-term governance analysis without accessing session data.

---

### 19.5.8 Data Reset Boundaries

When a new academic year begins, system resets yearly analytics collections.

Reset objects:

- studentYearMetrics
- batchAggregates
- rolling risk windows
- pattern counters

Objects that persist across years:

- question bank
- test templates
- institute profiles
- licensing configuration
- calibration models

---

### 19.5.9 Query Partitioning Strategy

All operational queries must include academic year filters.

Example constraint:

where academicYear == currentYear

Index partitioning dimensions:

| Index Field | Purpose |
|-----|-----|
|academicYear|Year isolation|
|instituteId|Tenant isolation|

Cross-year queries are prohibited in HOT tier operations.

---

### 19.5.10 Firestore Cost Control

Without archival:

Example workload:

200 students × 30 tests × 60 attempts  
≈ 360,000 session writes per year

Over multiple years this produces unbounded growth.

Archival policy deletes session documents after export, leaving only summary records.

Benefits:

- predictable Firestore storage growth
- lower operational cost
- stable query performance

---

### 19.5.11 Immutability Enforcement

When:

academicYear.status = archived

The system blocks:

- run modifications
- metric recalculations
- pattern updates
- calibration overrides
- session writes

Archived academic years are permanently frozen.

---

### 19.5.12 Cold Access Policy

Historical access methods:

| Access Type | Source |
|-----|-----|
|Governance summaries|Firestore governanceSnapshots|
|Run analytics summaries|Firestore runAnalytics|
|Deep historical analysis|BigQuery export tables|

Session-level queries are not permitted in Firestore after archival.

---

### 19.5.13 Automated Archive Option

Optional automation:

autoArchiveAfterDays = 30

Automated flow:

1. Academic year ends
2. System sets status → locked
3. Wait configured days
4. Trigger archive process automatically

Configuration controlled at vendor level.

---

### 19.5.14 Governance Continuity

Longitudinal governance analytics read exclusively from:

governanceSnapshots/{year}

Advantages:

- No dependency on raw session data
- Fast cross-year analytics
- Long-term stability for institutional reporting

Supports multi-year performance tracking.

---

### 19.5.15 Version Compatibility

Archived academic year metadata includes:

  {
    calibrationVersionUsed,
    schemaVersion,
    riskModelVersion
  }

Purpose:

- Ensure historical interpretability
- Preserve behavioral model context for archived data

---

### 19.6 Dependencies

| Dependency | Purpose |
|-----|-----|
|Cloud Functions|Archive execution pipeline|
|BigQuery|Long-term session storage|
|Governance Engine|Snapshot generation|
|Calibration Engine|Version tracking within snapshots|
|Firestore|Operational data store|
|Cloud Scheduler|Automated archive scheduling|

---

### 19.7 Error Handling

Archive operation failures handled as follows:

| Failure Case | Handling |
|-----|-----|
|BigQuery export failure|Abort archive; retain session data|
|Snapshot generation failure|Abort archive process|
|Active sessions detected|Block archival request|
|Partial deletion detected|Restore from backup and retry|

Archive execution must be atomic to prevent partial data loss. 



# 20. BigQuery Archive Schema

## 20.1 Overview
The BigQuery Archive Schema defines the long-term cold storage architecture for archived academic data. It supports multi-year analytics, governance audits, calibration research, and cross-institute intelligence while maintaining strict separation from live system operations.

Design principles:

- Cold storage only (no live execution queries)
- Flattened analytics-friendly schema
- One row per session
- Partitioned for time-based pruning
- Clustered for institute and batch filtering
- Immutable archival records
- Vendor-controlled access

Primary use cases:

- Longitudinal analytics
- Governance reporting
- Calibration simulation research
- Cross-institute benchmarking
- Vendor intelligence analytics

Operational constraint:

This dataset must never be queried by the execution engine or live portal services.

---

## 20.2 Key Responsibilities

- Store archived session-level summaries
- Preserve governance snapshots across years
- Support vendor-level benchmarking analytics
- Provide research datasets for calibration models
- Enable efficient time-based analytical queries
- Maintain immutable historical records

---

## 20.3 Dataset Structure

Each institute receives a dedicated dataset:

project.dataset:

  institute_{instituteId}_archive

Example:

  institute_ABC_archive

Vendor global intelligence dataset:

project.dataset:

  vendor_global_archive

Purpose:

| Dataset | Usage |
|--------|------|
|institute_{id}_archive|Institute-specific archived analytics|
|vendor_global_archive|Cross-institute benchmarking and research|

---

## 20.4 Session Export Table

Table naming convention:

sessions_{academicYear}

Example:

sessions_2025

Each row represents a single completed session.

Schema:

| Field | Type |
|------|------|
|institute_id|STRING|
|academic_year|STRING|
|run_id|STRING|
|session_id|STRING|
|student_id|STRING|
|batch_id|STRING|
|template_id|STRING|
|exam_type|STRING|
|mode|STRING|
|calibration_version|STRING|
|submitted_at|TIMESTAMP|
|duration_seconds|INT64|

Performance metrics:

| Field | Type |
|------|------|
|raw_score_percent|FLOAT64|
|accuracy_percent|FLOAT64|
|rank_in_batch|INT64|

Risk engine outputs:

| Field | Type |
|------|------|
|risk_score|FLOAT64|
|risk_cluster|STRING|
|discipline_index|FLOAT64|

Phase metrics:

| Field | Type |
|------|------|
|phase_adherence_percent|FLOAT64|
|phase_deviation_percent|FLOAT64|
|hard_in_phase1_percent|FLOAT64|
|easy_remaining_after_phase1_percent|FLOAT64|

Timing metrics:

| Field | Type |
|------|------|
|min_time_violation_percent|FLOAT64|
|max_time_violation_percent|FLOAT64|

Pattern signals:

| Field | Type |
|------|------|
|guess_rate_percent|FLOAT64|
|skip_burst_count|INT64|
|consecutive_wrong_streak_max|INT64|

Behavior flags:

| Field | Type |
|------|------|
|rush_signal|BOOL|
|easy_neglect_signal|BOOL|
|hard_bias_signal|BOOL|
|skip_burst_signal|BOOL|
|wrong_streak_signal|BOOL|

Metadata:

| Field | Type |
|------|------|
|created_at|TIMESTAMP|

Design rules:

- No question-level rows
- One row per session
- No nested arrays
- Schema optimized for analytical queries

---

## 20.5 Partitioning Strategy

Tables must use time-based partitioning.

Recommended configuration:

PARTITION BY DATE(submitted_at)

Cluster configuration:

CLUSTER BY institute_id, batch_id

Benefits:

- Efficient time pruning
- Faster institute-level queries
- Faster batch-level analysis
- Reduced scan cost

Alternative configuration:

PARTITION BY DATE_TRUNC(submitted_at, MONTH)

Daily partitioning is recommended for optimal query pruning.

---

## 20.6 Governance Snapshot Table

Table name:

governance_snapshots

Schema:

| Field | Type |
|------|------|
|institute_id|STRING|
|academic_year|STRING|
|snapshot_month|STRING|
|stability_index|FLOAT64|
|discipline_mean|FLOAT64|
|risk_stable_percent|FLOAT64|
|risk_drift_percent|FLOAT64|
|risk_impulsive_percent|FLOAT64|
|risk_overextended_percent|FLOAT64|
|risk_volatile_percent|FLOAT64|
|template_stability_score|FLOAT64|
|override_frequency|FLOAT64|
|calibration_version|STRING|
|generated_at|TIMESTAMP|

Purpose:

- Governance dashboards
- Multi-year trend comparison
- Director-level reporting
- Calibration impact tracking

---

## 20.7 Cross-Institute Aggregate Table

Dataset:

vendor_global_archive

Table:

cross_institute_aggregates

Schema:

| Field | Type |
|------|------|
|academic_year|STRING|
|snapshot_month|STRING|
|total_institutes|INT64|
|avg_stability_index|FLOAT64|
|avg_discipline_mean|FLOAT64|
|global_risk_stable_percent|FLOAT64|
|global_risk_drift_percent|FLOAT64|
|global_risk_impulsive_percent|FLOAT64|
|global_risk_overextended_percent|FLOAT64|
|global_risk_volatile_percent|FLOAT64|
|avg_controlled_mode_delta|FLOAT64|
|avg_phase_adherence|FLOAT64|
|generated_at|TIMESTAMP|

Purpose:

- Vendor calibration research
- Global behavioral benchmarking
- Product intelligence
- Market-level analytics

Access restricted to vendor analytics systems.

---

## 20.8 Template Performance Archive

Optional analytics table:

template_performance_{year}

Example:

template_performance_2025

Schema:

| Field | Type |
|------|------|
|institute_id|STRING|
|academic_year|STRING|
|template_id|STRING|
|avg_raw_score_percent|FLOAT64|
|avg_accuracy_percent|FLOAT64|
|avg_risk_score|FLOAT64|
|risk_variance|FLOAT64|
|run_count|INT64|
|generated_at|TIMESTAMP|

Purpose:

- Identify unstable test templates
- Detect exam difficulty drift
- Support template design improvements

---

## 20.9 Calibration Research Table

Vendor-only research dataset:

calibration_research_sessions

Schema:

| Field | Type |
|------|------|
|norm_min_time|FLOAT64|
|norm_max_time|FLOAT64|
|norm_phase_dev|FLOAT64|
|norm_guess|FLOAT64|
|norm_wrong_streak|FLOAT64|
|risk_cluster|STRING|
|academic_year|STRING|

Purpose:

- Calibration Simulation Engine experiments
- Behavioral model tuning
- Vendor research analytics

Constraint:

No raw timestamps or identifiable session metadata.

---

## 20.10 Storage Strategy

Estimated scale:

Example scenario:

- 100 institutes
- 200 students per institute
- 30 tests per year

Total session rows:

600,000 rows per year

BigQuery advantages:

- Columnar compression
- Low storage cost
- High analytical query performance

Query optimization requirement:

Always filter by:

WHERE academic_year = 'YYYY'
AND institute_id = 'X'

---

## 20.11 Security Model

Access control rules:

Institute archive datasets:

- Write access: vendor service account only
- Read access: restricted vendor analytics services

Vendor global dataset:

- Vendor IAM roles only
- No institute access permitted

Public or external access prohibited.

---

## 20.12 Archive Execution Workflow

Archive process triggered during academic year archival.

Cloud Function workflow:

1. Read all session summaries from Firestore
2. Transform into flattened BigQuery rows
3. Insert into sessions_{year} table
4. Verify exported row count
5. Delete Firestore session documents
6. Update academic year status to archived

All steps logged for audit verification.

---

## 20.13 Immutability Rules

Archived rows must never be modified.

Policy:

- No updates
- No deletes
- No in-place recalibration

If recalibration analysis is required:

Create a derived table:

sessions_2025_recalc_v2

Original archive remains unchanged.

---

## 20.14 Example Analytical Queries

Example 1 — Stability trend over multiple years:

SELECT academic_year, AVG(stability_index)
FROM governance_snapshots
WHERE institute_id = 'ABC'
GROUP BY academic_year
ORDER BY academic_year;

Example 2 — Risk cluster distribution:

SELECT risk_cluster, COUNT(*)
FROM sessions_2025
GROUP BY risk_cluster;

These queries support vendor research and governance analytics.



# 21. Governance Snapshot Model

## 21.1 Overview
The Governance Snapshot Model provides the institutional executive analytics layer. It captures monthly aggregated performance indicators that enable longitudinal stability analysis, governance reporting, and cross-year institutional evaluation.

Design principles:

- Monthly snapshot generation
- Immutable records once created
- Aggregated metrics only
- No raw session queries
- Calibration-version awareness
- Export-ready structure (PDF / JSON)
- Compatible with multi-year comparisons

Primary storage location:

institutes/{instituteId}/governanceSnapshots/{YYYY_MM}

Example:

governanceSnapshots/2026_01

These snapshots represent the canonical institutional performance record.

---

## 21.2 Key Responsibilities

- Generate monthly institutional governance snapshots
- Compute institutional stability index
- Track discipline and risk distribution trends
- Maintain immutable monthly historical records
- Enable longitudinal comparisons across months and years
- Provide export-ready governance summaries
- Maintain calibration-version traceability
- Populate BigQuery governance analytics tables

---

## 21.3 Inputs

Governance snapshots use aggregated metrics only.

Primary sources:

| Source | Purpose |
|------|------|
|studentYearMetrics|Student-level aggregated behavioral metrics|
|batchAggregates|Batch-level behavioral patterns and performance|
|runAnalytics|Run-level summary statistics|

Prohibited sources:

- sessions collections
- questionAttempts data
- question-level timing events

All snapshot inputs must be summary documents.

---

## 21.4 Outputs

Primary Firestore document:

institutes/{instituteId}/governanceSnapshots/{YYYY_MM}

Example schema:

  {
    instituteId: "inst_001",
    academicYear: "2025-2026",
    month: "2026-01",

    calibrationVersion: "cal_v2026_01",
    schemaVersion: 1,

    stabilityIndex: 78.4,
    disciplineMean: 74.1,
    disciplineVariance: 8.2,

    avgRawScorePercent: 62.5,
    avgAccuracyPercent: 71.2,

    riskDistribution: {
      stable: 38.2,
      driftProne: 24.5,
      impulsive: 18.3,
      overextended: 12.1,
      volatile: 6.9
    },

    avgPhaseAdherence: 69.5,
    controlledModeUsagePercent: 32.1,
    controlledModeImprovementDelta: 9.4,

    rushPatternPercent: 21.4,
    easyNeglectPercent: 18.2,
    hardBiasPercent: 15.7,
    skipBurstPercent: 11.8,
    wrongStreakPercent: 7.2,

    templateVarianceMean: 6.3,

    overrideFrequency: 2.4,

    generatedAt: timestamp,
    immutable: true
  }

---

## 21.5 Workflow

### 21.5.1 Monthly Snapshot Generation

Trigger methods:

- Scheduled monthly cron job
- Pre-archive academic year finalization

Execution flow:

1. Load studentYearMetrics aggregates
2. Load batchAggregates summaries
3. Load runAnalytics summary documents
4. Compute institutional metrics
5. Calculate stabilityIndex
6. Construct snapshot document
7. Write snapshot to Firestore
8. Export snapshot to BigQuery (optional)

Execution rule:

No session-level queries permitted.

---

### 21.5.2 Stability Index Computation

Institutional stability reflects behavioral balance and performance consistency.

Step 1: Risk Instability Score

  instabilityScore =
    (driftProne * 0.2)
  + (impulsive * 0.4)
  + (overextended * 0.6)
  + (volatile * 0.8)

Result normalized to 0–100.

Step 2: Discipline Consistency Penalty

  disciplinePenalty = disciplineVariance

Higher variance reduces stability.

Step 3: Template Stress Penalty

  templatePenalty = templateVarianceMean

Measures template-level instability.

Step 4: Final Stability Index

  stabilityIndex =
    100
    - (instabilityScore * 0.5)
    - (disciplinePenalty * 0.3)
    - (templatePenalty * 0.2)

Clamp result between:

0 ≤ stabilityIndex ≤ 100

Higher values indicate stronger institutional stability.

---

### 21.5.3 Longitudinal Trend Computation

Snapshots are stored monthly.

Trend calculation uses chronological ordering:

orderBy month asc

Month-over-Month comparison:

  deltaStability =
    current.stabilityIndex
    - previous.stabilityIndex

Trend classification:

| Delta Range | Trend |
|------|------|
|> +3|Improving|
|-3 to +3|Stable|
|< -3|Declining|

Year-over-Year comparison:

Compare identical academic phases:

Example:

2026_01 vs 2025_01

Trend labels stored in governance analytics layer.

---

### 21.5.4 Calibration Version Awareness

Each snapshot records the active calibration model.

Field:

calibrationVersion

Purpose:

- Ensure historical interpretability
- Enable calibration impact studies
- Track behavioral model changes across months

If calibration changes mid-year:

Subsequent snapshots reflect the new version.

---

### 21.5.5 Export Format

Snapshots must support export for governance reporting.

Standard export structure:

  {
    header: {
      instituteName,
      academicYear,
      month,
      generatedAt
    },
    performance: {...},
    execution: {...},
    riskDistribution: {...},
    governanceIndicators: {...}
  }

Export formats:

- JSON
- PDF report

Optional integrity features:

- calibrationVersion included
- schemaVersion included
- snapshot hash for verification

---

## 21.6 BigQuery Mirror Table

BigQuery table:

governance_snapshots

Schema:

| Field | Type |
|------|------|
|institute_id|STRING|
|academic_year|STRING|
|month|STRING|
|stability_index|FLOAT64|
|discipline_mean|FLOAT64|
|discipline_variance|FLOAT64|
|avg_raw_score_percent|FLOAT64|
|avg_accuracy_percent|FLOAT64|
|risk_stable|FLOAT64|
|risk_drift|FLOAT64|
|risk_impulsive|FLOAT64|
|risk_overextended|FLOAT64|
|risk_volatile|FLOAT64|
|phase_adherence|FLOAT64|
|controlled_mode_delta|FLOAT64|
|override_frequency|FLOAT64|
|calibration_version|STRING|
|generated_at|TIMESTAMP|

Purpose:

- Cross-year governance comparison
- Vendor benchmarking
- Institutional analytics research

---

## 21.7 Archive Boundary Integration

When an academic year is archived:

1. Final governance snapshot generated
2. Snapshot stored permanently
3. Raw sessions deleted from Firestore
4. Snapshot becomes canonical historical record

Future analytics rely on:

- governanceSnapshots
- runAnalytics summaries
- BigQuery archive tables

---

## 21.8 Governance Dashboard Usage

L3 governance dashboards visualize:

- Current stability index gauge
- 12-month stability trend chart
- Risk distribution stacked area chart
- Discipline trajectory graph
- Override frequency timeline
- Calibration version indicator

Default access scope:

Institution-level summaries only.

Student-level drill-down disabled by default.

---

## 21.9 Dependencies

| Dependency | Purpose |
|------|------|
|studentYearMetrics|Aggregated student metrics|
|batchAggregates|Batch-level behavioral signals|
|runAnalytics|Run-level performance summaries|
|Calibration Versioning System|Calibration tracking|
|BigQuery Archive Layer|Long-term governance analytics|
|Cloud Scheduler|Monthly snapshot trigger|

---

## 21.10 Error Handling

Snapshot generation must tolerate missing or delayed metrics.

Failure handling:

| Failure Scenario | Handling |
|------|------|
|Missing summary metrics|Skip field and log warning|
|Computation error|Abort snapshot generation|
|Firestore write failure|Retry operation|
|BigQuery export failure|Log error but preserve Firestore snapshot|

System rules:

- Snapshot generated once per month
- Snapshots never overwritten
- Generation failures must not impact operational systems

---

## 21.11 Performance Strategy

Snapshot generation complexity:

- O(number of batches)
- O(number of summary documents)

Performance guarantees:

- No session-level scans
- No cross-year queries
- Predictable runtime regardless of historical data volume



# 22. Schema Evolution & Migration Strategy

## 22.1 Overview
The Schema Evolution & Migration Strategy defines how the system safely evolves its data structures over long operational lifetimes while maintaining backward compatibility and audit integrity.

Objectives:

- Support 10+ year operational lifespan
- Allow risk model evolution
- Permit controlled schema expansion
- Maintain backward compatibility
- Prevent destructive historical rewrites
- Provide auditable migration procedures

Design requirements:

- Every document carries a schema version
- Engines must support multiple schema versions
- Migrations must be explicit and idempotent
- Archived data remains immutable

---

## 22.2 Key Responsibilities

- Maintain schema version markers across all major collections
- Enforce backward-compatible schema changes
- Provide migration execution framework
- Support additive schema evolution
- Prevent destructive changes to archived records
- Maintain compatibility matrix across schema versions
- Provide monitoring and integrity validation for migrations

---

## 22.3 Inputs

Primary data sources subject to schema evolution:

| Collection | Description |
|------|------|
|sessions|Student session records|
|runAnalytics|Run-level performance summaries|
|studentYearMetrics|Student annual aggregates|
|governanceSnapshots|Monthly governance records|
|templates|Test template definitions|
|calibration models|Behavioral calibration configurations|

Each document must include a schema version field.

Example session document:

  {
    sessionId: "...",
    schemaVersion: 3,
    calibrationVersion: "cal_v2026_01",
    riskScore: 42.3,
    disciplineIndex: 61.2
  }

---

## 22.4 Outputs

Migration artifacts stored at:

vendor/migrations/{migrationId}

Example migration document:

  {
    migrationId: "mig_2026_02",
    targetCollection: "studentYearMetrics",
    fromVersion: 2,
    toVersion: 3,
    status: "draft",
    createdAt,
    executedAt,
    description: "Add guessClusterScore field",
    dryRunCompleted: false
  }

Integrity report location:

vendor/migrations/{migrationId}/integrityReport

Compatibility matrix stored at:

vendor/schemaCompatibilityMatrix

---

## 22.5 Workflow

### 22.5.1 Document Version Field

Every major collection document must contain:

  {
    schemaVersion: number
  }

Required collections:

- sessions
- runAnalytics
- studentYearMetrics
- governanceSnapshots
- calibration models
- templates

Version increment rules:

| Trigger | Version Increment |
|------|------|
|Field renamed|Yes|
|Field removed|Yes|
|Field meaning changed|Yes|
|New required field added|Yes|
|Optional field added|No|

---

### 22.5.2 Backward Compatibility Policy

Schema evolution must follow strict compatibility rules.

Rule 1 — Additive Changes

New optional fields may be added without migration.

Example:

  {
    guessClusterScore: 0.34
  }

Older documents remain valid without the field.

Rule 2 — Field Deprecation

Deprecated fields must follow phased removal:

1. Mark field deprecated
2. Stop writing new values
3. Continue reading old values
4. Remove only after migration completed

Rule 3 — Engine Compatibility

Execution engines must support multiple schema versions.

Example:

  if schemaVersion == 1:
      use legacy risk formula
  else:
      use updated formula

Rule 4 — Snapshot Immutability

Archived governance snapshots must never be migrated.

Historical schemaVersion remains unchanged.

---

### 22.5.3 Migration Execution Framework

Migrations are managed via vendor-controlled scripts.

Execution process:

1. Vendor defines migration script
2. Create migration document
3. Execute dry-run analysis
4. Confirm execution
5. Execute migration batches
6. Record completion status

Migration operations must always check version condition:

  if doc.schemaVersion < targetVersion:
      perform update

---

### 22.5.4 Migration Types

Type A — Add Field Migration

Example:

Add field:

guessClusterScore: 0

Procedure:

- Query documents where schemaVersion = 2
- Add new field
- Set schemaVersion = 3

---

Type B — Field Rename Migration

Example rename:

phaseDeviation → phaseDeviationPercent

Procedure:

1. Copy value to new field
2. Add renamed field
3. Mark old field deprecated
4. Remove deprecated field later

Immediate deletion is prohibited.

---

Type C — Recalculation Migration

If algorithm changes:

Historical values must not be overwritten.

Example:

  {
    riskScore_v1: 42.3,
    riskScore_v2: 37.8
  }

Old calculation preserved permanently.

---

### 22.5.5 Dry-Run Validation

Before migration execution, the system must estimate impact.

Dry-run output example:

  {
    affectedDocuments: 12453,
    estimatedWrites: 12453,
    estimatedCost: "₹X"
  }

Vendor approval required before execution.

---

### 22.5.6 Data Integrity Validation

Post-migration validation must check:

- Required fields present
- schemaVersion consistency
- No partial updates
- No null values in required fields

Integrity report stored under migration record.

---

### 22.5.7 Version Compatibility Matrix

Compatibility configuration stored at:

vendor/schemaCompatibilityMatrix

Example:

  {
    session: {
      supportedVersions: [1,2,3],
      latestVersion: 3
    },
    studentYearMetrics: {
      supportedVersions: [1,2],
      latestVersion: 2
    }
  }

Execution engines must verify compatibility before processing.

---

### 22.5.8 API Versioning Strategy

All API responses must include version metadata.

Example:

  {
    apiVersion: "v1"
  }

Major schema changes require new API namespace.

Example:

/api/v2/

Existing APIs must remain stable.

---

### 22.5.9 HOT–WARM–COLD Migration Boundaries

Migration rules by data tier:

| Tier | Migration Allowed |
|------|------|
|HOT|Yes|
|WARM|Yes, carefully controlled|
|COLD|No|

Archived academic years must never be migrated.

If recalculation required for archived data:

Create derived BigQuery tables.

Example:

sessions_2025_v2

---

### 22.5.10 Calibration Version Migration

Calibration models must also be versioned.

Example new model:

cal_v2026_02

Historical sessions retain original calibrationVersion.

Risk scores are never overwritten.

---

### 22.5.11 Batch Execution Safety

Migration execution rules:

- Maximum batch size: 500 documents
- Commit after each batch
- Resume capability required
- Failed document IDs logged

Full dataset rewrites are prohibited.

---

## 22.6 Dependencies

| Dependency | Purpose |
|------|------|
|Firestore|Primary document storage|
|Cloud Functions|Migration execution scripts|
|Vendor Dashboard|Migration monitoring interface|
|Calibration Engine|Model version compatibility|
|BigQuery Archive|Derived historical datasets|

---

## 22.7 Error Handling

Migration framework must include fault tolerance.

Failure handling rules:

| Failure Scenario | Handling |
|------|------|
|Batch write failure|Retry batch|
|Partial migration|Resume from last processed document|
|Version mismatch|Skip document and log warning|
|Integrity check failure|Rollback migration if possible|

Rollback allowed only if migration includes rollback logic.

---

## 22.8 Monitoring

Vendor dashboard must provide migration monitoring.

Required indicators:

- Pending migrations
- Completed migrations
- Failed migrations
- Rollback availability

Migration logs must include:

- execution timestamps
- affected document counts
- failure records

---

## 22.9 Future-Proofing Rules

Long-term evolution must follow these principles:

1. Never delete historical fields abruptly
2. Never silently change field meaning
3. Always increment schemaVersion when logic changes
4. Always support reading previous versions
5. Never migrate archived academic years
6. Never overwrite historical risk scores




# 23. System-Wide Versioning Strategy

## 23.1 Overview
The System-Wide Versioning Strategy governs how all execution artifacts are versioned, stored, and interpreted across the platform. It ensures deterministic behavior, safe evolution of system components, and full historical reproducibility.

Objectives:

- Prevent silent mutation of historical data
- Enable safe feature rollout and experimentation
- Guarantee cross-year interpretability
- Maintain deterministic analytics outputs
- Support independent evolution of system components

All execution artifacts must be:

- Immutable after use
- Snapshot-based during execution
- Explicitly version-labeled
- Backward-compatible
- Traceable across system layers

Core versioning dimensions:

| Dimension | Purpose |
|------|------|
|Template Version|Assessment structure control|
|Question Version|Scoring integrity preservation|
|Risk Model Version|Risk formula and clustering logic|
|Calibration Version|Behavioral tuning parameters|
|Feature Version Flags|UI and experimental feature control|

---

## 23.2 Key Responsibilities

- Maintain independent version control for core system components
- Guarantee session reproducibility via version snapshots
- Enforce immutability of historical execution artifacts
- Allow safe parallel evolution of system layers
- Provide backward-compatible execution logic
- Preserve version metadata in archival records

---

## 23.3 Inputs

Primary version-controlled entities:

| Component | Storage Location |
|------|------|
|Templates|institutes/{id}/tests/{templateId}|
|Questions|institutes/{id}/questions/{questionId}|
|Risk Models|vendor/riskModels/{riskModelVersion}|
|Calibration Models|vendor/calibration/models/{versionId}|
|Feature Flags|vendor/featureFlags and institutes/{id}/featureFlags|

Each entity must include a version identifier and schemaVersion.

---

## 23.4 Outputs

Session execution snapshot must include a full version matrix:

  {
    templateVersion,
    questionVersionMap,
    riskModelVersion,
    calibrationVersion,
    schemaVersion
  }

Purpose:

- Enable deterministic replay of session analytics
- Guarantee reproducibility of behavioral metrics
- Preserve historical interpretation accuracy

---

## 23.5 Workflow

### 23.5.1 Template Versioning

Purpose:

Prevent structural mutation of assessments after assignment.

Storage model:

institutes/{id}/tests/{templateId}

Example:

  {
    templateId: "temp_001",
    version: 1,
    parentTemplateId: null,
    status: "draft",
    schemaVersion: 2,
    createdAt,
    immutableAfterAssignment: true
  }

Status values:

| Status | Meaning |
|------|------|
|draft|Editable template|
|ready|Prepared for assignment|
|assigned|Locked structure|
|archived|Deprecated template|

Versioning rules:

- Structural edits require cloning
- Version increment required
- Parent template reference retained

Example versions:

temp_001_v1  
temp_001_v2

Session snapshot stores:

  {
    templateId,
    templateVersion,
    phaseConfigSnapshot,
    timingProfileSnapshot
  }

Templates must never be dynamically read during session evaluation.

---

### 23.5.2 Question Versioning

Purpose:

Preserve scoring accuracy and historical assessment integrity.

Storage model:

institutes/{id}/questions/{questionId}

Example:

  {
    uniqueKey: "Q_101",
    version: 3,
    parentQuestionId: "Q_101_v2",
    status: "active",
    schemaVersion: 2,
    immutableStructure: true
  }

Field mutability rules:

Immutable fields:

- Difficulty
- Marks
- NegativeMarks
- CorrectAnswer
- QuestionImage

Flexible fields:

- SolutionImage
- TutorialLink
- Tags

Structural modifications require version increment.

Session storage:

  {
    questionId,
    questionVersion
  }

Questions must not be dynamically reloaded during scoring.

---

### 23.5.3 Risk Model Versioning

Risk model version defines behavioral computation logic.

Storage:

vendor/riskModels/{riskModelVersion}

Example:

  {
    versionId: "risk_v3",
    schemaVersion: 1,
    formulaDefinition,
    clusterThresholds,
    createdAt,
    immutable: true
  }

Session snapshot must include:

  {
    riskModelVersion: "risk_v3"
  }

Historical sessions must always retain the original risk model reference.

---

### 23.5.4 Calibration Versioning

Calibration version governs parameter tuning of the risk engine.

Storage:

vendor/calibration/models/{versionId}

Global live pointer:

vendor/calibration/live

Session metadata includes:

  {
    calibrationVersion
  }

Historical sessions must remain bound to the calibration active at submission time.

---

### 23.5.5 Feature Version Flags

Feature flags enable controlled rollout of UI and experimental capabilities.

Storage:

Global configuration:

vendor/featureFlags

Institute override:

institutes/{id}/featureFlags

Example structure:

  {
    adaptivePhaseV2: {
      version: 2,
      enabled: true
    },
    newRiskVisualization: {
      version: 1,
      enabled: false
    },
    aiSummaryV2: {
      version: 2,
      enabled: true
    }
  }

Rules:

- Evaluated at runtime
- Not stored in session data
- Affect UI behavior only
- Must not alter stored analytics results

---

## 23.6 Cross-Version Interaction Rules

Each version layer evolves independently.

| Component | Independent Evolution |
|------|------|
|Template|Yes|
|Question|Yes|
|Risk Model|Yes|
|Calibration|Yes|
|Feature Flags|Yes|

System architecture must ensure that changing one layer does not require rewriting others.

---

## 23.7 Compatibility Guarantee

Execution engines must support multiple versions.

Example compatibility logic:

  if riskModelVersion == "risk_v2":
      use legacy formula
  else:
      use updated formula

System must never assume latest model availability.

---

## 23.8 Archive Version Recording

Archived academic years must record version metadata.

Governance snapshot fields:

  {
    riskModelVersionUsed,
    calibrationVersionUsed,
    templateVersionRangeUsed
  }

Purpose:

- Preserve interpretability for historical analytics
- Enable accurate reconstruction of evaluation logic

---

## 23.9 Version Naming Conventions

Deterministic naming format:

| Component | Naming Pattern |
|------|------|
|Template|temp_{id}_v{n}|
|Question|Q_{key}_v{n}|
|Risk Model|risk_v{n}|
|Calibration|cal_vYYYY_MM|
|Feature Flags|feature_v{n}|

Version identifiers must never be reused.

---

## 23.10 Immutability Policy

Documents become immutable after execution events.

Trigger conditions:

- Template assigned to run
- Session submitted
- Calibration version deployed
- Risk model activated

Immutable document example:

  {
    immutable: true
  }

Security rules must block further modifications.

---

## 23.11 Migration Interaction

Schema evolution must not interfere with versioning layers.

When schema changes occur:

- Increment schemaVersion
- Do not change templateVersion
- Do not change riskModelVersion
- Do not change calibrationVersion

Version dimensions must remain isolated from schema migrations.

---

## 23.12 Dependencies

| Dependency | Purpose |
|------|------|
|Schema Evolution Framework|Handles document migrations|
|Calibration Versioning System|Parameter version control|
|Risk Engine|Version-aware computation|
|Template Engine|Template lifecycle control|
|Question Bank System|Question version management|
|Governance Snapshot Model|Archive version recording|

---

## 23.13 Error Handling

Version conflicts must be detected before execution.

Handling rules:

| Scenario | Handling |
|------|------|
|Unsupported schemaVersion|Reject execution|
|Unknown riskModelVersion|Abort evaluation|
|Missing calibrationVersion|Fallback to live version|
|Invalid templateVersion|Block run creation|

All version mismatches must generate audit logs.



# 24. Licensing Object Architecture

## 24.1 Overview
The Licensing Object Architecture provides the backend-enforced commercial control layer of the system. It governs institute access levels, feature availability, billing limits, and vendor overrides.

Design goals:

- Enforce capability governance across L0–L3 layers
- Control feature availability through server-side checks
- Enforce active student limits for billing
- Support vendor overrides and temporary unlocks
- Ensure tamper-proof storage
- Maintain audit-safe change history
- Provide low-latency access through caching

The license object is referenced by privileged APIs and middleware during authorization.

Primary storage:

institutes/{instituteId}/license/current

Only one active license document exists per institute.

---

## 24.2 Key Responsibilities

- Define institute layer access (L0–L3)
- Control feature flags available to the institute
- Enforce student count limits
- Maintain billing cycle metadata
- Provide upgrade eligibility indicators
- Allow vendor-controlled overrides
- Track usage metrics for billing and monitoring
- Maintain immutable license history logs

---

## 24.3 Inputs

Primary source document:

institutes/{instituteId}/license/current

Example license object:

  {
    schemaVersion: 1,

    instituteId: "inst_001",

    currentLayer: "L2",

    planName: "Controlled",
    billingCycle: "monthly",
    startDate: timestamp,
    expiryDate: timestamp,
    renewalDate: timestamp,

    activeStudentLimit: 250,
    activeStudentCount: 187,

    featureFlags: {
      adaptivePhase: true,
      diagnosticAlerts: true,
      controlledMode: true,
      hardMode: true,
      riskEngine: true,
      aiSummaryStudent: true,
      aiSummaryBatch: true,
      governanceAccess: false,
      vendorOverrideEnabled: false
    },

    eligibilityFlags: {
      l1Eligible: true,
      l2Eligible: false,
      l3Eligible: false
    },

    usageMetrics: {
      testsConductedThisMonth: 12,
      peakActiveStudentsThisCycle: 198
    },

    vendorOverride: {
      overrideActive: false,
      overrideReason: null,
      overrideExpiresAt: null
    },

    immutable: false,
    lastUpdatedAt: timestamp
  }

---

## 24.4 Outputs

Middleware enforcement decisions derived from license object:

| Output | Description |
|------|------|
|Access Authorization|Allows or blocks feature usage|
|Layer Access|Determines system capabilities|
|Student Creation Permission|Enforces active student limit|
|Feature Enablement|Activates feature flags|
|Override Handling|Temporarily modifies behavior|

License changes generate entries in license history:

institutes/{id}/licenseHistory/{entryId}

Example:

  {
    oldLayer: "L1",
    newLayer: "L2",
    changedBy: "vendorUser",
    reason: "Upgrade",
    timestamp
  }

---

## 24.5 Workflow

### 24.5.1 License Object Storage

License document location:

institutes/{instituteId}/license/current

Characteristics:

- Single authoritative document
- Always stored in HOT tier
- Frequently read by middleware
- Updated only by vendor operations

Institutes can read the license object but cannot modify it.

---

### 24.5.2 Layer-to-Feature Mapping

Layer determines default feature availability.

| Layer | Features Enabled |
|------|------|
|L0|Basic operational mode only|
|L1|Diagnostic alerts, risk engine, AI student summaries|
|L2|Adaptive phase, controlled mode, hard mode, batch AI summaries|
|L3|Full governance access|

Example L0 feature configuration:

  adaptivePhase = false  
  controlledMode = false  
  hardMode = false  
  diagnosticAlerts = false  
  aiSummaryStudent = false  
  aiSummaryBatch = false  
  governanceAccess = false

Layer upgrades automatically update featureFlags unless overridden by vendor.

---

### 24.5.3 Feature Flag Enforcement

Feature flags must always be validated server-side.

Example enforcement:

  if (!license.featureFlags.controlledMode)
      throw 403

Execution rules:

- Feature flags evaluated through middleware
- Client-side hiding is not trusted
- Feature configuration cached in memory for 60 seconds

---

### 24.5.4 Eligibility Flags

Eligibility indicates upgrade readiness based on maturity metrics.

Example structure:

  {
    l1Eligible: true,
    l2Eligible: false,
    l3Eligible: false
  }

Eligibility is updated by scheduled evaluators based on:

- Run counts
- Stability index thresholds
- Diagnostic activity volume

Eligibility does not automatically trigger upgrades.

---

### 24.5.5 Student Limit Enforcement

Active student definition:

Active student =

  student.status == active  
  AND  
  student.archived == false

Creation enforcement rule:

  if activeStudentCount >= activeStudentLimit
      block student creation

Reactivation enforcement rule:

Before activating archived student:

  verify activeStudentCount < activeStudentLimit

Peak tracking:

  {
    peakActiveStudentsThisCycle: number
  }

Peak usage supports overage billing analysis.

---

### 24.5.6 Billing Integration

Billing engine reads license fields directly.

Relevant fields:

- activeStudentLimit
- peakActiveStudentsThisCycle
- billingCycle
- expiryDate

Billing computation must occur server-side.

Frontend cannot compute billing amounts.

---

### 24.5.7 Vendor Override System

Vendor may temporarily override license restrictions.

Example override:

  {
    vendorOverride: {
      overrideActive: true,
      overrideReason: "Demo Mode",
      overrideExpiresAt: timestamp
    }
  }

Override effects may include:

- Temporary feature unlock
- Temporary student limit increase
- Layer override

Middleware enforcement:

  if overrideActive AND now < overrideExpiresAt
      allow access

Overrides automatically expire.

---

### 24.5.8 License Expiry Handling

If:

  now > expiryDate

System behavior:

- Downgrade to L0 safe mode
- Block new assignments
- Maintain read-only system access
- Display billing warning

Data must never be deleted due to license expiry.

---

### 24.5.9 License State Machine

License state field:

  {
    licenseState: "active"
  }

Supported states:

| State | Behavior |
|------|------|
|active|Full functionality|
|grace|Temporary limited enforcement|
|expired|Downgrade to L0 features|
|suspended|System access blocked|
|override|Temporary vendor unlock|

---

### 24.5.10 Middleware Enforcement Flow

Every privileged API must perform license validation.

Validation steps:

1. Load license document
2. Validate license state
3. Check expiry condition
4. Validate required layer
5. Validate feature flag
6. Validate student limits if applicable
7. Proceed with operation

Frontend visibility controls must never replace server validation.

---

## 24.6 Dependencies

| Dependency | Purpose |
|------|------|
|RBAC System|Determine vendor vs institute privileges|
|Middleware Authorization Layer|Runtime license enforcement|
|Billing Engine|Compute subscription charges|
|Feature Flag Manager|Evaluate runtime feature availability|
|Vendor Dashboard|License administration interface|

---

## 24.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|License document missing|Block privileged operations|
|Expired license detected|Activate L0 safe mode|
|Feature flag missing|Default to disabled|
|Student limit exceeded|Reject student creation request|

System must log all license validation failures.

---

## 24.8 Performance Strategy

License reads must be optimized.

Performance rules:

- Cache license document in memory for 60 seconds
- Avoid repeated Firestore reads within request scope
- Refresh cache on license update events

License object remains permanently in HOT tier and is never archived.


## 25. Payment & Subscription Automation Architecture

## 25.1 Overview
The Payment & Subscription Automation Architecture manages automated billing, subscription lifecycle handling, and synchronization between Stripe and the system’s licensing model.

Design principles:

- Stripe is the authoritative source of payment state
- Firestore license object controls platform capabilities
- Stripe webhook events drive license updates
- No manual layer toggling through UI
- Idempotent and retry-safe event handling
- Full auditability of billing state changes
- Backend-only execution

Primary components:

- Stripe subscription system
- Secure webhook processor
- License synchronization engine
- Billing history storage
- Vendor revenue analytics

---

## 25.2 Key Responsibilities

- Automate plan upgrades and subscription creation
- Synchronize Stripe subscription state with license object
- Enforce billing cycle and expiry dates
- Manage grace periods after payment failure
- Handle subscription cancellations and downgrades
- Track billing records and invoice history
- Prevent duplicate webhook processing
- Maintain audit-safe billing logs

---

## 25.3 Inputs

Primary payment inputs originate from Stripe.

Webhook events received from Stripe:

| Event | Description |
|------|------|
|checkout.session.completed|Successful subscription creation|
|customer.subscription.created|Subscription activated|
|invoice.payment_succeeded|Subscription renewal payment|
|invoice.payment_failed|Payment failure detected|
|customer.subscription.updated|Subscription quantity or plan change|
|customer.subscription.deleted|Subscription cancelled|

Stripe identifiers stored in license object:

| Field | Purpose |
|------|------|
|stripeCustomerId|Institute Stripe account|
|stripeSubscriptionId|Active subscription reference|

---

## 25.4 Outputs

Primary license updates occur at:

institutes/{instituteId}/license/current

Billing records stored at:

institutes/{id}/billingRecords/{invoiceId}

Example billing record:

  {
    stripeInvoiceId,
    amountPaid,
    currency,
    billingPeriodStart,
    billingPeriodEnd,
    status,
    createdAt
  }

Webhook event log:

vendor/stripeEvents/{eventId}

Used to ensure idempotent processing.

---

## 25.5 Workflow

### 25.5.1 Stripe Product Model

Stripe products map directly to system layers.

| Layer | Stripe Product | Billing Model |
|------|------|------|
|L0|operational_plan|Base + per student|
|L1|diagnostic_plan|Base + per student|
|L2|controlled_plan|Premium subscription|
|L3|governance_plan|Annual fixed plan|

Each product may contain:

- Base subscription price
- Optional per-seat pricing component

---

### 25.5.2 Checkout Flow

Upgrade process begins when an institute admin requests a plan upgrade.

Backend workflow:

1. Validate upgrade eligibility
2. Create Stripe Checkout Session
3. Provide:

  - stripeCustomerId
  - selected plan
  - billing cycle
  - seat quantity

4. Return Stripe Checkout URL
5. Redirect user to Stripe payment page

Stripe handles:

- Payment method collection
- Payment authorization
- Subscription creation

---

### 25.5.3 Webhook Processing

Webhook endpoint:

/api/stripe/webhook

Processing sequence:

1. Validate Stripe signature
2. Extract:

  - customerId
  - subscriptionId
  - productId
  - billingCycle

3. Map productId to platform layer
4. Update Firestore license object
5. Record licenseHistory entry
6. Log audit event

Webhook processing must be idempotent.

---

### 25.5.4 License Auto-Update Logic

Upon successful subscription creation:

License fields updated:

  {
    currentLayer: "L2",
    planName: "Controlled",
    billingCycle: "monthly",
    startDate: now,
    expiryDate: subscription.current_period_end,
    activeStudentLimit: planLimit,
    licenseState: "active"
  }

Additional actions:

- Reset grace flags
- Remove suspension status
- Log upgrade event

---

### 25.5.5 Subscription Renewal Handling

Stripe event:

invoice.payment_succeeded

Processing steps:

1. Update license expiryDate
2. Clear grace state
3. Record billing renewal
4. Store invoice record

No user interaction required.

---

### 25.5.6 Payment Failure Handling

Stripe event:

invoice.payment_failed

System actions:

1. Set:

  licenseState = "grace"

2. Record failure timestamp
3. Send notification email to institute admin
4. Allow limited read-only access
5. Start grace period timer

Grace logic:

  if now > failureDate + graceDays:
      licenseState = "expired"
      downgrade to L0 safe mode

Grace duration typically 7 days.

---

### 25.5.7 Subscription Cancellation

Stripe event:

customer.subscription.deleted

Processing steps:

1. Set license expiryDate = subscription.current_period_end
2. Maintain current access until expiry
3. After expiry:

  - downgrade license to L0
  - log cancellation event

System must never delete historical data.

---

### 25.5.8 Seat-Based Billing Model

For per-student billing plans:

Stripe subscription quantity must match:

activeStudentLimit

Student limit update workflow:

1. Admin requests increase
2. Backend updates Stripe subscription quantity
3. Stripe recalculates invoice
4. Webhook confirms subscription update
5. License object updated after webhook confirmation

Direct local limit changes are prohibited.

---

### 25.5.9 Webhook Security

Security requirements:

- Validate Stripe signature header
- Use webhook secret stored in environment variables
- Reject requests with invalid signatures
- Log suspicious webhook attempts

Webhook requests must never be trusted without signature verification.

---

### 25.5.10 Billing Records

Invoice records stored in Firestore:

institutes/{id}/billingRecords/{invoiceId}

Used for:

- Billing history UI
- Invoice download
- Accounting reconciliation
- Vendor revenue analytics

---

### 25.5.11 Failure Safety Rules

Webhook processing must be:

- Idempotent
- Retry-safe
- Crash-resistant

Duplicate prevention:

Processed events stored at:

vendor/stripeEvents/{eventId}

Before processing:

  if eventId exists:
      ignore event

Failed events must be logged and retried.

---

### 25.5.12 Layer Downgrade Safety

When license downgrades occur:

System must:

- Disable higher-layer features
- Preserve all historical data
- Maintain templates and analytics
- Retain governance snapshots

Downgrades affect feature flags only.

---

### 25.5.13 Vendor Dashboard Integration

Vendor analytics dashboard displays:

- Monthly recurring revenue (MRR)
- Active subscriptions
- Upcoming expirations
- Grace period accounts
- Over-limit accounts
- Revenue by layer

Dashboard displays analytics only; manual edits are not permitted.

---

## 25.6 Dependencies

| Dependency | Purpose |
|------|------|
|Stripe API|Subscription management|
|Stripe Webhooks|Event-driven license updates|
|License Object Architecture|Capability enforcement|
|Billing Record Storage|Invoice history management|
|Notification System|Payment failure alerts|
|Vendor Analytics Dashboard|Revenue monitoring|

---

## 25.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Invalid webhook signature|Reject request|
|Duplicate webhook event|Ignore event|
|Webhook processing failure|Retry event|
|Stripe API failure|Log error and retry|
|Missing subscription reference|Flag manual review|

System must maintain audit logs for all payment events.

---

## 25.8 Environment Configuration

Stripe configuration stored in environment variables.

Required variables:

STRIPE_SECRET_KEY  
STRIPE_WEBHOOK_SECRET  

Deployment environments:

| Environment | Stripe Mode |
|------|------|
|Development|Stripe Test Mode|
|Staging|Stripe Test Mode|
|Production|Stripe Live Mode|

Stripe CLI recommended for local webhook testing.


# 26. Usage Metering Engine

## 26.1 Overview
The Usage Metering Engine provides the quantitative enforcement layer for billing limits and subscription usage. It continuously measures active student consumption, tracks peak usage within a billing cycle, detects over-limit conditions, and generates alerts for administrators and vendors.

Design requirements:

- Accurate active student measurement
- Incremental updates without full collection scans
- Billing-cycle aware peak tracking
- Idempotent and transaction-safe updates
- Backend-only enforcement
- Compatible with Stripe seat-based billing
- Multi-tenant safe execution

The engine operates through Cloud Functions triggered by student state changes and scheduled reconciliation jobs.

---

## 26.2 Key Responsibilities

- Maintain active student counts per institute
- Track peak usage within billing cycles
- Detect and record over-limit conditions
- Generate usage alerts and vendor notifications
- Provide billing-ready usage metrics
- Ensure data consistency through reconciliation jobs
- Support seat-based subscription pricing models

---

## 26.3 Inputs

Primary student data source:

institutes/{id}/students/{studentId}

Relevant fields:

  {
    status: "active" | "archived" | "deleted",
    archived: boolean,
    createdAt,
    archivedAt,
    academicYear
  }

License source:

institutes/{id}/license/current

Fields used:

  {
    activeStudentLimit,
    billingCycle,
    startDate,
    renewalDate
  }

Usage summary document:

institutes/{id}/usage/{billingCycleId}

---

## 26.4 Outputs

Usage summary stored at:

institutes/{id}/usage/{billingCycleId}

Example structure:

  {
    billingCycleStart,
    billingCycleEnd,
    activeStudentCount: 187,
    peakActiveStudents: 198,
    overLimit: false,
    overLimitSince: null,
    lastRecalculatedAt,
    schemaVersion: 1
  }

This document acts as the authoritative source for billing engine calculations.

Additional outputs:

| Output | Purpose |
|------|------|
|Usage alerts|Admin notifications|
|Vendor usage aggregates|Platform analytics|
|Billing cycle reports|Invoice calculation|

---

## 26.5 Workflow

### 26.5.1 Usage Summary Document

Usage documents are created per billing cycle.

Location:

institutes/{id}/usage/{billingCycleId}

Characteristics:

- Lightweight aggregation document
- Updated incrementally via triggers
- Used by billing and vendor analytics
- Never computed via full student scans during normal operations

---

### 26.5.2 Active Student Definition

Active student is defined as:

  student.status == "active"  
  AND  
  student.archived == false

Criteria excludes:

- login activity
- test participation
- account creation date

Only explicit activation state determines active status.

---

### 26.5.3 Incremental Update Strategy

Active student counts are updated using event-driven triggers.

Cloud Function trigger:

students/{studentId} onWrite

Logic cases:

Case 1 — Student Activated

  previous.status != active  
  AND  
  new.status == active  

Action:

  increment activeStudentCount by 1

Case 2 — Student Deactivated

  previous.status == active  
  AND  
  new.status != active  

Action:

  decrement activeStudentCount by 1

Case 3 — Student Hard Delete

Action:

  treat as deactivation  
  decrement activeStudentCount

No full collection scan is required.

---

### 26.5.4 Peak Active Student Tracking

Peak usage is maintained throughout the billing cycle.

After updating activeStudentCount:

  if activeStudentCount > peakActiveStudents
      peakActiveStudents = activeStudentCount

Important rule:

Peak usage must never decrease during a billing cycle.

This metric determines billing charges.

---

### 26.5.5 Billing Cycle Initialization

Billing cycle boundaries originate from license configuration.

License fields:

  {
    billingCycle: "monthly",
    startDate,
    renewalDate
  }

When Stripe renewal webhook occurs:

System performs:

1. Archive previous usage document
2. Create new usage document
3. Set:

  activeStudentCount = current real count  
  peakActiveStudents = activeStudentCount

Cycle counters are reset only during renewal.

---

### 26.5.6 Over-Limit Detection

After each update:

  if activeStudentCount > activeStudentLimit
      overLimit = true
      overLimitSince = now
  else
      overLimit = false
      overLimitSince = null

Fields stored in usage summary document.

Over-limit detection triggers alerts and potential billing adjustments.

---

### 26.5.7 Over-Limit Enforcement Strategies

Three enforcement models are supported.

| Mode | Behavior |
|------|------|
|Soft Warning|Allow usage but notify admin and vendor|
|Hard Block|Reject activation once limit reached|
|Grace Window|Allow temporary overage for defined period|

Recommended implementation:

Soft Warning + Billing Adjustment.

---

### 26.5.8 Alert Triggers

Alerts generated under three conditions.

Approaching Limit

Condition:

  activeStudentCount >= 90% of activeStudentLimit

Actions:

- Send admin notification
- Display dashboard warning

Over Limit

Condition:

  activeStudentCount > activeStudentLimit

Actions:

- Immediate dashboard alert
- Vendor notification
- Stripe seat quantity update (if seat billing active)

Usage Spike

Condition:

  usage increase exceeds threshold within 24 hours

Action:

- Vendor monitoring alert

---

### 26.5.9 Billing Cycle Report

At cycle end, a billing summary is generated.

Example:

  {
    peakActiveStudents,
    baseFee,
    perStudentRate,
    totalDue,
    overageCharge
  }

Stored in:

institutes/{id}/billingRecords/{cycleId}

Used for:

- invoice generation
- financial reporting
- billing audit logs

---

### 26.5.10 Transaction Safety

Usage updates must occur within Firestore transactions.

Pseudo logic:

  runTransaction:
      read usageDoc
      compute delta
      update activeStudentCount
      update peakActiveStudents if necessary
      write updated usageDoc

Rules:

- Never trust client updates
- Prevent race conditions
- Ensure atomic updates

---

### 26.5.11 Scheduled Reconciliation

Daily scheduled job verifies usage accuracy.

Process:

1. Count actual active students
2. Compare with usageDoc.activeStudentCount
3. If mismatch detected:

  correct stored value  
  log audit event

Reconciliation prevents drift caused by missed triggers.

---

### 26.5.12 Vendor Aggregate Usage

Vendor platform usage metrics stored at:

vendor/aggregates/usageSummary

Example structure:

  {
    totalActiveStudentsAcrossPlatform,
    totalOverLimitInstitutes,
    monthlyGrowthRate,
    averageUtilization
  }

Generated via scheduled aggregation jobs.

Used for:

- vendor analytics
- infrastructure capacity planning
- revenue forecasting

---

## 26.6 Dependencies

| Dependency | Purpose |
|------|------|
|License Object Architecture|Student limit reference|
|Stripe Subscription System|Seat-based billing synchronization|
|Cloud Functions|Trigger execution|
|Notification System|Alert delivery|
|Vendor Analytics Dashboard|Usage monitoring|

---

## 26.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Usage document missing|Create usage document automatically|
|Transaction conflict|Retry transaction|
|Trigger missed event|Correct during reconciliation|
|Invalid student state|Ignore update and log warning|

All reconciliation corrections must generate audit logs.

---

## 26.8 Performance Characteristics

System performance targets:

- O(1) update complexity per student event
- No repeated student collection scans
- Transaction-safe atomic updates
- Scalable across thousands of institutes
- Minimal Firestore read/write overhead

Usage documents remain HOT tier data and are never archived to BigQuery.



# 27. Vendor Dashboard Architecture

## 27.1 Overview
The Vendor Dashboard Architecture represents the platform governance layer. It provides centralized control over calibration, licensing, commercial metrics, and platform health across all institutes.

Design principles:

- Vendor-only access with strict RBAC enforcement
- Operates exclusively on aggregated metrics
- Never exposes raw student or session-level data
- Supports platform-wide calibration and licensing control
- Provides cross-institute intelligence insights
- Maintains full audit traceability
- Prevents unsafe data mutation

Primary domain:

vendor.yourdomain.com

Access rules:

- Vendor role only
- Separate authentication boundary
- Strict tenant isolation
- No institute user access permitted

---

## 27.2 Key Responsibilities

- Provide platform-wide governance visibility
- Manage institute licensing and subscription states
- Control calibration models and deployments
- Monitor cross-institute behavioral intelligence
- Track revenue and billing performance
- Observe infrastructure health indicators
- Maintain immutable audit logs

---

## 27.3 Inputs

Vendor dashboard reads only aggregated or summary data sources.

Primary collections:

vendor/aggregates/*  
vendor/institutes/{instituteId}  
institutes/{id}/license/current  
institutes/{id}/usage/*  
institutes/{id}/governanceSnapshots/*  
institutes/{id}/billingRecords/*  
vendor/systemHealth/*  
vendor/auditLogs/*

Restricted data:

- Raw student session data
- Question-level analytics
- Answer logs

Vendor dashboard must never query session-level collections.

---

## 27.4 Outputs

Vendor actions may update controlled platform objects.

Primary write targets:

| Target | Purpose |
|------|------|
|institutes/{id}/license/current|License modifications|
|vendor/calibration/models|Calibration model updates|
|vendor/calibration/live|Global calibration pointer|
|vendor/auditLogs|Audit trail for governance actions|

All vendor actions must create audit log entries.

---

## 27.5 Workflow

### 27.5.1 Platform Overview

Purpose:

Provide executive snapshot of SaaS ecosystem performance.

Data sources:

vendor aggregates  
governance snapshots  
usage aggregates  
revenue summaries

Displayed metrics:

Active Institutes

| Metric | Description |
|------|------|
|Total Institutes|Total registered|
|Active Institutes|Active within last month|
|Trial Institutes|Trial license status|
|Expired Institutes|Inactive licenses|

Platform Student Count

| Metric | Description |
|------|------|
|Total Active Students|Across platform|
|Monthly Growth Rate|Platform growth|
|Monthly Delta %|Change vs previous month|

Layer Distribution

Pie chart representation.

| Layer | Institute Count |
|------|------|
|L0|Operational|
|L1|Diagnostic|
|L2|Controlled|
|L3|Governance|

Stability Overview

Platform averages:

- Average Stability Index
- Average Discipline Index
- High-risk cluster percentages

---

### 27.5.2 Institutes Management

Source collection:

vendor/institutes/{instituteId}

Table columns:

| Field | Description |
|------|------|
|Institute Name|Display name|
|Current Layer|L0–L3|
|Active Students|Current usage|
|Limit Usage %|Student limit utilization|
|Billing Status|Active / Grace / Expired|
|Stability Index|Governance indicator|
|Risk Index|Aggregate risk score|
|Last Activity|Recent activity timestamp|
|Expiry Date|License expiration|
|Override Status|Vendor override indicator|

Vendor actions:

- View institute summary
- Access license controls
- Trigger temporary override
- Suspend institute access
- Unlock temporary features
- Trigger metric recalculation

Vendor restrictions:

- Cannot edit student academic records
- Cannot modify test outcomes

---

### 27.5.3 Licensing Control

Writes to:

institutes/{id}/license/current

Vendor operations:

| Action | Description |
|------|------|
|Change Layer|Upgrade or downgrade institute|
|Adjust Student Limit|Modify seat capacity|
|Grant Override|Temporary feature unlock|
|Extend Expiry|Extend subscription duration|
|Suspend License|Disable institute access|
|Restore License|Re-enable after suspension|
|Convert Trial|Trial-to-paid conversion|

Every modification requires confirmation and generates an audit log.

---

### 27.5.4 Calibration Engine

Central platform intelligence system.

#### Parameter Editor

Editable parameters include:

- Risk weights
- Discipline weights
- Phase adherence weights
- Guess penalty weight
- Overstay penalty weight
- Controlled mode multiplier

Storage location:

vendor/calibration/models/{versionId}

Example configuration:

  {
    version: 5,
    riskWeights: {
      rush: 0.8,
      hardBias: 0.6,
      skipBurst: 0.7
    },
    disciplineWeights: {
      phaseAdherence: 0.5,
      timingCompliance: 0.5
    },
    active: false
  }

---

#### Simulation Engine

Simulation scope selection:

- All institutes
- Selected institutes
- Selected batch types

Simulation uses:

- Precomputed analytics
- Aggregated metrics only

Output comparison table:

| Metric | Old | New | Delta |
|------|------|------|------|
|Risk Distribution|Previous|Simulated|Difference|
|Discipline Index|Previous|Simulated|Difference|
|Stability Index|Previous|Simulated|Difference|

Simulation must never mutate stored data.

---

#### Version Activation

Vendor may:

- Activate calibration version
- Schedule activation
- Roll back previous version

Activation updates:

vendor/calibration/live

Institutes read the global calibration pointer during analytics computation.

---

### 27.5.5 Cross-Institute Intelligence

Provides anonymized benchmarking across the platform.

Displayed insights:

Difficulty Distribution

| Difficulty | Platform Percentage |
|------|------|
|Easy|%|
|Medium|%|
|Hard|%|

Risk Pattern Frequency

- Impulsive %
- Overextended %
- Volatile %

Controlled Mode Impact

Average performance improvement.

Behavioral Trend Index

Monthly trend analysis using:

vendor/aggregates/intelligenceSnapshot

Institute names are never shown side-by-side.

---

### 27.5.6 Revenue Metrics

Revenue metrics derived from Stripe subscriptions and billing records.

Displayed metrics:

| Metric | Description |
|------|------|
|MRR|Monthly recurring revenue|
|ARR|Annual recurring revenue|
|Revenue by Layer|Distribution by license tier|
|Revenue Growth %|Month-over-month change|
|Over-limit Revenue|Seat overage billing|
|Churn Rate|Subscription cancellations|
|Grace Accounts|Payment failure accounts|

Data source:

vendor/aggregates/revenueSummary

---

### 27.5.7 System Health

Infrastructure monitoring dashboard.

Displayed metrics:

| Metric | Description |
|------|------|
|Firestore Read Volume|Read operations|
|Firestore Write Volume|Write operations|
|Cloud Function Invocations|Total executions|
|Error Rate %|Failure percentage|
|API Latency|Average request time|
|Storage Usage|Database size|
|BigQuery Cost|Analytics expenses|
|Email Queue Backlog|Pending notifications|
|Active Sessions|Current test sessions|
|Stripe Webhook Failures|Payment event errors|

Data source:

vendor/systemHealth

Raw logs are not displayed.

---

### 27.5.8 Audit Logs

Immutable audit records.

Collection:

vendor/auditLogs/{entryId}

Schema:

  {
    actor,
    actionType,
    targetInstitute,
    beforeState,
    afterState,
    timestamp,
    ipAddress
  }

Tracked events:

- License modifications
- Vendor overrides
- Calibration deployments
- Institute suspensions
- Manual recalculations
- Schema migrations

Audit logs are append-only and cannot be edited.

---

## 27.6 Dependencies

| Dependency | Purpose |
|------|------|
|License Object Architecture|Institute capability management|
|Calibration Simulation Engine|Model experimentation|
|Governance Snapshot Model|Institution stability metrics|
|Usage Metering Engine|Student utilization tracking|
|Stripe Billing Integration|Revenue monitoring|
|System Monitoring Services|Infrastructure health metrics|

---

## 27.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Aggregate document missing|Fallback to cached metrics|
|License write failure|Retry with transaction|
|Calibration activation failure|Rollback to previous version|
|Monitoring data unavailable|Display degraded state warning|

All vendor operations must generate audit entries.

---

## 27.8 Performance Strategy

Vendor dashboard must maintain predictable performance.

Key rules:

- Use pagination for institute listing
- Load only summary documents
- Never perform runtime aggregation
- Avoid nested subcollection scans
- Use scheduled jobs to compute platform aggregates

Tier usage:

| Tier | Data Used |
|------|------|
|HOT|License objects, usage summaries, aggregates|
|WARM|Past governance snapshots|
|COLD|BigQuery archive for deep historical analysis|




# 28. Global Feature Flag Framework

## 28.1 Overview
The Global Feature Flag Framework enables controlled evolution of platform capabilities through runtime feature switches. It supports gradual feature rollouts, experimental engine validation, canary deployments, and safe rollback mechanisms without requiring code redeployment.

Design principles:

- Vendor-controlled configuration
- Server-side evaluation only
- Multi-tenant aware rollout logic
- Layer-aware gating
- Environment-specific targeting
- Deterministic rollout behavior
- Immediate rollback capability
- No historical data mutation

Feature flags influence runtime behavior for new operations but must never alter historical analytics or stored session data.

---

## 28.2 Key Responsibilities

- Enable safe feature rollout across institutes
- Control experimental engine deployments
- Support beta feature programs
- Allow percentage-based rollout strategies
- Enable canary institute targeting
- Provide environment-specific gating
- Maintain audit-safe configuration history
- Integrate with calibration version control

---

## 28.3 Inputs

Primary configuration document:

vendor/featureFlags/global

Example structure:

  {
    schemaVersion: 1,

    flags: {

      betaNewAnalyticsUI: {
        enabled: false,
        rolloutPercentage: 0,
        targetInstitutes: [],
        environments: ["staging"]
      },

      experimentalRiskModelV2: {
        enabled: false,
        rolloutPercentage: 10,
        canaryInstitutes: ["inst_005"],
        version: "risk_v2"
      },

      adaptivePhaseV3: {
        enabled: true,
        rolloutPercentage: 100
      }

    },

    lastUpdatedAt: timestamp
  }

Institute-specific overrides:

institutes/{id}/featureOverrides

Example:

  {
    betaNewAnalyticsUI: true,
    experimentalRiskModelV2: false
  }

---

## 28.4 Outputs

Feature flag evaluation returns runtime capability decisions.

| Output | Description |
|------|------|
|Feature Enabled|True/False decision for institute|
|Target Version|Engine version selected|
|Environment Match|Feature allowed in current environment|

Flags influence:

- Runtime engine selection
- UI component availability
- Experimental analytics behavior
- Calibration rollout targeting

Flags must not alter historical records.

---

## 28.5 Workflow

### 28.5.1 Global Flag Storage

All global flags stored at:

vendor/featureFlags/global

Characteristics:

- Vendor-managed only
- Single configuration document
- Cached for performance
- Versioned with schemaVersion

Flags must be evaluated server-side only.

---

### 28.5.2 Institute-Level Overrides

Overrides stored per institute:

institutes/{id}/featureOverrides

Override behavior:

- Evaluated before global configuration
- Allows vendor to force-enable or disable specific features
- Used for beta participants or troubleshooting

Override precedence always supersedes global configuration.

---

### 28.5.3 Flag Types

#### Beta Release Flags

Purpose:

- UI changes
- minor analytics enhancements
- optional preview features

Behavior:

- Disabled by default
- Enabled via vendor dashboard
- Can target specific institutes

---

#### Experimental Engine Flags

Used for:

- new risk models
- calibration algorithm updates
- pattern engine improvements

Characteristics:

- version tagged
- limited rollout
- metrics comparison enabled

---

#### Controlled Rollout Flags

Example configuration:

  {
    enabled: true,
    rolloutPercentage: 20
  }

Rollout algorithm:

  hash(instituteId) % 100 < rolloutPercentage

This ensures deterministic rollout across environments.

---

#### Canary Release Flags

Used for early testing of high-risk features.

Example configuration:

  {
    enabled: true,
    canaryInstitutes: ["inst_001", "inst_003"]
  }

Only listed institutes receive the new functionality.

---

### 28.5.4 Flag Evaluation Order

Feature flag evaluation must follow strict precedence.

Evaluation sequence:

1. Check institute override
2. Verify global flag enabled
3. Verify environment compatibility
4. Evaluate rollout percentage
5. Evaluate canary institute list
6. Return final decision

Frontend-only evaluation is prohibited.

---

### 28.5.5 Canary Release Mechanism

Deployment process for high-risk features:

1. Deploy code with feature disabled
2. Enable flag for canary institutes
3. Monitor platform metrics:

   - stability index changes
   - risk cluster shifts
   - error rates

4. Compare results with control group
5. Increase rollout gradually
6. Activate globally if stable

Rollback achieved by disabling flag.

---

### 28.5.6 Controlled Rollout Strategy

Typical rollout schedule:

| Phase | Rollout Percentage |
|------|------|
|Day 1|5%|
|Day 3|15%|
|Day 7|50%|
|Day 14|100%|

Rollout adjustments require only flag configuration updates.

No redeployment required.

---

### 28.5.7 Feature Version Targeting

Feature flags determine which engine version executes.

Example stored analytics reference:

  {
    riskModelVersion: "risk_v2",
    calibrationVersion: 5
  }

Evaluation logic selects the correct version for new computations.

Historical sessions retain original version references.

---

### 28.5.8 Environment-Aware Flags

Flags may specify allowed environments.

Example:

  {
    environments: ["development", "staging", "production"]
  }

Environment detection uses server environment variables.

Use cases:

- development-only testing
- staging validation
- production gating

---

### 28.5.9 Vendor Feature Control Panel

Vendor dashboard provides feature management interface.

Displayed attributes:

| Field | Description |
|------|------|
|Flag Name|Identifier|
|Flag Type|Beta / Experimental / Canary|
|Enabled Status|Active or inactive|
|Rollout Percentage|Deployment coverage|
|Target Institutes|Specific institute targeting|
|Last Modified|Timestamp|
|Risk Level|Operational risk classification|

Vendor actions include:

- enabling/disabling flags
- modifying rollout percentages
- adding canary institutes
- restricting environments
- scheduling activation
- scheduling deactivation

All changes generate audit logs.

---

### 28.5.10 Metrics Comparison Support

Experimental features require comparison dashboards.

Metrics compared:

| Metric | Old Version | New Version | Delta |
|------|------|------|------|
|Stability Index|Baseline|Experimental|Change|
|Discipline Index|Baseline|Experimental|Change|
|Risk Distribution|Baseline|Experimental|Change|

Data sources:

- governanceSnapshots
- vendor platform aggregates

Raw sessions are never used.

---

### 28.5.11 Rollback Mechanism

Rollback must be immediate.

Rollback procedure:

1. Set enabled = false
2. Reset rolloutPercentage
3. Clear canary lists if necessary

All new requests revert to previous behavior instantly.

Existing stored sessions remain unchanged.

---

### 28.5.12 Safety Rules

Feature flag framework must enforce:

- no historical metric recalculation
- no automatic reprocessing of old sessions
- only future computations affected
- activation timestamps recorded
- actor identity logged

---

### 28.5.13 Audit Logging

All flag modifications logged in:

vendor/auditLogs

Example entry:

  {
    actionType: "feature_flag_update",
    flagName: "experimentalRiskModelV2",
    previousState,
    newState,
    actor,
    timestamp
  }

Audit records are immutable.

---

## 28.6 Dependencies

| Dependency | Purpose |
|------|------|
|Vendor Dashboard|Flag management interface|
|Calibration Engine|Experimental parameter rollout|
|Risk Engine|Version-targeted algorithm execution|
|Middleware Layer|Runtime evaluation|
|Governance Snapshots|Experimental comparison metrics|

---

## 28.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Flag document missing|Default to disabled state|
|Invalid rollout configuration|Ignore rollout and log warning|
|Environment mismatch|Feature disabled|
|Override conflict|Institute override takes precedence|

All evaluation errors must be logged.

---

## 28.8 Performance Strategy

Feature flag evaluation must be lightweight.

Performance rules:

- Cache flag configuration for 60 seconds
- Load flags once per request
- Avoid per-document reads
- Evaluate flags in middleware layer
- Do not store flag states inside session documents

This ensures minimal overhead even at large platform scale.



# 29. Email Queue Architecture

## 29.1 Overview
The Email Queue Architecture provides an asynchronous notification subsystem that decouples email delivery from primary application workflows. It ensures that user actions such as test completion, payment events, and alerts do not block request execution.

Design principles:

- Asynchronous processing via job queue
- Idempotent job creation and execution
- Retry-safe delivery attempts
- Batch processing support
- Multi-tenant safe execution
- Cost-efficient email dispatch
- Failure visibility and monitoring
- Strict server-side enforcement

Email sending must never occur directly during request processing. Instead, an email job document is created and processed by background workers.

---

## 29.2 Key Responsibilities

- Queue email notifications as jobs
- Process queued jobs asynchronously
- Deliver emails via external provider
- Retry transient failures safely
- Prevent duplicate email sends
- Maintain delivery state tracking
- Provide operational monitoring metrics
- Archive historical jobs for audit

---

## 29.3 Inputs

Email jobs are created by backend services triggered by system events.

Typical event sources:

| Event | Example Trigger |
|------|------|
|TEST_ASSIGNED|Run assignment creation|
|TEST_COMPLETED|Student submission|
|MONTHLY_AI_SUMMARY_STUDENT|AI summary generation|
|MONTHLY_AI_SUMMARY_BATCH|Batch summary generation|
|PAYMENT_FAILED|Stripe webhook|
|LICENSE_EXPIRY_WARNING|License expiry monitor|
|OVER_LIMIT_ALERT|Usage metering engine|
|CALIBRATION_UPDATE_NOTICE|Vendor calibration activation|

Email template source:

vendor/emailTemplates/{templateId}

---

## 29.4 Outputs

Email delivery results update job state within the queue document.

Primary status transitions:

| Status | Meaning |
|------|------|
|pending|Waiting for processing|
|processing|Worker currently sending|
|sent|Successfully delivered|
|retrying|Scheduled for retry|
|failed|Exceeded retry attempts|
|cancelled|Manually stopped|

Email delivery metadata stored in job document.

---

## 29.5 Workflow

### 29.5.1 Job Creation

Instead of sending email immediately, the system inserts an email job document.

Collection:

institutes/{id}/emailQueue/{jobId}

Example schema:

  {
    schemaVersion: 1,

    jobType: "TEST_COMPLETED",

    priority: "normal",

    recipient: {
      email: "student@email.com",
      name: "Student Name"
    },

    cc: ["guardian@email.com"],

    templateId: "test_completed_v1",

    payload: {
      studentName: "Aman",
      testName: "JEE Mock 3",
      rawScorePercent: 72,
      accuracyPercent: 81
    },

    status: "pending",

    retryCount: 0,
    maxRetries: 5,

    nextAttemptAt: timestamp,

    createdAt: timestamp,
    lastAttemptAt: null,
    sentAt: null,

    errorMessage: null,

    instituteId: "inst_001"
  }

Jobs are inserted only by backend services.

---

### 29.5.2 Email Types

Supported job types include:

| Job Type | Description |
|------|------|
|TEST_ASSIGNED|Student test assignment|
|TEST_COMPLETED|Test result notification|
|MONTHLY_AI_SUMMARY_STUDENT|Student monthly performance summary|
|MONTHLY_AI_SUMMARY_BATCH|Batch summary notification|
|PAYMENT_FAILED|Billing failure alert|
|LICENSE_EXPIRY_WARNING|License expiration reminder|
|OVER_LIMIT_ALERT|Usage limit exceeded alert|
|CALIBRATION_UPDATE_NOTICE|Calibration deployment notification|

Each job references a template.

---

### 29.5.3 Background Processor

Email processing handled by scheduled Cloud Function.

Function name:

processEmailQueue

Execution interval:

every 1 minute

Processing logic:

1. Query email jobs where:

  status == "pending"  
  AND nextAttemptAt <= now

2. Limit processing batch size.

Example:

LIMIT 50

3. Update job:

  status = "processing"

4. Send email via provider.

5. Update job status based on result.

Batch processing prevents overload.

---

### 29.5.4 Email Delivery

Email providers supported:

- SendGrid
- Amazon SES
- SMTP relay

Delivery process:

1. Load template
2. Replace placeholders using payload
3. Send email
4. Capture provider response

Success handling:

  status = "sent"  
  sentAt = now

Failure handling triggers retry logic.

---

### 29.5.5 Retry Policy

Retries occur only for transient failures.

Retryable conditions:

- SMTP timeout
- Provider 5xx error
- Network connectivity failure

Non-retryable conditions:

- Invalid email address
- Permanent 4xx response
- Hard bounce

Retry schedule uses exponential backoff.

| Attempt | Delay |
|------|------|
|1|+1 minute|
|2|+5 minutes|
|3|+15 minutes|
|4|+1 hour|
|5|+6 hours|

Retry update example:

  {
    retryCount: retryCount + 1,
    nextAttemptAt: calculatedTime,
    status: "retrying"
  }

---

### 29.5.6 Failure Handling

If retryCount exceeds maxRetries:

  status = "failed"  
  errorMessage = lastError

Failed jobs remain stored for diagnostics.

Optional escalation:

- Admin notification
- Vendor monitoring alert

Failed jobs are never automatically deleted.

---

### 29.5.7 Deduplication

Duplicate emails prevented using idempotency key.

Example field:

  idempotencyKey: "run_123_student_456_completed"

Before inserting job:

Check if existing job exists with same key and status != failed.

If found:

Skip job creation.

---

### 29.5.8 Multi-Tenancy Isolation

Queue documents stored under institute scope.

Location:

institutes/{id}/emailQueue/

Isolation rules:

- Processor validates instituteId
- No cross-tenant processing
- Institute-specific branding applied to templates

---

### 29.5.9 Template System

Templates stored separately.

Collection:

vendor/emailTemplates/{templateId}

Example:

  {
    subject: "Your test results are ready",
    htmlBody: "<p>Hello {{studentName}}</p>",
    version: 1
  }

Rendering performed during processing.

Template logic uses placeholder replacement.

---

### 29.5.10 Batch Processing Optimization

For high-volume jobs such as monthly AI summaries:

Batch strategy:

1. Generate jobs in bulk
2. Assign low priority
3. Processor throttles batch size
4. Process limited number per minute

Typical throughput:

100 emails per minute.

Rate limits respected based on provider limits.

---

### 29.5.11 Cost Control

Cost optimization rules:

- Use batch processing
- Limit jobs per minute
- Avoid duplicate summaries
- Avoid attachments
- Use compressed HTML templates
- Use scheduled processing instead of immediate send

---

### 29.5.12 Monitoring Metrics

System health metrics collected for vendor dashboard.

Metrics include:

| Metric | Description |
|------|------|
|Pending Jobs|Queue backlog size|
|Failed Jobs|Delivery failures|
|Processing Time|Average send time|
|Send Rate|Emails per minute|
|Bounce Rate|Invalid address rate|
|Retry Rate|Percentage requiring retries|

Stored at:

vendor/aggregates/emailHealth

---

### 29.5.13 Security Rules

Email queue access restricted to backend systems.

Firestore rule:

  allow write: if request.auth.role == "system"

Institute users:

- Cannot create jobs
- Cannot modify jobs
- Can view delivery status only through dashboard summaries

---

### 29.5.14 HOT–WARM–COLD Handling

Email jobs transition through storage tiers.

| Tier | Job State |
|------|------|
|HOT|pending, retrying|
|WARM|sent, failed (current year)|
|COLD|jobs older than 1 year archived|

Old jobs may be exported to BigQuery.

---

### 29.5.15 Failure Escalation

Escalation rule example:

If failedJobsLastHour > threshold:

Actions:

- Trigger vendor alert
- Mark system health warning
- Temporarily pause sending if necessary

This protects against provider outages.

---

### 29.5.16 Monthly AI Summary Handling

Special handling for AI summary emails.

Process:

1. Scheduled job generates AI summary
2. Summary stored in studentYearMetrics
3. Email job created
4. Mark summary delivered
5. Prevent regeneration if summary exists

This avoids duplicate AI generation costs.

---

## 29.6 Dependencies

| Dependency | Purpose |
|------|------|
|AI Summary Pipeline|Monthly summaries|
|Stripe Billing System|Payment alerts|
|Usage Metering Engine|Over-limit alerts|
|Vendor Notification System|System health alerts|
|Email Provider API|Actual email delivery|

---

## 29.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Provider unavailable|Retry using backoff|
|Invalid email address|Mark job failed|
|Duplicate idempotency key|Skip job creation|
|Queue backlog spike|Throttle processing rate|

All failures logged for monitoring.

---

## 29.8 Performance Strategy

Queue processing must remain efficient at scale.

Key rules:

- Batch size limits enforced
- Processor runs every minute
- Maximum processing rate configurable
- Email templates cached in memory
- Jobs fetched via indexed queries

The system supports high-volume notification processing without impacting primary application performance.



# 30. Notification Policy Engine

## 30.1 Overview
The Notification Policy Engine governs communication logic for the platform. It determines whether notifications should be generated, who should receive them, and which metrics are included based on system layer rules, parent safety policies, and institute configuration.

Important distinction:

- Email Queue Architecture → message delivery infrastructure
- Notification Policy Engine → decision logic that generates email jobs

All notification events must follow:

Event → Policy Engine → Email Job Creation → Email Queue → Delivery

Direct email sending from application events is prohibited.

The engine ensures:

- Layer-aware communication policies
- Parent-safe messaging rules
- Selective notification control
- Cost-efficient batch processing
- Non-demotivating communication
- Idempotent job generation

---

## 30.2 Key Responsibilities

- Evaluate notification eligibility per event
- Apply layer-based metric visibility rules
- Apply parent communication filters
- Respect institute notification settings
- Generate email queue jobs
- Suppress duplicate or unnecessary notifications
- Support batch processing for high-volume events
- Enforce communication safety policies

---

## 30.3 Inputs

Policy evaluation receives a structured event payload.

Example input:

  {
    eventType: "TEST_COMPLETED",
    instituteId: "inst_001",
    runId: "run_123",
    studentId: "stu_456",
    layer: "L2",
    mode: "Controlled",
    manualOverride: false
  }

Additional sources read by policy engine:

| Source | Purpose |
|------|------|
|License Object|Determine system layer|
|Notification Settings|Institute preferences|
|Student Document|Parent notification flags|
|Run Configuration|Selective sending options|
|Feature Flags|Experimental notification logic|

---

## 30.4 Outputs

The policy engine produces email job documents when allowed.

Output destination:

institutes/{id}/emailQueue/{jobId}

Possible outcomes:

| Outcome | Description |
|------|------|
|Email Job Created|Notification allowed|
|Suppressed|Policy blocked notification|
|Parent Email Filtered|Parent version generated|
|Batch Job Created|Deferred batch processing|

Each generated job includes idempotency keys to prevent duplication.

---

## 30.5 Workflow

### 30.5.1 Policy Evaluation Process

When an event occurs:

1. Load license layer
2. Load institute notification settings
3. Load student notification preferences
4. Evaluate run-level notification flags
5. Apply layer communication policy
6. Apply parent safety filters
7. Generate zero or more email jobs

Policy logic never directly sends emails.

---

### 30.5.2 Layer-Based Notification Logic

#### L0 — Operational Layer

Allowed content:

| Metric | Allowed |
|------|------|
|Raw Score %|Yes|
|Accuracy %|Yes|
|Completion Status|Yes|
|Next Test Reminder|Yes|

Excluded content:

- Risk labels
- Discipline index
- Behavioral analytics
- Phase adherence metrics

Parent communication:

- Allowed
- Basic metrics only

---

#### L1 — Diagnostic Layer

Additional allowed metrics:

| Metric | Allowed |
|------|------|
|Phase Adherence|Yes|
|Easy Neglect %|Yes|
|Hard Bias %|Yes|
|Topic Weakness Summary|Yes|

Excluded metrics:

- Risk clusters
- Discipline index
- Guess probability
- Execution instability labels

Parent emails must include only positive or neutral language.

---

#### L2 — Controlled Layer

Student emails may include:

| Metric | Allowed |
|------|------|
|Discipline Index|Yes|
|Risk State (soft phrasing)|Yes|
|Controlled Mode Delta|Yes|
|Timing Compliance|Yes|
|Guess Probability Indicator|Yes|

Parent communication restrictions apply.

---

#### L3 — Governance Layer

Student communication identical to L2.

Governance analytics remain internal.

Parent rules remain unchanged.

Governance-level metrics must never be emailed externally.

---

### 30.5.3 Parent Email Filtering

Student document fields:

  {
    parentEmail: "guardian@email.com",
    parentNotificationEnabled: true,
    parentSensitivityLevel: "safe"
  }

Sensitivity levels:

| Level | Allowed Content |
|------|------|
|safe|Raw score, accuracy, encouragement|
|detailed|Topic weaknesses summary|
|off|No parent notifications|

Absolute restriction:

Risk labels must never be included in parent emails.

---

### 30.5.4 Selective Sending Controls

Run configuration may include notification settings.

Example:

  {
    runNotificationEnabled: true,
    parentNotificationEnabled: false
  }

Teacher controls:

| Option | Behavior |
|------|------|
|Auto Send Enabled|Automatic email generation|
|Parent Send Enabled|Parent notification allowed|
|Manual Only|Emails sent only via teacher action|

Manual send action triggers:

manualOverride = true

Parent safety filters still apply.

---

### 30.5.5 Batch Processing Strategy

High-volume events require batch evaluation.

Example scenario:

200 students complete test.

Batch policy workflow:

1. Submission event creates batch task
2. Students processed in chunks
3. Policy evaluated per student
4. Email jobs generated asynchronously

Recommended batch size:

25 students per processing cycle.

---

### 30.5.6 Supported Event Types

Policy engine supports these event types:

| Event Type | Trigger |
|------|------|
|TEST_ASSIGNED|Run assignment|
|TEST_COMPLETED|Submission event|
|MONTHLY_STUDENT_SUMMARY|AI summary generation|
|MONTHLY_BATCH_SUMMARY|Batch analytics|
|PAYMENT_FAILED|Billing webhook|
|LICENSE_EXPIRY_WARNING|License monitor|
|OVER_LIMIT_ALERT|Usage metering|
|MANUAL_REPORT_SEND|Teacher action|

Each event type has policy mapping rules.

---

### 30.5.7 Metric Inclusion Matrix

| Metric | L0 | L1 | L2 | Parent |
|------|------|------|------|------|
|Raw Score %|Yes|Yes|Yes|Yes|
|Accuracy %|Yes|Yes|Yes|Yes|
|Phase Adherence|No|Yes|Yes|No|
|Easy Neglect|No|Yes|Yes|No|
|Hard Bias|No|Yes|Yes|No|
|Discipline Index|No|No|Yes|No|
|Risk State|No|No|Yes|No|
|Guess Rate|No|No|Yes|No|
|Controlled Mode Delta|No|No|Yes|Positive Summary|

---

### 30.5.8 Suppression Rules

Email generation must be suppressed if:

- Duplicate notification detected
- Idempotency key exists
- Student already received notification
- Parent email invalid
- Run not completed
- License expired (optional policy)

Duplicate prevention uses idempotency keys.

---

### 30.5.9 Risk-Sensitive Language Policy

Student messaging:

Allowed phrasing:

- "Execution stability needs improvement"
- "Consider structured pacing"

Parent messaging:

Neutral phrasing required:

- "Student is improving in structured execution"
- "Focus recommended on time allocation"

Negative behavioral labels must never appear in parent communication.

---

### 30.5.10 Policy Storage

Vendor-level defaults:

vendor/notificationPolicies/default

Institute overrides:

institutes/{id}/notificationSettings

Example:

  {
    autoSendTestCompletion: true,
    sendToParent: true,
    parentSensitivityDefault: "safe",
    monthlySummaryEnabled: true
  }

Evaluation priority:

Vendor default → Institute override → Run-level configuration

---

### 30.5.11 Cost Control Rules

Notification policy must enforce:

- No per-question emails
- No real-time behavioral alerts
- Monthly summaries limited to once per student
- Duplicate notifications suppressed
- Batch processing for large events

These constraints control email costs.

---

### 30.5.12 Monitoring Metrics

Vendor monitoring must track:

| Metric | Description |
|------|------|
|Emails Suppressed|Policy suppression rate|
|Parent Filter Rate|Filtered parent emails|
|Manual Send Frequency|Teacher-triggered sends|
|Batch Volume|Bulk notifications|
|Notification Cost|Estimated email cost per institute|

Metrics stored in platform aggregates.

---

## 30.6 Dependencies

| Dependency | Purpose |
|------|------|
|Email Queue Architecture|Email delivery mechanism|
|License Object Architecture|Layer determination|
|Usage Metering Engine|Over-limit alert generation|
|Stripe Billing System|Payment notification triggers|
|Vendor Notification Policies|Default communication rules|

---

## 30.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Policy configuration missing|Fallback to vendor default|
|Invalid parent email|Skip parent notification|
|Duplicate idempotency key|Suppress email|
|Missing event data|Log error and skip processing|

All suppressed notifications must be logged for monitoring.

---

## 30.8 Performance Strategy

Policy engine must operate efficiently.

Performance guidelines:

- Batch processing for large events
- Cached policy configuration
- Avoid session-level queries
- Load institute settings once per batch
- Use indexed queries for student lookups

This ensures scalable notification handling across large institutes.



# 31. Monthly Statement Generator

## 31.1 Overview
The Monthly Statement Generator produces structured institutional performance reports for students and batches. It composes monthly performance snapshots combined with interpreted insights derived exclusively from precomputed analytics data.

The generator must:

- Produce reproducible monthly reports
- Avoid raw session recomputation
- Generate AI-assisted narrative summaries
- Apply guardian-safe filtering rules
- Support PDF export
- Maintain archive-safe snapshots
- Respect system layer visibility rules
- Control AI token usage

Monthly statements serve as the official institutional reporting artifact.

All reports must rely only on aggregated analytics sources.

---

## 31.2 Key Responsibilities

- Generate monthly student statements
- Generate monthly batch summaries
- Apply layer-specific metric inclusion
- Apply guardian-safe filtering
- Integrate AI-generated summaries
- Render structured PDF documents
- Store statement metadata and file references
- Support regeneration under controlled conditions
- Maintain archived statement history

---

## 31.3 Inputs

The generator reads only precomputed summary sources.

Primary data sources:

| Source | Purpose |
|------|------|
|studentYearMetrics|Student performance aggregates|
|runAnalytics|Run-level summary metrics|
|batchAggregates|Batch-level performance summaries|
|governanceSnapshots|Institution-level monthly metrics|
|topicAggregates|Topic-level strengths and weaknesses|

Session-level collections must never be queried.

Example AI summary input payload:

  {
    studentName: "Aman",
    month: "March",
    rawScoreAvg: 72,
    accuracyAvg: 81,
    topicWeakness: ["Electrostatics", "Thermodynamics"],
    phaseAdherence: 64,
    disciplineIndex: 58,
    improvementDelta: +4
  }

---

## 31.4 Outputs

Generated artifacts include:

| Artifact | Storage Location |
|------|------|
|Student Statement PDF|Cloud Storage|
|Guardian Statement PDF|Cloud Storage|
|Batch Summary PDF|Cloud Storage|
|Statement Metadata|Firestore document|

Cloud Storage location:

CloudStorage/institutes/{id}/statements/{YYYY_MM}/{studentId}.pdf

Firestore reference:

institutes/{id}/monthlyStatements/{studentId}_{YYYY_MM}

Example metadata document:

  {
    studentId,
    month,
    pdfUrl,
    guardianPdfUrl,
    generatedAt,
    aiVersion,
    schemaVersion
  }

---

## 31.5 Workflow

### 31.5.1 Generation Trigger

Statements generated via scheduled job.

Cloud Scheduler schedule:

  0 2 1 * *

Execution time:

1st day of month at 02:00.

Processing sequence:

1. Identify active institutes
2. Load student list
3. Generate statements in batches
4. Render PDFs
5. Store outputs
6. Queue optional notification emails

---

### 31.5.2 Batch Processing Strategy

Processing must occur in small chunks.

Recommended batch size:

25 students per cycle.

Batch workflow:

1. Load students
2. Fetch aggregated metrics
3. Generate AI summaries
4. Render PDFs
5. Persist outputs

Batching prevents burst infrastructure load.

---

### 31.5.3 Student Statement Structure

Student report sections include:

**Header**

- Institute logo
- Student name
- Batch
- Academic year
- Reporting month
- Layer badge

**Performance Summary**

Always included:

| Metric | Description |
|------|------|
|Raw Score %|Monthly average|
|Accuracy %|Monthly average|
|Tests Attempted|Monthly count|
|Participation Rate|Attendance percentage|

Trend graph:

- Raw score trend
- Accuracy trend

---

### 31.5.4 Topic Breakdown

Topic-level analysis derived from aggregates.

Include:

| Section | Description |
|------|------|
|Top Strong Topics|Top three topics|
|Top Weak Topics|Three weakest topics|
|Improvement Delta|Change from previous month|

No dynamic recalculation allowed.

---

### 31.5.5 Behavioral Section

Visibility depends on license layer.

#### L0

Behavioral section hidden entirely.

#### L1

Include:

| Metric | Description |
|------|------|
|Phase Adherence %|Execution pacing adherence|
|Easy Neglect %|Missed easy questions|
|Hard Bias %|Overfocus on difficult questions|
|Timing Summary|Time allocation commentary|

Use neutral coaching language.

#### L2

Additional metrics included:

| Metric | Description |
|------|------|
|Discipline Index|Execution discipline score|
|Controlled Mode Delta|Performance improvement|
|Guess Probability|Simplified indicator|
|Risk Summary|Narrative description|

Risk cluster naming is prohibited.

Example narrative:

Execution consistency shows moderate variance this month.

---

### 31.5.6 AI Summary Section

AI summary provides coaching-style narrative.

Requirements:

- Optimistic tone
- Non-judgmental language
- Maximum length: 120 tokens
- Based only on aggregated metrics

Example:

This month shows steady improvement in structured execution. Focus on early-phase efficiency can further enhance performance.

AI summaries must be cached to prevent repeated generation.

---

### 31.5.7 Action Suggestions

Action suggestions generated via deterministic rule logic.

Examples:

- Practice moderate difficulty sets
- Focus on structured pacing
- Review weak topics
- Maintain accuracy consistency

Suggestions must avoid negative language.

---

### 31.5.8 Guardian Filtering

If parent notifications enabled, generate guardian-safe statement.

Guardian report excludes:

| Restricted Content |
|------|
|Discipline Index|
|Risk indicators|
|Guess rate|
|Overstay frequency|
|Phase violation metrics|

Guardian reports include:

| Allowed Content |
|------|
|Raw Score %|
|Accuracy %|
|Topic summary|
|Encouragement paragraph|

Guardian statement generated as separate PDF.

---

### 31.5.9 Batch Summary Generation

Batch summary generated per batch.

Sections include:

| Section | Description |
|------|------|
|Batch Performance Average|Mean score metrics|
|Score Distribution|Histogram of performance|
|Topic Weakness Clusters|Aggregated topic trends|
|Phase Adherence Average|Execution consistency|
|Discipline Index Average|L2 only|
|Controlled Mode Impact|If applicable|
|AI Batch Summary|Narrative insight|

Student-level detail must never appear in batch summary.

---

### 31.5.10 PDF Rendering Pipeline

PDF generation pipeline:

1. Load HTML template
2. Inject student data
3. Inject AI summary
4. Render PDF
5. Upload to Cloud Storage
6. Save metadata in Firestore

Templates cached in memory for performance.

Rendering performed server-side.

---

### 31.5.11 Regeneration Policy

Regeneration allowed under controlled conditions.

Allowed triggers:

| Condition | Allowed |
|------|------|
|Admin manual request|Yes|
|AI version update|Yes|
|Calibration version change|Yes|
|Schema upgrade|Yes|

Automatic regeneration of historical months prohibited.

---

## 31.6 Dependencies

| Dependency | Purpose |
|------|------|
|AI Summary Pipeline|Narrative generation|
|Email Queue Architecture|Statement delivery|
|Notification Policy Engine|Notification eligibility|
|Cloud Storage|PDF archive storage|
|Aggregated Analytics Collections|Metric sources|

All dependencies must use aggregated sources only.

---

## 31.7 Error Handling

Failure scenarios handled gracefully.

| Failure | Handling |
|------|------|
|AI generation failure|Retry limited attempts|
|PDF rendering failure|Retry job|
|Storage upload failure|Retry storage operation|
|Batch processing failure|Skip student and log error|

Failures must never block entire institute batch.

Failed statements recorded for manual retry.

---

## 31.8 Performance Strategy

Performance safeguards include:

- Student processing in fixed batches
- AI call rate limiting
- Cached HTML templates
- Controlled PDF concurrency
- Asynchronous batch execution

Statement generation must scale across multiple institutes without service disruption.



# 32. DevOps & Deployment Architecture

## 32.1 Overview
The DevOps & Deployment Architecture defines the multi-environment cloud infrastructure used to build, test, validate, and operate the platform. The architecture guarantees identical code across environments while isolating configuration, secrets, and infrastructure resources.

Core objectives:

- Maintain a single unified codebase
- Enable zero-cost local development
- Support safe staging validation
- Provide production-grade deployment
- Eliminate code changes between environments
- Enforce secure secrets management
- Enable automated CI/CD pipelines
- Ensure enterprise-ready operational practices

All environments share the same system architecture and deployment processes.

---

## 32.2 Key Responsibilities

- Maintain environment isolation
- Manage deployment pipelines
- Control infrastructure configuration
- Secure environment secrets
- Enable automated builds and deployments
- Provide local development infrastructure
- Ensure monitoring and alerting integration
- Manage backup and recovery mechanisms

---

## 32.3 Inputs

The DevOps system consumes:

| Source | Purpose |
|------|------|
|Git repository|Source code and configuration|
|Environment configuration files|Environment-specific variables|
|CI/CD workflows|Deployment automation rules|
|Secrets storage|API keys and credentials|
|Firebase configuration files|Infrastructure deployment configuration|

Configuration files include:

- firebase.json  
- firestore.rules  
- firestore.indexes.json  
- storage.rules  

---

## 32.4 Outputs

Deployment produces the following operational artifacts:

| Artifact | Destination |
|------|------|
|Cloud Functions|Firebase project|
|Firestore indexes|Firestore database|
|Frontend builds|Firebase Hosting|
|Security rules|Firestore / Storage|
|Static assets|Cloud Storage|
|Monitoring configuration|Cloud Monitoring|

All outputs are environment-specific but generated from the same codebase.

---

## 32.5 Workflow

### 32.5.1 Environment Strategy

Three separate cloud environments must exist.

| Environment | Purpose | Billing | Risk Level |
|------|------|------|------|
|Dev|Local development and experimentation|Free tier|Safe|
|Staging|Pre-production validation|Low cost|Controlled|
|Production|Live institutes and billing|Paid|Critical|

Each environment runs in a separate Firebase/GCP project.

Projects:

- parabolic-dev  
- parabolic-staging  
- parabolic-prod  

Each project contains:

- Firestore
- Cloud Functions
- Cloud Storage
- Firebase Authentication
- Firebase Hosting
- BigQuery (optional initially)

---

### 32.5.2 Repository Structure

The system uses a monorepo.

Repository layout:

parabolic-platform/

  frontend-admin/  
  frontend-student/  
  frontend-exam/  
  frontend-vendor/  

  backend/  
    functions/  
    middleware/  
    engines/  
    policies/  

  firestore.rules  
  firestore.indexes.json  
  storage.rules  
  firebase.json  

  .env.dev  
  .env.staging  
  .env.prod  

  .github/workflows/

All applications share the same backend and infrastructure configuration.

---

### 32.5.3 Environment Variables Strategy

Sensitive configuration must never be hardcoded.

Environment variables include:

  NODE_ENV  
  PROJECT_ID  
  STRIPE_SECRET_KEY  
  STRIPE_WEBHOOK_SECRET  
  AI_API_KEY  
  EMAIL_PROVIDER_KEY  
  APP_BASE_URL  
  EXAM_BASE_URL  
  VENDOR_BASE_URL  

Local development uses `.env` files.

Production environments use secret management systems.

---

### 32.5.4 Secret Management

Secrets must be stored outside the repository.

Secret storage hierarchy:

| Location | Usage |
|------|------|
|Google Secret Manager|Production secrets|
|GitHub Secrets|CI/CD pipelines|
|Local `.env` files|Development only|

`.env` files must never be committed to the repository.

---

### 32.5.5 Development Environment

Development environment operates entirely locally.

Tools used:

- Firebase Emulator Suite
- Stripe Test Mode
- Mock AI responses
- Mock email provider

Emulated services include:

| Service | Emulator |
|------|------|
|Firestore|Local emulator|
|Authentication|Local emulator|
|Cloud Functions|Local runtime|
|Hosting|Local web server|

Local execution command:

  firebase emulators:start

This enables full platform testing without cloud cost.

---

### 32.5.6 Staging Environment

Staging replicates production infrastructure with limited scale.

Purpose:

- Feature validation
- Calibration simulation
- Risk engine testing
- Feature flag experiments

Configuration:

- Firebase Blaze plan
- Stripe test mode
- Real Cloud Functions deployment
- Real Firestore database

Staging domain example:

staging.portal.yourdomain.com

---

### 32.5.7 Production Environment

Production runs the live SaaS platform.

Production configuration:

- Firebase Blaze plan
- Stripe live keys
- BigQuery enabled
- Monitoring enabled
- Backup jobs enabled

Primary domains:

| Portal | Domain |
|------|------|
|Admin Portal|portal.yourdomain.com|
|Exam Portal|exam.yourdomain.com|
|Vendor Dashboard|vendor.yourdomain.com|

DNS management handled by Cloud DNS or domain provider.

---

### 32.5.8 Hosting Architecture

Each portal is deployed as a separate frontend application.

Firebase Hosting multi-site configuration used.

Example configuration:

  {
    "hosting": [
      {
        "target": "admin",
        "public": "frontend-admin/build"
      },
      {
        "target": "exam",
        "public": "frontend-exam/build"
      }
    ]
  }

Applications include:

- Admin portal
- Student portal
- Exam portal
- Vendor dashboard

---

### 32.5.9 CI/CD Pipeline

Continuous integration and deployment implemented via GitHub Actions.

Deployment flow:

Developer push → CI build → Tests → Deploy

Branch mapping:

| Branch | Deployment Target |
|------|------|
|dev|Development environment|
|staging|Staging environment|
|main|Production environment|

Example pipeline stages:

1. Install dependencies
2. Run tests
3. Build frontend applications
4. Lint backend code
5. Deploy infrastructure
6. Deploy hosting
7. Deploy functions

No manual deployments permitted.

---

### 32.5.10 Environment Promotion

Feature promotion flow:

1. Develop in dev environment
2. Validate in staging
3. Merge staging → main
4. Production deployment via CI
5. Enable feature flag rollout

Feature flags control production activation.

---

### 32.5.11 Monitoring and Alerting

Production monitoring must include:

| Monitoring Component | Purpose |
|------|------|
|Cloud Monitoring|Infrastructure health|
|Error Reporting|Runtime error tracking|
|Log-based alerts|Operational alerts|
|Billing alerts|Cost control|
|Stripe webhook alerts|Payment processing reliability|

Monitoring data feeds the vendor system health dashboard.

---

### 32.5.12 Backup Strategy

Automated backups required for critical data.

Backup mechanisms include:

| Resource | Backup Method |
|------|------|
|Firestore|Daily export|
|BigQuery|Dataset export|
|Cloud Storage|Lifecycle retention|
|Configuration|Git repository history|

Backup retention policy:

30 days rolling backup.

---

### 32.5.13 Local Testing Strategy

Local testing environment includes:

- Firestore emulator
- Stripe CLI webhook simulation
- Mock AI responses
- Mock email provider
- Feature flags enabled

This enables full system validation without production dependencies.

---

### 32.5.14 Cost Strategy

Estimated infrastructure cost:

| Environment | Monthly Cost |
|------|------|
|Dev|Free (Spark plan + emulator)|
|Staging|₹500–₹1500|
|Production (initial)|₹500–₹2000|

Costs scale gradually with institute usage.

---

### 32.5.15 Deployment Lifecycle Example

Example deployment scenario:

Deploy Risk Engine V3.

Steps:

1. Implement in dev branch
2. Test locally with emulator
3. Deploy to staging
4. Enable feature flag for canary institute
5. Monitor metrics
6. Increase rollout percentage
7. Merge to main
8. Activate feature globally

All deployments occur without downtime.

---

### 32.5.16 Infrastructure Stack

| Component | Service |
|------|------|
|Backend|Firebase Functions (Node.js)|
|Database|Firestore|
|Archive Storage|BigQuery|
|File Storage|Cloud Storage|
|Authentication|Firebase Auth|
|Hosting|Firebase Hosting|
|Payments|Stripe|
|Monitoring|GCP Monitoring|
|Email|SendGrid or Amazon SES|
|CI/CD|GitHub Actions|

---

### 32.5.17 Firebase CLI Usage

Developers use Firebase CLI to manage deployments.

Environment selection:

  firebase use --add

Deployment examples:

  firebase deploy --project parabolic-dev  
  firebase deploy --project parabolic-prod  

Environment switching requires no code changes.

---

## 32.6 Dependencies

| Dependency | Purpose |
|------|------|
|GitHub|Source control|
|Firebase CLI|Deployment management|
|Google Secret Manager|Secure secrets storage|
|Stripe API|Billing integration|
|Cloud Monitoring|Infrastructure monitoring|

---

## 32.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|CI pipeline failure|Block deployment|
|Secret missing|Abort deployment|
|Function deployment error|Rollback build|
|Hosting deployment failure|Retry deployment|

Deployment failures must never propagate partially applied infrastructure.

---

## 32.8 Performance Strategy

Operational performance maintained through:

- Separate environments
- CI/CD automation
- Feature flag rollout control
- Infrastructure monitoring
- Controlled deployment concurrency

These safeguards ensure stable continuous deployment without impacting production availability.




# 33. Monitoring & Logging Architecture

## 33.1 Overview
The Monitoring & Logging Architecture provides operational visibility, debugging capability, cost protection, and audit traceability across the platform. It functions as the operational nervous system of the SaaS infrastructure.

The architecture separates monitoring into four distinct domains:

1. Application Logging
2. Error Reporting
3. Business Audit Logging
4. Cost & Usage Monitoring

Separation ensures:

- Operational debugging without excessive cost
- Immutable audit trails
- Early anomaly detection
- Vendor-level operational visibility
- Multi-tenant safety

Each logging domain is implemented using different storage systems and monitoring tools.

---

## 33.2 Key Responsibilities

- Capture structured application logs
- Detect runtime errors and crashes
- Record immutable business audit events
- Monitor infrastructure costs and usage
- Generate operational alerts
- Feed monitoring data to vendor dashboards
- Detect abnormal system behavior
- Enable incident response workflows

---

## 33.3 Inputs

Monitoring consumes events from all runtime services.

Primary sources:

| Source | Purpose |
|------|------|
|Cloud Functions|Execution logs|
|Firestore operations|Read/write metrics|
|Stripe Webhooks|Payment event errors|
|Email Queue Processor|Delivery monitoring|
|AI Summary Pipeline|Token usage monitoring|
|Security Rules|Rejected access attempts|
|Feature Flag Framework|Rollout state tracking|

---

## 33.4 Outputs

Monitoring outputs include:

| Output | Destination |
|------|------|
|Application Logs|Cloud Logging|
|Error Reports|Error Reporting|
|Audit Events|Firestore audit collections|
|Usage Metrics|Vendor monitoring aggregates|
|Alert Notifications|Vendor admin notifications|

Monitoring data feeds the vendor system health dashboard.

---

## 33.5 Workflow

### 33.5.1 Application Logging

Application logs capture operational behavior of backend services.

Service used:

Google Cloud Logging.

Logging must use structured JSON format.

Example log structure:

  {
    "level": "INFO",
    "service": "riskEngine",
    "instituteId": "inst_001",
    "runId": "run_123",
    "message": "Risk recalculated successfully",
    "durationMs": 24
  }

Required fields:

| Field | Required |
|------|------|
|timestamp|Yes|
|environment|Yes|
|service|Yes|
|requestId|Yes|
|version|Yes|
|tenantId|If applicable|

Optional fields:

- featureFlags
- execution duration
- request metadata

---

### 33.5.2 Logging Levels

Standard log levels must be enforced.

| Level | Purpose |
|------|------|
|DEBUG|Development diagnostics|
|INFO|Normal operational events|
|WARNING|Recoverable issues|
|ERROR|Failed operations|
|CRITICAL|System integrity risks|

Production environments must disable DEBUG logging.

Example condition:

  if (process.env.NODE_ENV !== "production")

---

### 33.5.3 Logging Security Rules

Sensitive data must never appear in logs.

Prohibited content:

- Passwords
- API tokens
- Payment secrets
- Raw student answers
- Authentication credentials

Permitted data:

- Service execution metadata
- Request identifiers
- Execution durations
- Non-sensitive identifiers

---

### 33.5.4 Log Retention Policy

Log retention must be environment-specific.

| Environment | Retention Period |
|------|------|
|Dev|7 days|
|Staging|14 days|
|Production|30 days|

Retention policies configured in Cloud Logging settings.

This prevents unnecessary storage cost accumulation.

---

### 33.5.5 Error Reporting

Unhandled runtime errors are captured automatically.

Service used:

Google Cloud Error Reporting.

Captured events include:

| Event | Example |
|------|------|
|Unhandled exceptions|Function crash|
|Runtime errors|Invalid execution state|
|Webhook failures|Stripe event failure|
|Queue processor crash|Email processor error|
|AI summary failure|External API failure|

Error reports include:

- Stack trace
- Service name
- Deployment version
- Environment
- Feature flag state

Example metadata:

  {
    "service": "submissionEngine",
    "version": "v3.1",
    "featureFlag": "risk_v2"
  }

---

### 33.5.6 Alert Policies

Automated alerts must detect abnormal conditions.

Examples:

| Condition | Alert |
|------|------|
|Error rate spike within 5 minutes|Vendor alert|
|Stripe webhook failures|Payment alert|
|Email failure spike|Queue processing alert|
|Cloud Function crash loops|Infrastructure alert|

Alert delivery methods:

- Vendor admin email
- Optional Slack integration

---

### 33.5.7 Audit Logging

Audit logs track critical business-level operations.

Audit logs are stored in Firestore and are immutable.

Collections:

vendor/auditLogs/{entryId}

institutes/{id}/auditLogs/{entryId}

Events recorded:

| Event | Example |
|------|------|
|License changes|Layer upgrade|
|Feature flag activation|Experimental rollout|
|Calibration activation|New calibration version|
|Template structure changes|Assessment modification|
|Manual overrides|Vendor intervention|
|Bulk student upload|Roster import|
|Academic year archive|Year closure|
|Manual statement regeneration|Report rebuild|
|Role changes|RBAC update|
|Payment adjustments|Billing corrections|

---

### 33.5.8 Audit Log Schema

Audit log document structure:

  {
    actorId: "vendor_001",
    actorRole: "vendor",
    actionType: "license_upgrade",
    targetInstitute: "inst_001",
    beforeState: {...},
    afterState: {...},
    timestamp: "...",
    ipAddress: "...",
    schemaVersion: 1
  }

Audit records must never be edited or deleted.

---

### 33.5.9 Cost Monitoring

Operational cost monitoring must track resource consumption.

Metrics include:

| Resource | Metric |
|------|------|
|Firestore|Reads and writes|
|Cloud Functions|Invocation count|
|BigQuery|Storage size|
|Email provider|Messages sent|
|AI API|Token usage|
|Stripe|Webhook frequency|

Billing alerts configured in GCP billing console.

Example thresholds:

| Threshold | Action |
|------|------|
|₹1000|Email warning|
|₹3000|Email + Slack alert|
|₹5000|Critical vendor alert|

---

### 33.5.10 AI Cost Monitoring

AI usage must be tracked per institute.

Example structure:

  {
    aiTokensUsedThisMonth: 18230,
    estimatedCost: 430
  }

This prevents uncontrolled AI usage.

---

### 33.5.11 Email Cost Monitoring

Email metrics tracked include:

| Metric | Purpose |
|------|------|
|Emails sent this month|Volume monitoring|
|Failed email count|Reliability tracking|
|Queue backlog size|Processing health|
|Estimated provider cost|Cost monitoring|

Metrics aggregated into vendor monitoring dashboards.

---

### 33.5.12 System Health Dashboard

Vendor dashboard displays aggregated operational metrics.

Displayed metrics include:

| Metric | Description |
|------|------|
|API latency average|Request performance|
|Cloud Function cold starts|Runtime performance|
|Error rate percentage|Platform stability|
|Email backlog|Notification system health|
|Stripe webhook failures|Payment processing reliability|
|Firestore read spikes|Database activity anomalies|
|Active sessions|System usage load|
|AI token consumption|AI cost visibility|
|Storage usage|Infrastructure growth|

All data comes from aggregated monitoring metrics.

---

### 33.5.13 Security Monitoring

Security monitoring tracks suspicious activity.

Monitored events include:

| Event | Detection |
|------|------|
|Failed login attempts|Authentication monitoring|
|Multiple simultaneous sessions|Session anomaly|
|Token verification failures|Authentication integrity|
|Webhook verification failures|API abuse detection|
|Rejected security rule writes|Unauthorized access attempts|

Abnormal spikes trigger vendor alerts.

---

### 33.5.14 Production Safety Guards

Automated safeguards protect system stability.

Examples:

| Trigger | Response |
|------|------|
|Firestore read spike|Alert vendor|
|Error rate exceeds threshold|Feature flag rollback|
|Submission failure spike|Pause experimental rollout|

Feature flags integrate with safety guards.

---

### 33.5.15 Monitoring Data Flow

Monitoring pipeline:

Cloud Function executes  
↓  
Structured logs emitted  
↓  
Cloud Logging stores logs  
↓  
Error Reporting captures crashes  
↓  
Monitoring metrics aggregated  
↓  
Vendor dashboard displays metrics

---

## 33.6 Dependencies

| Dependency | Purpose |
|------|------|
|Cloud Logging|Application log storage|
|Error Reporting|Crash detection|
|Firestore|Audit log storage|
|Cloud Monitoring|Metrics aggregation|
|Billing Console|Cost alerting|

---

## 33.7 Error Handling

| Failure Scenario | Handling |
|------|------|
|Monitoring pipeline failure|Fallback logging|
|Audit log write failure|Retry write operation|
|Metric aggregation failure|Skip and retry scheduled job|
|Alert delivery failure|Retry notification|

Monitoring failures must not affect application runtime.

---

## 33.8 Performance Strategy

Monitoring must scale without excessive overhead.

Guidelines:

- Avoid logging high-frequency operations
- Log only summary events
- Disable debug logs in production
- Aggregate metrics via scheduled jobs
- Limit log retention duration

These controls maintain operational visibility without generating excessive infrastructure cost.




# 34. Scaling & Cost Projection Model

## 34.1 Overview
The Scaling & Cost Projection Model defines the infrastructure cost behavior and scalability profile of the platform under realistic operational loads. It estimates resource consumption and financial cost across key infrastructure services.

The model evaluates:

- Firestore read/write cost
- Cloud Function invocation cost
- BigQuery archival cost
- Hosting bandwidth usage
- AI inference cost
- Email delivery cost
- Multi-institute growth projections

The model ensures that infrastructure cost remains a small percentage of platform revenue while maintaining operational scalability.

---

## 34.2 Key Responsibilities

- Estimate operational infrastructure costs
- Model resource usage growth
- Identify scaling bottlenecks
- Define cost protection strategies
- Provide vendor-level cost forecasting
- Support long-term financial sustainability planning

---

## 34.3 Inputs

Baseline usage assumptions:

Per Institute:

| Parameter | Value |
|------|------|
|Active Students|200|
|Tests Per Student Per Month|8|
|Questions Per Test|50|
|Session Attempts|1 per test|
|Layer Distribution|L1 / L2 mix|

Platform Scale Target:

| Parameter | Value |
|------|------|
|Institutes|100|
|Students|20,000|

These assumptions drive all resource projections.

---

## 34.4 Firestore Read/Write Model

Firestore pricing reference:

| Operation | Price |
|------|------|
|Reads|$0.06 per 100K|
|Writes|$0.18 per 100K|
|Storage|$0.18 per GB|

Currency conversion used:

1 USD ≈ ₹83.

---

### 34.4.1 Per Test Per Student

Estimated write operations during one test:

| Operation | Writes |
|------|------|
|Session creation|1|
|Answer batch saves|10|
|Submission summary|1|
|Run aggregate update|1|
|StudentYearMetrics update|1|
|QuestionAnalytics updates|2|

Total:

16 writes per test.

Estimated read operations:

| Operation | Reads |
|------|------|
|Template snapshot|1|
|Question batch load|1|
|License check|1|
|Student metrics load|1|
|Final analytics read|1–3|

Total:

5–8 reads per test.

---

### 34.4.2 Monthly Per Student

Tests per month:

8.

| Operation | Volume |
|------|------|
|Writes|16 × 8 = 128|
|Reads|8 × 8 = 64|

---

### 34.4.3 Per Institute

200 students per institute.

| Operation | Monthly Volume |
|------|------|
|Writes|25,600|
|Reads|12,800|

---

### 34.4.4 Platform Scale (100 Institutes)

| Operation | Volume |
|------|------|
|Writes|2,560,000|
|Reads|1,280,000|

---

### 34.4.5 Firestore Cost Estimate

Writes:

2,560,000 ÷ 100,000 × $0.18 ≈ $4.6.

Reads:

1,280,000 ÷ 100,000 × $0.06 ≈ $0.77.

Estimated Firestore cost:

₹450 – ₹700 per month at 100 institutes.

---

## 34.5 Cloud Function Invocation Model

Cloud Functions triggered by:

- Session submission
- Email queue processing
- AI summary generation
- Scheduled jobs
- Stripe webhook handlers

Average invocation estimate:

3 functions per test per student.

Total monthly invocations:

200 students × 8 tests × 100 institutes × 3 = 480,000.

Firebase free tier includes:

2 million monthly invocations.

Estimated cost:

₹0 – ₹500 per month.

---

## 34.6 BigQuery Archival Cost

BigQuery pricing reference:

| Resource | Price |
|------|------|
|Storage|$0.02 per GB per month|
|Query|$5 per TB scanned|

Session export size:

Approx. 5 KB per session summary.

Monthly sessions:

20,000 students × 8 tests = 160,000 sessions.

Monthly storage:

160,000 × 5 KB ≈ 800 MB.

Yearly storage:

~10 GB.

Storage cost:

10 GB × $0.02 ≈ $0.20.

Estimated BigQuery cost:

₹50 – ₹300 per month.

---

## 34.7 Hosting Bandwidth Model

Frontend applications:

- Admin portal
- Student portal
- Exam portal
- Vendor dashboard

Average data transfer per test session:

~3 MB.

Monthly sessions:

160,000.

Total bandwidth:

160,000 × 3 MB = 480 GB.

Firebase hosting bandwidth pricing:

~$0.15 per GB beyond free tier.

With CDN optimization and caching:

Expected effective bandwidth:

~200 GB.

Estimated cost:

₹2,500 – ₹4,000 per month.

---

## 34.8 AI Summary Cost

Monthly AI summaries generated per student.

Student count:

20,000.

Average token usage:

~250 tokens per summary.

Total tokens:

20,000 × 250 = 5,000,000 tokens.

Assuming low-cost LLM pricing:

$0.0003 per 1K tokens.

Cost calculation:

5,000 × $0.0003 ≈ $1.5.

Estimated AI cost:

₹100 – ₹1,000 per month.

---

## 34.9 Email Delivery Cost

Monthly email volume:

| Type | Volume |
|------|------|
|Test completion emails|160,000|
|Monthly summaries|20,000|

Total emails:

~180,000 per month.

Typical provider pricing:

$20 per 100K emails.

Estimated cost:

₹2,000 – ₹4,000 per month.

---

## 34.10 Total Platform Cost (100 Institutes)

Estimated monthly infrastructure cost:

| Component | Monthly Cost (₹) |
|------|------|
|Firestore|500|
|Cloud Functions|500|
|BigQuery|200|
|Hosting Bandwidth|3,000|
|Email Delivery|3,000|
|AI Summaries|500|
|Monitoring & Misc|1,000|

Estimated total:

₹8,000 – ₹10,000 per month.

---

## 34.11 Revenue Comparison

Example pricing model:

₹5,000 per institute per month.

Revenue:

100 institutes × ₹5,000 = ₹5,00,000 per month.

Infrastructure cost ratio:

< 2% of revenue.

This provides strong operational margin.

---

## 34.12 Growth Forecast

Projected infrastructure cost by platform scale:

| Institutes | Estimated Cost |
|------|------|
|10|₹2,000 – ₹3,000|
|50|₹5,000 – ₹7,000|
|100|₹8,000 – ₹10,000|
|200|₹15,000 – ₹20,000|

Even at higher scale, infrastructure remains a small revenue percentage.

---

## 34.13 Bottleneck Analysis

Potential scaling bottlenecks:

| Component | Reason |
|------|------|
|Hosting bandwidth|Large exam traffic|
|Email delivery volume|High notification frequency|
|AI usage|Uncontrolled generation|
|Firestore queries|Poor indexing|

Non-bottlenecks:

- Firestore write capacity
- Cloud Function invocation limits

---

## 34.14 Cost Protection Strategies

Cost protection practices include:

- Batch Firestore writes
- Indexed query design
- Avoid session-level reads
- CDN caching for images
- AI summary caching
- Email batching
- BigQuery archival for historical queries

These techniques maintain predictable cost growth.

---

## 34.15 Long-Term Projection

Five-year scale scenario:

| Parameter | Projection |
|------|------|
|Institutes|500|
|Students|100,000|

Estimated infrastructure cost:

₹40,000 – ₹60,000 per month.

Estimated revenue potential:

₹25,00,000 – ₹50,00,000 per month.

Infrastructure remains a small operational cost fraction.

---

## 34.16 Scalability Summary

The platform architecture supports:

- 100 institutes without infrastructure changes
- 500 institutes with minor optimizations
- 1,000 institutes with controlled scaling strategies

Key scalability enablers:

- Precomputed analytics
- Batch processing
- BigQuery archival
- Asynchronous email system
- Feature flag rollout control
- Efficient Firestore indexing
- CDN-based asset delivery

The system remains financially sustainable while supporting large-scale institutional growth.



# 35. Performance Benchmarking Model

## 35.1 Overview
The Performance Benchmarking Model defines the load testing, stress validation, and stability verification framework for the platform. It ensures that the system behaves predictably during peak exam loads and maintains data integrity under concurrent operations.

Benchmarking validates:

- Concurrent session stability
- Submission throughput capacity
- Firestore contention behavior
- Dashboard read performance
- Cold start latency
- Failure recovery resilience

All performance tests must be executed in the following environments:

- Development (small-scale validation)
- Staging (realistic simulation)
- Pre-production verification before major releases

---

## 35.2 Key Responsibilities

- Validate system stability under concurrent usage
- Identify Firestore write contention risks
- Verify submission idempotency under retry conditions
- Measure dashboard query latency
- Detect performance regressions across releases
- Establish production readiness benchmarks

---

## 35.3 Load Simulation

### Objective
Simulate realistic system usage across multiple institute sizes.

Simulation tiers:

| Scenario | Concurrent Students |
|------|------|
|Single Institute|200|
|Small Platform|2,000|
|Medium Platform|5,000|
|Large Platform|20,000|

---

### Tooling

Recommended tools:

- k6 (primary load testing tool)
- Artillery (Node-based alternative)
- Custom Firestore write simulator
- Firebase Emulator Suite (development testing)
- Staging Cloud Functions (real environment testing)

---

### Scenario: Test Start Surge

Simulated event:

2,000 students initiate test sessions within 60 seconds.

Metrics measured:

| Metric | Target |
|------|------|
|Session creation latency|< 500 ms|
|Firestore write success|100%|
|Duplicate session creation|0|
|Function cold start impact|minimal|

Validation ensures stable session initialization under burst traffic.

---

### Scenario: Mid-Test Write Activity

Simulated behavior:

- 2,000 concurrent active sessions
- Answer batch saved every 20 seconds

Metrics measured:

| Metric | Target |
|------|------|
|Write latency|< 200 ms|
|Transaction abort rate|< 1%|
|Error rate|< 0.5%|
|Firestore contention|minimal|

---

## 35.4 Concurrent Session Testing

### Objective
Validate system behavior during peak submission events.

Simulation:

5,000 students submit tests simultaneously.

Submission triggers:

- Session finalization
- Run analytics update
- StudentYearMetrics update
- QuestionAnalytics update
- Pattern engine processing
- Risk engine processing
- Notification job creation

Metrics measured:

| Metric | Target |
|------|------|
|Submission latency (P95)|< 800 ms|
|Error rate|< 0.5%|
|Duplicate submissions|0|
|Transaction conflicts|< 1%|
|Function memory usage|stable|

---

### Concurrency Protection Validation

Test cases include:

- Double-click submit
- Network retry submission
- Token reuse attempts
- Page refresh during submission

System validation requirements:

- Idempotent submission logic
- No duplicate analytics generation
- No duplicate email job creation
- Transaction safety

---

## 35.5 Write Throughput Testing

Firestore operational guidelines:

| Limit | Description |
|------|------|
|~10,000 writes/sec|Distributed project limit|
|~1 write/sec per document|Recommended limit|

Test scenarios:

### Scenario A: High Submission Burst

Simulation:

10,000 student submissions within one minute.

Metrics measured:

- Write throughput
- Document contention
- Transaction retries
- Firestore write latency

---

### Hotspot Detection

Potential contention document examples:

- runAnalytics/{runId}
- usage/currentCycle
- questionAnalytics aggregates

Mitigation validation:

- Sharded counters
- Batched aggregation
- Distributed analytics writes

Benchmark comparison:

- With sharding
- Without sharding

---

## 35.6 Dashboard Read Testing

### Scenario
500 administrators simultaneously open dashboard analytics.

Pages tested:

- Platform overview
- Run analytics
- Insights dashboard

Performance targets:

| Metric | Target |
|------|------|
|Overview load time|< 300 ms|
|Analytics page load|< 800 ms|
|Insights load time|< 1 s|
|Firestore reads per request|< 20|

Validation requirements:

- No session-level reads
- Only summary documents queried
- Pagination enforced
- Indexed queries verified

---

## 35.7 Load Simulation Tiers

Defined system load tiers:

| Tier | Concurrent Sessions |
|------|------|
|Tier 1|500|
|Tier 2|2,000|
|Tier 3|5,000|
|Tier 4|10,000|

Production readiness requirement:

System must pass Tier 3 successfully.

---

## 35.8 Performance Baselines

Baseline metrics stored for regression tracking.

Storage location:

vendor/performanceBenchmarks/{version}

Example record:

    {
      version: "v1.0",
      submissionLatencyP95: 620,
      dashboardLoadP95: 480,
      writeErrorRate: 0.2,
      testedConcurrentSessions: 5000
    }

These baselines allow automated comparison during future upgrades.

---

## 35.9 Regression Testing

Every major system upgrade must execute the full performance test suite.

Regression rule:

If degradation exceeds threshold, deployment is blocked.

Example threshold:

| Metric | Threshold |
|------|------|
|Submission latency increase|> 15%|
|Dashboard latency increase|> 20%|
|Error rate increase|> 0.5%|

---

## 35.10 Cold Start Testing

Cold start metrics evaluated:

- Function initialization time
- Memory allocation delay
- Risk engine initialization
- AI pipeline startup latency

Target:

Cold start latency < 1.5 seconds.

Mitigation strategies:

- Configure minimum instances (production)
- Reduce function bundle size
- Avoid heavy library imports

---

## 35.11 Storage and CDN Testing

Performance tests include:

- Question image load time
- CDN cache hit rate
- Frontend initial render latency

Performance targets:

| Metric | Target |
|------|------|
|Cached image load|< 200 ms|
|CDN cache hit rate|> 90%|
|First contentful paint|minimized|

---

## 35.12 BigQuery Performance Testing

Tests include:

- Governance snapshot generation
- Cross-institute analytics aggregation

Performance targets:

| Operation | Target |
|------|------|
|Snapshot generation|< 2 minutes|
|Query scan size|Controlled via partitioning|

---

## 35.13 Failure Mode Testing

Simulated failure scenarios:

- Firestore write failures
- Stripe webhook processing errors
- AI API timeouts
- Email provider outages

System validation:

- Retry mechanisms trigger correctly
- No submission corruption
- No platform crash
- No blocking of student submissions

---

## 35.14 Cost-Aware Load Testing

During load simulation the system must track:

- Firestore read spikes
- Cloud Function invocation spikes
- Email queue backlog
- AI generation rate

Validation objective:

Ensure no runaway infrastructure costs during peak loads.

---

## 35.15 Performance Acceptance Criteria

Production readiness criteria:

| Requirement | Target |
|------|------|
|Concurrent sessions supported|≥ 5,000|
|Submission latency (P95)|< 800 ms|
|Dashboard load time|< 800 ms|
|Write contention spikes|None|
|Error rate|< 0.5%|
|Email queue stability|Stable under load|
|AI pipeline isolation|No submission delay|
|Session data integrity|No corruption|

---

## 35.16 Scalability Confidence Summary

Architectural elements supporting scalability:

- Precomputed analytics aggregates
- Batched session write operations
- Asynchronous risk engine execution
- Sharded counter architecture
- CDN image caching
- Feature flag rollout controls

Expected operational capacity:

| Scale | Capability |
|------|------|
|Concurrent sessions|5,000–10,000|
|Institutes supported|100+|
|Extended scale with tuning|200+ institutes|

The benchmarking framework ensures predictable performance and operational confidence before scaling the platform.



# 36. Disaster Recovery & Backup Strategy

## 36.1 Overview
The Disaster Recovery & Backup Strategy defines the automated protection, restoration, and continuity framework for the platform. It ensures that the system can recover from data corruption, infrastructure outages, and deployment failures while preserving tenant isolation and historical integrity.

Primary objectives:

- Prevent loss of student data
- Protect analytics integrity
- Maintain billing accuracy
- Enable fast restoration capability
- Minimize downtime
- Protect against accidental deletion
- Protect against malicious tampering
- Ensure automated recovery processes

Disaster scenarios addressed:

1. Data corruption (accidental overwrite or delete)
2. Infrastructure failure (region outage)
3. Deployment failure (faulty code release)

---

## 36.2 Key Responsibilities

- Maintain automated Firestore backups
- Preserve BigQuery historical datasets
- Protect storage objects through versioning
- Enable fast restore procedures
- Protect immutable collections
- Maintain backup security and isolation
- Define recovery objectives and testing procedures

---

## 36.3 Firestore Backup Strategy

### Authoritative Backup Mechanism

Daily automated Firestore exports are executed using Google Cloud Firestore Export.

Schedule:

03:00 AM daily.

Execution command:

    gcloud firestore export gs://parabolic-backups-prod/firestore/YYYY-MM-DD

Storage path:

    gs://parabolic-backups-prod/firestore/{date}/

This backup is considered the authoritative system snapshot.

---

### Backup Retention Policy

| Backup Type | Retention |
|------|------|
|Daily backups|30 days|
|Weekly snapshots|3 months|
|Monthly snapshots|1 year|

Lifecycle policies are configured in Cloud Storage to automatically enforce retention.

---

### Firestore Data Coverage

The backup includes:

- All collections
- All nested subcollections
- Vendor-level collections
- Licensing objects
- Audit logs
- Calibration configurations
- Usage metering documents
- Governance snapshots

BigQuery datasets are excluded from this backup process.

---

## 36.4 BigQuery Backup Strategy

BigQuery serves as the long-term archive layer but requires additional protection.

### Dataset Snapshot Strategy

Weekly dataset snapshots are created using table cloning.

Example command:

    CREATE SNAPSHOT TABLE backup_dataset.snapshot_YYYYMMDD
    CLONE main_dataset.sessions

Retention policy:

| Snapshot Type | Retention |
|------|------|
|Weekly snapshot|90 days|
|Monthly snapshot|1 year|

---

### Cross-Region Protection

Recommended configuration:

Multi-region dataset deployment.

Example regions:

- asia-south1
- asia-east1

This configuration protects data against regional outages.

---

## 36.5 Cloud Storage Backup Policy

Cloud Storage holds critical assets including:

- Question images
- Solution images
- Generated PDF reports
- Governance exports

Object versioning must be enabled.

Configuration:

    gsutil versioning set on gs://parabolic-storage-prod

This enables recovery of deleted or overwritten objects.

Retention policy:

Deleted versions retained for 30 days.

---

## 36.6 Restore Testing Plan

Backups must be verified through periodic restoration testing.

Testing frequency:

Quarterly.

Simulation steps:

1. Create new staging Firestore project
2. Import backup using:

       gcloud firestore import gs://parabolic-backups-prod/firestore/YYYY-MM-DD

3. Deploy staging backend services
4. Validate system integrity:

   - License objects exist
   - RunAnalytics collections intact
   - StudentYearMetrics intact
   - Vendor calibration records intact
   - Audit logs preserved
   - No collection gaps detected

5. Generate validation report
6. Compare dataset hashes against production snapshot

This ensures backup validity and recovery readiness.

---

## 36.7 Deployment Rollback Strategy

Deployment failures are mitigated through version-controlled releases.

Version tagging example:

- v1.0.0
- v1.0.1
- v1.1.0

Rollback procedure:

1. Identify faulty deployment
2. Execute:

       git revert <commit>

3. Redeploy previous stable build
4. Disable affected features using feature flags if necessary

Feature flags allow instant rollback without redeployment.

---

## 36.8 Regional Failure Strategy

Production infrastructure must use multi-region resources.

Recommended configuration:

- Firestore multi-region deployment
- Multi-region Cloud Storage bucket
- Region-appropriate Cloud Functions deployment

This minimizes downtime during zone-level failures.

---

## 36.9 Downtime Minimization Plan

| Scenario | Response |
|------|------|
|Minor bug|Disable feature flag, hotfix deployment|
|Corrupted document|Restore collection, recalculate analytics|
|Regional outage|Failover to secondary region|
|Stripe outage|Queue billing events and activate license grace period|

Target downtime:

Minimal or partial service degradation.

---

## 36.10 Data Integrity Protection

Hard deletes must be prevented for critical datasets.

Protected collections include:

- sessions
- runAnalytics
- studentYearMetrics
- auditLogs
- license objects

Deletion strategy:

Soft delete using status flags.

Example:

    status: "archived"

---

## 36.11 Immutable Data Protection

Certain collections must be immutable after creation.

Protected collections:

- auditLogs
- governanceSnapshots
- licenseHistory
- calibrationVersions

Security rules must block updates and deletes for these collections.

---

## 36.12 Backup Security

Backups must be stored in a separate GCP project.

Recommended project:

parabolic-backup-prod

Access restrictions:

- Vendor IAM roles only
- No institute access
- No public access

Encryption:

Default GCP encryption enabled automatically.

---

## 36.13 Recovery Time Objectives

Recovery targets are defined using RTO and RPO metrics.

| Scenario | RTO | RPO |
|------|------|------|
|Minor bug|30 minutes|0|
|Data corruption|2 hours|24 hours|
|Regional outage|1–4 hours|0–1 hour|
|Catastrophic failure|6–12 hours|24 hours|

Definitions:

RTO = Recovery Time Objective  
RPO = Recovery Point Objective

---

## 36.14 HOT–WARM–COLD Recovery Logic

If Firestore becomes corrupted:

1. Restore Firestore from exported snapshot
2. BigQuery archive remains intact
3. Recalculate StudentYearMetrics
4. Recalculate vendor aggregates

The system must support full metric recomputation.

---

## 36.15 Disaster Test Scenarios

Quarterly disaster drills must simulate:

- Accidental student bulk deletion
- Incorrect calibration activation
- License object overwrite
- Email queue corruption
- Partial session writes

Each scenario must validate restoration capability.

---

## 36.16 Backup Cost Estimate

Estimated dataset size (100 institutes):

2–5 GB.

Cloud Storage pricing:

$0.02 per GB per month.

Estimated cost:

| Dataset Size | Monthly Cost |
|------|------|
|5 GB|≈ $0.10|

Estimated total backup cost:

₹100 – ₹300 per month.

---

## 36.17 Human Error Protection

Most system disasters originate from operational mistakes.

Common risk sources:

- Accidental deletion
- Incorrect calibration activation
- License misconfiguration
- Schema migration errors

Mitigation mechanisms:

- Immutable audit logs
- Feature flag rollout controls
- Versioned calibration engine
- Versioned schema upgrades
- Regular backup restore testing

---

## 36.18 Disaster Recovery Summary

The recovery architecture provides:

- Automated Firestore daily backups
- BigQuery snapshot protection
- Cloud Storage versioning
- Restore simulation testing
- Deployment rollback procedures
- Multi-region infrastructure resilience
- Immutable critical data protection
- Secure backup isolation
- Defined recovery objectives
- Quarterly disaster drills

This framework ensures operational continuity and protects the platform against data loss, infrastructure failures, and operational mistakes.



# 37. Audit & Compliance Framework

## 37.1 Overview
The Audit & Compliance Framework establishes the legally defensible traceability layer of the platform. It ensures that every critical action, configuration change, and governance operation can be reconstructed and verified.

The framework protects against:

- Institutional disputes
- Billing disagreements
- Parent complaints
- Data manipulation accusations
- Regulatory scrutiny
- Internal misuse
- Vendor error
- Calibration disputes

Audit records are immutable and append-only, enabling full historical reconstruction of system behavior.

---

## 37.2 Key Responsibilities

- Maintain immutable audit logs
- Record critical administrative and vendor actions
- Track license and billing mutations
- Track calibration activation history
- Provide legally defensible records
- Enable regulatory data export compliance
- Preserve institutional isolation
- Support system integrity validation

---

## 37.3 Audit Log Storage Structure

Audit records are stored across three layers.

Global collection:

auditLogs/{auditId}

Vendor-level collection:

vendorAuditLogs/{auditId}

Institute-level collection:

institutes/{instituteId}/auditLogs/{auditId}

Design rules:

- Write-once documents
- Append-only architecture
- No update operations
- No delete operations

---

## 37.4 Action Logging Architecture

### Purpose
Track all critical user and system actions affecting platform state.

Examples:

- Create test
- Edit template
- Assign test
- Archive academic year
- Modify execution policy
- Add or remove students
- Bulk upload questions
- Override enforcement rules
- Change user roles
- Update institute settings

---

### Audit Log Schema

    {
      auditId: "uuid",
      timestamp: serverTimestamp,
      actorId: "userId",
      actorRole: "Admin | Teacher | Director | Vendor",
      tenantId: "instituteId",
      actionType: "CREATE_TEST",
      entityType: "test | student | assignment | license | calibration",
      entityId: "docId",
      before: { },
      after: { },
      ipAddress: "...",
      userAgent: "...",
      layer: "L2",
      calibrationVersion: "v1.3",
      riskModelVersion: "r1.2"
    }

Constraints:

- Only changed fields recorded in before/after
- Session-level data must never be logged

---

## 37.5 License Change Logs

License mutation logs protect against billing disputes.

Collection:

institutes/{id}/licenseHistory/{entryId}

Schema:

    {
      timestamp: "...",
      previousLayer: "L1",
      newLayer: "L2",
      previousStudentLimit: 200,
      newStudentLimit: 500,
      changedBy: "vendorUserId",
      reason: "Upgrade request",
      stripeInvoiceId: "...",
      effectiveDate: "..."
    }

Rules:

- Immutable entries
- No update allowed
- No delete allowed

---

## 37.6 Calibration Push Logs

Calibration changes directly affect behavioral scoring and must be auditable.

Collection:

vendorCalibrationLogs/{logId}

Schema:

    {
      timestamp: "...",
      calibrationVersion: "v2.0",
      affectedInstitutes: ["inst1", "inst2"],
      simulationVersion: "sim_v2_preview",
      activatedBy: "vendorUserId",
      rollbackAvailable: true
    }

Institution mirror log:

institutes/{id}/calibrationHistory/{entryId}

---

## 37.7 Override Logs

Overrides must be traceable to protect fairness perception.

Collection:

institutes/{id}/overrideLogs/{overrideId}

Schema:

    {
      timestamp: "...",
      runId: "...",
      studentId: "...",
      overrideType: "MIN_TIME_BYPASS | FORCE_SUBMIT | MODE_CHANGE",
      justification: "Network issue",
      performedBy: "teacherId"
    }

Overrides recorded include:

- Minimum time bypass
- Forced submission
- Mode changes
- Emergency adjustments

---

## 37.8 Data Retention Policy

Retention periods must be clearly defined.

| Data Type | Retention |
|------|------|
|Session Firestore data|Current academic year|
|BigQuery session archive|5 years|
|Audit logs|7 years|
|License history|Permanent|
|Calibration history|Permanent|
|Email logs|1 year|

Retention policies must be configurable.

---

## 37.9 User Data Export Requests

Supports compliance with data protection laws.

Export process:

1. Student requests export
2. Institute admin approves
3. System generates export bundle
4. Secure download link generated
5. Export action logged

Export bundle includes:

- Student profile information
- Test history
- Raw score percentage
- Accuracy metrics
- Risk summary
- Phase adherence
- AI summaries

Audit record:

    {
      actionType: "DATA_EXPORT",
      requestedBy: "studentId",
      approvedBy: "adminId",
      timestamp: "...",
      exportHash: "sha256",
      expiresAt: "..."
    }

---

## 37.10 Data Deletion Requests

Deletion requests must follow soft-delete policy.

Deletion workflow:

1. Mark student document

       deleted: true

2. Remove from billing count
3. Exclude from active queries
4. Preserve historical analytics
5. Log deletion request

Session and analytics documents must never be physically deleted.

---

## 37.11 Calibration Accountability Model

Each session must store version references to ensure reproducibility.

Example:

    {
      calibrationVersion: "...",
      riskModelVersion: "...",
      templateVersion: "...",
      questionVersionSnapshot: [...]
    }

This allows reconstruction of scoring logic during disputes.

---

## 37.12 System Integrity Checks

Nightly audit job performs system verification.

Checks include:

- Orphan session detection
- Aggregate mismatch validation
- Missing analytics records
- Duplicate license state detection

Detected anomalies logged in:

vendorAuditLogs

---

## 37.13 Role-Based Audit Access

Audit visibility is restricted by role.

| Role | Access Scope |
|------|------|
|Admin|Institute audit logs|
|Teacher|Assignment-related logs|
|Director|Governance-level logs|
|Vendor|Full platform audit|
|Student|No audit access|

---

## 37.14 Tamper Protection

Audit logs must be immutable.

Firestore rule enforcement:

    allow update: if false
    allow delete: if false

Additional safeguards:

- Indexed by timestamp
- Server-side timestamps only
- No client-side modification

---

## 37.15 Reportable Incident Framework

Major incidents require governance reporting.

Report includes:

- Incident timeline
- Affected runs
- Recovery actions
- Calibration version active during event
- User actions involved

Output:

Immutable PDF report stored in governance records.

---

## 37.16 Billing Dispute Protection

Each billing cycle must generate a billing snapshot.

Collection:

billingSnapshots/{cycleId}

Snapshot structure:

    {
      activeStudentCount: ...,
      peakUsage: ...,
      licenseTier: "...",
      invoiceId: "...",
      stripeWebhookStatus: "...",
      cycleStart: "...",
      cycleEnd: "..."
    }

These records provide evidence during billing disputes.

---

## 37.17 Cross-Institute Intelligence Compliance

Vendor-level analytics must enforce strict privacy rules.

Requirements:

- No identifiable student data
- No cross-institute visibility
- Only anonymized aggregates
- Only statistical distributions

This ensures institutional data isolation.

---

## 37.18 Legal Safety Summary

The audit architecture provides:

- Immutable audit trails
- Calibration accountability
- License mutation tracking
- Data export compliance
- Soft-delete data retention
- Billing dispute protection
- Vendor oversight
- Institutional isolation
- Regulatory defensibility

All critical system actions remain traceable and reconstructable, ensuring platform trust and legal safety.



# 38. CDN & Asset Delivery Strategy

## 38.1 Overview
The CDN & Asset Delivery Strategy defines the architecture for secure, low-latency delivery of static and media assets used by the platform. It ensures fast exam portal performance while protecting question assets from unauthorized access.

The strategy addresses:

- High-speed delivery of question and solution images
- Secure distribution of exam assets
- Cost-efficient bandwidth usage
- CDN-based caching
- Signed URL protection
- Cross-region performance consistency
- Archive-safe asset retention

The platform is image-heavy; therefore CDN optimization is critical for maintaining exam responsiveness and reducing infrastructure load.

---

## 38.2 Key Responsibilities

- Deliver question images with minimal latency
- Protect assets from unauthorized access
- Prevent direct storage bucket exposure
- Provide cache-efficient asset distribution
- Support archive-safe asset lifecycle
- Enable signed access for secure delivery
- Reduce storage and backend load
- Maintain high CDN cache hit rates

---

## 38.3 Storage Architecture

Two primary Cloud Storage buckets are used.

### Question Asset Bucket

Bucket:

gs://parabolic-prod-question-assets

Stores:

- Question images
- Solution images
- Optional solution PDFs

Directory structure:

    /{instituteId}/questions/{questionId}/v{version}/question.png
    /{instituteId}/questions/{questionId}/v{version}/solution.png

Versioning ensures that question assets remain immutable once a version is finalized.

---

### Reports Bucket

Bucket:

gs://parabolic-prod-reports

Stores:

- Student monthly PDF statements
- Governance reports
- Analytics exports

Directory structure example:

    /{instituteId}/reports/{year}/{month}/{studentId}.pdf

---

## 38.4 CDN Architecture

Content delivery is handled by Google Cloud CDN positioned in front of Cloud Storage.

Delivery flow:

    Student Browser
        ↓
    CDN Edge Node
        ↓
    HTTPS Load Balancer
        ↓
    Cloud Storage Bucket
        ↓
    Cached Asset Response

Benefits:

- Reduced latency
- Lower storage bandwidth cost
- Improved cross-region access performance

---

## 38.5 Question Image Caching Strategy

Question assets are immutable once versioned; therefore aggressive caching is safe.

### Hot Assets

Assets used in the current academic year.

Cache policy:

    Cache-Control: public, max-age=86400

Duration:

24 hours.

---

### Warm Assets

Assets not accessed within the last 30 days.

Cache policy:

    max-age=604800

Duration:

7 days.

---

### Cold Assets

Archived academic-year assets.

Cache policy:

    max-age=31536000

Duration:

1 year.

These assets rarely change and can safely remain cached for long durations.

---

## 38.6 Signed URL Security Strategy

Public bucket URLs must never be exposed.

Risks of public URLs:

- Question scraping
- Competitive leakage
- Unauthorized distribution

Solution:

Time-limited signed URLs generated by backend services.

Example URL:

    https://cdn.yourdomain.com/inst1/questions/q123/v2/question.png?Expires=...

Expiration rules:

| Context | Expiry |
|------|------|
|Exam session|Up to 2 hours|
|Dashboard viewing|30 minutes|

---

### Signed URL Generation Workflow

1. Student loads exam portal.
2. Exam portal requests question metadata.
3. Backend generates signed URLs for assets.
4. CDN serves asset via signed link.

Only the CDN endpoint is exposed; direct bucket URLs are never returned.

---

## 38.7 Video Asset Handling

Two supported approaches exist.

### External Video Hosting

Videos hosted on external platforms.

Example storage field:

    {
      tutorialVideoLink: "https://youtube.com/...",
      simulationLink: "https://..."
    }

Frontend behavior:

- Embedded via iframe
- Sandboxed iframe security
- Autoplay disabled

---

### Internal Video Hosting

Hosted in Cloud Storage.

Bucket:

gs://parabolic-prod-video-assets

Delivery:

- CDN streaming
- Lazy loading

Restrictions:

- Videos never loaded in exam portal
- Accessible only in student learning portal

---

## 38.8 Static Asset Optimization

### Image Optimization

Upload constraints:

| Parameter | Requirement |
|------|------|
|Format|PNG or WebP|
|Maximum width|1400px|
|Preferred file size|≤300KB|
|Metadata|Stripped|

Optional optimization:

Automatic compression via Cloud Function on upload.

---

### Frontend Optimization

Recommended strategies:

- Preload next question image
- Lazy-load solution images
- Avoid loading entire question set
- Use lightweight previews when needed
- Avoid blocking the main thread

---

## 38.9 Exam Portal Optimization Rules

Exam runtime requirements:

- Preload next question image
- No solution images loaded during exam
- No video loading during exam
- CDN cache hit rate > 90%
- No Firestore reads for asset URLs during navigation

Forbidden operations:

- Generating signed URL per navigation event
- Direct bucket queries
- Proxy image retrieval through backend servers

---

## 38.10 Archive Transition Rules

When an academic year is archived:

- Question assets remain in the same bucket
- Cache duration increases automatically
- Firestore marks associated data as archived

No asset relocation occurs to avoid operational complexity.

---

## 38.11 Security Hardening

Security configurations include:

- Uniform bucket-level access enabled
- Public bucket access disabled
- Backend service account IAM-only access
- Signed URL enforcement
- Directory listing disabled
- HTTPS-only asset delivery
- Strict Content Security Policy in exam portal

---

## 38.12 CDN Domain Structure

Assets must be delivered from a dedicated CDN domain.

Example:

cdn.yourdomain.com

Separate domains used for application portals:

| Domain | Purpose |
|------|------|
|portal.yourdomain.com|Admin portal|
|exam.yourdomain.com|Exam interface|
|vendor.yourdomain.com|Vendor dashboard|

Separation prevents cookie leakage and improves security isolation.

---

## 38.13 Cost Optimization

Without CDN:

Every image request hits Cloud Storage directly.

With CDN:

High cache hit rates reduce storage bandwidth cost.

Example scenario:

| Metric | Value |
|------|------|
|Students|5,000|
|Questions per test|75|
|Image requests|375,000|

With 90% cache hit rate:

Only 37,500 requests reach storage.

Result:

Significant bandwidth cost reduction.

---

## 38.14 Edge Case Handling

### Signed URL Expiration During Exam

Solution:

- Expiry duration exceeds maximum test time
- Backend can refresh URLs silently if required

---

### Page Reload During Exam

Process:

1. Session token validated
2. Backend regenerates signed URLs
3. Exam resumes normally

---

## 38.15 Solution Access Rules

Solution access is restricted based on test state.

Student portal behavior:

Completed tests:

- Signed URLs generated for solutions
- Tutorial links enabled
- Simulation links enabled

Archived academic year:

Solution access disabled.

Backend rule:

    if archivedYear == true
        do not generate solution URL

---

## 38.16 Static Application Delivery

Frontend applications are delivered via Firebase Hosting.

Applications:

- Admin portal
- Student portal
- Exam portal
- Vendor dashboard

Deployment model:

- Static React build
- Firebase Hosting CDN distribution
- HTTPS-only access

---

## 38.17 Performance Targets

| Asset Type | Target |
|------|------|
|Question image load|< 200 ms (cached)|
|First question render|< 1 second|
|Next question preload|< 150 ms|
|Dashboard image load|< 300 ms|
|PDF download|< 2 seconds|

---

## 38.18 CDN Monitoring

The vendor dashboard must track asset delivery metrics.

Key monitoring indicators:

- CDN cache hit ratio
- Edge latency
- HTTP 4xx and 5xx error rates
- Bandwidth consumption

Metrics displayed in:

Vendor Dashboard → System Health → Asset Delivery.

---

## 38.19 Asset Delivery Summary

The CDN architecture provides:

- Secure versioned question asset storage
- CDN-backed high-speed delivery
- Signed URL security enforcement
- Immutable asset versioning
- Archive-compatible storage strategy
- Video streaming control
- Frontend asset optimization
- Cost-efficient bandwidth usage
- Vendor monitoring visibility

This architecture ensures fast, secure, and scalable asset delivery across all platform portals.



# 39. Search Architecture

## 39.1 Overview
The Search Architecture defines the structured and scalable retrieval framework used across the platform. It ensures predictable query performance, controlled index growth, and low operational cost while supporting the primary search domains of the system.

Search operations must:

- Avoid full collection scans
- Avoid client-side filtering
- Avoid raw session-level queries
- Enforce pagination
- Use deterministic indexes
- Maintain tenant isolation
- Remain cost-efficient at scale

Search functionality is divided into four domains:

1. Question Search
2. Student Filtering
3. Limited Text Search
4. Vendor Intelligence Search

Each domain uses a dedicated indexing strategy.

---

## 39.2 Key Responsibilities

- Enable structured retrieval of questions
- Support efficient student filtering
- Provide lightweight token-based text search
- Enable vendor analytics search without scanning raw data
- Enforce pagination and query limits
- Control Firestore composite index growth
- Prevent high-cost unbounded queries

---

## 39.3 Question Search Indexing

### Collection Structure

Questions are stored under:

institutes/{instituteId}/questions/{questionId}

Indexed fields include:

| Field | Purpose |
|------|------|
|examType|Exam categorization|
|subject|Subject classification|
|chapter|Chapter grouping|
|difficulty|Difficulty filtering|
|questionType|MCQ, numerical, etc.|
|primaryTag|Primary classification|
|secondaryTag|Secondary classification|
|additionalTags|Array tag filtering|
|status|Active or archived state|
|academicYear|Year partitioning|
|version|Question version|
|usedCount|Usage tracking|

---

### Allowed Query Patterns

Only predefined filter combinations are allowed.

Examples:

| Query Pattern |
|------|
|examType + subject|
|subject + chapter|
|difficulty + subject|
|chapter + difficulty|
|primaryTag|
|additionalTags (array-contains)|
|status|
|academicYear|

Arbitrary combinations are not allowed to prevent index explosion.

---

### Composite Index Matrix

Composite indexes must only be created for approved query patterns.

Example composite indexes:

| Index Fields |
|------|
|examType ASC, subject ASC, difficulty ASC|
|subject ASC, chapter ASC|
|chapter ASC, difficulty ASC|

Index creation must be manually governed.

---

### Pagination Enforcement

All queries must enforce pagination.

Required pattern:

    query.limit(50).startAfter(cursor)

Forbidden pattern:

    query.get()

Unbounded queries are never allowed.

---

### Deterministic Test Generation Support

Test generation relies on deterministic ordering fields.

Supported fields:

- createdAt
- questionId
- usedCount

Generation strategies supported:

- Shuffle + Slice
- Offset + Limit
- Round Robin selection

Randomized queries without limits are prohibited.

---

## 39.4 Student Filtering Optimization

### Collection Structure

Students stored under:

institutes/{instituteId}/students/{studentId}

Key filtering fields:

| Field | Purpose |
|------|------|
|batchId|Batch filtering|
|status|Active student filtering|
|riskState|Behavioral classification (L2+)|
|avgRawScoreRange|Performance grouping|
|avgAccuracyRange|Accuracy grouping|
|disciplineIndexRange|Execution discipline|
|percentileRange|Ranking grouping|
|academicYear|Year partition|

Performance metrics are not calculated during queries.

All metrics are precomputed in:

studentYearMetrics/{studentId}

---

### Example Student Filtering Query

    where("batchId", "==", batchId)
    where("riskState", "==", "Impulsive")
    orderBy("disciplineIndex")
    limit(50)

Corresponding composite index must exist.

---

## 39.5 Text Search Strategy

Firestore does not support full-text search natively.

Two strategies are defined.

---

### Lightweight Token Index (Primary Strategy)

Question documents store search tokens.

Example field:

    searchTokens: ["kinematics", "velocity", "projectile"]

Tokens generated during question upload.

Query example:

    where("searchTokens", "array-contains", "velocity")

Advantages:

- Simple implementation
- Low operational cost
- Native Firestore support

Limitations:

- Exact token matching only
- No fuzzy search
- No phrase search

---

### External Search Engine (Future Extension)

For advanced text capabilities, an external engine may be integrated.

Supported engines:

- Algolia
- Meilisearch
- Elasticsearch
- Typesense

Synchronization flow:

1. Question created or updated
2. Cloud Function trigger fires
3. Question metadata pushed to search index

Capabilities supported:

- Fuzzy search
- Phrase search
- Autocomplete
- Ranking relevance

External search is optional and not required for MVP deployment.

---

## 39.6 Vendor Intelligence Search

Vendor search operations must not scan raw student or session data.

Vendor search operates on aggregated collections.

Collection:

vendorAggregates/{instituteId}

Example document:

    {
      instituteName,
      activeStudents,
      currentLayer,
      riskDistributionSummary,
      calibrationVersion,
      revenueYTD,
      lastActivityAt
    }

Vendor search queries operate exclusively on this dataset.

---

## 39.7 Search Performance Rules

The following queries are prohibited:

- Queries without filters
- Queries without limits
- Raw session collection queries
- Client-side filtering over large datasets
- Unbounded tag combinations

Mandatory constraints:

- Indexed queries only
- Pagination enforcement
- Academic year partitioning
- Vendor queries using aggregates only

---

## 39.8 Academic Year Partitioning

All operational search queries must include academic year filtering.

Example:

    where("academicYear", "==", currentYear)

Exceptions:

Archive views may remove this filter.

Benefits:

- Prevents large collection scans
- Reduces query cost
- Maintains consistent query latency

---

## 39.9 Index Governance Strategy

The following index groups must be maintained:

| Index Category |
|------|
|Question composite indexes|
|Student composite indexes|
|Run analytics indexes|
|Vendor aggregate indexes|

Index governance rules:

- Avoid automatic index creation
- Periodically audit index usage
- Remove unused indexes

Quarterly index reviews are recommended.

---

## 39.10 Search Cost Control

Firestore query cost equals the number of documents read.

Risk factors include:

- Unfiltered searches
- High-cardinality tag queries
- Large OR filter combinations

Mitigation strategies:

- Limit tag count per question
- Normalize tag taxonomy
- Enforce academic year partitioning
- Limit query result sizes

---

## 39.11 Autocomplete Strategy

Autocomplete features must rely on small metadata collections.

Examples:

| Collection | Purpose |
|------|------|
|institutes/{id}/tagDictionary|Tag suggestions|
|institutes/{id}/chapterDictionary|Chapter suggestions|

Autocomplete queries read only these small datasets, avoiding large collection scans.

---

## 39.12 Search Security Rules

Search capabilities are restricted by role.

| Role | Search Permissions |
|------|------|
|Student|No question bank search|
|Teacher|Institute-level search only|
|Admin|Institute-level analytics search|
|Vendor|Aggregate institute search only|

Students cannot search:

- Question bank collections
- Vendor datasets
- Other student records

Vendors cannot search:

- Raw student names across institutes
- Session-level records

All restrictions enforced through tenant guards and role guards.

---

## 39.13 Scalability Expectations

With proper indexing and partitioning, the architecture supports:

| Resource | Capacity |
|------|------|
|Questions per institute|100,000+|
|Students per institute|10,000+|
|Institutes on platform|500+|

Vendor-level search remains stable due to aggregate-based querying.

---

## 39.14 Search Architecture Summary

The search system provides:

- Structured question retrieval
- Indexed filter combinations
- Efficient student filtering
- Token-based text search
- Vendor aggregate query layer
- Mandatory pagination enforcement
- Academic year partitioning
- Controlled index growth
- Tenant-isolated access control

This architecture ensures predictable performance, controlled operational cost, and scalable search capabilities across all platform domains.



# 40. Synthetic Data Simulation Engine

## 40.1 Overview
The Synthetic Data Simulation Engine provides a controlled environment for stress testing, behavioral modeling, and intelligence validation without using real institute data. It generates statistically realistic student behavior, session patterns, and academic lifecycle events to validate system engines before production deployment.

This framework supports:

- Risk engine calibration testing
- Load and performance simulation
- Archive lifecycle validation
- Vendor intelligence testing
- Multi-institute scenario simulation

All synthetic data operates within isolated namespaces to ensure production data integrity.

Simulation output is written only to sandbox institute identifiers:

    institutes/sim_{simulationId}/

This ensures complete separation from production institutes.

---

## 40.2 Key Responsibilities

- Generate statistically realistic student profiles
- Simulate question-level test sessions
- Produce synthetic analytics data
- Validate risk cluster classification
- Simulate academic year archive transitions
- Stress-test system concurrency limits
- Generate vendor-level simulation reports
- Provide a vendor dashboard control panel for simulations

Simulation systems must never:

- Trigger billing logic
- Send emails
- Trigger AI summaries
- Interact with Stripe
- Modify production datasets

---

## 40.3 Inputs

Simulation execution parameters are defined by vendor controls.

Example simulation configuration:

    {
      instituteCount: 5,
      studentCountPerInstitute: 200,
      runCount: 20,
      riskDistributionBias: "balanced",
      difficultyDistribution: "realistic",
      timingAggressiveness: "moderate",
      archiveSimulationEnabled: true,
      loadIntensity: "medium"
    }

Simulation versions must store metadata including:

    {
      simulationVersion,
      calibrationVersion,
      riskModelVersion,
      parameterSnapshot,
      runCount,
      studentCount
    }

---

## 40.4 Outputs

Simulation results generate realistic platform data including:

- Synthetic session documents
- Synthetic run analytics
- Synthetic studentYearMetrics
- Risk classification outputs
- Performance metrics

Outputs are stored under:

    institutes/sim_{id}/runs/
    institutes/sim_{id}/students/
    institutes/sim_{id}/studentYearMetrics/

Simulation reports stored at:

    vendor/simulationReports/{reportId}

Reports include:

- Risk cluster distributions
- Discipline index histograms
- Submission latency statistics
- Load simulation graphs
- Archive integrity validation

---

## 40.5 Workflow

### 40.5.1 Student Simulation Engine

Generates realistic student behavioral profiles.

Student profile example:

    {
      studentId,
      baselineAbility: 0–1,
      disciplineProfile: 0–1,
      impulsivenessScore: 0–1,
      overconfidenceScore: 0–1,
      fatigueFactor: 0–1,
      topicStrengthMap: {
        kinematics: 0.8,
        calculus: 0.4
      }
    }

These parameters drive synthetic session behavior.

---

### 40.5.2 Test Attempt Simulation

Each simulated student performs realistic test attempts.

Simulation steps:

1. Select template
2. Generate per-question behavior
3. Simulate response timing
4. Simulate correctness probability
5. Simulate skip patterns
6. Simulate phase drift
7. Simulate guess probability

Generated session structure:

    {
      answers: [],
      timePerQuestion: [],
      phaseTransitions: [],
      violations: []
    }

Sessions are written to:

    runs/{runId}/sessions/{sessionId}

This enables testing of:

- Risk Engine
- Pattern Engine
- Analytics Engine

---

### 40.5.3 Risk Cluster Simulation

Risk cluster testing validates classification accuracy.

Predefined cluster profiles include:

- Stable
- Drift-Prone
- Impulsive
- Overextended
- Volatile

Each cluster uses weighted parameter biases affecting:

- Discipline score
- Guess rate
- Phase adherence
- Timing stability

Risk score calculation uses the real platform formula:

    riskScore = weightedSum(parameters)

Simulation compares cluster outcomes under different calibration weights.

---

### 40.5.4 Cluster Distribution Validation

Simulation runs generate varying student population sizes:

| Simulation Size | Students |
|---|---|
|Small|100|
|Medium|500|
|Large|5,000|

Validation metrics include:

- Cluster distribution balance
- False-positive classification rate
- False-negative classification rate
- Discipline index variance

---

### 40.5.5 Archive Simulation Engine

Simulates the full academic lifecycle including archive transitions.

Simulation process:

1. Generate synthetic runs
2. Generate session data
3. Generate studentYearMetrics
4. Generate runAnalytics
5. Trigger simulated archive operation

Archive process validates:

- Session migration to BigQuery simulation tables
- Governance snapshot generation
- Metric reset integrity
- Reference integrity

Validation checks:

- No missing sessions
- No orphan analytics
- Snapshot totals match session aggregates

---

### 40.5.6 Load Simulation Engine

Simulates high-concurrency operational load.

Supported scenarios:

| Scenario | Description |
|---|---|
|Session Start Burst|2,000 concurrent session starts|
|Submission Surge|5,000 simultaneous submissions|
|Write Burst|10,000 writes per minute|
|Dashboard Read Surge|500 concurrent admin loads|

Measured metrics include:

- Write latency
- Transaction conflicts
- Function invocation time
- Read amplification

---

### 40.5.7 Dashboard Load Simulation

Admin analytics pages are stress-tested.

Simulated activities:

- 500 admin overview loads
- 500 analytics page loads
- Vendor dashboard queries

Validation metrics:

- Query latency
- Firestore read cost
- Index performance

---

### 40.5.8 Vendor Simulation Control Panel

Simulation execution is controlled via the vendor dashboard.

Location:

    /vendor/calibration → Simulation Mode

Control parameters include:

- Number of institutes
- Number of students
- Risk distribution bias
- Difficulty distribution
- Timing aggressiveness
- Archive simulation toggle
- Load intensity

Simulation results provide visual reports including:

- Risk cluster charts
- Discipline histograms
- Submission latency graphs
- Load stress curves
- Archive validation summaries

---

## 40.6 Versioned Simulation Model

Each simulation run stores a complete parameter snapshot.

Example:

    {
      simulationVersion,
      calibrationVersion,
      riskModelVersion,
      parameterSnapshot,
      runCount,
      studentCount,
      outputMetrics
    }

This enables:

- Calibration comparison
- Risk model validation
- Regression testing

---

## 40.7 Isolation Safety Rules

Simulation environments must follow strict isolation rules.

Simulation restrictions:

- Run only in dev or staging environments
- Use institute IDs prefixed with sim_
- Never increment billing counters
- Never trigger real notifications
- Never generate AI summaries
- Never produce Stripe transactions

Simulation must also disable:

- Email queue creation
- PDF generation
- Vendor billing logic

---

## 40.8 Intelligence Validation

Simulation outputs are used to validate platform intelligence systems.

Validation includes:

- Pattern detection accuracy
- Risk cluster stability
- Phase adherence variation
- Controlled mode improvement
- Stability index behavior

These insights inform calibration updates before production rollout.

---

## 40.9 Cost Safety Rules

To prevent unnecessary operational costs during simulation:

Disabled services include:

- AI API calls
- Email processing
- PDF generation
- Stripe integration

High-volume simulations may optionally run against the Firestore emulator.

---

## 40.10 Advanced Simulation (Future)

Future versions may implement Monte Carlo simulation models.

Capabilities include:

- Testing 10,000 parameter combinations
- Evaluating calibration effectiveness
- Identifying optimal model weights

This allows data-driven calibration tuning.

---

## 40.11 Dependencies

The simulation engine interacts with:

- Risk Engine
- Pattern Detection Engine
- Analytics Engine
- Archive System
- Vendor Calibration System
- Firestore sandbox namespaces

It must never interact with production institute namespaces.

---

## 40.12 Error Handling

Simulation failures must be isolated and non-destructive.

Failure handling rules:

- Abort simulation without affecting other environments
- Log simulation error details
- Store failure metadata in simulation reports
- Allow safe restart of simulation jobs

Example error entry:

    {
      simulationId,
      stage: "riskSimulation",
      errorType: "calculationFailure",
      timestamp,
      details
    }

Simulation systems must guarantee no impact on production operations.

---

## 40.13 Summary

The Synthetic Data Simulation Engine enables safe experimentation and validation across the entire platform lifecycle.

Capabilities include:

- Student behavior simulation
- Session-level test simulation
- Risk cluster generation
- Archive lifecycle validation
- Load and stress testing
- Vendor analytics simulation
- Calibration impact preview
- Versioned simulation analysis

This engine provides a controlled environment for validating system behavior before real-world deployment.



# 41. Business Intelligence Layer (Vendor Side)

## 41.1 Overview
The Business Intelligence Layer provides platform-level commercial analytics and strategic intelligence for the vendor. It focuses on revenue health, institute adoption, upgrade behavior, churn risk, calibration impact, and long-term growth forecasting.

This layer operates exclusively under:

    /vendor/intelligence

It processes only aggregated datasets and platform snapshots. Raw session data and individual student records are never accessed.

Primary objectives:

- Monitor platform revenue health
- Track institute layer maturity
- Measure feature adoption
- Identify churn risks
- Evaluate calibration impact
- Forecast revenue and growth

All analytics are time-series driven and snapshot-based to maintain performance and cost efficiency.

---

## 41.2 Key Responsibilities

- Aggregate platform revenue metrics
- Track license layer distribution across institutes
- Analyze upgrade and conversion funnels
- Detect churn risks and retention patterns
- Measure feature adoption and engagement
- Evaluate calibration effectiveness
- Generate revenue and growth forecasts
- Produce cohort-based growth insights

Vendor BI must remain isolated from institute-level operational data.

---

## 41.3 Inputs

Vendor BI operates exclusively on aggregated collections.

Primary data sources:

| Source Collection | Purpose |
|---|---|
|vendorAggregates|Institute-level aggregated intelligence|
|billingSnapshots|Revenue metrics and billing cycles|
|licenseHistory|Upgrade and downgrade tracking|
|governanceSnapshots|Platform-level governance metrics|
|usageMeter summaries|Feature usage and adoption metrics|

Raw student sessions or detailed analytics collections are never accessed.

---

## 41.4 Outputs

The BI layer produces aggregated intelligence datasets and visualization outputs including:

- Revenue metrics dashboards
- Layer maturity distribution charts
- Upgrade conversion funnels
- Churn prediction indicators
- Adoption score reports
- Calibration impact analysis
- Revenue forecasting projections
- Cohort growth analytics

All outputs are stored under:

    /vendor/intelligence

Example snapshot output:

    {
      snapshotMonth: "2025-08",
      totalMRR: 1420000,
      activeInstitutes: 42,
      avgRevenuePerInstitute: 33809,
      churnRate: 0.04,
      upgradeRate: 0.12
    }

---

## 41.5 Workflow

### 41.5.1 Revenue Intelligence

Revenue analytics are derived from billing cycle snapshots.

Key performance indicators include:

| KPI | Description |
|---|---|
|MRR|Monthly recurring revenue|
|ARR|Annual recurring revenue projection|
|Active Paying Institutes|Institutes with active licenses|
|Revenue by Layer|Revenue segmented by L0–L3|
|Average Revenue Per Institute (ARPI)|Revenue per institute|
|Average Revenue Per Student (ARPS)|Revenue efficiency per student|

Data source collections:

- billingSnapshots/{cycleId}
- vendorAggregates/{instituteId}

Example revenue snapshot:

    {
      cycleId: "2025-08",
      totalMRR: 1420000,
      layerBreakdown: {
        L0: 200000,
        L1: 350000,
        L2: 650000,
        L3: 220000
      },
      activeInstitutes: 42,
      avgRevenuePerInstitute: 33809
    }

Visualization components include:

- Monthly revenue line chart
- Layer revenue stacked area chart
- Month-over-month revenue growth
- Revenue volatility index

---

### 41.5.2 Layer Distribution Analysis

Tracks maturity distribution across license layers.

Metrics include:

- Percentage of institutes in each layer (L0–L3)
- Migration velocity between layers
- Average time spent in each layer
- Upgrade frequency by institute size

Example metrics:

    L0 → L1 conversion rate: 28%
    L1 → L2 conversion rate: 12%

Data sources:

- licenseHistory
- vendorAggregates

---

### 41.5.3 Upgrade Conversion Funnel

Tracks institute progression across platform layers.

Conversion funnel stages:

- L0 eligible → L1 upgrade
- L1 eligible → L2 upgrade
- L2 eligible → L3 invitation

Measured metrics:

- Eligibility attainment rate
- Upgrade conversion rate
- Average upgrade delay
- Tests completed before upgrade

Example upgrade record:

    {
      instituteId: "...",
      firstEligibleDate: "...",
      upgradeDate: "...",
      daysToUpgrade: 21,
      testsBeforeUpgrade: 14
    }

This enables identification of feature adoption patterns linked to upgrades.

---

### 41.5.4 Churn Tracking

Churn measures institute license discontinuation or inactivity.

Key metrics:

| Metric | Description |
|---|---|
|Monthly Churn Rate|Institutes lost per month|
|Churn by Layer|Layer-specific churn behavior|
|Churn by Size|Small vs large institute churn|
|Student Drop-Off Rate|Decline in active student counts|
|Inactive Institutes|No test activity within 30 days|

Churn Rate formula:

    churnRate = lostInstitutes / totalInstitutes

Additional indicators include downgrade events and activity reduction.

---

### 41.5.5 Churn Risk Prediction

The system calculates a predictive churn probability score.

Risk factors:

- No test activity
- No upgrade progression
- Low login frequency
- Low student engagement
- High override frequency
- Declining revenue

Output example:

    {
      instituteId: "...",
      churnProbability: 0.64
    }

This enables proactive vendor intervention.

---

### 41.5.6 Adoption Analytics

Measures real usage relative to licensed capabilities.

Key metrics include:

| Metric | Description |
|---|---|
|Active Student Ratio|Active students vs license limit|
|Teacher Activity Rate|Teachers assigning tests|
|Tests per Month|Testing frequency|
|L2 Feature Usage|Advanced analytics adoption|
|Controlled Mode Usage|Execution discipline tool usage|
|Governance Page Access|Administrative engagement|

Adoption Score calculation:

    adoptionScore =
    (
      activeStudentRatio * 0.3 +
      testFrequencyScore * 0.3 +
      featureUsageScore * 0.2 +
      analyticsEngagementScore * 0.2
    )

Score range: 0–100.

---

### 41.5.7 Calibration Impact Analytics

Evaluates how calibration updates affect platform performance.

Measured impacts include:

- Risk distribution shifts
- Discipline index improvements
- Upgrade rate changes
- Churn reduction
- Controlled Mode effectiveness

Example calibration impact snapshot:

    {
      calibrationVersion: "v1.3",
      upgradeRateChange: 0.08,
      disciplineImprovementAvg: 0.05,
      riskVolatilityReduction: 0.12
    }

Comparisons are made between calibration versions.

---

### 41.5.8 Forecasting and Projection

Forecasting models estimate future growth and revenue trends.

Forecast metrics include:

- Revenue growth projection
- Institute count projection
- Upgrade probability
- Student volume trends
- Infrastructure cost vs revenue ratio

Forecast models use:

- Moving averages
- Simple regression models
- Historical snapshot analysis

Example forecast output:

    projectedARR_6months: 42000000

---

### 41.5.9 Growth Cohort Analysis

Institutes are grouped into cohorts based on onboarding attributes.

Cohort segmentation factors:

- Onboarding month
- License layer at onboarding
- Institute size
- Region
- Calibration version at onboarding

Tracked metrics:

- Retention after 3 months
- Upgrade probability
- Revenue expansion rate

Example insight:

    Institutes onboarded after calibration v1.3 upgrade 18% faster.

---

### 41.5.10 System Health Correlation

Vendor BI correlates technical platform health with business outcomes.

Technical signals:

- System downtime
- Email delivery failures
- AI pipeline delays
- Performance degradation

Business signals:

- Upgrade rate decline
- Engagement reduction
- Revenue stagnation

Correlation dashboards help identify operational issues impacting revenue.

---

## 41.6 Dependencies

Vendor BI depends on aggregated platform collections:

- vendorAggregates
- billingSnapshots
- licenseHistory
- governanceSnapshots
- usageMeter summaries

All BI calculations operate on precomputed aggregates.

---

## 41.7 Error Handling

BI processing failures must not affect operational systems.

Error handling rules:

- Skip incomplete snapshot data
- Log processing failures
- Retry aggregation jobs
- Preserve previous valid snapshot

Example error record:

    {
      jobId,
      stage: "revenueAggregation",
      errorType: "missingSnapshot",
      timestamp,
      retryScheduled: true
    }

---

## 41.8 Summary

The Business Intelligence Layer transforms operational platform data into strategic vendor insights.

Capabilities include:

- Revenue intelligence tracking
- License maturity analysis
- Upgrade funnel analytics
- Churn detection and prediction
- Adoption scoring models
- Calibration impact measurement
- Growth forecasting
- Cohort performance analysis

This layer provides the vendor with actionable insights required to scale the platform, optimize revenue growth, and guide product evolution.



# 42 Unified System Event & Trigger Topology — Master Operational Flow Graph.

## 42.1 Overview
The Unified System Event & Trigger Topology defines the deterministic operational flow across the entire platform. It maps every system event, trigger, write operation, derived computation, and asynchronous process. This topology ensures that all engines operate within clearly defined boundaries and that no circular dependencies exist.

The topology provides a complete lifecycle view of the platform, covering content ingestion, template management, test execution, analytics computation, vendor intelligence generation, and archival transitions.

All system behavior must follow deterministic event-trigger relationships to guarantee auditability, scalability, and operational safety.

---

## 42.2 Key Responsibilities

- Define event-driven boundaries across platform domains
- Establish deterministic trigger flows
- Separate synchronous execution from asynchronous processing
- Prevent circular dependencies between engines
- Ensure analytics computations occur only after submission
- Maintain strict data partitioning across HOT, WARM, and COLD tiers
- Enforce security checks before operational handlers
- Define archive and lifecycle transitions

---

## 42.3 System Event Domains

The architecture is divided into seven event domains.

| Domain | Responsibility |
|---|---|
|Content Domain|Question ingestion and validation|
|Template Domain|Test blueprint creation|
|Assignment Domain|Scheduled test instance generation|
|Session Execution Domain|Live exam session lifecycle|
|Post-Submission Processing Domain|Analytics and behavioral analysis|
|Vendor Intelligence Domain|Platform-level aggregation|
|Archive & Lifecycle Domain|Academic year transitions|

Each domain operates independently but is connected through deterministic triggers.

---

## 42.4 Master Event Flow (High-Level)

System lifecycle overview:

    Question Upload
          ↓
    Template Creation
          ↓
    Assignment Creation
          ↓
    Session Start
          ↓
    Session Active Writes
          ↓
    Session Submission
          ↓
    Analytics Engine
          ↓
    Risk Engine
          ↓
    Pattern Engine
          ↓
    Insights Engine
          ↓
    Governance Snapshot
          ↓
    Vendor Aggregation
          ↓
    Billing Meter Update
          ↓
    Archive (Year End)

---

## 42.5 Content Domain Flow

### Event
ZIP question upload confirmed.

### Trigger
Document creation:

    questions/{questionId}

### Cloud Function Processing

Operations performed:

- Validate question schema
- Normalize tag taxonomy
- Generate search tokens
- Increment chapter distribution counters
- Initialize question analytics document

### Output Collections

| Collection | Purpose |
|---|---|
|questions|Question metadata|
|questionAnalytics|Question performance metrics|
|tagDictionary|Autocomplete metadata|
|chapterDictionary|Chapter reference metadata|
|auditLogs|Upload activity trace|

No student metrics are affected during this stage.

---

## 42.6 Template Domain Flow

### Event
Test template created.

### Trigger

    tests/{testId}

### Processing Steps

- Snapshot difficulty distribution
- Snapshot timing configuration
- Snapshot phase configuration
- Compute template fingerprint
- Initialize template analytics stub
- Write audit log entry

After the first assignment creation, the template structure becomes immutable.

---

## 42.7 Assignment Domain Flow

### Event
Test assigned to a batch.

### Trigger

    runs/{runId}

### Processing Steps

- Snapshot template configuration
- Snapshot license layer
- Snapshot calibration version
- Snapshot risk model version
- Validate allowed execution mode
- Initialize runAnalytics document
- Update usageMeter planned capacity

Initial run state:

    scheduled

---

## 42.8 Session Execution Domain

### Event
Student starts exam session.

### API Endpoint

    POST /exam/start

### Backend Validation

- Verify test window availability
- Verify institute license
- Verify student active status
- Ensure no active session exists

### Session Creation

Create document:

    runs/{runId}/sessions/{sessionId}

Return signed session token.

### Session State Lifecycle

    created → started → active

---

### Periodic Session Writes

Client periodically writes answer batches.

Operations include:

- Answer batch updates
- Heartbeat timestamp updates

No analytics computations occur during active sessions.

---

## 42.9 Session Submission Flow

### Event
Student submits exam.

### API Endpoint

    POST /exam/submit

### Transaction Workflow

1. Validate session not already submitted
2. Lock session
3. Compute raw score
4. Compute accuracy percentage
5. Compute timing metrics
6. Persist final session document
7. Increment run-level sharded counter

### Session State

    submitted

Heavy analytics processing is deferred to asynchronous triggers.

---

## 42.10 Post-Submission Processing Pipeline

Triggered by:

    sessions/{sessionId} update
    status = submitted

Processing occurs asynchronously.

---

### Step A — Run Analytics Engine

Updates:

    runAnalytics/{runId}

Computed metrics include:

- Average raw score
- Average accuracy
- Standard deviation
- Distribution histograms
- Phase adherence averages
- Difficulty performance metrics

---

### Step B — Question Analytics Engine

For each question in the session:

Update:

    questionAnalytics/{questionId}

Sharded increments include:

- Correct attempt count
- Incorrect attempt count
- Average response time
- Overstay rate
- Guess probability

---

### Step C — StudentYearMetrics Engine

Updates:

    studentYearMetrics/{studentId}

Computed rolling metrics:

- Average raw score
- Average accuracy
- Discipline index
- Risk score
- Phase adherence rolling average
- Guess probability
- Controlled mode improvement

---

### Step D — Risk Engine

Triggered by updates to studentYearMetrics.

Computes:

- Risk score
- Risk cluster classification
- Discipline index

Risk snapshots stored with:

    riskModelVersion

---

### Step E — Pattern Engine

Evaluates behavioral patterns:

- Rush detection
- Easy neglect
- Hard bias
- Skip bursts
- Consecutive incorrect answers
- Escalation patterns

Pattern flags stored within studentYearMetrics.

---

### Step F — Insights Engine

Generates insight snapshots:

- Student-level insights
- Run-level insights
- Batch-level insights

Stored in:

    insightSnapshots

---

### Step G — Notification Queue

If notification rules permit:

Create email job:

    emailQueue/{jobId}

Delivery handled asynchronously by email queue processor.

---

## 42.11 Billing and Usage Flow

Triggered by operational events:

- Student activation
- Student archival
- Assignment creation

Updates:

    usageMeter/{cycleId}

Calculated metrics:

- Active students
- Peak student usage
- Billing tier compliance

Stripe webhook events update license status and create license history records.

---

## 42.12 Vendor Aggregation Flow

Nightly scheduled aggregation.

Computed metrics include:

- Institute stability metrics
- Layer distribution
- Adoption score
- Revenue metrics
- Churn probability

Results stored in:

    vendorAggregates/{instituteId}
    vendorRevenueSnapshots/{month}

Vendor aggregates never read raw session collections.

---

## 42.13 Calibration Flow

### Event
Vendor activates new calibration version.

Trigger:

    calibrationVersions/{version}

Processing steps:

- Update calibrationVersion for each institute
- Write calibration history entries

New sessions automatically use updated calibration weights.

Historical sessions remain unchanged.

---

## 42.14 Governance Snapshot Flow

Triggered monthly.

For each institute:

- Aggregate runAnalytics
- Aggregate studentYearMetrics
- Compute stability index
- Compute execution integrity score
- Compute risk distribution

Store immutable snapshot:

    governanceSnapshots/{year_month}

---

## 42.15 Archive Flow (Academic Year)

Triggered manually by administrator.

Archive pipeline:

1. Freeze active runs
2. Export sessions to BigQuery
3. Generate final governance snapshot
4. Reset HOT collections
5. Preserve summary documents
6. Mark academic year archived
7. Write audit log entry

Session data is never deleted.

---

## 42.16 Search Index Flow

Triggered by question creation or update.

Processing:

- Generate search tokens
- Update tagDictionary
- Update chapterDictionary

No full collection scans are required.

---

## 42.17 Simulation Flow

Vendor-triggered simulation environment.

Simulation pipeline:

- Create synthetic institute namespace
- Generate synthetic students
- Generate synthetic sessions
- Trigger analytics pipeline
- Generate simulation report

Simulation operations never affect billing or production metrics.

---

## 42.18 Failure Recovery Flow

Submission failure handling:

- Transaction rollback
- Idempotency key prevents duplicates
- Safe retry permitted

Analytics pipeline failure:

- Retry using Cloud Tasks
- Dead-letter queue for persistent failures
- No impact on student submission confirmation

---

## 42.19 Data Partition Flow

Data partitions enforce system performance and lifecycle management.

| Tier | Data Type |
|---|---|
|HOT|Active sessions, studentYearMetrics, runAnalytics|
|WARM|Completed runs, template analytics|
|COLD|BigQuery session archive, governance snapshots|

Exam portal interacts only with HOT data.

---

## 42.20 Security Enforcement Flow

Every API request passes through mandatory security checks.

Validation sequence:

1. Authentication verification
2. Tenant guard validation
3. Role permission check
4. License validation
5. Layer access check
6. Mode restriction validation

Requests failing any check are rejected before handler execution.

---

## 42.21 Master Topology Summary

Condensed system flow:

    Upload
      ↓
    Question Validation
      ↓
    Template Snapshot
      ↓
    Assignment Snapshot
      ↓
    Session Creation
      ↓
    Session Writes
      ↓
    Submission Transaction
      ↓
    RunAnalytics Update
      ↓
    QuestionAnalytics Update
      ↓
    StudentYearMetrics Update
      ↓
    Risk Engine
      ↓
    Pattern Engine
      ↓
    Insight Snapshot
      ↓
    Email Queue
      ↓
    Vendor Aggregates (Nightly)
      ↓
    Governance Snapshot (Monthly)
      ↓
    Archive (Year End)

All relationships follow deterministic trigger rules.

---

## 42.22 Architectural Completion Summary

The system architecture now includes:

- Multi-tenancy framework
- Role-based access control
- Firestore data model
- Security rules enforcement
- API routing and middleware validation
- Execution engines
- Risk and pattern analysis engines
- AI summary generation
- Calibration system
- Licensing and billing automation
- Vendor governance dashboard
- Feature flag control
- Notification infrastructure
- DevOps deployment model
- Monitoring and logging architecture
- Scaling and cost modeling
- Performance benchmarking framework
- Disaster recovery strategy
- Audit and compliance framework
- CDN asset delivery architecture
- Search indexing system
- Synthetic simulation engine
- Vendor business intelligence layer
- Unified system event topology

This topology completes the deterministic operational design of the platform.




