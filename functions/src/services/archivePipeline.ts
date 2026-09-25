import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {GoogleAuth} from "google-auth-library";
import {createLogger} from "./logging";
import {
  governanceSnapshotAggregationService,
} from "./governanceSnapshotAggregation";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AcademicYearArchiveResult,
  AcademicYearArchiveValidatedRequest,
  ArchiveBigQuerySessionRow,
  AcademicYearArchiveValidationError,
} from "../types/archivePipeline";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const SETTINGS_COMMANDS_COLLECTION = "settingsCommands";
const SETTINGS_AUDIT_COLLECTION = "settingsAudit";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const MAX_ARCHIVE_RUNS = 100;
const MAX_ARCHIVE_SESSIONS = 400;
const ARCHIVE_LEASE_MS = 5 * 60_000;
const TERMINAL_RUN_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "terminated",
]);
const TERMINAL_SESSION_STATUSES = new Set([
  "expired",
  "submitted",
  "terminated",
]);
const ARCHIVE_STAGES = [
  "accepted",
  "locked",
  "exported",
  "snapshot_created",
  "archived",
] as const;
type ArchiveCheckpointStage = typeof ARCHIVE_STAGES[number];
const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery";

interface ArchiveRunRecord {
  calibrationVersion?: string;
  examType?: string;
  mode?: string;
  riskModelVersion?: string;
  runId: string;
  status?: string;
  templateVersion?: string;
  testId?: string;
}

interface ArchiveStudentRecord {
  batchId: string | null;
  studentId: string;
}

interface ArchiveSessionRecord {
  calibrationVersion: string | null;
  createdAt: FirebaseFirestore.Timestamp | null;
  data: Record<string, unknown>;
  mode: string | null;
  runId: string;
  sessionId: string;
  startedAt: FirebaseFirestore.Timestamp | null;
  status: string;
  studentId: string;
  submittedAt: FirebaseFirestore.Timestamp | null;
}

interface ArchiveExecutionContext {
  academicYearPath: string;
  academicYearReference: FirebaseFirestore.DocumentReference;
  archiveDatasetId: string;
  runs: ArchiveRunRecord[];
  sessions: ArchiveSessionRecord[];
  sessionsTableId: string;
  studentsById: Map<string, ArchiveStudentRecord>;
}

interface ArchiveCommandState {
  academicYearId: string;
  acceptedAt: Timestamp;
  activeAttempt?: number;
  actorRole: string;
  actorUserId: string;
  attemptCount: number;
  auditEventId: string;
  checkpointStage: ArchiveCheckpointStage;
  commandIdHash: string;
  completedAt?: Timestamp;
  fingerprint: string;
  ipAddressHash?: string;
  leaseUntil?: Timestamp;
  revision: number;
  snapshotPath?: string;
  state: "pending" | "processing" | "failed" | "complete";
  userAgentHash?: string;
}

interface ArchiveCommandAuthority {
  auditEventId: string;
  auditLogReference: FirebaseFirestore.DocumentReference;
  commandIdHash: string;
  commandReference: FirebaseFirestore.DocumentReference;
  fingerprint: string;
  instituteReference: FirebaseFirestore.DocumentReference;
  settingsAuditReference: FirebaseFirestore.DocumentReference;
  yearReference: FirebaseFirestore.DocumentReference;
}

interface BigQueryTableField {
  mode?: "NULLABLE" | "REQUIRED";
  name: string;
  type: "BOOL" | "FLOAT64" | "INT64" | "STRING" | "TIMESTAMP";
}

interface BigQueryQueryResponse {
  jobComplete?: boolean;
  rows?: Array<{
    f?: Array<{v?: string | null}>;
  }>;
}

