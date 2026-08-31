import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {
  computeSubmissionMetrics,
  submissionService,
  SubmissionService,
  SubmissionValidationError,
} from "../services/submission";
import {answerBatchService} from "../services/answerBatch";
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
const ACADEMIC_YEAR_PATH =
  `institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}`;
const SESSION_ROOT_PATH =
  `institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/` +
  `runs/${RUN_ID}/sessions`;

test("computeSubmissionMetrics treats an explicit clear as unanswered", () => {
  const metrics = computeSubmissionMetrics({
    answerMap: {
      q_clear: {
        response: {kind: "unanswered"},
        selectedOption: null,
        timeSpentSeconds: 30,
      },
    },
    examMode: "Operational",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: ["q_clear"],
    questionMetaById: {
      q_clear: {
        correctAnswer: "A",
        difficulty: "Easy",
        marks: 1,
        negativeMarks: 0.25,
      },
    },
    questionTimeMap: {
      q_clear: {cumulativeTimeSpent: 30, maxTime: 60, minTime: 10},
    },
  });

  assert.equal(metrics.easyAttemptRatePercent, 0);
  assert.equal(metrics.rawScorePercent, 0);
});

test("computeSubmissionMetrics scores canonical numeric and matrix responses", () => {
  const metrics = computeSubmissionMetrics({
    answerMap: {
      q_numeric: {
        response: {kind: "numeric", value: "1"},
        selectedOption: "1",
      },
      q_matrix: {
        response: {kind: "matrix", selections: [
          {column: "C1", row: "R1"},
          {column: "C2", row: "R2"},
        ]},
        selectedOption: "R1::C1|R2::C2",
      },
    },
    examMode: "Operational",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: ["q_numeric", "q_matrix"],
    questionMetaById: {
      q_numeric: {
        correctAnswer: "1.00",
        difficulty: "Easy",
        marks: 1,
        negativeMarks: 0.25,
      },
      q_matrix: {
        correctAnswer: "R2::C2|R1::C1",
        difficulty: "Medium",
        marks: 1,
        negativeMarks: 0.25,
      },
    },
    questionTimeMap: {
      q_numeric: {cumulativeTimeSpent: 30, maxTime: 60, minTime: 10},
      q_matrix: {cumulativeTimeSpent: 30, maxTime: 60, minTime: 10},
    },
  });

  assert.equal(metrics.accuracyPercent, 100);
  assert.equal(metrics.rawScorePercent, 100);
});

const deleteIfPresent = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    await reference.delete();
  }
};

const seedQuestion = async (
  questionId: string,
  difficulty: "Easy" | "Medium" | "Hard",
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
      difficulty,
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
  await firestore.doc(ACADEMIC_YEAR_PATH).set({
    status: "active",
  });
  await firestore
    .doc(`institutes/${INSTITUTE_ID}/academicYears/${YEAR_ID}/runs/${RUN_ID}`)
    .set({
      calibrationVersion: "cal_v2026_04",
      endWindow: Timestamp.fromMillis(Date.now() + 3_600_000),
      mode: "Controlled",
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      questionIds: ["q36_1", "q36_2", "q36_3"],
      recipientStudentIds: [STUDENT_ID],
      riskModelVersion: "risk_v3",
      runId: RUN_ID,
      startWindow: Timestamp.fromMillis(Date.now() - 3_600_000),
      status: "scheduled",
      testId: "test_build_36",
      templateVersion: "5",
      timingProfileSnapshot: {
        easy: {max: 90, min: 30},
        hard: {max: 180, min: 60},
        medium: {max: 120, min: 45},
      },
    });
};

const seedSession = async (
  sessionId: string,
  status: "active" | "created" | "expired" | "submitted",
  submissionLock: boolean,
  mode = "Controlled",
  deadlineOffsetMs = 60_000,
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
    calibrationVersion: "cal_v2026_04",
    createdAt: Timestamp.fromMillis(nowMillis - 120_000),
    deadlineAt: Timestamp.fromMillis(nowMillis + deadlineOffsetMs),
    instituteId: INSTITUTE_ID,
    mode,
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
    riskModelVersion: "risk_v3",
    sessionId,
    startedAt: Timestamp.fromMillis(nowMillis - 100_000),
    status,
    studentId: STUDENT_ID,
    studentUid: "uid_build_36",
    submissionLock,
    submissionReason: status === "submitted" ? "manual" : null,
    submittedAt: status === "submitted" ?
      Timestamp.fromMillis(nowMillis - 5000) :
      null,
    templateVersion: "5",
    updatedAt: Timestamp.fromMillis(nowMillis - 3000),
    version: 1,
    yearId: YEAR_ID,
    ...(status === "submitted" ? {
      accuracyPercent: 50,
      consecutiveWrongStreakMax: 1,
      disciplineIndex: 80,
      easyRemainingAfterPhase1Percent: 0,
      guessRate: 10,
      hardInPhase1Percent: 0,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 33.33,
      phaseAdherencePercent: 100,
      rawScorePercent: 62.5,
      riskState: "Stable",
      skipBurstCount: 0,
    } : {}),
  });
};

