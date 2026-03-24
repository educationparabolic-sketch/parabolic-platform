import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
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
