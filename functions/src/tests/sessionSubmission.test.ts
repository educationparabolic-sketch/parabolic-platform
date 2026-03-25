import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {
  submissionService,
  SubmissionValidationError,
} from "../services/submission";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-36-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const INSTITUTE_ID = "inst_build_36";
const YEAR_ID = "2026";
const RUN_ID = "run_build_36";
const STUDENT_ID = "student_build_36";
const SESSION_ROOT_PATH =
  `institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/` +
  `runs/${RUN_ID}/sessions`;

const deleteIfPresent = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    await reference.delete();
  }
};

const seedQuestion = async (
  questionId: string,
  marks: number,
  negativeMarks: number,
  correctAnswer: string,
): Promise<void> => {
  await firestore
    .doc(`institutes/${INSTITUTE_ID}/questionBank/${questionId}`)
    .set({
      chapter: "Algebra",
      correctAnswer,
      createdAt: Timestamp.now(),
      difficulty: "Medium",
      examType: "JEE",
      marks,
      negativeMarks,
      questionId,
      questionImageUrl: "",
      questionType: "mcq",
      solutionImageUrl: "",
      status: "active",
      subject: "Math",
      tags: ["algebra"],
      uniqueKey: `key-${questionId}`,
      usedCount: 0,
      version: 1,
    });
};

const seedRun = async (): Promise<void> => {
  await firestore
    .doc(`institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/runs/${RUN_ID}`)
    .set({
      endWindow: Timestamp.fromMillis(Date.now() + 3_600_000),
      mode: "Controlled",
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      questionIds: ["q36_1", "q36_2", "q36_3"],
      recipientStudentIds: [STUDENT_ID],
      runId: RUN_ID,
      startWindow: Timestamp.fromMillis(Date.now() - 3_600_000),
      status: "scheduled",
      testId: "test_build_36",
      timingProfileSnapshot: {
        easy: {max: 90, min: 30},
        hard: {max: 180, min: 60},
        medium: {max: 120, min: 45},
      },
    });
};

const seedSession = async (
  sessionId: string,
  status: "active" | "created" | "submitted",
  submissionLock: boolean,
): Promise<void> => {
  const nowMillis = Date.now();
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await firestore.doc(sessionPath).set({
    answerMap: {
      q36_1: {
        clientTimestamp: nowMillis - 30_000,
        selectedOption: "A",
        timeSpent: 40,
      },
      q36_2: {
        clientTimestamp: nowMillis - 20_000,
        selectedOption: "B",
        timeSpent: 20,
      },
    },
    createdAt: Timestamp.fromMillis(nowMillis - 120_000),
    instituteId: INSTITUTE_ID,
    mode: "Controlled",
    questionTimeMap: {
      q36_1: {
        cumulativeTimeSpent: 40,
        enteredAt: nowMillis - 70_000,
        exitedAt: nowMillis - 30_000,
        lastEntryTimestamp: nowMillis - 70_000,
        maxTime: 120,
        minTime: 45,
      },
      q36_2: {
        cumulativeTimeSpent: 20,
        enteredAt: nowMillis - 40_000,
        exitedAt: nowMillis - 20_000,
        lastEntryTimestamp: nowMillis - 40_000,
        maxTime: 120,
        minTime: 45,
      },
      q36_3: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 120,
        minTime: 45,
      },
    },
    runId: RUN_ID,
    sessionId,
    startedAt: Timestamp.fromMillis(nowMillis - 100_000),
    status,
    studentId: STUDENT_ID,
    studentUid: "uid_build_36",
    submissionLock,
    submittedAt: status === "submitted" ?
      Timestamp.fromMillis(nowMillis - 5000) :
      null,
    updatedAt: Timestamp.fromMillis(nowMillis - 3000),
    version: 1,
    yearId: YEAR_ID,
    ...(status === "submitted" ? {
      accuracyPercent: 50,
      disciplineIndex: 80,
      guessRate: 10,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 33.33,
      phaseAdherencePercent: 100,
      rawScorePercent: 62.5,
      riskState: "Stable",
    } : {}),
  });
};

test.before(async () => {
  await seedQuestion("q36_1", 4, 1, "A");
  await seedQuestion("q36_2", 4, 1, "C");
  await seedQuestion("q36_3", 4, 1, "B");
  await seedRun();
});

