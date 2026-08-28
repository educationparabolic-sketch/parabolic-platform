# Firestore Schema Reference

This document provides a simplified reference of the Firestore data hierarchy.

The authoritative schema definition exists in:

3_Core_Architectures.md  
Section: "Complete Firestore Tree Schema — Exact Field-Level Specification"

All generated code must follow that specification.

This document is intended as a quick reference for developers and AI coding agents.

---

# Root-Level Collections

The following collections exist at the Firestore root.

vendorConfig/{docId}

vendorAggregates/{aggregateId}

globalCalibration/{versionId}

emailQueue/{emailId}

auditLogs/{logId}

systemFlags/{flagId}

These collections support vendor infrastructure and system services.

---

# Institute Namespace

All institute-scoped data must exist under:

institutes/{instituteId}

No institute data may exist outside this namespace.

Example:

institutes/{instituteId}/students/{studentId}

Incorrect example:

students/{studentId}

---

# Institute Structure Overview

institutes/{instituteId}

Subcollections:

license/main

students/{studentId}

questionBank/{questionId}

tests/{testId}

tests/{testId}/versionSnapshots/{version}

academicYears/{yearId}

auditLogs/{auditId}

Template publish/archive audit IDs are deterministic per institute, template, command, and expected version. The lifecycle status update and immutable `ACTIVATE_TEST_TEMPLATE` or `ARCHIVE_TEST_TEMPLATE` audit document are committed in the same server transaction.

calibration/{versionId}

---

# Academic Year Partition

Operational data is partitioned by academic year.

institutes/{instituteId}/academicYears/{yearId}

Subcollections:

runs/{runId}

Authoritative Admin-created run IDs are deterministic hashes of institute,
active academic year, and the hashed idempotency key. Scheduled run documents
store the canonical template ID/version and immutable question/config snapshots,
recipient IDs/count, canonical mode, schedule/timezone, attempt/grace/shuffle and
proctoring policy, plus hashed idempotency/request fingerprints. Exact retries
return the existing run; key reuse with different semantics is rejected, and
the template `totalRuns` counter advances only on the first transaction.

Admin run reads resolve the current academic year from the authenticated
institute, never accept an institute or year override from the browser, and
read only this collection. Lists are bounded to 50 records, ordered by
`createdAt DESC, __name__ DESC`, and use an opaque cursor; optional status
filtering uses the `runs(status ASC, createdAt DESC, __name__ DESC)` composite
index. Detail reads return not found for IDs outside that tenant/year boundary.

Student summary reads derive institute, Student ID, and license layer from the
verified identity, require the matching active non-deleted Student document,
and resolve the current operational academic year on the server. Dashboard
metrics read only `studentYearMetrics/{studentId}` and upcoming tests query only
runs whose `recipientStudentIds` contain that Student, whose mode is allowed by
the identity license, and whose scheduled window is still upcoming. My Tests
applies the same recipient/mode boundary with bounded status/page reads;
`cancelled` and `stopped` runs form the archived summary view. The public
projection contains run and metric summaries only and never reads or returns
session documents or raw question data.

Student Performance reads only the identity Student's current-year
`studentYearMetrics/{studentId}` summary and returns a bounded chronological
timeline. Fields above the identity license layer are removed or zeroed, and
the live client does not substitute fixture data when the summary is empty.
Student Insights requires L1 or higher and reads only bounded current-year
`insightSnapshots` owned by the identity Student, together with summary metrics.

The Student Solutions endpoint is the narrow exception to the summary-only
rule. It may read question and session documents only after proving that the
requested test resolves to a current-year run assigned to the identity Student,
that the run mode is permitted by the identity license, that the run is
completed and its solution-release policy has been reached, and that exactly
one submitted session belongs to that Student. Its response is a bounded,
solution-safe projection containing only the released answer material and the
Student's selected response; raw question and session objects are never
returned.

These Student reads use three collection-scoped `runs` composites:

- `recipientStudentIds ARRAY_CONTAINS, mode ASC, startWindow DESC, __name__ DESC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, startWindow ASC, __name__ ASC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, startWindow DESC, __name__ DESC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, testId ASC`

Student insight reads use the collection-scoped composite:

- `insightSnapshots(snapshotType ASC, studentId ASC, sourceSubmittedAt DESC, __name__ DESC)`

runAnalytics/{runId}

studentYearMetrics/{studentId}

templateAnalytics/{testId}

governanceSnapshots/{monthId}

---

# Run Execution Hierarchy

Exam execution follows this strict hierarchy:

institutes/{instituteId}
  academicYears/{yearId}
    runs/{runId}
      sessions/{sessionId}

This hierarchy must never be altered.

---

# Session Execution Records

sessions/{sessionId} documents store full student attempt data.

Important fields include:

studentId  
status  
startedAt  
submittedAt  
rawScorePercent  
accuracyPercent  
disciplineIndex  
riskState  
answerMap  

These documents represent immutable exam execution records.

---

# Analytics Collections

Analytics engines must read from summary collections rather than raw session data.

Summary collections include:

runAnalytics/{runId}

studentYearMetrics/{studentId}

templateAnalytics/{testId}

These collections store aggregated metrics.

---

# Governance Data

Monthly governance indicators are stored in:

institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{monthId}

These documents summarize institutional stability and performance metrics.

---

# Calibration Collections

Global calibration models:

globalCalibration/{versionId}

Institute calibration overrides:

institutes/{instituteId}/calibration/{versionId}

Calibration versions influence risk scoring and behavioral analysis.

---

# Vendor Aggregates

Vendor analytics operate on cross-institute summary data.

vendorAggregates/monthly/{monthId}

These documents contain global metrics without exposing raw institute data.

---

# Pricing Plans Configuration

Pricing plans are defined as vendor-controlled configuration.

Location:

vendorConfig/pricingPlans/{planId}

Example documents:

vendorConfig/pricingPlans/L0
vendorConfig/pricingPlans/L1
vendorConfig/pricingPlans/L2
vendorConfig/pricingPlans/L3

Fields:

{
  planId: string,
  name: string,
  basePriceMonthly: number,
  pricePerStudent: number,
  studentLimit: number,
  featureFlags: {
    adaptivePhase: boolean,
    controlledMode: boolean,
    hardMode: boolean,
    governanceAccess: boolean
  },
  createdAt: timestamp
}

Billing engines must read pricing configuration from this collection.

Pricing must never be hardcoded inside backend logic.



# Schema Rules

All generated code must follow these rules:

1. Institute data must exist only under:

   institutes/{instituteId}

2. Exam execution hierarchy must follow:

   institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

3. Analytics must read summary collections instead of session collections.

4. Root-level collections must remain reserved for vendor infrastructure.

5. Firestore collection paths must match the architecture specification.
