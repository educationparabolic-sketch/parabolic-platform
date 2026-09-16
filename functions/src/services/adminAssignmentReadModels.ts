/* eslint-disable require-jsdoc */
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {adminSettingsService} from "./adminSettings";
import {toVersionedRunRecord} from "./adminAssignmentOperations";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminAssignmentOperationValidationError,
  AdminRunHistoryAnalytics,
  AdminRunHistoryResult,
  AdminRunHistoryValidatedRequest,
  AdminRunHistoryVersionedRecord,
  AdminRunLiveDetailResult,
  AdminRunLiveDetailValidatedRequest,
  AdminRunLiveListResult,
  AdminRunLiveListValidatedRequest,
  AdminRunLiveSessionStatus,
  AdminRunLiveStudentRecord,
  AdminRunLiveSummary,
  AdminRunLiveVersionedRecord,
} from "../types/adminAssignmentOperations";
import type {AcademicYearSummary} from "../types/adminSettings";
import type {
  AdminRunMode,
  AdminRunTerminalStatus,
} from "../../../shared/contracts/apiDtos";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_RECIPIENTS = 100;
const LIVE_STATUSES = ["active", "collecting"] as const;
const TERMINAL_STATUSES = [
  "completed",
  "archived",
  "cancelled",
  "terminated",
] as const;
const TERMINATED_COMPATIBILITY_STATUSES = ["terminated", "stopped"] as const;

type LicenseLayer = "L0" | "L1" | "L2" | "L3";

interface AdminAssignmentReadModelDependencies {
  firestore: FirebaseFirestore.Firestore;
  loadAcademicYears: (instituteId: string) => Promise<AcademicYearSummary[]>;
  now: () => Timestamp;
}

interface LiveListCursor {
  createdAt: string;
  kind: "live-list";
  runId: string;
  yearId: string;
}

interface LiveDetailCursor {
  kind: "live-detail";
  revision: number;
  runId: string;
  studentId: string;
  yearId: string;
}

interface HistoryCursor {
  createdAt: string;
  kind: "run-history";
  mode: AdminRunMode | null;
  runId: string;
  status: AdminRunTerminalStatus | null;
  yearId: string;
}

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

function normalizeRole(value: unknown): string {
  const role = requiredString(value, "actorRole").toLowerCase();
  if (role !== "admin" && role !== "teacher") {
    throw new AdminAssignmentOperationValidationError(
      "FORBIDDEN",
      "Assignment reads require the teacher or admin role.",
    );
  }
  return role;
}

function normalizeLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) ||
    parsed < 1 || parsed > MAX_LIMIT) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      `Field "limit" must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }
  return parsed;
}

function optionalCursor(value: unknown): string | undefined {
  return value === undefined ? undefined : requiredString(value, "cursor", 4096);
}

function normalizeMode(value: unknown): AdminRunMode {
  if (value === "Operational" || value === "Diagnostic" ||
    value === "Controlled" || value === "Hard") {
    return value;
  }
  throw new AdminAssignmentOperationValidationError(
    "VALIDATION_ERROR",
    "Field \"mode\" must be Operational, Diagnostic, Controlled, or Hard.",
  );
}

function normalizeTerminalStatus(value: unknown): AdminRunTerminalStatus {
  const status = requiredString(value, "status").toLowerCase();
  if (status === "completed" || status === "archived" ||
    status === "cancelled" || status === "terminated") {
    return status;
  }
  throw new AdminAssignmentOperationValidationError(
    "VALIDATION_ERROR",
    "Field \"status\" must be completed, archived, cancelled, or terminated.",
  );
}

function encodeCursor(value: LiveListCursor | LiveDetailCursor | HistoryCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Cursor payload is not an object.");
    }
    return parsed;
  } catch {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" is not a valid assignment read cursor.",
    );
  }
}

function isoCursorTimestamp(value: unknown): string {
  const normalized = requiredString(value, "cursor.createdAt");
  const milliseconds = Date.parse(normalized);
  if (Number.isNaN(milliseconds)) {
    throw new AdminAssignmentOperationValidationError(
      "VALIDATION_ERROR",
      "Cursor creation time is invalid.",
    );
  }
  return new Date(milliseconds).toISOString();
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

function timestamp(value: unknown, fieldName: string): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Persisted field "${fieldName}" is not a timestamp.`,
    );
  }
  return value;
}

