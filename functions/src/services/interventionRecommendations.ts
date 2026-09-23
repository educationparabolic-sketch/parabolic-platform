import {createHash} from "crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  AdminInterventionOutcomeUpdateResult,
  AdminInterventionRecommendationCreateResult,
  AdminInterventionRecommendationRecord,
  AdminInterventionRecommendationStatus,
  AdminInterventionRecommendationType,
  AdminInterventionTimelineResult,
} from "../../../shared/contracts/apiDtos";
import {
  AdminInterventionOutcomeUpdateValidatedRequest,
  AdminInterventionRecommendationCreateValidatedRequest,
  AdminInterventionRecommendationValidationError,
  AdminInterventionTimelineValidatedRequest,
} from "../types/adminGovernanceInterventions";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";

const ROOT_COLLECTION = "interventionRecommendations";
const INSTITUTES_COLLECTION = "institutes";
const ACTIONS_COLLECTION = "actions";
const COMMANDS_COLLECTION = "commands";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const STUDENTS_COLLECTION = "students";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const SCHEMA_VERSION = 2;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const INTERVENTION_ID_PREFIX = "intervention_";

interface InterventionRecommendationDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
}

interface CommandRecord {
  operation: "create" | "outcome";
  requestFingerprint: string;
  result: AdminInterventionRecommendationRecord;
  status: "complete";
}

interface TimelineCursor {
  createdAtMillis: number;
  fingerprint: string;
  interventionId: string;
  version: 1;
}

interface StoredStudentAuthority {
  riskCluster: string;
  sourceMetricsUpdatedAt: string;
  studentName: string;
}

interface NormalizedTimelineRequest
  extends Omit<AdminInterventionTimelineValidatedRequest, "limit"> {
  limit: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const validationError = (message: string): never => {
  throw new AdminInterventionRecommendationValidationError(
    "VALIDATION_ERROR",
    message,
  );
};

const internalError = (message: string): never => {
  throw new AdminInterventionRecommendationValidationError(
    "INTERNAL_ERROR",
    message,
  );
};

const requiredString = (
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return validationError(`Field "${fieldName}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return validationError(
      `Field "${fieldName}" must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
};

const optionalString = (
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return requiredString(value, fieldName, maxLength);
};

const normalizedIso = (value: unknown, fieldName: string): string => {
  const raw = requiredString(value, fieldName, 64);
  const milliseconds = Date.parse(raw);
  if (Number.isNaN(milliseconds)) {
    return validationError(`Field "${fieldName}" must be an ISO timestamp.`);
  }
  return new Date(milliseconds).toISOString();
};

const storedIso = (value: unknown, fieldName: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const milliseconds = Date.parse(value);
    if (!Number.isNaN(milliseconds)) {
      return new Date(milliseconds).toISOString();
    }
  }
  return internalError(
    `Stored intervention field "${fieldName}" is not a timestamp.`,
  );
};

const storedString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return internalError(`Stored intervention field "${fieldName}" is invalid.`);
  }
  return value.trim();
};

const storedNullableString = (
  value: unknown,
  fieldName: string,
): string | null => value === null ? null : storedString(value, fieldName);

const positiveInteger = (value: unknown, fieldName: string): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    return validationError(`Field "${fieldName}" must be a positive integer.`);
  }
  return Number(value);
};

const storedPositiveInteger = (value: unknown, fieldName: string): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    return internalError(`Stored intervention field "${fieldName}" is invalid.`);
  }
  return Number(value);
};

const normalizeRole = (
  value: unknown,
  allowedRoles: ReadonlySet<string>,
): string => {
  const role = requiredString(value, "actorRole", 64).toLowerCase();
  if (!allowedRoles.has(role)) {
    throw new AdminInterventionRecommendationValidationError(
      "FORBIDDEN",
      "Actor role is not permitted for this intervention operation.",
    );
  }
  return role;
};

