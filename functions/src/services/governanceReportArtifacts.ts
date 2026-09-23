import {createHash} from "crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  AdminGovernanceReportDownloadResult,
  AdminGovernanceReportGenerateResult,
  AdminGovernanceReportListResult,
  AdminGovernanceReportRecord,
  AdminGovernanceReportSourceAuthority,
} from "../../../shared/contracts/apiDtos";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {
  GovernanceReportArtifactDownloadRequest,
  GovernanceReportArtifactGenerateRequest,
  GovernanceReportArtifactListRequest,
  GovernanceReportArtifactValidationError,
} from "../types/governanceReportArtifacts";
import {GovernanceReportingResult} from "../types/governanceReporting";
import {createLogger} from "./logging";
import {governanceReportingService} from "./governanceReporting";
import {governanceSnapshotAccessService} from "./governanceSnapshotAccess";
import {renderGovernanceReportPdf} from "./governanceReportPdf";
import {signedUrlService} from "./signedUrl";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const REPORTS_COLLECTION = "governanceReports";
const REPORT_COMMANDS_COLLECTION = "governanceReportCommands";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const CONTENT_TYPE = "application/pdf" as const;
const REPORT_ID_PREFIX = "governance_report_";
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 50;

interface ReportListCursor {
  createdAt: string;
  fingerprint: string;
  reportId: string;
  version: 1;
}

type NormalizedReportListRequest = GovernanceReportArtifactListRequest & {
  limit: number;
};

interface CommandAuthority {
  auditId: string;
  idempotencyKeyHash: string;
  reportId: string;
  requestFingerprint: string;
}

interface ReportCommandRecord {
  createdAt: string;
  requestFingerprint: string;
  sourceHash: string;
  status: "generating" | "complete";
}

interface StoredArtifactInspection {
  contentType: string | null;
  metadata: Record<string, string>;
  sha256: string;
  sizeBytes: number;
}

interface GovernanceReportArtifactDependencies {
  firestore: FirebaseFirestore.Firestore;
  generateReport: typeof governanceReportingService.generateReport;
  generateSignedUrl: typeof signedUrlService.generateReportAssetSignedUrl;
  inspectArtifact: (
    target: StorageObjectTarget,
  ) => Promise<StoredArtifactInspection | null>;
  now: () => Timestamp;
  readSnapshots: typeof governanceSnapshotAccessService.readSnapshots;
  resolveStorageTarget: (
    input: {
      instituteId: string;
      month: number;
      reportId: string;
      year: number;
    },
  ) => StorageObjectTarget;
  uploadArtifact: (
    target: StorageObjectTarget,
    bytes: Buffer,
    fileName: string,
    metadata: Record<string, string>,
  ) => Promise<void>;
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

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const requiredString = (
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new GovernanceReportArtifactValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new GovernanceReportArtifactValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
};

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim() || undefined;
};

const normalizeActorRole = (value: unknown): string => {
  const role = requiredString(value, "actorRole").toLowerCase();
  if (role !== "director" && role !== "vendor") {
    throw new GovernanceReportArtifactValidationError(
      "FORBIDDEN",
      "Governance report artifacts require director or vendor authority.",
    );
  }
  return role;
};

const normalizeYearId = (value: unknown): string =>
  requiredString(value, "yearId", 64);

const listFingerprint = (instituteId: string, yearId: string): string =>
  sha256(stableJson({instituteId, yearId}));

const encodeListCursor = (cursor: ReportListCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeListCursor = (
  value: string,
  fingerprint: string,
): ReportListCursor => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint) {
      throw new Error("invalid cursor");
    }
    return {
      createdAt: requiredString(parsed.createdAt, "cursor.createdAt", 64),
      fingerprint,
      reportId: requiredString(parsed.reportId, "cursor.reportId", 128),
      version: 1,
    };
  } catch (error) {
    if (error instanceof GovernanceReportArtifactValidationError) {
      throw error;
    }
    throw new GovernanceReportArtifactValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" is invalid or does not match the active filters.",
    );
  }
};

