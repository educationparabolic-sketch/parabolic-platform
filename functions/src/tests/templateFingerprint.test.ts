import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {TemplateCreationResult} from "../types/templateCreation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-18-tests";
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

interface TemplateFingerprintServiceContract {
  persistTemplateFingerprint: (
    context: {instituteId: string; testId: string},
    templateCreationResult: TemplateCreationResult,
  ) => Promise<string>;
}

let templateCreationService: TemplateCreationServiceContract;
let templateFingerprintService: TemplateFingerprintServiceContract;

test.before(async () => {
  const templateCreationModule = await import(
    "../services/templateCreation.js"
  );
  templateCreationService = templateCreationModule.templateCreationService;

  const templateFingerprintModule = await import(
    "../services/templateFingerprint.js"
  );
  templateFingerprintService =
    templateFingerprintModule.templateFingerprintService;
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
  "persistTemplateFingerprint is deterministic and detects structural changes",
  async () => {
    const instituteId = "inst_build_18";
    const baseQuestionIds = [
      "q_build_18_easy",
      "q_build_18_medium",
      "q_build_18_hard",
    ];
    const templateIds = {
      base: "template_build_18_base",
      baseClone: "template_build_18_base_clone",
      changedQuestionList: "template_build_18_changed_question_list",
      changedDistribution: "template_build_18_changed_distribution",
      changedPhase: "template_build_18_changed_phase",
    };
    const questionPaths = [
      ...baseQuestionIds.map((questionId) =>
        `institutes/${instituteId}/questionBank/${questionId}`,
      ),
      `institutes/${instituteId}/questionBank/q_build_18_extra_easy`,
    ];
    const templatePaths = Object.values(templateIds).map((testId) =>
      `institutes/${instituteId}/tests/${testId}`,
    );

    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
    await Promise.all(templatePaths.map(deleteDocumentIfPresent));

    await firestore.doc(questionPaths[0]).set({difficulty: "Easy"});
    await firestore.doc(questionPaths[1]).set({difficulty: "Medium"});
    await firestore.doc(questionPaths[2]).set({difficulty: "Hard"});
    await firestore.doc(questionPaths[3]).set({difficulty: "Easy"});

    const buildTemplate = async (
      testId: string,
      payload: {
        difficultyDistribution: {easy: number; medium: number; hard: number};
        phaseConfigSnapshot: {
          phase1Percent: number;
          phase2Percent: number;
          phase3Percent: number;
        };
        questionIds: string[];
      },
    ): Promise<string> => {
      const result = await templateCreationService.processTemplateCreated(
        {instituteId, testId},
        {
          ...payload,
          testId,
          timingProfile: {
            easy: {max: 80, min: 30},
            hard: {max: 200, min: 120},
            medium: {max: 140, min: 70},
          },
          totalQuestions: payload.questionIds.length,
        },
      );

      return templateFingerprintService.persistTemplateFingerprint(
        {instituteId, testId},
        result,
      );
    };

    const baseFingerprint = await buildTemplate(templateIds.base, {
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
      questionIds: [...baseQuestionIds],
    });

    const baseCloneFingerprint = await buildTemplate(templateIds.baseClone, {
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
      questionIds: [...baseQuestionIds],
    });

    assert.equal(baseFingerprint.length, 64);
    assert.equal(baseFingerprint, baseCloneFingerprint);

    const storedBaseTemplate =
      (await firestore.doc(templatePaths[0]).get()).data();
    assert.equal(storedBaseTemplate?.templateFingerprint, baseFingerprint);

    const changedQuestionListFingerprint = await buildTemplate(
      templateIds.changedQuestionList,
      {
        difficultyDistribution: {
          easy: 2,
          hard: 1,
          medium: 1,
        },
        phaseConfigSnapshot: {
          phase1Percent: 45,
          phase2Percent: 40,
          phase3Percent: 15,
        },
        questionIds: [...baseQuestionIds, "q_build_18_extra_easy"],
      },
    );
    assert.notEqual(baseFingerprint, changedQuestionListFingerprint);

    await firestore.doc(questionPaths[1]).set(
      {difficulty: "Hard"},
      {merge: true},
    );

    const changedDistributionFingerprint = await buildTemplate(
      templateIds.changedDistribution,
      {
        difficultyDistribution: {
          easy: 1,
          hard: 2,
          medium: 0,
        },
        phaseConfigSnapshot: {
          phase1Percent: 40,
          phase2Percent: 45,
          phase3Percent: 15,
        },
        questionIds: [...baseQuestionIds],
      },
    );
    assert.notEqual(baseFingerprint, changedDistributionFingerprint);

    await firestore.doc(questionPaths[1]).set(
      {difficulty: "Medium"},
      {merge: true},
    );

    const changedPhaseFingerprint = await buildTemplate(
      templateIds.changedPhase,
      {
        difficultyDistribution: {
          easy: 1,
          hard: 1,
          medium: 1,
        },
        phaseConfigSnapshot: {
          phase1Percent: 35,
          phase2Percent: 50,
          phase3Percent: 15,
        },
        questionIds: [...baseQuestionIds],
      },
    );
    assert.notEqual(baseFingerprint, changedPhaseFingerprint);

    await Promise.all(templatePaths.map(deleteDocumentIfPresent));
    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
  },
);
