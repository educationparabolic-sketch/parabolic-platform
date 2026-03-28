import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {questionSearchQueryService} from "../services/questionSearchQuery";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-54-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";

const firestore = getFirestore();
const instituteId = "inst_build_54";
const questionIds = [
  "q_build_54_1",
  "q_build_54_2",
  "q_build_54_3",
  "q_build_54_4",
  "q_build_54_5",
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
      primaryTag: "kinematics",
      questionId: questionIds[0],
      searchTokens: ["kinematics", "laws", "motion", "physics", "velocity"],
      status: "active",
      subject: "Physics",
      tags: ["kinematics", "velocity"],
      usedCount: 4,
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000004000),
      difficulty: "Hard",
      examType: "JEE",
      primaryTag: "kinematics",
      questionId: questionIds[1],
      searchTokens: ["dynamics", "kinematics", "laws", "motion", "physics"],
      status: "active",
      subject: "Physics",
      tags: ["kinematics", "dynamics"],
      usedCount: 9,
    },
    {
      chapter: "Electrostatics",
      createdAt: Timestamp.fromMillis(1710000003000),
      difficulty: "Medium",
      examType: "JEE",
      primaryTag: "electrostatics",
      questionId: questionIds[2],
      searchTokens: ["charge", "electrostatics", "physics"],
      status: "active",
      subject: "Physics",
      tags: ["electrostatics"],
      usedCount: 1,
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000002000),
      difficulty: "Medium",
      examType: "NEET",
      primaryTag: "physiology",
      questionId: questionIds[3],
      searchTokens: ["biology", "motion", "physiology"],
      status: "active",
      subject: "Biology",
      tags: ["physiology"],
      usedCount: 6,
    },
    {
      chapter: "Motion Laws",
      createdAt: Timestamp.fromMillis(1710000001000),
      difficulty: "Medium",
      examType: "JEE",
      primaryTag: "kinematics",
      questionId: questionIds[4],
      searchTokens: ["archived", "kinematics", "physics"],
      status: "archived",
      subject: "Physics",
      tags: ["kinematics"],
      usedCount: 2,
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
    actorRole: "teacher",
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_54_1", "q_build_54_2", "q_build_54_3", "q_build_54_5"],
  );
  assert.equal(result.nextCursor, null);
});

test("searchQuestions supports subject + chapter filter", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      chapter: "Motion Laws",
      subject: "Physics",
    },
    actorRole: "teacher",
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_54_1", "q_build_54_2", "q_build_54_5"],
  );
});

test("searchQuestions supports difficulty + subject filter", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      difficulty: "Medium",
      subject: "Physics",
    },
    actorRole: "teacher",
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_54_1", "q_build_54_3", "q_build_54_5"],
  );
});

test("searchQuestions supports primaryTag equality filtering", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    filter: {
      primaryTag: " KINEMATICS ",
    },
    actorRole: "teacher",
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_54_1", "q_build_54_2", "q_build_54_5"],
  );
});

test("searchQuestions supports token-based text filtering", async () => {
  const result = await questionSearchQueryService.searchQuestions({
    actorRole: "teacher",
    filter: {
      searchToken: " Velocity ",
    },
    instituteId,
    limit: 10,
  });

  assert.deepEqual(
    result.questions.map((question) => question.questionId),
    ["q_build_54_1"],
  );
});

test(
  "searchQuestions enforces exact single-token text queries",
  async () => {
    await assert.rejects(
      questionSearchQueryService.searchQuestions({
        actorRole: "teacher",
        filter: {
          searchToken: "relative velocity",
        },
        instituteId,
        limit: 10,
      }),
      (error: unknown) => {
        assert.match(String(error), /exactly one search token/i);
        return true;
      },
    );
  },
);

test("searchQuestions enforces cursor pagination", async () => {
  const firstPage = await questionSearchQueryService.searchQuestions({
    filter: {
      examType: "JEE",
      subject: "Physics",
    },
    actorRole: "teacher",
    instituteId,
    limit: 2,
  });

  assert.deepEqual(
    firstPage.questions.map((question) => question.questionId),
    ["q_build_54_1", "q_build_54_2"],
  );
  assert.ok(firstPage.nextCursor);

  const secondPage = await questionSearchQueryService.searchQuestions({
    cursor: firstPage.nextCursor ?? undefined,
    filter: {
      examType: "JEE",
      subject: "Physics",
    },
    actorRole: "teacher",
    instituteId,
    limit: 2,
  });

  assert.deepEqual(
    secondPage.questions.map((question) => question.questionId),
    ["q_build_54_3", "q_build_54_5"],
  );
});

test("searchQuestions rejects unsupported filter combinations", async () => {
  await assert.rejects(
    questionSearchQueryService.searchQuestions({
      filter: {
        examType: "JEE",
      } as never,
      actorRole: "teacher",
      instituteId,
      limit: 10,
    }),
    (error: unknown) => {
      assert.match(String(error), /unsupported question-search filter/i);
      return true;
    },
  );
});

test(
  "searchQuestions enforces role restrictions through search architecture",
  async () => {
    await assert.rejects(
      questionSearchQueryService.searchQuestions({
        actorRole: "student",
        filter: {
          examType: "JEE",
          subject: "Physics",
        },
        instituteId,
        limit: 10,
      }),
      (error: unknown) => {
        assert.match(String(error), /cannot access questionBank search/i);
        return true;
      },
    );
  },
);

test(
  "searchQuestions supports usedCount sorting with deterministic pagination",
  async () => {
    const firstPage = await questionSearchQueryService.searchQuestions({
      actorRole: "admin",
      filter: {
        examType: "JEE",
        subject: "Physics",
      },
      instituteId,
      limit: 2,
      sort: {
        field: "usedCount",
      },
    });

    assert.deepEqual(
      firstPage.questions.map((question) => question.questionId),
      ["q_build_54_2", "q_build_54_1"],
    );
    assert.deepEqual(
      firstPage.questions.map((question) => question.primaryTag),
      [
        "kinematics",
        "kinematics",
      ],
    );
    assert.deepEqual(firstPage.nextCursor, {
      questionId: "q_build_54_1",
      sortField: "usedCount",
      sortValue: 4,
    });

    const secondPage = await questionSearchQueryService.searchQuestions({
      actorRole: "admin",
      cursor: firstPage.nextCursor ?? undefined,
      filter: {
        examType: "JEE",
        subject: "Physics",
      },
      instituteId,
      limit: 2,
      sort: {
        field: "usedCount",
      },
    });

    assert.deepEqual(
      secondPage.questions.map((question) => question.questionId),
      ["q_build_54_5", "q_build_54_3"],
    );
    assert.equal(secondPage.nextCursor, null);
  },
);
