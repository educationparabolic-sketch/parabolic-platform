/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {adminSettingsService} from "./adminSettings";
import {
  AssignmentCreationConflictError,
  AssignmentCreationValidationError,
  assignmentCreationService,
} from "./assignmentCreation";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminRunsCreateResult,
  AdminRunsDetailRequest,
  AdminRunsDetailResult,
  AdminRunsListRequest,
  AdminRunsListResult,
  AdminRunProctoringPolicy,
  AdminRunRecord,
  AdminRunStatus,
  AdminRunsValidatedRequest,
  AdminRunsValidationError,
} from "../types/adminRuns";
import {AssignmentMode} from "../types/assignmentCreation";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const INSTITUTES_COLLECTION = "institutes";
const RUNS_COLLECTION = "runs";
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 50;

const ALLOWED_MODES = new Set<AssignmentMode>([
  "Controlled",
  "Diagnostic",
  "Hard",
  "Operational",
]);
const ALLOWED_STATUSES = new Set<AdminRunStatus>([
  "active",
  "cancelled",
  "completed",
  "scheduled",
  "stopped",
]);

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeMode(value: unknown): AssignmentMode {
  const mode = normalizeRequiredString(value, "mode") as AssignmentMode;

  if (!ALLOWED_MODES.has(mode)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"mode\" must be one of Operational, Diagnostic, " +
        "Controlled, or Hard.",
    );
  }

  return mode;
}

function normalizeStatus(value: unknown, fieldName = "status"): AdminRunStatus {
  const status = normalizeRequiredString(value, fieldName)
    .toLowerCase() as AdminRunStatus;

  if (!ALLOWED_STATUSES.has(status)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be one of scheduled, active, completed, ` +
        "stopped, or cancelled.",
    );
  }

  return status;
}

function normalizeIsoDate(value: unknown, fieldName: string): string {
  const rawValue = normalizeRequiredString(value, fieldName);
  const parsed = Date.parse(rawValue);

  if (Number.isNaN(parsed)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid ISO date string.`,
    );
  }

  return new Date(parsed).toISOString();
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
}

function normalizeListLimit(value: unknown): number {
  if (typeof value === "undefined") {
    return DEFAULT_LIST_LIMIT;
  }

  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_LIST_LIMIT
  ) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "limit" must be an integer between 1 and ${MAX_LIST_LIMIT}.`,
    );
  }

  return parsed;
}

interface AdminRunsCursor {
  createdAt: string;
  runId: string;
  status: AdminRunStatus | null;
}

function encodeCursor(cursor: AdminRunsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): AdminRunsCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const createdAt = normalizeIsoDate(parsed.createdAt, "cursor.createdAt");
    const runId = normalizeRequiredString(parsed.runId, "cursor.runId");
    const status = parsed.status === null ? null :
      normalizeStatus(parsed.status, "cursor.status");
    return {createdAt, runId, status};
  } catch (error) {
    if (error instanceof AdminRunsValidationError) {
      throw error;
    }

    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" must be a valid Admin runs cursor.",
    );
  }
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a boolean.`,
    );
  }

  return value;
}

function normalizeProctoringPolicy(value: unknown): AdminRunProctoringPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"proctoringPolicy\" must be an object.",
    );
  }

  const policy = value as Record<string, unknown>;
  return {
    browserIntegrityGuardEnabled: normalizeBoolean(
      policy.browserIntegrityGuardEnabled,
      "proctoringPolicy.browserIntegrityGuardEnabled",
    ),
    faceIdentityGazeGuardEnabled: normalizeBoolean(
      policy.faceIdentityGazeGuardEnabled,
      "proctoringPolicy.faceIdentityGazeGuardEnabled",
    ),
  };
}

function normalizeRecipientStudentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must be an array of strings.",
    );
  }

  const normalizedIds = value.map((entry) =>
    normalizeRequiredString(entry, "recipientStudentIds[]"),
  );
  const uniqueIds = Array.from(new Set(normalizedIds));

  if (uniqueIds.length === 0) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must contain at least one student id.",
    );
  }

  if (uniqueIds.length !== normalizedIds.length) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must not contain duplicates.",
    );
  }

  return uniqueIds;
}

function resolveCurrentYearId(
  academicYears: Array<{status: string; yearId: string}>,
): string {
  const active = academicYears.find((year) =>
    year.status === "Active" ||
      year.status === "Started" ||
      year.status === "Scheduled",
  );

  if (!active) {
    throw new AdminRunsValidationError(
      "CONFLICT",
      "The institute has no current operational academic year.",
    );
  }

  return active.yearId;
}

