import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {
  ArchivePipelineService,
  buildArchiveDatasetId,
  buildSessionsTableId,
} from "../services/archivePipeline";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {
  governanceSnapshotAggregationService,
} from "../services/governanceSnapshotAggregation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {AcademicYearArchiveValidationError} from "../types/archivePipeline";
import {Timestamp} from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-101-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

/**
 * Stores inserted archive rows in memory for deterministic tests.
 */
class FakeBigQueryClient {
  public readonly insertedRows = new Map<string, unknown[]>();

  /**
   * No-op table setup for archive tests.
   * @return {Promise<void>} Resolves immediately.
   */
  public async ensureArchiveTables(): Promise<void> {
    return;
  }

  /**
   * Returns the current in-memory archive row count.
   * @param {object} input Archive identifiers.
   * @return {Promise<number>} Persisted row count.
   */
  public async getExistingRowCount(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<number> {
    const key =
      `${input.projectId}/${input.datasetId}/${input.sessionsTableId}`;

    return this.insertedRows.get(key)?.length ?? 0;
  }

  /**
   * Stores archive rows in memory keyed by dataset and table.
   * @param {object} input Archive rows and identifiers.
   * @return {Promise<void>} Resolves after storing rows.
   */
  public async insertSessionRows(
    input: {
      datasetId: string;
      projectId: string;
      rows: unknown[];
      sessionsTableId: string;
    },
  ): Promise<void> {
    const key =
      `${input.projectId}/${input.datasetId}/${input.sessionsTableId}`;

    this.insertedRows.set(key, input.rows);
  }
}

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();

  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "archiveAcademicYear locks, exports, snapshots, audits, and archives " +
    "the academic year idempotently",
  async () => {
    const instituteId = "inst_build_101";
    const yearId = "2026";
    const runId = "run_build_101";
    const studentId = "student_build_101";
    const sessionId = "session_build_101";
    const academicYearPath =
      `institutes/${instituteId}/academicYears/${yearId}`;
    const runPath = `${academicYearPath}/runs/${runId}`;
    const sessionPath = `${runPath}/sessions/${sessionId}`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const runAnalyticsPath = `${academicYearPath}/runAnalytics`;
    const studentMetricsPath = `${academicYearPath}/studentYearMetrics`;
    const governanceSnapshotsPath = `${academicYearPath}/governanceSnapshots`;
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;
    const fakeBigQueryClient = new FakeBigQueryClient();
    const service = new ArchivePipelineService({
      bigQueryClient: fakeBigQueryClient,
      createArchiveAuditLog:
        administrativeActionLoggingService.logAcademicYearArchive.bind(
          administrativeActionLoggingService,
        ),
      firestore,
      generateGovernanceSnapshot:
        governanceSnapshotAggregationService.generateSnapshotForAcademicYear
          .bind(governanceSnapshotAggregationService),
      now: () => new Date("2026-04-07T00:00:00.000Z"),
      projectIdResolver: () => "parabolic-platform-build-101-tests",
    });

    await Promise.all([
      deleteCollectionDocuments(runAnalyticsPath),
      deleteCollectionDocuments(studentMetricsPath),
      deleteCollectionDocuments(governanceSnapshotsPath),
      deleteCollectionDocuments(auditLogsPath),
    ]);
    await Promise.all([
      deleteDocumentIfPresent(sessionPath),
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({
      instituteId,
      name: "Archive Test Institute",
    });
    await firestore.doc(academicYearPath).set({
      snapshotGenerated: false,
      startDate: Timestamp.fromDate(new Date("2025-06-01T00:00:00.000Z")),
      status: "active",
    });
    await firestore.doc(studentPath).set({
      batchId: "batch-a",
      studentId,
    });
    await firestore.doc(runPath).set({
      calibrationVersion: "cal_v2026_01",
      mode: "Controlled",
      riskModelVersion: "risk_v3",
      status: "completed",
      templateVersion: "5",
      testId: "test_build_101",
    });
    await firestore.doc(sessionPath).set({
      accuracyPercent: 75,
      calibrationVersion: "cal_v2026_01",
      consecutiveWrongStreakMax: 1,
      createdAt: Timestamp.fromDate(new Date("2026-03-02T09:00:00.000Z")),
      disciplineIndex: 82,
      easyNeglectActive: false,
      easyRemainingAfterPhase1Percent: 10,
      guessRate: 12.5,
      hardBiasActive: false,
      hardInPhase1Percent: 15,
      instituteId,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 5,
      mode: "Controlled",
      phaseAdherencePercent: 95,
      rawScorePercent: 74,
      riskState: "Stable",
      runId,
      rushPatternActive: false,
      sessionId,
      skipBurstActive: false,
      skipBurstCount: 0,
      startedAt: Timestamp.fromDate(new Date("2026-03-02T09:05:00.000Z")),
      status: "submitted",
      studentId,
      submittedAt: Timestamp.fromDate(new Date("2026-03-02T10:05:00.000Z")),
      templateVersion: "5",
      wrongStreakActive: false,
      yearId,
    });
    await Promise.all([
      firestore.doc(`${runAnalyticsPath}/${runId}`).set({
        avgAccuracyPercent: 75,
        avgRawScorePercent: 74,
        overrideCount: 0,
        processingMarkers: {
          runAnalyticsEngine: {
            submittedSessionCount: 1,
          },
        },
        stdDeviation: 8,
      }),
      firestore.doc(`${studentMetricsPath}/${studentId}`).set({
        avgPhaseAdherence: 95,
        disciplineIndex: 82,
        disciplineIndexTrend: 3,
        easyNeglectActive: false,
        hardBiasActive: false,
        riskState: "Stable",
        rushPatternActive: false,
        skipBurstActive: false,
        wrongStreakActive: false,
      }),
    ]);

    const result = await service.archiveAcademicYear({
      actorId: "vendor_build_101",
      actorRole: "vendor",
      doubleConfirm: true,
      instituteId,
      isVendor: true,
      yearId,
    });

    const academicYearSnapshot = await firestore.doc(academicYearPath).get();
    const archiveSnapshot = await firestore
      .doc(`${governanceSnapshotsPath}/${yearId}`)
      .get();
    const auditLogSnapshots = await firestore.collection(auditLogsPath)
      .where("actionType", "==", "ARCHIVE_ACADEMIC_YEAR")
      .get();
    const insertedRows = fakeBigQueryClient.insertedRows.get(
      "parabolic-platform-build-101-tests/" +
      `${buildArchiveDatasetId(instituteId)}/` +
      `${buildSessionsTableId(yearId)}`,
    );

    assert.equal(result.archived, true);
    assert.equal(result.idempotent, false);
    assert.equal(result.bigQuery.rowsExported, 1);
    assert.equal(result.bigQuery.skipped, false);
    assert.equal(result.bigQuery.datasetId, buildArchiveDatasetId(instituteId));
    assert.equal(result.bigQuery.sessionsTableId, buildSessionsTableId(yearId));
    assert.equal(academicYearSnapshot.get("status"), "archived");
    assert.equal(academicYearSnapshot.get("snapshotGenerated"), true);
    assert.equal(academicYearSnapshot.get("snapshotId"), yearId);
    assert.ok(academicYearSnapshot.get("archivedAt"));
    assert.equal(archiveSnapshot.exists, true);
    assert.equal(archiveSnapshot.get("academicYear"), yearId);
    assert.equal(archiveSnapshot.get("calibrationVersionUsed"), "cal_v2026_01");
    assert.equal(archiveSnapshot.get("riskModelVersionUsed"), "risk_v3");
    assert.equal(archiveSnapshot.get("templateVersionRangeUsed"), "5");
    assert.equal(auditLogSnapshots.size, 1);
    assert.equal(auditLogSnapshots.docs[0]?.get("actorId"), "vendor_build_101");
    assert.equal(insertedRows?.length, 1);

    const secondResult = await service.archiveAcademicYear({
      actorId: "vendor_build_101",
      actorRole: "vendor",
      doubleConfirm: true,
      instituteId,
      isVendor: true,
      yearId,
    });

    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.bigQuery.skipped, true);

    await Promise.all([
      deleteCollectionDocuments(runAnalyticsPath),
      deleteCollectionDocuments(studentMetricsPath),
      deleteCollectionDocuments(governanceSnapshotsPath),
      deleteCollectionDocuments(auditLogsPath),
    ]);
    await Promise.all([
      deleteDocumentIfPresent(sessionPath),
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);

test(
  "archiveAcademicYear rejects archive requests when non-terminal runs exist",
  async () => {
    const instituteId = "inst_build_101_blocked";
    const yearId = "2027";
    const academicYearPath =
      `institutes/${instituteId}/academicYears/${yearId}`;
    const runPath = `${academicYearPath}/runs/run_build_101_blocked`;
    const fakeBigQueryClient = new FakeBigQueryClient();
    const service = new ArchivePipelineService({
      bigQueryClient: fakeBigQueryClient,
      createArchiveAuditLog:
        administrativeActionLoggingService.logAcademicYearArchive.bind(
          administrativeActionLoggingService,
        ),
      firestore,
      generateGovernanceSnapshot:
        governanceSnapshotAggregationService.generateSnapshotForAcademicYear
          .bind(governanceSnapshotAggregationService),
      now: () => new Date("2026-04-07T00:00:00.000Z"),
      projectIdResolver: () => "parabolic-platform-build-101-tests",
    });

    await Promise.all([
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(academicYearPath).set({status: "active"});
    await firestore.doc(runPath).set({status: "active"});

    await assert.rejects(
      async () => {
        await service.archiveAcademicYear({
          actorId: "admin_build_101",
          actorRole: "admin",
          doubleConfirm: true,
          instituteId,
          isVendor: false,
          yearId,
        });
      },
      (error: unknown) =>
        error instanceof AcademicYearArchiveValidationError &&
        error.code === "VALIDATION_ERROR" &&
        error.message.includes("all runs to be completed"),
    );

    await Promise.all([
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);
