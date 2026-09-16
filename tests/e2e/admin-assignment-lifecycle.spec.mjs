import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {
  getAuth,
} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
  Timestamp,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_014_assignment_browser";
const otherInstituteId = "inst_bwm_014_assignment_other";
const yearId = "2026";
const templateId = "test-bwm-014-assignment";
const canonicalId = "canonical-bwm-014-assignment";
const templateName = "BWM-014 Authoritative Assignment";
const questionId = "question-bwm-014-assignment";
const studentId = "student-bwm-014-recipient";
const studentName = "BWM-014 Recipient Student";
const liveRunId = "run-bwm-028-live-browser";
const liveSessionId = "session-bwm-028-live-browser";
const concurrentOperationRunId = "run-bwm-028-concurrent-operation";
const oldYearRunId = "run-bwm-028-old-year-live";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let teacherEmail;
let teacherPassword;
let teacherUid;
let studentEmail;
let studentPassword;
let studentUid;
let otherTeacherEmail;
let otherTeacherPassword;
let otherTeacherUid;
let l0TeacherEmail;
let l0TeacherPassword;
let l0TeacherUid;
let suspendedTeacherEmail;
let suspendedTeacherPassword;
let suspendedTeacherUid;
let unlicensedTeacherEmail;
let unlicensedTeacherPassword;
let unlicensedTeacherUid;

test.use({bypassCSP: true});

function toLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

