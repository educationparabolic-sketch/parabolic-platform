import assert from "node:assert/strict";
import test from "node:test";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import type {AdminAssignmentOperationsService} from
  "../services/adminAssignmentOperations";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-128-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const instituteId = "inst_build_128_assignment_operations";
const yearId = "2026";
const institutePath = `institutes/${instituteId}`;
const yearPath = `${institutePath}/academicYears/${yearId}`;
const now = Timestamp.fromDate(new Date("2026-09-15T10:00:00.000Z"));
let service: AdminAssignmentOperationsService;
let realSubmissionService: AdminAssignmentOperationsService;
const failedForceSubmissions = new Set<string>();
const forceSubmissionAttempts = new Map<string, number>();

function runPath(runId: string): string {
  return `${yearPath}/runs/${runId}`;
}

function runFixture(
  runId: string,
  status: string,
  revision: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    academicYear: yearId,
    attemptLimit: 1,
    calibrationVersion: "calibration-v1",
    canonicalId: "canonical-test-1",
    createdAt: Timestamp.fromDate(new Date("2026-09-01T08:00:00.000Z")),
    difficultyDistribution: {easy: 1, hard: 0, medium: 1},
    endWindow: Timestamp.fromDate(new Date("2026-09-15T11:00:00.000Z")),
    gracePeriodMinutes: 10,
    licenseLayer: "L3",
    mode: "Diagnostic",
    modeSnapshot: "Diagnostic",
    phaseConfigSnapshot: {phase1: {questionIds: ["question-1"]}},
    proctoringPolicy: {
      browserIntegrityGuardEnabled: true,
      faceIdentityGazeGuardEnabled: false,
    },
    questionIds: ["question-1", "question-2"],
    recipientCount: 2,
    recipientStudentIds: ["student-1", "student-2"],
    revision,
    riskModelVersion: "risk-v1",
    runId,
    shuffleEnabled: true,
    shuffleQuestionOrder: true,
    startWindow: Timestamp.fromDate(new Date("2026-09-15T09:00:00.000Z")),
    status,
    testId: "test-1",
    testName: "Test 1",
    templateVersion: 4,
    timezone: "Asia/Kolkata",
    timingProfileSnapshot: {totalDurationMinutes: 120},
    totalSessions: 0,
    updatedAt: Timestamp.fromDate(new Date("2026-09-10T08:00:00.000Z")),
    ...overrides,
  };
}

async function seedRun(
  runId: string,
  status: string,
  revision: number,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await firestore.doc(runPath(runId)).set(
    runFixture(runId, status, revision, overrides),
  );
}

function duplicateInput(
  runId: string,
  idempotencyKey: string,
  expectedSourceRevision = 3,
) {
  return service.normalizeDuplicateRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    body: {
      endWindow: "2026-09-20T12:00:00.000Z",
      expectedSourceRevision,
      idempotencyKey,
      startWindow: "2026-09-20T10:00:00.000Z",
      timezone: "Asia/Kolkata",
    },
    instituteId,
    ipAddress: "127.0.0.1",
    runId,
    userAgent: "node-test",
  });
}

function lifecycleInput(
  runId: string,
  action: "extend" | "cancel" | "terminate" | "archive",
  expectedRevision: number,
  idempotencyKey: string,
) {
  return service.normalizeLifecycleRequest({
    actorId: "admin-1",
    actorRole: "admin",
    body: {
      action,
      expectedRevision,
      extensionMinutes: action === "extend" ? 30 : undefined,
      idempotencyKey,
      justification: `Test ${action}`,
    },
    instituteId,
    runId,
  });
}

function sessionPath(runId: string, sessionId: string): string {
  return `${runPath(runId)}/sessions/${sessionId}`;
}

