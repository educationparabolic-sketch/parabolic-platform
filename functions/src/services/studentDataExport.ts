import {createHash} from "crypto";
import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
import {signedUrlService} from "./signedUrl";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {
  StudentDataExportResult,
  StudentDataExportValidatedRequest,
  StudentDataExportValidationError,
} from "../types/studentDataExport";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const INSIGHT_SNAPSHOTS_COLLECTION = "insightSnapshots";
const AUDIT_LOGS_COLLECTION = "auditLogs";

interface ExportAcademicYearRecord {
  yearId: string;
}

interface ExportSessionRow {
  accuracyPercent: number | null;
  academicYear: string;
  calibrationVersion: string | null;
  disciplineIndex: number | null;
  examType: string | null;
  mode: string | null;
  phaseAdherencePercent: number | null;
  rawScorePercent: number | null;
  riskState: string | null;
  runId: string;
  sessionId: string;
  status: string | null;
  submittedAt: string | null;
  testId: string | null;
}

interface ExportInsightRow {
  academicYear: string;
  generatedAt: string | null;
  runId: string | null;
  sessionId: string | null;
  summary: string | null;
  title: string | null;
}

interface ExportMetricRow {
  academicYear: string;
  avgAccuracyPercent: number | null;
  avgPhaseAdherence: number | null;
  avgRawScorePercent: number | null;
  disciplineIndex: number | null;
  riskState: string | null;
}

interface StudentDataExportDependencies {
  createExportAuditLog:
    typeof administrativeActionLoggingService.logStudentDataExport;
  firestore: FirebaseFirestore.Firestore;
  generateDownloadUrl:
    typeof signedUrlService.generateReportAssetSignedUrl;
  now: () => Date;
  resolveStorageTarget: (
    input: {
      instituteId: string;
      month: number;
      studentId: string;
      year: number;
    },
  ) => StorageObjectTarget;
  uploadExportFile: (
    target: StorageObjectTarget,
    content: string,
    metadata: Record<string, string>,
  ) => Promise<void>;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string => {
  if (typeof value !== "string") {
    throw new StudentDataExportValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new StudentDataExportValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }
  if (normalizedValue.length > maxLength) {
    throw new StudentDataExportValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maxLength} characters.`,
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

const normalizeBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== "boolean") {
    throw new StudentDataExportValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a boolean.`,
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

const buildExportAuthority = (input: {
  idempotencyKey: string;
  includeAiSummaries: boolean;
  instituteId: string;
  studentId: string;
}): {auditId: string; idempotencyKeyHash: string; requestFingerprint: string} => {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  return {
    auditId: `student_export_${sha256(
      `${input.instituteId}:${idempotencyKeyHash}`,
    ).slice(0, 40)}`,
    idempotencyKeyHash,
    requestFingerprint: sha256(stableJson({
      includeAiSummaries: input.includeAiSummaries,
      studentId: input.studentId,
    })),
  };
};

const toNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
};

const toCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  const escaped = stringValue.replace(/"/g, "\"\"");

  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
};

const buildCsv = (
  rows: Array<Record<string, unknown>>,
): string => {
  const preferredHeaders = [
    "section",
    "instituteId",
    "studentId",
    "academicYear",
    "runId",
    "sessionId",
    "status",
    "submittedAt",
    "rawScorePercent",
    "accuracyPercent",
    "disciplineIndex",
    "riskState",
    "phaseAdherencePercent",
    "title",
    "summary",
    "field",
    "value",
    "generatedAt",
    "expiresAt",
  ];
  const dynamicHeaders = Array.from(new Set(
    rows.flatMap((row) => Object.keys(row)),
  )).filter((header) => !preferredHeaders.includes(header))
    .sort((left, right) => left.localeCompare(right));
  const headers = [
    ...preferredHeaders.filter((header) =>
      rows.some((row) => header in row),
    ),
    ...dynamicHeaders,
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) =>
      toCsvCell(row[header])).join(",")),
  ];

  return `${lines.join("\n")}\n`;
};

const buildStorageMetadata = (
  input: {
    approvedBy: string;
    expiresAt: string;
    exportHash: string;
    generatedAt: string;
    requestedBy: string;
  },
): Record<string, string> => ({
  approvedBy: input.approvedBy,
  expiresAt: input.expiresAt,
  exportHash: input.exportHash,
  generatedAt: input.generatedAt,
  requestedBy: input.requestedBy,
});

