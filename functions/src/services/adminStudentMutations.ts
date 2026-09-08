/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {identitySessionSecurityService} from "./identitySessionSecurity";
import {
  AdminStudentBatchAssignmentRecord,
  AdminStudentBatchAssignmentServiceResult,
  AdminStudentBatchAssignmentValidatedRequest,
  AdminStudentIdentityMutationResult,
  AdminStudentLifecycleStatus,
  AdminStudentLifecycleUpdateServiceResult,
  AdminStudentLifecycleUpdateValidatedRequest,
  AdminStudentMutationContext,
  AdminStudentMutationDisposition,
  AdminStudentMutationValidationError,
  AdminStudentPhotoReviewDecision,
  AdminStudentPhotoReviewServiceResult,
  AdminStudentPhotoReviewValidatedRequest,
  AdminStudentProfileUpdateServiceResult,
  AdminStudentProfileUpdateValidatedRequest,
  AdminStudentVersionedTarget,
} from "../types/adminStudentMutations";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const MAX_BATCH_ASSIGNMENT_SIZE = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PersistedStudentStatus = AdminStudentLifecycleStatus | "invited";
type StudentIdentityInput = {
  disabled: boolean;
  displayName: string;
  email: string;
};
type ProfileTransactionResult = Omit<
  AdminStudentProfileUpdateServiceResult,
  "auth" | "disposition"
>;
type LifecycleTransactionResult = Omit<
  AdminStudentLifecycleUpdateServiceResult,
  "auth" | "disposition"
>;
type BatchTransactionResult = Omit<
  AdminStudentBatchAssignmentServiceResult,
  "disposition"
>;
type PhotoTransactionResult = Omit<
  AdminStudentPhotoReviewServiceResult,
  "disposition"
>;

interface AdminStudentMutationDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
  sessionSecurity: Pick<
    typeof identitySessionSecurityService,
    "clearClaimsAndRevokeSessions" | "synchronizeClaimsAndRevokeSessions"
  >;
  updateAuthUser: (
    uid: string,
    input: StudentIdentityInput,
  ) => Promise<void>;
}

interface TransactionResult<TResult> {
  disposition: AdminStudentMutationDisposition;
  result: TResult;
}

const LEGAL_LIFECYCLE_TRANSITIONS: Readonly<
  Record<PersistedStudentStatus, readonly AdminStudentLifecycleStatus[]>
> = {
  active: ["inactive", "suspended"],
  archived: [],
  inactive: ["active", "archived", "suspended"],
  invited: ["active", "suspended"],
  suspended: ["active", "archived", "inactive"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maximumLength = 256,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function normalizeOptionalString(
  value: unknown,
  maximumLength = 512,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      `Optional text must be at most ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
}

function normalizeEmail(value: unknown): string {
  const email = normalizeRequiredString(value, "email", 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      "Field \"email\" must be a valid email address.",
    );
  }

  return email;
}

function normalizeLifecycleStatus(value: unknown): AdminStudentLifecycleStatus {
  const status = normalizeRequiredString(value, "status").toLowerCase();
  if (
    status !== "active" &&
    status !== "archived" &&
    status !== "inactive" &&
    status !== "suspended"
  ) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      "Field \"status\" must be active, archived, inactive, or suspended.",
    );
  }

  return status;
}

function normalizePhotoDecision(value: unknown): AdminStudentPhotoReviewDecision {
  const decision = normalizeRequiredString(value, "decision").toLowerCase();
  if (decision !== "unverified" && decision !== "verified") {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      "Field \"decision\" must be unverified or verified.",
    );
  }

  return decision;
}

function normalizeIsoTimestamp(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new AdminStudentMutationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an ISO-8601 timestamp.`,
    );
  }

  return new Date(parsed).toISOString();
}