const normalizeRecommendationType = (
  value: unknown,
): AdminInterventionRecommendationType => {
  if (value === "remedial_test" || value === "student_message") {
    return value;
  }
  return validationError(
    "Field \"recommendationType\" must be remedial_test or student_message.",
  );
};

const normalizeOutcomeStatus = (
  value: unknown,
): Exclude<AdminInterventionRecommendationStatus, "pending"> => {
  if (value === "improving" || value === "no_change" ||
    value === "escalated" || value === "resolved") {
    return value;
  }
  return validationError(
    "Field \"status\" must be improving, no_change, escalated, or resolved.",
  );
};

const storedRecommendationType = (
  value: unknown,
): AdminInterventionRecommendationType => {
  if (value === "remedial_test" || value === "student_message") {
    return value;
  }
  return internalError("Stored intervention recommendation type is invalid.");
};

const storedStatus = (
  value: unknown,
): AdminInterventionRecommendationStatus => {
  if (value === "pending" || value === "improving" ||
    value === "no_change" || value === "escalated" ||
    value === "resolved") {
    return value;
  }
  return internalError("Stored intervention status is invalid.");
};

const timelineFingerprint = (
  request: Pick<NormalizedTimelineRequest,
    "instituteId" | "studentId" | "yearId">,
): string => sha256(stableJson({
  instituteId: request.instituteId,
  studentId: request.studentId ?? null,
  yearId: request.yearId,
}));

const encodeCursor = (cursor: TimelineCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (
  value: string,
  fingerprint: string,
): TimelineCursor => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.createdAtMillis !== "number" ||
      !Number.isSafeInteger(parsed.createdAtMillis) ||
      parsed.createdAtMillis < 0) {
      throw new Error("invalid cursor");
    }
    return {
      createdAtMillis: parsed.createdAtMillis,
      fingerprint,
      interventionId: requiredString(
        parsed.interventionId,
        "cursor.interventionId",
        128,
      ),
      version: 1,
    };
  } catch (error) {
    if (error instanceof AdminInterventionRecommendationValidationError) {
      throw error;
    }
    return validationError(
      "Field \"cursor\" is invalid or does not match the active filters.",
    );
  }
};

const recommendationFromValue = (
  value: unknown,
  expected?: {
    instituteId?: string;
    interventionId?: string;
    yearId?: string;
  },
): AdminInterventionRecommendationRecord => {
  if (!isRecord(value) || value.advisoryOnly !== true) {
    return internalError("Stored intervention recommendation is invalid.");
  }
  const interventionId = storedString(value.interventionId, "interventionId");
  const yearId = storedString(value.yearId, "yearId");
  if (expected?.interventionId && interventionId !== expected.interventionId) {
    return internalError("Stored intervention ID does not match its authority.");
  }
  if (expected?.yearId && yearId !== expected.yearId) {
    return internalError("Stored intervention year does not match its path.");
  }
  if (expected?.instituteId &&
    storedString(value.instituteId, "instituteId") !== expected.instituteId) {
    return internalError("Stored intervention tenant does not match its path.");
  }
  const recommendationType = storedRecommendationType(
    value.recommendationType,
  );
  const messageDraft = storedNullableString(value.messageDraft, "messageDraft");
  const recommendedTestId = storedNullableString(
    value.recommendedTestId,
    "recommendedTestId",
  );
  if ((recommendationType === "remedial_test" &&
      (!recommendedTestId || messageDraft !== null)) ||
    (recommendationType === "student_message" &&
      (!messageDraft || recommendedTestId !== null))) {
    return internalError("Stored intervention advisory payload is inconsistent.");
  }
  return {
    advisoryOnly: true,
    auditId: storedString(value.auditId, "auditId"),
    createdAt: storedIso(value.createdAt, "createdAt"),
    interventionId,
    messageDraft,
    outcomeNotes: storedNullableString(value.outcomeNotes, "outcomeNotes"),
    recommendationType,
    recommendedTestId,
    revision: storedPositiveInteger(value.revision, "revision"),
    riskCluster: storedString(value.riskCluster, "riskCluster"),
    sourceMetricsUpdatedAt: storedIso(
      value.sourceMetricsUpdatedAt,
      "sourceMetricsUpdatedAt",
    ),
    status: storedStatus(value.status),
    studentId: storedString(value.studentId, "studentId"),
    studentName: storedString(value.studentName, "studentName"),
    updatedAt: storedIso(value.updatedAt, "updatedAt"),
    yearId,
  };
};

