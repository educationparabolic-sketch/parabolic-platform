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
): Promise<void> => {
  const nowMillis = Date.now();
  const sessionStartMillis = nowMillis - 120_000;
  const pathSegments = sessionPath.split("/");
  const sessionId = pathSegments[pathSegments.length - 1] ?? "session_build_30";

  await firestore.doc(sessionPath).set({
    answerMap: {
      q01: {
        clientTimestamp: sessionStartMillis + 15_000,
        selectedOption: "A",
        timeSpent: 12,
      },
    },
    createdAt: Timestamp.fromMillis(sessionStartMillis),
    instituteId: "inst_build_30",
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
    },
    runId: "run_build_30",
    sessionId,
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
        {
          clientTimestamp: nowMillis,
          questionId: "q02",
          selectedOption: "C",
          timeSpent: 20,
        },
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

    const snapshot = await firestore.doc(sessionPath).get();
    const answerMap = snapshot.data()?.answerMap as Record<string, {
      selectedOption: string;
      timeSpent: number;
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
    assert.equal(answerMap.q02.timeSpent, 20);
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
        {
          clientTimestamp: nowMillis - 180_000,
          questionId: "q01",
          selectedOption: "D",
          timeSpent: 70,
        },
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
          {
            clientTimestamp: 2000,
            questionId: "q03",
            selectedOption: "B",
            timeSpent: 30,
          },
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
        {
          clientTimestamp: nowMillis,
          questionId: "q03",
          selectedOption: "A",
          timeSpent: 15,
        },
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
        {
          clientTimestamp: nowMillis,
          questionId: "q03",
          selectedOption: "A",
          timeSpent: 15,
        },
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
    assert.deepEqual(secondResult.persistedQuestionIds, ["q03"]);
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