function toApiValidationError(error: unknown): AdminRunsValidationError {
  if (error instanceof AdminRunsValidationError) {
    return error;
  }

  if (error instanceof AssignmentCreationValidationError) {
    return new AdminRunsValidationError("VALIDATION_ERROR", error.message);
  }

  if (error instanceof AssignmentCreationConflictError) {
    return new AdminRunsValidationError("CONFLICT", error.message);
  }

  return new AdminRunsValidationError(
    "VALIDATION_ERROR",
    error instanceof Error ? error.message : "Run scheduling failed.",
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildRequestFingerprint(
  request: AdminRunsValidatedRequest,
): string {
  const payload = {
    ...request.payload,
    idempotencyKey: undefined,
  };
  return sha256(JSON.stringify({
    ...payload,
    recipientStudentIds: [...payload.recipientStudentIds].sort(),
  }));
}

function normalizeStoredTimestamp(value: unknown, fieldName: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  throw new AdminRunsValidationError(
    "VALIDATION_ERROR",
    `Persisted run field "${fieldName}" is not a timestamp.`,
  );
}

function normalizeStoredStringArray(
  value: unknown,
  fieldName: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Persisted run field "${fieldName}" is not an array.`,
    );
  }

  return value.map((entry) => normalizeRequiredString(entry, fieldName));
}

function toAdminRunRecord(
  runId: string,
  runPath: string,
  data: FirebaseFirestore.DocumentData | undefined,
): AdminRunRecord {
  if (!data) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Persisted run "${runId}" could not be loaded.`,
    );
  }

  const mode = normalizeMode(data.mode);
  const status = normalizeStatus(data.status, "status");
  const recipientStudentIds = normalizeStoredStringArray(
    data.recipientStudentIds,
    "recipientStudentIds",
  );
  const templateVersion = Number(data.templateVersion);

  return {
    academicYear: normalizeRequiredString(data.academicYear, "academicYear"),
    attemptLimit: normalizePositiveInteger(data.attemptLimit, "attemptLimit"),
    canonicalId: normalizeRequiredString(data.canonicalId, "canonicalId"),
    createdAt: normalizeStoredTimestamp(data.createdAt, "createdAt"),
    endWindow: normalizeStoredTimestamp(data.endWindow, "endWindow"),
    gracePeriodMinutes: normalizeNonNegativeInteger(
      data.gracePeriodMinutes,
      "gracePeriodMinutes",
    ),
    id: runId,
    mode,
    proctoringPolicy: normalizeProctoringPolicy(data.proctoringPolicy),
    recipientCount: recipientStudentIds.length,
    recipientStudentIds,
    runPath,
    shuffleQuestionOrder: normalizeBoolean(
      data.shuffleQuestionOrder,
      "shuffleQuestionOrder",
    ),
    startWindow: normalizeStoredTimestamp(data.startWindow, "startWindow"),
    status,
    templateVersion: normalizePositiveInteger(
      templateVersion,
      "templateVersion",
    ),
    testId: normalizeRequiredString(data.testId, "testId"),
    timezone: normalizeRequiredString(data.timezone, "timezone"),
  };
}

