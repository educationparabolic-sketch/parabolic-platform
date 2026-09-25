import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {
  ArchivePipelineService,
  buildArchiveDatasetId,
  buildSessionsTableId,
} from "../services/archivePipeline";
import {
  governanceSnapshotAggregationService,
} from "../services/governanceSnapshotAggregation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {AcademicYearArchiveValidationError} from "../types/archivePipeline";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-101-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const FIXED_DATE = new Date("2026-09-25T08:00:00.000Z");

class FakeBigQueryClient {
  public failAfterInsertOnce = false;
  public insertCalls = 0;
  public readonly insertedRows = new Map<string, unknown[]>();

  public async ensureArchiveTables(): Promise<void> {
    return;
  }

  public async getExistingRowCount(
    input: {datasetId: string; projectId: string; sessionsTableId: string},
  ): Promise<number> {
    return this.insertedRows.get(this.key(input))?.length ?? 0;
  }

  public async insertSessionRows(input: {
    datasetId: string;
    projectId: string;
    rows: unknown[];
    sessionsTableId: string;
  }): Promise<void> {
    this.insertCalls += 1;
    this.insertedRows.set(this.key(input), input.rows);
    if (this.failAfterInsertOnce) {
      this.failAfterInsertOnce = false;
      throw new Error("injected post-export interruption");
    }
  }

  private key(input: {
    datasetId: string;
    projectId: string;
    sessionsTableId: string;
  }): string {
    return `${input.projectId}/${input.datasetId}/${input.sessionsTableId}`;
  }
}

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanup = async (instituteId: string, yearId: string): Promise<void> => {
  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/${yearId}`;
  const runs = await firestore.collection(`${yearPath}/runs`).get();
  await Promise.all(runs.docs.map(async (run) => {
    await deleteCollectionDocuments(`${run.ref.path}/sessions`);
    await run.ref.delete();
  }));
  await Promise.all([
    deleteCollectionDocuments(`${yearPath}/runAnalytics`),
    deleteCollectionDocuments(`${yearPath}/studentYearMetrics`),
    deleteCollectionDocuments(`${yearPath}/governanceSnapshots`),
    deleteCollectionDocuments(`${institutePath}/settingsCommands`),
    deleteCollectionDocuments(`${institutePath}/settingsAudit`),
    deleteCollectionDocuments(`${institutePath}/auditLogs`),
    deleteCollectionDocuments(`${institutePath}/students`),
  ]);
  const year = firestore.doc(yearPath);
  if ((await year.get()).exists) await year.delete();
  const institute = firestore.doc(institutePath);
  if ((await institute.get()).exists) await institute.delete();
};

const seedLockedArchive = async (
  instituteId: string,
  yearId: string,
): Promise<void> => {
  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/${yearId}`;
  const runId = "run_archive";
  const studentId = "student_archive";
  await firestore.doc(institutePath).set({settingsRevision: 1});
  await firestore.doc(yearPath).set({
    academicYearLabel: "2025-26",
    status: "Locked",
  });
  await firestore.doc(`${institutePath}/students/${studentId}`).set({batchId: "batch-a"});
  await firestore.doc(`${yearPath}/runs/${runId}`).set({
    calibrationVersion: "cal-v1",
    riskModelVersion: "risk-v1",
    status: "completed",
    templateVersion: "3",
  });
  await firestore.doc(`${yearPath}/runs/${runId}/sessions/session_archive`).set({
    accuracyPercent: 80,
    createdAt: Timestamp.fromDate(new Date("2026-03-01T08:00:00.000Z")),
    instituteId,
    runId,
    sessionId: "session_archive",
    startedAt: Timestamp.fromDate(new Date("2026-03-01T08:05:00.000Z")),
    status: "submitted",
    studentId,
    submittedAt: Timestamp.fromDate(new Date("2026-03-01T09:05:00.000Z")),
    yearId,
  });
  await firestore.doc(`${yearPath}/runAnalytics/${runId}`).set({
    avgAccuracyPercent: 80,
    avgRawScorePercent: 75,
    processingMarkers: {runAnalyticsEngine: {submittedSessionCount: 1}},
  });
  await firestore.doc(`${yearPath}/studentYearMetrics/${studentId}`).set({
    avgPhaseAdherence: 90,
    disciplineIndex: 85,
    riskState: "Stable",
  });
};

