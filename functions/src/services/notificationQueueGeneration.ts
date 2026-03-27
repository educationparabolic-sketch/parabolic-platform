import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  NotificationQueueGenerationContext,
  NotificationQueueGenerationResult,
  NotificationTemplateType,
} from "../types/notificationQueueGeneration";
import {StudentRiskState} from "../types/riskEngine";

const EMAIL_QUEUE_COLLECTION = "emailQueue";
const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

const HIGH_RISK_STATES = new Set<StudentRiskState>([
  "Overextended",
  "Volatile",
]);

const ESCALATED_LEVELS = new Set(["High", "Critical"]);

interface SubmittedSessionSnapshot {
  accuracyPercent?: unknown;
  disciplineIndex?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

interface StudentDocument {
  email?: unknown;
  name?: unknown;
}

interface StudentMetricsDocument {
  escalationLevel?: unknown;
  interventionSuggestion?: unknown;
  patterns?: unknown;
  riskScore?: unknown;
  riskState?: unknown;
}

interface NotificationCandidate {
  jobId: string;
  payload: Record<string, string | number | null>;
  subject: string;
  templateType: NotificationTemplateType;
}

/**
 * Raised when notification queue generation input is structurally invalid.
 */
class NotificationQueueGenerationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "NotificationQueueGenerationValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const toRequiredString = (value: unknown, fieldName: string): string => {
  const normalizedValue = toNonEmptyString(value);

