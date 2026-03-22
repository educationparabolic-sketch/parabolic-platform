import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {questionSearchQueryService} from "../services/questionSearchQuery";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-13-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

const firestore = getFirestore();
const instituteId = "inst_build_13";
const questionIds = [
  "q_build_13_1",
  "q_build_13_2",
  "q_build_13_3",
  "q_build_13_4",
  "q_build_13_5",
];

const getQuestionPath = (questionId: string): string =>
  `institutes/${instituteId}/questionBank/${questionId}`;

const deleteQuestionIfPresent = async (questionId: string): Promise<void> => {
  const questionReference = firestore.doc(getQuestionPath(questionId));
  const snapshot = await questionReference.get();

  if (snapshot.exists) {
    await questionReference.delete();
  }
};

const seedQuestions = async (): Promise<void> => {
  const fixtureQuestions = [
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000005000),
      difficulty: "Medium",
      examType: "JEE",
      questionId: questionIds[0],
      status: "active",
      subject: "Physics",
      tags: ["kinematics", "velocity"],
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000004000),
      difficulty: "Hard",
      examType: "JEE",
      questionId: questionIds[1],
      status: "active",
      subject: "Physics",
      tags: ["kinematics", "dynamics"],
    },
    {
      chapter: "Electrostatics",
      createdAt: Timestamp.fromMillis(1710000003000),
      difficulty: "Medium",
      examType: "JEE",
      questionId: questionIds[2],
      status: "active",
      subject: "Physics",
      tags: ["electrostatics"],
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000002000),
      difficulty: "Medium",
      examType: "NEET",
      questionId: questionIds[3],
      status: "active",
      subject: "Biology",
      tags: ["physiology"],
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000001000),
      difficulty: "Medium",
      examType: "JEE",
      questionId: questionIds[4],
      status: "archived",
      subject: "Physics",
      tags: ["kinematics"],
    },
  ];

  await Promise.all(
    fixtureQuestions.map((question) =>
      firestore.doc(getQuestionPath(question.questionId)).set(question),
    ),
  );
};

test.before(async () => {
  await Promise.all(questionIds.map(deleteQuestionIfPresent));
  await seedQuestions();
});

test.after(async () => {
  await Promise.all(questionIds.map(deleteQuestionIfPresent));
  await getFirebaseAdminApp().delete();
});

test("searchQuestions supports examType + subject filter", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      examType: "JEE",
      subject: "Physics",
    },
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_13_1", "q_build_13_2", "q_build_13_3", "q_build_13_5"],
  );
  assert.equal(result.nextCursor, null);
});

test("searchQuestions supports subject + chapter filter", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      chapter: "Motion Laws",
      subject: "Physics",
    },
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_13_1", "q_build_13_2", "q_build_13_5"],
  );
});

test("searchQuestions supports difficulty + subject filter", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      difficulty: "Medium",
      subject: "Physics",
    },
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_13_1", "q_build_13_3", "q_build_13_5"],
  );
});

test("searchQuestions supports primaryTag filter via tags index", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      primaryTag: " KINEMATICS ",
    },
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_13_1", "q_build_13_2", "q_build_13_5"],
  );
});

test("searchQuestions enforces cursor pagination", async () => {
  const firstPage = await questionSearchQueryService.searchQuestions({
    filter: {
      examType: "JEE",
      subject: "Physics",
    },
    instituteId,
    limit: 2,
  });

  assert.deepEqual(
    firstPage.questions.map((question) => question.questionId),
    ["q_build_13_1", "q_build_13_2"],
  );
  assert.ok(firstPage.nextCursor);

  const secondPage = await questionSearchQueryService.searchQuestions({
    cursor: firstPage.nextCursor ?? undefined,
    filter: {
      examType: "JEE",
      subject: "Physics",
    },
    instituteId,
    limit: 2,
  });

  assert.deepEqual(
    secondPage.questions.map((question) => question.questionId),
    ["q_build_13_3", "q_build_13_5"],
  );
});

test("searchQuestions rejects unsupported filter combinations", async () => {
  await assert.rejects(
    questionSearchQueryService.searchQuestions({
      filter: {
        examType: "JEE",
      } as never,
      instituteId,
      limit: 10,
    }),
    (error: unknown) => {
      assert.match(String(error), /unsupported question-search filter/i);
      return true;
    },
  );
});