test.after(async () => {
  const sessionIds = [
    "session_build_36_success",
    "session_build_36_idempotent",
    "session_build_36_idempotent_no_recompute",
    "session_build_36_locked",
    "session_build_36_not_active",
  ];

  await Promise.all(sessionIds.map((sessionId) =>
    deleteIfPresent(`${SESSION_ROOT_PATH}/${sessionId}`)
  ));

  await Promise.all([
    deleteIfPresent(`institutes/${INSTITUTE_ID}/questionBank/q36_1`),
    deleteIfPresent(`institutes/${INSTITUTE_ID}/questionBank/q36_2`),
    deleteIfPresent(`institutes/${INSTITUTE_ID}/questionBank/q36_3`),
    deleteIfPresent(
      `institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/runs/${RUN_ID}`,
    ),
  ]);

  await getFirebaseAdminApp().delete();
});

test("submitSession finalizes active session atomically", async () => {
  const sessionId = "session_build_36_success";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "active", false);

  const result = await submissionService.submitSession({
    instituteId: INSTITUTE_ID,
    runId: RUN_ID,
    sessionId,
    studentId: STUDENT_ID,
    yearId: YEAR_ID,
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.rawScorePercent, 25);
  assert.equal(result.accuracyPercent, 50);
  assert.equal(result.riskState, "Impulsive");

  const snapshot = await firestore.doc(sessionPath).get();
  const data = snapshot.data();
  assert.equal(data?.status, "submitted");
  assert.equal(data?.submissionLock, false);
  assert.ok(data?.submittedAt instanceof Timestamp);
  assert.equal(data?.rawScorePercent, result.rawScorePercent);
  assert.equal(data?.accuracyPercent, result.accuracyPercent);

  await deleteIfPresent(sessionPath);
});

test(
  "submitSession returns existing result for submitted session",
  async () => {
    const sessionId = "session_build_36_idempotent";
    const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

    await deleteIfPresent(sessionPath);
    await seedSession(sessionId, "submitted", false);

    const result = await submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    });

    assert.equal(result.idempotent, true);
    assert.equal(result.rawScorePercent, 62.5);
    assert.equal(result.disciplineIndex, 80);

    const snapshot = await firestore.doc(sessionPath).get();
    assert.equal(snapshot.data()?.status, "submitted");

    await deleteIfPresent(sessionPath);
  },
);

test(
  "submitSession idempotent replay does not recompute metrics",
  async () => {
    const sessionId = "session_build_36_idempotent_no_recompute";
    const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

    await deleteIfPresent(sessionPath);
    await seedSession(sessionId, "submitted", false);

    await firestore
      .doc(`institutes/${INSTITUTE_ID}/questionBank/q36_1`)
      .update({
        correctAnswer: "D",
        marks: 99,
      });
    await firestore
      .doc(`institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/runs/${RUN_ID}`)
      .update({
        phaseConfigSnapshot: {
          phase1Percent: 70,
          phase2Percent: 50,
          phase3Percent: 10,
        },
      });

    const result = await submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    });

    assert.equal(result.idempotent, true);
    assert.equal(result.rawScorePercent, 62.5);
    assert.equal(result.accuracyPercent, 50);
    assert.equal(result.disciplineIndex, 80);
    assert.equal(result.riskState, "Stable");

    await seedQuestion("q36_1", 4, 1, "A");
    await seedRun();
    await deleteIfPresent(sessionPath);
  },
);

test("submitSession rejects concurrent submission lock", async () => {
  const sessionId = "session_build_36_locked";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "active", true);

  await assert.rejects(
    submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionValidationError);
      assert.equal(error.code, "SUBMISSION_LOCKED");
      return true;
    },
  );

  const snapshot = await firestore.doc(sessionPath).get();
  assert.equal(snapshot.data()?.status, "active");

  await deleteIfPresent(sessionPath);
});

test("submitSession rejects non-active sessions", async () => {
  const sessionId = "session_build_36_not_active";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "created", false);

  await assert.rejects(
    submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionValidationError);
      assert.equal(error.code, "SESSION_NOT_ACTIVE");
      return true;
    },
  );

  const snapshot = await firestore.doc(sessionPath).get();
  assert.equal(snapshot.data()?.status, "created");

  await deleteIfPresent(sessionPath);
});