const normalizeSnapshotId = (value: unknown): string => {
  const snapshotId = requiredString(value, "snapshotId", 7);
  if (!/^\d{4}_(?:0[1-9]|1[0-2])$/u.test(snapshotId)) {
    throw new GovernanceReportArtifactValidationError(
      "VALIDATION_ERROR",
      "Field \"snapshotId\" must match YYYY_MM with a valid month.",
    );
  }
  return snapshotId;
};

const commandAuthority = (
  request: GovernanceReportArtifactGenerateRequest,
): CommandAuthority => {
  const idempotencyKeyHash = sha256(request.idempotencyKey);
  const reportId = REPORT_ID_PREFIX + sha256(
    `${request.instituteId}:generate:${idempotencyKeyHash}`,
  ).slice(0, 40);
  const requestFingerprint = sha256(stableJson({
    actorId: request.actorId,
    instituteId: request.instituteId,
    snapshotId: request.snapshotId,
    yearId: request.yearId,
  }));
  return {
    auditId: `${reportId}_audit`,
    idempotencyKeyHash,
    reportId,
    requestFingerprint,
  };
};

const sourceReportForHash = (
  report: GovernanceReportingResult,
): GovernanceReportingResult => ({
  ...report,
  header: {
    ...report.header,
    reportPreparedAt: "",
  },
});

const withoutInternalSnapshotPath = (
  snapshot: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(snapshot).filter(([key]) => key !== "documentPath"),
);

const buildSourceAuthority = (
  report: GovernanceReportingResult,
  snapshotSha256: string,
): AdminGovernanceReportSourceAuthority => ({
  calibrationVersionUsed: report.header.calibrationVersion,
  eventCutoffAt: report.header.eventCutoffAt,
  eventRecordCount: report.header.eventRecordCount,
  riskModelVersionUsed: report.header.riskModelVersion,
  snapshotGeneratedAt: report.header.snapshotGeneratedAt,
  snapshotId: report.header.snapshotId,
  snapshotSha256,
  templateVersionRangeUsed: report.header.templateVersionRange,
});

const internalError = (message: string): never => {
  throw new GovernanceReportArtifactValidationError("INTERNAL_ERROR", message);
};

const storedString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return internalError(
      `Stored governance report field "${fieldName}" is invalid.`,
    );
  }
  return value;
};

const storedNullableString = (
  value: unknown,
  fieldName: string,
): string | null => {
  if (value === null) {
    return null;
  }
  return storedString(value, fieldName);
};

const storedNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    return internalError(
      `Stored governance report field "${fieldName}" is invalid.`,
    );
  }
  return Number(value);
};

const readSourceAuthority = (
  value: unknown,
): AdminGovernanceReportSourceAuthority => {
  if (!isRecord(value)) {
    return internalError("Stored governance report source authority is invalid.");
  }
  return {
    calibrationVersionUsed: storedNullableString(
      value.calibrationVersionUsed,
      "source.calibrationVersionUsed",
    ),
    eventCutoffAt: storedString(value.eventCutoffAt, "source.eventCutoffAt"),
    eventRecordCount: storedNonNegativeInteger(
      value.eventRecordCount,
      "source.eventRecordCount",
    ),
    riskModelVersionUsed: storedNullableString(
      value.riskModelVersionUsed,
      "source.riskModelVersionUsed",
    ),
    snapshotGeneratedAt: storedString(
      value.snapshotGeneratedAt,
      "source.snapshotGeneratedAt",
    ),
    snapshotId: storedString(value.snapshotId, "source.snapshotId"),
    snapshotSha256: storedString(
      value.snapshotSha256,
      "source.snapshotSha256",
    ),
    templateVersionRangeUsed: storedNullableString(
      value.templateVersionRangeUsed,
      "source.templateVersionRangeUsed",
    ),
  };
};

const readReportRecord = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AdminGovernanceReportRecord => {
  if (!snapshot.exists) {
    return internalError("Governance report metadata is missing.");
  }
  const value = snapshot.data();
  if (!isRecord(value) || value.immutable !== true || value.status !== "ready" ||
    value.contentType !== CONTENT_TYPE) {
    return internalError("Stored governance report metadata is invalid.");
  }
  const reportId = storedString(value.reportId, "reportId");
  if (reportId !== snapshot.id) {
    return internalError("Stored governance report ID does not match its path.");
  }
  return {
    auditId: storedString(value.auditId, "auditId"),
    contentType: CONTENT_TYPE,
    createdAt: storedString(value.createdAt, "createdAt"),
    fileName: storedString(value.fileName, "fileName"),
    immutable: true,
    month: storedString(value.month, "month"),
    reportId,
    sha256: storedString(value.sha256, "sha256"),
    sizeBytes: storedNonNegativeInteger(value.sizeBytes, "sizeBytes"),
    source: readSourceAuthority(value.source),
    status: "ready",
    yearId: storedString(value.yearId, "yearId"),
  };
};

