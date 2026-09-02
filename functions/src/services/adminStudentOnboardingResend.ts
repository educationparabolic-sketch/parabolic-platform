import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminStudentOnboardingResendResult,
  AdminStudentOnboardingResendValidatedRequest,
  AdminStudentOnboardingResendValidationError,
} from "../types/adminStudentOnboardingResend";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const EMAIL_QUEUE_COLLECTION = "emailQueue";
const STUDENT_ONBOARDING_TEMPLATE = "student_onboarding";

const required = (value: unknown, field: string, maximum = 256): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminStudentOnboardingResendValidationError(
      "VALIDATION_ERROR", `Field "${field}" must be a non-empty string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new AdminStudentOnboardingResendValidationError(
      "VALIDATION_ERROR", `Field "${field}" must be at most ${maximum} characters.`,
    );
  }
  return normalized;
};

const optionalEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export class AdminStudentOnboardingResendService {
  constructor(
    private readonly dependencies: {
      firestore: FirebaseFirestore.Firestore;
      getCurrentTimestamp: () => Date;
    } = {
      firestore: getFirestore(),
      getCurrentTimestamp: () => new Date(),
    },
  ) {}

  public normalizeRequest(
    input: Partial<AdminStudentOnboardingResendValidatedRequest> & {
      idempotencyKey?: unknown;
      instituteId?: unknown;
      studentId?: unknown;
    },
  ): AdminStudentOnboardingResendValidatedRequest {
    const actorRole = required(input.actorRole, "actorRole").toLowerCase();
    if (actorRole !== "admin") {
      throw new AdminStudentOnboardingResendValidationError(
        "FORBIDDEN", "Only admin roles can resend student onboarding emails.",
      );
    }
    return {
      actorId: required(input.actorId, "actorId"),
      actorRole,
      idempotencyKey: required(input.idempotencyKey, "idempotencyKey", 200),
      instituteId: required(input.instituteId, "instituteId"),
      studentId: required(input.studentId, "studentId"),
    };
  }

  public async resendOnboardingEmail(
    request: AdminStudentOnboardingResendValidatedRequest,
  ): Promise<AdminStudentOnboardingResendResult> {
    const keyHash = sha256(request.idempotencyKey);
    const authorityHash = sha256(`${request.instituteId}:${keyHash}`).slice(0, 40);
    const auditId = `student_onboarding_resend_${authorityHash}`;
    const jobId = `student_onboarding_${authorityHash}`;
    const fingerprint = sha256(JSON.stringify({studentId: request.studentId}));
    const institute = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId);
    const audit = institute.collection(AUDIT_LOGS_COLLECTION).doc(auditId);
    const student = institute.collection(STUDENTS_COLLECTION).doc(request.studentId);
    const job = this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(jobId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const auditSnapshot = await transaction.get(audit);
      if (auditSnapshot.exists) {
        if (auditSnapshot.get("metadata.requestFingerprint") !== fingerprint) {
          throw new AdminStudentOnboardingResendValidationError(
            "CONFLICT",
            "The idempotency key was already used for a different onboarding resend.",
          );
        }
        const stored = auditSnapshot.get("metadata.result") as
          Omit<AdminStudentOnboardingResendResult, "disposition"> | undefined;
        if (!stored) {
          throw new AdminStudentOnboardingResendValidationError(
            "CONFLICT", "The onboarding resend authority is incomplete.",
          );
        }
        return {...stored, disposition: "replayed"};
      }

      const studentSnapshot = await transaction.get(student);
      if (!studentSnapshot.exists) {
        throw new AdminStudentOnboardingResendValidationError(
          "NOT_FOUND",
          `Student "${request.studentId}" was not found in the current institute roster.`,
        );
      }
      const data = studentSnapshot.data() ?? {};
      const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
      const recipientEmail = optionalEmail(data.email);
      const fullName = typeof data.fullName === "string" && data.fullName.trim() ?
        data.fullName.trim() : typeof data.name === "string" && data.name.trim() ?
          data.name.trim() : request.studentId;
      if (status !== "invited") {
        throw new AdminStudentOnboardingResendValidationError(
          "VALIDATION_ERROR",
          "Onboarding email resend is only available for invited students.",
        );
      }
      if (!recipientEmail) {
        throw new AdminStudentOnboardingResendValidationError(
          "VALIDATION_ERROR",
          "The selected student does not have a valid email address for onboarding resend.",
        );
      }

      const now = this.dependencies.getCurrentTimestamp();
      const queuedAt = now.toISOString();
      const persisted = {
        auditId,
        jobId,
        queuedAt,
        recipientEmail,
        status: "pending" as const,
        studentId: request.studentId,
      };
      const timestamp = Timestamp.fromDate(now);
      transaction.create(job, {
        createdAt: timestamp,
        instituteId: request.instituteId,
        payload: {fullName, instituteId: request.instituteId, studentId: request.studentId},
        recipientEmail,
        retryCount: 0,
        sentAt: null,
        status: "pending",
        subject: STUDENT_ONBOARDING_TEMPLATE,
        templateType: STUDENT_ONBOARDING_TEMPLATE,
      });
      transaction.create(audit, {
        actionType: "RESEND_STUDENT_ONBOARDING",
        actorId: request.actorId,
        actorRole: request.actorRole,
        afterState: {jobId, queuedAt, recipientEmail},
        beforeState: {jobId: null},
        entityId: request.studentId,
        entityType: "student",
        instituteId: request.instituteId,
        metadata: {
          idempotencyKeyHash: keyHash,
          requestFingerprint: fingerprint,
          result: persisted,
        },
        targetCollection: STUDENTS_COLLECTION,
        timestamp,
      });
      return {...persisted, disposition: "applied"};
    });
  }
}

export const adminStudentOnboardingResendService =
  new AdminStudentOnboardingResendService();
