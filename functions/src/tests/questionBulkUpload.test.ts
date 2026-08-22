import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {
  questionBulkUploadService,
  QuestionBulkUploadService,
} from "../services/questionBulkUpload";
import {AdminQuestionLibraryService} from "../services/adminQuestionLibrary";
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
    assert.equal(result.rows[0]?.questionId, questionId);
    assert.equal(result.rows[0]?.version, 1);
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

    const auditPath =
      `institutes/${instituteId}/auditLogs/${result.uploadLogId}`;
    const auditSnapshot = await firestore.doc(auditPath).get();
    assert.equal(auditSnapshot.exists, true);
    assert.equal(auditSnapshot.data()?.actionType, "IMPORT_QUESTIONS");
    assert.equal(auditSnapshot.data()?.targetCollection, "questionBank");

    const updatedAtBeforeReplay = questionData?.updatedAt as Timestamp;
    const replayResult = await uploadService.ingestQuestions(normalizedRequest);
    assert.deepEqual(replayResult, result);
    const questionAfterReplay = await firestore.doc(questionPath).get();
    assert.equal(
      (questionAfterReplay.data()?.updatedAt as Timestamp).toMillis(),
      updatedAtBeforeReplay.toMillis(),
    );
    const uploadLogsAfterReplay = await firestore
      .collection(`institutes/${instituteId}/questionUploadLogs`)
      .get();
    assert.equal(uploadLogsAfterReplay.size, 1);

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
    await deleteDocumentIfPresent(auditPath);
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

