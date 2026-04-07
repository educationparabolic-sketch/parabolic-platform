import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AuditLogRetentionSummary,
  BillingRecordRetentionSummary,
  CalibrationHistoryRetentionSummary,
  DataRetentionExecutionResult,
  DataRetentionPolicyConfig,
  EmailQueueRetentionSummary,
  SessionRetentionSummary,
} from "../types/dataRetention";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const BILLING_RECORDS_COLLECTION = "billingRecords";
const CALIBRATION_HISTORY_COLLECTION = "calibrationHistory";
const EMAIL_QUEUE_COLLECTION = "emailQueue";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const VENDOR_AUDIT_LOGS_COLLECTION = "vendorAuditLogs";
const VENDOR_CALIBRATION_LOGS_COLLECTION = "vendorCalibrationLogs";

const FINAL_EMAIL_STATUSES = new Set([
  "cancelled",
  "failed",
  "sent",
]);

const DEFAULT_RETENTION_CONFIG: DataRetentionPolicyConfig = {
  auditLogRetentionDays: 365 * 7,
  billingRecordRetentionDays: 365 * 7,
  emailLogRetentionDays: 365,
  maxDocumentsPerRun: 200,
  sessionArchiveGraceDays: 30,
  sessionArchiveRetentionDays: 365 * 5,
};

interface DataRetentionPolicyDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  resolveConfig: () => DataRetentionPolicyConfig;
}

const parsePositiveIntegerEnv = (
  key: string,
  defaultValue: number,
): number => {
  const rawValue = process.env[key]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(
      `Environment variable "${key}" must be a non-negative integer.`,
    );
  }

  return parsedValue;
};

export const loadDataRetentionPolicyConfig = (): DataRetentionPolicyConfig => ({
  auditLogRetentionDays: parsePositiveIntegerEnv(
    "RETENTION_AUDIT_LOG_DAYS",
    DEFAULT_RETENTION_CONFIG.auditLogRetentionDays,
  ),
  billingRecordRetentionDays: parsePositiveIntegerEnv(
    "RETENTION_BILLING_RECORD_DAYS",
    DEFAULT_RETENTION_CONFIG.billingRecordRetentionDays,
  ),
  emailLogRetentionDays: parsePositiveIntegerEnv(
    "RETENTION_EMAIL_LOG_DAYS",
    DEFAULT_RETENTION_CONFIG.emailLogRetentionDays,
  ),
  maxDocumentsPerRun: parsePositiveIntegerEnv(
    "RETENTION_MAX_DOCUMENTS_PER_RUN",
    DEFAULT_RETENTION_CONFIG.maxDocumentsPerRun,
  ),
  sessionArchiveGraceDays: parsePositiveIntegerEnv(
    "RETENTION_SESSION_ARCHIVE_GRACE_DAYS",
    DEFAULT_RETENTION_CONFIG.sessionArchiveGraceDays,
  ),
  sessionArchiveRetentionDays: parsePositiveIntegerEnv(
    "RETENTION_SESSION_ARCHIVE_DAYS",
    DEFAULT_RETENTION_CONFIG.sessionArchiveRetentionDays,
  ),
});

const subtractDays = (date: Date, days: number): Date =>
  new Date(date.getTime() - (days * 24 * 60 * 60 * 1000));

const normalizeStatus = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const toTimestamp = (
  value: unknown,
): FirebaseFirestore.Timestamp | null =>
  value instanceof Timestamp ? value : null;

const isTimestampOnOrBefore = (
  value: unknown,
  cutoff: Date,
): boolean => {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return false;
  }

  return timestamp.toDate().getTime() <= cutoff.getTime();
};

const createSessionSummary = (): SessionRetentionSummary => ({
  academicYearsAlreadyClean: 0,
  archivedAcademicYearsReviewed: 0,
  sessionDocumentsDeleted: 0,
  summaryDocumentsRetained: 0,
});

const createEmailSummary = (): EmailQueueRetentionSummary => ({
  documentsDeleted: 0,
  documentsReviewed: 0,
  documentsRetained: 0,
});

