/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {adminSettingsService} from "./adminSettings";
import {submissionService} from "./submission";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminAssignmentOperationContext,
  AdminAssignmentOperationValidationError,
  AdminRunDerivedCreateServiceResult,
  AdminRunDuplicateValidatedRequest,
  AdminRunLifecycleReconciliationRequest,
  AdminRunLifecycleReconciliationResult,
  AdminRunLifecycleServiceResult,
  AdminRunLifecycleValidatedRequest,
  AdminRunNotificationResendServiceResult,
  AdminRunNotificationResendValidatedRequest,
  AdminRunReassignValidatedRequest,
  AdminRunSessionOverrideServiceResult,
  AdminRunSessionOverrideValidatedRequest,
  AdminRunVersionedRecord,
} from "../types/adminAssignmentOperations";
import type {
  AdminRunLifecycleStatus,
  AdminRunMode,
  AdminRunProctoringPolicy,
} from "../../../shared/contracts/apiDtos";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const EMAIL_QUEUE_COLLECTION = "emailQueue";
const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const TESTS_COLLECTION = "tests";
const OVERRIDE_LOGS_COLLECTION = "overrideLogs";
const OPERATION_RECOVERY_COLLECTION = "assignmentOperationRecoveries";
const MAX_RECIPIENTS = 100;
const MAX_EXTENSION_MINUTES = 1440;
const ASSIGNMENT_NOTIFICATION_TEMPLATE = "assignment_notification";

type DerivedCommand = "duplicate" | "reassign";
type SupportedLifecycleAction = "extend" | "cancel" | "archive";
type LicenseLayer = "L0" | "L1" | "L2" | "L3";

interface AdminAssignmentOperationsDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
  resolveCurrentYearId: (instituteId: string) => Promise<string>;
  submitSession: (context: {
    instituteId: string;
    reason: "manual";
    runId: string;
    sessionId: string;
    studentId: string;
    yearId: string;
  }, options: {lockOwnerId: string}) => Promise<unknown>;
}

interface CommandAuthority {
  auditId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
}

const MODE_REQUIRED_LAYERS: Record<AdminRunMode, LicenseLayer> = {
  Controlled: "L2",
  Diagnostic: "L1",
  Hard: "L2",
  Operational: "L0",
};

const LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  fieldName: string,
  maximumLength = 256,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function optionalString(value: unknown, maximumLength = 512): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return requiredString(value, "optional text", maximumLength);
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }
  return value;
}

function isoTimestamp(value: unknown, fieldName: string): string {
  const normalized = requiredString(value, fieldName);
  const milliseconds = Date.parse(normalized);
  if (Number.isNaN(milliseconds)) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an ISO-8601 timestamp.`,
    );
  }
  return new Date(milliseconds).toISOString();
}

function timestamp(value: unknown, fieldName: string): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Persisted run field "${fieldName}" is not a timestamp.`,
    );
  }
  return value;
}

function stringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Persisted run field "${fieldName}" is not an array.`,
    );
  }
  return value.map((entry) => requiredString(entry, `${fieldName}[]`));
}

function recipientIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECIPIENTS) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "recipientStudentIds" must contain 1 to ${MAX_RECIPIENTS} ids.`,
    );
  }
  const normalized = value.map((entry) =>
    requiredString(entry, "recipientStudentIds[]"),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must not contain duplicates.",
    );
  }
  return normalized;
}

function normalizeContext(input: {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
  ipAddress?: unknown;
  userAgent?: unknown;
}): AdminAssignmentOperationContext {
  const actorRole = requiredString(input.actorRole, "actorRole").toLowerCase();
  if (actorRole !== "admin" && actorRole !== "teacher") {
    throw new AdminAssignmentOperationValidationError(
      "FORBIDDEN",
      "Assignment operations require the teacher or admin role.",
    );
  }
  return {
    actorId: requiredString(input.actorId, "actorId"),
    actorRole,
    instituteId: requiredString(input.instituteId, "instituteId"),
    ...(optionalString(input.ipAddress) ? {
      ipAddress: optionalString(input.ipAddress),
    } : {}),
    ...(optionalString(input.userAgent) ? {
      userAgent: optionalString(input.userAgent),
    } : {}),
  };
}

function lifecycleStatus(value: unknown): AdminRunLifecycleStatus {
  const normalized = requiredString(value, "status").toLowerCase();
  if (normalized === "stopped") {
    return "terminated";
  }
  if (
    normalized === "scheduled" ||
    normalized === "active" ||
    normalized === "collecting" ||
    normalized === "completed" ||
    normalized === "archived" ||
    normalized === "cancelled" ||
    normalized === "terminated"
  ) {
    return normalized;
  }
  throw new AdminAssignmentOperationValidationError(
    "CONFLICT",
    `Persisted run status "${normalized}" is unsupported.`,
  );
}

function runMode(value: unknown): AdminRunMode {
  if (
    value === "Operational" ||
    value === "Diagnostic" ||
    value === "Controlled" ||
    value === "Hard"
  ) {
    return value;
  }
  throw new AdminAssignmentOperationValidationError(
    "CONFLICT",
    "Persisted run mode is unsupported.",
  );
}

function proctoringPolicy(value: unknown): AdminRunProctoringPolicy {
  if (!isRecord(value) ||
    typeof value.browserIntegrityGuardEnabled !== "boolean" ||
    typeof value.faceIdentityGazeGuardEnabled !== "boolean") {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Persisted run proctoring policy is invalid.",
    );
  }
  return {
    browserIntegrityGuardEnabled: value.browserIntegrityGuardEnabled,
    faceIdentityGazeGuardEnabled: value.faceIdentityGazeGuardEnabled,
  };
}

function runRevision(data: Record<string, unknown>): number {
  return typeof data.revision === "number" &&
    Number.isInteger(data.revision) && data.revision > 0 ? data.revision : 1;
}

function sessionRevision(data: Record<string, unknown>): number {
  if (typeof data.revision === "number" && Number.isInteger(data.revision) &&
    data.revision > 0) {
    return data.revision;
  }
  return typeof data.version === "number" && Number.isInteger(data.version) &&
    data.version > 0 ? data.version : 1;
}

type PersistedSessionStatus =
  "created" | "started" | "active" | "submitted" | "expired" | "terminated";

function sessionStatus(value: unknown): PersistedSessionStatus {
  const normalized = requiredString(value, "session.status").toLowerCase();
  if (normalized === "created" || normalized === "started" ||
    normalized === "active" || normalized === "submitted" ||
    normalized === "expired" || normalized === "terminated") {
    return normalized;
  }
  throw new AdminAssignmentOperationValidationError(
    "CONFLICT",
    `Persisted session status "${normalized}" is unsupported.`,
  );
}