const defaultResolveStorageTarget = (
  input: {
    instituteId: string;
    month: number;
    studentId: string;
    year: number;
  },
): StorageObjectTarget => storageBucketArchitectureService
  .resolveReportAssetStorageTarget({
    extension: "csv",
    instituteId: input.instituteId,
    month: input.month,
    reportKind: "studentDataExport",
    studentId: input.studentId,
    year: input.year,
  });

const defaultUploadExportFile = async (
  target: StorageObjectTarget,
  content: string,
  metadata: Record<string, string>,
): Promise<void> => {
  const bucket = storageBucketArchitectureService.getBucket("reports");
  const file = bucket.file(target.objectPath);

  await file.save(content, {
    contentType: target.contentType,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata,
    },
    resumable: false,
  });
};

/**
 * Builds a secure, admin-approved export bundle for a student's stored data.
 */
export class StudentDataExportService {
  private readonly logger = createLogger("StudentDataExportService");

  /**
   * @param {StudentDataExportDependencies} dependencies Runtime collaborators.
   */
  constructor(
    private readonly dependencies: StudentDataExportDependencies = {
      createExportAuditLog:
        administrativeActionLoggingService.logStudentDataExport.bind(
          administrativeActionLoggingService,
        ),
      firestore: getFirestore(),
      generateDownloadUrl: signedUrlService.generateReportAssetSignedUrl.bind(
        signedUrlService,
      ),
      now: () => new Date(),
      resolveStorageTarget: defaultResolveStorageTarget,
      uploadExportFile: defaultUploadExportFile,
    },
  ) {}

