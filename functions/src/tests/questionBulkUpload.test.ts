import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {
  questionBulkUploadService,
  QuestionBulkUploadService,
} from "../services/questionBulkUpload";
import {questionIngestionService} from "../services/questionIngestion";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-m3-tests";
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
  "question bulk upload commit writes question docs, log records, and " +
    "downstream-ingestion-ready payloads",
  async () => {
    const instituteId = "inst_build_m3";
    const uploadService = new QuestionBulkUploadService(firestore);
    const questionId = "phy-motion-001-v1";
    const questionPath = `institutes/${instituteId}/questionBank/${questionId}`;

    await deleteDocumentIfPresent(questionPath);

    const normalizedRequest = uploadService.normalizeRequest({
      actorId: "admin_build_m3",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      commit: true,
      instituteId,
      questions: [
        {
          chapter: "Motion Laws",
          correctAnswer: "B",
          difficulty: "Medium",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionImageUrl:
            `${instituteId}/questions/${questionId}/v1/question.png`,
          questionTextKeywords: ["projectile", "kinematics"],
          questionType: "MCQ",
          solutionImageUrl:
            `${instituteId}/questions/${questionId}/v1/solution.png`,
          subject: "Physics",
          tags: ["Kinematics", "Motion"],
          uniqueKey: "PHY-MOTION-001",
          version: 1,
        },
      ],
    });

    const result = await uploadService.ingestQuestions(normalizedRequest);

    assert.equal(result.committed, true);
    assert.equal(result.summary.created, 1);
    assert.equal(result.summary.updated, 0);
    assert.equal(result.uploadLogPath, `institutes/${instituteId}/questionUploadLogs/${result.uploadLogId}`);

    const questionSnapshot = await firestore.doc(questionPath).get();
    assert.equal(questionSnapshot.exists, true);
    const questionData = questionSnapshot.data();
    assert.equal(questionData?.questionId, questionId);
    assert.equal(questionData?.uniqueKey, "PHY-MOTION-001");
    assert.equal(questionData?.examType, "JEE");
    assert.equal(
      questionData?.questionImageUrl,
      `${instituteId}/questions/${questionId}/v1/question.png`,
    );
    assert.equal(
      questionData?.solutionImageUrl,
      `${instituteId}/questions/${questionId}/v1/solution.png`,
    );
    assert.deepEqual(questionData?.tags, ["kinematics", "motion"]);
    assert.deepEqual(
      questionData?.questionTextKeywords,
      ["projectile", "kinematics"],
    );
    assert.ok(questionData?.createdAt instanceof Timestamp);

    const uploadLogSnapshot = await firestore.doc(result.uploadLogPath ?? "").get();
    assert.equal(uploadLogSnapshot.exists, true);
    assert.equal(uploadLogSnapshot.data()?.uploadedBy, "admin_build_m3");
    assert.equal(uploadLogSnapshot.data()?.totalRows, 1);
    assert.equal(uploadLogSnapshot.data()?.errors, 0);

    const ingestionResult = await questionIngestionService.ingestQuestion(
      {
        instituteId,
        questionId,
      },
      questionSnapshot.data(),
    );
    assert.equal(ingestionResult.questionPath, questionPath);

    await deleteDocumentIfPresent(questionPath);
    await deleteDocumentIfPresent(result.uploadLogPath ?? "");
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/questionAnalytics/${questionId}`,
    );
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/chapterDictionary/motion%20laws`,
    );
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/tagDictionary/kinematics`,
    );
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/tagDictionary/motion`,
    );
  },
);

test("question bulk upload validate-only rejects duplicate unique keys", async () => {
  const normalizedRequest = questionBulkUploadService.normalizeRequest({
    actorId: "admin_build_m3",
    actorLicenseLayer: "L2",
    actorRole: "admin",
    instituteId: "inst_build_m3_validation",
    questions: [
      {
        chapter: "Motion Laws",
        correctAnswer: "B",
        difficulty: "Medium",
        examType: "JEE",
        marks: 4,
        negativeMarks: 1,
        questionType: "MCQ",
        subject: "Physics",
        uniqueKey: "PHY-MOTION-001",
      },
      {
        chapter: "Current Electricity",
        correctAnswer: "C",
        difficulty: "Easy",
        examType: "JEE",
        marks: 4,
        negativeMarks: 1,
        questionType: "MCQ",
        subject: "Physics",
        uniqueKey: "PHY-MOTION-001",
      },
    ],
  });

  const result = await questionBulkUploadService.ingestQuestions(normalizedRequest);
  assert.equal(result.committed, false);
  assert.equal(result.summary.invalid, 1);
  assert.match(
    result.rows[1]?.errors.join(" "),
    /duplicate uniquekey within upload/i,
  );
});

test("question bulk upload rejects external image URLs", () => {
  assert.throws(
    () => questionBulkUploadService.normalizeRequest({
      actorId: "admin_build_m4",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      instituteId: "inst_build_m4_validation",
      questions: [
        {
          chapter: "Motion Laws",
          correctAnswer: "B",
          difficulty: "Medium",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionImageUrl: "https://example.com/question.png",
          questionType: "MCQ",
          solutionImageUrl:
            "https://cdn.yourdomain.com/inst_build_m4_validation/questions/" +
            "phy-motion-002-v1/v1/solution.png",
          subject: "Physics",
          uniqueKey: "PHY-MOTION-002",
          version: 1,
        },
      ],
    }),
    /managed CDN domain|canonical managed questionImage path/i,
  );
});