  if (!normalizedValue) {
    throw new NotificationQueueGenerationValidationError(
      `Notification queue field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toStatus = (value: unknown): string | undefined =>
  toNonEmptyString(value)?.toLowerCase();

const toTimestampOrUndefined = (
  value: unknown,
): FirebaseFirestore.Timestamp | undefined => {
  if (value instanceof Timestamp) {
    return value;
  }

  return undefined;
};

const toPercent = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new NotificationQueueGenerationValidationError(
      `Notification queue field "${fieldName}" must be a number ` +
      "between 0 and 100.",
    );
  }

  return Math.round(value * 100) / 100;
};

const toPercentOrUndefined = (value: unknown): number | undefined => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return undefined;
  }

  return Math.round(value * 100) / 100;
};

const toRiskStateOrUndefined = (
  value: unknown,
): StudentRiskState | undefined => {
  const normalizedValue = toNonEmptyString(value);

  if (
    normalizedValue !== "Stable" &&
    normalizedValue !== "Drift-Prone" &&
    normalizedValue !== "Impulsive" &&
    normalizedValue !== "Overextended" &&
    normalizedValue !== "Volatile"
  ) {
    return undefined;
  }

  return normalizedValue;
};

const buildTriggeredPatternSummary = (
  value: unknown,
): string | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const activePatternLabels: string[] = [];

  if (isPlainObject(value.rush) && value.rush.active === true) {
    activePatternLabels.push("rush");
  }
  if (isPlainObject(value.easyNeglect) && value.easyNeglect.active === true) {
    activePatternLabels.push("easyNeglect");
  }
  if (isPlainObject(value.hardBias) && value.hardBias.active === true) {
    activePatternLabels.push("hardBias");
  }
  if (isPlainObject(value.skipBurst) && value.skipBurst.active === true) {
    activePatternLabels.push("skipBurst");
  }
  if (isPlainObject(value.wrongStreak) && value.wrongStreak.active === true) {
    activePatternLabels.push("wrongStreak");
  }

  return activePatternLabels.length > 0 ?
    activePatternLabels.join(",") :
    null;
};

const buildNotificationCandidates = (input: {
  disciplineIndex: number;
  instituteId: string;
  patterns: unknown;
  rawScorePercent: number;
  riskScore?: number;
  riskState?: StudentRiskState;
  runId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  yearId: string;
  escalationLevel?: string;
  accuracyPercent: number;
  interventionSuggestion?: string;
}): NotificationCandidate[] => {
  const candidates: NotificationCandidate[] = [];
  const triggeredPatternSummary = buildTriggeredPatternSummary(input.patterns);
  const hasDisciplineViolation = input.disciplineIndex < 60 ||
    triggeredPatternSummary !== null;
  const hasExceptionalPerformance = input.rawScorePercent >= 85 &&
    input.accuracyPercent >= 85 &&
    input.disciplineIndex >= 80 &&
    !HIGH_RISK_STATES.has(input.riskState ?? "Stable");
  const hasHighRiskAlert = HIGH_RISK_STATES.has(input.riskState ?? "Stable") ||
    ESCALATED_LEVELS.has(input.escalationLevel ?? "");

  if (hasHighRiskAlert) {
    candidates.push({
      jobId:
        `high_risk_student_alert_${input.instituteId}_${input.yearId}_` +
        `${input.runId}_${input.sessionId}_${input.studentId}`,
      payload: {
        escalationLevel: input.escalationLevel ?? null,
        instituteId: input.instituteId,
        interventionSuggestion: input.interventionSuggestion ?? null,
        riskScore: input.riskScore ?? null,
        riskState: input.riskState ?? null,
        runId: input.runId,
        sessionId: input.sessionId,
        studentId: input.studentId,
        studentName: input.studentName,
        yearId: input.yearId,
      },
      subject: "Action required: high-risk test alert",
      templateType: "high_risk_student_alert",
    });
  }

  if (hasExceptionalPerformance) {
    candidates.push({
      jobId:
        "exceptional_performance_recognition_" +
        `${input.instituteId}_${input.yearId}_${input.runId}_` +
        `${input.sessionId}_${input.studentId}`,
      payload: {
        accuracyPercent: input.accuracyPercent,
        disciplineIndex: input.disciplineIndex,
        instituteId: input.instituteId,
        rawScorePercent: input.rawScorePercent,
        runId: input.runId,
        sessionId: input.sessionId,
        studentId: input.studentId,
        studentName: input.studentName,
        yearId: input.yearId,
      },
      subject: "Recognition: exceptional test performance",
      templateType: "exceptional_performance_recognition",
    });
  }

  if (hasDisciplineViolation) {
    candidates.push({
      jobId:
        "discipline_violation_notification_" +
        `${input.instituteId}_${input.yearId}_${input.runId}_` +
        `${input.sessionId}_${input.studentId}`,
      payload: {
        disciplineIndex: input.disciplineIndex,
        escalationLevel: input.escalationLevel ?? null,
        instituteId: input.instituteId,
        runId: input.runId,
        sessionId: input.sessionId,
        studentId: input.studentId,
        studentName: input.studentName,
        triggeredPatterns: triggeredPatternSummary,
        yearId: input.yearId,
      },
      subject: "Attention needed: discipline signal detected",
      templateType: "discipline_violation_notification",
    });
  }

  return candidates;
};

/**
 * Implements Build 47 notification job generation from post-submission
 * insight-aligned metrics.
 */
export class NotificationQueueGenerationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("NotificationQueueGenerationService");

  /**
   * Creates notification queue jobs after a session becomes submitted.
   * @param {NotificationQueueGenerationContext} context Trigger path context.
   * @param {SubmittedSessionSnapshot | undefined} beforeData Previous session.
   * @param {SubmittedSessionSnapshot | undefined} afterData Submitted session.
   * @return {Promise<NotificationQueueGenerationResult>} Queue job outcome.
   */
  public async processSubmittedSession(
    context: NotificationQueueGenerationContext,
    beforeData: SubmittedSessionSnapshot | undefined,
    afterData: SubmittedSessionSnapshot | undefined,
  ): Promise<NotificationQueueGenerationResult> {
    const instituteId = toRequiredString(context.instituteId, "instituteId");
    const yearId = toRequiredString(context.yearId, "yearId");
    const runId = toRequiredString(context.runId, "runId");
    const sessionId = toRequiredString(context.sessionId, "sessionId");
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);
    const studentId = toRequiredString(afterData?.studentId, "studentId");

    const baseJobPath = `${EMAIL_QUEUE_COLLECTION}/`;

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        jobPaths: [],
        reason: "status_not_transitioned",
        triggered: false,
      };
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new NotificationQueueGenerationValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const rawScorePercent = toPercent(
      afterData?.rawScorePercent,
      "rawScorePercent",
    );
    const accuracyPercent = toPercent(
      afterData?.accuracyPercent,
      "accuracyPercent",
    );
    const disciplineIndex = toPercent(
      afterData?.disciplineIndex,
      "disciplineIndex",
    );
    const studentPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${STUDENTS_COLLECTION}/${studentId}`;
    const studentMetricsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`;
    const [studentSnapshot, studentMetricsSnapshot] = await Promise.all([
      this.firestore.doc(studentPath).get(),
      this.firestore.doc(studentMetricsPath).get(),
    ]);

    if (!studentSnapshot.exists || !isPlainObject(studentSnapshot.data())) {
      return {
        idempotent: false,
        jobPaths: [],
        reason: "missing_student_document",
        triggered: false,
      };
    }

    const studentData = studentSnapshot.data() as StudentDocument;
    const recipientEmail = toNonEmptyString(studentData.email);

    if (!recipientEmail) {
      return {
        idempotent: false,
        jobPaths: [],
        reason: "missing_recipient_email",
        triggered: false,
      };
    }

    const studentName = toNonEmptyString(studentData.name) ?? studentId;
    const studentMetricsData = isPlainObject(studentMetricsSnapshot.data()) ?
      studentMetricsSnapshot.data() as StudentMetricsDocument :
      {};
    const riskState = toRiskStateOrUndefined(
      studentMetricsData.riskState ?? afterData?.riskState,
    );
    const riskScore = toPercentOrUndefined(studentMetricsData.riskScore);
    const escalationLevel = toNonEmptyString(
      studentMetricsData.escalationLevel,
    );
    const interventionSuggestion = toNonEmptyString(
      studentMetricsData.interventionSuggestion,
    );
    const candidates = buildNotificationCandidates({
      accuracyPercent,
      disciplineIndex,
      escalationLevel,
      instituteId,
      interventionSuggestion,
      patterns: studentMetricsData.patterns,
      rawScorePercent,
      riskScore,
      riskState,
      runId,
      sessionId,
      studentId,
      studentName,
      yearId,
    });
    const jobPaths = candidates.map(
      (candidate) => baseJobPath + candidate.jobId,
    );

    if (candidates.length === 0) {
      return {
        idempotent: false,
        jobPaths,
        reason: "no_rules_triggered",
        triggered: false,
      };
    }

    const jobReferences = candidates.map((candidate) =>
      this.firestore.doc(`${EMAIL_QUEUE_COLLECTION}/${candidate.jobId}`)
    );

    const transactionResult = await this.firestore.runTransaction(
      async (transaction) => {
        const existingJobs = await transaction.getAll(...jobReferences);

        if (existingJobs.every((snapshot) => snapshot.exists)) {
          return {
            idempotent: true,
            triggered: false,
          };
        }

        candidates.forEach((candidate, index) => {
          if (existingJobs[index]?.exists) {
            return;
          }

          transaction.set(jobReferences[index], {
            createdAt: FieldValue.serverTimestamp(),
            instituteId,
            payload: {
              ...candidate.payload,
              submittedAt: submittedAt.toDate().toISOString(),
            },
            recipientEmail,
            retryCount: 0,
            sentAt: null,
            status: "pending",
            subject: candidate.subject,
            templateType: candidate.templateType,
          });
        });

        return {
          idempotent: false,
          triggered: true,
        };
      },
    );

    if (transactionResult.triggered) {
      this.logger.info("Generated notification queue jobs.", {
        eventId: context.eventId,
        instituteId,
        jobPaths,
        recipientEmail,
        runId,
        sessionId,
        studentId,
        yearId,
      });
    } else {
      this.logger.info("Skipped notification queue generation.", {
        eventId: context.eventId,
        instituteId,
        jobPaths,
        reason: "already_processed",
        runId,
        sessionId,
        studentId,
        yearId,
      });
    }

    return {
      idempotent: transactionResult.idempotent,
      jobPaths,
      reason: transactionResult.idempotent ? "already_processed" : undefined,
      triggered: transactionResult.triggered,
    };
  }
}

export const notificationQueueGenerationService =
  new NotificationQueueGenerationService();