async function seedSession(
  runId: string,
  sessionId: string,
  studentId: string,
  status: string,
  revision: number,
): Promise<void> {
  await firestore.doc(sessionPath(runId, sessionId)).set({
    createdAt: now,
    deadlineAt: Timestamp.fromDate(new Date("2026-09-15T11:00:00.000Z")),
    instituteId,
    revision,
    runId,
    sessionId,
    status,
    studentId,
    submissionLock: false,
    updatedAt: now,
    version: 1,
    yearId,
  });
}

test.before(async () => {
  const module = await import("../services/adminAssignmentOperations.js");
  service = new module.AdminAssignmentOperationsService({
    firestore,
    now: () => now,
    resolveCurrentYearId: async () => yearId,
    submitSession: async (context) => {
      forceSubmissionAttempts.set(
        context.sessionId,
        (forceSubmissionAttempts.get(context.sessionId) ?? 0) + 1,
      );
      if (failedForceSubmissions.delete(context.sessionId)) {
        throw new Error("simulated recoverable submission failure");
      }
      await firestore.doc(sessionPath(context.runId, context.sessionId)).update({
        status: "submitted",
        submissionLock: false,
        submissionLockOwnerId: FieldValue.delete(),
        submittedAt: now,
        updatedAt: now,
      });
    },
  });
  realSubmissionService = new module.AdminAssignmentOperationsService({
    firestore,
    now: () => now,
    resolveCurrentYearId: async () => yearId,
  });
  await firestore.doc(yearPath).set({status: "Active"});
  await firestore.doc(`${institutePath}/license/main`).set({
    currentLayer: "L3",
    featureFlags: {controlledMode: true, hardMode: true},
  });
  await firestore.doc(`${institutePath}/tests/test-1`).set({
    status: "assigned",
    totalRuns: 1,
  });
  await Promise.all([
    firestore.doc(`${institutePath}/students/student-1`).set({
      email: "student1@example.test",
      fullName: "Student One",
      status: "active",
    }),
    firestore.doc(`${institutePath}/students/student-2`).set({
      email: "student2@example.test",
      fullName: "Student Two",
      status: "active",
    }),
    firestore.doc(`${institutePath}/students/student-3`).set({
      email: "student3@example.test",
      fullName: "Student Three",
      status: "active",
    }),
  ]);
});

test.after(async () => {
  await firestore.recursiveDelete(firestore.doc(institutePath));
  await getFirebaseAdminApp().delete();
});

test("normalizers enforce roles, bounded recipients, and command limits", async () => {
  assert.throws(
    () => service.normalizeDuplicateRequest({
      actorId: "director-1",
      actorRole: "director",
      body: {
        endWindow: "2026-09-20T12:00:00.000Z",
        expectedSourceRevision: 3,
        idempotencyKey: "forbidden-role-key",
        startWindow: "2026-09-20T10:00:00.000Z",
        timezone: "Asia/Kolkata",
      },
      instituteId,
      runId: "run-source",
    }),
    /teacher or admin role/u,
  );
  assert.throws(
    () => service.normalizeReassignRequest({
      ...duplicateInput("run-source", "normalizer-key"),
      body: {
        endWindow: "2026-09-20T12:00:00.000Z",
        expectedSourceRevision: 3,
        idempotencyKey: "normalizer-key",
        recipientStudentIds: ["student-1", "student-1"],
        startWindow: "2026-09-20T10:00:00.000Z",
        timezone: "Asia/Kolkata",
      },
    }),
    /must not contain duplicates/u,
  );
  const excessiveExtension = lifecycleInput(
    "run-source",
    "extend",
    3,
    "extension-too-large",
  );
  excessiveExtension.command = {
    ...excessiveExtension.command,
    action: "extend",
    extensionMinutes: 1441,
  };
  await assert.rejects(
    service.applyLifecycleCommand(excessiveExtension),
    /must not exceed 1440/u,
  );
  assert.throws(
    () => service.normalizeSessionOverrideRequest({
      actorId: "admin-1",
      actorRole: "admin",
      body: {
        expectedRunRevision: 1,
        expectedSessionRevision: 1,
        idempotencyKey: "invalid-override",
        justification: "Not a permitted override",
        overrideType: "face_override",
      },
      instituteId,
      runId: "run-source",
      sessionId: "session-source",
    }),
    /minimum_time_bypass or force_submit/u,
  );
});

