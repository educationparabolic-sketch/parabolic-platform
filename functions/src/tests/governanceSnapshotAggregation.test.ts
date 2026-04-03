import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  GovernanceSnapshotAggregationResult,
} from "../types/governanceSnapshot";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-86-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface GovernanceSnapshotAggregationServiceContract {
  generateMonthlySnapshots: (
    input?: {snapshotMonth?: string},
  ) => Promise<GovernanceSnapshotAggregationResult>;
}

let governanceSnapshotAggregationService:
  GovernanceSnapshotAggregationServiceContract;

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();

  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

test.before(async () => {
  const module = await import("../services/governanceSnapshotAggregation.js");
  governanceSnapshotAggregationService =
    module.governanceSnapshotAggregationService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "generateMonthlySnapshots creates immutable governance snapshots " +
    "from summary collections",
  async () => {
    const instituteId = "inst_build_86";
    const yearId = "2026";
    const academicYearPath =
      `institutes/${instituteId}/academicYears/${yearId}`;
    const runAnalyticsPath = `${academicYearPath}/runAnalytics`;
    const studentYearMetricsPath = `${academicYearPath}/studentYearMetrics`;
    const governanceSnapshotsPath =
      `${academicYearPath}/governanceSnapshots`;
    const snapshotPath = `${governanceSnapshotsPath}/2026_03`;

    await Promise.all([
      deleteCollectionDocuments(runAnalyticsPath),
      deleteCollectionDocuments(studentYearMetricsPath),
      deleteCollectionDocuments(governanceSnapshotsPath),
    ]);
    await firestore.doc(`institutes/${instituteId}`).set({name: instituteId});
    await firestore.doc(academicYearPath).set({yearId});

    await Promise.all([
      firestore.doc(`${runAnalyticsPath}/run_1`).set({
        avgAccuracyPercent: 70,
        avgRawScorePercent: 60,
        overrideCount: 2,
        processingMarkers: {
          runAnalyticsEngine: {
            submittedSessionCount: 4,
          },
        },
        stdDeviation: 10,
      }),
      firestore.doc(`${runAnalyticsPath}/run_2`).set({
        avgAccuracyPercent: 90,
        avgRawScorePercent: 80,
        overrideCount: 1,
        processingMarkers: {
          runAnalyticsEngine: {
            submittedSessionCount: 2,
          },
        },
        stdDeviation: 20,
      }),
      firestore.doc(`${studentYearMetricsPath}/student_1`).set({
        avgPhaseAdherence: 90,
        disciplineIndex: 80,
        easyNeglectActive: false,
        hardBiasActive: false,
        riskState: "stable",
        rushPatternActive: true,
        skipBurstActive: false,
        wrongStreakActive: false,
      }),
      firestore.doc(`${studentYearMetricsPath}/student_2`).set({
        avgPhaseAdherence: 60,
        disciplineIndex: 60,
        easyNeglectActive: true,
        hardBiasActive: false,
        riskState: "driftProne",
        rushPatternActive: false,
        skipBurstActive: true,
        wrongStreakActive: false,
      }),
      firestore.doc(`${studentYearMetricsPath}/student_3`).set({
        avgPhaseAdherence: 75,
        disciplineIndex: 70,
        easyNeglectActive: false,
        hardBiasActive: true,
        riskState: "volatile",
        rushPatternActive: false,
        skipBurstActive: false,
        wrongStreakActive: true,
      }),
    ]);

    const result = await governanceSnapshotAggregationService
      .generateMonthlySnapshots({
        snapshotMonth: "2026-03",
      });
    const snapshot = await firestore.doc(snapshotPath).get();
    const snapshotData = snapshot.data();

    assert.equal(result.snapshotMonth, "2026-03");
    assert.equal(result.createdCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.equal(snapshot.exists, true);
    assert.equal(snapshotData?.instituteId, instituteId);
    assert.equal(snapshotData?.academicYear, yearId);
    assert.equal(snapshotData?.month, "2026-03");
    assert.equal(snapshotData?.immutable, true);
    assert.equal(snapshotData?.schemaVersion, 1);
    assert.equal(snapshotData?.avgRawScorePercent, 66.67);
    assert.equal(snapshotData?.avgAccuracyPercent, 76.67);
    assert.equal(snapshotData?.disciplineMean, 70);
    assert.equal(snapshotData?.disciplineTrend, 70);
    assert.equal(snapshotData?.disciplineVariance, 66.67);
    assert.equal(snapshotData?.avgPhaseAdherence, 75);
    assert.equal(snapshotData?.phaseCompliancePercent, 75);
    assert.deepEqual(snapshotData?.riskDistribution, {
      driftProne: 33.33,
      impulsive: 0,
      overextended: 0,
      stable: 33.33,
      volatile: 33.33,
    });
    assert.deepEqual(snapshotData?.riskClusterDistribution, {
      driftProne: 33.33,
      impulsive: 0,
      overextended: 0,
      stable: 33.33,
      volatile: 33.33,
    });
    assert.equal(snapshotData?.templateVarianceMean, 15);
    assert.equal(snapshotData?.overrideFrequency, 50);
    assert.equal(snapshotData?.rushPatternPercent, 33.33);
    assert.equal(snapshotData?.easyNeglectPercent, 33.33);
    assert.equal(snapshotData?.hardBiasPercent, 33.33);
    assert.equal(snapshotData?.skipBurstPercent, 33.33);
    assert.equal(snapshotData?.wrongStreakPercent, 33.33);
    assert.equal(snapshotData?.stabilityIndex, 60.33);
    assert.ok(snapshotData?.generatedAt);
    assert.ok(snapshotData?.createdAt);

    const secondResult = await governanceSnapshotAggregationService
      .generateMonthlySnapshots({
        snapshotMonth: "2026-03",
      });

    assert.equal(secondResult.createdCount, 0);
    assert.equal(secondResult.skippedCount, 1);
    assert.equal(secondResult.results[0]?.reason, "already_exists");

    await Promise.all([
      deleteCollectionDocuments(runAnalyticsPath),
      deleteCollectionDocuments(studentYearMetricsPath),
      deleteCollectionDocuments(governanceSnapshotsPath),
    ]);
  },
);
