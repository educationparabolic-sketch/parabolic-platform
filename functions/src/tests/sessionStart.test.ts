import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {SessionService, SessionStartValidationError} from "../services/session";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-26-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const createSessionServiceForTests = (): SessionService =>
  new SessionService(async (uid, claims) =>
    `signed-session-token:${uid}:${claims.sessionId}`);

const timingProfileSnapshotFixture = {
  easy: {max: 60, min: 30},
  hard: {max: 210, min: 150},
  medium: {max: 150, min: 60},
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "startSession creates a created session document for an eligible student",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_26_success";
    const yearId = "2026";
    const runId = "run_build_26_success";
    const studentId = "student_build_26_success";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const questionEasyPath = `${institutePath}/questionBank/q_build_31_easy`;
    const questionHardPath = `${institutePath}/questionBank/q_build_31_hard`;
    const questionMediumPath =
      `${institutePath}/questionBank/q_build_31_medium`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(questionEasyPath);
    await deleteDocumentIfPresent(questionHardPath);
    await deleteDocumentIfPresent(questionMediumPath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(questionEasyPath).set({difficulty: "Easy"});
    await firestore.doc(questionHardPath).set({difficulty: "Hard"});
    await firestore.doc(questionMediumPath).set({difficulty: "Medium"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      questionIds: [
        "q_build_31_easy",
        "q_build_31_hard",
        "q_build_31_medium",
      ],
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      timingProfileSnapshot: timingProfileSnapshotFixture,
    });

    const result = await sessionService.startSession({
      instituteId,
      runId,
      studentId,
      studentUid: `uid_${studentId}`,
      yearId,
    });

    assert.equal(result.status, "created");
    assert.ok(result.sessionId.length > 0);
    assert.match(
      result.sessionPath,
      new RegExp(`runs/${runId}/sessions/${result.sessionId}$`),
    );
    assert.match(
      result.sessionToken,
      new RegExp(`signed-session-token:uid_${studentId}:`),
    );

    const sessionSnapshot = await firestore.doc(result.sessionPath).get();
    const sessionData = sessionSnapshot.data();
    assert.equal(sessionData?.sessionId, result.sessionId);
    assert.equal(sessionData?.instituteId, instituteId);
    assert.equal(sessionData?.yearId, yearId);
    assert.equal(sessionData?.runId, runId);
    assert.equal(sessionData?.studentId, studentId);
    assert.equal(sessionData?.studentUid, `uid_${studentId}`);
    assert.equal(sessionData?.status, "created");
    assert.equal(sessionData?.submissionLock, false);
    assert.deepEqual(sessionData?.answerMap, {});
    assert.deepEqual(
      sessionData?.timingProfileSnapshot,
      timingProfileSnapshotFixture,
    );
    assert.deepEqual(sessionData?.questionTimeMap, {
      q_build_31_easy: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 60,
        minTime: 30,
      },
      q_build_31_hard: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 210,
        minTime: 150,
      },
      q_build_31_medium: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 150,
        minTime: 60,
      },
    });
    assert.equal(sessionData?.startedAt, null);
    assert.equal(sessionData?.submittedAt, null);
    assert.equal(sessionData?.version, 1);
    assert.ok(sessionData?.createdAt instanceof Timestamp);
    assert.ok(sessionData?.updatedAt instanceof Timestamp);

    await deleteDocumentIfPresent(result.sessionPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(questionMediumPath);
    await deleteDocumentIfPresent(questionHardPath);
    await deleteDocumentIfPresent(questionEasyPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects when assignment window is closed",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_26_window_closed";
    const yearId = "2026";
    const runId = "run_build_26_window_closed";
    const studentId = "student_build_26_window_closed";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      status: "scheduled",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
        yearId,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "WINDOW_CLOSED");
        return true;
      },
    );

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects runs missing timing profile snapshot",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_31_missing_timing";
    const yearId = "2026";
    const runId = "run_build_31_missing_timing";
    const studentId = "student_build_31_missing_timing";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      questionIds: ["q_build_31_missing_timing_question"],
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
        yearId,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /timingprofilesnapshot/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects when run question snapshot is missing in question bank",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_31_missing_question";
    const yearId = "2026";
    const runId = "run_build_31_missing_question";
    const studentId = "student_build_31_missing_question";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      questionIds: ["q_build_31_missing_from_bank"],
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      timingProfileSnapshot: timingProfileSnapshotFixture,
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
        yearId,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /questionbank/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects students not assigned to the run",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_26_unassigned";
    const yearId = "2026";
    const runId = "run_build_26_unassigned";
    const studentId = "student_build_26_unassigned";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      recipientStudentIds: ["some_other_student"],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
        yearId,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects when an active session already exists",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_26_duplicate_session";
    const yearId = "2026";
    const runId = "run_build_26_duplicate_session";
    const studentId = "student_build_26_duplicate_session";
    const institutePath = `institutes/${instituteId}`;
    const studentPath = `${institutePath}/students/${studentId}`;
    const licensePath = `${institutePath}/license/main`;
    const runPath =
      `${institutePath}/academicYears/${yearId}/runs/${runId}`;
    const existingSessionPath = `${runPath}/sessions/session_existing`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(existingSessionPath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
    });
    await firestore.doc(existingSessionPath).set({
      sessionId: "session_existing",
      status: "active",
      studentId,
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
        yearId,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "SESSION_LOCKED");
        return true;
      },
    );

    await deleteDocumentIfPresent(existingSessionPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);