test("duplicate creates one audited versioned run and replays exactly", async () => {
  await seedRun("run-duplicate-source", "completed", 3);
  const request = duplicateInput(
    "run-duplicate-source",
    "duplicate-command-key",
  );
  const applied = await service.duplicateRun(request);
  assert.equal(applied.disposition, "applied");
  assert.equal(applied.run.revision, 1);
  assert.equal(applied.run.status, "scheduled");
  assert.equal(applied.sourceRunId, "run-duplicate-source");

  const replayed = await service.duplicateRun(request);
  assert.equal(replayed.disposition, "replayed");
  assert.deepEqual(replayed.run, applied.run);

  const persisted = await firestore.doc(applied.run.runPath).get();
  assert.equal(persisted.get("sourceRunId"), "run-duplicate-source");
  assert.equal(persisted.get("sourceRunRevision"), 3);
  assert.equal(persisted.get("revision"), 1);
  assert.equal(persisted.get("status"), "scheduled");
  assert.equal(
    (await firestore.doc(`${institutePath}/tests/test-1`).get()).get("totalRuns"),
    2,
  );
  const audit = await firestore.doc(
    `${institutePath}/auditLogs/${applied.auditId}`,
  ).get();
  assert.equal(audit.get("actionType"), "DUPLICATE_ASSIGNMENT");
  assert.equal(audit.get("metadata.result.run.id"), applied.run.id);
  assert.equal(audit.get("metadata.idempotencyKey"), undefined);

  const changed = duplicateInput(
    "run-duplicate-source",
    "duplicate-command-key",
  );
  changed.endWindow = "2026-09-20T13:00:00.000Z";
  await assert.rejects(service.duplicateRun(changed), /different semantics/u);
  await assert.rejects(
    service.duplicateRun(duplicateInput(
      "run-duplicate-source",
      "duplicate-stale-key",
      2,
    )),
    /revision conflict/u,
  );
});

test("concurrent duplicate and reassign converge on deterministic new runs", async () => {
  await seedRun("run-concurrent-source", "cancelled", 3);
  const duplicate = duplicateInput(
    "run-concurrent-source",
    "duplicate-concurrent-key",
  );
  const duplicateResults = await Promise.all([
    service.duplicateRun(duplicate),
    service.duplicateRun(duplicate),
  ]);
  assert.deepEqual(
    duplicateResults.map((result) => result.disposition).sort(),
    ["applied", "replayed"],
  );
  assert.equal(duplicateResults[0].run.id, duplicateResults[1].run.id);

  const reassign = service.normalizeReassignRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    body: {
      endWindow: "2026-09-22T12:00:00.000Z",
      expectedSourceRevision: 3,
      idempotencyKey: "reassign-command-key",
      recipientStudentIds: ["student-3"],
      startWindow: "2026-09-22T10:00:00.000Z",
      timezone: "Asia/Kolkata",
    },
    instituteId,
    runId: "run-concurrent-source",
  });
  const reassigned = await service.reassignRun(reassign);
  assert.equal(reassigned.disposition, "applied");
  assert.deepEqual(reassigned.run.recipientStudentIds, ["student-3"]);
  assert.equal(
    (await firestore.doc(reassigned.run.runPath).get()).get("derivedCommand"),
    "reassign",
  );
});

