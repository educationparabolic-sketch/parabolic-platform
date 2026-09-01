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
const PROCESSING_MARKERS_COLLECTION = "processingMarkers";
const RESULT_PROPAGATION_RETRY_AFTER_SECONDS = 2;

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

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

const hasQueuedMarker = (value: unknown): boolean => {
  if (!isPlainObject(value) || !isPlainObject(value.analyticsTrigger)) {
    return false;
  }
  return value.analyticsTrigger.queued === true;
};

const buildProcessingPropagation = (
  currentData: FirebaseFirestore.DocumentData | undefined,
  sessionId: string,
  submittedAt: FirebaseFirestore.Timestamp,
): Record<string, unknown> => {
  const current = isPlainObject(currentData?.resultPropagation) ?
    currentData.resultPropagation :
    undefined;
  const currentSubmittedAt = toTimestampOrUndefined(current?.submittedAt);
  const currentSessionId = toNonEmptyString(current?.sessionId);
  const currentState = toNonEmptyString(current?.state);

  if (
    currentSubmittedAt &&
    currentSubmittedAt.toMillis() > submittedAt.toMillis()
  ) {
    return {};
  }
  if (currentSessionId === sessionId && currentState === "available") {
    return {};
  }

  return {
    resultPropagation: {
      retryAfterSeconds: RESULT_PROPAGATION_RETRY_AFTER_SECONDS,
      sessionId,
      state: "processing",
      submittedAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
};

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
      const runMarkerReference = runAnalyticsReference
        .collection(PROCESSING_MARKERS_COLLECTION)
        .doc(context.sessionId);
      const studentMarkerReference = studentMetricsReference
        .collection(PROCESSING_MARKERS_COLLECTION)
        .doc(context.sessionId);

      const [
        runAnalyticsSnapshot,
        studentMetricsSnapshot,
        runMarkerSnapshot,
        studentMarkerSnapshot,
      ] = await Promise.all([
        transaction.get(runAnalyticsReference),
        transaction.get(studentMetricsReference),
        transaction.get(runMarkerReference),
        transaction.get(studentMarkerReference),
      ]);

      const alreadyProcessed = hasQueuedMarker(runMarkerSnapshot.data()) &&
        hasQueuedMarker(studentMarkerSnapshot.data());

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
          ...buildProcessingPropagation(
            runAnalyticsSnapshot.data(),
            context.sessionId,
            submittedAt,
          ),
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
          ...buildProcessingPropagation(
            studentMetricsSnapshot.data(),
            context.sessionId,
            submittedAt,
          ),
          processingMarkers: {
            analyticsTrigger: processingMarkerPayload,
          },
          studentId,
        },
        {merge: true},
      );

      transaction.set(runMarkerReference, {
        analyticsTrigger: {
          eventId: context.eventId ?? null,
          queued: true,
          queuedAt: submittedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        sessionId: context.sessionId,
        submittedAt,
      }, {merge: true});

      transaction.set(studentMarkerReference, {
        analyticsTrigger: {
          eventId: context.eventId ?? null,
          queued: true,
          queuedAt: submittedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        sessionId: context.sessionId,
        submittedAt,
      }, {merge: true});

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

  /**
   * Marks the newest queued result as available after the full pipeline.
   * Older retries cannot overwrite a newer processing state.
   * @param {SubmissionAnalyticsTriggerContext} context Trigger path context.
   * @param {SessionStateSnapshot | undefined} afterData Submitted session.
   */
  public async markResultPropagationAvailable(
    context: SubmissionAnalyticsTriggerContext,
    afterData: SessionStateSnapshot | undefined,
  ): Promise<void> {
    const studentId = toNonEmptyString(afterData?.studentId);
    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);
    if (!studentId || !submittedAt) {
      throw new SubmissionAnalyticsTriggerValidationError(
        "Available result propagation requires studentId and submittedAt.",
      );
    }

    const runAnalyticsReference = this.firestore.doc(
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}/${context.runId}`,
    );
    const studentMetricsReference = this.firestore.doc(
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`,
    );
    const markerReferences = [runAnalyticsReference, studentMetricsReference]
      .map((reference) => reference
        .collection(PROCESSING_MARKERS_COLLECTION)
        .doc(context.sessionId));

    await this.firestore.runTransaction(async (transaction) => {
      const [runSnapshot, studentSnapshot] = await Promise.all([
        transaction.get(runAnalyticsReference),
        transaction.get(studentMetricsReference),
      ]);
      const summaryEntries = [
        [runAnalyticsReference, runSnapshot],
        [studentMetricsReference, studentSnapshot],
      ] as const;

      for (const [reference, snapshot] of summaryEntries) {
        const current = isPlainObject(snapshot.data()?.resultPropagation) ?
          snapshot.data()?.resultPropagation as Record<string, unknown> :
          undefined;
        if (toNonEmptyString(current?.sessionId) !== context.sessionId) {
          continue;
        }
        transaction.set(reference, {
          resultPropagation: {
            retryAfterSeconds: 0,
            sessionId: context.sessionId,
            state: "available",
            submittedAt,
            updatedAt: FieldValue.serverTimestamp(),
          },
        }, {merge: true});
      }

      markerReferences.forEach((reference) => transaction.set(reference, {
        pipeline: {
          availableAt: FieldValue.serverTimestamp(),
          completed: true,
          eventId: context.eventId ?? null,
        },
      }, {merge: true}));
    });
  }
}

export const submissionAnalyticsTriggerService =
  new SubmissionAnalyticsTriggerService();
