import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {SessionService, SessionStartValidationError} from "../services/session";

process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-29-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const createSessionServiceForTests = (): SessionService =>
  new SessionService(async (uid, claims) =>
    `signed-session-token:${uid}:${claims.sessionId}`);

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "getAnswerWriteBatchingPolicy returns Build 29 constraints",
  () => {
    const sessionService = createSessionServiceForTests();
    const policy = sessionService.getAnswerWriteBatchingPolicy();

    assert.equal(policy.minimumWriteIntervalMs, 5000);
    assert.equal(policy.maxPendingAnswers, 10);
  },
);

test(
  "evaluateAnswerWriteBatching does not flush below both thresholds",
  () => {
    const sessionService = createSessionServiceForTests();
    const result = sessionService.evaluateAnswerWriteBatching({
      millisecondsSinceLastWrite: 4999,
      pendingAnswersCount: 9,
    });

    assert.equal(result.shouldWrite, false);
    assert.deepEqual(result.reasons, []);
  },
);

test(
  "evaluateAnswerWriteBatching flushes when max pending answers is reached",
  () => {
    const sessionService = createSessionServiceForTests();
    const result = sessionService.evaluateAnswerWriteBatching({
      millisecondsSinceLastWrite: 1000,
      pendingAnswersCount: 10,
    });

    assert.equal(result.shouldWrite, true);
    assert.deepEqual(result.reasons, ["MAX_PENDING_ANSWERS_REACHED"]);
  },
);

test(
  "evaluateAnswerWriteBatching flushes when minimum write interval is reached",
  () => {
    const sessionService = createSessionServiceForTests();
    const result = sessionService.evaluateAnswerWriteBatching({
      millisecondsSinceLastWrite: 5000,
      pendingAnswersCount: 1,
    });

    assert.equal(result.shouldWrite, true);
    assert.deepEqual(result.reasons, ["WRITE_INTERVAL_ELAPSED"]);
  },
);

test(
  "assertAnswerWriteBatchingConstraints accepts boundary values",
  () => {
    const sessionService = createSessionServiceForTests();

    assert.doesNotThrow(() => {
      sessionService.assertAnswerWriteBatchingConstraints(10, 5000);
    });
  },
);

test(
  "assertAnswerWriteBatchingConstraints rejects oversize answer batch",
  async () => {
    const sessionService = createSessionServiceForTests();

    await assert.rejects(
      Promise.resolve().then(() => {
        sessionService.assertAnswerWriteBatchingConstraints(11, 5000);
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /maximum of 10/i);
        return true;
      },
    );
  },
);

test(
  "assertAnswerWriteBatchingConstraints rejects writes below min interval",
  async () => {
    const sessionService = createSessionServiceForTests();

    await assert.rejects(
      Promise.resolve().then(() => {
        sessionService.assertAnswerWriteBatchingConstraints(1, 4999);
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.match(error.message, /minimum write interval is 5000ms/i);
        return true;
      },
    );
  },
);
