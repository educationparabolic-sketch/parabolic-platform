import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  SubmissionAnalyticsTriggerContext,
  SubmissionAnalyticsTriggerResult,
} from "../types/submissionAnalyticsTrigger";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

interface SessionStateSnapshot {
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

/**
 * Raised when a submitted-session trigger payload is structurally invalid.
 */
class SubmissionAnalyticsTriggerValidationError extends Error {
  /**
   * Creates a validation error for malformed trigger payloads.
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "SubmissionAnalyticsTriggerValidationError";
  }
}

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const toTimestampOrUndefined = (
  value: unknown,
): FirebaseFirestore.Timestamp | undefined => {
  if (value instanceof Timestamp) {
    return value;
  }

  return undefined;
};

const toStatus = (value: unknown): string | undefined =>
  toNonEmptyString(value)?.toLowerCase();

/**
 * Handles Build 39 post-submission analytics trigger orchestration.
 */
export class SubmissionAnalyticsTriggerService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SubmissionAnalyticsTriggerService");

  /**
   * Queues idempotent analytics processing markers for submitted sessions.
   * @param {SubmissionAnalyticsTriggerContext} context Trigger path context.
   * @param {SessionStateSnapshot | undefined} beforeData Session before state.
   * @param {SessionStateSnapshot | undefined} afterData Session after state.
   * @return {Promise<SubmissionAnalyticsTriggerResult>} Trigger outcome.
   */
  public async processSessionSubmissionTransition(
    context: SubmissionAnalyticsTriggerContext,
    beforeData: SessionStateSnapshot | undefined,
    afterData: SessionStateSnapshot | undefined,
  ): Promise<SubmissionAnalyticsTriggerResult> {
    const runAnalyticsPath =
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}/${context.runId}`;
    const studentId = toNonEmptyString(afterData?.studentId);
    const studentYearMetricsPath =
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId ?? "unknown"}`;
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        reason: "status_not_transitioned",
        runAnalyticsPath,
        studentYearMetricsPath,
        triggered: false,
      };
    }

    if (!studentId) {
      throw new SubmissionAnalyticsTriggerValidationError(
        "Submitted session must include a studentId.",
      );
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new SubmissionAnalyticsTriggerValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const resolvedStudentYearMetricsPath =
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`;

    const result = await this.firestore.runTransaction(async (transaction) => {
      const runAnalyticsReference = this.firestore.doc(runAnalyticsPath);
      const studentMetricsReference = this.firestore.doc(
        resolvedStudentYearMetricsPath,
      );

      const [runAnalyticsSnapshot, studentMetricsSnapshot] = await Promise.all([
        transaction.get(runAnalyticsReference),
        transaction.get(studentMetricsReference),
      ]);

      const runAnalyticsLastProcessedSessionId = toNonEmptyString(
        runAnalyticsSnapshot
          .data()?.processingMarkers?.analyticsTrigger?.lastProcessedSessionId,
      );
      const studentMetricsLastProcessedSessionId = toNonEmptyString(
        studentMetricsSnapshot
          .data()?.processingMarkers?.analyticsTrigger?.lastProcessedSessionId,
      );
      const alreadyProcessed =
        runAnalyticsLastProcessedSessionId === context.sessionId &&
        studentMetricsLastProcessedSessionId === context.sessionId;

      if (alreadyProcessed) {
        return {
          idempotent: true,
          reason: "already_processed" as const,
          runAnalyticsPath,
          studentYearMetricsPath: resolvedStudentYearMetricsPath,
          triggered: false,
        };
      }

      const processingMarkerPayload = {
        behavioralPatternDetectionQueuedAt: submittedAt,
        eventId: context.eventId ?? null,
        lastProcessedSessionId: context.sessionId,
        lastProcessedSubmittedAt: submittedAt,
        runAnalyticsQueuedAt: submittedAt,
        studentYearMetricsQueuedAt: submittedAt,
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(
        runAnalyticsReference,
        {
          processingMarkers: {
            analyticsTrigger: processingMarkerPayload,
          },
          runId: context.runId,
        },
        {merge: true},
      );

      transaction.set(
        studentMetricsReference,
        {
          processingMarkers: {
            analyticsTrigger: processingMarkerPayload,
          },
          studentId,
        },
        {merge: true},
      );

      return {
        idempotent: false,
        runAnalyticsPath,
        studentYearMetricsPath: resolvedStudentYearMetricsPath,
        triggered: true,
      };
    });

    if (result.triggered) {
      this.logger.info("Queued post-submission analytics workflows.", {
        eventId: context.eventId,
        instituteId: context.instituteId,
        runId: context.runId,
        runAnalyticsPath: result.runAnalyticsPath,
        sessionId: context.sessionId,
        studentYearMetricsPath: result.studentYearMetricsPath,
        yearId: context.yearId,
      });
    } else {
      this.logger.info("Skipped post-submission analytics workflow trigger.", {
        eventId: context.eventId,
        reason: result.reason,
        sessionId: context.sessionId,
      });
    }

    return result;
  }
}

export const submissionAnalyticsTriggerService =
  new SubmissionAnalyticsTriggerService();
