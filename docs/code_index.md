# CODEBASE INDEX

This document describes the structure of the platform codebase.

It serves as a navigation guide for AI coding agents and developers.

AI agents must consult this file before generating or modifying code.

The repository follows a **monorepo architecture** supporting multiple portals and shared backend services.

---

# REPOSITORY ROOT

Root folder:

parabolic-platform/

Primary directories:

apps/  
functions/  
shared/  
config/  
docs/

Each directory has a specific responsibility.

---

# FRONTEND APPLICATIONS

Location:

apps/

This directory contains all frontend portals.

Structure:

apps/
│
├── admin
├── student
├── exam
└── vendor

Each portal is an independent React application.

Technology stack:

React  
TypeScript  
Vite  
React Router  
Firebase Authentication

---

# ADMIN PORTAL

Location:

apps/admin/

Purpose:

Institute administrators and teachers manage students, tests, assignments, analytics, and insights.

Key features:

- student management
- test template creation
- assignment scheduling
- analytics dashboards
- governance tools

Build output:

apps/admin/dist

Firebase Hosting serves this directory.

---

# STUDENT PORTAL

Location:

apps/student/

Purpose:

Students access their dashboard, test history, performance analytics, and behavioral insights.

Key features:

- upcoming tests
- past results
- performance trends
- discipline metrics
- AI-generated insights

---

# EXAM PORTAL

Location:

apps/exam/

Purpose:

Dedicated runtime interface for test execution.

Design requirements:

- minimal UI
- high reliability
- answer batching
- timing enforcement
- secure session execution

Exam runtime communicates with backend session APIs.

---

# VENDOR PORTAL

Location:

apps/vendor/

Purpose:

Platform vendor dashboard.

Capabilities:

- institute management
- license management
- calibration deployment
- vendor analytics
- revenue dashboards
- system monitoring

---

# BACKEND SERVICES

Location:

functions/

Purpose:

All backend APIs and server-side logic.

Implemented using:

Firebase Cloud Functions  
Node.js  
TypeScript  
Express middleware

---

# BACKEND STRUCTURE

functions/
│
├── src
│   ├── api
│   ├── middleware
│   ├── services
│   ├── engines
│   ├── triggers
│   ├── utils
│   └── types
│
├── package.json
├── tsconfig.json
└── lib

Directory responsibilities:

api/  
Defines REST endpoints.

middleware/  
Authentication, tenant guard, role guard, license guard.

services/  
Business logic services.

engines/  
Core processing engines such as analytics, timing, risk detection.

triggers/  
Firestore and scheduled Cloud Functions.

utils/  
Reusable helper functions.

types/  
TypeScript type definitions.

---

# SHARED CODE

Location:

shared/

Purpose:

Reusable logic shared between backend and frontend applications.

Examples:

shared/
│
├── types
├── constants
├── utils
└── validation

Typical content:

- shared data models
- validation schemas
- utility helpers
- constant definitions

---

# CONFIGURATION

Location:

config/

Purpose:

Centralized configuration files.

Examples:

config/
│
├── environment.ts
├── feature_flags.ts
├── pricing_plans.json
└── system_constants.ts

These files contain:

- environment variables
- feature configuration
- pricing plans
- system constants

---

# DOCUMENTATION

Location:

docs/

Purpose:

Architecture documentation and AI development governance.

Important documents:

1_System_Summary.md  
2_Portals_Architecture.md  
3_Core_Architectures.md  

architecture_rules.md  
firestore_schema.md  
api_contract.md  

build_plan.md  
build_log.md  
build_dependencies.md  
build_checklist.md  

codex_prompt_template.md  
prompt_library.md  

AI_OPERATING_SYSTEM.md  
AGENT_WORKFLOW.md  

---

# FIREBASE CONFIGURATION

Root configuration files:

firebase.json  
.firebaserc

Purpose:

- Firebase project configuration
- emulator configuration
- hosting configuration

---

# LOCAL DEVELOPMENT

Development workflow:

Run emulators:

firebase emulators:start

Run frontend portal:

npm run dev

Build frontend portal:

npm run build

Deploy functions:

firebase deploy --only functions

Deploy hosting:

firebase deploy --only hosting

---

# AI CODING AGENT RULES

AI agents must follow these rules:

1. Never create files outside the defined directory structure.
2. Always reuse existing modules if available.
3. Place backend APIs inside functions/src/api.
4. Place business logic inside services or engines.
5. Place shared models inside shared/types.
6. Do not modify documentation unless explicitly instructed.

---

# PURPOSE OF THIS DOCUMENT

This index allows any AI coding session to:

- understand repository structure instantly
- place files in correct directories
- avoid duplicate modules
- maintain consistent architecture

This document should be updated if new top-level modules are introduced.