import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionLibraryService} from "../services/adminQuestionLibrary";

function createFirestoreMock(): FirebaseFirestore.Firestore {
  const questionDocuments = [
    {
      data: () => ({
        chapter: "Kinematics",
        correctAnswer: "B",
        createdAt: Timestamp.fromDate(new Date("2026-05-10T00:00:00.000Z")),
        difficulty: "Easy",
        academicYear: "2026-27",
        additionalTag: "jee-main",
        examType: "JEEMains",
        internalNotes: "Review after next mock test.",
        lastUsedAt: Timestamp.fromDate(new Date("2026-05-10T08:30:00.000Z")),
        marks: 4,
        negativeMarks: 1,
        primaryTag: "motion",
        questionId: "q-001",
        questionImageUrl:
          "inst_build_m5/questions/q-001/v2/question.webp",
        questionType: "MCQ",
        simulationLink: "https://sim.example.com/motion",
        solutionImageUrl:
          "inst_build_m5/questions/q-001/v2/solution.png",
        status: "active",
        subject: "Physics",
        tags: ["motion", "basics"],
        topic: "Uniform acceleration",
        tutorialVideoLink: "https://learning.example.com/motion",
        uniqueKey: "PH-KIN-001",
        usedCount: 4,
        version: 2,
      }),
      id: "q-001",
    },
    {
      data: () => ({
        chapter: "Thermodynamics",
        createdAt: Timestamp.fromDate(new Date("2025-12-01T00:00:00.000Z")),
        difficulty: "Hard",
        examType: "NEET",
        lastUsedAt: Timestamp.fromDate(new Date("2024-01-01T00:00:00.000Z")),
        marks: 4,
        negativeMarks: 1,
        questionId: "q-002",
        questionImageUrl:
          "https://storage.googleapis.com/private/question.png",
        questionType: "Integer",
        status: "archived",
        subject: "Chemistry",
        tags: ["thermo"],
        uniqueKey: "CH-THM-002",
        usedCount: 0,
        version: 1,
      }),
      id: "q-002",
    },
  ];

  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          limit: () => ({
            get: async () => ({
              docs: questionDocuments,
            }),
          }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                docs: questionDocuments,
              }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

test("admin question library service maps persisted question records", async () => {
  const signedRequests: Array<{
    assetKind: string;
    questionId: string;
    version: number;
  }> = [];
  const service = new AdminQuestionLibraryService(
    createFirestoreMock(),
    (request) => {
      signedRequests.push(request);
      const extension = request.extension ?? "png";
      const fileName = request.assetKind === "questionImage" ?
        `question.${extension}` :
        `solution.${extension}`;
      const cdnPath =
        `${request.instituteId}/questions/${request.questionId}/` +
        `v${request.version}/${fileName}`;
      return {
        accessContext: request.accessContext ?? "examSession",
        cdnPath,
        expiresAt: "2026-08-22T12:30:00.000Z",
        expiresInSeconds: 1800,
        signedUrl:
          `https://cdn.example.test/${cdnPath}` +
          "?Expires=1&KeyName=test-key&Signature=test-signature",
      };
    },
  );

  const result = await service.getLibrary({
    instituteId: "inst_build_m5",
    limit: 25,
  });

  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0], {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    chapter: "Kinematics",
    correctAnswer: "B",
    difficulty: "easy",
    examType: "JEEMains",
    id: "q-001",
    internalNotes: "Review after next mock test.",
    lastUsedDate: "2026-05-10",
    marks: 4,
    negativeMarks: 1,
    primaryTag: "motion",
    prompt: "Physics Kinematics MCQ",
    questionImageFile: "inst_build_m5/questions/q-001/v2/question.webp",
    questionImagePreviewUrl:
      "https://cdn.example.test/inst_build_m5/questions/q-001/" +
      "v2/question.webp?Expires=1&KeyName=test-key&Signature=test-signature",
    questionType: "MCQ",
    secondaryTag: "basics",
    simulationLink: "https://sim.example.com/motion",
    solutionImageFile: "inst_build_m5/questions/q-001/v2/solution.png",
    solutionImagePreviewUrl:
      "https://cdn.example.test/inst_build_m5/questions/q-001/" +
      "v2/solution.png?Expires=1&KeyName=test-key&Signature=test-signature",
    status: "active",
    subject: "Physics",
    thermalState: "hot",
    topic: "Uniform acceleration",
    uniqueKey: "PH-KIN-001",
    tutorialVideoLink: "https://learning.example.com/motion",
    usedCount: 4,
    version: 2,
  });
  assert.equal(result.questions[1]?.status, "archived");
  assert.equal(result.questions[1]?.thermalState, "cold");
  assert.equal(result.questions[1]?.secondaryTag, "none");
  assert.equal(result.questions[1]?.academicYear, "unassigned");
  assert.equal(result.questions[1]?.additionalTag, "none");
  assert.equal(result.questions[1]?.lastUsedDate, "2024-01-01");
  assert.equal(result.questions[1]?.internalNotes, "");
  assert.equal(result.questions[1]?.topic, "");
  assert.equal(result.questions[1]?.questionImageFile, "");
  assert.equal(result.questions[1]?.questionImagePreviewUrl, "");
  assert.equal(signedRequests.length, 2);
  assert.ok(signedRequests.every((request) => request.questionId === "q-001"));
  assert.ok(signedRequests.every((request) => request.version === 2));
});
