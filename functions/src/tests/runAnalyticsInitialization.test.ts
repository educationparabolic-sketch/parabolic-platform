import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  RunAnalyticsInitializationResult,
} from "../types/runAnalyticsInitialization";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-24-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface RunAnalyticsInitializationServiceContract {
  initializeRunAnalytics: (
    context: {instituteId: string; runId: string; yearId: string},
    runData: unknown,
  ) => Promise<RunAnalyticsInitializationResult>;
}

let runAnalyticsInitializationService:
  RunAnalyticsInitializationServiceContract;

test.before(async () => {
  const module = await import("../services/runAnalyticsInitialization.js");
  runAnalyticsInitializationService = module.runAnalyticsInitializationService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "initializeRunAnalytics creates run analytics stub in academic year " +
    "scope and remains idempotent",
  async () => {
    const instituteId = "inst_build_24";
    const yearId = "2026";
    const runId = "run_build_24";
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `runAnalytics/${runId}`;

    await deleteDocumentIfPresent(runAnalyticsPath);

    const firstResult =
      await runAnalyticsInitializationService.initializeRunAnalytics(
        {instituteId, runId, yearId},
        {runId},
      );
    assert.equal(firstResult.wasCreated, true);
    assert.equal(firstResult.runAnalyticsPath, runAnalyticsPath);

    const firstSnapshot = await firestore.doc(runAnalyticsPath).get();
    const firstData = firstSnapshot.data();

    assert.equal(firstData?.avgRawScorePercent, 0);
    assert.equal(firstData?.avgAccuracyPercent, 0);
    assert.equal(firstData?.completionRate, 0);
    assert.deepEqual(firstData?.riskDistribution, {});
    assert.equal(firstData?.stdDeviation, 0);
    assert.equal(firstData?.disciplineAverage, 0);
    assert.equal(firstData?.phaseAdherenceAverage, 0);
    assert.equal(firstData?.guessRateAverage, 0);
    assert.equal(firstData?.overrideCount, 0);
    assert.ok(firstData?.createdAt instanceof Timestamp);

    await firestore.doc(runAnalyticsPath).set({
      avgRawScorePercent: 77.25,
    }, {merge: true});

    const secondResult =
      await runAnalyticsInitializationService.initializeRunAnalytics(
        {instituteId, runId, yearId},
        {runId},
      );
    assert.equal(secondResult.wasCreated, false);

    const secondSnapshot = await firestore.doc(runAnalyticsPath).get();
    const secondData = secondSnapshot.data();
    assert.equal(secondData?.avgRawScorePercent, 77.25);

    await deleteDocumentIfPresent(runAnalyticsPath);
  },
);

test(
  "initializeRunAnalytics rejects payload runId mismatch",
  async () => {
    await assert.rejects(
      runAnalyticsInitializationService.initializeRunAnalytics(
        {
          instituteId: "inst_build_24_invalid",
          runId: "run_build_24_invalid",
          yearId: "2026",
        },
        {runId: "different_run_id"},
      ),
      (error: unknown) => {
        assert.match(String(error), /runId/i);
        return true;
      },
    );
  },
);
