import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {SessionService, SessionStartValidationError} from "../services/session";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-27-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const createSessionServiceForTests = (): SessionService =>
  new SessionService(async (uid, claims) =>
    `signed-session-token:${uid}:${claims.sessionId}`);

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

const seedSessionDocument = async (
  path: string,
  status: string,
): Promise<void> => {
  const pathSegments = path.split("/");
  const sessionId = pathSegments[pathSegments.length - 1];

  await firestore.doc(path).set({
    answerMap: {},
    instituteId: "inst_build_27",
    runId: "run_build_27",
    sessionId,
    startedAt: null,
    status,
    studentId: "student_build_27",
    submissionLock: false,
    submittedAt: null,
    version: 1,
    yearId: "2026",
  });
};

const seedActivationSession = async (
  path: string,
  status: "created" | "started" | "active" | "submitted" | "expired",
  startsAtMs: number,
  endsAtMs: number,
): Promise<void> => {
  const pathSegments = path.split("/");
  const sessionId = pathSegments[pathSegments.length - 1];
  const runId = pathSegments[pathSegments.length - 3];
  const yearId = pathSegments[pathSegments.length - 5];
  const instituteId = pathSegments[1];
  const questionId = "question_lifecycle_authority";
  await firestore.doc(path).set({
    answerMap: {},
    deadlineAt: status === "active" ? Timestamp.fromMillis(endsAtMs) : null,
    instituteId,
    questionTimeMap: {
      [questionId]: {
        cumulativeTimeSpent: 0,
        enteredAt: null,
        exitedAt: null,
        lastEntryTimestamp: null,
        maxTime: 60,
        minTime: 30,
      },
    },
    runId,
    runtimeSnapshot: {
      difficultyDistribution: {easyPercent: 100, hardPercent: 0, mediumPercent: 0},
      hardModeRevisitRestricted: false,
      license: {currentLayer: "L1", eligibilityFlags: {}, featureFlags: {}},
      mode: "Diagnostic",
      phaseConfigSnapshot: {
        bufferPercent: 0,
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      proctoringPolicy: {
        browserIntegrityGuardEnabled: false,
        faceIdentityGazeGuardEnabled: false,
      },
      questionSetVersion: "1",
      questions: [{
        difficulty: "easy",
        id: questionId,
        imageUrl: null,
        matrixColumns: [],
        matrixRows: [],
        media: null,
        number: 1,
        options: [{id: "A", label: "A", text: "Option A"}],
        section: "Physics",
        text: "Lifecycle authority question",
        type: "mcq",
      }],
      schedule: {
        durationMs: endsAtMs - startsAtMs,
        earlyEntryBufferMinutes: 5,
        earlyEntryOpensAt: new Date(startsAtMs - 300_000).toISOString(),
        sessionEndsAt: new Date(endsAtMs).toISOString(),
        sessionStartsAt: new Date(startsAtMs).toISOString(),
        timezone: "UTC",
      },
      sessionId,
      subjects: ["Physics"],
      timingProfile: {
        controlledSlowdownSeconds: 12,
        finalWindowMinutes: 10,
        hardModeRestrictSubmitUntilAllVisited: true,
        hardModeSequentialNavigation: false,
        maxTimeByDifficultySec: {easy: 60, hard: 210, medium: 150},
        minTimeByDifficultySec: {easy: 30, hard: 150, medium: 60},
        syncEveryMs: 10_000,
      },
    },
    sessionId,
    startedAt: status === "active" ? Timestamp.fromMillis(startsAtMs) : null,
    status,
    studentId: "student_lifecycle_authority",
    studentUid: "uid_lifecycle_authority",
    submissionLock: false,
    submittedAt: null,
    version: 1,
    yearId,
  });
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "transitionSessionState allows forward-only created to started to active " +
    "to submitted transitions",
  async () => {
    const sessionService = createSessionServiceForTests();
    const sessionPath =
      "institutes/inst_build_27_success/academicYears/2026/" +
      "runs/run_build_27_success/sessions/session_build_27_success";

    await deleteDocumentIfPresent(sessionPath);
    await seedSessionDocument(sessionPath, "created");

    const startedResult = await sessionService.transitionSessionState(
      {
        actorType: "student",
        instituteId: "inst_build_27_success",
        runId: "run_build_27_success",
        sessionId: "session_build_27_success",
        yearId: "2026",
      },
      "started",
    );
    assert.equal(startedResult.fromStatus, "created");
    assert.equal(startedResult.status, "started");

    const activeResult = await sessionService.transitionSessionState(
      {
        actorType: "student",
        instituteId: "inst_build_27_success",
        runId: "run_build_27_success",
        sessionId: "session_build_27_success",
        yearId: "2026",
      },
      "active",
    );
    assert.equal(activeResult.fromStatus, "started");
    assert.equal(activeResult.status, "active");

    const submittedResult = await sessionService.transitionSessionState(
      {
        actorType: "backend",
        instituteId: "inst_build_27_success",
        runId: "run_build_27_success",
        sessionId: "session_build_27_success",
        yearId: "2026",
      },
      "submitted",
    );
    assert.equal(submittedResult.fromStatus, "active");
    assert.equal(submittedResult.status, "submitted");

    const sessionSnapshot = await firestore.doc(sessionPath).get();
    assert.equal(sessionSnapshot.data()?.status, "submitted");

    await deleteDocumentIfPresent(sessionPath);
  },
);

test(
  "transitionSessionState allows active to expired to terminated transitions",
  async () => {
    const sessionService = createSessionServiceForTests();
    const sessionPath =
      "institutes/inst_build_27_expired/academicYears/2026/" +
      "runs/run_build_27_expired/sessions/session_build_27_expired";

    await deleteDocumentIfPresent(sessionPath);
    await seedSessionDocument(sessionPath, "active");

    const expiredResult = await sessionService.transitionSessionState(
      {
        actorType: "system",
        instituteId: "inst_build_27_expired",
        runId: "run_build_27_expired",
        sessionId: "session_build_27_expired",
        yearId: "2026",
      },
      "expired",
    );
    assert.equal(expiredResult.fromStatus, "active");
    assert.equal(expiredResult.status, "expired");

    const terminatedResult = await sessionService.transitionSessionState(
      {
        actorType: "system",
        instituteId: "inst_build_27_expired",
        runId: "run_build_27_expired",
        sessionId: "session_build_27_expired",
        yearId: "2026",
      },
      "terminated",
    );
    assert.equal(terminatedResult.fromStatus, "expired");
    assert.equal(terminatedResult.status, "terminated");

    const sessionSnapshot = await firestore.doc(sessionPath).get();
    assert.equal(sessionSnapshot.data()?.status, "terminated");

    await deleteDocumentIfPresent(sessionPath);
  },
);

test(
  "transitionSessionState rejects backward or skipped transitions",
  async () => {
    const sessionService = createSessionServiceForTests();
    const sessionPath =
      "institutes/inst_build_27_invalid_order/academicYears/2026/" +
      "runs/run_build_27_invalid_order/sessions/session_build_27_invalid";

    await deleteDocumentIfPresent(sessionPath);
    await seedSessionDocument(sessionPath, "active");

    await assert.rejects(
      sessionService.transitionSessionState(
        {
          actorType: "student",
          instituteId: "inst_build_27_invalid_order",
          runId: "run_build_27_invalid_order",
          sessionId: "session_build_27_invalid",
          yearId: "2026",
        },
        "started",
      ),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /not forward-only/i);
        return true;
      },
    );

    await assert.rejects(
      sessionService.transitionSessionState(
        {
          actorType: "backend",
          instituteId: "inst_build_27_invalid_order",
          runId: "run_build_27_invalid_order",
          sessionId: "session_build_27_invalid",
          yearId: "2026",
        },
        "terminated",
      ),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /not allowed/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(sessionPath);
  },
);