test.before(async () => {
  await seedQuestion("q36_1", "Easy", 4, 1, "A");
  await seedQuestion("q36_2", "Hard", 4, 1, "C");
  await seedQuestion("q36_3", "Easy", 4, 1, "B");
  await seedRun();
});

test.after(async () => {
  const sessionIds = [
    "session_build_36_success",
    "session_build_36_idempotent",
    "session_build_36_idempotent_no_recompute",
    "session_build_36_parallel_lock",
    "session_build_36_locked",
    "session_build_36_hard_timing_rejected",
    "session_build_36_not_active",
    "session_build_36_expiry",
    "session_build_36_expiry_too_early",
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
    deleteIfPresent(ACADEMIC_YEAR_PATH),
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
    reason: "manual",
    runId: RUN_ID,
    sessionId,
    studentId: STUDENT_ID,
    yearId: YEAR_ID,
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.rawScorePercent, 25);
  assert.equal(result.accuracyPercent, 50);
  assert.equal(result.riskState, "Impulsive");
  assert.equal(result.status, "submitted");
  assert.equal(result.submissionReason, "manual");
  assert.equal(Date.parse(result.submittedAt) > 0, true);

  const snapshot = await firestore.doc(sessionPath).get();
  const data = snapshot.data();
  assert.equal(data?.status, "submitted");
  assert.equal(data?.submissionLock, false);
  assert.ok(data?.submittedAt instanceof Timestamp);
  assert.equal(data?.submissionReason, "manual");
  assert.equal(data?.calibrationVersion, "cal_v2026_04");
  assert.equal(data?.riskModelVersion, "risk_v3");
  assert.equal(data?.templateVersion, "5");
  assert.equal(data?.rawScorePercent, result.rawScorePercent);
  assert.equal(data?.accuracyPercent, result.accuracyPercent);
  assert.deepEqual(data?.submissionTimingValidation, {
    maxTimeViolationQuestionIds: [],
    minTimeViolationQuestionIds: ["q36_1", "q36_2"],
    mode: "controlled",
    serverValidated: true,
  });
  assert.equal(data?.easyRemainingAfterPhase1Percent, 0);
  assert.equal(data?.hardInPhase1Percent, 0);
  assert.equal(data?.consecutiveWrongStreakMax, 1);
  assert.equal(data?.skipBurstCount, 0);

  const answerMapAtSubmission = data?.answerMap;
  await assert.rejects(
    answerBatchService.persistIncrementalAnswers({
      answers: [{
        clientRevision: 999,
        clientTimestamp: Date.now(),
        questionId: "q36_1",
        response: {kind: "mcq", optionId: "B"},
        timeSpentSeconds: 50,
      }],
      batchId: "post-submit-write",
      batchSequence: 999,
      context: {
        instituteId: INSTITUTE_ID,
        runId: RUN_ID,
        sessionId,
        studentId: STUDENT_ID,
        yearId: YEAR_ID,
      },
      flushReason: "submission",
      millisecondsSinceLastWrite: 5_000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionValidationError || error instanceof Error);
      assert.equal((error as {code?: string}).code, "SESSION_LOCKED");
      return true;
    },
  );
  const afterWriteAttempt = await firestore.doc(sessionPath).get();
  assert.deepEqual(afterWriteAttempt.data()?.answerMap, answerMapAtSubmission);

  await deleteIfPresent(sessionPath);
});

