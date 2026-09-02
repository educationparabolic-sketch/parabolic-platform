import {createHash} from "crypto";
import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  identitySessionSecurityService,
} from "./identitySessionSecurity";
import {
  StudentSoftDeleteResult,
  StudentSoftDeleteValidatedRequest,
  StudentSoftDeleteValidationError,
} from "../types/studentSoftDelete";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const SESSIONS_COLLECTION = "sessions";
const AUDIT_LOGS_COLLECTION = "auditLogs";

interface StudentSoftDeleteDependencies {
  firestore: FirebaseFirestore.Firestore;
  sessionSecurity?: Pick<
    typeof identitySessionSecurityService,
    "clearClaimsAndRevokeSessions"
  >;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new StudentSoftDeleteValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new StudentSoftDeleteValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maxLength} characters.`,
    );
  }

  return normalized;
};

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizePositiveInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new StudentSoftDeleteValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const toStudentVersion = (data: Record<string, unknown>): number =>
  typeof data.version === "number" &&
  Number.isInteger(data.version) && data.version > 0 ? data.version : 1;

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return null;
};

const buildAuthority = (request: StudentSoftDeleteValidatedRequest) => {
  const idempotencyKeyHash = sha256(request.idempotencyKey);
  return {
    auditId: `student_soft_delete_${sha256(
      `${request.instituteId}:${idempotencyKeyHash}`,
    ).slice(0, 40)}`,
    idempotencyKeyHash,
    requestFingerprint: sha256(stableJson({
      expectedVersion: request.expectedVersion,
      reason: request.reason,
      studentId: request.studentId,
    })),
  };
};

const readReplayResult = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  requestFingerprint: string,
): StudentSoftDeleteResult | null => {
  if (!snapshot.exists) {
    return null;
  }
  const metadata = snapshot.get("metadata") as Record<string, unknown> | null;
  if (!metadata || metadata.requestFingerprint !== requestFingerprint) {
    throw new StudentSoftDeleteValidationError(
      "CONFLICT",
      "Idempotency key has already been used for a different deletion.",
    );
  }
  const result = metadata.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new StudentSoftDeleteValidationError(
      "CONFLICT",
      "Deletion idempotency authority is missing its immutable result.",
    );
  }

  return {
    ...(result as StudentSoftDeleteResult),
    disposition: "replayed",
  };
};

/** Soft-deletes eligible student identities while preserving history. */
export class StudentSoftDeleteService {
  private readonly logger = createLogger("StudentSoftDeleteService");

  constructor(
    private readonly dependencies: StudentSoftDeleteDependencies = {
      firestore: getFirestore(),
      sessionSecurity: identitySessionSecurityService,
    },
  ) {}

  public normalizeRequest(
    input: Partial<StudentSoftDeleteValidatedRequest>,
  ): StudentSoftDeleteValidatedRequest {
    const actorRole = normalizeRequiredString(input.actorRole, "actorRole")
      .toLowerCase();
    if (actorRole !== "admin") {
      throw new StudentSoftDeleteValidationError(
        "FORBIDDEN",
        "Student soft deletion requires the admin role.",
      );
    }

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole,
      expectedVersion: normalizePositiveInteger(
        input.expectedVersion,
        "expectedVersion",
      ),
      idempotencyKey: normalizeRequiredString(
        input.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      reason: normalizeRequiredString(input.reason, "reason", 500),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public async softDeleteStudent(
    request: StudentSoftDeleteValidatedRequest,
  ): Promise<StudentSoftDeleteResult> {
    const normalized = this.normalizeRequest(request);
    const authority = buildAuthority(normalized);
    const institutePrefix =
      `${INSTITUTES_COLLECTION}/${normalized.instituteId}/academicYears/`;
    const studentReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(normalized.instituteId)
      .collection(STUDENTS_COLLECTION)
      .doc(normalized.studentId);
    const auditReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(normalized.instituteId)
      .collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);
    const sessionQuery = this.dependencies.firestore
      .collectionGroup(SESSIONS_COLLECTION)
      .where("studentId", "==", normalized.studentId);

    const result = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<StudentSoftDeleteResult> => {
        const [auditSnapshot, studentSnapshot, sessionsSnapshot] =
          await Promise.all([
            transaction.get(auditReference),
            transaction.get(studentReference),
            transaction.get(sessionQuery),
          ]);
        const replay = readReplayResult(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return replay;
        }
        if (!studentSnapshot.exists) {
          throw new StudentSoftDeleteValidationError(
            "NOT_FOUND",
            "Student record was not found for soft delete.",
          );
        }

        const studentData = studentSnapshot.data() ?? {};
        const currentVersion = toStudentVersion(studentData);
        if (currentVersion !== normalized.expectedVersion) {
          throw new StudentSoftDeleteValidationError(
            "CONFLICT",
            `Student "${normalized.studentId}" version conflict: expected ` +
              `${normalized.expectedVersion}, current version is ` +
              `${currentVersion}.`,
          );
        }
        const matchingSessions = sessionsSnapshot.docs.filter((document) =>
          document.ref.path.startsWith(institutePrefix),
        );
        if (matchingSessions.length > 0) {
          throw new StudentSoftDeleteValidationError(
            "CONFLICT",
            "Student deletion is allowed only when totalRuns is 0.",
          );
        }

        const alreadyDeleted = studentData.deleted === true;
        const deletedAt = alreadyDeleted ?
          toIsoString(studentData.deletedAt) ?? new Date().toISOString() :
          new Date().toISOString();
        const nextVersion = alreadyDeleted ? currentVersion : currentVersion + 1;
        const appliedResult: StudentSoftDeleteResult = {
          alreadyDeleted,
          analyticsPreserved: true,
          auditId: authority.auditId,
          deletedAt,
          disposition: "applied",
          sessionHistoryPreserved: true,
          studentId: normalized.studentId,
          version: nextVersion,
        };
        const timestamp = Timestamp.fromDate(new Date(deletedAt));

        if (!alreadyDeleted) {
          transaction.set(studentReference, {
            deleted: true,
            deletedAt: timestamp,
            deletedBy: normalized.actorId,
            deletionReason: normalized.reason,
            status: "archived",
            updatedAt: timestamp,
            version: nextVersion,
          }, {merge: true});
        }
        transaction.create(auditReference, {
          actionType: "SOFT_DELETE_STUDENT",
          actorId: normalized.actorId,
          actorRole: normalized.actorRole,
          actorUid: normalized.actorId,
          after: appliedResult,
          auditId: authority.auditId,
          before: {
            deleted: alreadyDeleted,
            status: studentData.status ?? null,
            version: currentVersion,
          },
          entityId: normalized.studentId,
          entityType: "student",
          instituteId: normalized.instituteId,
          ...(normalized.ipAddress ? {ipAddress: normalized.ipAddress} : {}),
          layer: "L0",
          metadata: {
            command: "soft-delete",
            idempotencyKeyHash: authority.idempotencyKeyHash,
            reason: normalized.reason,
            requestFingerprint: authority.requestFingerprint,
            result: appliedResult,
            source: "StudentSoftDeleteService",
          },
          targetCollection: STUDENTS_COLLECTION,
          targetId: normalized.studentId,
          tenantId: normalized.instituteId,
          timestamp,
          ...(normalized.userAgent ? {userAgent: normalized.userAgent} : {}),
        });

        return appliedResult;
      },
    );

    await (
      this.dependencies.sessionSecurity ?? identitySessionSecurityService
    ).clearClaimsAndRevokeSessions(normalized.studentId);

    this.logger.info("Student soft delete processed.", {
      alreadyDeleted: result.alreadyDeleted,
      disposition: result.disposition,
      instituteId: normalized.instituteId,
      studentId: normalized.studentId,
    });

    return result;
  }
}

export const studentSoftDeleteService = new StudentSoftDeleteService();
