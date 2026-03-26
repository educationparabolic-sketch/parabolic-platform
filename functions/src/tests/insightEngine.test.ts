import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {InsightEngineResult} from "../types/insightEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-46-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface InsightEngineServiceContract {
  processSubmittedSession: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
  ) => Promise<InsightEngineResult>;
}

let insightEngineService: InsightEngineServiceContract;

test.before(async () => {
  const module = await import("../services/insightEngine.js");
  insightEngineService = module.insightEngineService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

test(
  "processSubmittedSession creates student, run, and batch insight snapshots",
  async () => {
    const instituteId = "inst_build_46_success";
    const yearId = "2026";
    const runId = "run_build_46_success";
    const sessionId = "session_build_46_success";
    const studentId = "student_build_46_success";
    const insightsCollectionPath =
      `institutes/${instituteId}/academicYears/${yearId}/insightSnapshots`;
    const studentSnapshotPath =
      `${insightsCollectionPath}/student_${studentId}_${sessionId}`;
    const runSnapshotPath =
      `${insightsCollectionPath}/run_${runId}_${sessionId}`;
    const batchSnapshotPath =
      `${insightsCollectionPath}/batch_${runId}_${sessionId}`;
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(studentSnapshotPath);
    await deleteDocumentIfPresent(runSnapshotPath);
    await deleteDocumentIfPresent(batchSnapshotPath);
    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentMetricsPath);

    await firestore.doc(runAnalyticsPath).set({
      avgAccuracyPercent: 78,
      avgRawScorePercent: 72,
      completionRate: 75,
      disciplineAverage: 66,
      guessRateAverage: 24,
      phaseAdherenceAverage: 81,
      riskDistribution: {
        "Drift-Prone": 1,
        "Stable": 2,
        "Volatile": 1,
      },
    });

    await firestore.doc(studentMetricsPath).set({
      avgAccuracyPercent: 74,
      avgRawScorePercent: 69,
      disciplineIndex: 63,
      escalationLevel: "Moderate",
      interventionSuggestion: "Recommend Controlled Mode",
      patterns: {
        easyNeglect: {
          active: false,
          frequency: 1,
        },
        hardBias: {
          active: false,
          frequency: 1,
        },
        rush: {
          active: true,
          frequency: 3,
          severity: "Moderate",
        },
        wrongStreak: {
          active: false,
          frequency: 1,
          severity: null,
        },
      },
      riskScore: 47,
      riskState: "Impulsive",
      totalTests: 4,
    });

    const submittedAt = Timestamp.fromMillis(Date.now());
    const result = await insightEngineService.processSubmittedSession(
      {
        eventId: "event_build_46_success",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 76,
        disciplineIndex: 61,
        rawScorePercent: 68,
        riskState: "Impulsive",
        status: "submitted",
        studentId,
        submittedAt,
      },
    );

    assert.equal(result.triggered, true);
    assert.equal(result.idempotent, false);
    assert.deepEqual(result.snapshotPaths, [
      studentSnapshotPath,
      runSnapshotPath,
      batchSnapshotPath,
    ]);

    const [studentSnapshot, runSnapshot, batchSnapshot] = await Promise.all([
      firestore.doc(studentSnapshotPath).get(),
      firestore.doc(runSnapshotPath).get(),
      firestore.doc(batchSnapshotPath).get(),
    ]);
    const studentData = studentSnapshot.data();
    const runData = runSnapshot.data();
    const batchData = batchSnapshot.data();

    assert.equal(studentData?.snapshotType, "student");
    assert.equal(studentData?.metrics?.riskState, "Impulsive");
    assert.equal(
      studentData?.recommendations?.includes("Recommend Controlled Mode"),
      true,
    );
    assert.equal(runData?.snapshotType, "run");
    assert.equal(runData?.metrics?.completionRate, 75);
    assert.equal(batchData?.snapshotType, "batch");
    assert.equal(batchData?.metrics?.volatileCount, 1);

    await deleteDocumentIfPresent(studentSnapshotPath);
    await deleteDocumentIfPresent(runSnapshotPath);
    await deleteDocumentIfPresent(batchSnapshotPath);
    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentMetricsPath);
  },
);

test(
  "processSubmittedSession is idempotent when snapshots already exist",
  async () => {
    const instituteId = "inst_build_46_idempotent";
    const yearId = "2026";
    const runId = "run_build_46_idempotent";
    const sessionId = "session_build_46_idempotent";
    const studentId = "student_build_46_idempotent";
    const insightsCollectionPath =
      `institutes/${instituteId}/academicYears/${yearId}/insightSnapshots`;
    const studentSnapshotPath =
      `${insightsCollectionPath}/student_${studentId}_${sessionId}`;
    const runSnapshotPath =
      `${insightsCollectionPath}/run_${runId}_${sessionId}`;
    const batchSnapshotPath =
      `${insightsCollectionPath}/batch_${runId}_${sessionId}`;
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const submittedAt = Timestamp.fromMillis(Date.now());

    await deleteDocumentIfPresent(studentSnapshotPath);
    await deleteDocumentIfPresent(runSnapshotPath);
    await deleteDocumentIfPresent(batchSnapshotPath);
    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentMetricsPath);

    await firestore.doc(runAnalyticsPath).set({
      avgAccuracyPercent: 82,
      avgRawScorePercent: 84,
      completionRate: 100,
      disciplineAverage: 88,
      guessRateAverage: 10,
      phaseAdherenceAverage: 92,
      riskDistribution: {
        "Stable": 4,
      },
    });
    await firestore.doc(studentMetricsPath).set({
      avgAccuracyPercent: 83,
      avgRawScorePercent: 81,
      disciplineIndex: 86,
      riskScore: 18,
      riskState: "Stable",
      totalTests: 3,
    });

    const firstResult = await insightEngineService.processSubmittedSession(
      {
        eventId: "event_build_46_idempotent_1",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 84,
        disciplineIndex: 88,
        rawScorePercent: 86,
        riskState: "Stable",
        status: "submitted",
        studentId,
        submittedAt,
      },
    );

    assert.equal(firstResult.triggered, true);

    const secondResult = await insightEngineService.processSubmittedSession(
      {
        eventId: "event_build_46_idempotent_2",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 84,
        disciplineIndex: 88,
        rawScorePercent: 86,
        riskState: "Stable",
        status: "submitted",
        studentId,
        submittedAt,
      },
    );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    await deleteDocumentIfPresent(studentSnapshotPath);
    await deleteDocumentIfPresent(runSnapshotPath);
    await deleteDocumentIfPresent(batchSnapshotPath);
    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentMetricsPath);
  },
);