test(
  "submitSession rejects Hard mode submissions with server-invalid timing",
  async () => {
    const sessionId = "session_build_36_hard_timing_rejected";
    const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

    await deleteIfPresent(sessionPath);
    await seedSession(sessionId, "active", false, "Hard");

    await assert.rejects(
      submissionService.submitSession({
        instituteId: INSTITUTE_ID,
        reason: "manual",
        runId: RUN_ID,
        sessionId,
        studentId: STUDENT_ID,
        yearId: YEAR_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SubmissionValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /MinTime\/MaxTime/);
        return true;
      },
    );

    const snapshot = await firestore.doc(sessionPath).get();
    const data = snapshot.data();
    assert.equal(data?.status, "active");
    assert.equal(data?.submissionLock, false);
    assert.equal(data?.submissionTimingValidation, undefined);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "submitSession returns existing result for submitted session",
  async () => {
    const sessionId = "session_build_36_idempotent";
    const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

    await deleteIfPresent(sessionPath);
    await seedSession(sessionId, "submitted", false);

    const result = await submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      reason: "manual",
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    });

    assert.equal(result.idempotent, true);
    assert.equal(result.rawScorePercent, 62.5);
    assert.equal(result.disciplineIndex, 80);
    assert.equal(result.status, "submitted");
    assert.equal(result.submissionReason, "manual");
    assert.equal(result.submittedAt, (await firestore.doc(sessionPath).get())
      .data()?.submittedAt.toDate().toISOString());

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
      reason: "manual",
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

    await seedQuestion("q36_1", "Easy", 4, 1, "A");
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
    new SubmissionService({
      lockPollIntervalMs: 10,
      lockWaitTimeoutMs: 30,
    }).submitSession({
      instituteId: INSTITUTE_ID,
      reason: "manual",
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

test(
  "submitSession converges parallel submissions on the stored authoritative result",
  async () => {
    const sessionId = "session_build_36_parallel_lock";
    const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

    await deleteIfPresent(sessionPath);
    await seedSession(sessionId, "active", false);

    const slowSubmissionService = new SubmissionService({
      lockHoldDurationMs: 250,
    });

    const primarySubmissionPromise = slowSubmissionService
      .submitSession({
        instituteId: INSTITUTE_ID,
        reason: "manual",
        runId: RUN_ID,
        sessionId,
        studentId: STUDENT_ID,
        yearId: YEAR_ID,
      });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const concurrentResult = await submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      reason: "manual",
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    });

    const primaryResult = await primarySubmissionPromise;

    assert.equal(primaryResult.idempotent, false);
    assert.equal(concurrentResult.idempotent, true);
    assert.equal(concurrentResult.submittedAt, primaryResult.submittedAt);
    assert.equal(concurrentResult.rawScorePercent, primaryResult.rawScorePercent);

    const snapshot = await firestore.doc(sessionPath).get();
    const data = snapshot.data();
    assert.equal(data?.status, "submitted");
    assert.equal(data?.submissionLock, false);

    await deleteIfPresent(sessionPath);
  },
);

test("submitSession rejects non-active sessions", async () => {
  const sessionId = "session_build_36_not_active";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "created", false);

  await assert.rejects(
    submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      reason: "manual",
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

test("submitSession derives expiry from the persisted server deadline", async () => {
  const sessionId = "session_build_36_expiry";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "expired", false, "Controlled", -1_000);

  const result = await submissionService.submitSession({
    instituteId: INSTITUTE_ID,
    reason: "manual",
    runId: RUN_ID,
    sessionId,
    studentId: STUDENT_ID,
    yearId: YEAR_ID,
  });

  assert.equal(result.submissionReason, "expiry");
  const snapshot = await firestore.doc(sessionPath).get();
  assert.equal(snapshot.data()?.submissionReason, "expiry");
  assert.equal(snapshot.data()?.status, "submitted");

  await deleteIfPresent(sessionPath);
});

test("submitSession rejects a claimed expiry before the server deadline", async () => {
  const sessionId = "session_build_36_expiry_too_early";
  const sessionPath = `${SESSION_ROOT_PATH}/${sessionId}`;

  await deleteIfPresent(sessionPath);
  await seedSession(sessionId, "active", false, "Controlled", 60_000);

  await assert.rejects(
    submissionService.submitSession({
      instituteId: INSTITUTE_ID,
      reason: "expiry",
      runId: RUN_ID,
      sessionId,
      studentId: STUDENT_ID,
      yearId: YEAR_ID,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionValidationError);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.message, /server deadline/u);
      return true;
    },
  );
  const snapshot = await firestore.doc(sessionPath).get();
  assert.equal(snapshot.data()?.status, "active");
  assert.equal(snapshot.data()?.submissionLock, false);

  await deleteIfPresent(sessionPath);
});
