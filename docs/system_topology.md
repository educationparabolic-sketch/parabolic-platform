# SYSTEM TOPOLOGY

This document describes the complete logical topology of the platform.

It explains how all major subsystems interact across the platform lifecycle.

The topology follows an event-driven architecture built on:

- Firebase Cloud Functions
- Firestore
- scheduled background processors
- API-triggered workflows

The platform consists of the following major domains:

1. Content Domain
2. Template Domain
3. Assignment Domain
4. Session Execution Domain
5. Submission Domain
6. Analytics Domain
7. Insights Domain
8. Vendor Intelligence Domain
9. Billing & Licensing Domain
10. Calibration Domain
11. Archive Domain
12. Event Orchestration Layer

---

# PLATFORM DOMAIN FLOW

The system operates through the following lifecycle.

Question Creation  
→ Template Creation  
→ Test Assignment  
→ Student Session Execution  
→ Submission Processing  
→ Analytics Generation  
→ Insights Generation  
→ Vendor Aggregation  
→ Archive Lifecycle

This sequence represents the full data lifecycle of the platform.

---

# DOMAIN INTERACTION DIAGRAM

Content Domain
    ↓
Template Domain
    ↓
Assignment Domain
    ↓
Session Execution Domain
    ↓
Submission Engine
    ↓
Analytics Engine
    ↓
Insights Engine
    ↓
Vendor Intelligence
    ↓
Archive Lifecycle

Each domain produces data consumed by later domains.

---

# CONTENT DOMAIN

Primary collection:

institutes/{instituteId}/questionBank/{questionId}

Responsibilities:

- question ingestion
- metadata normalization
- tag tokenization
- search indexing

Triggers:

Question creation triggers token index generation.

Outputs:

- searchTokens
- tagDictionary updates
- chapterDictionary updates

---

# TEMPLATE DOMAIN

Primary collection:

institutes/{instituteId}/tests/{testId}

Responsibilities:

- test template configuration
- difficulty distribution
- phase configuration
- timing profiles

Template creation initializes:

templateAnalytics/{testId}

Templates remain immutable once assigned.

---

# ASSIGNMENT DOMAIN

Primary collection:

institutes/{instituteId}/academicYears/{yearId}/runs/{runId}

Responsibilities:

- test distribution
- batch assignment
- session scheduling
- license validation

Assignment creation triggers:

- runAnalytics initialization
- usage metering updates

---

# SESSION EXECUTION DOMAIN

Primary collection:

runs/{runId}/sessions/{sessionId}

Responsibilities:

- session lifecycle management
- answer batching
- timing enforcement
- navigation state

Session state machine:

created  
→ started  
→ active  
→ submitted  
→ expired  
→ terminated

Session writes occur through controlled batching.

---

# SUBMISSION ENGINE

Submission endpoint:

POST /exam/session/{sessionId}/submit

Responsibilities:

- final answer processing
- scoring computation
- discipline metrics
- guess detection

Submission triggers analytics pipelines.

---

# ANALYTICS DOMAIN

Primary analytics engines:

Run Analytics Engine  
Question Analytics Engine  
Student Year Metrics Engine  
Risk Engine  
Pattern Engine

Analytics outputs:

runAnalytics/{runId}

questionAnalytics/{questionId}

studentYearMetrics/{studentId}

---

# INSIGHTS DOMAIN

Insights engine converts analytics data into actionable insights.

Generated outputs:

insightSnapshots

These power:

- student dashboards
- teacher analytics
- risk alerts

Notifications are queued through:

emailQueue

---

# SEARCH SYSTEM

Search uses Firestore indexed queries.

Search tokens stored inside question documents.

Supporting metadata collections:

tagDictionary

chapterDictionary

Autocomplete queries read from these dictionaries.

---

# BILLING & LICENSING DOMAIN

License object location:

institutes/{instituteId}/license/current

Responsibilities:

- enforce platform capabilities
- enforce student limits
- manage billing cycles
- store Stripe subscription references

Billing events originate from Stripe webhooks.

Stripe webhook events update license state.

Billing records stored at:

institutes/{id}/billingRecords/{invoiceId}

---

# USAGE METERING ENGINE

Usage tracked per billing cycle:

institutes/{id}/usage/{cycleId}

Metrics stored:

activeStudentCount  
peakActiveStudents  
overLimit status

Updates occur through:

student state triggers

Daily reconciliation ensures consistency.

---

# CALIBRATION DOMAIN

Calibration models stored at:

globalCalibration/{versionId}

or

institutes/{id}/calibration/{versionId}

Calibration parameters affect:

- risk scoring
- pattern detection
- discipline metrics

Calibration versions are stored in session snapshots for reproducibility.

---

# VENDOR INTELLIGENCE DOMAIN

Vendor-level analytics stored in:

vendorAggregates

Responsibilities:

- revenue analytics
- institute growth analytics
- license distribution analysis
- churn monitoring
- forecasting

Vendor dashboards visualize these aggregates.

---

# GOVERNANCE SNAPSHOT SYSTEM

Monthly governance snapshots stored at:

institutes/{id}/academicYears/{year}/governanceSnapshots/{month}

Metrics include:

- stability index
- discipline trends
- risk cluster distribution
- override frequency

Governance data powers institutional analytics.

---

# ARCHIVE DOMAIN

Academic year archival occurs when a cycle closes.

Archive process:

1. export session data to BigQuery
2. generate final governance snapshot
3. lock academic year
4. mark data as archived

Operational Firestore datasets remain lightweight.

Historical analytics are preserved.

---

# EVENT ORCHESTRATION LAYER

The platform operates through deterministic event flows.

Major triggers include:

questionCreated  
templateCreated  
assignmentCreated  
sessionSubmitted  
analyticsCompleted  
billingWebhookReceived

Each trigger initiates a specific processing pipeline.

Triggers must remain idempotent.

Retry-safe design is mandatory.

---

# DATA FLOW SUMMARY

Question Upload
    ↓
Template Creation
    ↓
Assignment Distribution
    ↓
Session Execution
    ↓
Submission Processing
    ↓
Analytics Computation
    ↓
Insights Generation
    ↓
Vendor Aggregation
    ↓
Archive Lifecycle

This represents the complete lifecycle of platform data.

---

# SYSTEM DESIGN PRINCIPLES

The topology follows several strict principles.

Multi-tenant isolation  
Institute-rooted data partitioning  
Event-driven processing  
Immutable analytics layers  
Snapshot-based execution records  
Deterministic pipeline execution

These principles ensure system scalability and maintainability.

---

# PURPOSE OF THIS DOCUMENT

This document allows developers and AI coding agents to understand:

- how platform subsystems interact
- how data flows across the system
- which events trigger downstream processing

It acts as the master blueprint for platform orchestration.