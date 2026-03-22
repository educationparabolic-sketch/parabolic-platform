import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-16-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
interface TemplateCreationResult {
  questionIds: string[];
  templatePath: string;
  totalQuestions: number;
  validatedQuestionPaths: string[];
}

let templateCreationService: {
  processTemplateCreated: (
    context: {instituteId: string; testId: string},
    data: unknown,
  ) => Promise<TemplateCreationResult>;
};

test.before(async () => {
  const module = await import("../services/templateCreation.js");
  templateCreationService = module.templateCreationService;
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
  "processTemplateCreated validates question ownership and normalizes draft " +
    "template fields",
  async () => {
    const instituteId = "inst_build_16";
    const testId = "template_build_16";
    const questionIds = [
      "q_build_16_easy",
      "q_build_16_medium",
      "q_build_16_hard",
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
    await firestore.doc(templatePath).set({
      createdAt: Timestamp.now(),
      difficultyDistribution: {
        easy: 1,
        hard: 1,
        medium: 1,
      },
      questionIds,
      status: "ready",
      testId,
      timingProfile: {
        easy: {max: 80, min: 30},
        hard: {max: 200, min: 120},
        medium: {max: 140, min: 70},
      },
      totalQuestions: 3,
      totalRuns: 7,
    });

    const result = await templateCreationService.processTemplateCreated(
      {instituteId, testId},
      (await firestore.doc(templatePath).get()).data(),
    );

    assert.equal(result.templatePath, templatePath);
    assert.equal(result.totalQuestions, 3);
    assert.deepEqual(result.questionIds, questionIds);
    assert.equal(result.validatedQuestionPaths.length, 3);

    const templateSnapshot = await firestore.doc(templatePath).get();
    const templateData = templateSnapshot.data();

    assert.equal(templateData?.status, "draft");
    assert.equal(templateData?.totalQuestions, 3);
    assert.equal(templateData?.totalRuns, 7);
    assert.ok(templateData?.createdAt instanceof Timestamp);

    await deleteDocumentIfPresent(templatePath);
    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
  },
);

test(
  "processTemplateCreated rejects templates with missing or cross-institute " +
    "question references",
  async () => {
    const instituteId = "inst_build_16_invalid_questions";
    const otherInstituteId = "inst_build_16_other";
    const testId = "template_build_16_invalid_questions";
    const ownQuestionPath =
      `institutes/${instituteId}/questionBank/q_build_16_owned`;
    const otherQuestionPath =
      `institutes/${otherInstituteId}/questionBank/q_build_16_other`;

    await deleteDocumentIfPresent(ownQuestionPath);
    await deleteDocumentIfPresent(otherQuestionPath);

    await firestore.doc(ownQuestionPath).set({difficulty: "Easy"});
    await firestore.doc(otherQuestionPath).set({difficulty: "Medium"});

    await assert.rejects(
      templateCreationService.processTemplateCreated(
        {instituteId, testId},
        {
          difficultyDistribution: {
            easy: 1,
            hard: 0,
            medium: 1,
          },
          questionIds: ["q_build_16_owned", "q_build_16_other"],
          testId,
          timingProfile: {
            easy: {max: 80, min: 30},
            hard: {max: 200, min: 120},
            medium: {max: 140, min: 70},
          },
          totalQuestions: 2,
        },
      ),
      (error: unknown) => {
        assert.match(String(error), /does not belong to this institute/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(ownQuestionPath);
    await deleteDocumentIfPresent(otherQuestionPath);
  },
);

test(
  "processTemplateCreated rejects mismatched difficulty distribution",
  async () => {
    const instituteId = "inst_build_16_invalid_distribution";
    const testId = "template_build_16_invalid_distribution";
    const easyQuestionPath =
      `institutes/${instituteId}/questionBank/q_build_16_distribution_easy`;
    const hardQuestionPath =
      `institutes/${instituteId}/questionBank/q_build_16_distribution_hard`;

    await deleteDocumentIfPresent(easyQuestionPath);
    await deleteDocumentIfPresent(hardQuestionPath);

    await firestore.doc(easyQuestionPath).set({difficulty: "Easy"});
    await firestore.doc(hardQuestionPath).set({difficulty: "Hard"});

    await assert.rejects(
      templateCreationService.processTemplateCreated(
        {instituteId, testId},
        {
          difficultyDistribution: {
            easy: 2,
            hard: 0,
            medium: 0,
          },
          questionIds: [
            "q_build_16_distribution_easy",
            "q_build_16_distribution_hard",
          ],
          testId,
          timingProfile: {
            easy: {max: 80, min: 30},
            hard: {max: 200, min: 120},
            medium: {max: 140, min: 70},
          },
          totalQuestions: 2,
        },
      ),
      (error: unknown) => {
        assert.match(String(error), /difficultydistribution/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(easyQuestionPath);
    await deleteDocumentIfPresent(hardQuestionPath);
  },
);

test("processTemplateCreated rejects invalid timing profile", async () => {
  const instituteId = "inst_build_16_invalid_timing";
  const testId = "template_build_16_invalid_timing";
  const questionPath =
    `institutes/${instituteId}/questionBank/q_build_16_timing_easy`;

  await deleteDocumentIfPresent(questionPath);
  await firestore.doc(questionPath).set({difficulty: "Easy"});

  await assert.rejects(
    templateCreationService.processTemplateCreated(
      {instituteId, testId},
      {
        difficultyDistribution: {
          easy: 1,
          hard: 0,
          medium: 0,
        },
        questionIds: ["q_build_16_timing_easy"],
        testId,
        timingProfile: {
          easy: {max: 10, min: 20},
          hard: {max: 200, min: 120},
          medium: {max: 140, min: 70},
        },
        totalQuestions: 1,
      },
    ),
    (error: unknown) => {
      assert.match(String(error), /min <= max/i);
      return true;
    },
  );

  await deleteDocumentIfPresent(questionPath);
});