function emailAddress(value: unknown, studentId: string): string {
  const normalized = requiredString(value, `students.${studentId}.email`, 320)
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Assignment recipient "${studentId}" has no valid email address.`,
    );
  }
  return normalized;
}

function assertSessionOwnership(input: {
  data: Record<string, unknown>;
  instituteId: string;
  recipientStudentIds: string[];
  runId: string;
  sessionId: string;
  yearId: string;
}): string {
  const storedInstituteId = requiredString(input.data.instituteId, "session.instituteId");
  const storedYearId = requiredString(input.data.yearId, "session.yearId");
  const storedRunId = requiredString(input.data.runId, "session.runId");
  const storedSessionId = requiredString(input.data.sessionId, "session.sessionId");
  const studentId = requiredString(input.data.studentId, "session.studentId");
  if (storedInstituteId !== input.instituteId || storedYearId !== input.yearId ||
    storedRunId !== input.runId || storedSessionId !== input.sessionId ||
    !input.recipientStudentIds.includes(studentId)) {
    throw new AdminAssignmentOperationValidationError(
      "FORBIDDEN",
      `Session "${input.sessionId}" is outside the targeted assignment authority.`,
    );
  }
  return studentId;
}

export function toVersionedRunRecord(
  runId: string,
  runPath: string,
  data: Record<string, unknown>,
): AdminRunVersionedRecord {
  const recipients = stringArray(data.recipientStudentIds, "recipientStudentIds");
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt :
    timestamp(data.createdAt, "createdAt");
  return {
    academicYear: requiredString(data.academicYear, "academicYear"),
    attemptLimit: positiveInteger(data.attemptLimit, "attemptLimit"),
    canonicalId: requiredString(data.canonicalId, "canonicalId"),
    createdAt: timestamp(data.createdAt, "createdAt").toDate().toISOString(),
    endWindow: timestamp(data.endWindow, "endWindow").toDate().toISOString(),
    gracePeriodMinutes: typeof data.gracePeriodMinutes === "number" &&
      Number.isInteger(data.gracePeriodMinutes) && data.gracePeriodMinutes >= 0 ?
      data.gracePeriodMinutes : 0,
    id: runId,
    mode: runMode(data.mode),
    proctoringPolicy: proctoringPolicy(data.proctoringPolicy),
    recipientCount: recipients.length,
    recipientStudentIds: recipients,
    revision: runRevision(data),
    runPath,
    shuffleQuestionOrder: data.shuffleQuestionOrder === true,
    startWindow: timestamp(data.startWindow, "startWindow").toDate().toISOString(),
    status: lifecycleStatus(data.status),
    templateVersion: positiveInteger(Number(data.templateVersion), "templateVersion"),
    testId: requiredString(data.testId, "testId"),
    timezone: requiredString(data.timezone, "timezone"),
    updatedAt: updatedAt.toDate().toISOString(),
  };
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

function commandAuthority(input: {
  command: string;
  context: AdminAssignmentOperationContext;
  idempotencyKey: string;
  semantics: Record<string, unknown>;
}): CommandAuthority {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  return {
    auditId: `assignment_operation_${sha256(
      `${input.context.instituteId}:${input.command}:${idempotencyKeyHash}`,
    ).slice(0, 40)}`,
    idempotencyKeyHash,
    requestFingerprint: sha256(stableJson(input.semantics)),
  };
}

function replayResult<TResult extends {disposition: "applied" | "replayed"}>(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  fingerprint: string,
): TResult | null {
  if (!snapshot.exists) {
    return null;
  }
  const metadata = snapshot.get("metadata");
  if (!isRecord(metadata) || metadata.requestFingerprint !== fingerprint) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Idempotency key has already been used with different semantics.",
    );
  }
  if (!isRecord(metadata.result)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Assignment operation audit is missing its immutable replay result.",
    );
  }
  return {...metadata.result, disposition: "replayed"} as TResult;
}

function auditDocument(input: {
  actionType: string;
  authority: CommandAuthority;
  before: Record<string, unknown>;
  command: string;
  context: AdminAssignmentOperationContext;
  result: object;
  runId: string;
  timestamp: Timestamp;
}): Record<string, unknown> {
  return {
    actionType: input.actionType,
    actorId: input.context.actorId,
    actorRole: input.context.actorRole,
    actorUid: input.context.actorId,
    after: input.result,
    auditId: input.authority.auditId,
    before: input.before,
    entityId: input.runId,
    entityType: "assignment",
    instituteId: input.context.instituteId,
    ...(input.context.ipAddress ? {ipAddress: input.context.ipAddress} : {}),
    layer: "L0",
    metadata: {
      command: input.command,
      idempotencyKeyHash: input.authority.idempotencyKeyHash,
      requestFingerprint: input.authority.requestFingerprint,
      result: input.result,
      source: "AdminAssignmentOperationsService",
    },
    targetCollection: RUNS_COLLECTION,
    targetId: input.runId,
    tenantId: input.context.instituteId,
    timestamp: input.timestamp,
    ...(input.context.userAgent ? {userAgent: input.context.userAgent} : {}),
  };
}

function assertOperationalYear(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  yearId: string,
): void {
  const status = String(snapshot.get("status") ?? "").trim().toLowerCase();
  if (!snapshot.exists ||
    (status !== "active" && status !== "started" && status !== "scheduled")) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Academic year "${yearId}" is not operational.`,
    );
  }
}

