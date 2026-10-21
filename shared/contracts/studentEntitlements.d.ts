/**
 * BWM-043 v2 readers adopted in substeps 4/5; mounted migration is substep 6.
 * See docs/STUDENT_ENTITLEMENT_CONTRACT.md for validation and migration rules.
 * These types describe success-envelope data; they never authorize a request.
 */
import type {
  StudentDashboardResult,
  StudentControlledModeComparison,
  StudentInsightsResult,
  StudentInsightSnapshot,
  StudentLicenseLayer,
  StudentPerformancePoint,
  StudentPerformanceResult,
  StudentTestRecord,
  StudentTestStatus,
} from "./apiDtos.js";
import type {StudentResultReadinessV1} from "./examResilience.js";

export interface StudentCurrentYearScope {
  kind: "current";
  yearId: string;
  tier: "HOT_WARM";
}

export interface StudentHistoryScope {
  kind: "history";
  /** Null only for a history page traversing multiple eligible archived years. */
  yearId: string | null;
  tier: "COLD_SUMMARY";
}

export interface StudentMetricAccess {
  basic: true;
  execution: boolean;
  insights: boolean;
  advanced: boolean;
  controlledComparison: boolean;
  hardTiming: boolean;
}

export interface StudentReadAccess {
  policyVersion: "student-entitlements-v1";
  licenseLayer: StudentLicenseLayer;
  metrics: StudentMetricAccess;
}

export type StudentHistoryReadAccess = Omit<StudentReadAccess, "metrics"> & {
  metrics: {
    basic: true;
    execution: false;
    insights: false;
    advanced: false;
    controlledComparison: false;
    hardTiming: false;
  };
};

export interface StudentCurrentRead {
  contractVersion: 2;
  scope: StudentCurrentYearScope;
  access: StudentReadAccess;
}

/** Exact query keys; identifiers are selectors, never identity/tenant grants. */
export type StudentTestsQueryV2 =
  | {
      scope: "current";
      status?: StudentTestStatus | "all";
      cursor?: string;
      pageSize?: number;
    }
  | {
      scope: "history";
      yearId?: string;
      cursor?: string;
      pageSize?: number;
    };

export interface StudentSolutionsQueryV2 {
  /** Required exact run selector in addition to the existing testId path. */
  runId: string;
  cursor?: string;
  pageSize?: number;
}

export interface StudentCursorPage<T> {
  items: T[];
  nextCursor: string | null;
  /** Remaining source candidates may yield an empty next page after filtering. */
  hasMore: boolean;
}

export type StudentSolutionAvailability =
  | {state: "available"; releasedAt: string}
  | {
      state: "locked";
      reason: "not_completed" | "not_released" | "unavailable";
    };

export interface StudentCurrentTestRecord extends StudentTestRecord {
  currentAcademicYear: true;
  solutionAccess: StudentSolutionAvailability;
}

/** Closed, deliberately separate from current rows: no session or asset fields. */
export interface StudentHistoryRecord {
  academicYear: string;
  currentAcademicYear: false;
  runId: string;
  testId: string;
  testName: string;
  completedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

export type StudentTestsResultV2 =
  | (StudentCurrentRead & {page: StudentCursorPage<StudentCurrentTestRecord>})
  | {
      contractVersion: 2;
      scope: StudentHistoryScope;
      access: StudentHistoryReadAccess;
      page: StudentCursorPage<StudentHistoryRecord>;
    };

type NullableFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] | null;
};

export type StudentDashboardResultV2 = StudentCurrentRead & {resultReadiness: StudentResultReadinessV1} & NullableFields<
  StudentDashboardResult,
  | "disciplineIndex" | "riskState" | "phaseAdherencePercent"
  | "easyNeglectPercent" | "hardBiasPercent" | "timeMisallocationPercent"
  | "behaviorSummaryTag" | "controlledModeImprovementDeltaPercent"
  | "guessProbabilityPercent" | "executionStabilityFlag"
>;

export type StudentPerformancePointV2 = NullableFields<
  StudentPerformancePoint,
  | "riskState" | "timeAllocationBalancePercent" | "phaseAdherencePercent"
  | "guessRatePercent" | "disciplineIndex" | "minTimeViolationPercent"
  | "maxTimeViolationPercent" | "overstayFrequencyPercent"
>;

export type StudentPerformanceResultV2 = StudentCurrentRead & {resultReadiness: StudentResultReadinessV1} & NullableFields<
  Omit<StudentPerformanceResult, "timeline" | "controlledModeComparison">,
  | "disciplineIndex" | "phaseCompliancePercent" | "controlledModeImprovementPercent"
  | "overstayFrequencyPercent" | "guessProbabilityPercent" | "guessProbabilityCluster"
  | "easyNeglectFrequencyPercent" | "hardBiasFrequencyPercent"
  | "timeAllocationBalancePercent"
> & {timeline: StudentPerformancePointV2[];
  controlledModeComparison: (Omit<StudentControlledModeComparison, "maxTimeViolationDeltaPercent"> & {
    maxTimeViolationDeltaPercent: number | null;
  }) | null;
};

export type StudentInsightSnapshotV2 = NullableFields<
  StudentInsightSnapshot, "guessDetectionPercent"
>;

export type StudentInsightsResultV2 = StudentCurrentRead & {resultReadiness: StudentResultReadinessV1} & NullableFields<
  Omit<StudentInsightsResult, "snapshots">,
  "guessDetectionAlertPercent" | "disciplineImprovementSuggestions"
> & {snapshots: StudentInsightSnapshotV2[]};

export interface StudentReleasedSolutionItem {
  questionId: string;
  questionVersion: number;
  questionRevision: number;
  /** Authorized signed HTTPS URL, or null if the snapshot has no image. */
  questionImageUrl: string | null;
  solutionImageUrl: string | null;
  /** Earliest expiry of the signed assets above; null when both are absent. */
  assetsExpireAt: string | null;
  correctAnswer: string;
  studentAnswer: string | null;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}

export interface StudentSolutionsResultV2 extends StudentCurrentRead {
  runId: string;
  testId: string;
  releasedAt: string;
  page: StudentCursorPage<StudentReleasedSolutionItem>;
}
