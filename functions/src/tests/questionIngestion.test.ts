import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {questionIngestionService} from "../services/questionIngestion";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-11-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

const firestore = getFirestore();

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
  "ingestQuestion normalizes tags, adds search tokens, " +
    "and initializes analytics",
  async () => {
    const instituteId = "inst_build_11";
    const questionId = "question_build_11";
    const questionPath = `institutes/${instituteId}/questionBank/${questionId}`;
    const analyticsPath =
      `institutes/${instituteId}/questionAnalytics/${questionId}`;
    const chapterDictionaryPath =
      `institutes/${instituteId}/chapterDictionary/motion%20laws`;
    const kinematicsTagPath =
      `institutes/${instituteId}/tagDictionary/kinematics`;
    const velocityTagPath =
      `institutes/${instituteId}/tagDictionary/velocity`;

    await deleteDocumentIfPresent(questionPath);
    await deleteDocumentIfPresent(analyticsPath);
    await deleteDocumentIfPresent(chapterDictionaryPath);
    await deleteDocumentIfPresent(kinematicsTagPath);
    await deleteDocumentIfPresent(velocityTagPath);

    const createdAt = Timestamp.now();

    await firestore.doc(questionPath).set({
      chapter: "Motion Laws",
      correctAnswer: "B",
      createdAt,
      difficulty: "Medium",
      examType: "JEE",
      marks: 4,
      negativeMarks: 1,
      parentQuestionId: null,
      questionId,
      questionImageUrl: "",
      questionType: "MCQ",
      simulationLink: null,
      solutionImageUrl: "",
      subject: "Physics",
      tags: [" Kinematics ", "velocity", "kinematics"],
      tutorialVideoLink: null,
      uniqueKey: "PHY-MOT-001",
      version: 1,
    });

    const result = await questionIngestionService.ingestQuestion(
      {
        instituteId,
        questionId,
      },
      (await firestore.doc(questionPath).get()).data(),
    );

    assert.equal(result.questionPath, questionPath);
    assert.equal(result.analyticsPath, analyticsPath);
    assert.deepEqual(result.chapterDictionaryPaths, [chapterDictionaryPath]);
    assert.deepEqual(result.normalizedTags, ["kinematics", "velocity"]);
    assert.deepEqual(
      result.tagDictionaryPaths,
      [kinematicsTagPath, velocityTagPath],
    );
    assert.deepEqual(
      result.searchTokens,
      ["kinematics", "laws", "motion", "physics", "velocity"],
    );

    const ingestedQuestion = (await firestore.doc(questionPath).get()).data();
    const analytics = (await firestore.doc(analyticsPath).get()).data();
    const chapterDictionary = (
      await firestore.doc(chapterDictionaryPath).get()
    ).data();
    const kinematicsTagDictionary = (
      await firestore.doc(kinematicsTagPath).get()
    ).data();
    const velocityTagDictionary = (
      await firestore.doc(velocityTagPath).get()
    ).data();

    assert.deepEqual(ingestedQuestion?.tags, ["kinematics", "velocity"]);
    assert.deepEqual(
      ingestedQuestion?.searchTokens,
      ["kinematics", "laws", "motion", "physics", "velocity"],
    );
    assert.equal(ingestedQuestion?.status, "active");
    assert.equal(ingestedQuestion?.usedCount, 0);
    assert.equal(analytics?.avgRawPercentWhenUsed, 0);
    assert.equal(analytics?.avgAccuracyWhenUsed, 0);
    assert.equal(analytics?.correctAttemptCount, 0);
    assert.equal(analytics?.incorrectAttemptCount, 0);
    assert.equal(analytics?.averageResponseTimeMs, 0);
    assert.equal(analytics?.guessRate, 0);
    assert.equal(analytics?.overstayRate, 0);
    assert.equal(analytics?.riskImpactScore, 0);
    assert.equal(analytics?.disciplineStressIndex, 0);
    assert.equal(chapterDictionary?.chapterName, "motion laws");
    assert.equal(chapterDictionary?.subject, "physics");
    assert.equal(chapterDictionary?.usageCount, 1);
    assert.equal(kinematicsTagDictionary?.tagName, "kinematics");
    assert.equal(kinematicsTagDictionary?.usageCount, 1);
    assert.equal(velocityTagDictionary?.tagName, "velocity");
    assert.equal(velocityTagDictionary?.usageCount, 1);

    await deleteDocumentIfPresent(questionPath);
    await deleteDocumentIfPresent(analyticsPath);
    await deleteDocumentIfPresent(chapterDictionaryPath);
    await deleteDocumentIfPresent(kinematicsTagPath);
    await deleteDocumentIfPresent(velocityTagPath);
  },
);

test("ingestQuestion rejects invalid schema payloads", async () => {
  await assert.rejects(
    questionIngestionService.ingestQuestion(
      {
        instituteId: "inst_build_11_invalid",
        questionId: "question_build_11_invalid",
      },
      {
        chapter: "Motion Laws",
        correctAnswer: "B",
        createdAt: Timestamp.now(),
        difficulty: "Invalid",
        examType: "JEE",
        marks: 4,
        negativeMarks: 1,
        parentQuestionId: null,
        questionId: "question_build_11_invalid",
        questionImageUrl: "",
        questionType: "MCQ",
        simulationLink: null,
        solutionImageUrl: "",
        subject: "Physics",
        tags: ["kinematics"],
        tutorialVideoLink: null,
        uniqueKey: "PHY-MOT-002",
        version: 1,
      },
    ),
    (error: unknown) => {
      assert.match(String(error), /difficulty/i);
      return true;
    },
  );
});