function toIsoTimestamp(value: unknown): string | null {
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
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCommandAuthority(input: {
  command: string;
  idempotencyKey: string;
  instituteId: string;
  semantics: Record<string, unknown>;
}): {auditId: string; idempotencyKeyHash: string; requestFingerprint: string} {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  const auditId = `student_mutation_${sha256(
    `${input.instituteId}:${input.command}:${idempotencyKeyHash}`,
  ).slice(0, 40)}`;
  const requestFingerprint = sha256(stableJson(input.semantics));

  return {auditId, idempotencyKeyHash, requestFingerprint};
}

function normalizeContext(input: {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
  ipAddress?: unknown;
  userAgent?: unknown;
}): AdminStudentMutationContext {
  const actorRole = normalizeRequiredString(
    input.actorRole,
    "actorRole",
  ).toLowerCase();
  if (actorRole !== "admin") {
    throw new AdminStudentMutationValidationError(
      "FORBIDDEN",
      "Admin Student mutations require the admin role.",
    );
  }

  return {
    actorId: normalizeRequiredString(input.actorId, "actorId"),
    actorRole,
    instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    ipAddress: normalizeOptionalString(input.ipAddress),
    userAgent: normalizeOptionalString(input.userAgent),
  };
}

function normalizeIdempotencyKey(value: unknown): string {
  return normalizeRequiredString(value, "idempotencyKey", 128);
}

function toStudentVersion(data: Record<string, unknown>): number {
  return typeof data.version === "number" &&
    Number.isInteger(data.version) && data.version > 0 ? data.version : 1;
}

function toStudentStatus(data: Record<string, unknown>): PersistedStudentStatus {
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  if (
    status === "active" ||
    status === "archived" ||
    status === "inactive" ||
    status === "invited" ||
    status === "suspended"
  ) {
    return status;
  }

  throw new AdminStudentMutationValidationError(
    "CONFLICT",
    "Student record has an unsupported lifecycle status.",
  );
}

function assertStudentExists(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  studentId: string,
): Record<string, unknown> {
  if (!snapshot.exists || snapshot.get("deleted") === true) {
    throw new AdminStudentMutationValidationError(
      "NOT_FOUND",
      `Student "${studentId}" was not found.`,
    );
  }

  return snapshot.data() ?? {};
}

function assertExpectedVersion(
  data: Record<string, unknown>,
  expectedVersion: number,
  studentId: string,
): number {
  const version = toStudentVersion(data);
  if (version !== expectedVersion) {
    throw new AdminStudentMutationValidationError(
      "CONFLICT",
      `Student "${studentId}" version conflict: expected ` +
        `${expectedVersion}, current version is ${version}.`,
    );
  }

  return version;
}

function readReplayResult<TResult>(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  requestFingerprint: string,
): TResult | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  if (metadata.requestFingerprint !== requestFingerprint) {
    throw new AdminStudentMutationValidationError(
      "CONFLICT",
      "Idempotency key has already been used with a different mutation.",
    );
  }
  if (!isRecord(metadata.result)) {
    throw new AdminStudentMutationValidationError(
      "CONFLICT",
      "Idempotency authority is missing its immutable result.",
    );
  }

  return metadata.result as TResult;
}

function buildAuditDocument(input: {
  actionType: string;
  auditId: string;
  before: Record<string, unknown>;
  command: string;
  context: AdminStudentMutationContext;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  result: Record<string, unknown>;
  targetId: string;
  timestamp: Timestamp;
}): Record<string, unknown> {
  return {
    actionType: input.actionType,
    actorId: input.context.actorId,
    actorRole: input.context.actorRole,
    actorUid: input.context.actorId,
    after: input.result,
    auditId: input.auditId,
    before: input.before,
    entityId: input.targetId,
    entityType: "student",
    instituteId: input.context.instituteId,
    ...(input.context.ipAddress ? {ipAddress: input.context.ipAddress} : {}),
    layer: "L0",
    metadata: {
      command: input.command,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestFingerprint: input.requestFingerprint,
      result: input.result,
      source: "AdminStudentMutationsService",
    },
    targetCollection: STUDENTS_COLLECTION,
    targetId: input.targetId,
    tenantId: input.context.instituteId,
    timestamp: input.timestamp,
    ...(input.context.userAgent ? {userAgent: input.context.userAgent} : {}),
  };
}

