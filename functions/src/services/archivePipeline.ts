import {Timestamp} from "firebase-admin/firestore";
import {GoogleAuth} from "google-auth-library";
import {createLogger} from "./logging";
import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
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
const ACTIVE_SESSION_STATUSES = new Set([
  "created",
  "started",
  "active",
]);
const TERMINAL_RUN_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "terminated",
]);
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
  currentStatus: string;
  runs: ArchiveRunRecord[];
  sessions: ArchiveSessionRecord[];
  sessionsTableId: string;
  studentsById: Map<string, ArchiveStudentRecord>;
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
  createArchiveAuditLog:
    typeof administrativeActionLoggingService.logAcademicYearArchive;
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
      actorId: normalizeRequiredString(value.actorId, "actorId"),
      actorRole: normalizeRequiredString(value.actorRole, "actorRole")
        .toLowerCase(),
      doubleConfirm: normalizeBoolean(value.doubleConfirm, "doubleConfirm"),
      instituteId: normalizeRequiredString(value.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(value.ipAddress) ?? undefined,
      isVendor: value.isVendor === true,
      userAgent: normalizeOptionalString(value.userAgent) ?? undefined,
      yearId: normalizeRequiredString(value.yearId, "yearId"),
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
    const projectId = this.dependencies.projectIdResolver();
    const executionContext = await this.prepareExecutionContext(request);

    if (executionContext.currentStatus === "archived") {
      return {
        academicYearPath: executionContext.academicYearPath,
        archived: true,
        bigQuery: {
          datasetId: executionContext.archiveDatasetId,
          projectId,
          rowsExported: 0,
          sessionsTableId: executionContext.sessionsTableId,
          skipped: true,
        },
        idempotent: true,
        instituteId: request.instituteId,
        status: "archived",
        yearId: request.yearId,
      };
    }

    this.validateArchivePreconditions(
      executionContext.runs,
      executionContext.sessions,
    );
    await this.lockAcademicYear(executionContext.academicYearReference);

    const exportedSessions = executionContext.sessions
      .filter((session) => session.status === "submitted");
    const exportRows = exportedSessions.map((session) =>
      buildSessionRow({
        instituteId: request.instituteId,
        runRecord: executionContext.runs.find(
          (run) => run.runId === session.runId,
        ),
        sessionRecord: session,
        studentRecord: executionContext.studentsById.get(session.studentId),
        yearId: request.yearId,
      }),
    );

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

    let skippedExport = false;
    if (existingRowCount === exportRows.length) {
      skippedExport = true;
    } else if (existingRowCount === 0) {
      await this.dependencies.bigQueryClient.insertSessionRows({
        datasetId: executionContext.archiveDatasetId,
        projectId,
        rows: exportRows,
        sessionsTableId: executionContext.sessionsTableId,
      });
    } else {
      throw new AcademicYearArchiveValidationError(
        "INTERNAL_ERROR",
        "Existing archive table row count does not match the academic year " +
        "session count. Manual reconciliation is required before retrying.",
      );
    }

    const snapshotMonth = buildSnapshotMonth(this.dependencies.now());
    const snapshotResult = await this.dependencies.generateGovernanceSnapshot({
      academicYear: request.yearId,
      instituteId: request.instituteId,
      snapshotId: request.yearId,
      snapshotMonth,
      versionMetadata: {
        calibrationVersionUsed: buildJoinedVersion(
          executionContext.runs
            .map((run) => run.calibrationVersion)
            .filter((value): value is string => Boolean(value)),
        ),
        riskModelVersionUsed: buildJoinedVersion(
          executionContext.runs
            .map((run) => run.riskModelVersion)
            .filter((value): value is string => Boolean(value)),
        ),
        templateVersionRangeUsed: buildTemplateVersionRange(
          executionContext.runs
            .map((run) => run.templateVersion)
            .filter((value): value is string => Boolean(value)),
        ),
      },
    });

    if (!snapshotResult.documentPath) {
      throw new AcademicYearArchiveValidationError(
        "INTERNAL_ERROR",
        "Archive snapshot generation did not return a snapshot " +
        "document path.",
      );
    }

    const archivedAt = Timestamp.now();
    await executionContext.academicYearReference.set({
      archivedAt,
      snapshotGenerated: true,
      snapshotId: request.yearId,
      status: "archived",
    }, {merge: true});

    const auditResult = await this.dependencies.createArchiveAuditLog({
      actorId: request.actorId,
      actorRole: request.actorRole,
      afterState: {
        archivedAt: archivedAt.toDate().toISOString(),
        snapshotGenerated: true,
        snapshotId: request.yearId,
        status: "archived",
      },
      beforeState: {
        status: executionContext.currentStatus || "active",
      },
      entityId: request.yearId,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        archiveDatasetId: executionContext.archiveDatasetId,
        archivedSessionCount: exportRows.length,
        sessionsTableId: executionContext.sessionsTableId,
        snapshotPath: snapshotResult.documentPath,
        vendorAuthorized: request.isVendor,
      },
      userAgent: request.userAgent,
    });

    this.logger.info("Academic year archive completed.", {
      archivedSessionCount: exportRows.length,
      auditLogPath: auditResult.path,
      datasetId: executionContext.archiveDatasetId,
      instituteId: request.instituteId,
      skippedExport,
      snapshotPath: snapshotResult.documentPath,
      yearId: request.yearId,
    });

    return {
      academicYearPath: executionContext.academicYearPath,
      archived: true,
      archivedAt: archivedAt.toDate().toISOString(),
      auditLogPath: auditResult.path,
      bigQuery: {
        datasetId: executionContext.archiveDatasetId,
        projectId,
        rowsExported: exportRows.length,
        sessionsTableId: executionContext.sessionsTableId,
        skipped: skippedExport,
      },
      idempotent: false,
      instituteId: request.instituteId,
      snapshotPath: snapshotResult.documentPath,
      status: "archived",
      yearId: request.yearId,
    };
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
      .doc(input.yearId);
    const academicYearSnapshot = await academicYearReference.get();

    if (!academicYearSnapshot.exists) {
      throw new AcademicYearArchiveValidationError(
        "NOT_FOUND",
        "Academic year was not found.",
      );
    }

    const academicYearData = academicYearSnapshot.data();
    const currentStatus = toNormalizedStatus(academicYearData?.status);
    const runsSnapshot = await academicYearReference
      .collection(RUNS_COLLECTION)
      .get();
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
        runDocument.ref.collection(SESSIONS_COLLECTION).get()),
    );
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
      currentStatus,
      runs,
      sessions,
      sessionsTableId: buildSessionsTableId(input.yearId),
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

    const activeSession = sessions.find((session) =>
      ACTIVE_SESSION_STATUSES.has(session.status),
    );

    if (activeSession) {
      throw new AcademicYearArchiveValidationError(
        "VALIDATION_ERROR",
        "Archive requires all active sessions to be closed before execution.",
      );
    }
  }

  /**
   * Transitions the academic year into the locked state before export.
   * @param {FirebaseFirestore.DocumentReference} academicYearReference Target
   * academic-year document reference.
   * @return {Promise<void>} Resolves after the lock transaction completes.
   */
  private async lockAcademicYear(
    academicYearReference: FirebaseFirestore.DocumentReference,
  ): Promise<void> {
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(academicYearReference);

      if (!snapshot.exists) {
        throw new AcademicYearArchiveValidationError(
          "NOT_FOUND",
          "Academic year was not found.",
        );
      }

      const currentStatus = toNormalizedStatus(snapshot.data()?.status);

      if (currentStatus === "archived" || currentStatus === "locked") {
        return;
      }

      transaction.set(academicYearReference, {
        status: "locked",
      }, {merge: true});
    });
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
  createArchiveAuditLog:
    administrativeActionLoggingService.logAcademicYearArchive.bind(
      administrativeActionLoggingService,
    ),
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