test(
  "transitionSessionState enforces actor restrictions for active and " +
    "submitted states",
  async () => {
    const sessionService = createSessionServiceForTests();
    const activeSessionPath =
      "institutes/inst_build_27_actor_active/academicYears/2026/" +
      "runs/run_build_27_actor_active/sessions/session_build_27_actor_active";
    const submittedSessionPath =
      "institutes/inst_build_27_actor_submitted/academicYears/2026/" +
      "runs/run_build_27_actor_submitted/" +
      "sessions/session_build_27_actor_submitted";

    await deleteDocumentIfPresent(activeSessionPath);
    await deleteDocumentIfPresent(submittedSessionPath);
    await seedSessionDocument(activeSessionPath, "started");
    await seedSessionDocument(submittedSessionPath, "active");

    await assert.rejects(
      sessionService.transitionSessionState(
        {
          actorType: "backend",
          instituteId: "inst_build_27_actor_active",
          runId: "run_build_27_actor_active",
          sessionId: "session_build_27_actor_active",
          yearId: "2026",
        },
        "active",
      ),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "FORBIDDEN");
        assert.match(error.message, /only students/i);
        return true;
      },
    );

    await assert.rejects(
      sessionService.transitionSessionState(
        {
          actorType: "student",
          instituteId: "inst_build_27_actor_submitted",
          runId: "run_build_27_actor_submitted",
          sessionId: "session_build_27_actor_submitted",
          yearId: "2026",
        },
        "submitted",
      ),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "FORBIDDEN");
        assert.match(error.message, /only backend services/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(activeSessionPath);
    await deleteDocumentIfPresent(submittedSessionPath);
  },
);

