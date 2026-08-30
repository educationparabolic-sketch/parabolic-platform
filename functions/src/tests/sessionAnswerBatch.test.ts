import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {answerBatchService} from "../services/answerBatch";
import {SessionStartValidationError} from "../services/session";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-30-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const seedSession = async (
  sessionPath: string,
  status = "active",
  mode = "Operational",
): Promise<void> => {
  const nowMillis = Date.now();
  const sessionStartMillis = nowMillis - 120_000;
  const pathSegments = sessionPath.split("/");
  const sessionId = pathSegments[pathSegments.length - 1] ?? "session_build_30";

  await firestore.doc(sessionPath).set({
    answerMap: {
      q01: {
        clientTimestamp: sessionStartMillis + 15_000,
        response: {kind: "mcq", optionId: "A"},
        selectedOption: "A",
        timeSpentSeconds: 12,
      },
    },
    createdAt: Timestamp.fromMillis(sessionStartMillis),
    instituteId: "inst_build_30",
    mode,
    questionTimeMap: {
      q01: {
        cumulativeTimeSpent: 12,
        enteredAt: sessionStartMillis + 3000,
        exitedAt: sessionStartMillis + 15_000,
        lastEntryTimestamp: sessionStartMillis + 3000,
        maxTime: 60,
        minTime: 30,
      },
      q02: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 60,
        minTime: 30,
      },
      q03: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 150,
        minTime: 60,
      },
      q04: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 60,
        minTime: 0,
      },
      q05: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 60,
        minTime: 0,
      },
    },
    runId: "run_build_30",
    runtimeSnapshot: {
      questions: [
        {id: "q01", matrixColumns: [], matrixRows: [], options: [
          {id: "A", label: "A", text: "A"},
          {id: "B", label: "B", text: "B"},
          {id: "C", label: "C", text: "C"},
          {id: "D", label: "D", text: "D"},
        ], type: "mcq"},
        {id: "q02", matrixColumns: [], matrixRows: [], options: [
          {id: "A", label: "A", text: "A"},
          {id: "B", label: "B", text: "B"},
          {id: "C", label: "C", text: "C"},
          {id: "D", label: "D", text: "D"},
        ], type: "mcq"},
        {id: "q03", matrixColumns: [], matrixRows: [], options: [
          {id: "A", label: "A", text: "A"},
          {id: "B", label: "B", text: "B"},
          {id: "C", label: "C", text: "C"},
          {id: "D", label: "D", text: "D"},
        ], type: "mcq"},
        {id: "q04", matrixColumns: [], matrixRows: [], options: [], type: "numeric"},
        {id: "q05", matrixColumns: ["C1", "C2"], matrixRows: ["R1", "R2"], options: [], type: "matrix"},
      ],
    },
    sessionId,
    deadlineAt: Timestamp.fromMillis(nowMillis + 60 * 60 * 1000),
    startedAt: Timestamp.fromMillis(sessionStartMillis),
    status,
    studentId: "student_build_30",
    studentUid: "uid_build_30",
    submissionLock: false,
    submittedAt: null,
    updatedAt: Timestamp.fromMillis(nowMillis),
    version: 1,
    yearId: "2026",
  });
};

const mcqAnswer = (
  questionId: string,
  optionId: string,
  clientTimestamp: number,
  timeSpentSeconds: number,
) => ({
  clientTimestamp,
  questionId,
  response: {kind: "mcq" as const, optionId},
  timeSpentSeconds,
});