const createService = (bigQueryClient: FakeBigQueryClient) =>
  new ArchivePipelineService({
    bigQueryClient,
    firestore,
    generateGovernanceSnapshot:
      governanceSnapshotAggregationService.generateSnapshotForAcademicYear
        .bind(governanceSnapshotAggregationService),
    now: () => FIXED_DATE,
    projectIdResolver: () => "parabolic-platform-build-101-tests",
  });

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("archive command checkpoints export, snapshot, final audit, and exact replay", async () => {
  const instituteId = "inst_archive_checkpoint";
  const yearId = "2026";
  const commandId = "60c9dd65-cf43-4ec9-bb20-ab07d86593ca";
  await cleanup(instituteId, yearId);
  await seedLockedArchive(instituteId, yearId);
  const bigQuery = new FakeBigQueryClient();
  const service = createService(bigQuery);
  const request = {
    academicYearId: yearId,
    actorId: "admin_archive",
    actorRole: "admin",
    commandId,
    confirmIrreversibleArchive: true as const,
    expectedRevision: 1,
    instituteId,
    isVendor: false,
  };

  const applied = await service.archiveAcademicYear(request);
  const replay = await service.archiveAcademicYear(request);
  assert.equal(applied.stage, "archived");
  assert.equal(applied.replayed, false);
  assert.equal(applied.revision, 2);
  assert.equal(replay.replayed, true);
  assert.equal(replay.completedAt, applied.completedAt);
  assert.equal(replay.auditEventId, applied.auditEventId);
  assert.equal(bigQuery.insertCalls, 1);

  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/${yearId}`;
  const year = await firestore.doc(yearPath).get();
  assert.equal(year.get("status"), "archived");
  assert.equal(year.get("archiveOperation.stage"), "archived");
  assert.equal(year.get("snapshotId"), yearId);
  assert.equal((await firestore.doc(`${yearPath}/governanceSnapshots/${yearId}`).get()).exists, true);
  assert.equal((await firestore.collection(`${institutePath}/settingsCommands`).get()).size, 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 1);
  assert.equal((await firestore.collection(`${institutePath}/auditLogs`).get()).size, 1);
  assert.equal((await firestore.doc(institutePath).get()).get("settingsRevision"), 2);
  assert.equal(
    bigQuery.insertedRows.get(
      `parabolic-platform-build-101-tests/${buildArchiveDatasetId(instituteId)}/${buildSessionsTableId(yearId)}`,
    )?.length,
    1,
  );
  await cleanup(instituteId, yearId);
});

test("archive retry resumes after export without inserting duplicate rows", async () => {
  const instituteId = "inst_archive_recovery";
  const yearId = "2026";
  const commandId = "6648cc73-0486-445b-b066-5aa9dfe05b4a";
  await cleanup(instituteId, yearId);
  await seedLockedArchive(instituteId, yearId);
  const bigQuery = new FakeBigQueryClient();
  bigQuery.failAfterInsertOnce = true;
  const service = createService(bigQuery);
  const request = {
    academicYearId: yearId,
    actorId: "admin_archive",
    actorRole: "admin",
    commandId,
    confirmIrreversibleArchive: true as const,
    expectedRevision: 1,
    instituteId,
    isVendor: false,
  };

  await assert.rejects(
    service.archiveAcademicYear(request),
    (error: unknown) => error instanceof AcademicYearArchiveValidationError &&
      error.code === "INTERNAL_ERROR" && error.message.includes("can be retried"),
  );
  const commandAfterFailure = (await firestore.collection(
    `institutes/${instituteId}/settingsCommands`,
  ).get()).docs[0];
  assert.equal(commandAfterFailure?.get("state"), "failed");
  assert.equal(commandAfterFailure?.get("checkpointStage"), "locked");
  const yearAfterFailure = await firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}`,
  ).get();
  assert.equal(yearAfterFailure.get("status"), "Locked");

  const recovered = await service.archiveAcademicYear(request);
  assert.equal(recovered.stage, "archived");
  assert.equal(bigQuery.insertCalls, 1);
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsAudit`).get()).size, 1);
  await cleanup(instituteId, yearId);
});

test("archive command rejects unlocked authority without creating a command", async () => {
  const instituteId = "inst_archive_guard";
  const yearId = "2026";
  await cleanup(instituteId, yearId);
  await firestore.doc(`institutes/${instituteId}`).set({settingsRevision: 0});
  await firestore.doc(`institutes/${instituteId}/academicYears/${yearId}`).set({status: "Active"});
  const service = createService(new FakeBigQueryClient());
  await assert.rejects(
    service.archiveAcademicYear({
      academicYearId: yearId,
      actorId: "admin_archive",
      actorRole: "admin",
      commandId: "251ac02f-2c49-4348-9aa7-3545af3fa360",
      confirmIrreversibleArchive: true,
      expectedRevision: 0,
      instituteId,
      isVendor: false,
    }),
    (error: unknown) => error instanceof AcademicYearArchiveValidationError &&
      error.code === "CONFLICT" && error.message.includes("locked"),
  );
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsCommands`).get()).size, 0);
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsAudit`).get()).size, 0);
  await cleanup(instituteId, yearId);
});

test("concurrent archive commands reserve and finalize exactly one authority", async () => {
  const instituteId = "inst_archive_race";
  const yearId = "2026";
  await cleanup(instituteId, yearId);
  await seedLockedArchive(instituteId, yearId);
  const bigQuery = new FakeBigQueryClient();
  const service = createService(bigQuery);
  const base = {
    academicYearId: yearId,
    actorId: "admin_archive",
    actorRole: "admin",
    confirmIrreversibleArchive: true as const,
    expectedRevision: 1,
    instituteId,
    isVendor: false,
  };
  const results = await Promise.allSettled([
    service.archiveAcademicYear({
      ...base,
      commandId: "e47e1016-f184-4c9a-8a03-cd5ec0687bcb",
    }),
    service.archiveAcademicYear({
      ...base,
      commandId: "84d52acd-3741-419a-9795-ee2a21adfbc3",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof AcademicYearArchiveValidationError);
  assert.equal(rejected.reason.code, "CONFLICT");
  assert.equal(bigQuery.insertCalls, 1);
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get()).get("settingsRevision"), 2);
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsCommands`).get()).size, 1);
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsAudit`).get()).size, 1);
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 1);
  await cleanup(instituteId, yearId);
});