const readRecommendation = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  expected?: {instituteId?: string; yearId?: string},
): AdminInterventionRecommendationRecord => {
  if (!snapshot.exists) {
    return internalError("Intervention recommendation is missing.");
  }
  const data = snapshot.data();
  if (!isRecord(data) || data.schemaVersion !== SCHEMA_VERSION) {
    return internalError("Intervention recommendation schema is invalid.");
  }
  return recommendationFromValue(data, {
    ...expected,
    interventionId: snapshot.id,
  });
};

const readCommand = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): CommandRecord | null => {
  if (!snapshot.exists) {
    return null;
  }
  const value = snapshot.data();
  if (!isRecord(value) || value.status !== "complete" ||
    (value.operation !== "create" && value.operation !== "outcome")) {
    return internalError("Intervention command state is invalid.");
  }
  return {
    operation: value.operation,
    requestFingerprint: storedString(
      value.requestFingerprint,
      "command.requestFingerprint",
    ),
    result: recommendationFromValue(value.result),
    status: "complete",
  };
};

const assertCommand = (
  command: CommandRecord,
  operation: CommandRecord["operation"],
  requestFingerprint: string,
): void => {
  if (command.operation !== operation ||
    command.requestFingerprint !== requestFingerprint) {
    throw new AdminInterventionRecommendationValidationError(
      "CONFLICT",
      "Idempotency key has already been used with different semantics.",
    );
  }
};

const toStoredRecommendation = (
  recommendation: AdminInterventionRecommendationRecord,
  instituteId: string,
): Record<string, unknown> => ({
  ...recommendation,
  createdAt: Timestamp.fromDate(new Date(recommendation.createdAt)),
  instituteId,
  schemaVersion: SCHEMA_VERSION,
  sourceMetricsUpdatedAt: Timestamp.fromDate(
    new Date(recommendation.sourceMetricsUpdatedAt),
  ),
  updatedAt: Timestamp.fromDate(new Date(recommendation.updatedAt)),
});

/**
 * Canonical advisory-only intervention persistence and timeline authority.
 */
export class InterventionRecommendationService {
  private readonly logger = createLogger("InterventionRecommendationService");

