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

academicYears/{yearId}

auditLogs/{auditId}

calibration/{versionId}

---

# Academic Year Partition

Operational data is partitioned by academic year.

institutes/{instituteId}/academicYears/{yearId}

Subcollections:

runs/{runId}

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