function resolveCurrentYear(years: AcademicYearSummary[]): string {
  const current = years.find((year) => {
    const status = String(year.status).toLowerCase();
    return status === "active" || status === "started" ||
      status === "scheduled";
  });
  if (!current) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "The institute has no current operational academic year.",
    );
  }
  return current.yearId;
}

function resolveHistoryYear(
  years: AcademicYearSummary[],
  requestedYear?: string,
): string {
  if (!requestedYear) {
    return resolveCurrentYear(years);
  }
  const match = years.find((year) => year.yearId === requestedYear);
  if (!match) {
    throw new AdminAssignmentOperationValidationError(
      "NOT_FOUND",
      `Academic year "${requestedYear}" was not found for this institute.`,
    );
  }
  return match.yearId;
}

function recipientIds(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.recipientStudentIds) ||
    data.recipientStudentIds.length < 1 ||
    data.recipientStudentIds.length > MAX_RECIPIENTS) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `Persisted run recipients must contain 1 to ${MAX_RECIPIENTS} ids.`,
    );
  }
  const ids = data.recipientStudentIds.map((entry) =>
    requiredString(entry, "run.recipientStudentIds[]"));
  if (new Set(ids).size !== ids.length) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      "Persisted run recipients contain duplicate ids.",
    );
  }
  return ids;
}

function normalizeSessionStatus(value: unknown): AdminRunLiveSessionStatus {
  const status = requiredString(value, "session.status").toLowerCase();
  if (status === "created" || status === "started" || status === "active" ||
    status === "submitted" || status === "expired" ||
    status === "terminated") {
    return status;
  }
  throw new AdminAssignmentOperationValidationError(
    "CONFLICT",
    `Persisted session status "${status}" is unsupported.`,
  );
}

function sessionMap(
  snapshots: FirebaseFirestore.QueryDocumentSnapshot[],
  recipients: string[],
): Map<string, FirebaseFirestore.QueryDocumentSnapshot> {
  if (snapshots.length > MAX_RECIPIENTS) {
    throw new AdminAssignmentOperationValidationError(
      "CONFLICT",
      `A run may expose at most ${MAX_RECIPIENTS} session projections.`,
    );
  }
  const assigned = new Set(recipients);
  const byStudent = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snapshot) => {
    const studentId = requiredString(
      snapshot.get("studentId"),
      "session.studentId",
    );
    if (!assigned.has(studentId)) {
      throw new AdminAssignmentOperationValidationError(
        "CONFLICT",
        `Session "${snapshot.id}" does not belong to a run recipient.`,
      );
    }
    if (byStudent.has(studentId)) {
      throw new AdminAssignmentOperationValidationError(
        "CONFLICT",
        `Run recipient "${studentId}" has multiple session projections.`,
      );
    }
    normalizeSessionStatus(snapshot.get("status"));
    byStudent.set(studentId, snapshot);
  });
  return byStudent;
}

function summarizeSessions(
  recipients: string[],
  sessions: Map<string, FirebaseFirestore.QueryDocumentSnapshot>,
): AdminRunLiveSummary {
  let activeSessionCount = 0;
  let submittedCount = 0;
  let terminatedSessionCount = 0;
  sessions.forEach((snapshot) => {
    const status = normalizeSessionStatus(snapshot.get("status"));
    if (status === "created" || status === "started" || status === "active") {
      activeSessionCount += 1;
    } else if (status === "submitted") {
      submittedCount += 1;
    } else if (status === "terminated") {
      terminatedSessionCount += 1;
    }
  });
  return {
    activeSessionCount,
    notStartedCount: recipients.length - sessions.size,
    submittedCount,
    terminatedSessionCount,
    totalRecipients: recipients.length,
  };
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ?
    value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function optionalStoredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function percent(value: unknown, fallback = 0): number {
  const number = optionalNumber(value);
  if (number === null) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Number(number.toFixed(2))));
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

function riskDistribution(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }
  const normalized: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) {
      return null;
    }
    normalized[key] = entry;
  }
  return normalized;
}

