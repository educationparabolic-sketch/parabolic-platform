import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
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

const createHashForTest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const encodeBase64Url = (value: string): string =>
  Buffer.from(value).toString("base64url");

const buildCustomLaunchToken = (
  claims: Record<string, unknown>,
  expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600,
): string => `${encodeBase64Url(JSON.stringify({alg: "none", typ: "JWT"}))}.` +
  `${encodeBase64Url(JSON.stringify({claims, exp: expiresAtSeconds}))}.local`;

const createSessionServiceForTests = (): SessionService =>
  new SessionService(async (uid, claims) =>
    `signed-session-token:${uid}:${claims.sessionId}`);

const timingProfileSnapshotFixture = {
  easy: {max: 60, min: 30, recommended: 45},
  hard: {max: 210, min: 150, recommended: 180},
  medium: {max: 150, min: 60, recommended: 105},
};

const expectedQuestionTime = (
  difficulty: keyof typeof timingProfileSnapshotFixture,
) => {
  const window = timingProfileSnapshotFixture[difficulty];
  const allocate = (percent: number) => ({
    max: window.max * percent / 100,
    min: window.min * percent / 100,
    recommended: window.recommended * percent / 100,
  });

  return {
    bufferTimeSpent: 0,
    cumulativeTimeSpent: 0,
    enteredAt: null,
    exitedAt: null,
    lastEntryTimestamp: null,
    maxTime: window.max,
    minTime: window.min,
    phase1TimeSpent: 0,
    phase2TimeSpent: 0,
    phase3TimeSpent: 0,
    phaseTimingRules: {
      buffer: {max: 0, min: 0, recommended: 0},
      phase1: allocate(40),
      phase2: allocate(45),
      phase3: allocate(15),
    },
    recommendedTime: window.recommended,
  };
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

const seedAcademicYear = async (
  instituteId: string,
  yearId: string,
  status = "active",
): Promise<void> => {
  await firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}`,
  ).set({
    status,
  });
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
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({
      currentLayer: "L1",
      eligibilityFlags: {
        l1Eligible: true,
      },
      featureFlags: {
        controlledMode: true,
        hardMode: false,
      },
    });
    await firestore.doc(questionEasyPath).set({difficulty: "Easy"});
    await firestore.doc(questionHardPath).set({difficulty: "Hard"});
    await firestore.doc(questionMediumPath).set({difficulty: "Medium"});
    await firestore.doc(runPath).set({
      calibrationVersion: "cal_v2026_04",
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      questionIds: [
        "q_build_31_easy",
        "q_build_31_hard",
        "q_build_31_medium",
      ],
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v3",
      runId,
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      testId: "test_build_26_success",
      templateVersion: "7",
      timingProfileSnapshot: timingProfileSnapshotFixture,
    });

    const launchContext = {
      instituteId,
      intent: "start" as const,
      licenseLayer: "L1" as const,
      runId,
      studentId,
      studentUid: `uid_${studentId}`,
    };
    const concurrentResults = await Promise.all([
      sessionService.startSession(launchContext),
      sessionService.startSession(launchContext),
    ]);
    assert.deepEqual(
      concurrentResults.map((entry) => entry.disposition).sort(),
      ["created", "replayed"],
    );
    assert.equal(concurrentResults[0].sessionId, concurrentResults[1].sessionId);
    const result = concurrentResults.find(
      (entry) => entry.disposition === "created",
    ) ?? concurrentResults[0];
    const resumed = await sessionService.startSession({
      ...launchContext,
      intent: "resume",
    });
    assert.equal(resumed.disposition, "resumed");
    assert.equal(resumed.sessionId, result.sessionId);

    assert.equal(result.status, "created");
    assert.equal(result.disposition, "created");
    assert.equal(result.yearId, yearId);
    assert.ok(result.sessionId.length > 0);
    assert.match(
      result.sessionPath,
      new RegExp(`runs/${runId}/sessions/${result.sessionId}$`),
    );
    assert.match(
      result.launchCredential,
      new RegExp(`signed-session-token:uid_${studentId}:`),
    );
    assert.equal(result.operationalDataAccessPolicy.tier, "HOT");
    assert.equal(
      result.operationalDataAccessPolicy.liveSessionPath,
      result.sessionPath,
    );
    assert.deepEqual(
      result.operationalDataAccessPolicy.allowedOperationalCollections,
      ["sessions"],
    );

    const sessionSnapshot = await firestore.doc(result.sessionPath).get();
    const sessionData = sessionSnapshot.data();
    assert.equal(sessionData?.sessionId, result.sessionId);
    assert.equal(sessionData?.instituteId, instituteId);
    assert.equal(sessionData?.yearId, yearId);
    assert.equal(sessionData?.runId, runId);
    assert.equal(sessionData?.mode, "Diagnostic");
    assert.equal(sessionData?.studentId, studentId);
    assert.equal(sessionData?.studentUid, `uid_${studentId}`);
    assert.equal(sessionData?.status, "created");
    assert.equal(sessionData?.submissionLock, false);
    assert.equal(sessionData?.calibrationVersion, "cal_v2026_04");
    assert.equal(sessionData?.riskModelVersion, "risk_v3");
    assert.equal(sessionData?.templateVersion, "7");
    assert.deepEqual(sessionData?.licenseSnapshot, {
      currentLayer: "L1",
      eligibilityFlags: {
        l1Eligible: true,
      },
      featureFlags: {
        controlledMode: true,
        hardMode: false,
      },
    });
    assert.deepEqual(sessionData?.phaseConfigSnapshot, {
      phase1Percent: 40,
      phase2Percent: 45,
      phase3Percent: 15,
    });
    assert.deepEqual(sessionData?.templateSnapshot, {
      questionIds: [
        "q_build_31_easy",
        "q_build_31_hard",
        "q_build_31_medium",
      ],
      templateVersion: "7",
      testId: "test_build_26_success",
    });
    assert.deepEqual(sessionData?.operationalDataAccessPolicy, {
      allowedOperationalCollections: ["sessions"],
      archiveExportPolicy: "BigQuery export only during academic-year archive",
      liveSessionPath: result.sessionPath,
      prohibitedRuntimeSources: [
        "runAnalytics",
        "studentYearMetrics",
        "questionAnalytics",
        "BigQuery",
      ],
      summarySinksAfterSubmission: [
        "runAnalytics",
        "studentYearMetrics",
        "questionAnalytics",
      ],
      tier: "HOT",
      writeModel: "incremental session document updates",
    });
    assert.deepEqual(sessionData?.answerMap, {});
    assert.deepEqual(
      sessionData?.timingProfileSnapshot,
      timingProfileSnapshotFixture,
    );
    assert.deepEqual(sessionData?.questionTimeMap, {
      q_build_31_easy: expectedQuestionTime("easy"),
      q_build_31_hard: expectedQuestionTime("hard"),
      q_build_31_medium: expectedQuestionTime("medium"),
    });
    assert.equal(sessionData?.startedAt, null);
    assert.equal(sessionData?.submittedAt, null);
    assert.equal(sessionData?.version, 1);
    assert.deepEqual(sessionData?.launchCredentialHashes, [
      createHashForTest(result.launchCredential),
    ]);
    assert.deepEqual(sessionData?.consumedLaunchCredentialHashes, []);
    assert.ok(sessionData?.createdAt instanceof Timestamp);
    assert.ok(sessionData?.updatedAt instanceof Timestamp);

    const sessionsSnapshot = await firestore
      .collection(`${runPath}/sessions`)
      .where("studentId", "==", studentId)
      .get();
    assert.equal(sessionsSnapshot.size, 1);

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
  "validateSessionEntry consumes once and rejects replay, expiry, and wrong session",
  async () => {
    const sessionService = createSessionServiceForTests();
    const context = {
      instituteId: "inst_bwm_018_entry",
      launchNonce: "nonce_bwm_018_entry",
      licenseLayer: "L1" as const,
      runId: "run_bwm_018_entry",
      sessionId: "session_bwm_018_entry",
      studentId: "student_bwm_018_entry",
      studentUid: "uid_bwm_018_entry",
      yearId: "2026",
    };
    const sessionPath =
      `institutes/${context.instituteId}/academicYears/${context.yearId}/` +
      `runs/${context.runId}/sessions/${context.sessionId}`;
    const claims = {
      instituteId: context.instituteId,
      launchNonce: context.launchNonce,
      licenseLayer: context.licenseLayer,
      role: "student",
      runId: context.runId,
      sessionId: context.sessionId,
      studentId: context.studentId,
      yearId: context.yearId,
    };
    const launchCredential = buildCustomLaunchToken(claims);
    const launchCredentialHash = createHashForTest(launchCredential);
    await firestore.doc(sessionPath).set({
      consumedLaunchCredentialHashes: [],
      instituteId: context.instituteId,
      launchCredentialHashes: [launchCredentialHash],
      licenseSnapshot: {currentLayer: "L1"},
      mode: "Operational",
      phaseConfigSnapshot: {phase1Percent: 100},
      runId: context.runId,
      sessionId: context.sessionId,
      sessionTokenHash: launchCredentialHash,
      status: "created",
      studentId: context.studentId,
      studentUid: context.studentUid,
      templateSnapshot: {templateVersion: "1"},
      timingProfileSnapshot: timingProfileSnapshotFixture,
      yearId: context.yearId,
    });

    try {
      const result = await sessionService.validateSessionEntry({
        ...context,
        sessionToken: launchCredential,
      });
      assert.equal(result.sessionId, context.sessionId);
      const consumedSnapshot = await firestore.doc(sessionPath).get();
      assert.deepEqual(consumedSnapshot.data()?.launchCredentialHashes, []);
      assert.deepEqual(
        consumedSnapshot.data()?.consumedLaunchCredentialHashes,
        [launchCredentialHash],
      );
      assert.equal(consumedSnapshot.data()?.sessionTokenHash, undefined);

      await assert.rejects(
        sessionService.validateSessionEntry({
          ...context,
          sessionToken: launchCredential,
        }),
        (error: unknown) =>
          error instanceof SessionStartValidationError &&
          error.code === "UNAUTHORIZED" &&
          error.message === "Launch credential has already been consumed.",
      );
      await assert.rejects(
        sessionService.validateSessionEntry({
          ...context,
          sessionId: "session_bwm_018_wrong",
          sessionToken: launchCredential,
        }),
        (error: unknown) =>
          error instanceof SessionStartValidationError &&
          error.code === "UNAUTHORIZED",
      );
      await assert.rejects(
        sessionService.validateSessionEntry({
          ...context,
          sessionToken: buildCustomLaunchToken(
            claims,
            Math.floor(Date.now() / 1000) - 1,
          ),
        }),
        (error: unknown) =>
          error instanceof SessionStartValidationError &&
          error.code === "UNAUTHORIZED" &&
          error.message === "Session token has expired.",
      );
    } finally {
      await deleteDocumentIfPresent(sessionPath);
    }
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
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      calibrationVersion: "cal_v2026_04",
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v1",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      status: "scheduled",
      templateVersion: "1",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
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
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      calibrationVersion: "cal_v2026_04",
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      questionIds: ["q_build_31_missing_timing_question"],
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v1",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      templateVersion: "1",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
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
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      calibrationVersion: "cal_v2026_04",
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      questionIds: ["q_build_31_missing_from_bank"],
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v1",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      templateVersion: "1",
      timingProfileSnapshot: timingProfileSnapshotFixture,
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
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
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      recipientStudentIds: ["some_other_student"],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
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
  "startSession fails closed when multiple active sessions already exist",
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
    const conflictingSessionPath = `${runPath}/sessions/session_conflicting`;

    await deleteDocumentIfPresent(institutePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(existingSessionPath);
    await deleteDocumentIfPresent(conflictingSessionPath);
    await deleteDocumentIfPresent(runPath);

    await firestore.doc(institutePath).set({instituteId});
    await seedAcademicYear(instituteId, yearId);
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
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
    await firestore.doc(conflictingSessionPath).set({
      sessionId: "session_conflicting",
      status: "created",
      studentId,
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "CONFLICT");
        return true;
      },
    );

    await deleteDocumentIfPresent(conflictingSessionPath);
    await deleteDocumentIfPresent(existingSessionPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "startSession rejects archived academic years from operational access",
  async () => {
    const sessionService = createSessionServiceForTests();
    const instituteId = "inst_build_105_archived_year";
    const yearId = "2025";
    const runId = "run_build_105_archived_year";
    const studentId = "student_build_105_archived_year";
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
    await seedAcademicYear(instituteId, yearId, "archived");
    await firestore.doc(studentPath).set({status: "active", studentId});
    await firestore.doc(licensePath).set({currentLayer: "L1"});
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      questionIds: ["q_build_31_easy"],
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      status: "scheduled",
      templateVersion: "7",
      timingProfileSnapshot: timingProfileSnapshotFixture,
    });

    await assert.rejects(
      sessionService.startSession({
        instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId,
        studentId,
        studentUid: `uid_${studentId}`,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SessionStartValidationError);
        assert.equal(error.code, "CONFLICT");
        assert.match(error.message, /no current operational academic year/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(institutePath);
  },
);