  /**
   * @param {InterventionRecommendationDependencies} dependencies Collaborators.
   */
  constructor(
    private readonly dependencies: InterventionRecommendationDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
    },
  ) {}

  /**
   * Validates a server-resolved create request.
   * @param {Partial<AdminInterventionRecommendationCreateValidatedRequest>} input Request.
   * @return {AdminInterventionRecommendationCreateValidatedRequest} Request.
   */
  public normalizeCreateRequest(
    input: Partial<AdminInterventionRecommendationCreateValidatedRequest>,
  ): AdminInterventionRecommendationCreateValidatedRequest {
    const recommendationType = normalizeRecommendationType(
      input.recommendationType,
    );
    const recommendedTestId = optionalString(
      input.recommendedTestId,
      "recommendedTestId",
      128,
    );
    const messageDraft = optionalString(
      input.messageDraft,
      "messageDraft",
      2_000,
    );
    if (recommendationType === "remedial_test" &&
      (!recommendedTestId || messageDraft)) {
      return validationError(
        "remedial_test requires recommendedTestId and no messageDraft.",
      );
    }
    if (recommendationType === "student_message" &&
      (!messageDraft || recommendedTestId)) {
      return validationError(
        "student_message requires messageDraft and no recommendedTestId.",
      );
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeRole(
        input.actorRole,
        new Set(["teacher", "admin"]),
      ),
      idempotencyKey: requiredString(
        input.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      ...(messageDraft ? {messageDraft} : {}),
      recommendationType,
      ...(recommendedTestId ? {recommendedTestId} : {}),
      sourceMetricsUpdatedAt: normalizedIso(
        input.sourceMetricsUpdatedAt,
        "sourceMetricsUpdatedAt",
      ),
      studentId: requiredString(input.studentId, "studentId", 128),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
      yearId: requiredString(input.yearId, "yearId", 64),
    };
  }

  /**
   * Validates a server-resolved outcome request.
   * @param {Partial<AdminInterventionOutcomeUpdateValidatedRequest>} input Request.
   * @return {AdminInterventionOutcomeUpdateValidatedRequest} Request.
   */
  public normalizeOutcomeRequest(
    input: Partial<AdminInterventionOutcomeUpdateValidatedRequest>,
  ): AdminInterventionOutcomeUpdateValidatedRequest {
    const interventionId = requiredString(
      input.interventionId,
      "interventionId",
      128,
    );
    if (!/^intervention_[a-f0-9]{40}$/u.test(interventionId)) {
      return validationError("Field \"interventionId\" is invalid.");
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeRole(
        input.actorRole,
        new Set(["teacher", "admin"]),
      ),
      expectedRevision: positiveInteger(
        input.expectedRevision,
        "expectedRevision",
      ),
      idempotencyKey: requiredString(
        input.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      interventionId,
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      outcomeNotes: optionalString(
        input.outcomeNotes,
        "outcomeNotes",
        2_000,
      ),
      status: normalizeOutcomeStatus(input.status),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  /**
   * Validates a server-resolved timeline request.
   * @param {Partial<AdminInterventionTimelineValidatedRequest>} input Request.
   * @return {NormalizedTimelineRequest} Request.
   */
  public normalizeTimelineRequest(
    input: Partial<AdminInterventionTimelineValidatedRequest>,
  ): NormalizedTimelineRequest {
    const limit = input.limit === undefined ?
      DEFAULT_LIMIT :
      positiveInteger(input.limit, "limit");
    if (limit > MAX_LIMIT) {
      return validationError(`Field "limit" must be at most ${MAX_LIMIT}.`);
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeRole(
        input.actorRole,
        new Set(["teacher", "admin", "director"]),
      ),
      cursor: optionalString(input.cursor, "cursor", 2_048),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      limit,
      studentId: optionalString(input.studentId, "studentId", 128),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
      yearId: requiredString(input.yearId, "yearId", 64),
    };
  }

  /**
   * Creates or exactly replays an advisory recommendation.
   * @param {AdminInterventionRecommendationCreateValidatedRequest} rawRequest Request.
   * @return {Promise<AdminInterventionRecommendationCreateResult>} Result.
   */
  public async createRecommendation(
    rawRequest: AdminInterventionRecommendationCreateValidatedRequest,
  ): Promise<AdminInterventionRecommendationCreateResult> {
    const request = this.normalizeCreateRequest(rawRequest);
    const idempotencyKeyHash = sha256(request.idempotencyKey);
    const interventionId = INTERVENTION_ID_PREFIX + sha256(
      `${request.instituteId}:${request.yearId}:${idempotencyKeyHash}`,
    ).slice(0, 40);
    const commandId = `create_${idempotencyKeyHash}`;
    const auditId = `${interventionId}_create_audit`;
    const requestFingerprint = sha256(stableJson({
      actorId: request.actorId,
      instituteId: request.instituteId,
      messageDraft: request.messageDraft ?? null,
      recommendationType: request.recommendationType,
      recommendedTestId: request.recommendedTestId ?? null,
      sourceMetricsUpdatedAt: request.sourceMetricsUpdatedAt,
      studentId: request.studentId,
      yearId: request.yearId,
    }));
    const references = this.createReferences(request, interventionId, commandId,
      auditId);
    const result = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<AdminInterventionRecommendationCreateResult> => {
        const [commandSnapshot, actionSnapshot, auditSnapshot] =
          await Promise.all([
            transaction.get(references.command),
            transaction.get(references.action),
            transaction.get(references.audit),
          ]);
        const command = readCommand(commandSnapshot);
        if (command) {
          assertCommand(command, "create", requestFingerprint);
          if (!actionSnapshot.exists || !auditSnapshot.exists ||
            command.result.interventionId !== interventionId ||
            command.result.auditId !== auditId) {
            return internalError(
              "Intervention create replay authority is incomplete.",
            );
          }
          readRecommendation(actionSnapshot, {
            instituteId: request.instituteId,
            yearId: request.yearId,
          });
          return {disposition: "replayed", recommendation: command.result};
        }
        if (actionSnapshot.exists || auditSnapshot.exists) {
          return internalError(
            "Intervention create state exists without replay authority.",
          );
        }

        const [studentSnapshot, metricsSnapshot] = await Promise.all([
          transaction.get(references.student),
          transaction.get(references.metrics),
        ]);
        const authority = this.studentAuthority(
          studentSnapshot,
          metricsSnapshot,
          request.sourceMetricsUpdatedAt,
        );
        const createdAtTimestamp = this.dependencies.now();
        const createdAt = createdAtTimestamp.toDate().toISOString();
        const recommendation: AdminInterventionRecommendationRecord = {
          advisoryOnly: true,
          auditId,
          createdAt,
          interventionId,
          messageDraft: request.messageDraft ?? null,
          outcomeNotes: null,
          recommendationType: request.recommendationType,
          recommendedTestId: request.recommendedTestId ?? null,
          revision: 1,
          riskCluster: authority.riskCluster,
          sourceMetricsUpdatedAt: authority.sourceMetricsUpdatedAt,
          status: "pending",
          studentId: request.studentId,
          studentName: authority.studentName,
          updatedAt: createdAt,
          yearId: request.yearId,
        };
        transaction.create(
          references.action,
          toStoredRecommendation(recommendation, request.instituteId),
        );
        transaction.create(references.command, {
          actorId: request.actorId,
          auditId,
          completedAt: createdAtTimestamp,
          idempotencyKeyHash,
          interventionId,
          operation: "create",
          requestFingerprint,
          result: recommendation,
          status: "complete",
        });
        transaction.create(
          references.audit,
          this.auditRecord({
            actionType: "CREATE_INTERVENTION_RECOMMENDATION",
            actorId: request.actorId,
            actorRole: request.actorRole,
            after: recommendation,
            auditId,
            before: {},
            commandId,
            idempotencyKeyHash,
            instituteId: request.instituteId,
            interventionId,
            ipAddress: request.ipAddress,
            requestFingerprint,
            timestamp: createdAtTimestamp,
            userAgent: request.userAgent,
          }),
        );
        return {disposition: "applied", recommendation};
      },
    );
    this.logger.info("Intervention recommendation completed.", {
      disposition: result.disposition,
      instituteId: request.instituteId,
      interventionId,
      recommendationType: request.recommendationType,
      studentId: request.studentId,
      yearId: request.yearId,
    });
    return result;
  }

  /**
   * Updates or exactly replays an advisory recommendation outcome.
   * @param {AdminInterventionOutcomeUpdateValidatedRequest} rawRequest Request.
   * @return {Promise<AdminInterventionOutcomeUpdateResult>} Result.
   */
  public async updateOutcome(
    rawRequest: AdminInterventionOutcomeUpdateValidatedRequest,
  ): Promise<AdminInterventionOutcomeUpdateResult> {
    const request = this.normalizeOutcomeRequest(rawRequest);
    const actionSnapshot = await this.findRecommendation(
      request.instituteId,
      request.interventionId,
    );
    if (!actionSnapshot) {
      throw new AdminInterventionRecommendationValidationError(
        "NOT_FOUND",
        "Intervention recommendation was not found.",
      );
    }
    const idempotencyKeyHash = sha256(request.idempotencyKey);
    const commandId = `outcome_${idempotencyKeyHash}`;
    const auditId = `${request.interventionId}_outcome_` +
      `${idempotencyKeyHash.slice(0, 32)}_audit`;
    const requestFingerprint = sha256(stableJson({
      actorId: request.actorId,
      expectedRevision: request.expectedRevision,
      instituteId: request.instituteId,
      interventionId: request.interventionId,
      outcomeNotes: request.outcomeNotes ?? null,
      status: request.status,
    }));
    const instituteAuthority = actionSnapshot.ref.parent.parent;
    if (!instituteAuthority || instituteAuthority.id !== request.instituteId) {
      return internalError("Intervention recommendation path is invalid.");
    }
    const commandReference = instituteAuthority.collection(COMMANDS_COLLECTION)
      .doc(commandId);
    const auditReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
      `${AUDIT_LOGS_COLLECTION}/${auditId}`,
    );
    const result = await this.dependencies.firestore.runTransaction(
      async (transaction): Promise<AdminInterventionOutcomeUpdateResult> => {
        const [currentSnapshot, commandSnapshot, auditSnapshot] =
          await Promise.all([
            transaction.get(actionSnapshot.ref),
            transaction.get(commandReference),
            transaction.get(auditReference),
          ]);
        const command = readCommand(commandSnapshot);
        if (command) {
          assertCommand(command, "outcome", requestFingerprint);
          if (!currentSnapshot.exists || !auditSnapshot.exists ||
            command.result.interventionId !== request.interventionId ||
            command.result.auditId !== auditId) {
            return internalError(
              "Intervention outcome replay authority is incomplete.",
            );
          }
          return {disposition: "replayed", recommendation: command.result};
        }
        if (auditSnapshot.exists) {
          return internalError(
            "Intervention outcome audit exists without replay authority.",
          );
        }
        if (!currentSnapshot.exists) {
          throw new AdminInterventionRecommendationValidationError(
            "NOT_FOUND",
            "Intervention recommendation was not found.",
          );
        }
        const current = readRecommendation(currentSnapshot, {
          instituteId: request.instituteId,
        });
        if (current.revision !== request.expectedRevision) {
          throw new AdminInterventionRecommendationValidationError(
            "CONFLICT",
            "Intervention recommendation revision does not match.",
          );
        }
        const updatedAtTimestamp = this.dependencies.now();
        const updated: AdminInterventionRecommendationRecord = {
          ...current,
          auditId,
          outcomeNotes: request.outcomeNotes ?? null,
          revision: current.revision + 1,
          status: request.status,
          updatedAt: updatedAtTimestamp.toDate().toISOString(),
        };
        transaction.update(actionSnapshot.ref, {
          auditId,
          outcomeNotes: updated.outcomeNotes,
          revision: updated.revision,
          status: updated.status,
          updatedAt: updatedAtTimestamp,
        });
        transaction.create(commandReference, {
          actorId: request.actorId,
          auditId,
          completedAt: updatedAtTimestamp,
          idempotencyKeyHash,
          interventionId: request.interventionId,
          operation: "outcome",
          requestFingerprint,
          result: updated,
          status: "complete",
        });
        transaction.create(auditReference, this.auditRecord({
          actionType: "UPDATE_INTERVENTION_OUTCOME",
          actorId: request.actorId,
          actorRole: request.actorRole,
          after: updated,
          auditId,
          before: current,
          commandId,
          idempotencyKeyHash,
          instituteId: request.instituteId,
          interventionId: request.interventionId,
          ipAddress: request.ipAddress,
          requestFingerprint,
          timestamp: updatedAtTimestamp,
          userAgent: request.userAgent,
        }));
        return {disposition: "applied", recommendation: updated};
      },
    );
    this.logger.info("Intervention outcome completed.", {
      disposition: result.disposition,
      instituteId: request.instituteId,
      interventionId: request.interventionId,
      revision: result.recommendation.revision,
      status: result.recommendation.status,
    });
    return result;
  }

  /**
   * Returns a source-filtered, bounded recommendation timeline.
   * @param {AdminInterventionTimelineValidatedRequest} rawRequest Request.
   * @return {Promise<AdminInterventionTimelineResult>} Timeline.
   */
  public async listTimeline(
    rawRequest: AdminInterventionTimelineValidatedRequest,
  ): Promise<AdminInterventionTimelineResult> {
    const request = this.normalizeTimelineRequest(rawRequest);
    const fingerprint = timelineFingerprint(request);
    const cursor = request.cursor ?
      decodeCursor(request.cursor, fingerprint) :
      undefined;
    let query: FirebaseFirestore.Query = this.instituteReference(
      request.yearId,
      request.instituteId,
    ).collection(ACTIONS_COLLECTION)
      .where("schemaVersion", "==", SCHEMA_VERSION);
    if (request.studentId) {
      query = query.where("studentId", "==", request.studentId);
    }
    query = query.orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      query = query.startAfter(
        Timestamp.fromMillis(cursor.createdAtMillis),
        cursor.interventionId,
      );
    }
    const snapshot = await query.limit(request.limit + 1).get();
    const hasMore = snapshot.docs.length > request.limit;
    const selected = snapshot.docs.slice(0, request.limit);
    const recommendations = selected.map((document) =>
      readRecommendation(document, {
        instituteId: request.instituteId,
        yearId: request.yearId,
      }));
    const last = selected[selected.length - 1];
    const lastCreatedAt = last?.get("createdAt");
    const nextCursor = hasMore && last && lastCreatedAt instanceof Timestamp ?
      encodeCursor({
        createdAtMillis: lastCreatedAt.toMillis(),
        fingerprint,
        interventionId: last.id,
        version: 1,
      }) :
      null;
    if (hasMore && !nextCursor) {
      return internalError("Intervention timeline cursor authority is invalid.");
    }
    this.logger.info("Intervention recommendation timeline retrieved.", {
      instituteId: request.instituteId,
      requestedLimit: request.limit,
      resultCount: recommendations.length,
      studentId: request.studentId,
      yearId: request.yearId,
    });
    return {nextCursor, recommendations, yearId: request.yearId};
  }

  private instituteReference(yearId: string, instituteId: string) {
    return this.dependencies.firestore.doc(
      `${ROOT_COLLECTION}/${yearId}/${INSTITUTES_COLLECTION}/${instituteId}`,
    );
  }

  private createReferences(
    request: AdminInterventionRecommendationCreateValidatedRequest,
    interventionId: string,
    commandId: string,
    auditId: string,
  ) {
    const authority = this.instituteReference(
      request.yearId,
      request.instituteId,
    );
    return {
      action: authority.collection(ACTIONS_COLLECTION).doc(interventionId),
      audit: this.dependencies.firestore.doc(
        `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
        `${AUDIT_LOGS_COLLECTION}/${auditId}`,
      ),
      command: authority.collection(COMMANDS_COLLECTION).doc(commandId),
      metrics: this.dependencies.firestore.doc(
        `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
        `${ACADEMIC_YEARS_COLLECTION}/${request.yearId}/` +
        `${STUDENT_YEAR_METRICS_COLLECTION}/${request.studentId}`,
      ),
      student: this.dependencies.firestore.doc(
        `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
        `${STUDENTS_COLLECTION}/${request.studentId}`,
      ),
    };
  }

  private studentAuthority(
    studentSnapshot: FirebaseFirestore.DocumentSnapshot,
    metricsSnapshot: FirebaseFirestore.DocumentSnapshot,
    requestedMetricsUpdatedAt: string,
  ): StoredStudentAuthority {
    if (!studentSnapshot.exists || !metricsSnapshot.exists) {
      throw new AdminInterventionRecommendationValidationError(
        "NOT_FOUND",
        "Target student or source metrics were not found.",
      );
    }
    const student = studentSnapshot.data();
    const metrics = metricsSnapshot.data();
    if (!isRecord(student) || !isRecord(metrics)) {
      return internalError("Student intervention source is invalid.");
    }
    const sourceMetricsUpdatedAt = storedIso(
      metrics.lastUpdated ?? metrics.updatedAt,
      "metrics.lastUpdated",
    );
    if (sourceMetricsUpdatedAt !== requestedMetricsUpdatedAt) {
      throw new AdminInterventionRecommendationValidationError(
        "CONFLICT",
        "Source student metrics changed before recommendation creation.",
      );
    }
    return {
      riskCluster: storedString(
        metrics.rollingRiskCluster ?? metrics.riskState,
        "metrics.riskCluster",
      ),
      sourceMetricsUpdatedAt,
      studentName: storedString(
        student.name ?? student.studentName,
        "student.name",
      ),
    };
  }

  private async findRecommendation(
    instituteId: string,
    interventionId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    const snapshot = await this.dependencies.firestore
      .collectionGroup(ACTIONS_COLLECTION)
      .where("schemaVersion", "==", SCHEMA_VERSION)
      .where("interventionId", "==", interventionId)
      .limit(2)
      .get();
    const matches = snapshot.docs.filter((document) => {
      const segments = document.ref.path.split("/");
      return segments.length === 6 &&
        segments[0] === ROOT_COLLECTION &&
        segments[2] === INSTITUTES_COLLECTION &&
        segments[3] === instituteId &&
        segments[4] === ACTIONS_COLLECTION &&
        segments[5] === interventionId;
    });
    if (matches.length > 1) {
      return internalError("Intervention recommendation ID is not unique.");
    }
    return matches[0] ?? null;
  }

  private auditRecord(input: {
    actionType: "CREATE_INTERVENTION_RECOMMENDATION" |
      "UPDATE_INTERVENTION_OUTCOME";
    actorId: string;
    actorRole: string;
    after: AdminInterventionRecommendationRecord;
    auditId: string;
    before: AdminInterventionRecommendationRecord | Record<string, never>;
    commandId: string;
    idempotencyKeyHash: string;
    instituteId: string;
    interventionId: string;
    ipAddress?: string;
    requestFingerprint: string;
    timestamp: Timestamp;
    userAgent?: string;
  }): Record<string, unknown> {
    return {
      actionType: input.actionType,
      actorId: input.actorId,
      actorRole: input.actorRole,
      actorUid: input.actorId,
      after: input.after,
      auditId: input.auditId,
      before: input.before,
      entityId: input.interventionId,
      entityType: "interventionRecommendation",
      instituteId: input.instituteId,
      ...(input.ipAddress ? {ipAddress: input.ipAddress} : {}),
      layer: "L1",
      metadata: {
        advisoryOnly: true,
        commandId: input.commandId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestFingerprint: input.requestFingerprint,
        source: "InterventionRecommendationService",
      },
      targetCollection: ROOT_COLLECTION,
      targetId: input.interventionId,
      tenantId: input.instituteId,
      timestamp: input.timestamp,
      ...(input.userAgent ? {userAgent: input.userAgent} : {}),
    };
  }
}

export const interventionRecommendationService =
  new InterventionRecommendationService();
