import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import type {AcademicYearSummary} from "../types/adminSettings";
import type {
  AdminAssignmentOperationValidationError,
} from "../types/adminAssignmentOperations";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const NOW = Timestamp.fromDate(new Date("2026-09-15T12:00:00.000Z"));
const YEARS: AcademicYearSummary[] = [
  {
    academicYearLabel: "2026",
    runCount: 0,
    snapshotStatus: "available",
    status: "Active",
    studentCount: 0,
    yearId: "2026",
  },
  {
    academicYearLabel: "2025",
    runCount: 0,
    snapshotStatus: "available",
    status: "Locked",
    studentCount: 0,
    yearId: "2025",
  },
];

let ReadModelsService: typeof import(
  "../services/adminAssignmentReadModels.js"
).AdminAssignmentReadModelsService;

test.before(async () => {
  const module = await import("../services/adminAssignmentReadModels.js");
  ReadModelsService = module.AdminAssignmentReadModelsService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const buildService = () => new ReadModelsService({
  firestore,
  loadAcademicYears: async () => YEARS,
  now: () => NOW,
});

const runData = (input: {
  createdAt: string;
  mode?: "Controlled" | "Diagnostic" | "Hard" | "Operational";
  recipients?: string[];
  revision?: number;
  status: string;
  yearId?: string;
}): Record<string, unknown> => {
  const createdAt = Timestamp.fromDate(new Date(input.createdAt));
  const yearId = input.yearId ?? "2026";
  return {
    academicYear: yearId,
    attemptLimit: 1,
    canonicalId: `test_${yearId}`,
    createdAt,
    endWindow: Timestamp.fromMillis(NOW.toMillis() + 3_600_000),
    gracePeriodMinutes: 5,
    mode: input.mode ?? "Operational",
    proctoringPolicy: {
      browserIntegrityGuardEnabled: true,
      faceIdentityGazeGuardEnabled: false,
    },
    recipientStudentIds: input.recipients ?? ["student_a"],
    revision: input.revision ?? 2,
    shuffleQuestionOrder: false,
    startWindow: Timestamp.fromMillis(NOW.toMillis() - 3_600_000),
    status: input.status,
    templateVersion: 3,
    testId: `test_${yearId}`,
    timezone: "UTC",
    updatedAt: createdAt,
  };
};

const runPath = (instituteId: string, yearId: string, runId: string): string =>
  `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;

const deleteInstitute = async (instituteId: string): Promise<void> => {
  await firestore.recursiveDelete(firestore.doc(`institutes/${instituteId}`));
};

const expectCode = async (
  promise: Promise<unknown>,
  code: AdminAssignmentOperationValidationError["code"],
): Promise<void> => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof Error &&
    "code" in error &&
    (error as {code: unknown}).code === code,
  );
};

test("read request normalizers enforce roles, filters, and bounds", () => {
  const service = buildService();
  assert.deepEqual(service.normalizeLiveListRequest({
    actorId: "teacher_1",
    actorRole: "teacher",
    instituteId: "inst_read_normalize",
  }), {
    actorId: "teacher_1",
    actorRole: "teacher",
    instituteId: "inst_read_normalize",
    limit: 25,
  });
  assert.throws(() => service.normalizeLiveListRequest({
    actorId: "student_1",
    actorRole: "student",
    instituteId: "inst_read_normalize",
  }), (error: unknown) =>
    error instanceof Error && "code" in error &&
    (error as {code: unknown}).code === "FORBIDDEN",
  );
  assert.throws(() => service.normalizeHistoryRequest({
    actorId: "admin_1",
    actorRole: "admin",
    instituteId: "inst_read_normalize",
    limit: 51,
  }));
  assert.throws(() => service.normalizeHistoryRequest({
    actorId: "admin_1",
    actorRole: "admin",
    instituteId: "inst_read_normalize",
    status: "active",
  }));
});

test("live list is current-year bounded and uses authoritative session counts", async () => {
  const instituteId = "inst_read_live_list";
  await deleteInstitute(instituteId);
  const newestPath = runPath(instituteId, "2026", "run_live_newest");
  const olderPath = runPath(instituteId, "2026", "run_live_older");
  await Promise.all([
    firestore.doc(newestPath).set(runData({
      createdAt: "2026-09-15T10:00:00.000Z",
      recipients: ["student_a", "student_b", "student_c"],
      status: "active",
    })),
    firestore.doc(olderPath).set(runData({
      createdAt: "2026-09-14T10:00:00.000Z",
      recipients: ["student_d"],
      status: "collecting",
    })),
    firestore.doc(runPath(instituteId, "2026", "run_completed")).set(runData({
      createdAt: "2026-09-13T10:00:00.000Z",
      status: "completed",
    })),
    firestore.doc(runPath(instituteId, "2025", "run_old_live")).set(runData({
      createdAt: "2025-09-15T10:00:00.000Z",
      status: "active",
      yearId: "2025",
    })),
    firestore.doc(`${newestPath}/sessions/session_a`).set({
      sessionId: "session_a",
      status: "active",
      studentId: "student_a",
    }),
    firestore.doc(`${newestPath}/sessions/session_b`).set({
      sessionId: "session_b",
      status: "submitted",
      studentId: "student_b",
    }),
  ]);
  const service = buildService();
  const request = service.normalizeLiveListRequest({
    actorId: "teacher_1",
    actorRole: "teacher",
    instituteId,
    limit: 1,
  });
  const first = await service.listLiveRuns(request);
  assert.equal(first.runs.length, 1);
  assert.equal(first.runs[0].run.id, "run_live_newest");
  assert.deepEqual(first.runs[0].summary, {
    activeSessionCount: 1,
    notStartedCount: 1,
    submittedCount: 1,
    terminatedSessionCount: 0,
    totalRecipients: 3,
  });
  assert.equal(first.serverTime, NOW.toDate().toISOString());
  const liveListCursor = first.nextCursor;
  assert.ok(liveListCursor);
  const second = await service.listLiveRuns({
    ...request,
    cursor: liveListCursor,
  });
  assert.deepEqual(second.runs.map((entry) => entry.run.id), ["run_live_older"]);
  assert.equal(second.nextCursor, null);
  await deleteInstitute(instituteId);
});

test("live detail pages stored student/session projections and rejects stale pages", async () => {
  const instituteId = "inst_read_live_detail";
  const path = runPath(instituteId, "2026", "run_live_detail");
  await deleteInstitute(instituteId);
  await Promise.all([
    firestore.doc(path).set(runData({
      createdAt: "2026-09-15T09:00:00.000Z",
      mode: "Controlled",
      recipients: ["student_c", "student_a", "student_b"],
      revision: 4,
      status: "active",
    })),
    firestore.doc(`institutes/${instituteId}/license/main`).set({
      currentLayer: "L2",
    }),
    ...["a", "b", "c"].map((suffix) => firestore
      .doc(`institutes/${instituteId}/students/student_${suffix}`)
      .set({fullName: `Student ${suffix.toUpperCase()}`})),
    firestore.doc(`${path}/sessions/session_a`).set({
      adaptivePhaseSnapshot: {answeredPercent: 40, currentPhase: "phase2"},
      controlledCompliancePercent: 88,
      deadlineAt: Timestamp.fromMillis(NOW.toMillis() + 300_000),
      maxTimeViolationCount: 2,
      minTimeViolationCount: 1,
      overrideUsed: true,
      pacingDrift: false,
      provisionalRiskScore: 23,
      rapidGuess: true,
      sessionId: "session_a",
      skipBurst: false,
      status: "active",
      studentId: "student_a",
      version: 3,
    }),
    firestore.doc(`${path}/sessions/session_b`).set({
      adaptivePhaseSnapshot: {answeredPercent: 75, currentPhase: "phase3"},
      sessionId: "session_b",
      status: "submitted",
      studentId: "student_b",
      version: 2,
    }),
  ]);
  const service = buildService();
  const request = service.normalizeLiveDetailRequest({
    actorId: "admin_1",
    actorRole: "admin",
    instituteId,
    limit: 2,
    runId: "run_live_detail",
  });
  const first = await service.getLiveRun(request);
  assert.deepEqual(first.students.map((student) => student.studentId), [
    "student_a",
    "student_b",
  ]);
  assert.deepEqual(first.summary, {
    activeSessionCount: 1,
    notStartedCount: 1,
    submittedCount: 1,
    terminatedSessionCount: 0,
    totalRecipients: 3,
  });
  assert.equal(first.students[0].progressPercent, 40);
  assert.equal(first.students[0].currentPhase, "phase2");
  assert.equal(first.students[0].controlledCompliancePercent, 88);
  assert.equal(first.students[0].sessionRevision, 3);
  assert.equal(first.students[0].timeRemainingSeconds, 300);
  assert.equal(first.students[1].timeRemainingSeconds, 0);
  assert.equal("answerMap" in first.students[0], false);
  const liveDetailCursor = first.nextCursor;
  assert.ok(liveDetailCursor);
  const second = await service.getLiveRun({
    ...request,
    cursor: liveDetailCursor,
  });
  assert.deepEqual(second.students.map((student) => student.studentId), [
    "student_c",
  ]);
  assert.equal(second.students[0].status, "not_started");
  await firestore.doc(path).update({revision: 5});
  await expectCode(
    service.getLiveRun({...request, cursor: liveDetailCursor}),
    "CONFLICT",
  );
  await firestore.doc(path).update({revision: 4});
  await firestore.doc(`institutes/${instituteId}/license/main`).update({
    currentLayer: "L0",
  });
  const redacted = await service.getLiveRun(request);
  assert.equal(redacted.students[0].progressPercent, 40);
  assert.equal(redacted.students[0].currentPhase, null);
  assert.equal(redacted.students[0].provisionalRiskScore, null);
  assert.equal(redacted.students[0].controlledCompliancePercent, null);
  await deleteInstitute(instituteId);
});

test("history binds year and filters while redacting analytics by current license", async () => {
  const instituteId = "inst_read_history";
  await deleteInstitute(instituteId);
  const oldFirst = runPath(instituteId, "2025", "run_old_first");
  const oldSecond = runPath(instituteId, "2025", "run_old_second");
  const analytics = {
    avgAccuracyPercent: 81,
    avgDisciplineIndex: 72,
    avgRawScorePercent: 69,
    completionRatePercent: 100,
    controlledCompliancePercent: 87,
    executionStability: "stable",
    riskDistribution: {Stable: 2},
  };
  await Promise.all([
    firestore.doc(`institutes/${instituteId}/license/main`).set({
      currentLayer: "L0",
    }),
    firestore.doc(oldFirst).set(runData({
      createdAt: "2025-09-15T10:00:00.000Z",
      status: "completed",
      yearId: "2025",
    })),
    firestore.doc(oldSecond).set(runData({
      createdAt: "2025-09-14T10:00:00.000Z",
      status: "stopped",
      yearId: "2025",
    })),
    firestore.doc(runPath(instituteId, "2025", "run_old_active")).set(runData({
      createdAt: "2025-09-13T10:00:00.000Z",
      status: "active",
      yearId: "2025",
    })),
    firestore.doc(runPath(instituteId, "2026", "run_current")).set(runData({
      createdAt: "2026-09-15T10:00:00.000Z",
      status: "completed",
    })),
    firestore.doc(
      `institutes/${instituteId}/academicYears/2025/runAnalytics/run_old_first`,
    ).set(analytics),
    firestore.doc(
      `institutes/${instituteId}/academicYears/2025/runAnalytics/run_old_second`,
    ).set(analytics),
  ]);
  const service = buildService();
  const oldRequest = service.normalizeHistoryRequest({
    academicYear: "2025",
    actorId: "teacher_1",
    actorRole: "teacher",
    instituteId,
    limit: 1,
    mode: "Operational",
  });
  const first = await service.listRunHistory(oldRequest);
  assert.deepEqual(first.runs.map((entry) => entry.run.id), ["run_old_first"]);
  assert.equal(first.runs[0].analytics.avgRawScorePercent, 69);
  assert.equal(first.runs[0].analytics.avgDisciplineIndex, null);
  assert.equal(first.runs[0].analytics.riskDistribution, null);
  const historyCursor = first.nextCursor;
  assert.ok(historyCursor);
  const second = await service.listRunHistory({
    ...oldRequest,
    cursor: historyCursor,
  });
  assert.deepEqual(second.runs.map((entry) => entry.run.id), ["run_old_second"]);
  assert.equal(second.runs[0].run.status, "terminated");
  await expectCode(service.listRunHistory({
    ...oldRequest,
    academicYear: "2026",
    cursor: historyCursor,
  }), "VALIDATION_ERROR");
  await firestore.doc(`institutes/${instituteId}/license/main`).update({
    currentLayer: "L2",
  });
  const advanced = await service.listRunHistory({...oldRequest, limit: 2});
  assert.equal(advanced.runs[0].analytics.avgDisciplineIndex, 72);
  assert.deepEqual(advanced.runs[0].analytics.riskDistribution, {Stable: 2});
  const current = await service.listRunHistory(
    service.normalizeHistoryRequest({
      actorId: "admin_1",
      actorRole: "admin",
      instituteId,
    }),
  );
  assert.deepEqual(current.runs.map((entry) => entry.run.id), ["run_current"]);
  await deleteInstitute(instituteId);
});