function assertExpectedRevision(
  data: Record<string, unknown>,
  expectedRevision: number,
  runId: string,
): number {
  const currentRevision = runRevision(data);
  if (currentRevision !== expectedRevision) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Run "${runId}" revision conflict: expected ${expectedRevision}, ` +
        `current revision is ${currentRevision}.`,
    );
  }
  return currentRevision;
}

function licenseLayer(value: unknown): LicenseLayer {
  if (value === "L0" || value === "L1" || value === "L2" || value === "L3") {
    return value;
  }
  throw new AdminAssignmentOperationValidationError(
    "CONFLICT",
    "Institute license has no supported current layer.",
  );
}

function assertLicenseAllowsRun(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  mode: AdminRunMode,
): LicenseLayer {
  if (!snapshot.exists) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Institute license is required for assignment operations.",
    );
  }
  const currentLayer = licenseLayer(snapshot.get("currentLayer"));
  if (LAYER_ORDER[currentLayer] < LAYER_ORDER[MODE_REQUIRED_LAYERS[mode]]) {
    throw new AdminAssignmentOperationValidationError(
      "FORBIDDEN",
      `Assignment mode "${mode}" is not licensed at ${currentLayer}.`,
    );
  }
  const flags = isRecord(snapshot.get("featureFlags")) ?
    snapshot.get("featureFlags") as Record<string, unknown> : {};
  if ((mode === "Controlled" && flags.controlledMode === false) ||
    (mode === "Hard" && flags.hardMode === false)) {
    throw new AdminAssignmentOperationValidationError(
      "FORBIDDEN",
      `Assignment mode "${mode}" is disabled by license feature flags.`,
    );
  }
  return currentLayer;
}

function sourceRun(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  runId: string,
): Record<string, unknown> {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    throw new AdminAssignmentOperationValidationError(
      "NOT_FOUND",
      `Run "${runId}" was not found in the current academic year.`,
    );
  }
  return snapshot.data() as Record<string, unknown>;
}

function assertRecipientsActive(
  snapshots: FirebaseFirestore.DocumentSnapshot[],
  ids: string[],
): void {
  snapshots.forEach((snapshot, index) => {
    if (!snapshot.exists || snapshot.get("deleted") === true ||
      String(snapshot.get("status") ?? "").toLowerCase() !== "active") {
      throw new AdminAssignmentOperationValidationError(
        "CONFLICT",
        `Assignment recipient "${ids[index]}" is not an active student.`,
      );
    }
  });
}

function derivedRunData(input: {
  actorId: string;
  command: DerivedCommand;
  currentLayer: LicenseLayer;
  endWindow: Timestamp;
  fingerprint: string;
  idempotencyKeyHash: string;
  now: Timestamp;
  recipientStudentIds: string[];
  runId: string;
  source: Record<string, unknown>;
  sourceRevision: number;
  sourceRunId: string;
  startWindow: Timestamp;
  timezone: string;
  yearId: string;
}): Record<string, unknown> {
  const difficultyDistribution = input.source.difficultyDistribution;
  const phaseConfigSnapshot = input.source.phaseConfigSnapshot;
  const timingProfileSnapshot = input.source.timingProfileSnapshot;
  if (!isRecord(difficultyDistribution) || !isRecord(phaseConfigSnapshot) ||
    !isRecord(timingProfileSnapshot)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Source run is missing its frozen assignment snapshots.",
    );
  }
  const questionIds = stringArray(input.source.questionIds, "questionIds");
  if (questionIds.length < 1) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Source run must contain at least one frozen question id.",
    );
  }
  return {
    academicYear: input.yearId,
    attemptLimit: input.source.attemptLimit,
    calibrationVersion: requiredString(
      input.source.calibrationVersion,
      "calibrationVersion",
    ),
    canonicalId: input.source.canonicalId,
    createdAt: input.now,
    createdBy: input.actorId,
    derivedCommand: input.command,
    difficultyDistribution,
    endWindow: input.endWindow,
    gracePeriodMinutes: input.source.gracePeriodMinutes,
    idempotencyKeyHash: input.idempotencyKeyHash,
    licenseLayer: input.currentLayer,
    mode: input.source.mode,
    modeSnapshot: input.source.modeSnapshot ?? input.source.mode,
    phaseConfigSnapshot,
    proctoringPolicy: input.source.proctoringPolicy,
    questionIds,
    recipientCount: input.recipientStudentIds.length,
    recipientStudentIds: input.recipientStudentIds,
    requestFingerprint: input.fingerprint,
    revision: 1,
    riskModelVersion: requiredString(
      input.source.riskModelVersion,
      "riskModelVersion",
    ),
    runId: input.runId,
    shuffleEnabled: input.source.shuffleEnabled ?? input.source.shuffleQuestionOrder,
    shuffleQuestionOrder: input.source.shuffleQuestionOrder === true,
    sourceRunId: input.sourceRunId,
    sourceRunRevision: input.sourceRevision,
    startWindow: input.startWindow,
    status: "scheduled",
    testId: input.source.testId,
    testName: requiredString(input.source.testName, "testName"),
    templateVersion: input.source.templateVersion,
    timezone: input.timezone,
    timingProfileSnapshot,
    totalSessions: 0,
    updatedAt: input.now,
    updatedBy: input.actorId,
  };
}

export class AdminAssignmentOperationsService {
  private readonly dependencies: AdminAssignmentOperationsDependencies;

  constructor(dependencies: Partial<AdminAssignmentOperationsDependencies> = {}) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      now: dependencies.now ?? (() => Timestamp.now()),
      resolveCurrentYearId: dependencies.resolveCurrentYearId ??
        (async (instituteId) => {
          const settings = await adminSettingsService.loadSettingsSnapshot(instituteId);
          const active = settings.academicYears.find((year) => {
            const status = String(year.status);
            return status === "Active" || status === "Started" ||
              status === "Scheduled";
          });
          if (!active) {
            throw new AdminAssignmentOperationValidationError(
              "CONFLICT",
              "The institute has no current operational academic year.",
            );
          }
          return active.yearId;
        }),
      submitSession: dependencies.submitSession ??
        ((context, options) => submissionService.submitSession(context, options)),
    };
  }

  public normalizeDuplicateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    runId?: unknown;
    userAgent?: unknown;
  }): AdminRunDuplicateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    const startWindow = isoTimestamp(body.startWindow, "startWindow");
    const endWindow = isoTimestamp(body.endWindow, "endWindow");
    if (Date.parse(endWindow) <= Date.parse(startWindow)) {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        "Field \"endWindow\" must be later than startWindow.",
      );
    }
    return {
      ...normalizeContext(input),
      endWindow,
      expectedSourceRevision: positiveInteger(
        body.expectedSourceRevision,
        "expectedSourceRevision",
      ),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      runId: requiredString(input.runId, "runId"),
      startWindow,
      timezone: requiredString(body.timezone, "timezone", 128),
    };
  }

  public normalizeReassignRequest(input: Parameters<
    AdminAssignmentOperationsService["normalizeDuplicateRequest"]
  >[0]): AdminRunReassignValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...this.normalizeDuplicateRequest(input),
      recipientStudentIds: recipientIds(body.recipientStudentIds),
    };
  }

  public normalizeLifecycleRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    runId?: unknown;
    userAgent?: unknown;
  }): AdminRunLifecycleValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    const action = requiredString(body.action, "action").toLowerCase();
    if (action !== "extend" && action !== "cancel" &&
      action !== "terminate" && action !== "archive") {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        "Field \"action\" must be extend, cancel, terminate, or archive.",
      );
    }
    const base = {
      expectedRevision: positiveInteger(body.expectedRevision, "expectedRevision"),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      justification: requiredString(body.justification, "justification", 500),
    };
    return {
      ...normalizeContext(input),
      command: action === "extend" ? {
        ...base,
        action,
        extensionMinutes: positiveInteger(
          body.extensionMinutes,
          "extensionMinutes",
        ),
      } : {...base, action},
      runId: requiredString(input.runId, "runId"),
    };
  }

  public normalizeNotificationResendRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    runId?: unknown;
    userAgent?: unknown;
  }): AdminRunNotificationResendValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      expectedRevision: positiveInteger(body.expectedRevision, "expectedRevision"),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      ...(body.recipientStudentIds === undefined ? {} : {
        recipientStudentIds: recipientIds(body.recipientStudentIds),
      }),
      runId: requiredString(input.runId, "runId"),
    };
  }

  public normalizeSessionOverrideRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    runId?: unknown;
    sessionId?: unknown;
    userAgent?: unknown;
  }): AdminRunSessionOverrideValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    if (body.overrideType !== "minimum_time_bypass" &&
      body.overrideType !== "force_submit") {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        "Field \"overrideType\" must be minimum_time_bypass or force_submit.",
      );
    }
    return {
      ...normalizeContext(input),
      expectedRunRevision: positiveInteger(
        body.expectedRunRevision,
        "expectedRunRevision",
      ),
      expectedSessionRevision: positiveInteger(
        body.expectedSessionRevision,
        "expectedSessionRevision",
      ),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      justification: requiredString(body.justification, "justification", 500),
      overrideType: body.overrideType,
      runId: requiredString(input.runId, "runId"),
      sessionId: requiredString(input.sessionId, "sessionId"),
    };
  }

  public async duplicateRun(
    request: AdminRunDuplicateValidatedRequest,
  ): Promise<AdminRunDerivedCreateServiceResult> {
    return this.createDerivedRun("duplicate", request);
  }

  public async reassignRun(
    request: AdminRunReassignValidatedRequest,
  ): Promise<AdminRunDerivedCreateServiceResult> {
    return this.createDerivedRun("reassign", request);
  }

  public async applyLifecycleCommand(
    request: AdminRunLifecycleValidatedRequest,
  ): Promise<AdminRunLifecycleServiceResult> {
    if (request.command.action === "terminate") {
      return this.terminateRun(request);
    }
    const command = request.command.action as SupportedLifecycleAction;
    const extensionMinutes = request.command.action === "extend" ?
      request.command.extensionMinutes : null;
    if (extensionMinutes !== null &&
      extensionMinutes > MAX_EXTENSION_MINUTES) {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        `Field "extensionMinutes" must not exceed ${MAX_EXTENSION_MINUTES}.`,
      );
    }
    const authority = commandAuthority({
      command: `lifecycle-${command}`,
      context: request,
      idempotencyKey: request.command.idempotencyKey,
      semantics: {
        action: command,
        actorId: request.actorId,
        expectedRevision: request.command.expectedRevision,
        extensionMinutes,
        justification: request.command.justification,
        runId: request.runId,
      },
    });
    const yearId = await this.dependencies.resolveCurrentYearId(request.instituteId);
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const runReference = yearReference.collection(RUNS_COLLECTION).doc(request.runId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, yearSnapshot, runSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(yearReference),
        transaction.get(runReference),
      ]);
      const replay = replayResult<AdminRunLifecycleServiceResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      assertOperationalYear(yearSnapshot, yearId);
      const data = sourceRun(runSnapshot, request.runId);
      const revision = assertExpectedRevision(
        data,
        request.command.expectedRevision,
        request.runId,
      );
      const status = lifecycleStatus(data.status);
      const now = this.dependencies.now();
      let nextStatus = status;
      const update: Record<string, unknown> = {
        revision: revision + 1,
        updatedAt: now,
        updatedBy: request.actorId,
      };
      if (command === "extend") {
        if (status !== "active") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Only an active run may be extended.",
          );
        }
        const endWindow = timestamp(data.endWindow, "endWindow");
        update.endWindow = Timestamp.fromMillis(
          endWindow.toMillis() + (extensionMinutes ?? 0) * 60_000,
        );
      } else if (command === "cancel") {
        if (status !== "scheduled") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Only a scheduled run may be cancelled.",
          );
        }
        nextStatus = "cancelled";
        update.status = nextStatus;
      } else {
        if (status !== "completed" && status !== "cancelled" &&
          status !== "terminated") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Only a completed, cancelled, or terminated run may be archived.",
          );
        }
        nextStatus = "archived";
        update.status = nextStatus;
      }
      const updatedData = {...data, ...update};
      const result: AdminRunLifecycleServiceResult = {
        auditId: authority.auditId,
        disposition: "applied",
        recoveryState: "complete",
        run: toVersionedRunRecord(request.runId, runReference.path, updatedData),
      };
      transaction.update(runReference, update);
      transaction.create(auditReference, auditDocument({
        actionType: command === "extend" ? "EXTEND_ASSIGNMENT" :
          command === "cancel" ? "CANCEL_ASSIGNMENT" : "ARCHIVE_ASSIGNMENT",
        authority,
        before: {
          endWindow: timestamp(data.endWindow, "endWindow").toDate().toISOString(),
          revision,
          status,
        },
        command: `lifecycle-${command}`,
        context: request,
        result,
        runId: request.runId,
        timestamp: now,
      }));
      return result;
    });
  }

  public async resendRunNotifications(
    request: AdminRunNotificationResendValidatedRequest,
  ): Promise<AdminRunNotificationResendServiceResult> {
    const requestedRecipients = request.recipientStudentIds ?
      [...request.recipientStudentIds].sort() : null;
    const authority = commandAuthority({
      command: "notification-resend",
      context: request,
      idempotencyKey: request.idempotencyKey,
      semantics: {
        actorId: request.actorId,
        expectedRevision: request.expectedRevision,
        recipientStudentIds: requestedRecipients,
        runId: request.runId,
      },
    });
    const yearId = await this.dependencies.resolveCurrentYearId(request.instituteId);
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const runReference = yearReference.collection(RUNS_COLLECTION).doc(request.runId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, yearSnapshot, runSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(yearReference),
        transaction.get(runReference),
      ]);
      const replay = replayResult<AdminRunNotificationResendServiceResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      assertOperationalYear(yearSnapshot, yearId);
      const data = sourceRun(runSnapshot, request.runId);
      const revision = assertExpectedRevision(
        data,
        request.expectedRevision,
        request.runId,
      );
      const status = lifecycleStatus(data.status);
      if (status !== "scheduled" && status !== "active") {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Assignment notifications may be resent only for scheduled or active runs.",
        );
      }
      const assignedRecipients = stringArray(
        data.recipientStudentIds,
        "recipientStudentIds",
      );
      if (assignedRecipients.length < 1 || assignedRecipients.length > MAX_RECIPIENTS ||
        new Set(assignedRecipients).size !== assignedRecipients.length) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Run recipients must contain 1 to ${MAX_RECIPIENTS} unique ids.`,
        );
      }
      const recipients = requestedRecipients ?? [...assignedRecipients].sort();
      if (recipients.some((studentId) => !assignedRecipients.includes(studentId))) {
        throw new AdminAssignmentOperationValidationError(
          "FORBIDDEN",
          "Notification resend targets must belong to the assignment recipients.",
        );
      }
      const studentReferences = recipients.map((studentId) =>
        institute.collection(STUDENTS_COLLECTION).doc(studentId),
      );
      const studentSnapshots = await transaction.getAll(...studentReferences);
      assertRecipientsActive(studentSnapshots, recipients);
      const recipientRows = studentSnapshots.map((snapshot, index) => ({
        email: emailAddress(snapshot.get("email"), recipients[index]),
        fullName: typeof snapshot.get("fullName") === "string" &&
          snapshot.get("fullName").trim() ? snapshot.get("fullName").trim() :
          typeof snapshot.get("name") === "string" && snapshot.get("name").trim() ?
            snapshot.get("name").trim() : recipients[index],
        studentId: recipients[index],
      }));
      const now = this.dependencies.now();
      const result: AdminRunNotificationResendServiceResult = {
        auditId: authority.auditId,
        disposition: "applied",
        queuedNotificationCount: recipientRows.length,
        recipientCount: recipientRows.length,
        recoveryState: "complete",
        runId: request.runId,
      };
      recipientRows.forEach((recipient) => {
        const jobId = `assignment_notification_${sha256(
          `${authority.auditId}:${recipient.studentId}`,
        ).slice(0, 40)}`;
        transaction.create(
          this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(jobId),
          {
            createdAt: now,
            instituteId: request.instituteId,
            payload: {
              endWindow: timestamp(data.endWindow, "endWindow").toDate().toISOString(),
              fullName: recipient.fullName,
              instituteId: request.instituteId,
              runId: request.runId,
              startWindow: timestamp(data.startWindow, "startWindow").toDate().toISOString(),
              studentId: recipient.studentId,
              testName: requiredString(data.testName, "testName"),
              timezone: requiredString(data.timezone, "timezone"),
              yearId,
            },
            recipientEmail: recipient.email,
            retryCount: 0,
            sentAt: null,
            status: "pending",
            subject: ASSIGNMENT_NOTIFICATION_TEMPLATE,
            templateType: ASSIGNMENT_NOTIFICATION_TEMPLATE,
          },
        );
      });
      transaction.update(runReference, {
        lastNotificationResendAt: now,
        lastNotificationRecipientCount: recipientRows.length,
        revision: revision + 1,
        updatedAt: now,
        updatedBy: request.actorId,
      });
      transaction.create(auditReference, auditDocument({
        actionType: "RESEND_ASSIGNMENT_NOTIFICATION",
        authority,
        before: {revision, status},
        command: "notification-resend",
        context: request,
        result,
        runId: request.runId,
        timestamp: now,
      }));
      return result;
    });
  }

  public async applySessionOverride(
    request: AdminRunSessionOverrideValidatedRequest,
  ): Promise<AdminRunSessionOverrideServiceResult> {
    const authority = commandAuthority({
      command: "session-override",
      context: request,
      idempotencyKey: request.idempotencyKey,
      semantics: {
        actorId: request.actorId,
        expectedRunRevision: request.expectedRunRevision,
        expectedSessionRevision: request.expectedSessionRevision,
        justification: request.justification,
        overrideType: request.overrideType,
        runId: request.runId,
        sessionId: request.sessionId,
      },
    });
    const yearId = await this.dependencies.resolveCurrentYearId(request.instituteId);
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const runReference = yearReference.collection(RUNS_COLLECTION).doc(request.runId);
    const sessionReference = runReference.collection(SESSIONS_COLLECTION)
      .doc(request.sessionId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);
    const overrideId = `assignment_override_${sha256(authority.auditId).slice(0, 40)}`;
    const overrideReference = institute.collection(OVERRIDE_LOGS_COLLECTION)
      .doc(overrideId);
    const recoveryReference = institute.collection(OPERATION_RECOVERY_COLLECTION)
      .doc(overrideId);

    const accepted = await this.dependencies.firestore.runTransaction(
      async (transaction) => {
        const [auditSnapshot, overrideSnapshot, recoverySnapshot, yearSnapshot,
          runSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(auditReference),
          transaction.get(overrideReference),
          transaction.get(recoveryReference),
          transaction.get(yearReference),
          transaction.get(runReference),
          transaction.get(sessionReference),
        ]);
        const replay = replayResult<AdminRunSessionOverrideServiceResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return {replay, studentId: ""};
        }
        if (!sessionSnapshot.exists || !isRecord(sessionSnapshot.data())) {
          throw new AdminAssignmentOperationValidationError(
            "NOT_FOUND",
            `Session "${request.sessionId}" was not found in the targeted run.`,
          );
        }
        const sessionData = sessionSnapshot.data() as Record<string, unknown>;
        if (recoverySnapshot.exists) {
          if (recoverySnapshot.get("requestFingerprint") !== authority.requestFingerprint) {
            throw new AdminAssignmentOperationValidationError(
              "CONFLICT",
              "Idempotency key has already been used with different override semantics.",
            );
          }
          if (request.overrideType !== "force_submit") {
            throw new AdminAssignmentOperationValidationError(
              "CONFLICT",
              "Completed override authority is missing its immutable audit.",
            );
          }
          const runData = sourceRun(runSnapshot, request.runId);
          const studentId = assertSessionOwnership({
            data: sessionData,
            instituteId: request.instituteId,
            recipientStudentIds: stringArray(
              runData.recipientStudentIds,
              "recipientStudentIds",
            ),
            runId: request.runId,
            sessionId: request.sessionId,
            yearId,
          });
          return {replay: null, studentId};
        }
        if (overrideSnapshot.exists) {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Immutable override log exists without its command audit.",
          );
        }
        assertOperationalYear(yearSnapshot, yearId);
        const runData = sourceRun(runSnapshot, request.runId);
        const runCurrentRevision = assertExpectedRevision(
          runData,
          request.expectedRunRevision,
          request.runId,
        );
        const runCurrentStatus = lifecycleStatus(runData.status);
        if (runCurrentStatus !== "active" && runCurrentStatus !== "collecting") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Session overrides require an active or collecting run.",
          );
        }
        const studentId = assertSessionOwnership({
          data: sessionData,
          instituteId: request.instituteId,
          recipientStudentIds: stringArray(runData.recipientStudentIds, "recipientStudentIds"),
          runId: request.runId,
          sessionId: request.sessionId,
          yearId,
        });
        const currentSessionRevision = sessionRevision(sessionData);
        if (currentSessionRevision !== request.expectedSessionRevision) {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            `Session "${request.sessionId}" revision conflict: expected ` +
              `${request.expectedSessionRevision}, current revision is ` +
              `${currentSessionRevision}.`,
          );
        }
        const currentSessionStatus = sessionStatus(sessionData.status);
        if (request.overrideType === "minimum_time_bypass" &&
          currentSessionStatus !== "active") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Minimum-time bypass requires an active session.",
          );
        }
        if (request.overrideType === "force_submit" &&
          currentSessionStatus !== "active" && currentSessionStatus !== "expired") {
          throw new AdminAssignmentOperationValidationError(
            "CONFLICT",
            "Force-submit requires an active or expired session.",
          );
        }
        const now = this.dependencies.now();
        const nextSessionRevision = currentSessionRevision + 1;
        const recoveryState = request.overrideType === "force_submit" ?
          "pending" : "complete";
        const overrideType = request.overrideType === "force_submit" ?
          "FORCE_SUBMIT" : "MIN_TIME_BYPASS";
        const sessionUpdate: Record<string, unknown> = {
          overrideUsed: true,
          revision: nextSessionRevision,
          submissionTimingOverride: {
            active: true,
            grantedAt: now,
            grantedBy: request.actorId,
            overrideId,
            type: request.overrideType,
          },
          updatedAt: now,
        };
        if (request.overrideType === "force_submit") {
          sessionUpdate.submissionLock = true;
          sessionUpdate.submissionLockOwnerId = overrideId;
        }
        transaction.update(runReference, {
          lastSessionOverrideAt: now,
          revision: runCurrentRevision + 1,
          updatedAt: now,
          updatedBy: request.actorId,
        });
        transaction.update(sessionReference, sessionUpdate);
        const result: AdminRunSessionOverrideServiceResult = {
          auditId: authority.auditId,
          disposition: "applied",
          overrideId,
          overrideUsed: true,
          recoveryState: "complete",
          runId: request.runId,
          sessionId: request.sessionId,
          sessionRevision: nextSessionRevision,
          sessionStatus: currentSessionStatus,
        };
        const overrideDocument = {
          acceptedAt: now,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          instituteId: request.instituteId,
          justification: request.justification,
          overrideId,
          overrideType,
          performedBy: request.actorId,
          recoveryState,
          requestFingerprint: authority.requestFingerprint,
          runId: request.runId,
          sessionId: request.sessionId,
          sessionRevision: nextSessionRevision,
          studentId,
          timestamp: now,
        };
        if (request.overrideType === "minimum_time_bypass") {
          transaction.create(overrideReference, {
            ...overrideDocument,
            completedAt: now,
            recoveryState: "complete",
          });
          transaction.create(auditReference, auditDocument({
            actionType: "OVERRIDE_ASSIGNMENT_SESSION",
            authority,
            before: {
              runRevision: runCurrentRevision,
              sessionRevision: currentSessionRevision,
              sessionStatus: currentSessionStatus,
            },
            command: "session-override",
            context: request,
            result,
            runId: request.runId,
            timestamp: now,
          }));
          return {replay: result, studentId};
        }
        transaction.create(recoveryReference, {
          ...overrideDocument,
          completedAt: null,
          recoveryState,
        });
        return {replay: null, studentId};
      },
    );
    if (accepted.replay) {
      return accepted.replay;
    }

    try {
      await this.dependencies.submitSession({
        instituteId: request.instituteId,
        reason: "manual",
        runId: request.runId,
        sessionId: request.sessionId,
        studentId: accepted.studentId,
        yearId,
      }, {lockOwnerId: overrideId});
    } catch (error) {
      await this.dependencies.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(recoveryReference);
        if (snapshot.exists &&
          snapshot.get("requestFingerprint") === authority.requestFingerprint &&
          snapshot.get("recoveryState") !== "complete") {
          transaction.update(recoveryReference, {
            lastFailureCode: error instanceof Error ? error.name : "Error",
            recoveryState: "failed_recoverable",
            updatedAt: this.dependencies.now(),
          });
        }
      });
      throw error;
    }

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, overrideSnapshot, recoverySnapshot,
        sessionSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(overrideReference),
        transaction.get(recoveryReference),
        transaction.get(sessionReference),
      ]);
      const replay = replayResult<AdminRunSessionOverrideServiceResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      if (!recoverySnapshot.exists ||
        recoverySnapshot.get("requestFingerprint") !== authority.requestFingerprint) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Force-submit override authority is unavailable for recovery.",
        );
      }
      if (!sessionSnapshot.exists || !isRecord(sessionSnapshot.data())) {
        throw new AdminAssignmentOperationValidationError(
          "NOT_FOUND",
          `Session "${request.sessionId}" was not found during override recovery.`,
        );
      }
      const sessionData = sessionSnapshot.data() as Record<string, unknown>;
      const currentSessionStatus = sessionStatus(sessionData.status);
      if (currentSessionStatus !== "submitted") {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Force-submit did not produce an authoritative submitted session.",
        );
      }
      const now = this.dependencies.now();
      const result: AdminRunSessionOverrideServiceResult = {
        auditId: authority.auditId,
        disposition: "applied",
        overrideId,
        overrideUsed: true,
        recoveryState: "complete",
        runId: request.runId,
        sessionId: request.sessionId,
        sessionRevision: sessionRevision(sessionData),
        sessionStatus: "submitted",
      };
      if (overrideSnapshot.exists) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Immutable override log exists without its completion audit.",
        );
      }
      transaction.update(recoveryReference, {
        completedAt: now,
        recoveryState: "complete",
        updatedAt: now,
      });
      transaction.create(overrideReference, {
        acceptedAt: recoverySnapshot.get("acceptedAt"),
        completedAt: now,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        justification: request.justification,
        overrideId,
        overrideType: "FORCE_SUBMIT",
        performedBy: request.actorId,
        recoveryState: "complete",
        requestFingerprint: authority.requestFingerprint,
        runId: request.runId,
        sessionId: request.sessionId,
        sessionRevision: sessionRevision(sessionData),
        studentId: accepted.studentId,
        timestamp: now,
      });
      transaction.create(auditReference, auditDocument({
        actionType: "OVERRIDE_ASSIGNMENT_SESSION",
        authority,
        before: {
          runRevision: request.expectedRunRevision,
          sessionRevision: request.expectedSessionRevision,
          sessionStatus: "active_or_expired",
        },
        command: "session-override",
        context: request,
        result,
        runId: request.runId,
        timestamp: now,
      }));
      return result;
    });
  }

  public async reconcileRunLifecycle(
    request: AdminRunLifecycleReconciliationRequest,
  ): Promise<AdminRunLifecycleReconciliationResult> {
    const context: AdminAssignmentOperationContext = {
      actorId: requiredString(request.actorId, "actorId"),
      actorRole: requiredString(request.actorRole, "actorRole").toLowerCase(),
      instituteId: requiredString(request.instituteId, "instituteId"),
    };
    const runId = requiredString(request.runId, "runId");
    const yearId = await this.dependencies.resolveCurrentYearId(context.instituteId);
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(context.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const runReference = yearReference.collection(RUNS_COLLECTION).doc(runId);
    const analyticsReference = yearReference.collection(RUN_ANALYTICS_COLLECTION)
      .doc(runId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [yearSnapshot, runSnapshot, analyticsSnapshot] = await Promise.all([
        transaction.get(yearReference),
        transaction.get(runReference),
        transaction.get(analyticsReference),
      ]);
      assertOperationalYear(yearSnapshot, yearId);
      const data = sourceRun(runSnapshot, runId);
      const rawStatus = String(data.status ?? "").trim().toLowerCase();
      const status = lifecycleStatus(rawStatus);
      const revision = runRevision(data);
      const now = this.dependencies.now();
      const analyticsStatus = String(analyticsSnapshot.get("status") ?? "")
        .trim().toLowerCase();
      const completionRate = Number(
        analyticsSnapshot.get("completionRatePercent") ??
        analyticsSnapshot.get("completionRate") ?? 0,
      );
      let nextStatus: AdminRunLifecycleStatus | null = null;
      if (rawStatus === "stopped") {
        nextStatus = "terminated";
      } else if (status === "scheduled" &&
        now.toMillis() >= timestamp(data.startWindow, "startWindow").toMillis()) {
        nextStatus = "active";
      } else if ((status === "active" || status === "collecting") &&
        (analyticsStatus === "completed" || completionRate >= 100)) {
        nextStatus = "completed";
      } else if (status === "active" &&
        now.toMillis() > timestamp(data.endWindow, "endWindow").toMillis()) {
        nextStatus = "collecting";
      }
      if (!nextStatus) {
        return {
          auditId: null,
          disposition: "unchanged",
          run: toVersionedRunRecord(runId, runReference.path, data),
        };
      }
      const authority = commandAuthority({
        command: "lifecycle-reconcile",
        context,
        idempotencyKey: `${runId}:${revision}:${status}:${nextStatus}`,
        semantics: {revision, runId, sourceStatus: status, targetStatus: nextStatus},
      });
      const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
        .doc(authority.auditId);
      const auditSnapshot = await transaction.get(auditReference);
      if (auditSnapshot.exists) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Lifecycle reconciliation audit already exists without its run update.",
        );
      }
      const update = {
        revision: revision + 1,
        status: nextStatus,
        updatedAt: now,
        updatedBy: context.actorId,
      };
      const result: AdminRunLifecycleReconciliationResult = {
        auditId: authority.auditId,
        disposition: "applied",
        run: toVersionedRunRecord(runId, runReference.path, {...data, ...update}),
      };
      transaction.update(runReference, update);
      transaction.create(auditReference, auditDocument({
        actionType: "RECONCILE_ASSIGNMENT_LIFECYCLE",
        authority,
        before: {revision, status},
        command: "lifecycle-reconcile",
        context,
        result,
        runId,
        timestamp: now,
      }));
      return result;
    });
  }

  private async terminateRun(
    request: AdminRunLifecycleValidatedRequest,
  ): Promise<AdminRunLifecycleServiceResult> {
    if (request.command.action !== "terminate") {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        "Termination authority requires the terminate lifecycle action.",
      );
    }
    const authority = commandAuthority({
      command: "lifecycle-terminate",
      context: request,
      idempotencyKey: request.command.idempotencyKey,
      semantics: {
        action: "terminate",
        actorId: request.actorId,
        expectedRevision: request.command.expectedRevision,
        justification: request.command.justification,
        runId: request.runId,
      },
    });
    const yearId = await this.dependencies.resolveCurrentYearId(request.instituteId);
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const runReference = yearReference.collection(RUNS_COLLECTION).doc(request.runId);
    const analyticsReference = yearReference.collection(RUN_ANALYTICS_COLLECTION)
      .doc(request.runId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);
    const sessionsQuery = runReference.collection(SESSIONS_COLLECTION)
      .limit(MAX_RECIPIENTS + 1);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, yearSnapshot, runSnapshot, analyticsSnapshot,
        sessionsSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(yearReference),
        transaction.get(runReference),
        transaction.get(analyticsReference),
        transaction.get(sessionsQuery),
      ]);
      const replay = replayResult<AdminRunLifecycleServiceResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      assertOperationalYear(yearSnapshot, yearId);
      const data = sourceRun(runSnapshot, request.runId);
      const revision = assertExpectedRevision(
        data,
        request.command.expectedRevision,
        request.runId,
      );
      const status = lifecycleStatus(data.status);
      if (status !== "active" && status !== "collecting") {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Only an active or collecting run may be terminated.",
        );
      }
      if (sessionsSnapshot.size > MAX_RECIPIENTS) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Run termination is bounded to ${MAX_RECIPIENTS} session documents.`,
        );
      }
      const recipients = stringArray(data.recipientStudentIds, "recipientStudentIds");
      const now = this.dependencies.now();
      let terminatedSessionCount = 0;
      sessionsSnapshot.docs.forEach((snapshot) => {
        const sessionData = snapshot.data();
        assertSessionOwnership({
          data: sessionData,
          instituteId: request.instituteId,
          recipientStudentIds: recipients,
          runId: request.runId,
          sessionId: snapshot.id,
          yearId,
        });
        const currentStatus = sessionStatus(sessionData.status);
        if (currentStatus === "submitted" || currentStatus === "terminated") {
          return;
        }
        terminatedSessionCount += 1;
        transaction.update(snapshot.ref, {
          revision: sessionRevision(sessionData) + 1,
          status: "terminated",
          submissionLock: false,
          submissionLockOwnerId: FieldValue.delete(),
          terminatedAt: now,
          terminationAuditId: authority.auditId,
          terminationReason: request.command.justification,
          terminatedBy: request.actorId,
          updatedAt: now,
        });
      });
      const update = {
        revision: revision + 1,
        status: "terminated" as const,
        terminatedAt: now,
        terminationReason: request.command.justification,
        updatedAt: now,
        updatedBy: request.actorId,
      };
      const result: AdminRunLifecycleServiceResult = {
        auditId: authority.auditId,
        disposition: "applied",
        recoveryState: "complete",
        run: toVersionedRunRecord(
          request.runId,
          runReference.path,
          {...data, ...update},
        ),
      };
      transaction.update(runReference, update);
      if (analyticsSnapshot.exists) {
        transaction.update(analyticsReference, {
          status: "terminated",
          updatedAt: now,
        });
      }
      transaction.create(auditReference, auditDocument({
        actionType: "TERMINATE_ASSIGNMENT",
        authority,
        before: {revision, status, terminatedSessionCount},
        command: "lifecycle-terminate",
        context: request,
        result,
        runId: request.runId,
        timestamp: now,
      }));
      return result;
    });
  }

  private async createDerivedRun(
    command: DerivedCommand,
    request: AdminRunDuplicateValidatedRequest | AdminRunReassignValidatedRequest,
  ): Promise<AdminRunDerivedCreateServiceResult> {
    const recipientsOverride = command === "reassign" ?
      (request as AdminRunReassignValidatedRequest).recipientStudentIds : null;
    const authority = commandAuthority({
      command,
      context: request,
      idempotencyKey: request.idempotencyKey,
      semantics: {
        actorId: request.actorId,
        endWindow: request.endWindow,
        expectedSourceRevision: request.expectedSourceRevision,
        recipientStudentIds: recipientsOverride ? [...recipientsOverride].sort() : null,
        sourceRunId: request.runId,
        startWindow: request.startWindow,
        timezone: request.timezone,
      },
    });
    const now = this.dependencies.now();
    const startWindow = Timestamp.fromDate(new Date(request.startWindow));
    const endWindow = Timestamp.fromDate(new Date(request.endWindow));
    if (startWindow.toMillis() <= now.toMillis()) {
      throw new AdminAssignmentOperationValidationError(
        "VALIDATION_ERROR",
        "Derived run startWindow must be in the future.",
      );
    }
    const yearId = await this.dependencies.resolveCurrentYearId(request.instituteId);
    const derivedRunId = `run_${sha256(
      `${request.instituteId}:${yearId}:${command}:${authority.idempotencyKeyHash}`,
    ).slice(0, 32)}`;
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const yearReference = institute.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const sourceReference = yearReference.collection(RUNS_COLLECTION).doc(request.runId);
    const targetReference = yearReference.collection(RUNS_COLLECTION).doc(derivedRunId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, yearSnapshot, sourceSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(yearReference),
        transaction.get(sourceReference),
      ]);
      const replay = replayResult<AdminRunDerivedCreateServiceResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      assertOperationalYear(yearSnapshot, yearId);
      const source = sourceRun(sourceSnapshot, request.runId);
      const sourceRevision = assertExpectedRevision(
        source,
        request.expectedSourceRevision,
        request.runId,
      );
      if (requiredString(source.academicYear, "academicYear") !== yearId) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Source run does not belong to the current academic year.",
        );
      }
      lifecycleStatus(source.status);
      const mode = runMode(source.mode);
      const recipients = recipientsOverride ??
        stringArray(source.recipientStudentIds, "recipientStudentIds");
      if (recipients.length < 1 || recipients.length > MAX_RECIPIENTS) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Derived run recipient count must be between 1 and ${MAX_RECIPIENTS}.`,
        );
      }
      const testId = requiredString(source.testId, "testId");
      const templateReference = institute.collection(TESTS_COLLECTION).doc(testId);
      const licenseMainReference = institute.collection(LICENSE_COLLECTION).doc("main");
      const licenseCurrentReference = institute.collection(LICENSE_COLLECTION)
        .doc("current");
      const studentReferences = recipients.map((studentId) =>
        institute.collection(STUDENTS_COLLECTION).doc(studentId),
      );
      const [targetSnapshot, templateSnapshot, licenseMainSnapshot,
        licenseCurrentSnapshot, ...studentSnapshots] = await transaction.getAll(
        targetReference,
        templateReference,
        licenseMainReference,
        licenseCurrentReference,
        ...studentReferences,
      );
      if (targetSnapshot.exists) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Derived run exists without its immutable command audit.",
        );
      }
      if (!templateSnapshot.exists ||
        !["ready", "assigned"].includes(
          String(templateSnapshot.get("status") ?? "").toLowerCase(),
        )) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Template "${testId}" is no longer assignment-ready.`,
        );
      }
      const licenseSnapshot = licenseMainSnapshot.exists ?
        licenseMainSnapshot : licenseCurrentSnapshot;
      const currentLayer = assertLicenseAllowsRun(licenseSnapshot, mode);
      assertRecipientsActive(studentSnapshots, recipients);
      const newRunData = derivedRunData({
        actorId: request.actorId,
        command,
        currentLayer,
        endWindow,
        fingerprint: authority.requestFingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        now,
        recipientStudentIds: recipients,
        runId: derivedRunId,
        source,
        sourceRevision,
        sourceRunId: request.runId,
        startWindow,
        timezone: request.timezone,
        yearId,
      });
      const result: AdminRunDerivedCreateServiceResult = {
        auditId: authority.auditId,
        disposition: "applied",
        run: toVersionedRunRecord(derivedRunId, targetReference.path, newRunData),
        sourceRunId: request.runId,
      };
      transaction.create(targetReference, newRunData);
      transaction.set(templateReference, {
        lastUsedAcademicYear: yearId,
        lastUsedAt: now,
        status: "assigned",
        totalRuns: FieldValue.increment(1),
      }, {merge: true});
      transaction.create(auditReference, auditDocument({
        actionType: command === "duplicate" ?
          "DUPLICATE_ASSIGNMENT" : "REASSIGN_ASSIGNMENT",
        authority,
        before: {revision: sourceRevision, runId: request.runId},
        command,
        context: request,
        result,
        runId: derivedRunId,
        timestamp: now,
      }));
      return result;
    });
  }
}

export const adminAssignmentOperationsService =
  new AdminAssignmentOperationsService();