  /**
   * Validates and normalizes the student data export request payload.
   * @param {Partial<StudentDataExportValidatedRequest>} input Raw request data.
   * @return {StudentDataExportValidatedRequest} Typed export request.
   */
  public normalizeRequest(
    input: Partial<StudentDataExportValidatedRequest>,
  ): StudentDataExportValidatedRequest {
    const actorRole = normalizeRequiredString(input.actorRole, "actorRole")
      .toLowerCase();
    if (actorRole !== "admin") {
      throw new StudentDataExportValidationError(
        "FORBIDDEN",
        "Student data exports require the admin role.",
      );
    }

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole,
      idempotencyKey: normalizeRequiredString(
        input.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      includeAiSummaries: normalizeBoolean(
        input.includeAiSummaries,
        "includeAiSummaries",
      ),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress) ?? undefined,
      studentId: normalizeRequiredString(input.studentId, "studentId"),
      userAgent: normalizeOptionalString(input.userAgent) ?? undefined,
    };
  }

  /**
   * Generates the student export bundle and returns secure download metadata.
   * @param {StudentDataExportValidatedRequest} request Approved export request.
   * @return {Promise<StudentDataExportResult>} Export result metadata.
   */
  public async generateExport(
    request: StudentDataExportValidatedRequest,
  ): Promise<StudentDataExportResult> {
    const normalizedRequest = this.normalizeRequest(request);
    const authority = buildExportAuthority(normalizedRequest);
    const auditReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${normalizedRequest.instituteId}/` +
      `${AUDIT_LOGS_COLLECTION}/${authority.auditId}`,
    );
    const existingAudit = await auditReference.get();
    if (existingAudit.exists) {
      return this.readReplayResult(
        existingAudit,
        authority.requestFingerprint,
      );
    }
    const studentReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${normalizedRequest.instituteId}/` +
      `${STUDENTS_COLLECTION}/${normalizedRequest.studentId}`,
    );
    const studentSnapshot = await studentReference.get();

    if (!studentSnapshot.exists) {
      throw new StudentDataExportValidationError(
        "NOT_FOUND",
        "Student record was not found for export.",
      );
    }

    const academicYearSnapshot = await this.dependencies.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${normalizedRequest.instituteId}/` +
        `${ACADEMIC_YEARS_COLLECTION}`,
      )
      .get();
    const academicYears = academicYearSnapshot.docs
      .map((document) => ({yearId: document.id}))
      .sort((left, right) => left.yearId.localeCompare(right.yearId));
    const sessionRows: ExportSessionRow[] = [];
    const metricRows: ExportMetricRow[] = [];
    const insightRows: ExportInsightRow[] = [];

    for (const academicYear of academicYears) {
      await this.collectAcademicYearData(
        normalizedRequest,
        academicYear,
        sessionRows,
        metricRows,
        insightRows,
      );
    }

    const generatedAt = this.dependencies.now();
    const storageTarget = this.dependencies.resolveStorageTarget({
      instituteId: normalizedRequest.instituteId,
      month: generatedAt.getUTCMonth() + 1,
      studentId: normalizedRequest.studentId,
      year: generatedAt.getUTCFullYear(),
    });
    const profileData = studentSnapshot.data() ?? {};
    const profileRows = Object.entries(profileData)
      .filter(([, value]) => {
        if (value instanceof Timestamp) {
          return true;
        }

        return typeof value !== "object" || value === null;
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => ({
        field,
        instituteId: normalizedRequest.instituteId,
        section: "student_profile",
        studentId: normalizedRequest.studentId,
        value: toIsoString(value) ?? value,
      }));

    const download = this.dependencies.generateDownloadUrl({
      accessContext: "dataExportDownload",
      extension: "csv",
      instituteId: normalizedRequest.instituteId,
      month: generatedAt.getUTCMonth() + 1,
      reportKind: "studentDataExport",
      studentId: normalizedRequest.studentId,
      year: generatedAt.getUTCFullYear(),
    });
    const expiresAt = download.expiresAt;
    const metadataRows = [
      {
        approvedBy: normalizedRequest.actorId,
        expiresAt,
        field: "generatedAt",
        generatedAt: generatedAt.toISOString(),
        instituteId: normalizedRequest.instituteId,
        section: "export_metadata",
        studentId: normalizedRequest.studentId,
        value: generatedAt.toISOString(),
      },
      {
        approvedBy: normalizedRequest.actorId,
        expiresAt,
        field: "expiresAt",
        generatedAt: generatedAt.toISOString(),
        instituteId: normalizedRequest.instituteId,
        section: "export_metadata",
        studentId: normalizedRequest.studentId,
        value: expiresAt,
      },
    ];
    const rows = [
      ...metadataRows,
      ...profileRows,
      ...metricRows.map((row) => ({
        ...row,
        instituteId: normalizedRequest.instituteId,
        section: "student_metrics",
        studentId: normalizedRequest.studentId,
      })),
      ...sessionRows.map((row) => ({
        ...row,
        instituteId: normalizedRequest.instituteId,
        section: "session_history",
        studentId: normalizedRequest.studentId,
      })),
      ...insightRows.map((row) => ({
        ...row,
        instituteId: normalizedRequest.instituteId,
        section: "ai_summary",
        studentId: normalizedRequest.studentId,
      })),
    ];
    const finalizedCsvContent = buildCsv(rows);
    const finalizedExportHash = createHash("sha256")
      .update(finalizedCsvContent)
      .digest("hex");

    await this.dependencies.uploadExportFile(
      storageTarget,
      finalizedCsvContent,
      buildStorageMetadata({
        approvedBy: normalizedRequest.actorId,
        expiresAt,
        exportHash: finalizedExportHash,
        generatedAt: generatedAt.toISOString(),
        requestedBy: normalizedRequest.studentId,
      }),
    );

    const result: StudentDataExportResult = {
      auditId: authority.auditId,
      disposition: "applied",
      downloadUrl: download.signedUrl,
      expiresAt,
      exportHash: finalizedExportHash,
      generatedAt: generatedAt.toISOString(),
      records: {
        academicYearCount: academicYears.length,
        aiSummaryCount: insightRows.length,
        metricDocumentCount: metricRows.length,
        sessionCount: sessionRows.length,
      },
      studentId: normalizedRequest.studentId,
    };

    try {
      await this.dependencies.createExportAuditLog({
        auditId: authority.auditId,
        actorId: normalizedRequest.actorId,
        actorRole: normalizedRequest.actorRole,
        entityId: normalizedRequest.studentId,
        instituteId: normalizedRequest.instituteId,
        ipAddress: normalizedRequest.ipAddress,
        metadata: {
          approvedBy: normalizedRequest.actorId,
          expiresAt,
          exportHash: finalizedExportHash,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          includeAiSummaries: normalizedRequest.includeAiSummaries,
          requestFingerprint: authority.requestFingerprint,
          requestedBy: normalizedRequest.studentId,
          result,
        },
        userAgent: normalizedRequest.userAgent,
      });
    } catch (error) {
      const concurrentAudit = await auditReference.get();
      if (concurrentAudit.exists) {
        return this.readReplayResult(
          concurrentAudit,
          authority.requestFingerprint,
        );
      }
      throw error;
    }

    this.logger.info("Student data export generated.", {
      expiresAt,
      includeAiSummaries: normalizedRequest.includeAiSummaries,
      instituteId: normalizedRequest.instituteId,
      objectPath: storageTarget.objectPath,
      studentId: normalizedRequest.studentId,
    });

    return result;
  }

  private readReplayResult(
    snapshot: FirebaseFirestore.DocumentSnapshot,
    requestFingerprint: string,
  ): StudentDataExportResult {
    const metadata = snapshot.get("metadata") as Record<string, unknown> | null;
    if (!metadata || metadata.requestFingerprint !== requestFingerprint) {
      throw new StudentDataExportValidationError(
        "CONFLICT",
        "Idempotency key has already been used for a different export.",
      );
    }
    const result = metadata.result;
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      throw new StudentDataExportValidationError(
        "CONFLICT",
        "Export idempotency authority is missing its immutable result.",
      );
    }

    return {
      ...(result as StudentDataExportResult),
      disposition: "replayed",
    };
  }

  /**
   * Loads student metrics, sessions, and optional insight summaries per year.
   * @param {StudentDataExportValidatedRequest} request Export request context.
   * @param {ExportAcademicYearRecord} academicYear Academic year identifier.
   * @param {ExportSessionRow[]} sessionRows Collected session export rows.
   * @param {ExportMetricRow[]} metricRows Collected metric export rows.
   * @param {ExportInsightRow[]} insightRows Collected insight export rows.
   * @return {Promise<void>} Resolves when the year data has been loaded.
   */
  private async collectAcademicYearData(
    request: StudentDataExportValidatedRequest,
    academicYear: ExportAcademicYearRecord,
    sessionRows: ExportSessionRow[],
    metricRows: ExportMetricRow[],
    insightRows: ExportInsightRow[],
  ): Promise<void> {
    const academicYearPath =
      `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${academicYear.yearId}`;
    const metricSnapshot = await this.dependencies.firestore.doc(
      `${academicYearPath}/${STUDENT_YEAR_METRICS_COLLECTION}/` +
      `${request.studentId}`,
    ).get();

    if (metricSnapshot.exists) {
      const metricData = metricSnapshot.data() ?? {};
      metricRows.push({
        academicYear: academicYear.yearId,
        avgAccuracyPercent: toNullableNumber(metricData.avgAccuracyPercent),
        avgPhaseAdherence: toNullableNumber(metricData.avgPhaseAdherence),
        avgRawScorePercent: toNullableNumber(metricData.avgRawScorePercent),
        disciplineIndex: toNullableNumber(metricData.disciplineIndex),
        riskState: normalizeOptionalString(metricData.riskState),
      });
    }

    const runsSnapshot = await this.dependencies.firestore
      .collection(`${academicYearPath}/${RUNS_COLLECTION}`)
      .get();
    const runs = runsSnapshot.docs
      .map((document) => ({
        examType: normalizeOptionalString(document.get("examType")),
        mode: normalizeOptionalString(document.get("mode")),
        runId: document.id,
        testId: normalizeOptionalString(document.get("testId")),
      }))
      .sort((left, right) => left.runId.localeCompare(right.runId));

    for (const run of runs) {
      const sessionsSnapshot = await this.dependencies.firestore
        .collection(
          `${academicYearPath}/${RUNS_COLLECTION}/${run.runId}/` +
          `${SESSIONS_COLLECTION}`,
        )
        .where("studentId", "==", request.studentId)
        .get();

      sessionsSnapshot.docs.forEach((document) => {
        const data = document.data();

        sessionRows.push({
          accuracyPercent: toNullableNumber(data.accuracyPercent),
          academicYear: academicYear.yearId,
          calibrationVersion: normalizeOptionalString(data.calibrationVersion),
          disciplineIndex: toNullableNumber(data.disciplineIndex),
          examType: run.examType,
          mode: run.mode,
          phaseAdherencePercent: toNullableNumber(data.phaseAdherencePercent),
          rawScorePercent: toNullableNumber(data.rawScorePercent),
          riskState: normalizeOptionalString(data.riskState),
          runId: run.runId,
          sessionId: document.id,
          status: normalizeOptionalString(data.status),
          submittedAt: toIsoString(data.submittedAt),
          testId: run.testId,
        });
      });
    }

    if (!request.includeAiSummaries) {
      return;
    }

    const insightsSnapshot = await this.dependencies.firestore
      .collection(`${academicYearPath}/${INSIGHT_SNAPSHOTS_COLLECTION}`)
      .where("studentId", "==", request.studentId)
      .get();

    insightsSnapshot.docs.forEach((document) => {
      const data = document.data();

      if (normalizeOptionalString(data.snapshotType) !== "student") {
        return;
      }

      insightRows.push({
        academicYear: academicYear.yearId,
        generatedAt: toIsoString(data.sourceSubmittedAt),
        runId: normalizeOptionalString(data.runId),
        sessionId: normalizeOptionalString(data.sessionId),
        summary: normalizeOptionalString(data.summary),
        title: normalizeOptionalString(data.title),
      });
    });
  }
}

export const studentDataExportService = new StudentDataExportService();