const createBillingSummary = (): BillingRecordRetentionSummary => ({
  documentsDeleted: 0,
  documentsReviewed: 0,
  documentsRetained: 0,
});

const createAuditSummary = (): AuditLogRetentionSummary => ({
  documentsReviewed: 0,
  protectedDocumentsRetained: 0,
  vendorDocumentsReviewed: 0,
  vendorProtectedDocumentsRetained: 0,
});

const createCalibrationSummary = (): CalibrationHistoryRetentionSummary => ({
  documentsReviewed: 0,
  permanentDocumentsRetained: 0,
  vendorDocumentsReviewed: 0,
  vendorPermanentDocumentsRetained: 0,
});

const deleteDocumentReferences = async (
  firestore: FirebaseFirestore.Firestore,
  references: FirebaseFirestore.DocumentReference[],
): Promise<number> => {
  if (references.length === 0) {
    return 0;
  }

  let deletedCount = 0;

  for (let index = 0; index < references.length; index += 400) {
    const batch = firestore.batch();
    const chunk = references.slice(index, index + 400);

    chunk.forEach((reference) => {
      batch.delete(reference);
    });

    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
};

/**
 * Applies the documented retention policy to operational and historical
 * datasets without mutating immutable compliance records.
 */
export class DataRetentionPolicyService {
  private readonly dependencies: DataRetentionPolicyDependencies;

  private readonly logger = createLogger("DataRetentionPolicyService");

  /**
   * @param {Partial<DataRetentionPolicyDependencies>} dependencies Service
   * dependencies for deterministic tests.
   */
  constructor(
    dependencies: Partial<DataRetentionPolicyDependencies> = {},
  ) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      now: dependencies.now ?? (() => new Date()),
      resolveConfig:
        dependencies.resolveConfig ?? loadDataRetentionPolicyConfig,
    };
  }

  /**
   * Executes one retention-policy pass across configured datasets.
   * @return {Promise<DataRetentionExecutionResult>} Retention execution
   * summary.
   */
  public async executePolicy(): Promise<DataRetentionExecutionResult> {
    const now = this.dependencies.now();
    const config = this.dependencies.resolveConfig();

    const result: DataRetentionExecutionResult = {
      auditLogs: createAuditSummary(),
      billingRecords: createBillingSummary(),
      calibrationHistory: createCalibrationSummary(),
      completedAt: now.toISOString(),
      config,
      emailQueue: createEmailSummary(),
      notes: [
        "Audit logs remain immutable and are preserved for compliance.",
        "Calibration history remains permanent and is never deleted.",
        "Archived academic-year summaries remain in Firestore while raw " +
          "session documents are drained after the configurable grace window.",
        "Billing record retention defaults to seven years as a configurable " +
          "compliance window because Section 37.8 does not specify a fixed " +
          "invoice lifetime.",
      ],
      sessions: createSessionSummary(),
    };

    await this.applySessionRetention(now, config, result.sessions);
    await this.applyEmailQueueRetention(now, config, result.emailQueue);
    await this.applyBillingRecordRetention(now, config, result.billingRecords);
    await this.reviewAuditLogRetention(now, config, result.auditLogs);
    await this.reviewCalibrationHistoryRetention(
      now,
      result.calibrationHistory,
    );

    this.logger.info(
      "Completed retention policy execution.",
      result as unknown as Record<string, unknown>,
    );

    return result;
  }

  /**
   * Deletes Firestore session documents for archived academic years after the
   * configurable grace window, preserving summary collections for reporting.
   * @param {Date} now Execution timestamp.
   * @param {DataRetentionPolicyConfig} config Active retention policy config.
   * @param {SessionRetentionSummary} summary Mutable summary accumulator.
   * @return {Promise<void>} Resolves once session cleanup is complete.
   */
  private async applySessionRetention(
    now: Date,
    config: DataRetentionPolicyConfig,
    summary: SessionRetentionSummary,
  ): Promise<void> {
    const cutoff = subtractDays(now, config.sessionArchiveGraceDays);
    const archivedYearsSnapshot = await this.dependencies.firestore
      .collectionGroup(ACADEMIC_YEARS_COLLECTION)
      .where("archivedAt", "<=", Timestamp.fromDate(cutoff))
      .limit(config.maxDocumentsPerRun)
      .get();

    for (const academicYearDocument of archivedYearsSnapshot.docs) {
      const academicYearData = academicYearDocument.data();

      summary.archivedAcademicYearsReviewed += 1;
      summary.summaryDocumentsRetained += 1;

      if (
        normalizeStatus(academicYearData.status) !== "archived" ||
        academicYearData.snapshotGenerated !== true
      ) {
        continue;
      }

      const sessionReferencesToDelete: FirebaseFirestore.DocumentReference[] =
        [];
      const runsSnapshot = await academicYearDocument.ref
        .collection(RUNS_COLLECTION)
        .get();

      for (const runDocument of runsSnapshot.docs) {
        const remainingCapacity =
          config.maxDocumentsPerRun - sessionReferencesToDelete.length;

        if (remainingCapacity <= 0) {
          break;
        }

        const sessionsSnapshot = await runDocument.ref
          .collection(SESSIONS_COLLECTION)
          .limit(remainingCapacity)
          .get();

        sessionsSnapshot.docs.forEach((sessionDocument) => {
          sessionReferencesToDelete.push(sessionDocument.ref);
        });
      }

      if (sessionReferencesToDelete.length === 0) {
        summary.academicYearsAlreadyClean += 1;
        continue;
      }

      summary.sessionDocumentsDeleted += await deleteDocumentReferences(
        this.dependencies.firestore,
        sessionReferencesToDelete,
      );

      if (summary.sessionDocumentsDeleted >= config.maxDocumentsPerRun) {
        break;
      }
    }
  }

  /**
   * Deletes terminal email queue jobs that have exceeded the configured
   * retention window.
   * @param {Date} now Execution timestamp.
   * @param {DataRetentionPolicyConfig} config Active retention policy config.
   * @param {EmailQueueRetentionSummary} summary Mutable summary accumulator.
   * @return {Promise<void>} Resolves once email retention processing is
   * complete.
   */
  private async applyEmailQueueRetention(
    now: Date,
    config: DataRetentionPolicyConfig,
    summary: EmailQueueRetentionSummary,
  ): Promise<void> {
    const cutoff = subtractDays(now, config.emailLogRetentionDays);
    const emailSnapshot = await this.dependencies.firestore
      .collection(EMAIL_QUEUE_COLLECTION)
      .where("createdAt", "<=", Timestamp.fromDate(cutoff))
      .limit(config.maxDocumentsPerRun)
      .get();
    const referencesToDelete: FirebaseFirestore.DocumentReference[] = [];

    emailSnapshot.docs.forEach((document) => {
      const data = document.data();
      const status = normalizeStatus(data.status);
      const terminalTimestamp = toTimestamp(data.sentAt) ?? toTimestamp(
        data.createdAt,
      );

      summary.documentsReviewed += 1;

      if (
        FINAL_EMAIL_STATUSES.has(status) &&
        terminalTimestamp !== null &&
        terminalTimestamp.toDate().getTime() <= cutoff.getTime()
      ) {
        referencesToDelete.push(document.ref);
        return;
      }

      summary.documentsRetained += 1;
    });

    summary.documentsDeleted += await deleteDocumentReferences(
      this.dependencies.firestore,
      referencesToDelete,
    );
  }

  /**
   * Deletes old billing records that exceed the configured retention window.
   * @param {Date} now Execution timestamp.
   * @param {DataRetentionPolicyConfig} config Active retention policy config.
   * @param {BillingRecordRetentionSummary} summary Mutable summary accumulator.
   * @return {Promise<void>} Resolves once billing cleanup is complete.
   */
  private async applyBillingRecordRetention(
    now: Date,
    config: DataRetentionPolicyConfig,
    summary: BillingRecordRetentionSummary,
  ): Promise<void> {
    const cutoff = subtractDays(now, config.billingRecordRetentionDays);
    const billingSnapshot = await this.dependencies.firestore
      .collectionGroup(BILLING_RECORDS_COLLECTION)
      .where("createdAt", "<=", Timestamp.fromDate(cutoff))
      .limit(config.maxDocumentsPerRun)
      .get();
    const referencesToDelete: FirebaseFirestore.DocumentReference[] = [];

    billingSnapshot.docs.forEach((document) => {
      summary.documentsReviewed += 1;

      if (isTimestampOnOrBefore(document.data().createdAt, cutoff)) {
        referencesToDelete.push(document.ref);
        return;
      }

      summary.documentsRetained += 1;
    });

    summary.documentsDeleted += await deleteDocumentReferences(
      this.dependencies.firestore,
      referencesToDelete,
    );
  }

  /**
   * Reviews audit logs against the configured retention window but preserves
   * them because audit data remains immutable compliance evidence.
   * @param {Date} now Execution timestamp.
   * @param {DataRetentionPolicyConfig} config Active retention policy config.
   * @param {AuditLogRetentionSummary} summary Mutable summary accumulator.
   * @return {Promise<void>} Resolves once audit review is complete.
   */
  private async reviewAuditLogRetention(
    now: Date,
    config: DataRetentionPolicyConfig,
    summary: AuditLogRetentionSummary,
  ): Promise<void> {
    const cutoff = subtractDays(now, config.auditLogRetentionDays);
    const [auditLogsSnapshot, vendorAuditLogsSnapshot] = await Promise.all([
      this.dependencies.firestore
        .collectionGroup(AUDIT_LOGS_COLLECTION)
        .where("timestamp", "<=", Timestamp.fromDate(cutoff))
        .limit(config.maxDocumentsPerRun)
        .get(),
      this.dependencies.firestore
        .collection(VENDOR_AUDIT_LOGS_COLLECTION)
        .where("timestamp", "<=", Timestamp.fromDate(cutoff))
        .limit(config.maxDocumentsPerRun)
        .get(),
    ]);

    summary.documentsReviewed += auditLogsSnapshot.size;
    summary.protectedDocumentsRetained += auditLogsSnapshot.size;
    summary.vendorDocumentsReviewed += vendorAuditLogsSnapshot.size;
    summary.vendorProtectedDocumentsRetained += vendorAuditLogsSnapshot.size;
  }

  /**
   * Reviews permanent calibration history datasets and preserves them.
   * @param {Date} now Execution timestamp.
   * @param {CalibrationHistoryRetentionSummary} summary Mutable summary
   * accumulator.
   * @return {Promise<void>} Resolves once calibration-history review is
   * complete.
   */
  private async reviewCalibrationHistoryRetention(
    now: Date,
    summary: CalibrationHistoryRetentionSummary,
  ): Promise<void> {
    const cutoff = Timestamp.fromDate(now);
    const [historySnapshot, vendorHistorySnapshot] = await Promise.all([
      this.dependencies.firestore
        .collectionGroup(CALIBRATION_HISTORY_COLLECTION)
        .where("timestamp", "<=", cutoff)
        .limit(DEFAULT_RETENTION_CONFIG.maxDocumentsPerRun)
        .get(),
      this.dependencies.firestore
        .collection(VENDOR_CALIBRATION_LOGS_COLLECTION)
        .where("timestamp", "<=", cutoff)
        .limit(DEFAULT_RETENTION_CONFIG.maxDocumentsPerRun)
        .get(),
    ]);

    summary.documentsReviewed += historySnapshot.size;
    summary.permanentDocumentsRetained += historySnapshot.size;
    summary.vendorDocumentsReviewed += vendorHistorySnapshot.size;
    summary.vendorPermanentDocumentsRetained += vendorHistorySnapshot.size;
  }
}

export const dataRetentionPolicyService = new DataRetentionPolicyService();