const deleteIfPresent = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    await reference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "persistIncrementalAnswers merges only changed answerMap keys",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_merge";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "C", nowMillis, 20),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_merge",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.deepEqual(result.persistedQuestionIds, ["q02"]);
    assert.deepEqual(result.ignoredQuestionIds, []);
    assert.equal(result.timingMetricsExport.averageTimePerQuestion, 20);
    assert.equal(result.timingMetricsExport.minTimeViolationPercent, 0);
    assert.equal(result.timingMetricsExport.maxTimeViolationPercent, 0);
    assert.equal(
      result.timingMetricsExport.serverValidatedTimingMetrics
        .evaluatedQuestionCount,
      1,
    );

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, {
      selectedOption: string;
      timeSpentSeconds: number;
      clientTimestamp: number;
    }>;
    const questionTimeMap = snapshot.data()?.questionTimeMap as Record<string, {
      cumulativeTimeSpent: number;
      enteredAt: number | null;
      exitedAt: number | null;
      lastEntryTimestamp: number | null;
      minTime: number;
      maxTime: number;
    }>;

    assert.equal(answerMap.q01.selectedOption, "A");
    assert.equal(answerMap.q02.selectedOption, "C");
    assert.equal(answerMap.q02.timeSpentSeconds, 20);
    assert.equal(questionTimeMap.q02.cumulativeTimeSpent, 20);
    assert.equal(questionTimeMap.q02.exitedAt, nowMillis);
    assert.equal(questionTimeMap.q02.enteredAt, nowMillis - 20_000);
    assert.equal(
      questionTimeMap.q02.lastEntryTimestamp,
      nowMillis - 20_000,
    );

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers stores adaptive phase snapshot incrementally",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_phase_snapshot";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Controlled");

    const result = await answerBatchService.persistIncrementalAnswers({
      adaptivePhaseSnapshot: {
        answeredPercent: 44.4,
        currentPhase: "phase2",
        difficultyCompliancePercent: 82.5,
        disciplineIndex: 76.2,
        elapsedPercent: 50,
        overspendPercent: 5.6,
        phaseAdherencePercent: 94.4,
        skipPatternScore: 88,
      },
      answers: [
        mcqAnswer("q02", "B", nowMillis, 35),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_phase_snapshot",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(result.adaptivePhaseSnapshotPersisted, true);

    const snapshot = await firestore.doc(sessionPath).get();
    const adaptivePhaseSnapshot = snapshot.data()?.adaptivePhaseSnapshot as {
      answeredPercent: number;
      currentPhase: string;
      difficultyCompliancePercent: number;
      disciplineIndex: number;
      elapsedPercent: number;
      overspendPercent: number;
      phaseAdherencePercent: number;
      skipPatternScore: number;
      updatedAt: Timestamp;
    };

    assert.equal(adaptivePhaseSnapshot.currentPhase, "phase2");
    assert.equal(adaptivePhaseSnapshot.phaseAdherencePercent, 94.4);
    assert.equal(adaptivePhaseSnapshot.overspendPercent, 5.6);
    assert.equal(adaptivePhaseSnapshot.difficultyCompliancePercent, 82.5);
    assert.equal(adaptivePhaseSnapshot.skipPatternScore, 88);
    assert.ok(adaptivePhaseSnapshot.updatedAt);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers ignores stale writes by clientTimestamp",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_conflict";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q01", "D", nowMillis - 180_000, 70),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_conflict",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.deepEqual(result.persistedQuestionIds, []);
    assert.deepEqual(result.ignoredQuestionIds, ["q01"]);

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, {
      selectedOption: string;
      clientTimestamp: number;
    }>;
    const questionTimeMap = snapshot.data()?.questionTimeMap as Record<string, {
      cumulativeTimeSpent: number;
      exitedAt: number | null;
    }>;

    assert.equal(answerMap.q01.selectedOption, "A");
    assert.equal(questionTimeMap.q01.cumulativeTimeSpent, 12);
    assert.ok(typeof questionTimeMap.q01.exitedAt === "number");

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers rejects requests below minimum write interval",
  async () => {
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_interval";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    await assert.rejects(
      answerBatchService.persistIncrementalAnswers({
        answers: [
          mcqAnswer("q03", "B", 2000, 30),
        ],
        context: {
          instituteId: "inst_build_30",
          runId: "run_build_30",
          sessionId: "session_build_30_interval",
          studentId: "student_build_30",
          yearId: "2026",
        },
        millisecondsSinceLastWrite: 4999,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /minimum write interval is 5000ms/i);
        return true;
      },
    );

    await deleteIfPresent(sessionPath);
  },
);

test(
  "submission and reconnect drains bypass the interval and acknowledge exact client revisions",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_drain";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);
    const answer = {
      ...mcqAnswer("q02", "B", nowMillis, 20),
      clientRevision: 41,
    };

    const firstResult = await answerBatchService.persistIncrementalAnswers({
      answers: [answer],
      batchId: "session_build_30_drain:student_build_30:7",
      batchSequence: 7,
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_drain",
        studentId: "student_build_30",
        yearId: "2026",
      },
      flushReason: "submission",
      millisecondsSinceLastWrite: 0,
    });

    assert.equal(firstResult.batchId, "session_build_30_drain:student_build_30:7");
    assert.equal(firstResult.batchSequence, 7);
    assert.deepEqual(firstResult.acknowledgements, [{
      clientRevision: 41,
      disposition: "persisted",
      questionId: "q02",
    }]);

    const replayResult = await answerBatchService.persistIncrementalAnswers({
      answers: [answer],
      batchId: "session_build_30_drain:student_build_30:8",
      batchSequence: 8,
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_drain",
        studentId: "student_build_30",
        yearId: "2026",
      },
      flushReason: "reconnect",
      millisecondsSinceLastWrite: 0,
    });

    assert.deepEqual(replayResult.persistedQuestionIds, []);
    assert.deepEqual(replayResult.acknowledgements, [{
      clientRevision: 41,
      disposition: "ignored",
      questionId: "q02",
    }]);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers keeps timing cumulative idempotent " +
    "for replayed timestamps",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_replay";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const firstResult = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q03", "A", nowMillis, 15),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_replay",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    const secondResult = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q03", "A", nowMillis, 15),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_replay",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.deepEqual(firstResult.persistedQuestionIds, ["q03"]);
    assert.deepEqual(secondResult.persistedQuestionIds, []);
    assert.deepEqual(secondResult.ignoredQuestionIds, ["q03"]);
    const snapshot = await firestore.doc(sessionPath).get();
    const questionTimeMap = snapshot.data()?.questionTimeMap as Record<string, {
      cumulativeTimeSpent: number;
      enteredAt: number | null;
      exitedAt: number | null;
      lastEntryTimestamp: number | null;
    }>;

    assert.equal(questionTimeMap.q03.cumulativeTimeSpent, 15);
    assert.equal(questionTimeMap.q03.exitedAt, nowMillis);
    assert.equal(questionTimeMap.q03.enteredAt, nowMillis - 15_000);
    assert.equal(
      questionTimeMap.q03.lastEntryTimestamp,
      nowMillis - 15_000,
    );

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers does not inflate absolute time on a newer save",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_absolute_replay";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    await answerBatchService.persistIncrementalAnswers({
      answers: [mcqAnswer("q03", "A", nowMillis - 1000, 15)],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_absolute_replay",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    await answerBatchService.persistIncrementalAnswers({
      answers: [mcqAnswer("q03", "B", nowMillis, 15)],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_absolute_replay",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    const snapshot = await firestore.doc(sessionPath).get();
    assert.equal(snapshot.data()?.questionTimeMap.q03.cumulativeTimeSpent, 15);
    assert.equal(snapshot.data()?.answerMap.q03.selectedOption, "B");

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers stores an explicit clear without timing inflation",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_clear";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    await answerBatchService.persistIncrementalAnswers({
      answers: [mcqAnswer("q02", "C", nowMillis - 1000, 30)],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_clear",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });
    await answerBatchService.persistIncrementalAnswers({
      answers: [{
        clientTimestamp: nowMillis,
        questionId: "q02",
        response: {kind: "unanswered"},
        timeSpentSeconds: 30,
      }],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_clear",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    const snapshot = await firestore.doc(sessionPath).get();
    assert.deepEqual(snapshot.data()?.answerMap.q02.response, {kind: "unanswered"});
    assert.equal(snapshot.data()?.answerMap.q02.selectedOption, null);
    assert.equal(snapshot.data()?.questionTimeMap.q02.cumulativeTimeSpent, 30);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers validates and canonicalizes numeric and matrix responses",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_typed_responses";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [{
        clientTimestamp: nowMillis,
        questionId: "q04",
        response: {kind: "numeric", value: "1.00"},
        timeSpentSeconds: 10,
      }, {
        clientTimestamp: nowMillis,
        questionId: "q05",
        response: {
          kind: "matrix",
          selections: [
            {column: "C2", row: "R2"},
            {column: "C1", row: "R1"},
          ],
        },
        timeSpentSeconds: 20,
      }],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_30_typed_responses",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.deepEqual(result.persistedQuestionIds, ["q04", "q05"]);
    const snapshot = await firestore.doc(sessionPath).get();
    assert.deepEqual(snapshot.data()?.answerMap.q04.response, {
      kind: "numeric",
      value: "1",
    });
    assert.deepEqual(snapshot.data()?.answerMap.q05.response.selections, [
      {column: "C1", row: "R1"},
      {column: "C2", row: "R2"},
    ]);
    assert.equal(snapshot.data()?.answerMap.q05.selectedOption, "R1::C1|R2::C2");

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers rejects invalid MCQ, numeric, matrix, and conflicting writes",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_invalid_responses";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const context = {
      instituteId: "inst_build_30",
      runId: "run_build_30",
      sessionId: "session_build_30_invalid_responses",
      studentId: "student_build_30",
      yearId: "2026",
    };
    const invalidAnswers = [
      mcqAnswer("q02", "UNKNOWN", nowMillis, 30),
      {
        clientTimestamp: nowMillis,
        questionId: "q04",
        response: {kind: "numeric" as const, value: "not-a-number"},
        timeSpentSeconds: 10,
      },
      {
        clientTimestamp: nowMillis,
        questionId: "q05",
        response: {
          kind: "matrix" as const,
          selections: [{column: "UNKNOWN", row: "R1"}],
        },
        timeSpentSeconds: 10,
      },
    ];

    for (const invalidAnswer of invalidAnswers) {
      await assert.rejects(
        answerBatchService.persistIncrementalAnswers({
          answers: [invalidAnswer],
          context,
          millisecondsSinceLastWrite: 5000,
        }),
        (error: unknown) => {
          assert.ok(error instanceof SessionStartValidationError);
          assert.equal(error.code, "VALIDATION_ERROR");
          return true;
        },
      );
    }

    await answerBatchService.persistIncrementalAnswers({
      answers: [mcqAnswer("q02", "A", nowMillis, 30)],
      context,
      millisecondsSinceLastWrite: 5000,
    });
    await assert.rejects(
      answerBatchService.persistIncrementalAnswers({
        answers: [mcqAnswer("q02", "B", nowMillis, 30)],
        context,
        millisecondsSinceLastWrite: 5000,
      }),
      /conflicting answer write timestamp/i,
    );

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers rejects future client timestamps",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_38_future_timestamp";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    await assert.rejects(
      answerBatchService.persistIncrementalAnswers({
        answers: [
          mcqAnswer("q02", "B", nowMillis + 60_000, 20),
        ],
        context: {
          instituteId: "inst_build_30",
          runId: "run_build_30",
          sessionId: "session_build_38_future_timestamp",
          studentId: "student_build_30",
          yearId: "2026",
        },
        millisecondsSinceLastWrite: 5000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /timestamp cannot be in the future/i);
        return true;
      },
    );

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, unknown>;
    assert.equal(answerMap.q02, undefined);
    assert.equal(snapshot.data()?.timingTamperValidation, undefined);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers rejects projected cumulative time tampering",
  async () => {
    const nowMillis = Date.now();
    const sessionStartMillis = nowMillis - 120_000;
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_38_cumulative_tamper";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    await assert.rejects(
      answerBatchService.persistIncrementalAnswers({
        answers: [
          mcqAnswer("q02", "C", sessionStartMillis + 20_000, 20),
        ],
        context: {
          instituteId: "inst_build_30",
          runId: "run_build_30",
          sessionId: "session_build_38_cumulative_tamper",
          studentId: "student_build_30",
          yearId: "2026",
        },
        millisecondsSinceLastWrite: 5000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(
          error.message,
          /projected question time exceeds elapsed session duration/i,
        );
        return true;
      },
    );

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, unknown>;
    assert.equal(answerMap.q02, undefined);
    assert.equal(snapshot.data()?.timingTamperValidation, undefined);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers tracks min-time violations in Diagnostic mode",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_33_min_time_diagnostic";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Diagnostic");

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "C", nowMillis, 20),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_33_min_time_diagnostic",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(result.minTimeEnforcementLevel, "track_only");
    assert.deepEqual(result.blockedQuestionIds, []);
    assert.equal(result.minTimeViolations.length, 1);
    assert.equal(result.minTimeViolations[0]?.questionId, "q02");
    assert.equal(result.minTimeViolations[0]?.remainingTime, 10);
    assert.equal(result.minTimeViolations[0]?.warningMessage, null);
    assert.deepEqual(result.persistedQuestionIds, ["q02"]);
    assert.equal(result.timingMetricsExport.minTimeViolationCount, 1);
    assert.equal(result.timingMetricsExport.minTimeViolationPercent, 100);
    assert.equal(result.timingMetricsExport.maxTimeViolationPercent, 0);
    assert.equal(
      result.timingMetricsExport.disciplineIndexInputs
        .impulsiveAnsweringRiskPercent,
      100,
    );
    assert.equal(result.timingMetricsExport.averageTimePerQuestion, 20);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers returns soft min-time warnings in Controlled mode",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_33_min_time_controlled";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Controlled");

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "B", nowMillis, 5),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_33_min_time_controlled",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(result.minTimeEnforcementLevel, "soft");
    assert.deepEqual(result.blockedQuestionIds, []);
    assert.equal(result.minTimeViolations.length, 1);
    assert.equal(result.minTimeViolations[0]?.questionId, "q02");
    assert.equal(result.minTimeViolations[0]?.remainingTime, 25);
    assert.match(
      String(result.minTimeViolations[0]?.warningMessage ?? ""),
      /minimum recommended time not reached/i,
    );
    assert.deepEqual(result.persistedQuestionIds, ["q02"]);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers rejects min-time violations in Hard mode",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_33_min_time_hard";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Hard");

    await assert.rejects(
      answerBatchService.persistIncrementalAnswers({
        answers: [
          mcqAnswer("q02", "D", nowMillis, 10),
        ],
        context: {
          instituteId: "inst_build_30",
          runId: "run_build_30",
          sessionId: "session_build_33_min_time_hard",
          studentId: "student_build_30",
          yearId: "2026",
        },
        millisecondsSinceLastWrite: 5000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /minimum required time not reached/i);
        return true;
      },
    );

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, {
      selectedOption: string;
    }>;
    assert.equal(answerMap.q02, undefined);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers tracks max-time violations in Diagnostic mode",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_34_max_time_diagnostic";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Diagnostic");

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "C", nowMillis, 65),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_34_max_time_diagnostic",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(result.maxTimeEnforcementLevel, "track_only");
    assert.equal(result.maxTimeViolations.length, 1);
    assert.equal(result.maxTimeViolations[0]?.questionId, "q02");
    assert.equal(result.maxTimeViolations[0]?.maxTime, 60);
    assert.equal(result.maxTimeViolations[0]?.exceededBy, 5);
    assert.equal(result.maxTimeViolations[0]?.questionLocked, false);
    assert.equal(result.maxTimeViolations[0]?.warningMessage, null);
    assert.deepEqual(result.lockedQuestionIds, []);
    assert.deepEqual(result.persistedQuestionIds, ["q02"]);
    assert.equal(result.timingMetricsExport.maxTimeViolationCount, 1);
    assert.equal(result.timingMetricsExport.maxTimeViolationPercent, 100);
    assert.equal(result.timingMetricsExport.minTimeViolationPercent, 0);
    assert.equal(
      result.timingMetricsExport.disciplineIndexInputs
        .overthinkingRiskPercent,
      100,
    );
    assert.equal(result.timingMetricsExport.averageTimePerQuestion, 65);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers returns max-time advisory warnings " +
    "in Controlled mode",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_34_max_time_controlled";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Controlled");

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "B", nowMillis, 70),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_34_max_time_controlled",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(result.maxTimeEnforcementLevel, "advisory");
    assert.equal(result.maxTimeViolations.length, 1);
    assert.equal(result.maxTimeViolations[0]?.questionId, "q02");
    assert.equal(result.maxTimeViolations[0]?.exceededBy, 10);
    assert.equal(result.maxTimeViolations[0]?.questionLocked, false);
    assert.match(
      String(result.maxTimeViolations[0]?.warningMessage ?? ""),
      /maximum recommended time exceeded/i,
    );
    assert.deepEqual(result.lockedQuestionIds, []);
    assert.deepEqual(result.persistedQuestionIds, ["q02"]);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers locks hard-mode questions at max-time threshold",
  async () => {
    const nowMillis = Date.now();
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_34_max_time_hard";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath, "active", "Hard");

    const firstResult = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "A", nowMillis, 60),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_34_max_time_hard",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.equal(firstResult.maxTimeEnforcementLevel, "strict");
    assert.equal(firstResult.maxTimeViolations.length, 1);
    assert.equal(firstResult.maxTimeViolations[0]?.questionId, "q02");
    assert.equal(firstResult.maxTimeViolations[0]?.questionLocked, true);
    assert.equal(firstResult.maxTimeViolations[0]?.exceededBy, 0);
    assert.deepEqual(firstResult.lockedQuestionIds, ["q02"]);
    assert.deepEqual(firstResult.persistedQuestionIds, ["q02"]);

    const secondResult = await answerBatchService.persistIncrementalAnswers({
      answers: [
        mcqAnswer("q02", "D", nowMillis + 60_000, 5),
      ],
      context: {
        instituteId: "inst_build_30",
        runId: "run_build_30",
        sessionId: "session_build_34_max_time_hard",
        studentId: "student_build_30",
        yearId: "2026",
      },
      millisecondsSinceLastWrite: 5000,
    });

    assert.deepEqual(secondResult.persistedQuestionIds, []);
    assert.deepEqual(secondResult.blockedQuestionIds, ["q02"]);
    assert.deepEqual(secondResult.lockedQuestionIds, ["q02"]);
    assert.equal(
      secondResult.timingMetricsExport.serverValidatedTimingMetrics
        .evaluatedQuestionCount,
      0,
    );
    assert.equal(secondResult.timingMetricsExport.averageTimePerQuestion, 0);

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, {
      selectedOption: string;
      timeSpentSeconds: number;
    }>;

    assert.equal(answerMap.q02?.selectedOption, "A");
    assert.equal(answerMap.q02?.timeSpentSeconds, 60);

    await deleteIfPresent(sessionPath);
  },
);