test(
  "question bulk upload locks used structural fields and permits unused " +
    "overwrites",
  async () => {
    const instituteId = "inst_build_m3_structural_lock";
    const uploadService = new QuestionBulkUploadService(firestore);
    const questionId = "phy-lock-001-v1";
    const questionPath =
      `institutes/${instituteId}/questionBank/${questionId}`;

    await deleteDocumentIfPresent(questionPath);
    await firestore.doc(questionPath).set({
      correctAnswer: "B",
      difficulty: "Medium",
      examType: "JEE",
      marks: 4,
      negativeMarks: 1,
      questionId,
      questionImageUrl:
        `${instituteId}/questions/${questionId}/v1/question.png`,
      questionType: "MCQ",
      status: "used",
      subject: "Physics",
      uniqueKey: "PHY-LOCK-001",
      usedCount: 1,
      version: 1,
    });

    const changedRequest = uploadService.normalizeRequest({
      actorId: "admin_build_m3",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      commit: true,
      instituteId,
      questions: [{
        chapter: "Mechanics",
        correctAnswer: "C",
        difficulty: "Hard",
        examType: "NEET",
        marks: 5,
        negativeMarks: 2,
        questionId,
        questionImageUrl:
          `${instituteId}/questions/${questionId}/v1/question.webp`,
        questionType: "MultipleSelect",
        subject: "Applied Physics",
        uniqueKey: "PHY-LOCK-CHANGED",
        version: 1,
      }],
    });

    const blockedResult = await uploadService.ingestQuestions(changedRequest);
    assert.equal(blockedResult.committed, false);
    assert.equal(blockedResult.summary.invalid, 1);
    const lockError = blockedResult.rows[0]?.errors.join(" ") ?? "";
    for (const field of [
      "CorrectAnswer",
      "Difficulty",
      "Exam",
      "Marks",
      "NegativeMarks",
      "QuestionImageFile",
      "QuestionType",
      "Subject",
      "UniqueKey",
    ]) {
      assert.match(lockError, new RegExp(field));
    }
    assert.match(lockError, /create a new version/i);
    assert.equal((await firestore.doc(questionPath).get()).data()?.correctAnswer, "B");

    await firestore.doc(questionPath).set({
      status: "active",
      usedCount: 0,
    }, {merge: true});
    const overwriteResult = await uploadService.ingestQuestions(changedRequest);
    assert.equal(overwriteResult.committed, true);
    assert.equal(overwriteResult.summary.updated, 1);
    assert.equal((await firestore.doc(questionPath).get()).data()?.correctAnswer, "C");

    await deleteDocumentIfPresent(questionPath);
    await deleteDocumentIfPresent(overwriteResult.uploadLogPath ?? "");
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/auditLogs/${overwriteResult.uploadLogId}`,
    );
  },
);

test(
  "created text and image questions reload through the safe library boundary",
  async () => {
    const instituteId = "inst_build_m3_library_reload";
    const uploadService = new QuestionBulkUploadService(firestore);
    const imageQuestionId = "phy-reload-image-v1";
    const textQuestionId = "phy-reload-text-v1";
    const questionPaths = [imageQuestionId, textQuestionId].map((questionId) =>
      `institutes/${instituteId}/questionBank/${questionId}`,
    );

    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
    const request = uploadService.normalizeRequest({
      actorId: "admin_build_m3",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      commit: true,
      instituteId,
      questions: [
        {
          chapter: "Optics",
          correctAnswer: "A",
          difficulty: "Medium",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionId: imageQuestionId,
          questionImageUrl:
            `${instituteId}/questions/${imageQuestionId}/v1/question.webp`,
          questionType: "MCQ",
          solutionImageUrl:
            `${instituteId}/questions/${imageQuestionId}/v1/solution.png`,
          subject: "Physics",
          uniqueKey: "PHY-RELOAD-IMAGE",
          version: 1,
        },
        {
          chapter: "Units",
          correctAnswer: "D",
          difficulty: "Easy",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionId: textQuestionId,
          questionType: "MCQ",
          subject: "Physics",
          uniqueKey: "PHY-RELOAD-TEXT",
          version: 1,
        },
      ],
    });
    const uploadResult = await uploadService.ingestQuestions(request);
    assert.equal(uploadResult.committed, true);

    const libraryService = new AdminQuestionLibraryService(
      firestore,
      (signedRequest) => {
        const extension = signedRequest.extension ?? "png";
        const fileName = signedRequest.assetKind === "questionImage" ?
          `question.${extension}` :
          `solution.${extension}`;
        const cdnPath =
          `${signedRequest.instituteId}/questions/` +
          `${signedRequest.questionId}/v${signedRequest.version}/${fileName}`;
        return {
          accessContext: signedRequest.accessContext ?? "examSession",
          cdnPath,
          expiresAt: "2026-08-22T12:30:00.000Z",
          expiresInSeconds: 1800,
          signedUrl:
            `https://cdn.example.test/${cdnPath}` +
            "?Expires=1&KeyName=test-key&Signature=test-signature",
        };
      },
    );
    const libraryResult = await libraryService.getLibrary({
      instituteId,
      limit: 10,
    });
    const imageQuestion = libraryResult.questions.find(
      (question) => question.id === imageQuestionId,
    );
    const textQuestion = libraryResult.questions.find(
      (question) => question.id === textQuestionId,
    );

    assert.equal(imageQuestion?.correctAnswer, "A");
    assert.equal(
      imageQuestion?.questionImageFile,
      `${instituteId}/questions/${imageQuestionId}/v1/question.webp`,
    );
    assert.match(
      imageQuestion?.questionImagePreviewUrl ?? "",
      /^https:\/\/cdn\.example\.test\//,
    );
    assert.equal(textQuestion?.correctAnswer, "D");
    assert.equal(textQuestion?.questionImageFile, "");
    assert.equal(textQuestion?.questionImagePreviewUrl, "");
    assert.doesNotMatch(
      JSON.stringify(libraryResult),
      /bucketName|objectPath|storage\.googleapis|firebasestorage/i,
    );

    await Promise.all(questionPaths.map(deleteDocumentIfPresent));
    await deleteDocumentIfPresent(uploadResult.uploadLogPath ?? "");
    await deleteDocumentIfPresent(
      `institutes/${instituteId}/auditLogs/${uploadResult.uploadLogId}`,
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
  assert.equal(result.rows[0]?.version, 1);
  assert.equal(result.rows[1]?.version, 1);
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