function isAuthUserNotFound(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    (error as {code?: unknown}).code === "auth/user-not-found";
}

export class AdminStudentMutationsService {
  constructor(
    private readonly dependencies: AdminStudentMutationDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
      sessionSecurity: identitySessionSecurityService,
      updateAuthUser: async (uid, input) => {
        await getFirebaseAdminApp().auth().updateUser(uid, input);
      },
    },
  ) {}

  public normalizeProfileUpdateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    studentId?: unknown;
    userAgent?: unknown;
  }): AdminStudentProfileUpdateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      email: normalizeEmail(body.email),
      expectedVersion: normalizePositiveInteger(
        body.expectedVersion,
        "expectedVersion",
      ),
      fullName: normalizeRequiredString(body.fullName, "fullName", 160),
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
    };
  }

  public normalizeBatchAssignmentRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
  }): AdminStudentBatchAssignmentValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    if (!Array.isArray(body.students)) {
      throw new AdminStudentMutationValidationError(
        "VALIDATION_ERROR",
        "Field \"students\" must be an array.",
      );
    }
    if (
      body.students.length < 1 ||
      body.students.length > MAX_BATCH_ASSIGNMENT_SIZE
    ) {
      throw new AdminStudentMutationValidationError(
        "VALIDATION_ERROR",
        `Field "students" must contain 1 to ${MAX_BATCH_ASSIGNMENT_SIZE} targets.`,
      );
    }

    const students = body.students.map<AdminStudentVersionedTarget>((value) => {
      if (!isRecord(value)) {
        throw new AdminStudentMutationValidationError(
          "VALIDATION_ERROR",
          "Every batch target must be an object.",
        );
      }
      return {
        expectedVersion: normalizePositiveInteger(
          value.expectedVersion,
          "students[].expectedVersion",
        ),
        studentId: normalizeRequiredString(
          value.studentId,
          "students[].studentId",
        ),
      };
    }).sort((left, right) => left.studentId.localeCompare(right.studentId));
    if (new Set(students.map((student) => student.studentId)).size !==
      students.length) {
      throw new AdminStudentMutationValidationError(
        "VALIDATION_ERROR",
        "Field \"students\" must not contain duplicate Student IDs.",
      );
    }

    return {
      ...normalizeContext(input),
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      students,
      targetBatch: normalizeRequiredString(body.targetBatch, "targetBatch", 120),
    };
  }

  public normalizeLifecycleUpdateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    studentId?: unknown;
    userAgent?: unknown;
  }): AdminStudentLifecycleUpdateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      expectedVersion: normalizePositiveInteger(
        body.expectedVersion,
        "expectedVersion",
      ),
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      reason: normalizeRequiredString(body.reason, "reason", 512),
      status: normalizeLifecycleStatus(body.status),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
    };
  }

  public normalizePhotoReviewRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    studentId?: unknown;
    userAgent?: unknown;
  }): AdminStudentPhotoReviewValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      decision: normalizePhotoDecision(body.decision),
      expectedPhotoCapturedAt: normalizeIsoTimestamp(
        body.expectedPhotoCapturedAt,
        "expectedPhotoCapturedAt",
      ),
      expectedVersion: normalizePositiveInteger(
        body.expectedVersion,
        "expectedVersion",
      ),
      idempotencyKey: normalizeIdempotencyKey(body.idempotencyKey),
      reason: normalizeOptionalString(body.reason),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
    };
  }

  public async updateProfile(
    request: AdminStudentProfileUpdateValidatedRequest,
  ): Promise<AdminStudentProfileUpdateServiceResult> {
    const command = "profile-update";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        email: request.email,
        expectedVersion: request.expectedVersion,
        fullName: request.fullName,
        studentId: request.studentId,
      },
    });
    const studentReference = this.studentReference(
      request.instituteId,
      request.studentId,
    );
    const auditReference = this.auditReference(
      request.instituteId,
      authority.auditId,
    );
    const transactionResult = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<TransactionResult<ProfileTransactionResult>> => {
        const [studentSnapshot, auditSnapshot] = await Promise.all([
          transaction.get(studentReference),
          transaction.get(auditReference),
        ]);
        const replay = readReplayResult<ProfileTransactionResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return {disposition: "replayed", result: replay};
        }

        const data = assertStudentExists(studentSnapshot, request.studentId);
        const currentVersion = assertExpectedVersion(
          data,
          request.expectedVersion,
          request.studentId,
        );
        const timestamp = this.dependencies.now();
        const result: ProfileTransactionResult = {
          auditId: authority.auditId,
          email: request.email,
          fullName: request.fullName,
          studentId: request.studentId,
          updatedAt: timestamp.toDate().toISOString(),
          version: currentVersion + 1,
        };
        transaction.update(studentReference, {
          email: request.email,
          fullName: request.fullName,
          name: request.fullName,
          updatedAt: timestamp,
          updatedBy: request.actorId,
          version: result.version,
        });
        transaction.create(auditReference, buildAuditDocument({
          actionType: "UPDATE_STUDENT_PROFILE",
          auditId: authority.auditId,
          before: {
            email: data.email ?? null,
            fullName: data.fullName ?? data.name ?? null,
            version: currentVersion,
          },
          command,
          context: request,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          requestFingerprint: authority.requestFingerprint,
          result,
          targetId: request.studentId,
          timestamp,
        }));
        return {disposition: "applied", result};
      },
    );
    const auth = await this.reconcileIdentity(
      request.instituteId,
      request.studentId,
    );

    return {...transactionResult.result, auth, disposition: transactionResult.disposition};
  }

  public async assignBatch(
    request: AdminStudentBatchAssignmentValidatedRequest,
  ): Promise<AdminStudentBatchAssignmentServiceResult> {
    const command = "batch-assignment";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        students: request.students,
        targetBatch: request.targetBatch,
      },
    });
    const auditReference = this.auditReference(
      request.instituteId,
      authority.auditId,
    );
    const studentReferences = request.students.map((target) =>
      this.studentReference(request.instituteId, target.studentId));

    const transactionResult = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<TransactionResult<BatchTransactionResult>> => {
        const snapshots = await Promise.all([
          transaction.get(auditReference),
          ...studentReferences.map((reference) => transaction.get(reference)),
        ]);
        const auditSnapshot = snapshots[0];
        const replay = readReplayResult<BatchTransactionResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return {disposition: "replayed", result: replay};
        }

        const records = request.students.map<AdminStudentBatchAssignmentRecord>(
          (target, index) => {
            const data = assertStudentExists(
              snapshots[index + 1],
              target.studentId,
            );
            const version = assertExpectedVersion(
              data,
              target.expectedVersion,
              target.studentId,
            );
            return {
              batch: request.targetBatch,
              previousBatch: normalizeRequiredString(
                data.batchId ?? data.batch,
                `student.${target.studentId}.batch`,
              ),
              studentId: target.studentId,
              version: version + 1,
            };
          },
        );
        const timestamp = this.dependencies.now();
        const result: BatchTransactionResult = {
          auditId: authority.auditId,
          students: records,
          targetBatch: request.targetBatch,
          updatedAt: timestamp.toDate().toISOString(),
        };
        studentReferences.forEach((reference, index) => {
          transaction.update(reference, {
            batch: request.targetBatch,
            batchId: request.targetBatch,
            batchName: request.targetBatch,
            updatedAt: timestamp,
            updatedBy: request.actorId,
            version: records[index].version,
          });
        });
        transaction.create(auditReference, buildAuditDocument({
          actionType: "ASSIGN_STUDENT_BATCH",
          auditId: authority.auditId,
          before: {
            students: records.map((record) => ({
              batch: record.previousBatch,
              studentId: record.studentId,
              version: record.version - 1,
            })),
          },
          command,
          context: request,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          requestFingerprint: authority.requestFingerprint,
          result,
          targetId: `batch:${sha256(records.map((record) =>
            record.studentId).join(":"))}`,
          timestamp,
        }));
        return {disposition: "applied", result};
      },
    );

    return {
      ...transactionResult.result,
      disposition: transactionResult.disposition,
    };
  }

  public async updateLifecycle(
    request: AdminStudentLifecycleUpdateValidatedRequest,
  ): Promise<AdminStudentLifecycleUpdateServiceResult> {
    const command = "lifecycle-update";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        expectedVersion: request.expectedVersion,
        reason: request.reason,
        status: request.status,
        studentId: request.studentId,
      },
    });
    const studentReference = this.studentReference(
      request.instituteId,
      request.studentId,
    );
    const auditReference = this.auditReference(
      request.instituteId,
      authority.auditId,
    );
    const transactionResult = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<TransactionResult<LifecycleTransactionResult>> => {
        const [studentSnapshot, auditSnapshot] = await Promise.all([
          transaction.get(studentReference),
          transaction.get(auditReference),
        ]);
        const replay = readReplayResult<LifecycleTransactionResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return {disposition: "replayed", result: replay};
        }

        const data = assertStudentExists(studentSnapshot, request.studentId);
        const currentVersion = assertExpectedVersion(
          data,
          request.expectedVersion,
          request.studentId,
        );
        const previousStatus = toStudentStatus(data);
        if (!LEGAL_LIFECYCLE_TRANSITIONS[previousStatus].includes(request.status)) {
          throw new AdminStudentMutationValidationError(
            "CONFLICT",
            `Cannot transition Student "${request.studentId}" from ` +
              `${previousStatus} to ${request.status}.`,
          );
        }
        const timestamp = this.dependencies.now();
        const result: LifecycleTransactionResult = {
          auditId: authority.auditId,
          previousStatus,
          status: request.status,
          studentId: request.studentId,
          updatedAt: timestamp.toDate().toISOString(),
          version: currentVersion + 1,
        };
        transaction.update(studentReference, {
          lifecycleReason: request.reason,
          status: request.status,
          statusChangedAt: timestamp,
          statusChangedBy: request.actorId,
          updatedAt: timestamp,
          updatedBy: request.actorId,
          version: result.version,
        });
        transaction.create(auditReference, buildAuditDocument({
          actionType: "UPDATE_STUDENT_LIFECYCLE",
          auditId: authority.auditId,
          before: {status: previousStatus, version: currentVersion},
          command,
          context: request,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          requestFingerprint: authority.requestFingerprint,
          result: {...result, reason: request.reason},
          targetId: request.studentId,
          timestamp,
        }));
        return {disposition: "applied", result};
      },
    );
    const auth = await this.reconcileIdentity(
      request.instituteId,
      request.studentId,
    );

    return {...transactionResult.result, auth, disposition: transactionResult.disposition};
  }

  public async reviewPhoto(
    request: AdminStudentPhotoReviewValidatedRequest,
  ): Promise<AdminStudentPhotoReviewServiceResult> {
    const command = "photo-review";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        decision: request.decision,
        expectedPhotoCapturedAt: request.expectedPhotoCapturedAt,
        expectedVersion: request.expectedVersion,
        reason: request.reason ?? null,
        studentId: request.studentId,
      },
    });
    const studentReference = this.studentReference(
      request.instituteId,
      request.studentId,
    );
    const auditReference = this.auditReference(
      request.instituteId,
      authority.auditId,
    );
    const transactionResult = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<TransactionResult<PhotoTransactionResult>> => {
        const [studentSnapshot, auditSnapshot] = await Promise.all([
          transaction.get(studentReference),
          transaction.get(auditReference),
        ]);
        const replay = readReplayResult<PhotoTransactionResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return {disposition: "replayed", result: replay};
        }

        const data = assertStudentExists(studentSnapshot, request.studentId);
        const currentVersion = assertExpectedVersion(
          data,
          request.expectedVersion,
          request.studentId,
        );
        const photoCapturedAt = toIsoTimestamp(
          data.identityPhotoCapturedAt ?? data.livePhotoCapturedAt,
        );
        if (!photoCapturedAt) {
          throw new AdminStudentMutationValidationError(
            "CONFLICT",
            `Student "${request.studentId}" has no identity photo to review.`,
          );
        }
        if (photoCapturedAt !== request.expectedPhotoCapturedAt) {
          throw new AdminStudentMutationValidationError(
            "CONFLICT",
            "Identity photo changed after the review was opened.",
          );
        }
        const timestamp = this.dependencies.now();
        const result: PhotoTransactionResult = {
          auditId: authority.auditId,
          decision: request.decision,
          photoCapturedAt,
          reviewedAt: timestamp.toDate().toISOString(),
          studentId: request.studentId,
          version: currentVersion + 1,
        };
        transaction.update(studentReference, {
          identityPhotoReviewDecision: request.decision,
          identityPhotoReviewReason: request.reason ?? null,
          identityPhotoReviewedAt: timestamp,
          identityPhotoReviewedBy: request.actorId,
          identityPhotoVerified: request.decision === "verified",
          livePhotoVerified: request.decision === "verified",
          updatedAt: timestamp,
          updatedBy: request.actorId,
          version: result.version,
        });
        transaction.create(auditReference, buildAuditDocument({
          actionType: "REVIEW_STUDENT_PHOTO",
          auditId: authority.auditId,
          before: {
            decision: data.identityPhotoReviewDecision ??
              (data.identityPhotoVerified === true ||
                data.livePhotoVerified === true ? "verified" : "unverified"),
            photoCapturedAt,
            version: currentVersion,
          },
          command,
          context: request,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          requestFingerprint: authority.requestFingerprint,
          result: {...result, reason: request.reason ?? null},
          targetId: request.studentId,
          timestamp,
        }));
        return {disposition: "applied", result};
      },
    );

    return {
      ...transactionResult.result,
      disposition: transactionResult.disposition,
    };
  }

  private studentReference(instituteId: string, studentId: string) {
    return this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION)
      .doc(studentId);
  }

  private auditReference(instituteId: string, auditId: string) {
    return this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(AUDIT_LOGS_COLLECTION)
      .doc(auditId);
  }

  private async reconcileIdentity(
    instituteId: string,
    studentId: string,
  ): Promise<AdminStudentIdentityMutationResult> {
    const snapshot = await this.studentReference(instituteId, studentId).get();
    const data = assertStudentExists(snapshot, studentId);
    const status = toStudentStatus(data);
    const displayName = normalizeRequiredString(
      data.fullName ?? data.name,
      "student.fullName",
      160,
    );
    const email = normalizeEmail(data.email);
    const disabled = status === "archived" || status === "inactive";

    try {
      await this.dependencies.updateAuthUser(studentId, {
        disabled,
        displayName,
        email,
      });
    } catch (error) {
      if (isAuthUserNotFound(error)) {
        return {
          claimsSynchronized: null,
          refreshTokensRevoked: false,
          userMissing: true,
          userUpdated: false,
        };
      }
      throw error;
    }

    const securityResult = disabled ?
      await this.dependencies.sessionSecurity.clearClaimsAndRevokeSessions(
        studentId,
      ) :
      await this.dependencies.sessionSecurity.synchronizeClaimsAndRevokeSessions({
        instituteId,
        uid: studentId,
      });

    return {
      claimsSynchronized: securityResult.userMissing ? null : true,
      refreshTokensRevoked: securityResult.refreshTokensRevoked,
      userMissing: securityResult.userMissing,
      userUpdated: true,
    };
  }
}

export const adminStudentMutationsService =
  new AdminStudentMutationsService();