test("lifecycle commands enforce legality, versions, replay, and immutability", async () => {
  await Promise.all([
    seedRun("run-active", "active", 2),
    seedRun("run-scheduled", "scheduled", 1),
    seedRun("run-completed", "completed", 4),
  ]);
  const extend = lifecycleInput("run-active", "extend", 2, "extend-key");
  const extended = await service.applyLifecycleCommand(extend);
  assert.equal(extended.run.revision, 3);
  assert.equal(extended.run.status, "active");
  assert.equal(extended.run.endWindow, "2026-09-15T11:30:00.000Z");
  assert.equal((await service.applyLifecycleCommand(extend)).disposition, "replayed");
  const activeSnapshot = await firestore.doc(runPath("run-active")).get();
  assert.equal(activeSnapshot.get("mode"), "Diagnostic");
  assert.deepEqual(activeSnapshot.get("questionIds"), ["question-1", "question-2"]);
  await assert.rejects(
    service.applyLifecycleCommand(
      lifecycleInput("run-active", "extend", 2, "extend-stale-key"),
    ),
    /revision conflict/u,
  );

  const cancelled = await service.applyLifecycleCommand(
    lifecycleInput("run-scheduled", "cancel", 1, "cancel-key"),
  );
  assert.equal(cancelled.run.status, "cancelled");
  assert.equal(cancelled.run.revision, 2);
  const archived = await service.applyLifecycleCommand(
    lifecycleInput("run-completed", "archive", 4, "archive-key"),
  );
  assert.equal(archived.run.status, "archived");
  assert.equal(archived.recoveryState, "complete");
  await assert.rejects(
    service.applyLifecycleCommand(
      lifecycleInput("run-active", "cancel", 3, "illegal-cancel-key"),
    ),
    /Only a scheduled run/u,
  );
});

test("notification resend queues deterministic owned recipients and audit", async () => {
  await seedRun("run-notification", "scheduled", 1);
  const request = service.normalizeNotificationResendRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    body: {
      expectedRevision: 1,
      idempotencyKey: "notification-key",
      recipientStudentIds: ["student-1"],
    },
    instituteId,
    runId: "run-notification",
  });
  const applied = await service.resendRunNotifications(request);
  assert.equal(applied.disposition, "applied");
  assert.equal(applied.queuedNotificationCount, 1);
  assert.equal(applied.recoveryState, "complete");
  assert.equal((await firestore.doc(runPath("run-notification")).get()).get("revision"), 2);
  const jobs = await firestore.collection("emailQueue")
    .where("payload.runId", "==", "run-notification").get();
  assert.equal(jobs.size, 1);
  assert.equal(jobs.docs[0].get("recipientEmail"), "student1@example.test");
  assert.equal(jobs.docs[0].get("templateType"), "assignment_notification");
  assert.equal((await service.resendRunNotifications(request)).disposition, "replayed");
  assert.equal((await firestore.collection("emailQueue")
    .where("payload.runId", "==", "run-notification").get()).size, 1);

  const outsideAssignment = service.normalizeNotificationResendRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    body: {
      expectedRevision: 2,
      idempotencyKey: "notification-outside-key",
      recipientStudentIds: ["student-3"],
    },
    instituteId,
    runId: "run-notification",
  });
  await assert.rejects(
    service.resendRunNotifications(outsideAssignment),
    /must belong to the assignment recipients/u,
  );
});

test("termination atomically stops live sessions, run, analytics, and audit", async () => {
  await Promise.all([
    seedRun("run-terminate", "active", 3),
    seedSession("run-terminate", "session-active", "student-1", "active", 2),
    seedSession("run-terminate", "session-submitted", "student-2", "submitted", 1),
    firestore.doc(`${yearPath}/runAnalytics/run-terminate`).set({status: "active"}),
  ]);
  const request = lifecycleInput("run-terminate", "terminate", 3, "terminate-key");
  const applied = await service.applyLifecycleCommand(request);
  assert.equal(applied.run.status, "terminated");
  assert.equal(applied.run.revision, 4);
  assert.equal(applied.recoveryState, "complete");
  assert.equal(
    (await firestore.doc(sessionPath("run-terminate", "session-active")).get()).get("status"),
    "terminated",
  );
  assert.equal(
    (await firestore.doc(sessionPath("run-terminate", "session-active")).get()).get("revision"),
    3,
  );
  assert.equal(
    (await firestore.doc(sessionPath("run-terminate", "session-submitted")).get()).get("status"),
    "submitted",
  );
  assert.equal(
    (await firestore.doc(`${yearPath}/runAnalytics/run-terminate`).get()).get("status"),
    "terminated",
  );
  assert.equal(
    (await firestore.doc(`${institutePath}/auditLogs/${applied.auditId}`).get())
      .get("actionType"),
    "TERMINATE_ASSIGNMENT",
  );
  assert.equal((await service.applyLifecycleCommand(request)).disposition, "replayed");
});