interface BigQueryRestClient {
  ensureArchiveTables(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<void>;
  getExistingRowCount(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<number>;
  insertSessionRows(
    input: {
      datasetId: string;
      projectId: string;
      rows: ArchiveBigQuerySessionRow[];
      sessionsTableId: string;
    },
  ): Promise<void>;
}

interface ArchivePipelineDependencies {
  bigQueryClient: BigQueryRestClient;
  firestore: FirebaseFirestore.Firestore;
  generateGovernanceSnapshot:
    typeof governanceSnapshotAggregationService.generateSnapshotForAcademicYear;
  now: () => Date;
  projectIdResolver: () => string;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new AcademicYearArchiveValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new AcademicYearArchiveValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeBoolean = (value: unknown, fieldName: string): true => {
  if (value !== true) {
    throw new AcademicYearArchiveValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be true to confirm archive execution.`,
    );
  }

  return true;
};

const normalizeCommandId = (value: unknown): string => {
  const commandId = normalizeRequiredString(value, "commandId").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(commandId)) {
    throw new AcademicYearArchiveValidationError(
      "VALIDATION_ERROR",
      "Field \"commandId\" must be a UUID.",
    );
  }
  return commandId;
};

const normalizeRevision = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AcademicYearArchiveValidationError(
      "VALIDATION_ERROR",
      "Field \"expectedRevision\" must be a non-negative integer.",
    );
  }
  return value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const stageIndex = (stage: ArchiveCheckpointStage): number =>
  ARCHIVE_STAGES.indexOf(stage);

const hasReachedStage = (
  current: ArchiveCheckpointStage,
  target: ArchiveCheckpointStage,
): boolean => stageIndex(current) >= stageIndex(target);

const toArchiveCommand = (value: unknown): ArchiveCommandState | null => {
  if (!isPlainObject(value)) return null;
  const checkpointStage = normalizeOptionalString(value.checkpointStage);
  const state = normalizeOptionalString(value.state);
  if (!checkpointStage || !ARCHIVE_STAGES.includes(checkpointStage as ArchiveCheckpointStage) ||
    !state || !["pending", "processing", "failed", "complete"].includes(state) ||
    !(value.acceptedAt instanceof Timestamp) ||
    typeof value.attemptCount !== "number" || !Number.isInteger(value.attemptCount) ||
    typeof value.revision !== "number" || !Number.isInteger(value.revision)) return null;
  return {
    academicYearId: normalizeRequiredString(value.academicYearId, "academicYearId"),
    acceptedAt: value.acceptedAt,
    activeAttempt: typeof value.activeAttempt === "number" ? value.activeAttempt : undefined,
    actorRole: normalizeRequiredString(value.actorRole, "actorRole"),
    actorUserId: normalizeRequiredString(value.actorUserId, "actorUserId"),
    attemptCount: value.attemptCount,
    auditEventId: normalizeRequiredString(value.auditEventId, "auditEventId"),
    checkpointStage: checkpointStage as ArchiveCheckpointStage,
    commandIdHash: normalizeRequiredString(value.commandIdHash, "commandIdHash"),
    completedAt: value.completedAt instanceof Timestamp ? value.completedAt : undefined,
    fingerprint: normalizeRequiredString(value.fingerprint, "fingerprint"),
    ipAddressHash: normalizeOptionalString(value.ipAddressHash) ?? undefined,
    leaseUntil: value.leaseUntil instanceof Timestamp ? value.leaseUntil : undefined,
    revision: value.revision,
    snapshotPath: normalizeOptionalString(value.snapshotPath) ?? undefined,
    state: state as ArchiveCommandState["state"],
    userAgentHash: normalizeOptionalString(value.userAgentHash) ?? undefined,
  };
};

const normalizeTimestamp = (
  value: unknown,
): FirebaseFirestore.Timestamp | null => {
  if (value instanceof Timestamp) {
    return value;
  }

  return null;
};

const toNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toNullableInteger = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Number.isInteger(value) ?
    value :
    null;

const toIsoString = (
  value: FirebaseFirestore.Timestamp | null,
): string | null => value?.toDate().toISOString() ?? null;

const toNormalizedStatus = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const sanitizeBigQueryIdentifier = (value: string): string =>
  value.replace(/[^A-Za-z0-9_]/g, "_");

const buildArchiveDatasetId = (instituteId: string): string =>
  `institute_${sanitizeBigQueryIdentifier(instituteId)}_archive`;

const buildSessionsTableId = (yearId: string): string =>
  `sessions_${sanitizeBigQueryIdentifier(yearId)}`;

const buildSnapshotMonth = (date: Date): string => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, "0"),
].join("-");

const computeDurationSeconds = (
  startedAt: FirebaseFirestore.Timestamp | null,
  submittedAt: FirebaseFirestore.Timestamp | null,
): number | null => {
  if (!startedAt || !submittedAt) {
    return null;
  }

  const durationMs = submittedAt.toMillis() - startedAt.toMillis();

  if (durationMs < 0) {
    return null;
  }

  return Math.round(durationMs / 1000);
};

const computePhaseDeviationPercent = (value: unknown): number | null => {
  const phaseAdherencePercent = toNullableNumber(value);

  if (phaseAdherencePercent === null) {
    return null;
  }

  return Math.round((100 - phaseAdherencePercent) * 100) / 100;
};

const computeRiskScore = (
  riskCluster: string | null,
): number | null => {
  switch (riskCluster) {
  case "Stable":
    return 10;
  case "Drift-Prone":
    return 30;
  case "Impulsive":
    return 50;
  case "Overextended":
    return 70;
  case "Volatile":
    return 90;
  default:
    return null;
  }
};

const buildTemplateVersionRange = (
  versions: string[],
): string | undefined => {
  const normalizedVersions = Array.from(new Set(
    versions
      .map((value) => value.trim())
      .filter((value) => Boolean(value)),
  ));

  if (normalizedVersions.length === 0) {
    return undefined;
  }

  const numericVersions = normalizedVersions
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (numericVersions.length === normalizedVersions.length) {
    const minimum = numericVersions[0];
    const maximum = numericVersions[numericVersions.length - 1];

    return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
  }

  return normalizedVersions.sort((left, right) => left.localeCompare(right))
    .join(",");
};

const buildJoinedVersion = (
  versions: string[],
): string | undefined => {
  const normalizedVersions = Array.from(new Set(
    versions
      .map((value) => value.trim())
      .filter((value) => Boolean(value)),
  )).sort((left, right) => left.localeCompare(right));

  return normalizedVersions.length > 0 ?
    normalizedVersions.join(",") :
    undefined;
};

const buildSessionRow = (
  input: {
    instituteId: string;
    studentRecord: ArchiveStudentRecord | undefined;
    runRecord: ArchiveRunRecord | undefined;
    sessionRecord: ArchiveSessionRecord;
    yearId: string;
  },
): ArchiveBigQuerySessionRow => {
  const sessionData = input.sessionRecord.data;
  const riskCluster = normalizeOptionalString(sessionData.riskState);

  return {
    academic_year: input.yearId,
    accuracy_percent: toNullableNumber(sessionData.accuracyPercent),
    batch_id: input.studentRecord?.batchId ?? null,
    calibration_version:
      input.sessionRecord.calibrationVersion ??
      input.runRecord?.calibrationVersion ??
      null,
    consecutive_wrong_streak_max:
      toNullableInteger(sessionData.consecutiveWrongStreakMax),
    created_at: toIsoString(input.sessionRecord.createdAt),
    discipline_index: toNullableNumber(sessionData.disciplineIndex),
    duration_seconds: computeDurationSeconds(
      input.sessionRecord.startedAt,
      input.sessionRecord.submittedAt,
    ),
    easy_neglect_signal: sessionData.easyNeglectActive === true ?
      true :
      null,
    easy_remaining_after_phase1_percent:
      toNullableNumber(sessionData.easyRemainingAfterPhase1Percent),
    exam_type: input.runRecord?.examType ?? null,
    guess_rate_percent: toNullableNumber(sessionData.guessRate),
    hard_bias_signal: sessionData.hardBiasActive === true ? true : null,
    hard_in_phase1_percent: toNullableNumber(sessionData.hardInPhase1Percent),
    institute_id: input.instituteId,
    max_time_violation_percent:
      toNullableNumber(sessionData.maxTimeViolationPercent),
    min_time_violation_percent:
      toNullableNumber(sessionData.minTimeViolationPercent),
    mode: input.sessionRecord.mode ?? input.runRecord?.mode ?? null,
    phase_adherence_percent: toNullableNumber(
      sessionData.phaseAdherencePercent,
    ),
    phase_deviation_percent: computePhaseDeviationPercent(
      sessionData.phaseAdherencePercent,
    ),
    rank_in_batch: null,
    raw_score_percent: toNullableNumber(sessionData.rawScorePercent),
    risk_cluster: riskCluster,
    risk_score: computeRiskScore(riskCluster),
    run_id: input.sessionRecord.runId,
    rush_signal: sessionData.rushPatternActive === true ? true : null,
    session_id: input.sessionRecord.sessionId,
    skip_burst_count: toNullableInteger(sessionData.skipBurstCount),
    skip_burst_signal: sessionData.skipBurstActive === true ? true : null,
    student_id: input.sessionRecord.studentId,
    submitted_at: toIsoString(input.sessionRecord.submittedAt),
    template_id: input.runRecord?.testId ?? null,
    wrong_streak_signal:
      sessionData.wrongStreakActive === true ? true : null,
  };
};

/**
 * Persists archive rows to BigQuery using the v2 REST API.
 */
class BigQueryRestArchiveClient implements BigQueryRestClient {
  private readonly auth = new GoogleAuth({
    scopes: [BIGQUERY_SCOPE],
  });

  private readonly datasetLocation =
    process.env.BIGQUERY_ARCHIVE_LOCATION?.trim() || "asia-south1";

  /**
   * Ensures the institute archive dataset and yearly session table exist.
   * @param {object} input Archive dataset and table identifiers.
   * @return {Promise<void>} Resolves when archive storage is ready.
   */
  public async ensureArchiveTables(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<void> {
    await this.createDatasetIfMissing(input.projectId, input.datasetId);
    await this.createSessionsTableIfMissing(
      input.projectId,
      input.datasetId,
      input.sessionsTableId,
    );
  }

  /**
   * Counts existing archive rows for the yearly session table.
   * @param {object} input Archive dataset and table identifiers.
   * @return {Promise<number>} Existing archive row count.
   */
  public async getExistingRowCount(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<number> {
    const query = [
      "SELECT COUNT(1) AS row_count",
      `FROM \`${input.projectId}.${input.datasetId}.${input.sessionsTableId}\``,
    ].join(" ");
    const response = await this.request<BigQueryQueryResponse>({
      body: {
        query,
        useLegacySql: false,
      },
      method: "POST",
      path: `/projects/${input.projectId}/queries`,
    });
    const firstValue = response.rows?.[0]?.f?.[0]?.v;
    const parsed = Number(firstValue ?? 0);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Inserts flattened session rows into the archive table.
   * @param {object} input Insert configuration and rows.
   * @return {Promise<void>} Resolves after a successful insert.
   */
  public async insertSessionRows(
    input: {
      datasetId: string;
      projectId: string;
      rows: ArchiveBigQuerySessionRow[];
      sessionsTableId: string;
    },
  ): Promise<void> {
    if (input.rows.length === 0) {
      return;
    }

    const response = await this.request<{
      insertErrors?: Array<{
        errors?: Array<{message?: string}>;
        index?: number;
      }>;
    }>({
      body: {
        ignoreUnknownValues: false,
        kind: "bigquery#tableDataInsertAllRequest",
        rows: input.rows.map((row) => ({
          insertId: row.session_id,
          json: row,
        })),
        skipInvalidRows: false,
      },
      method: "POST",
      path:
        `/projects/${input.projectId}/datasets/${input.datasetId}/tables/` +
        `${input.sessionsTableId}/insertAll`,
    });

    if ((response.insertErrors?.length ?? 0) > 0) {
      throw new Error(
        "BigQuery archive insert failed: " +
        response.insertErrors
          ?.map((entry) =>
            entry.errors?.map((error) => error.message).join(", "))
          .filter((value): value is string => Boolean(value))
          .join("; "),
      );
    }
  }

  /**
   * Creates the institute archive dataset when it does not yet exist.
   * @param {string} projectId Google Cloud project identifier.
   * @param {string} datasetId Archive dataset identifier.
   * @return {Promise<void>} Resolves when dataset creation has completed.
   */
  private async createDatasetIfMissing(
    projectId: string,
    datasetId: string,
  ): Promise<void> {
    try {
      await this.request({
        method: "POST",
        path: `/projects/${projectId}/datasets`,
        body: {
          datasetReference: {
            datasetId,
            projectId,
          },
          location: this.datasetLocation,
        },
      });
    } catch (error) {
      if (this.isAlreadyExistsError(error)) {
        return;
      }

      throw error;
    }
  }

  /**
   * Creates the yearly session archive table when it does not yet exist.
   * @param {string} projectId Google Cloud project identifier.
   * @param {string} datasetId Archive dataset identifier.
   * @param {string} tableId Archive table identifier.
   * @return {Promise<void>} Resolves when table creation has completed.
   */
  private async createSessionsTableIfMissing(
    projectId: string,
    datasetId: string,
    tableId: string,
  ): Promise<void> {
    try {
      await this.request({
        method: "POST",
        path: `/projects/${projectId}/datasets/${datasetId}/tables`,
        body: {
          clustering: {
            fields: ["institute_id", "batch_id"],
          },
          schema: {
            fields: this.buildSessionTableSchema(),
          },
          tableReference: {
            datasetId,
            projectId,
            tableId,
          },
          timePartitioning: {
            field: "submitted_at",
            type: "DAY",
          },
        },
      });
    } catch (error) {
      if (this.isAlreadyExistsError(error)) {
        return;
      }

      throw error;
    }
  }

  /**
   * Returns the documented archive table schema.
   * @return {BigQueryTableField[]} BigQuery field definitions.
   */
  private buildSessionTableSchema(): BigQueryTableField[] {
    return [
      {name: "institute_id", type: "STRING"},
      {name: "academic_year", type: "STRING"},
      {name: "run_id", type: "STRING"},
      {name: "session_id", type: "STRING"},
      {name: "student_id", type: "STRING"},
      {name: "batch_id", type: "STRING"},
      {name: "template_id", type: "STRING"},
      {name: "exam_type", type: "STRING"},
      {name: "mode", type: "STRING"},
      {name: "calibration_version", type: "STRING"},
      {name: "submitted_at", type: "TIMESTAMP"},
      {name: "duration_seconds", type: "INT64"},
      {name: "raw_score_percent", type: "FLOAT64"},
      {name: "accuracy_percent", type: "FLOAT64"},
      {name: "rank_in_batch", type: "INT64"},
      {name: "risk_score", type: "FLOAT64"},
      {name: "risk_cluster", type: "STRING"},
      {name: "discipline_index", type: "FLOAT64"},
      {name: "phase_adherence_percent", type: "FLOAT64"},
      {name: "phase_deviation_percent", type: "FLOAT64"},
      {name: "hard_in_phase1_percent", type: "FLOAT64"},
      {name: "easy_remaining_after_phase1_percent", type: "FLOAT64"},
      {name: "min_time_violation_percent", type: "FLOAT64"},
      {name: "max_time_violation_percent", type: "FLOAT64"},
      {name: "guess_rate_percent", type: "FLOAT64"},
      {name: "skip_burst_count", type: "INT64"},
      {name: "consecutive_wrong_streak_max", type: "INT64"},
      {name: "rush_signal", type: "BOOL"},
      {name: "easy_neglect_signal", type: "BOOL"},
      {name: "hard_bias_signal", type: "BOOL"},
      {name: "skip_burst_signal", type: "BOOL"},
      {name: "wrong_streak_signal", type: "BOOL"},
      {name: "created_at", type: "TIMESTAMP"},
    ];
  }

  /**
   * Sends an authenticated BigQuery REST request.
   * @template T
   * @param {object} input Request metadata and optional JSON body.
   * @return {Promise<T>} Parsed BigQuery response payload.
   */
  private async request<T = unknown>(
    input: {
      body?: unknown;
      method: "GET" | "POST";
      path: string;
    },
  ): Promise<T> {
    const client = await this.auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = typeof accessTokenResponse === "string" ?
      accessTokenResponse :
      accessTokenResponse?.token;

    if (!accessToken) {
      throw new Error("Unable to acquire a BigQuery access token.");
    }

    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2${input.path}`,
      {
        body: input.body === undefined ?
          undefined :
          JSON.stringify(input.body),
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: input.method,
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `BigQuery request failed (${response.status}): ${responseText}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json() as T;
  }

  /**
   * Detects BigQuery already-exists failures for idempotent setup calls.
   * @param {unknown} error Potential request error.
   * @return {boolean} True when the failure is an already-exists response.
   */
  private isAlreadyExistsError(error: unknown): boolean {
    return error instanceof Error &&
      (error.message.includes("(409)") ||
      error.message.toLowerCase().includes("already exists"));
  }
}

/**
 * Implements the academic year archive pipeline for Build 101.
 */
export class ArchivePipelineService {
  private readonly logger = createLogger("ArchivePipelineService");

  /**
   * @param {ArchivePipelineDependencies} dependencies Archive collaborators.
   */
  constructor(
    private readonly dependencies: ArchivePipelineDependencies,
  ) {}

  /**
   * Validates and normalizes API/archive-service input.
   * @param {Partial<AcademicYearArchiveValidatedRequest>} value Raw input.
   * @return {AcademicYearArchiveValidatedRequest} Normalized request payload.
   */
  public normalizeRequest(
    value: Partial<AcademicYearArchiveValidatedRequest>,
  ): AcademicYearArchiveValidatedRequest {
    return {
      academicYearId: normalizeRequiredString(
        value.academicYearId,
        "academicYearId",
      ),
      actorId: normalizeRequiredString(value.actorId, "actorId"),
      actorRole: normalizeRequiredString(value.actorRole, "actorRole")
        .toLowerCase(),
      commandId: normalizeCommandId(value.commandId),
      confirmIrreversibleArchive: normalizeBoolean(
        value.confirmIrreversibleArchive,
        "confirmIrreversibleArchive",
      ),
      expectedRevision: normalizeRevision(value.expectedRevision),
      instituteId: normalizeRequiredString(value.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(value.ipAddress) ?? undefined,
      isVendor: value.isVendor === true,
      userAgent: normalizeOptionalString(value.userAgent) ?? undefined,
    };
  }

  /**
   * Executes the archive flow for a single academic year.
   * @param {AcademicYearArchiveValidatedRequest} input Archive request.
   * @return {Promise<AcademicYearArchiveResult>} Archive outcome metadata.
   */
  public async archiveAcademicYear(
    input: AcademicYearArchiveValidatedRequest,
  ): Promise<AcademicYearArchiveResult> {
    const request = this.normalizeRequest(input);
    const authority = this.buildCommandAuthority(request);
    const reserved = await this.reserveArchiveCommand(request, authority);
    if (reserved.state === "complete") {
      return this.toReceipt(request.commandId, reserved, true);
    }
    const claimed = await this.claimArchiveCommand(authority.commandReference);
    if (claimed.state === "complete") {
      return this.toReceipt(request.commandId, claimed, true);
    }

    try {
      const projectId = this.dependencies.projectIdResolver();
      const executionContext = await this.prepareExecutionContext(request);
      this.validateArchivePreconditions(
        executionContext.runs,
        executionContext.sessions,
      );
      let command = claimed;
      if (!hasReachedStage(command.checkpointStage, "locked")) {
        command = await this.updateCheckpoint(
          authority,
          claimed.activeAttempt as number,
          "locked",
          {},
        );
      }

      const exportRows = executionContext.sessions
        .filter((session) => session.status === "submitted")
        .map((session) => buildSessionRow({
          instituteId: request.instituteId,
          runRecord: executionContext.runs.find(
            (run) => run.runId === session.runId,
          ),
          sessionRecord: session,
          studentRecord: executionContext.studentsById.get(session.studentId),
          yearId: request.academicYearId,
        }));

      if (!hasReachedStage(command.checkpointStage, "exported")) {
        await this.dependencies.bigQueryClient.ensureArchiveTables({
          datasetId: executionContext.archiveDatasetId,
          projectId,
          sessionsTableId: executionContext.sessionsTableId,
        });
        const existingRowCount = await this.dependencies.bigQueryClient
          .getExistingRowCount({
            datasetId: executionContext.archiveDatasetId,
            projectId,
            sessionsTableId: executionContext.sessionsTableId,
          });
        if (existingRowCount === 0 && exportRows.length > 0) {
          await this.dependencies.bigQueryClient.insertSessionRows({
            datasetId: executionContext.archiveDatasetId,
            projectId,
            rows: exportRows,
            sessionsTableId: executionContext.sessionsTableId,
          });
        } else if (existingRowCount !== exportRows.length) {
          throw new AcademicYearArchiveValidationError(
            "INTERNAL_ERROR",
            "Archive export row count conflicts with durable academic-year authority.",
          );
        }
        command = await this.updateCheckpoint(
          authority,
          claimed.activeAttempt as number,
          "exported",
          {exportedSessionCount: exportRows.length},
        );
      }

      if (!hasReachedStage(command.checkpointStage, "snapshot_created")) {
        const snapshotResult = await this.dependencies.generateGovernanceSnapshot({
          academicYear: request.academicYearId,
          instituteId: request.instituteId,
          snapshotId: request.academicYearId,
          snapshotMonth: buildSnapshotMonth(this.dependencies.now()),
          versionMetadata: {
            calibrationVersionUsed: buildJoinedVersion(
              executionContext.runs.map((run) => run.calibrationVersion)
                .filter((value): value is string => Boolean(value)),
            ),
            riskModelVersionUsed: buildJoinedVersion(
              executionContext.runs.map((run) => run.riskModelVersion)
                .filter((value): value is string => Boolean(value)),
            ),
            templateVersionRangeUsed: buildTemplateVersionRange(
              executionContext.runs.map((run) => run.templateVersion)
                .filter((value): value is string => Boolean(value)),
            ),
          },
        });
        if (!snapshotResult.documentPath) {
          throw new AcademicYearArchiveValidationError(
            "INTERNAL_ERROR",
            "Archive snapshot generation did not return durable authority.",
          );
        }
        const snapshotAuthority = await this.dependencies.firestore
          .doc(snapshotResult.documentPath).get();
        if (!snapshotAuthority.exists) {
          throw new AcademicYearArchiveValidationError(
            "INTERNAL_ERROR",
            "Archive snapshot generation did not persist durable authority.",
          );
        }
        command = await this.updateCheckpoint(
          authority,
          claimed.activeAttempt as number,
          "snapshot_created",
          {snapshotPath: snapshotResult.documentPath},
        );
      }

      const completed = await this.finalizeArchive(
        request,
        authority,
        claimed.activeAttempt as number,
        command,
      );
      this.logger.info("Academic year archive completed.", {
        academicYearId: request.academicYearId,
        auditEventId: completed.auditEventId,
        instituteId: request.instituteId,
        revision: completed.revision,
      });
      return this.toReceipt(request.commandId, completed, false);
    } catch (error) {
      await this.recordFailure(
        authority.commandReference,
        claimed.activeAttempt as number,
        error,
      );
      if (error instanceof AcademicYearArchiveValidationError) throw error;
      throw new AcademicYearArchiveValidationError(
        "INTERNAL_ERROR",
        "Academic-year archive was interrupted and can be retried with the same command.",
      );
    }
  }

  /**
   * Loads the academic year, run, session, and student data needed for
   * archive execution.
   * @param {AcademicYearArchiveValidatedRequest} input Archive request.
   * @return {Promise<ArchiveExecutionContext>} Archive execution context.
   */
  private async prepareExecutionContext(
    input: AcademicYearArchiveValidatedRequest,
  ): Promise<ArchiveExecutionContext> {
    const academicYearReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(input.instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION)
      .doc(input.academicYearId);
    const academicYearSnapshot = await academicYearReference.get();

    if (!academicYearSnapshot.exists) {
      throw new AcademicYearArchiveValidationError(
        "NOT_FOUND",
        "Academic year was not found.",
      );
    }

    const academicYearData = academicYearSnapshot.data();
    const currentStatus = toNormalizedStatus(academicYearData?.status);
    if (currentStatus !== "locked") {
      throw new AcademicYearArchiveValidationError(
        "CONFLICT",
        "Academic year must remain locked while archive recovery runs.",
      );
    }
    const runsSnapshot = await academicYearReference
      .collection(RUNS_COLLECTION)
      .limit(MAX_ARCHIVE_RUNS + 1)
      .get();
    if (runsSnapshot.size > MAX_ARCHIVE_RUNS) {
      throw new AcademicYearArchiveValidationError(
        "CONFLICT",
        `Academic-year archive exceeds the ${MAX_ARCHIVE_RUNS}-run bound.`,
      );
    }
    const runs: ArchiveRunRecord[] = runsSnapshot.docs.map((document) => {
      const runData = document.data();

      return {
        calibrationVersion:
          normalizeOptionalString(runData.calibrationVersion) ?? undefined,
        examType: normalizeOptionalString(
          runData.examType ?? runData.testType,
        ) ?? undefined,
        mode: normalizeOptionalString(runData.mode) ?? undefined,
        riskModelVersion:
          normalizeOptionalString(runData.riskModelVersion) ?? undefined,
        runId: document.id,
        status: normalizeOptionalString(runData.status) ?? undefined,
        templateVersion:
          normalizeOptionalString(runData.templateVersion) ?? undefined,
        testId: normalizeOptionalString(runData.testId) ?? undefined,
      };
    });
    const sessionSnapshots = await Promise.all(
      runsSnapshot.docs.map((runDocument) =>
        runDocument.ref.collection(SESSIONS_COLLECTION)
          .limit(MAX_ARCHIVE_SESSIONS + 1).get()),
    );
    const sessionCount = sessionSnapshots.reduce(
      (total, snapshot) => total + snapshot.size,
      0,
    );
    if (sessionCount > MAX_ARCHIVE_SESSIONS) {
      throw new AcademicYearArchiveValidationError(
        "CONFLICT",
        `Academic-year archive exceeds the ${MAX_ARCHIVE_SESSIONS}-session bound.`,
      );
    }
    const sessions: ArchiveSessionRecord[] = sessionSnapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((document) => {
        const sessionData = document.data();

        return {
          calibrationVersion:
            normalizeOptionalString(sessionData.calibrationVersion),
          createdAt: normalizeTimestamp(sessionData.createdAt),
          data: sessionData,
          mode: normalizeOptionalString(sessionData.mode),
          runId: normalizeRequiredString(
            sessionData.runId ?? document.ref.parent.parent?.id,
            "session.runId",
          ),
          sessionId: document.id,
          startedAt: normalizeTimestamp(sessionData.startedAt),
          status: toNormalizedStatus(sessionData.status),
          studentId: normalizeRequiredString(
            sessionData.studentId,
            "session.studentId",
          ),
          submittedAt: normalizeTimestamp(sessionData.submittedAt),
        };
      });

    const uniqueStudentIds = Array.from(new Set(
      sessions.map((session) => session.studentId),
    ));
    const studentSnapshots = uniqueStudentIds.length === 0 ?
      [] :
      await this.dependencies.firestore.getAll(
        ...uniqueStudentIds.map((studentId) =>
          this.dependencies.firestore
            .collection(INSTITUTES_COLLECTION)
            .doc(input.instituteId)
            .collection(STUDENTS_COLLECTION)
            .doc(studentId)),
      );
    const studentsById = new Map<string, ArchiveStudentRecord>(
      studentSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => {
          const studentData = snapshot.data();

          return [
            snapshot.id,
            {
              batchId: normalizeOptionalString(studentData?.batchId),
              studentId: snapshot.id,
            },
          ];
        }),
    );

    return {
      academicYearPath: academicYearReference.path,
      academicYearReference,
      archiveDatasetId: buildArchiveDatasetId(input.instituteId),
      runs,
      sessions,
      sessionsTableId: buildSessionsTableId(input.academicYearId),
      studentsById,
    };
  }

  /**
   * Enforces the documented archive preconditions before mutation begins.
   * @param {ArchiveRunRecord[]} runs Academic-year run records.
   * @param {ArchiveSessionRecord[]} sessions Academic-year session records.
   * @return {void}
   */
  private validateArchivePreconditions(
    runs: ArchiveRunRecord[],
    sessions: ArchiveSessionRecord[],
  ): void {
    const incompleteRun = runs.find((run) =>
      !TERMINAL_RUN_STATUSES.has(toNormalizedStatus(run.status)),
    );

    if (incompleteRun) {
      throw new AcademicYearArchiveValidationError(
        "VALIDATION_ERROR",
        "Archive requires all runs to be completed, archived, cancelled, " +
        "or terminated before execution.",
      );
    }

    const nonTerminalSession = sessions.find(
      (session) => !TERMINAL_SESSION_STATUSES.has(session.status),
    );

    if (nonTerminalSession) {
      throw new AcademicYearArchiveValidationError(
        "VALIDATION_ERROR",
        "Archive requires every session to have a canonical terminal status.",
      );
    }
  }

  private buildCommandAuthority(
    request: AcademicYearArchiveValidatedRequest,
  ): ArchiveCommandAuthority {
    const commandIdHash = sha256(`${request.instituteId}:${request.commandId}`);
    const commandDocumentId = `settings_${commandIdHash.slice(0, 40)}`;
    const auditEventId = `settings_audit_${commandIdHash.slice(0, 40)}`;
    const instituteReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId);
    return {
      auditEventId,
      auditLogReference: instituteReference.collection(AUDIT_LOGS_COLLECTION)
        .doc(auditEventId),
      commandIdHash,
      commandReference: instituteReference
        .collection(SETTINGS_COMMANDS_COLLECTION).doc(commandDocumentId),
      fingerprint: sha256(stableSerialize({
        academicYearId: request.academicYearId,
        actionType: "ARCHIVE_ACADEMIC_YEAR",
        confirmIrreversibleArchive: true,
      })),
      instituteReference,
      settingsAuditReference: instituteReference
        .collection(SETTINGS_AUDIT_COLLECTION).doc(auditEventId),
      yearReference: instituteReference.collection(ACADEMIC_YEARS_COLLECTION)
        .doc(request.academicYearId),
    };
  }

  private async reserveArchiveCommand(
    request: AcademicYearArchiveValidatedRequest,
    authority: ArchiveCommandAuthority,
  ): Promise<ArchiveCommandState> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, yearSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(authority.instituteReference),
        transaction.get(authority.yearReference),
        transaction.get(authority.commandReference),
      ]);
      if (commandSnapshot.exists) {
        const command = toArchiveCommand(commandSnapshot.data());
        if (!command || command.commandIdHash !== authority.commandIdHash ||
          command.fingerprint !== authority.fingerprint ||
          command.academicYearId !== request.academicYearId) {
          throw new AcademicYearArchiveValidationError(
            "CONFLICT",
            "Command ID was already used for different archive intent.",
          );
        }
        return command;
      }
      if (!instituteSnapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "NOT_FOUND",
          "Institute settings were not found.",
        );
      }
      if (!yearSnapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "NOT_FOUND",
          "Academic year was not found.",
        );
      }
      const instituteData = instituteSnapshot.data() ?? {};
      const revision = instituteData.settingsRevision === undefined ? 0 :
        normalizeRevision(instituteData.settingsRevision);
      if (revision !== request.expectedRevision) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          `Settings revision conflict: expected ${request.expectedRevision}, current ${revision}.`,
        );
      }
      if (toNormalizedStatus(yearSnapshot.get("status")) !== "locked") {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Only a locked academic year can be archived.",
        );
      }
      const archiveOperation = yearSnapshot.get("archiveOperation");
      if (isPlainObject(archiveOperation) &&
        normalizeOptionalString(archiveOperation.commandIdHash) !== authority.commandIdHash) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Academic year already has a different archive command.",
        );
      }
      const acceptedAt = this.nowTimestamp();
      const nextRevision = revision + 1;
      const command: ArchiveCommandState = {
        academicYearId: request.academicYearId,
        acceptedAt,
        actorRole: request.actorRole,
        actorUserId: request.actorId,
        attemptCount: 0,
        auditEventId: authority.auditEventId,
        checkpointStage: "accepted",
        commandIdHash: authority.commandIdHash,
        fingerprint: authority.fingerprint,
        ...(request.ipAddress ? {ipAddressHash: sha256(request.ipAddress)} : {}),
        revision: nextRevision,
        state: "pending",
        ...(request.userAgent ? {userAgentHash: sha256(request.userAgent)} : {}),
      };
      transaction.update(authority.instituteReference, {
        settingsRevision: nextRevision,
        updatedAt: acceptedAt,
      });
      transaction.update(authority.yearReference, {
        archiveOperation: {
          commandIdHash: authority.commandIdHash,
          stage: "accepted",
          updatedAt: acceptedAt,
        },
      });
      transaction.create(authority.commandReference, {
        ...command,
        actionType: "ARCHIVE_ACADEMIC_YEAR",
        activeAttempt: null,
        completedAt: null,
        lastErrorCode: null,
        leaseUntil: null,
        snapshotPath: null,
        updatedAt: acceptedAt,
      });
      return command;
    });
  }

  private async claimArchiveCommand(
    reference: FirebaseFirestore.DocumentReference,
  ): Promise<ArchiveCommandState> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const command = snapshot.exists ? toArchiveCommand(snapshot.data()) : null;
      if (!command) {
        throw new AcademicYearArchiveValidationError(
          "INTERNAL_ERROR",
          "Archive command authority is missing or invalid.",
        );
      }
      if (command.state === "complete") return command;
      const now = this.nowTimestamp();
      if (command.state === "processing" && command.leaseUntil &&
        command.leaseUntil.toMillis() > now.toMillis()) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Academic-year archive is already in progress.",
        );
      }
      const activeAttempt = command.attemptCount + 1;
      const claimed: ArchiveCommandState = {
        ...command,
        activeAttempt,
        attemptCount: activeAttempt,
        leaseUntil: Timestamp.fromMillis(now.toMillis() + ARCHIVE_LEASE_MS),
        state: "processing",
      };
      transaction.update(reference, {
        activeAttempt,
        attemptCount: activeAttempt,
        lastAttemptAt: now,
        lastErrorCode: null,
        leaseUntil: claimed.leaseUntil,
        state: "processing",
        updatedAt: now,
      });
      return claimed;
    });
  }

  private async updateCheckpoint(
    authority: ArchiveCommandAuthority,
    activeAttempt: number,
    checkpointStage: ArchiveCheckpointStage,
    fields: Record<string, unknown>,
  ): Promise<ArchiveCommandState> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, yearSnapshot] = await Promise.all([
        transaction.get(authority.commandReference),
        transaction.get(authority.yearReference),
      ]);
      const command = commandSnapshot.exists ?
        toArchiveCommand(commandSnapshot.data()) : null;
      if (!command || command.state !== "processing" ||
        command.activeAttempt !== activeAttempt || !yearSnapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Archive attempt lost its durable processing authority.",
        );
      }
      if (hasReachedStage(command.checkpointStage, checkpointStage)) return command;
      const now = this.nowTimestamp();
      const next = {...command, ...fields, checkpointStage};
      transaction.update(authority.commandReference, {
        ...fields,
        checkpointStage,
        leaseUntil: Timestamp.fromMillis(now.toMillis() + ARCHIVE_LEASE_MS),
        updatedAt: now,
      });
      transaction.update(authority.yearReference, {
        "archiveOperation.stage": checkpointStage,
        "archiveOperation.updatedAt": now,
      });
      return next;
    });
  }

  private async finalizeArchive(
    request: AcademicYearArchiveValidatedRequest,
    authority: ArchiveCommandAuthority,
    activeAttempt: number,
    command: ArchiveCommandState,
  ): Promise<ArchiveCommandState> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, yearSnapshot, settingsAuditSnapshot, auditLogSnapshot] =
        await Promise.all([
          transaction.get(authority.commandReference),
          transaction.get(authority.yearReference),
          transaction.get(authority.settingsAuditReference),
          transaction.get(authority.auditLogReference),
        ]);
      const current = commandSnapshot.exists ?
        toArchiveCommand(commandSnapshot.data()) : null;
      if (!current || !yearSnapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "INTERNAL_ERROR",
          "Archive finalization authority is missing.",
        );
      }
      if (current.state === "complete") return current;
      if (current.state !== "processing" || current.activeAttempt !== activeAttempt ||
        current.checkpointStage !== "snapshot_created" || !command.snapshotPath) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Archive finalization checkpoint is incomplete.",
        );
      }
      if (toNormalizedStatus(yearSnapshot.get("status")) !== "locked") {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Academic year changed after archive reservation.",
        );
      }
      if (settingsAuditSnapshot.exists || auditLogSnapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "CONFLICT",
          "Archive audit authority already exists without completion.",
        );
      }
      const completedAt = this.nowTimestamp();
      const contextHashes = {
        ipAddressHash: current.ipAddressHash ?? null,
        userAgentHash: current.userAgentHash ?? null,
      };
      transaction.update(authority.yearReference, {
        archivedAt: completedAt,
        archiveOperation: {
          commandIdHash: authority.commandIdHash,
          stage: "archived",
          updatedAt: completedAt,
        },
        snapshotGenerated: true,
        snapshotId: request.academicYearId,
        status: "archived",
      });
      transaction.create(authority.settingsAuditReference, {
        actionType: "ARCHIVE_ACADEMIC_YEAR",
        actorRole: current.actorRole,
        actorUserId: current.actorUserId,
        area: "academic_year",
        createdAt: completedAt,
        eventId: authority.auditEventId,
        ...contextHashes,
        occurredAt: completedAt,
        revision: current.revision,
        summary: "Academic year archived after export and snapshot completion.",
        targetId: request.academicYearId,
      });
      transaction.create(authority.auditLogReference, {
        actionType: "ARCHIVE_ACADEMIC_YEAR",
        actorId: current.actorUserId,
        actorRole: current.actorRole,
        actorUid: current.actorUserId,
        after: {snapshotGenerated: true, status: "archived"},
        auditId: authority.auditEventId,
        before: {status: "locked"},
        entityId: request.academicYearId,
        entityType: "academicYear",
        instituteId: request.instituteId,
        layer: current.actorRole === "vendor" ? "L2" : "L1",
        metadata: {
          snapshotPathHash: sha256(command.snapshotPath),
        },
        targetCollection: "academicYears",
        targetId: request.academicYearId,
        tenantId: request.instituteId,
        timestamp: completedAt,
        ...contextHashes,
      });
      const completed: ArchiveCommandState = {
        ...current,
        activeAttempt: undefined,
        checkpointStage: "archived",
        completedAt,
        leaseUntil: undefined,
        snapshotPath: command.snapshotPath,
        state: "complete",
      };
      transaction.update(authority.commandReference, {
        activeAttempt: null,
        checkpointStage: "archived",
        completedAt,
        lastErrorCode: null,
        leaseUntil: null,
        state: "complete",
        updatedAt: completedAt,
      });
      return completed;
    });
  }

  private async recordFailure(
    reference: FirebaseFirestore.DocumentReference,
    activeAttempt: number,
    error: unknown,
  ): Promise<void> {
    const errorCode = error instanceof AcademicYearArchiveValidationError ?
      error.code.toLowerCase() : "archive_processing_error";
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.get("state") !== "processing" ||
        snapshot.get("activeAttempt") !== activeAttempt) return;
      transaction.update(reference, {
        activeAttempt: null,
        lastErrorCode: errorCode,
        leaseUntil: null,
        state: "failed",
        updatedAt: this.nowTimestamp(),
      });
    });
  }

  private toReceipt(
    commandId: string,
    command: ArchiveCommandState,
    replayed: boolean,
  ): AcademicYearArchiveResult {
    const completedAt = command.completedAt ?? command.acceptedAt;
    return {
      academicYearId: command.academicYearId,
      auditEventId: command.auditEventId,
      commandId,
      completedAt: completedAt.toDate().toISOString(),
      replayed,
      revision: command.revision,
      stage: command.state === "failed" ? "failed" : command.checkpointStage,
    };
  }

  private nowTimestamp(): Timestamp {
    return Timestamp.fromDate(this.dependencies.now());
  }
}

/**
 * Resolves the Google Cloud project identifier for archive exports.
 * @return {string} Google Cloud project identifier.
 */
const resolveProjectId = (): string => {
  const projectId =
    process.env.PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim();

  if (!projectId) {
    throw new AcademicYearArchiveValidationError(
      "INTERNAL_ERROR",
      "Missing PROJECT_ID environment configuration for archive export.",
    );
  }

  return projectId;
};

export const archivePipelineService = new ArchivePipelineService({
  bigQueryClient: new BigQueryRestArchiveClient(),
  firestore: getFirestore(),
  generateGovernanceSnapshot:
    governanceSnapshotAggregationService.generateSnapshotForAcademicYear.bind(
      governanceSnapshotAggregationService,
    ),
  now: () => new Date(),
  projectIdResolver: resolveProjectId,
});

export {
  ArchivePipelineDependencies,
  BigQueryRestArchiveClient,
  buildArchiveDatasetId,
  buildSessionsTableId,
  buildSnapshotMonth,
  buildTemplateVersionRange,
  buildJoinedVersion,
};
