import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  QuestionAnalyticsEngineResult,
} from "../types/questionAnalyticsEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-42-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface QuestionAnalyticsEngineServiceContract {
  processSubmittedSession: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
  ) => Promise<QuestionAnalyticsEngineResult>;
}

let questionAnalyticsEngineService: QuestionAnalyticsEngineServiceContract;

test.before(async () => {
  const module = await import("../services/questionAnalyticsEngine.js");
  questionAnalyticsEngineService = module.questionAnalyticsEngineService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

const seedQuestionBank = async (
  instituteId: string,
  questionId: string,
  correctAnswer: string,
): Promise<void> => {
  await firestore
    .doc(`institutes/${instituteId}/questionBank/${questionId}`)
    .set({
      chapter: "Motion",
      correctAnswer,
      createdAt: Timestamp.now(),
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
      status: "active",
      subject: "Physics",
      tags: ["kinematics"],
      tutorialVideoLink: null,
      uniqueKey: `uq-${questionId}`,
      usedCount: 0,
      version: 1,
    });
};

test(
  "processSubmittedSession updates per-question analytics aggregates",
  async () => {
    const instituteId = "inst_build_42_success";
    const yearId = "2026";
    const runId = "run_build_42_success";
    const sessionId = "session_build_42_success";
    const q1Path = `institutes/${instituteId}/questionAnalytics/q42_1`;
    const q2Path = `institutes/${instituteId}/questionAnalytics/q42_2`;

    await Promise.all([
      deleteDocumentIfPresent(q1Path),
      deleteDocumentIfPresent(q2Path),
      deleteDocumentIfPresent(`institutes/${instituteId}/questionBank/q42_1`),
      deleteDocumentIfPresent(`institutes/${instituteId}/questionBank/q42_2`),
    ]);

    await Promise.all([
      seedQuestionBank(instituteId, "q42_1", "A"),
      seedQuestionBank(instituteId, "q42_2", "B"),
    ]);

    const submittedAt = Timestamp.fromMillis(Date.now());
    const result = await questionAnalyticsEngineService.processSubmittedSession(
      {
        eventId: "event_build_42_1",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 50,
        answerMap: {
          q42_1: {
            selectedOption: "A",
          },
          q42_2: {
            selectedOption: "C",
          },
        },
        disciplineIndex: 70,
        questionTimeMap: {
          q42_1: {
            cumulativeTimeSpent: 30,
            maxTime: 120,
            minTime: 45,
          },
          q42_2: {
            cumulativeTimeSpent: 140,
            maxTime: 120,
            minTime: 45,
          },
        },
        rawScorePercent: 25,
        riskState: "Impulsive",
        status: "submitted",
        submittedAt,
      },
    );

    assert.equal(result.triggered, true);
    assert.equal(result.idempotent, false);
    assert.deepEqual(result.questionAnalyticsPaths, [q1Path, q2Path]);

    const q1Data = (await firestore.doc(q1Path).get()).data();
    assert.equal(q1Data?.avgRawPercentWhenUsed, 25);
    assert.equal(q1Data?.avgAccuracyWhenUsed, 50);
    assert.equal(q1Data?.correctAttemptCount, 1);
    assert.equal(q1Data?.incorrectAttemptCount, 0);
    assert.equal(q1Data?.averageResponseTimeMs, 30000);
    assert.equal(q1Data?.guessRate, 100);
    assert.equal(q1Data?.overstayRate, 0);
    assert.equal(q1Data?.riskImpactScore, 50);
    assert.equal(q1Data?.disciplineStressIndex, 30);
    assert.equal(
      q1Data?.processingMarkers?.questionAnalyticsEngine
        ?.lastProcessedSessionId,
      sessionId,
    );

    const q2Data = (await firestore.doc(q2Path).get()).data();
    assert.equal(q2Data?.correctAttemptCount, 0);
    assert.equal(q2Data?.incorrectAttemptCount, 1);
    assert.equal(q2Data?.averageResponseTimeMs, 140000);
    assert.equal(q2Data?.guessRate, 0);
    assert.equal(q2Data?.overstayRate, 100);

    await Promise.all([
      deleteDocumentIfPresent(q1Path),
      deleteDocumentIfPresent(q2Path),
      deleteDocumentIfPresent(`institutes/${instituteId}/questionBank/q42_1`),
      deleteDocumentIfPresent(`institutes/${instituteId}/questionBank/q42_2`),
    ]);
  },
);

test(
  "processSubmittedSession stays idempotent for duplicate submitted events",
  async () => {
    const instituteId = "inst_build_42_idempotent";
    const yearId = "2026";
    const runId = "run_build_42_idempotent";
    const sessionId = "session_build_42_idempotent";
    const questionPath =
      `institutes/${instituteId}/questionAnalytics/q42_idempotent`;

    await Promise.all([
      deleteDocumentIfPresent(questionPath),
      deleteDocumentIfPresent(
        `institutes/${instituteId}/questionBank/q42_idempotent`,
      ),
    ]);

    await seedQuestionBank(instituteId, "q42_idempotent", "D");

    const payload = {
      accuracyPercent: 100,
      answerMap: {
        q42_idempotent: {
          selectedOption: "D",
        },
      },
      disciplineIndex: 92,
      questionTimeMap: {
        q42_idempotent: {
          cumulativeTimeSpent: 75,
          maxTime: 120,
          minTime: 45,
        },
      },
      rawScorePercent: 100,
      riskState: "Stable",
      status: "submitted",
      submittedAt: Timestamp.fromMillis(Date.now()),
    };

    const firstResult = await questionAnalyticsEngineService
      .processSubmittedSession(
        {
          eventId: "event_build_42_idempotent",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        payload,
      );

    assert.equal(firstResult.triggered, true);

    const secondResult = await questionAnalyticsEngineService
      .processSubmittedSession(
        {
          eventId: "event_build_42_idempotent",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        payload,
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const questionData = (await firestore.doc(questionPath).get()).data();
    assert.equal(questionData?.correctAttemptCount, 1);
    assert.equal(questionData?.avgRawPercentWhenUsed, 100);

    await Promise.all([
      deleteDocumentIfPresent(questionPath),
      deleteDocumentIfPresent(
        `institutes/${instituteId}/questionBank/q42_idempotent`,
      ),
    ]);
  },
);

test(
  "processSubmittedSession skips when submitted transition did not occur",
  async () => {
    const result = await questionAnalyticsEngineService.processSubmittedSession(
      {
        eventId: "event_build_42_skip",
        instituteId: "inst_build_42_skip",
        runId: "run_build_42_skip",
        sessionId: "session_build_42_skip",
        yearId: "2026",
      },
      {
        status: "submitted",
      },
      {
        status: "submitted",
      },
    );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "status_not_transitioned");
    assert.deepEqual(result.questionAnalyticsPaths, []);
  },
);