test("session overrides enforce revisions and recover force-submit effects", async () => {
  await Promise.all([
    seedRun("run-minimum-override", "active", 1),
    seedSession(
      "run-minimum-override",
      "session-minimum",
      "student-1",
      "active",
      1,
    ),
  ]);
  const minimumRequest = service.normalizeSessionOverrideRequest({
    actorId: "admin-1",
    actorRole: "admin",
    body: {
      expectedRunRevision: 1,
      expectedSessionRevision: 1,
      idempotencyKey: "minimum-override-key",
      justification: "Approved accessibility exception",
      overrideType: "minimum_time_bypass",
    },
    instituteId,
    runId: "run-minimum-override",
    sessionId: "session-minimum",
  });
  const minimum = await service.applySessionOverride(minimumRequest);
  assert.equal(minimum.sessionStatus, "active");
  assert.equal(minimum.sessionRevision, 2);
  assert.equal(minimum.overrideUsed, true);
  assert.equal((await firestore.doc(
    `${institutePath}/overrideLogs/${minimum.overrideId}`,
  ).get()).get("recoveryState"), "complete");
  assert.equal((await service.applySessionOverride(minimumRequest)).disposition, "replayed");

  await Promise.all([
    seedRun("run-force-override", "collecting", 4),
    seedSession("run-force-override", "session-force", "student-2", "expired", 2),
  ]);
  failedForceSubmissions.add("session-force");
  const forceRequest = service.normalizeSessionOverrideRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    body: {
      expectedRunRevision: 4,
      expectedSessionRevision: 2,
      idempotencyKey: "force-override-key",
      justification: "Candidate device is no longer reachable",
      overrideType: "force_submit",
    },
    instituteId,
    runId: "run-force-override",
    sessionId: "session-force",
  });
  await assert.rejects(
    service.applySessionOverride(forceRequest),
    /simulated recoverable submission failure/u,
  );
  const overrideQuery = await firestore.collection(
    `${institutePath}/assignmentOperationRecoveries`,
  )
    .where("sessionId", "==", "session-force").get();
  assert.equal(overrideQuery.size, 1);
  assert.equal(overrideQuery.docs[0].get("recoveryState"), "failed_recoverable");

  const recovered = await service.applySessionOverride(forceRequest);
  assert.equal(recovered.sessionStatus, "submitted");
  assert.equal(recovered.sessionRevision, 3);
  assert.equal(recovered.recoveryState, "complete");
  assert.equal(forceSubmissionAttempts.get("session-force"), 2);
  assert.equal((await firestore.doc(
    `${institutePath}/overrideLogs/${recovered.overrideId}`,
  ).get()).get("recoveryState"), "complete");
  assert.equal((await firestore.doc(
    `${institutePath}/assignmentOperationRecoveries/${recovered.overrideId}`,
  ).get()).get("recoveryState"), "complete");
  assert.equal((await service.applySessionOverride(forceRequest)).disposition, "replayed");
});