export class AdminRunsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: Record<string, unknown>;
    instituteId?: unknown;
  }): AdminRunsValidatedRequest {
    const body = input.body ?? {};
    const mode = normalizeMode(body.mode);

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      payload: {
        academicYear: normalizeRequiredString(
          body.academicYear,
          "academicYear",
        ),
        attemptLimit: normalizePositiveInteger(
          body.attemptLimit ?? 1,
          "attemptLimit",
        ),
        endWindow: normalizeIsoDate(body.endWindow, "endWindow"),
        expectedTemplateVersion: normalizePositiveInteger(
          body.expectedTemplateVersion,
          "expectedTemplateVersion",
        ),
        gracePeriodMinutes: normalizeNonNegativeInteger(
          body.gracePeriodMinutes ?? 0,
          "gracePeriodMinutes",
        ),
        idempotencyKey: normalizeRequiredString(
          body.idempotencyKey,
          "idempotencyKey",
        ),
        mode,
        proctoringPolicy: normalizeProctoringPolicy(body.proctoringPolicy),
        recipientStudentIds: normalizeRecipientStudentIds(
          body.recipientStudentIds,
        ),
        shuffleQuestionOrder: normalizeBoolean(
          body.shuffleQuestionOrder ?? false,
          "shuffleQuestionOrder",
        ),
        startWindow: normalizeIsoDate(body.startWindow, "startWindow"),
        testId: normalizeRequiredString(body.testId, "testId"),
        timezone: normalizeRequiredString(body.timezone ?? "UTC", "timezone"),
      },
    };
  }

  public normalizeListRequest(input: {
    cursor?: unknown;
    instituteId?: unknown;
    limit?: unknown;
    status?: unknown;
  }): AdminRunsListRequest {
    const cursor = typeof input.cursor === "undefined" ?
      undefined :
      normalizeRequiredString(input.cursor, "cursor");
    const status = typeof input.status === "undefined" ?
      undefined :
      normalizeStatus(input.status);

    return {
      ...(cursor ? {cursor} : {}),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeListLimit(input.limit),
      ...(status ? {status} : {}),
    };
  }

  public normalizeDetailRequest(input: {
    instituteId?: unknown;
    runId?: unknown;
  }): AdminRunsDetailRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      runId: normalizeRequiredString(input.runId, "runId"),
    };
  }

  public async listRuns(
    request: AdminRunsListRequest,
  ): Promise<AdminRunsListResult> {
    try {
      const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
        request.instituteId,
      );
      const currentYearId = resolveCurrentYearId(
        settingsSnapshot.academicYears,
      );
      const runsCollection = this.firestore
        .collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(ACADEMIC_YEARS_COLLECTION)
        .doc(currentYearId)
        .collection(RUNS_COLLECTION);
      let query: FirebaseFirestore.Query = runsCollection;

      if (request.status) {
        query = query.where("status", "==", request.status);
      }

      query = query
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");

      if (request.cursor) {
        const cursor = decodeCursor(request.cursor);
        if (cursor.status !== (request.status ?? null)) {
          throw new AdminRunsValidationError(
            "VALIDATION_ERROR",
            "Field \"cursor\" does not match the requested status filter.",
          );
        }
        query = query.startAfter(
          Timestamp.fromDate(new Date(cursor.createdAt)),
          cursor.runId,
        );
      }

      const snapshot = await query.limit(request.limit + 1).get();
      const hasMore = snapshot.docs.length > request.limit;
      const selectedDocuments = snapshot.docs.slice(0, request.limit);
      const runs = selectedDocuments.map((document) =>
        toAdminRunRecord(document.id, document.ref.path, document.data()),
      );
      const lastDocument = selectedDocuments[selectedDocuments.length - 1];
      const lastCreatedAt = lastDocument?.data().createdAt;
      const nextCursor = hasMore && lastDocument &&
        lastCreatedAt instanceof Timestamp ? encodeCursor({
          createdAt: lastCreatedAt.toDate().toISOString(),
          runId: lastDocument.id,
          status: request.status ?? null,
        }) : null;

      return {nextCursor, runs};
    } catch (error) {
      throw toApiValidationError(error);
    }
  }

  public async getRun(
    request: AdminRunsDetailRequest,
  ): Promise<AdminRunsDetailResult> {
    try {
      const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
        request.instituteId,
      );
      const currentYearId = resolveCurrentYearId(
        settingsSnapshot.academicYears,
      );
      const runReference = this.firestore
        .collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(ACADEMIC_YEARS_COLLECTION)
        .doc(currentYearId)
        .collection(RUNS_COLLECTION)
        .doc(request.runId);
      const snapshot = await runReference.get();

      if (!snapshot.exists) {
        throw new AdminRunsValidationError(
          "NOT_FOUND",
          `Run "${request.runId}" was not found in the current academic year.`,
        );
      }

      return {
        run: toAdminRunRecord(request.runId, runReference.path, snapshot.data()),
      };
    } catch (error) {
      throw toApiValidationError(error);
    }
  }

  public async createRun(
    request: AdminRunsValidatedRequest,
  ): Promise<AdminRunsCreateResult> {
    try {
      const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
        request.instituteId,
      );
      const currentYearId = resolveCurrentYearId(
        settingsSnapshot.academicYears,
      );
      if (request.payload.academicYear !== currentYearId) {
        throw new AdminRunsValidationError(
          "CONFLICT",
          `Academic year "${request.payload.academicYear}" is not the ` +
          `current operational year "${currentYearId}".`,
        );
      }
      const runsCollection = this.firestore
        .collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(ACADEMIC_YEARS_COLLECTION)
        .doc(currentYearId)
        .collection(RUNS_COLLECTION);
      const idempotencyKeyHash = sha256(request.payload.idempotencyKey);
      const requestFingerprint = buildRequestFingerprint(request);
      const runId = `run_${sha256(
        `${request.instituteId}:${currentYearId}:${idempotencyKeyHash}`,
      ).slice(0, 32)}`;
      const runReference = runsCollection.doc(runId);
      const existingRunSnapshot = await runReference.get();

      if (existingRunSnapshot.exists) {
        const existingRunData = existingRunSnapshot.data();
        if (
          existingRunData?.status !== "scheduled" ||
          existingRunData.idempotencyKeyHash !== idempotencyKeyHash ||
          existingRunData.requestFingerprint !== requestFingerprint
        ) {
          throw new AdminRunsValidationError(
            "CONFLICT",
            "The idempotency key is already bound to a different run request.",
          );
        }

        return {
          disposition: "replayed",
          run: toAdminRunRecord(runId, runReference.path, existingRunData),
        };
      }

      const assignment = await assignmentCreationService
        .processAssignmentCreated(
          {
            instituteId: request.instituteId,
            runId,
            yearId: currentYearId,
          },
          {
            ...request.payload,
            academicYear: currentYearId,
            idempotencyKeyHash,
            modeSnapshot: request.payload.mode,
            requestFingerprint,
            runId,
          },
        );

      const persistedRunSnapshot = await runReference.get();

      return {
        disposition: assignment.disposition,
        run: toAdminRunRecord(
          runId,
          assignment.runPath,
          persistedRunSnapshot.data(),
        ),
      };
    } catch (error) {
      throw toApiValidationError(error);
    }
  }
}

export const adminRunsService = new AdminRunsService();