test(
  "activateSession persists one server clock and replays it idempotently",
  async () => {
    const service = createSessionServiceForTests();
    const startsAtMs = Date.parse("2026-08-30T10:00:00.000Z");
    const endsAtMs = Date.parse("2026-08-30T11:00:00.000Z");
    const sessionPath =
      "institutes/inst_lifecycle_activate/academicYears/2026/" +
      "runs/run_lifecycle_activate/sessions/session_lifecycle_activate";
    const context = {
      instituteId: "inst_lifecycle_activate",
      runId: "run_lifecycle_activate",
      sessionId: "session_lifecycle_activate",
      studentId: "student_lifecycle_authority",
      studentUid: "uid_lifecycle_authority",
      yearId: "2026",
    };
    await deleteDocumentIfPresent(sessionPath);
    await seedActivationSession(sessionPath, "started", startsAtMs, endsAtMs);

    const activated = await service.activateSession(context, startsAtMs + 5000);
    assert.equal(activated.status, "active");
    assert.equal(activated.replayed, false);
    assert.equal(activated.serverTime, "2026-08-30T10:00:05.000Z");
    assert.equal(activated.startedAt, "2026-08-30T10:00:05.000Z");
    assert.equal(activated.deadlineAt, "2026-08-30T11:00:00.000Z");

    const replayed = await service.activateSession(context, startsAtMs + 15_000);
    assert.equal(replayed.status, "active");
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.startedAt, activated.startedAt);
    assert.equal(replayed.deadlineAt, activated.deadlineAt);

    const snapshot = await firestore.doc(sessionPath).get();
    assert.equal(snapshot.data()?.status, "active");
    assert.equal(
      snapshot.data()?.startedAt.toMillis(),
      startsAtMs + 5000,
    );
    assert.equal(snapshot.data()?.deadlineAt.toMillis(), endsAtMs);
    await deleteDocumentIfPresent(sessionPath);
  },
);

test(
  "activateSession expires at the persisted deadline and rejects illegal states",
  async () => {
    const service = createSessionServiceForTests();
    const startsAtMs = Date.parse("2026-08-30T12:00:00.000Z");
    const endsAtMs = Date.parse("2026-08-30T13:00:00.000Z");
    const sessionPath =
      "institutes/inst_lifecycle_expiry/academicYears/2026/" +
      "runs/run_lifecycle_expiry/sessions/session_lifecycle_expiry";
    const context = {
      instituteId: "inst_lifecycle_expiry",
      runId: "run_lifecycle_expiry",
      sessionId: "session_lifecycle_expiry",
      studentId: "student_lifecycle_authority",
      studentUid: "uid_lifecycle_authority",
      yearId: "2026",
    };
    await deleteDocumentIfPresent(sessionPath);
    await seedActivationSession(sessionPath, "active", startsAtMs, endsAtMs);

    const expired = await service.activateSession(context, endsAtMs);
    assert.equal(expired.status, "expired");
    assert.equal(expired.replayed, true);
    const expiredReplay = await service.activateSession(context, endsAtMs + 60_000);
    assert.equal(expiredReplay.status, "expired");
    assert.equal(expiredReplay.replayed, true);
    assert.equal((await firestore.doc(sessionPath).get()).data()?.status, "expired");

    await seedActivationSession(sessionPath, "created", startsAtMs, endsAtMs);
    await assert.rejects(
      service.activateSession(context, startsAtMs + 1000),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "SESSION_LOCKED");
        return true;
      },
    );

    await seedActivationSession(sessionPath, "started", startsAtMs, endsAtMs);
    await assert.rejects(
      service.activateSession(context, startsAtMs - 1),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "WINDOW_CLOSED");
        return true;
      },
    );

    await seedActivationSession(sessionPath, "submitted", startsAtMs, endsAtMs);
    await assert.rejects(
      service.activateSession(context, startsAtMs + 1000),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "SESSION_LOCKED");
        return true;
      },
    );
    await deleteDocumentIfPresent(sessionPath);
  },
);