async function signInThroughAuthEmulator(request, email, password) {
  const response = await request.post(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    {data: {email, password, returnSecureToken: true}},
  );
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.idToken).toBeTruthy();
  return payload.idToken;
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();

  adminApp = initializeApp(
    {projectId},
    `admin-assignment-lifecycle-${Date.now()}`,
  );
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);

  await Promise.all([
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    ),
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(otherInstituteId),
    ),
  ]);

  teacherEmail = `assignment-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-014-assignment-teacher";
  const teacher = await auth.createUser({
    email: teacherEmail,
    password: teacherPassword,
  });
  teacherUid = teacher.uid;
  await auth.setCustomUserClaims(teacherUid, {
    instituteId,
    licenseLayer: "L2",
    role: "teacher",
  });

  studentEmail = `assignment-student-${Date.now()}@example.test`;
  studentPassword = "bwm-014-assignment-student";
  const student = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = student.uid;
  await auth.setCustomUserClaims(studentUid, {
    instituteId,
    licenseLayer: "L2",
    role: "student",
    studentId,
  });

  otherTeacherEmail = `assignment-other-${Date.now()}@example.test`;
  otherTeacherPassword = "bwm-014-assignment-other";
  const otherTeacher = await auth.createUser({
    email: otherTeacherEmail,
    password: otherTeacherPassword,
  });
  otherTeacherUid = otherTeacher.uid;
  await auth.setCustomUserClaims(otherTeacherUid, {
    instituteId: otherInstituteId,
    licenseLayer: "L2",
    role: "teacher",
  });

  l0TeacherEmail = `assignment-l0-${Date.now()}@example.test`;
  l0TeacherPassword = "bwm-028-assignment-l0";
  const l0Teacher = await auth.createUser({
    email: l0TeacherEmail,
    password: l0TeacherPassword,
  });
  l0TeacherUid = l0Teacher.uid;
  await auth.setCustomUserClaims(l0TeacherUid, {
    instituteId,
    licenseLayer: "L0",
    role: "teacher",
  });

  suspendedTeacherEmail = `assignment-suspended-${Date.now()}@example.test`;
  suspendedTeacherPassword = "bwm-028-assignment-suspended";
  const suspendedTeacher = await auth.createUser({
    email: suspendedTeacherEmail,
    password: suspendedTeacherPassword,
  });
  suspendedTeacherUid = suspendedTeacher.uid;
  await auth.setCustomUserClaims(suspendedTeacherUid, {
    instituteId,
    isSuspended: true,
    licenseLayer: "L2",
    role: "teacher",
  });

  unlicensedTeacherEmail = `assignment-unlicensed-${Date.now()}@example.test`;
  unlicensedTeacherPassword = "bwm-028-assignment-unlicensed";
  const unlicensedTeacher = await auth.createUser({
    email: unlicensedTeacherEmail,
    password: unlicensedTeacherPassword,
  });
  unlicensedTeacherUid = unlicensedTeacher.uid;
  await auth.setCustomUserClaims(unlicensedTeacherUid, {
    instituteId,
    role: "teacher",
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  const otherInstitute = firestore
    .collection("institutes")
    .doc(otherInstituteId);
  await Promise.all([
    institute.set({
      calibrationVersion: "cal-bwm-014",
      profile: {instituteName: "BWM-014 Assignment Institute"},
    }),
    year.set({label: yearId, locked: false, status: "Active"}),
    institute.collection("academicYears").doc("2025").set({
      label: "2025",
      locked: true,
      status: "Locked",
    }),
    institute.collection("license").doc("main").set({
      currentLayer: "L2",
      featureFlags: {controlledMode: true, hardMode: true},
    }),
    institute.collection("students").doc(studentId).set({
      batchId: "batch-bwm-014",
      batchName: "BWM-014 Batch",
      email: studentEmail,
      fullName: studentName,
      status: "active",
      studentId,
    }),
    year.collection("studentYearMetrics").doc(studentId).set({
      avgAccuracyPercent: 79,
      avgRawScorePercent: 68,
      batchId: "batch-bwm-014",
      batchName: "BWM-014 Batch",
      disciplineIndex: 84,
      rollingRiskCluster: "low",
      studentId,
      studentName,
      topicWeaknessSummary: "Kinematics",
    }),
    institute.collection("questionBank").doc(questionId).set({
      academicYear: yearId,
      additionalTag: "assignment-browser-proof",
      chapter: "Kinematics",
      correctAnswer: "A",
      createdAt: Timestamp.now(),
      difficulty: "Easy",
      examType: "JEEMains",
      internalNotes: null,
      lastUsedAt: null,
      marks: 4,
      negativeMarks: 1,
      parentQuestionId: null,
      primaryTag: "mechanics",
      questionId,
      questionImageUrl: "",
      questionType: "MCQ",
      simulationLink: null,
      solutionImageUrl: "",
      status: "active",
      subject: "Physics",
      tags: ["mechanics", "motion"],
      topic: "Motion",
      tutorialVideoLink: null,
      uniqueKey: "bwm-014-assignment-browser-question",
      usedCount: 0,
      version: 1,
    }),
    otherInstitute.set({
      calibrationVersion: "cal-bwm-014-other",
      profile: {instituteName: "BWM-014 Other Institute"},
    }),
    otherInstitute.collection("academicYears").doc(yearId).set({
      label: yearId,
      locked: false,
      status: "Active",
    }),
    otherInstitute.collection("license").doc("main").set({
      currentLayer: "L2",
      featureFlags: {controlledMode: true, hardMode: true},
    }),
  ]);

  await institute.collection("tests").doc(templateId).set({
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    canonicalId,
    createdAt: Timestamp.now(),
    difficultyDistribution: {easy: 1, hard: 0, medium: 0},
    examType: "JEEMains",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: [questionId],
    selectionMethod: "manual",
    status: "ready",
    templateName,
    testId: templateId,
    timingProfile: {
      easy: {max: 60, min: 30, recommended: 45},
      hard: {max: 210, min: 150, recommended: 180},
      medium: {max: 150, min: 60, recommended: 105},
    },
    totalDurationMinutes: 30,
    totalRuns: 0,
    updatedAt: Timestamp.now(),
    version: 1,
  });

  const now = Date.now();
  const activeRun = (runId, academicYear = yearId) => ({
    academicYear,
    attemptLimit: 1,
    calibrationVersion: "cal-bwm-028",
    canonicalId,
    createdAt: Timestamp.fromMillis(now - 3_600_000),
    difficultyDistribution: {easy: 1, hard: 0, medium: 0},
    endWindow: Timestamp.fromMillis(now + 7_200_000),
    gracePeriodMinutes: 5,
    licenseLayer: "L2",
    mode: "Operational",
    modeSnapshot: "Operational",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    proctoringPolicy: {
      browserIntegrityGuardEnabled: true,
      faceIdentityGazeGuardEnabled: false,
    },
    questionIds: [questionId],
    recipientCount: 1,
    recipientStudentIds: [studentId],
    revision: 1,
    riskModelVersion: "risk-bwm-028",
    runId,
    shuffleEnabled: false,
    shuffleQuestionOrder: false,
    startWindow: Timestamp.fromMillis(now - 1_800_000),
    status: "active",
    testId: templateId,
    testName: templateName,
    templateVersion: 1,
    timezone: "Asia/Kolkata",
    timingProfileSnapshot: {totalDurationMinutes: 120},
    totalSessions: 1,
    updatedAt: Timestamp.fromMillis(now - 1_800_000),
  });
  const liveRunPath = year.collection("runs").doc(liveRunId);
  await Promise.all([
    liveRunPath.set(activeRun(liveRunId)),
    year.collection("runs").doc(concurrentOperationRunId).set(
      activeRun(concurrentOperationRunId),
    ),
    institute.collection("academicYears").doc("2025")
      .collection("runs").doc(oldYearRunId).set(
        activeRun(oldYearRunId, "2025"),
      ),
    liveRunPath.collection("sessions").doc(liveSessionId).set({
      adaptivePhaseSnapshot: {answeredPercent: 35, currentPhase: "phase1"},
      controlledCompliancePercent: 92,
      createdAt: Timestamp.fromMillis(now - 1_800_000),
      deadlineAt: Timestamp.fromMillis(now + 7_200_000),
      instituteId,
      maxTimeViolationCount: 0,
      minTimeViolationCount: 1,
      overrideUsed: false,
      pacingDrift: false,
      progressPercent: 35,
      rapidGuess: false,
      revision: 1,
      runId: liveRunId,
      sessionId: liveSessionId,
      skipBurst: false,
      status: "active",
      studentId,
      submissionLock: false,
      updatedAt: Timestamp.fromMillis(now - 300_000),
      version: 1,
      yearId,
    }),
  ]);
});

test.afterAll(async () => {
  if (!adminApp) {
    return;
  }

  await Promise.all([
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    ),
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(otherInstituteId),
    ),
  ]);
  const userIds = [
    teacherUid,
    studentUid,
    otherTeacherUid,
    l0TeacherUid,
    suspendedTeacherUid,
    unlicensedTeacherUid,
  ].filter(Boolean);
  if (userIds.length > 0) {
    await getAuth(adminApp).deleteUsers(userIds);
  }
  await deleteApp(adminApp);
});

test(
  "Admin completes the authoritative assignment lifecycle without mocks",
  async ({page, request}) => {
    test.setTimeout(300_000);

    const teacherToken = await signInThroughAuthEmulator(
      request,
      teacherEmail,
      teacherPassword,
    );
    const studentToken = await signInThroughAuthEmulator(
      request,
      studentEmail,
      studentPassword,
    );
    const otherTeacherToken = await signInThroughAuthEmulator(
      request,
      otherTeacherEmail,
      otherTeacherPassword,
    );
    const l0TeacherToken = await signInThroughAuthEmulator(
      request,
      l0TeacherEmail,
      l0TeacherPassword,
    );
    const suspendedTeacherToken = await signInThroughAuthEmulator(
      request,
      suspendedTeacherEmail,
      suspendedTeacherPassword,
    );
    const unlicensedTeacherToken = await signInThroughAuthEmulator(
      request,
      unlicensedTeacherEmail,
      unlicensedTeacherPassword,
    );

    const studentListDenied = await request.get("/api/v1/admin/runs", {
      headers: {Authorization: `Bearer ${studentToken}`},
    });
    expect(studentListDenied.status()).toBe(403);
    expect((await studentListDenied.json()).error.code).toBe("FORBIDDEN");

    const l0LiveList = await request.get("/api/v1/admin/live-runs?limit=1", {
      headers: {Authorization: `Bearer ${l0TeacherToken}`},
    });
    expect(l0LiveList.status()).toBe(200);
    expect((await l0LiveList.json()).data.runs).toHaveLength(1);

    const suspendedLiveList = await request.get("/api/v1/admin/live-runs", {
      headers: {Authorization: `Bearer ${suspendedTeacherToken}`},
    });
    expect(suspendedLiveList.status()).toBe(403);
    expect((await suspendedLiveList.json()).error.code).toBe("FORBIDDEN");

    const unlicensedLiveList = await request.get("/api/v1/admin/live-runs", {
      headers: {Authorization: `Bearer ${unlicensedTeacherToken}`},
    });
    expect(unlicensedLiveList.status()).toBe(401);
    expect((await unlicensedLiveList.json()).error.code).toBe("UNAUTHORIZED");

    const overBoundedLiveList = await request.get(
      "/api/v1/admin/live-runs?limit=51",
      {headers: {Authorization: `Bearer ${teacherToken}`}},
    );
    expect(overBoundedLiveList.status()).toBe(400);
    expect((await overBoundedLiveList.json()).error.code)
      .toBe("VALIDATION_ERROR");

    const otherTenantList = await request.get("/api/v1/admin/runs", {
      headers: {Authorization: `Bearer ${otherTeacherToken}`},
    });
    expect(otherTenantList.status()).toBe(200);
    expect((await otherTenantList.json()).data.runs).toEqual([]);
    const otherTenantLiveList = await request.get(
      "/api/v1/admin/live-runs",
      {headers: {Authorization: `Bearer ${otherTeacherToken}`}},
    );
    expect(otherTenantLiveList.status()).toBe(200);
    expect((await otherTenantLiveList.json()).data.runs).toEqual([]);

    let analyticsRequestCount = 0;
    const createResponses = [];
    page.on("request", (browserRequest) => {
      if (new URL(browserRequest.url()).pathname === "/api/v1/admin/analytics") {
        analyticsRequestCount += 1;
      }
    });
    page.on("response", (response) => {
      if (
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "POST"
      ) {
        createResponses.push(response);
      }
    });

    const initialTemplatesResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const initialStudentsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/students" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.addInitScript(() => {
      const route = window.sessionStorage.getItem(
        "bwm014.adminAssignmentRoute",
      ) ?? "/admin/assignments/create";
      window.history.replaceState(null, "", route);
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(teacherEmail);
    await page.getByLabel("Password", {exact: true}).fill(teacherPassword);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await Promise.all([initialTemplatesResponse, initialStudentsResponse]);
    await expect(page.locator("#admin-assignments-title"))
      .toBeVisible({timeout: 90_000});

    const templateChoice = page.getByLabel(templateName, {exact: false});
    await expect(templateChoice).toBeVisible();
    await templateChoice.check();
    await page.getByRole("button", {name: "Continue to Mode Selection"})
      .click();
    await page.getByLabel("Operational", {exact: false}).check();
    await page.getByRole("button", {name: "Continue to Recipient Selection"})
      .click();
    await page.getByLabel("Selecting by Individual Student").check();
    const recipientRow = page.getByRole("row").filter({hasText: studentId});
    await expect(recipientRow).toContainText(studentName);
    await recipientRow.getByRole("checkbox").check();
    await expect(
      page.getByLabel("Recipient resolution preview").getByText(
        "1",
        {exact: true},
      ).first(),
    ).toBeVisible();
    await page.getByRole("button", {name: "Continue to Schedule"}).click();

    const scheduledStart = new Date(Date.now() + (2 * 60 * 60 * 1000));
    scheduledStart.setSeconds(0, 0);
    await page.getByLabel("Test Starts").fill(
      toLocalDateTimeInput(scheduledStart),
    );
    await page.getByLabel("Shuffle Question Order").check();
    await page.getByRole("button", {name: "Review Final Snapshot"}).click();
    await expect(page.getByLabel("Assignment confirmation snapshot"))
      .toContainText("1 student");

    const listResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {
      name: "Schedule And Publish Assignment",
    }).click();
    await listResponsePromise;
    await expect.poll(() => createResponses.length, {timeout: 90_000})
      .toBe(2);

    const createEnvelopes = await Promise.all(
      createResponses.map((response) => response.json()),
    );
    expect(createResponses.map((response) => response.status()).sort())
      .toEqual([200, 201]);
    expect(createEnvelopes.map((envelope) => envelope.data.disposition).sort())
      .toEqual(["created", "replayed"]);
    const createdRun = createEnvelopes[0].data.run;
    expect(createEnvelopes[1].data.run).toEqual(createdRun);
    expect(createdRun.recipientStudentIds).toEqual([studentId]);
    expect(createdRun.recipientCount).toBe(1);
    expect(createdRun.testId).toBe(templateId);
    expect(createdRun.templateVersion).toBe(1);
    expect(createdRun.status).toBe("scheduled");
    expect(createdRun.shuffleQuestionOrder).toBe(true);

    const illegalTermination = await request.post(
      `/api/v1/admin/runs/${createdRun.id}/lifecycle`,
      {
        data: {
          action: "terminate",
          expectedRevision: 1,
          idempotencyKey: "bwm-028-illegal-scheduled-termination",
          justification: "Must be rejected for a scheduled run.",
        },
        headers: {Authorization: `Bearer ${teacherToken}`},
      },
    );
    expect(illegalTermination.status()).toBe(409);
    expect((await illegalTermination.json()).error.code).toBe("CONFLICT");

    const concurrentOperationPayload = {
      action: "extend",
      expectedRevision: 1,
      extensionMinutes: 5,
      idempotencyKey: "bwm-028-concurrent-operation-proof",
      justification: "Concurrent command convergence proof.",
    };
    const concurrentOperationResponses = await Promise.all([
      request.post(
        `/api/v1/admin/runs/${concurrentOperationRunId}/lifecycle`,
        {
          data: concurrentOperationPayload,
          headers: {Authorization: `Bearer ${teacherToken}`},
        },
      ),
      request.post(
        `/api/v1/admin/runs/${concurrentOperationRunId}/lifecycle`,
        {
          data: concurrentOperationPayload,
          headers: {Authorization: `Bearer ${teacherToken}`},
        },
      ),
    ]);
    expect(concurrentOperationResponses.map((response) => response.status()))
      .toEqual([200, 200]);
    const concurrentOperationEnvelopes = await Promise.all(
      concurrentOperationResponses.map((response) => response.json()),
    );
    expect(concurrentOperationEnvelopes
      .map((envelope) => envelope.data.disposition).sort())
      .toEqual(["applied", "replayed"]);
    expect(concurrentOperationEnvelopes[0].data.run)
      .toEqual(concurrentOperationEnvelopes[1].data.run);

    const unsupportedOverride = await request.post(
      `/api/v1/admin/runs/${liveRunId}/sessions/${liveSessionId}/overrides`,
      {
        data: {
          expectedRunRevision: 1,
          expectedSessionRevision: 1,
          idempotencyKey: "bwm-028-unsupported-face-override",
          justification: "Unsupported browser request.",
          overrideType: "face_override",
        },
        headers: {Authorization: `Bearer ${teacherToken}`},
      },
    );
    expect(unsupportedOverride.status()).toBe(400);
    expect((await unsupportedOverride.json()).error.code)
      .toBe("VALIDATION_ERROR");

    const otherTenantLiveDetail = await request.get(
      `/api/v1/admin/live-runs/${liveRunId}`,
      {headers: {Authorization: `Bearer ${otherTeacherToken}`}},
    );
    expect(otherTenantLiveDetail.status()).toBe(404);

    await expect(page.locator("#admin-assignments-title"))
      .toHaveText("Assignment List");
    await expect(page.locator("#admin-assignments-title"))
      .toBeVisible();
    let createdRow = page.getByRole("row").filter({hasText: createdRun.id});
    await expect(createdRow).toContainText(templateName);
    await expect(createdRow).toContainText(canonicalId);
    await expect(createdRow).toContainText("1 authoritative recipients");

    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "bwm014.adminAssignmentRoute",
        "/admin/assignments/list",
      );
    });
    const reloadListResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    const reloadEnvelope = await (await reloadListResponse).json();
    expect(reloadEnvelope.data.runs.map((run) => run.id))
      .toContain(createdRun.id);
    createdRow = page.getByRole("row").filter({hasText: createdRun.id});
    await expect(createdRow).toBeVisible();

    const detailResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${createdRun.id}` &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await createdRow.getByRole("button", {name: "View Details"}).click();
    const detailEnvelope = await (await detailResponsePromise).json();
    expect(detailEnvelope.data.run).toEqual(createdRun);
    await expect(page.getByRole("heading", {
      name: "Authoritative Assignment Detail",
    })).toBeVisible();
    await expect(page.getByRole("heading", {name: createdRun.id}))
      .toBeVisible();
    await expect(page.getByText(studentId, {exact: true})).toBeVisible();
    await expect(page.getByRole("heading", {
      name: "Outcome analytics unavailable in this contract",
    })).toBeVisible();
    expect(analyticsRequestCount).toBe(0);

    const persistedRun = await firestore.doc(createdRun.runPath).get();
    expect(persistedRun.exists).toBe(true);
    expect(persistedRun.data().recipientStudentIds).toEqual([studentId]);
    expect(persistedRun.data().recipientCount).toBe(1);
    expect(persistedRun.data().canonicalId).toBe(canonicalId);
    expect(persistedRun.data().templateVersion).toBe("1");

    const otherTenantDetail = await request.get(
      `/api/v1/admin/runs/${createdRun.id}`,
      {headers: {Authorization: `Bearer ${otherTeacherToken}`}},
    );
    expect(otherTenantDetail.status()).toBe(404);
    expect((await otherTenantDetail.json()).error.code).toBe("NOT_FOUND");
    const studentDetailDenied = await request.get(
      `/api/v1/admin/runs/${createdRun.id}`,
      {headers: {Authorization: `Bearer ${studentToken}`}},
    );
    expect(studentDetailDenied.status()).toBe(403);
    expect((await studentDetailDenied.json()).error.code).toBe("FORBIDDEN");

    const liveListResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/live-runs" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("link", {name: "Live Runs", exact: true}).click();
    const liveListEnvelope = await (await liveListResponsePromise).json();
    expect(liveListEnvelope.data.runs.map((row) => row.run.id))
      .toContain(liveRunId);
    expect(liveListEnvelope.data.runs.map((row) => row.run.id))
      .not.toContain(oldYearRunId);
    await expect(page.getByRole("heading", {name: "Authoritative Live Runs"}))
      .toBeVisible();
    const liveRow = page.getByRole("row").filter({hasText: liveRunId});
    await expect(liveRow).toContainText("1 active");

    const liveDetailResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/live-runs/${liveRunId}` &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await liveRow.getByRole("link", {name: "Open live monitor"}).click();
    await liveDetailResponsePromise;
    await expect(page.getByRole("heading", {name: liveRunId})).toBeVisible();
    await expect(page.getByText(studentName, {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: /face/i})).toHaveCount(0);
    await expect(page.getByRole("button", {name: /cancel|stop/i}))
      .toHaveCount(0);

    await page.getByLabel("Justification").fill(
      "BWM-028 supervised browser operation proof.",
    );
    const bypassResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${liveRunId}/sessions/${liveSessionId}/overrides` &&
        response.request().method() === "POST" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Bypass minimum time"}).click();
    await bypassResponsePromise;
    await expect(page.getByRole("status"))
      .toContainText("Minimum-time bypass reconciled");

    await page.getByLabel("Extension minutes").fill("10");
    const extendResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${liveRunId}/lifecycle` &&
        response.request().method() === "POST" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Extend window"}).click();
    await extendResponsePromise;
    await expect(page.getByRole("status")).toContainText("Run extended");

    const resendResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${liveRunId}/notifications/resend` &&
        response.request().method() === "POST" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Resend notifications"}).click();
    await resendResponsePromise;
    await expect(page.getByRole("status"))
      .toContainText("1 notification jobs queued");

    const terminateResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${liveRunId}/lifecycle` &&
        response.request().method() === "POST" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const historyResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/run-history" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Terminate run"}).click();
    await Promise.all([terminateResponsePromise, historyResponsePromise]);
    await expect(page.getByRole("heading", {
      name: "Authoritative Terminal Run History",
    })).toBeVisible();
    let historyRow = page.getByRole("row").filter({hasText: liveRunId});
    await expect(historyRow).toContainText("terminated");

    const reloadHistoryResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/run-history" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "bwm014.adminAssignmentRoute",
        "/admin/assignments/history",
      );
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await reloadHistoryResponse;
    historyRow = page.getByRole("row").filter({hasText: liveRunId});
    await expect(historyRow).toContainText("terminated");

    const liveRunSnapshot = await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}/runs/${liveRunId}`,
    ).get();
    expect(liveRunSnapshot.get("status")).toBe("terminated");
    expect(liveRunSnapshot.get("revision")).toBe(5);
    const liveSessionSnapshot = await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}/runs/${liveRunId}/` +
        `sessions/${liveSessionId}`,
    ).get();
    expect(liveSessionSnapshot.get("status")).toBe("terminated");
    expect(liveSessionSnapshot.get("revision")).toBe(3);
    expect(liveSessionSnapshot.get("overrideUsed")).toBe(true);
    const notificationJobs = await firestore.collection("emailQueue")
      .where("payload.runId", "==", liveRunId).get();
    expect(notificationJobs.size).toBe(1);
    expect(notificationJobs.docs[0].get("templateType"))
      .toBe("assignment_notification");
    const overrideLogs = await firestore
      .collection(`institutes/${instituteId}/overrideLogs`).get();
    const liveOverride = overrideLogs.docs.find(
      (document) => document.get("runId") === liveRunId,
    );
    expect(liveOverride).toBeTruthy();
    expect(liveOverride?.get("overrideType")).toBe("MIN_TIME_BYPASS");
    expect(liveOverride?.get("recoveryState")).toBe("complete");
    const auditLogs = await firestore
      .collection(`institutes/${instituteId}/auditLogs`).get();
    const liveAuditActions = auditLogs.docs
      .filter((document) => document.get("targetId") === liveRunId)
      .map((document) => document.get("actionType"));
    expect(liveAuditActions).toEqual(expect.arrayContaining([
      "EXTEND_ASSIGNMENT",
      "OVERRIDE_ASSIGNMENT_SESSION",
      "RESEND_ASSIGNMENT_NOTIFICATION",
      "TERMINATE_ASSIGNMENT",
    ]));

    const uiRequestPayload = createResponses[0].request().postDataJSON();
    const concurrentPayload = {
      ...uiRequestPayload,
      idempotencyKey: "bwm-014-concurrent-browser-proof",
    };
    const concurrentResponses = await Promise.all([
      request.post("/api/v1/admin/runs", {
        data: concurrentPayload,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
      request.post("/api/v1/admin/runs", {
        data: concurrentPayload,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
    ]);
    expect(concurrentResponses.map((response) => response.status()).sort())
      .toEqual([200, 201]);
    const concurrentEnvelopes = await Promise.all(
      concurrentResponses.map((response) => response.json()),
    );
    expect(
      concurrentEnvelopes.map((envelope) => envelope.data.disposition).sort(),
    ).toEqual(["created", "replayed"]);
    expect(concurrentEnvelopes[0].data.run.id)
      .toBe(concurrentEnvelopes[1].data.run.id);
    expect(concurrentEnvelopes[0].data.run.recipientStudentIds)
      .toEqual([studentId]);

    const finalRuns = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("academicYears")
      .doc(yearId)
      .collection("runs")
      .get();
    expect(finalRuns.size).toBe(4);
    const finalTemplate = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("tests")
      .doc(templateId)
      .get();
    expect(finalTemplate.data().totalRuns).toBe(2);
  },
);
