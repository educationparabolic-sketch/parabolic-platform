import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  TemplateAnalyticsInitializationResult,
} from "../types/templateAnalytics";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-19-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface TemplateAnalyticsInitializationServiceContract {
  initializeTemplateAnalytics: (
    context: {instituteId: string; testId: string},
    templateData: unknown,
  ) => Promise<TemplateAnalyticsInitializationResult>;
}

let templateAnalyticsInitializationService:
  TemplateAnalyticsInitializationServiceContract;

test.before(async () => {
  const module = await import(
    "../services/templateAnalyticsInitialization.js"
  );
  templateAnalyticsInitializationService =
    module.templateAnalyticsInitializationService;
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
  "initializeTemplateAnalytics creates template analytics stub in academic " +
    "year scope and remains idempotent",
  async () => {
    const instituteId = "inst_build_19";
    const testId = "template_build_19";
    const yearId = "2026";
    const templateAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `templateAnalytics/${testId}`;

    await deleteDocumentIfPresent(templateAnalyticsPath);

    const firstResult =
      await templateAnalyticsInitializationService.initializeTemplateAnalytics(
        {instituteId, testId},
        {academicYear: yearId},
      );
    assert.equal(firstResult.wasCreated, true);
    assert.equal(firstResult.yearId, yearId);
    assert.equal(firstResult.templateAnalyticsPath, templateAnalyticsPath);

    const firstSnapshot = await firestore.doc(templateAnalyticsPath).get();
    const firstData = firstSnapshot.data();

    assert.equal(firstData?.totalRuns, 0);
    assert.equal(firstData?.avgRawScorePercent, 0);
    assert.equal(firstData?.avgAccuracyPercent, 0);
    assert.equal(firstData?.stabilityIndex, 0);
    assert.equal(firstData?.difficultyConsistencyScore, 0);
    assert.equal(firstData?.phaseVariance, 0);
    assert.equal(firstData?.riskShiftIndex, 0);
    assert.ok(firstData?.lastUpdated instanceof Timestamp);

    await firestore.doc(templateAnalyticsPath).set({
      avgRawScorePercent: 72.5,
    }, {merge: true});

    const secondResult =
      await templateAnalyticsInitializationService.initializeTemplateAnalytics(
        {instituteId, testId},
        {academicYear: yearId},
      );
    assert.equal(secondResult.wasCreated, false);

    const secondSnapshot = await firestore.doc(templateAnalyticsPath).get();
    const secondData = secondSnapshot.data();
    assert.equal(secondData?.avgRawScorePercent, 72.5);

    await deleteDocumentIfPresent(templateAnalyticsPath);
  },
);

test(
  "initializeTemplateAnalytics rejects missing academicYear field",
  async () => {
    await assert.rejects(
      templateAnalyticsInitializationService.initializeTemplateAnalytics(
        {instituteId: "inst_build_19_invalid", testId: "template_invalid"},
        {},
      ),
      (error: unknown) => {
        assert.match(String(error), /academicYear/i);
        return true;
      },
    );
  },
);