const readCommand = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): ReportCommandRecord | null => {
  if (!snapshot.exists) {
    return null;
  }
  const value = snapshot.data();
  if (!isRecord(value) ||
    (value.status !== "generating" && value.status !== "complete")) {
    return internalError("Governance report command state is invalid.");
  }
  return {
    createdAt: storedString(value.createdAt, "command.createdAt"),
    requestFingerprint: storedString(
      value.requestFingerprint,
      "command.requestFingerprint",
    ),
    sourceHash: storedString(value.sourceHash, "command.sourceHash"),
    status: value.status,
  };
};

const assertRequestFingerprint = (
  command: ReportCommandRecord,
  requestFingerprint: string,
): void => {
  if (command.requestFingerprint !== requestFingerprint) {
    throw new GovernanceReportArtifactValidationError(
      "CONFLICT",
      "Idempotency key has already been used with different semantics.",
    );
  }
};

const defaultResolveStorageTarget = (
  input: {
    instituteId: string;
    month: number;
    reportId: string;
    year: number;
  },
): StorageObjectTarget => storageBucketArchitectureService
  .resolveReportAssetStorageTarget({
    extension: "pdf",
    instituteId: input.instituteId,
    month: input.month,
    reportId: input.reportId,
    reportKind: "governanceReport",
    year: input.year,
  });

const defaultUploadArtifact = async (
  target: StorageObjectTarget,
  bytes: Buffer,
  fileName: string,
  metadata: Record<string, string>,
): Promise<void> => {
  const file = storageBucketArchitectureService
    .getBucket("reports")
    .file(target.objectPath);
  await file.save(bytes, {
    contentType: CONTENT_TYPE,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      contentDisposition: `attachment; filename="${fileName}"`,
      metadata,
    },
    preconditionOpts: {ifGenerationMatch: 0},
    resumable: false,
    validation: "crc32c",
  });
};

