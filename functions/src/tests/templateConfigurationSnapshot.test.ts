import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {
  TemplateConfigurationSnapshot,
  TemplateCreationResult,
} from "../types/templateCreation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-17-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
interface TemplateCreationServiceContract {
  processTemplateCreated: (
    context: {instituteId: string; testId: string},
    data: unknown,
  ) => Promise<TemplateCreationResult>;
}

interface TemplateConfigurationSnapshotServiceContract {
  snapshotTemplateConfiguration: (
    context: {instituteId: string; testId: string},
    templateCreationResult: TemplateCreationResult,
  ) => Promise<TemplateConfigurationSnapshot>;
}

let templateCreationService: TemplateCreationServiceContract;
let templateConfigurationSnapshotService:
  TemplateConfigurationSnapshotServiceContract;

test.before(async () => {
  const templateCreationModule = await import(
    "../services/templateCreation.js"
  );
  templateCreationService = templateCreationModule.templateCreationService;

  const templateSnapshotModule = await import(
    "../services/templateConfigurationSnapshot.js"
  );
  templateConfigurationSnapshotService =
    templateSnapshotModule.templateConfigurationSnapshotService;
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
  "snapshotTemplateConfiguration persists immutable assignment snapshot fields",
  async () => {
    const instituteId = "inst_build_17_snapshot";
    const testId = "template_build_17_snapshot";
    const questionIds = [
      "q_build_17_snapshot_easy",
      "q_build_17_snapshot_medium",
      "q_build_17_snapshot_hard",
    ];
    const templatePath = `institutes/${instituteId}/tests/${testId}`;
    const questionPaths = questionIds.map((questionId) =>
      `institutes/${instituteId}/questionBank/${questionId}`,
    );

    await deleteDocumentIfPresent(templatePath);
    await Promise.all(questionPaths.map(deleteDocumentIfPresent));

    await firestore.doc(questionPaths[0]).set({difficulty: "Easy"});
    await firestore.doc(questionPaths[1]).set({difficulty: "Medium"});
    await firestore.doc(questionPaths[2]).set({difficulty: "Hard"});

    const templateCreationResult = await templateCreationService
      .processTemplateCreated(
        {instituteId, testId},
        {
          difficultyDistribution: {
            easy: 1,
            hard: 1,
            medium: 1,
          },
          phaseConfigSnapshot: {
            phase1Percent: 40,
            phase2Percent: 45,
            phase3Percent: 15,
          },
          questionIds,
          testId,
          timingProfile: {
            easy: {max: 80, min: 30},
            hard: {max: 200, min: 120},
            medium: {max: 140, min: 70},
          },
          totalQuestions: 3,
        },
      );

    const snapshot = await templateConfigurationSnapshotService
      .snapshotTemplateConfiguration(
        {instituteId, testId},
        templateCreationResult,
      );

    assert.deepEqual(snapshot.phaseConfigSnapshot, {
      phase1Percent: 40,
      phase2Percent: 45,
      phase3Percent: 15,
    });

    const templateData = (await firestore.doc(templatePath).get()).data();

    assert.deepEqual(templateData?.difficultyDistribution, {
      easy: 1,
      hard: 1,
      medium: 1,
    });
    assert.deepEqual(templateData?.phaseConfigSnapshot, {
      phase1Percent: 40,
      phase2Percent: 45,
      phase3Percent: 15,
    });
    assert.deepEqual(templateData?.timingProfile, {
      easy: {max: 80, min: 30},
      hard: {max: 200, min: 120},
      medium: {max: 140, min: 70},
    });

    await deleteDocumentIfPresent(templatePath);
    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
  },
);