function historyAnalytics(
  data: FirebaseFirestore.DocumentData | undefined,
  layer: LicenseLayer,
): AdminRunHistoryAnalytics {
  const advanced = layer === "L2" || layer === "L3";
  return {
    avgAccuracyPercent: optionalNumber(data?.avgAccuracyPercent),
    avgDisciplineIndex: advanced ? optionalNumber(
      data?.avgDisciplineIndex ?? data?.disciplineAverage,
    ) : null,
    avgRawScorePercent: optionalNumber(data?.avgRawScorePercent),
    completionPercent: percent(
      data?.completionRatePercent ?? data?.completionRate,
    ),
    controlledCompliancePercent: advanced ? optionalNumber(
      data?.controlledCompliancePercent,
    ) : null,
    executionStability: advanced ? optionalStoredString(
      data?.executionStability,
    ) : null,
    riskDistribution: advanced ? riskDistribution(data?.riskDistribution) : null,
  };
}

export class AdminAssignmentReadModelsService {
  private readonly dependencies: AdminAssignmentReadModelDependencies;

  constructor(
    dependencies: Partial<AdminAssignmentReadModelDependencies> = {},
  ) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      loadAcademicYears: dependencies.loadAcademicYears ??
        (async (instituteId) => (await adminSettingsService
          .loadSettingsSnapshot(instituteId)).academicYears),
      now: dependencies.now ?? (() => Timestamp.now()),
    };
  }

  public normalizeLiveListRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    cursor?: unknown;
    instituteId?: unknown;
    limit?: unknown;
  }): AdminRunLiveListValidatedRequest {
    const cursor = optionalCursor(input.cursor);
    return {
      actorId: requiredString(input.actorId, "actorId"),
      actorRole: normalizeRole(input.actorRole),
      ...(cursor ? {cursor} : {}),
      instituteId: requiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public normalizeLiveDetailRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    cursor?: unknown;
    instituteId?: unknown;
    limit?: unknown;
    runId?: unknown;
  }): AdminRunLiveDetailValidatedRequest {
    const cursor = optionalCursor(input.cursor);
    return {
      actorId: requiredString(input.actorId, "actorId"),
      actorRole: normalizeRole(input.actorRole),
      ...(cursor ? {cursor} : {}),
      instituteId: requiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
      runId: requiredString(input.runId, "runId"),
    };
  }

  public normalizeHistoryRequest(input: {
    academicYear?: unknown;
    actorId?: unknown;
    actorRole?: unknown;
    cursor?: unknown;
    instituteId?: unknown;
    limit?: unknown;
    mode?: unknown;
    status?: unknown;
  }): AdminRunHistoryValidatedRequest {
    const academicYear = input.academicYear === undefined ? undefined :
      requiredString(input.academicYear, "academicYear");
    const cursor = optionalCursor(input.cursor);
    const mode = input.mode === undefined ? undefined : normalizeMode(input.mode);
    const status = input.status === undefined ? undefined :
      normalizeTerminalStatus(input.status);
    return {
      ...(academicYear ? {academicYear} : {}),
      actorId: requiredString(input.actorId, "actorId"),
      actorRole: normalizeRole(input.actorRole),
      ...(cursor ? {cursor} : {}),
      instituteId: requiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
      ...(mode ? {mode} : {}),
      ...(status ? {status} : {}),
    };
  }

  private async loadLicenseLayer(instituteId: string): Promise<LicenseLayer> {
    const institute = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(instituteId);
    const [main, current] = await this.dependencies.firestore.getAll(
      institute.collection(LICENSE_COLLECTION).doc("main"),
      institute.collection(LICENSE_COLLECTION).doc("current"),
    );
    const snapshot = main.exists ? main : current;
    if (!snapshot.exists) {
      throw new AdminAssignmentOperationValidationError(
        "CONFLICT",
        "Institute license is required for assignment reads.",
      );
    }
    return licenseLayer(snapshot.get("currentLayer"));
  }

  private async loadSessionHeaders(
    runReference: FirebaseFirestore.DocumentReference,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const snapshot = await runReference.collection(SESSIONS_COLLECTION)
      .select("sessionId", "status", "studentId")
      .limit(MAX_RECIPIENTS + 1)
      .get();
    return snapshot.docs;
  }

  public async listLiveRuns(
    request: AdminRunLiveListValidatedRequest,
  ): Promise<AdminRunLiveListResult> {
    const years = await this.dependencies.loadAcademicYears(request.instituteId);
    const yearId = resolveCurrentYear(years);
    const runsCollection = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION).doc(yearId)
      .collection(RUNS_COLLECTION);
    let query: FirebaseFirestore.Query = runsCollection
      .where("status", "in", [...LIVE_STATUSES])
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor);
      if (cursor.kind !== "live-list" || cursor.yearId !== yearId) {
        throw new AdminAssignmentOperationValidationError(
          "VALIDATION_ERROR",
          "Live-run cursor does not match the current academic year.",
        );
      }
      query = query.startAfter(
        Timestamp.fromDate(new Date(isoCursorTimestamp(cursor.createdAt))),
        requiredString(cursor.runId, "cursor.runId"),
      );
    }
    const pageSize = request.limit ?? DEFAULT_LIMIT;
    const snapshot = await query.limit(pageSize + 1).get();
    const hasMore = snapshot.size > pageSize;
    const selected = snapshot.docs.slice(0, pageSize);
    const runs = await Promise.all(selected.map(async (document) => {
      const data = document.data();
      const recipients = recipientIds(data);
      const run = toVersionedRunRecord(document.id, document.ref.path, data);
      if (run.academicYear !== yearId ||
        (run.status !== "active" && run.status !== "collecting")) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Run "${document.id}" is not a current-year live run.`,
        );
      }
      const sessions = sessionMap(
        await this.loadSessionHeaders(document.ref),
        recipients,
      );
      return {
        run: run as AdminRunLiveVersionedRecord,
        summary: summarizeSessions(recipients, sessions),
      };
    }));
    const last = selected[selected.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({
      createdAt: timestamp(last.get("createdAt"), "run.createdAt")
        .toDate().toISOString(),
      kind: "live-list",
      runId: last.id,
      yearId,
    }) : null;
    return {
      nextCursor,
      runs,
      serverTime: this.dependencies.now().toDate().toISOString(),
    };
  }

  public async getLiveRun(
    request: AdminRunLiveDetailValidatedRequest,
  ): Promise<AdminRunLiveDetailResult> {
    const years = await this.dependencies.loadAcademicYears(request.instituteId);
    const yearId = resolveCurrentYear(years);
    const runReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION).doc(yearId)
      .collection(RUNS_COLLECTION).doc(request.runId);
    const [runSnapshot, layer] = await Promise.all([
      runReference.get(),
      this.loadLicenseLayer(request.instituteId),
    ]);
    if (!runSnapshot.exists || !isRecord(runSnapshot.data())) {
      throw new AdminAssignmentOperationValidationError(
        "NOT_FOUND",
        `Run "${request.runId}" was not found in the current academic year.`,
      );
    }
    const data = runSnapshot.data() as Record<string, unknown>;
    const run = toVersionedRunRecord(request.runId, runReference.path, data);
    if (run.academicYear !== yearId ||
      (run.status !== "active" && run.status !== "collecting")) {
      throw new AdminAssignmentOperationValidationError(
        "CONFLICT",
        `Run "${request.runId}" is not live.`,
      );
    }
    const recipients = recipientIds(data).sort((left, right) =>
      left.localeCompare(right));
    let startIndex = 0;
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor);
      if (cursor.kind !== "live-detail" || cursor.yearId !== yearId ||
        cursor.runId !== request.runId) {
        throw new AdminAssignmentOperationValidationError(
          "VALIDATION_ERROR",
          "Live-detail cursor does not match this run.",
        );
      }
      const cursorRevision = positiveInteger(
        cursor.revision,
        "cursor.revision",
      );
      if (cursorRevision !== run.revision) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          "Live-detail cursor is stale because the run revision changed.",
        );
      }
      const studentId = requiredString(cursor.studentId, "cursor.studentId");
      const foundIndex = recipients.indexOf(studentId);
      if (foundIndex < 0) {
        throw new AdminAssignmentOperationValidationError(
          "VALIDATION_ERROR",
          "Live-detail cursor recipient is not assigned to this run.",
        );
      }
      startIndex = foundIndex + 1;
    }
    const pageSize = request.limit ?? DEFAULT_LIMIT;
    const selectedIds = recipients.slice(startIndex, startIndex + pageSize);
    const sessionSnapshot = await runReference.collection(SESSIONS_COLLECTION)
      .select(
        "adaptivePhaseSnapshot",
        "controlledCompliancePercent",
        "currentPhase",
        "deadlineAt",
        "maxTimeViolationCount",
        "minTimeViolationCount",
        "overrideUsed",
        "pacingDrift",
        "progressPercent",
        "provisionalRiskScore",
        "rapidGuess",
        "revision",
        "sessionId",
        "skipBurst",
        "status",
        "studentId",
        "version",
      )
      .limit(MAX_RECIPIENTS + 1)
      .get();
    const sessions = sessionMap(sessionSnapshot.docs, recipients);
    const studentReferences = selectedIds.map((studentId) =>
      this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId).collection(STUDENTS_COLLECTION).doc(studentId));
    const studentSnapshots = studentReferences.length > 0 ?
      await this.dependencies.firestore.getAll(...studentReferences) : [];
    const studentById = new Map(studentSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot,
    ]));
    const now = this.dependencies.now();
    const runEnd = timestamp(data.endWindow, "run.endWindow");
    const phaseMetrics = layer !== "L0";
    const advancedMetrics = layer === "L2" || layer === "L3";
    const students: AdminRunLiveStudentRecord[] = selectedIds.map((studentId) => {
      const student = studentById.get(studentId);
      if (!student?.exists) {
        throw new AdminAssignmentOperationValidationError(
          "NOT_FOUND",
          `Assigned student "${studentId}" was not found.`,
        );
      }
      const studentName = optionalStoredString(student.get("fullName")) ??
        optionalStoredString(student.get("name")) ??
        optionalStoredString(student.get("displayName"));
      if (!studentName) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Assigned student "${studentId}" has no authoritative name.`,
        );
      }
      const session = sessions.get(studentId);
      if (!session) {
        return {
          controlledCompliancePercent: null,
          currentPhase: null,
          maxTimeViolationCount: null,
          minTimeViolationCount: null,
          overrideUsed: false,
          pacingDrift: null,
          progressPercent: 0,
          provisionalRiskScore: null,
          rapidGuess: null,
          sessionId: null,
          sessionRevision: null,
          skipBurst: null,
          status: "not_started",
          studentId,
          studentName,
          timeRemainingSeconds: Math.max(
            0,
            Math.floor((runEnd.toMillis() - now.toMillis()) / 1000),
          ),
        };
      }
      const sessionData = session.data();
      const status = normalizeSessionStatus(sessionData.status);
      const adaptive = isRecord(sessionData.adaptivePhaseSnapshot) ?
        sessionData.adaptivePhaseSnapshot : {};
      const deadline = sessionData.deadlineAt instanceof Timestamp ?
        sessionData.deadlineAt : runEnd;
      const terminal = status === "submitted" || status === "expired" ||
        status === "terminated";
      const storedSessionId = optionalStoredString(sessionData.sessionId) ??
        session.id;
      if (storedSessionId !== session.id) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Session "${session.id}" has mismatched identity fields.`,
        );
      }
      const revision = optionalNonNegativeInteger(sessionData.revision) ??
        optionalNonNegativeInteger(sessionData.version);
      return {
        controlledCompliancePercent: advancedMetrics ? optionalNumber(
          sessionData.controlledCompliancePercent,
        ) : null,
        currentPhase: phaseMetrics ? optionalStoredString(
          sessionData.currentPhase ?? adaptive.currentPhase,
        ) : null,
        maxTimeViolationCount: phaseMetrics ? optionalNonNegativeInteger(
          sessionData.maxTimeViolationCount,
        ) : null,
        minTimeViolationCount: phaseMetrics ? optionalNonNegativeInteger(
          sessionData.minTimeViolationCount,
        ) : null,
        overrideUsed: optionalBoolean(sessionData.overrideUsed) ?? false,
        pacingDrift: advancedMetrics ? optionalBoolean(
          sessionData.pacingDrift,
        ) : null,
        progressPercent: percent(
          sessionData.progressPercent ?? adaptive.answeredPercent,
        ),
        provisionalRiskScore: advancedMetrics ? optionalNumber(
          sessionData.provisionalRiskScore,
        ) : null,
        rapidGuess: advancedMetrics ? optionalBoolean(
          sessionData.rapidGuess,
        ) : null,
        sessionId: session.id,
        sessionRevision: revision !== null && revision > 0 ? revision : null,
        skipBurst: advancedMetrics ? optionalBoolean(
          sessionData.skipBurst,
        ) : null,
        status,
        studentId,
        studentName,
        timeRemainingSeconds: terminal ? 0 : Math.max(
          0,
          Math.floor((deadline.toMillis() - now.toMillis()) / 1000),
        ),
      };
    });
    const nextStudentId = startIndex + selectedIds.length < recipients.length ?
      selectedIds[selectedIds.length - 1] : undefined;
    return {
      nextCursor: nextStudentId ? encodeCursor({
        kind: "live-detail",
        revision: run.revision,
        runId: request.runId,
        studentId: nextStudentId,
        yearId,
      }) : null,
      run: run as AdminRunLiveVersionedRecord,
      serverTime: now.toDate().toISOString(),
      students,
      summary: summarizeSessions(recipients, sessions),
    };
  }

  public async listRunHistory(
    request: AdminRunHistoryValidatedRequest,
  ): Promise<AdminRunHistoryResult> {
    const years = await this.dependencies.loadAcademicYears(request.instituteId);
    const yearId = resolveHistoryYear(years, request.academicYear);
    const layer = await this.loadLicenseLayer(request.instituteId);
    const yearReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const persistedStatuses = request.status === "terminated" ?
      [...TERMINATED_COMPATIBILITY_STATUSES] : request.status ?
        [request.status] : [...TERMINAL_STATUSES, "stopped"];
    let query: FirebaseFirestore.Query = yearReference.collection(RUNS_COLLECTION)
      .where(
        "status",
        persistedStatuses.length === 1 ? "==" : "in",
        persistedStatuses.length === 1 ? persistedStatuses[0] : persistedStatuses,
      );
    if (request.mode) {
      query = query.where("mode", "==", request.mode);
    }
    query = query.orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor);
      if (cursor.kind !== "run-history" || cursor.yearId !== yearId ||
        cursor.mode !== (request.mode ?? null) ||
        cursor.status !== (request.status ?? null)) {
        throw new AdminAssignmentOperationValidationError(
          "VALIDATION_ERROR",
          "Run-history cursor does not match the requested filters.",
        );
      }
      query = query.startAfter(
        Timestamp.fromDate(new Date(isoCursorTimestamp(cursor.createdAt))),
        requiredString(cursor.runId, "cursor.runId"),
      );
    }
    const pageSize = request.limit ?? DEFAULT_LIMIT;
    const snapshot = await query.limit(pageSize + 1).get();
    const hasMore = snapshot.size > pageSize;
    const selected = snapshot.docs.slice(0, pageSize);
    const analyticsReferences = selected.map((document) =>
      yearReference.collection(RUN_ANALYTICS_COLLECTION).doc(document.id));
    const analyticsSnapshots = analyticsReferences.length > 0 ?
      await this.dependencies.firestore.getAll(...analyticsReferences) : [];
    const analyticsById = new Map(analyticsSnapshots.map((document) => [
      document.id,
      document,
    ]));
    const runs = selected.map((document) => {
      const run = toVersionedRunRecord(
        document.id,
        document.ref.path,
        document.data(),
      );
      if (run.academicYear !== yearId ||
        !TERMINAL_STATUSES.includes(
          run.status as typeof TERMINAL_STATUSES[number],
        )) {
        throw new AdminAssignmentOperationValidationError(
          "CONFLICT",
          `Run "${document.id}" is not terminal history for year "${yearId}".`,
        );
      }
      return {
        analytics: historyAnalytics(analyticsById.get(document.id)?.data(), layer),
        run: run as AdminRunHistoryVersionedRecord,
      };
    });
    const last = selected[selected.length - 1];
    return {
      nextCursor: hasMore && last ? encodeCursor({
        createdAt: timestamp(last.get("createdAt"), "run.createdAt")
          .toDate().toISOString(),
        kind: "run-history",
        mode: request.mode ?? null,
        runId: last.id,
        status: request.status ?? null,
        yearId,
      }) : null,
      runs,
    };
  }
}

export const adminAssignmentReadModelsService =
  new AdminAssignmentReadModelsService();