const defaultInspectArtifact = async (
  target: StorageObjectTarget,
): Promise<StoredArtifactInspection | null> => {
  const file = storageBucketArchitectureService
    .getBucket("reports")
    .file(target.objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }
  const [[bytes], [metadata]] = await Promise.all([
    file.download(),
    file.getMetadata(),
  ]);
  return {
    contentType: metadata.contentType ?? null,
    metadata: Object.fromEntries(
      Object.entries(metadata.metadata ?? {}).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
  };
};

const defaultDependencies = (): GovernanceReportArtifactDependencies => ({
  firestore: getFirestore(),
  generateReport: governanceReportingService.generateReport.bind(
    governanceReportingService,
  ),
  generateSignedUrl: signedUrlService.generateReportAssetSignedUrl.bind(
    signedUrlService,
  ),
  inspectArtifact: defaultInspectArtifact,
  now: () => Timestamp.now(),
  readSnapshots: governanceSnapshotAccessService.readSnapshots.bind(
    governanceSnapshotAccessService,
  ),
  resolveStorageTarget: defaultResolveStorageTarget,
  uploadArtifact: defaultUploadArtifact,
});

/**
 * Persists immutable governance PDF artifacts and their replay authority.
 */
export class GovernanceReportArtifactService {
  private readonly dependencies: GovernanceReportArtifactDependencies;
  private readonly logger = createLogger("GovernanceReportArtifactService");

  /**
   * @param {GovernanceReportArtifactDependencies} dependencies Collaborators.
   */
  constructor(
    dependencies: GovernanceReportArtifactDependencies = defaultDependencies(),
  ) {
    this.dependencies = dependencies;
  }

  /**
   * Validates server-resolved report generation authority.
   * @param {Partial<GovernanceReportArtifactGenerateRequest>} input Input.
   * @return {GovernanceReportArtifactGenerateRequest} Validated request.
   */
  public normalizeGenerateRequest(
    input: Partial<GovernanceReportArtifactGenerateRequest>,
  ): GovernanceReportArtifactGenerateRequest {
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeActorRole(input.actorRole),
      idempotencyKey: requiredString(
        input.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: optionalString(input.ipAddress),
      snapshotId: normalizeSnapshotId(input.snapshotId),
      userAgent: optionalString(input.userAgent),
      yearId: normalizeYearId(input.yearId),
    };
  }

  /**
   * Validates server-resolved report download authority.
   * @param {Partial<GovernanceReportArtifactDownloadRequest>} input Input.
   * @return {GovernanceReportArtifactDownloadRequest} Validated request.
   */
  public normalizeDownloadRequest(
    input: Partial<GovernanceReportArtifactDownloadRequest>,
  ): GovernanceReportArtifactDownloadRequest {
    const reportId = requiredString(input.reportId, "reportId", 128);
    if (!new RegExp(`^${REPORT_ID_PREFIX}[a-f0-9]{40}$`, "u").test(reportId)) {
      throw new GovernanceReportArtifactValidationError(
        "VALIDATION_ERROR",
        "Field \"reportId\" is invalid.",
      );
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeActorRole(input.actorRole),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: optionalString(input.ipAddress),
      reportId,
      userAgent: optionalString(input.userAgent),
    };
  }

  /**
   * Validates a server-resolved report-list request.
   * @param {Partial<GovernanceReportArtifactListRequest>} input Input.
   * @return {NormalizedReportListRequest} Request.
   */
  public normalizeListRequest(
    input: Partial<GovernanceReportArtifactListRequest>,
  ): NormalizedReportListRequest {
    const limit = input.limit === undefined ?
      DEFAULT_LIST_LIMIT :
      Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new GovernanceReportArtifactValidationError(
        "VALIDATION_ERROR",
        `Field "limit" must be an integer from 1 to ${MAX_LIST_LIMIT}.`,
      );
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: normalizeActorRole(input.actorRole),
      cursor: optionalString(input.cursor),
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: optionalString(input.ipAddress),
      limit,
      userAgent: optionalString(input.userAgent),
      yearId: normalizeYearId(input.yearId),
    };
  }

  /**
   * Generates or replays one immutable governance report artifact.
   * @param {GovernanceReportArtifactGenerateRequest} rawRequest Request.
   * @return {Promise<AdminGovernanceReportGenerateResult>} Durable result.
   */
  public async generateReportArtifact(
    rawRequest: GovernanceReportArtifactGenerateRequest,
  ): Promise<AdminGovernanceReportGenerateResult> {
    const request = this.normalizeGenerateRequest(rawRequest);
    const authority = commandAuthority(request);
    const references = this.references(
      request.instituteId,
      request.yearId,
      authority,
    );
    const [existingReport, existingCommand, existingAudit] = await Promise.all([
      references.report.get(),
      references.command.get(),
      references.audit.get(),
    ]);
    const command = readCommand(existingCommand);
    if (command) {
      assertRequestFingerprint(command, authority.requestFingerprint);
    }
    if (existingReport.exists) {
      if (!command || command.status !== "complete" || !existingAudit.exists) {
        return internalError(
          "Governance report replay authority is incomplete.",
        );
      }
      const report = readReportRecord(existingReport);
      if (report.auditId !== authority.auditId) {
        return internalError("Governance report audit authority is invalid.");
      }
      await this.assertStoredArtifact(request.instituteId, report);
      return {disposition: "replayed", report};
    }
    if (existingAudit.exists || command?.status === "complete") {
      return internalError(
        "Governance report completion state is missing immutable metadata.",
      );
    }

    const [preview, snapshotResult] = await Promise.all([
      this.dependencies.generateReport({
        instituteId: request.instituteId,
        snapshotId: request.snapshotId,
        yearId: request.yearId,
      }),
      this.dependencies.readSnapshots({
        instituteId: request.instituteId,
        month: request.snapshotId.replace("_", "-"),
        yearId: request.yearId,
      }),
    ]);
    const snapshot = snapshotResult.snapshots[0];
    if (!snapshot || snapshot.documentId !== request.snapshotId) {
      throw new GovernanceReportArtifactValidationError(
        "NOT_FOUND",
        "Immutable governance snapshot was not found.",
      );
    }
    const snapshotAuthority = withoutInternalSnapshotPath(
      snapshot as unknown as Record<string, unknown>,
    );
    const snapshotSha256 = sha256(stableJson(snapshotAuthority));
    const sourceHash = sha256(stableJson({
      report: sourceReportForHash(preview),
      snapshot: snapshotAuthority,
    }));
    const createdAt = await this.reserveCommand(
      references,
      request,
      authority,
      sourceHash,
    );
    const finalizedPreview: GovernanceReportingResult = {
      ...preview,
      header: {...preview.header, reportPreparedAt: createdAt},
    };
    const pdfBytes = renderGovernanceReportPdf(finalizedPreview);
    const reportSha256 = sha256(pdfBytes);
    const fileName = `${authority.reportId}.pdf`;
    const report: AdminGovernanceReportRecord = {
      auditId: authority.auditId,
      contentType: CONTENT_TYPE,
      createdAt,
      fileName,
      immutable: true,
      month: preview.header.month,
      reportId: authority.reportId,
      sha256: reportSha256,
      sizeBytes: pdfBytes.length,
      source: buildSourceAuthority(preview, snapshotSha256),
      status: "ready",
      yearId: request.yearId,
    };
    const target = this.storageTarget(request.instituteId, report);
    await this.ensureStoredArtifact(target, pdfBytes, report, sourceHash);
    const disposition = await this.finalizeMetadata(
      references,
      request,
      authority,
      report,
      sourceHash,
    );

    this.logger.info("Governance report artifact completed.", {
      disposition,
      instituteId: request.instituteId,
      reportId: report.reportId,
      sizeBytes: report.sizeBytes,
      snapshotId: request.snapshotId,
      yearId: request.yearId,
    });
    return {disposition, report};
  }

  /**
   * Returns a short-lived public download contract for a ready report.
   * @param {GovernanceReportArtifactDownloadRequest} rawRequest Request.
   * @return {Promise<AdminGovernanceReportDownloadResult>} Public contract.
   */
  public async createDownload(
    rawRequest: GovernanceReportArtifactDownloadRequest,
  ): Promise<AdminGovernanceReportDownloadResult> {
    const request = this.normalizeDownloadRequest(rawRequest);
    const snapshot = await this.findReportSnapshot(
      request.instituteId,
      request.reportId,
    );
    if (!snapshot) {
      throw new GovernanceReportArtifactValidationError(
        "NOT_FOUND",
        "Governance report was not found.",
      );
    }
    const report = readReportRecord(snapshot);
    await this.assertStoredArtifact(request.instituteId, report);
    const month = this.reportMonth(report.month);
    const download = this.dependencies.generateSignedUrl({
      accessContext: "governanceReportDownload",
      extension: "pdf",
      instituteId: request.instituteId,
      month: month.month,
      reportId: report.reportId,
      reportKind: "governanceReport",
      year: month.year,
    });
    if (download.expiresInSeconds > 10 * 60) {
      return internalError("Governance report download expiry exceeds policy.");
    }
    return {
      contentType: CONTENT_TYPE,
      downloadUrl: download.signedUrl,
      expiresAt: download.expiresAt,
      fileName: report.fileName,
      reportId: report.reportId,
      sha256: report.sha256,
      sizeBytes: report.sizeBytes,
    };
  }

  /**
   * Returns a bounded newest-first list of immutable ready reports.
   * @param {GovernanceReportArtifactListRequest} rawRequest Request.
   * @return {Promise<AdminGovernanceReportListResult>} Report page.
   */
  public async listReports(
    rawRequest: GovernanceReportArtifactListRequest,
  ): Promise<AdminGovernanceReportListResult> {
    const request = this.normalizeListRequest(rawRequest);
    const fingerprint = listFingerprint(request.instituteId, request.yearId);
    const cursor = request.cursor ?
      decodeListCursor(request.cursor, fingerprint) :
      undefined;
    let query: FirebaseFirestore.Query = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${request.yearId}`,
    ).collection(REPORTS_COLLECTION)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      query = query.startAfter(cursor.createdAt, cursor.reportId);
    }
    const snapshot = await query.limit(request.limit + 1).get();
    const hasMore = snapshot.docs.length > request.limit;
    const selected = snapshot.docs.slice(0, request.limit);
    const reports = selected.map(readReportRecord);
    const last = reports[reports.length - 1];
    return {
      nextCursor: hasMore && last ? encodeListCursor({
        createdAt: last.createdAt,
        fingerprint,
        reportId: last.reportId,
        version: 1,
      }) : null,
      reports,
      yearId: request.yearId,
    };
  }

  private references(
    instituteId: string,
    yearId: string,
    authority: CommandAuthority,
  ) {
    const year = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}`,
    );
    return {
      audit: this.dependencies.firestore.doc(
        `${INSTITUTES_COLLECTION}/${instituteId}/` +
        `${AUDIT_LOGS_COLLECTION}/${authority.auditId}`,
      ),
      command: year.collection(REPORT_COMMANDS_COLLECTION)
        .doc(authority.reportId),
      report: year.collection(REPORTS_COLLECTION).doc(authority.reportId),
    };
  }

  private async findReportSnapshot(
    instituteId: string,
    reportId: string,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    const query = await this.dependencies.firestore
      .collectionGroup(REPORTS_COLLECTION)
      .where("reportId", "==", reportId)
      .limit(2)
      .get();
    const expectedPrefix =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/`;
    const matches = query.docs.filter((document) =>
      document.ref.path.startsWith(expectedPrefix) &&
      document.ref.path.endsWith(`/${REPORTS_COLLECTION}/${reportId}`),
    );
    if (matches.length > 1) {
      return internalError("Governance report ID is not unique in its tenant.");
    }
    return matches[0] ?? null;
  }

  private async reserveCommand(
    references: ReturnType<GovernanceReportArtifactService["references"]>,
    request: GovernanceReportArtifactGenerateRequest,
    authority: CommandAuthority,
    sourceHash: string,
  ): Promise<string> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [reportSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(references.report),
        transaction.get(references.command),
      ]);
      const command = readCommand(commandSnapshot);
      if (command) {
        assertRequestFingerprint(command, authority.requestFingerprint);
      }
      if (reportSnapshot.exists) {
        if (!command || command.status !== "complete") {
          return internalError(
            "Governance report command is incomplete for ready metadata.",
          );
        }
        const report = readReportRecord(reportSnapshot);
        return report.createdAt;
      }
      if (command) {
        if (command.status === "complete") {
          return internalError(
            "Completed governance report command is missing ready metadata.",
          );
        }
        if (command.sourceHash !== sourceHash) {
          throw new GovernanceReportArtifactValidationError(
            "CONFLICT",
            "Immutable report source changed after command reservation.",
          );
        }
        return command.createdAt;
      }
      const createdAt = this.dependencies.now().toDate().toISOString();
      transaction.create(references.command, {
        actorId: request.actorId,
        actorRole: request.actorRole,
        createdAt,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        reportId: authority.reportId,
        requestFingerprint: authority.requestFingerprint,
        snapshotId: request.snapshotId,
        sourceHash,
        status: "generating",
        yearId: request.yearId,
      });
      return createdAt;
    });
  }

  private async finalizeMetadata(
    references: ReturnType<GovernanceReportArtifactService["references"]>,
    request: GovernanceReportArtifactGenerateRequest,
    authority: CommandAuthority,
    report: AdminGovernanceReportRecord,
    sourceHash: string,
  ): Promise<"applied" | "replayed"> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [reportSnapshot, commandSnapshot, auditSnapshot] =
        await Promise.all([
          transaction.get(references.report),
          transaction.get(references.command),
          transaction.get(references.audit),
        ]);
      if (reportSnapshot.exists) {
        const command = readCommand(commandSnapshot);
        if (!command || command.status !== "complete" || !auditSnapshot.exists) {
          return internalError(
            "Governance report replay state is incomplete.",
          );
        }
        assertRequestFingerprint(command, authority.requestFingerprint);
        const stored = readReportRecord(reportSnapshot);
        if (stableJson(stored) !== stableJson(report)) {
          throw new GovernanceReportArtifactValidationError(
            "CONFLICT",
            "Immutable governance report metadata conflicts with replay.",
          );
        }
        return "replayed";
      }
      const command = readCommand(commandSnapshot);
      if (!command) {
        return internalError("Governance report command reservation is missing.");
      }
      assertRequestFingerprint(command, authority.requestFingerprint);
      if (command.sourceHash !== sourceHash) {
        throw new GovernanceReportArtifactValidationError(
          "CONFLICT",
          "Immutable report source does not match its reservation.",
        );
      }
      if (auditSnapshot.exists) {
        return internalError(
          "Governance report audit exists without immutable report metadata.",
        );
      }
      const completedAt = this.dependencies.now();
      transaction.create(references.report, report);
      transaction.create(references.audit, {
        actionType: "GENERATE_GOVERNANCE_REPORT",
        actorId: request.actorId,
        actorRole: request.actorRole,
        actorUid: request.actorId,
        after: report,
        auditId: authority.auditId,
        before: {},
        entityId: report.reportId,
        entityType: "governanceReport",
        instituteId: request.instituteId,
        ...(request.ipAddress ? {ipAddress: request.ipAddress} : {}),
        layer: "L3",
        metadata: {
          command: "generate-governance-report",
          idempotencyKeyHash: authority.idempotencyKeyHash,
          requestFingerprint: authority.requestFingerprint,
          report,
          source: "GovernanceReportArtifactService",
          sourceHash,
        },
        targetCollection: REPORTS_COLLECTION,
        targetId: report.reportId,
        tenantId: request.instituteId,
        timestamp: completedAt,
        ...(request.userAgent ? {userAgent: request.userAgent} : {}),
      });
      transaction.update(references.command, {
        auditId: authority.auditId,
        completedAt,
        status: "complete",
      });
      return "applied";
    });
  }

  private reportMonth(value: string): {month: number; year: number} {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(value);
    if (!match) {
      return internalError("Stored governance report month is invalid.");
    }
    return {month: Number(match[2]), year: Number(match[1])};
  }

  private storageTarget(
    instituteId: string,
    report: AdminGovernanceReportRecord,
  ): StorageObjectTarget {
    const month = this.reportMonth(report.month);
    return this.dependencies.resolveStorageTarget({
      instituteId,
      month: month.month,
      reportId: report.reportId,
      year: month.year,
    });
  }

  private async ensureStoredArtifact(
    target: StorageObjectTarget,
    bytes: Buffer,
    report: AdminGovernanceReportRecord,
    sourceHash: string,
  ): Promise<void> {
    let inspection = await this.dependencies.inspectArtifact(target);
    if (!inspection) {
      try {
        await this.dependencies.uploadArtifact(
          target,
          bytes,
          report.fileName,
          {
            immutable: "true",
            reportId: report.reportId,
            sha256: report.sha256,
            sizeBytes: String(report.sizeBytes),
            snapshotId: report.source.snapshotId,
            sourceHash,
          },
        );
      } catch (error) {
        inspection = await this.dependencies.inspectArtifact(target);
        if (!inspection) {
          throw error;
        }
      }
      inspection = inspection ?? await this.dependencies.inspectArtifact(target);
    }
    this.assertInspection(inspection, report);
  }

  private async assertStoredArtifact(
    instituteId: string,
    report: AdminGovernanceReportRecord,
  ): Promise<void> {
    const inspection = await this.dependencies.inspectArtifact(
      this.storageTarget(instituteId, report),
    );
    this.assertInspection(inspection, report);
  }

  private assertInspection(
    inspection: StoredArtifactInspection | null,
    report: AdminGovernanceReportRecord,
  ): void {
    if (!inspection) {
      return internalError("Governance report PDF object is missing.");
    }
    if (inspection.contentType !== CONTENT_TYPE ||
      inspection.sha256 !== report.sha256 ||
      inspection.sizeBytes !== report.sizeBytes ||
      inspection.metadata.immutable !== "true" ||
      inspection.metadata.reportId !== report.reportId ||
      inspection.metadata.sha256 !== report.sha256 ||
      inspection.metadata.sizeBytes !== String(report.sizeBytes) ||
      inspection.metadata.snapshotId !== report.source.snapshotId) {
      throw new GovernanceReportArtifactValidationError(
        "CONFLICT",
        "Governance report PDF object does not match immutable metadata.",
      );
    }
  }
}

export const governanceReportArtifactService =
  new GovernanceReportArtifactService();
