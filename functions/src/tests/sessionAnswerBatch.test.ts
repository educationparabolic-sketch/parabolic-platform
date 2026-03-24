import assert from "node:assert/strict";
import test from "node:test";
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
  const pathSegments = sessionPath.split("/");
  const sessionId = pathSegments[pathSegments.length - 1] ?? "session_build_30";

  await firestore.doc(sessionPath).set({
    answerMap: {
      q01: {
        clientTimestamp: 1000,
        selectedOption: "A",
        timeSpent: 12,
      },
    },
    createdAt: new Date().toISOString(),
    instituteId: "inst_build_30",
    runId: "run_build_30",
    sessionId,
    startedAt: null,
    status,
    studentId: "student_build_30",
    studentUid: "uid_build_30",
    submissionLock: false,
    submittedAt: null,
    updatedAt: new Date().toISOString(),
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
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_merge";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        {
          clientTimestamp: 2000,
          questionId: "q02",
          selectedOption: "C",
          timeSpent: 25,
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

    assert.equal(answerMap.q01.selectedOption, "A");
    assert.equal(answerMap.q02.selectedOption, "C");
    assert.equal(answerMap.q02.timeSpent, 25);

    await deleteIfPresent(sessionPath);
  },
);

test(
  "persistIncrementalAnswers ignores stale writes by clientTimestamp",
  async () => {
    const sessionPath =
      "institutes/inst_build_30/academicYears/2026/" +
      "runs/run_build_30/sessions/session_build_30_conflict";

    await deleteIfPresent(sessionPath);
    await seedSession(sessionPath);

    const result = await answerBatchService.persistIncrementalAnswers({
      answers: [
        {
          clientTimestamp: 999,
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

    assert.equal(answerMap.q01.selectedOption, "A");
    assert.equal(answerMap.q01.clientTimestamp, 1000);

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