test("force-submit composes the authoritative scoring submission engine", async () => {
  const runId = "run-force-real";
  const sessionId = "session-force-real";
  const questionId = "question-force-real";
  await Promise.all([
    seedRun(runId, "active", 1, {
      mode: "Hard",
      phaseConfigSnapshot: {
        phase1Percent: 100,
        phase2Percent: 0,
        phase3Percent: 0,
      },
      questionIds: [questionId],
      recipientCount: 1,
      recipientStudentIds: ["student-1"],
    }),
    firestore.doc(`${institutePath}/questionBank/${questionId}`).set({
      correctAnswer: "A",
      difficulty: "Easy",
      marks: 4,
      negativeMarks: 1,
    }),
  ]);
  await firestore.doc(sessionPath(runId, sessionId)).set({
    answerMap: {
      [questionId]: {selectedOption: "A"},
    },
    calibrationVersion: "calibration-v1",
    createdAt: now,
    deadlineAt: Timestamp.fromMillis(Date.now() + 60_000),
    instituteId,
    mode: "Hard",
    questionTimeMap: {
      [questionId]: {cumulativeTimeSpent: 1, maxTime: 120, minTime: 60},
    },
    revision: 1,
    riskModelVersion: "risk-v1",
    runId,
    sessionId,
    startedAt: now,
    status: "active",
    studentId: "student-1",
    submissionLock: false,
    templateVersion: "4",
    updatedAt: now,
    version: 1,
    yearId,
  });
  const request = realSubmissionService.normalizeSessionOverrideRequest({
    actorId: "admin-1",
    actorRole: "admin",
    body: {
      expectedRunRevision: 1,
      expectedSessionRevision: 1,
      idempotencyKey: "force-real-key",
      justification: "Supervised device failure",
      overrideType: "force_submit",
    },
    instituteId,
    runId,
    sessionId,
  });

  const result = await realSubmissionService.applySessionOverride(request);
  assert.equal(result.sessionStatus, "submitted");
  assert.equal(result.sessionRevision, 2);
  const snapshot = await firestore.doc(sessionPath(runId, sessionId)).get();
  assert.equal(snapshot.get("rawScorePercent"), 100);
  assert.deepEqual(
    snapshot.get("submissionTimingValidation.minTimeViolationQuestionIds"),
    [questionId],
  );
  assert.equal(snapshot.get("submissionLockOwnerId"), undefined);
});

test("reconciliation advances canonical states and normalizes stopped", async () => {
  await Promise.all([
    seedRun("run-reconcile-scheduled", "scheduled", 1),
    seedRun("run-reconcile-active", "active", 2, {
      endWindow: Timestamp.fromDate(new Date("2026-09-15T09:30:00.000Z")),
    }),
    seedRun("run-reconcile-collecting", "collecting", 3),
    seedRun("run-reconcile-stopped", "stopped", 4),
  ]);
  await firestore.doc(
    `${yearPath}/runAnalytics/run-reconcile-collecting`,
  ).set({completionRatePercent: 100, status: "completed"});

  const scheduled = await service.reconcileRunLifecycle({
    actorId: "system",
    actorRole: "system",
    instituteId,
    runId: "run-reconcile-scheduled",
  });
  assert.equal(scheduled.run.status, "active");
  assert.equal(scheduled.run.revision, 2);
  const collecting = await service.reconcileRunLifecycle({
    actorId: "system",
    actorRole: "system",
    instituteId,
    runId: "run-reconcile-active",
  });
  assert.equal(collecting.run.status, "collecting");
  const completed = await service.reconcileRunLifecycle({
    actorId: "system",
    actorRole: "system",
    instituteId,
    runId: "run-reconcile-collecting",
  });
  assert.equal(completed.run.status, "completed");
  const terminated = await service.reconcileRunLifecycle({
    actorId: "system",
    actorRole: "system",
    instituteId,
    runId: "run-reconcile-stopped",
  });
  assert.equal(terminated.run.status, "terminated");
  assert.equal(terminated.run.revision, 5);
  assert.equal(
    (await service.reconcileRunLifecycle({
      actorId: "system",
      actorRole: "system",
      instituteId,
      runId: "run-reconcile-stopped",
    })).disposition,
    "unchanged",
  );
  const audits = await firestore.collection(`${institutePath}/auditLogs`)
    .where("actionType", "==", "RECONCILE_ASSIGNMENT_LIFECYCLE")
    .get();
  assert.equal(audits.size, 4);
});
