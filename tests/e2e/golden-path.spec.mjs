import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_025_golden_path";
const otherInstituteId = "inst_bwm_025_other";
const yearId = "2026";
const questionId = "question-bwm-025-golden-path";
const studentId = "student-bwm-025-golden-path";
const suspendedStudentId = "student-bwm-025-suspended";
const l0StudentId = "student-bwm-025-l0";
const templateName = "BWM-025 Golden Path Draft";
const editedTemplateName = "BWM-025 Golden Path Assessment";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const identities = {
  l0: {
    email: "bwm-025-l0@example.test",
    password: "bwm-025-l0-password",
  },
  student: {
    email: "bwm-025-student@example.test",
    password: "bwm-025-student-password",
  },
  suspended: {
    email: "bwm-025-suspended@example.test",
    password: "bwm-025-suspended-password",
  },
  teacher: {
    email: "bwm-025-teacher@example.test",
    password: "bwm-025-teacher-password",
  },
};

let adminApp;
let firestore;

test.use({ bypassCSP: true });

function timingProfile() {
  return {
    easy: { maxSeconds: 120, minSeconds: 1, recommendedSeconds: 45 },
    hard: { maxSeconds: 240, minSeconds: 60, recommendedSeconds: 180 },
    medium: { maxSeconds: 180, minSeconds: 30, recommendedSeconds: 105 },
  };
}

function templateBody(name, canonicalId) {
  return {
    canonicalId,
    difficultyDistribution: { easy: 1, hard: 0, medium: 0 },
    examType: "JEEMains",
    questionIds: [questionId],
    selectionMethod: "manual",
    templateName: name,
    timingProfile: timingProfile(),
    totalDurationMinutes: 30,
  };
}

function questionBody(targetInstituteId = instituteId) {
  return {
    commit: true,
    instituteId: targetInstituteId,
    questions: [
      {
        chapter: "Kinematics",
        correctAnswer: "A",
        difficulty: "Easy",
        examType: "JEEMains",
        marks: 4,
        negativeMarks: 1,
        questionId,
        questionTextKeywords: ["golden", "path", "motion"],
        questionType: "MCQ",
        status: "active",
        subject: "Physics",
        tags: ["motion", "kinematics"],
        uniqueKey: "bwm-025-golden-path-question",
        version: 1,
      },
    ],
  };
}

async function signIn(request, identity) {
  const response = await request.post(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    { data: { ...identity, returnSecureToken: true } },
  );
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body.idToken;
}

async function deleteIdentityIfPresent(auth, email) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.deleteUser(user.uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }
  }
}

async function deleteRootJobs() {
  if (!firestore) {
    return;
  }
  const snapshot = await firestore
    .collection("emailQueue")
    .where("instituteId", "==", instituteId)
    .get();
  if (snapshot.empty) {
    return;
  }
  const batch = firestore.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function cleanupNamespace() {
  if (!adminApp || !firestore) {
    return;
  }
  await firestore.recursiveDelete(firestore.collection("institutes").doc(instituteId));
  await deleteRootJobs();
  const auth = getAuth(adminApp);
  await Promise.all(
    Object.values(identities).map((identity) => deleteIdentityIfPresent(auth, identity.email)),
  );
}

async function waitForDocument(path, predicate, label) {
  await expect
    .poll(
      async () => {
        const snapshot = await firestore.doc(path).get();
        return snapshot.exists && predicate(snapshot.data() ?? {});
      },
      { message: `Timed out waiting for ${label}`, timeout: 90_000 },
    )
    .toBe(true);
}

function trackExternalRequests(context, target) {
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "localhost"
    ) {
      target.push(url.origin);
    }
  });
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp({ projectId }, `bwm-025-golden-${Date.now()}`);
  firestore = getFirestore(adminApp);
  await cleanupNamespace();

  const auth = getAuth(adminApp);
  const [teacher, student, suspended, l0] = await Promise.all([
    auth.createUser(identities.teacher),
    auth.createUser(identities.student),
    auth.createUser(identities.suspended),
    auth.createUser(identities.l0),
  ]);
  await Promise.all([
    auth.setCustomUserClaims(teacher.uid, {
      instituteId,
      licenseLayer: "L2",
      role: "teacher",
    }),
    auth.setCustomUserClaims(student.uid, {
      instituteId,
      licenseLayer: "L2",
      role: "student",
      studentId,
    }),
    auth.setCustomUserClaims(suspended.uid, {
      instituteId,
      isSuspended: true,
      licenseLayer: "L1",
      role: "student",
      studentId: suspendedStudentId,
    }),
    auth.setCustomUserClaims(l0.uid, {
      instituteId,
      licenseLayer: "L0",
      role: "student",
      studentId: l0StudentId,
    }),
  ]);

  const institute = firestore.collection("institutes").doc(instituteId);
  await Promise.all([
    institute.set({
      calibrationVersion: "cal-bwm-025",
      profile: { instituteName: "BWM-025 Golden Path Institute" },
    }),
    institute.collection("academicYears").doc(yearId).set({
      label: yearId,
      locked: false,
      status: "Active",
    }),
    institute
      .collection("license")
      .doc("main")
      .set({
        currentLayer: "L2",
        eligibilityFlags: { l1Eligible: true, l2Eligible: true },
        featureFlags: { controlledMode: true, hardMode: false },
      }),
    institute
      .collection("license")
      .doc("current")
      .set({
        activeStudentCount: 3,
        activeStudentLimit: 100,
        currentLayer: "L2",
        eligibilityFlags: { L1: true, L2: true },
      }),
    ...[
      [studentId, identities.student.email, "BWM-025 Golden Student"],
      [suspendedStudentId, identities.suspended.email, "Suspended Student"],
      [l0StudentId, identities.l0.email, "L0 Student"],
    ].map(([id, email, name]) =>
      institute.collection("students").doc(id).set({
        batchId: "batch-bwm-025",
        batchName: "BWM-025 Batch",
        email,
        name,
        status: "active",
        studentId: id,
      }),
    ),
  ]);
});

test.afterAll(async () => {
  if (!adminApp) {
    return;
  }
  await cleanupNamespace();
  expect((await firestore.collection("institutes").doc(instituteId).get()).exists).toBe(false);
  expect(
    (await firestore.collection("emailQueue").where("instituteId", "==", instituteId).get()).empty,
  ).toBe(true);
  for (const identity of Object.values(identities)) {
    let found = true;
    try {
      await getAuth(adminApp).getUserByEmail(identity.email);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        found = false;
      } else {
        throw error;
      }
    }
    expect(found, `${identity.email} should be removed`).toBe(false);
  }
  await deleteApp(adminApp);
});

test("complete Admin to analytics golden path and all required negatives", async ({
  browser,
  context,
  page,
  request,
}) => {
  test.setTimeout(420_000);
  const externalRequests = [];
  trackExternalRequests(context, externalRequests);

  const [teacherToken, studentToken, suspendedToken, l0Token] = await Promise.all([
    signIn(request, identities.teacher),
    signIn(request, identities.student),
    signIn(request, identities.suspended),
    signIn(request, identities.l0),
  ]);

  const unauthenticated = await request.get("/api/v1/admin/overview");
  expect(unauthenticated.status()).toBe(401);
  expect((await unauthenticated.json()).error.code).toBe("UNAUTHORIZED");

  const wrongRole = await request.post("/api/v1/admin/questions/bulk", {
    data: questionBody(),
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  expect(wrongRole.status()).toBe(403);
  expect((await wrongRole.json()).error.code).toBe("FORBIDDEN");

  const wrongTenant = await request.post("/api/v1/admin/questions/bulk", {
    data: questionBody(otherInstituteId),
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(wrongTenant.status()).toBe(403);
  expect((await wrongTenant.json()).error.code).toBe("TENANT_MISMATCH");

  const suspended = await request.get("/api/v1/student/dashboard", {
    headers: { Authorization: `Bearer ${suspendedToken}` },
  });
  expect(suspended.status()).toBe(403);
  expect((await suspended.json()).error.code).toBe("FORBIDDEN");

  const insufficientLicense = await request.get("/api/v1/student/insights", {
    headers: { Authorization: `Bearer ${l0Token}` },
  });
  expect(insufficientLicense.status()).toBe(403);
  expect((await insufficientLicense.json()).error.message).toContain("L1 or higher");

  const overviewResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/admin/overview" && response.status() === 200,
    { timeout: 90_000 },
  );
  await page.addInitScript(() => {
    window.history.replaceState(null, "", "/admin/overview");
  });
  await page.goto("/admin/index.html", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(identities.teacher.email);
  await page.getByLabel("Password", { exact: true }).fill(identities.teacher.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  expect((await (await overviewResponsePromise).json()).success).toBe(true);
  await expect(page.locator("#admin-overview-title")).toBeVisible({
    timeout: 30_000,
  });

  const questionResponse = await request.post("/api/v1/admin/questions/bulk", {
    data: questionBody(),
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(questionResponse.status()).toBe(200);
  const questionEnvelope = await questionResponse.json();
  expect(questionEnvelope.data.committed).toBe(true);
  expect(questionEnvelope.data.summary.created).toBe(1);
  expect(questionEnvelope.data.rows[0]).toMatchObject({ questionId, version: 1 });

  const createTemplateResponse = await request.post("/api/v1/admin/tests", {
    data: templateBody(templateName, "bwm-025-golden-canonical-v1"),
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(createTemplateResponse.status()).toBe(201);
  const createdTemplate = (await createTemplateResponse.json()).data.template;
  expect(createdTemplate.status).toBe("draft");
  expect(createdTemplate.version).toBe(1);

  const draftRunResponse = await request.post("/api/v1/admin/runs", {
    data: {
      academicYear: yearId,
      attemptLimit: 1,
      endWindow: new Date(Date.now() + 3_600_000).toISOString(),
      expectedTemplateVersion: 1,
      gracePeriodMinutes: 5,
      idempotencyKey: "bwm-025-draft-guard",
      mode: "Operational",
      proctoringPolicy: {
        browserIntegrityGuardEnabled: false,
        faceIdentityGazeGuardEnabled: false,
      },
      recipientStudentIds: [studentId],
      shuffleQuestionOrder: false,
      startWindow: new Date(Date.now() + 60_000).toISOString(),
      testId: createdTemplate.id,
      timezone: "Asia/Kolkata",
    },
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(draftRunResponse.status()).toBe(400);
  expect((await draftRunResponse.json()).error.message).toContain("Template status must be");

  const updateTemplateResponse = await request.patch(`/api/v1/admin/tests/${createdTemplate.id}`, {
    data: {
      ...templateBody(editedTemplateName, "bwm-025-golden-canonical-v2"),
      expectedVersion: 1,
    },
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(updateTemplateResponse.status()).toBe(200);
  const updatedTemplate = (await updateTemplateResponse.json()).data.template;
  expect(updatedTemplate.version).toBe(2);

  const publishResponse = await request.post(`/api/v1/admin/tests/${createdTemplate.id}/publish`, {
    data: { expectedVersion: 2 },
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(publishResponse.status()).toBe(200);
  const publishResult = (await publishResponse.json()).data;
  expect(publishResult.template.status).toBe("ready");

  const startWindow = new Date(Date.now() + 60_000);
  const runRequest = {
    academicYear: yearId,
    attemptLimit: 1,
    endWindow: new Date(startWindow.getTime() + 30 * 60_000).toISOString(),
    expectedTemplateVersion: 2,
    gracePeriodMinutes: 5,
    idempotencyKey: "bwm-025-authoritative-run",
    mode: "Operational",
    proctoringPolicy: {
      browserIntegrityGuardEnabled: false,
      faceIdentityGazeGuardEnabled: false,
    },
    recipientStudentIds: [studentId],
    shuffleQuestionOrder: false,
    startWindow: startWindow.toISOString(),
    testId: createdTemplate.id,
    timezone: "Asia/Kolkata",
  };
  const runResponse = await request.post("/api/v1/admin/runs", {
    data: runRequest,
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(runResponse.status()).toBe(201);
  const createdRun = (await runResponse.json()).data.run;
  const runId = createdRun.id;
  const runPath = `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
  const runAnalyticsPath = `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
  await waitForDocument(
    runAnalyticsPath,
    (data) => data.runId === runId && data.totalParticipants === 1,
    "run analytics initialization",
  );

  const studentContext = await browser.newContext({ bypassCSP: true });
  trackExternalRequests(studentContext, externalRequests);
  const studentPage = await studentContext.newPage();
  let launchCredential;
  let sessionId;
  let submitResult;
  try {
    const dashboardResponsePromise = studentPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/student/dashboard" &&
        response.status() === 200,
      { timeout: 90_000 },
    );
    await studentPage.addInitScript(() => {
      if (window.location.pathname === "/student/index.html") {
        window.history.replaceState(null, "", "/student/dashboard");
      }
    });
    await studentPage.goto("/student/index.html", {
      waitUntil: "domcontentloaded",
    });
    await studentPage.getByLabel("Email", { exact: true }).fill(identities.student.email);
    await studentPage.getByLabel("Password", { exact: true }).fill(identities.student.password);
    await studentPage.getByRole("button", { name: "Login", exact: true }).click();
    const dashboardEnvelope = await (await dashboardResponsePromise).json();
    expect(dashboardEnvelope.data.upcomingTests[0].runId).toBe(runId);
    await expect(studentPage.getByText(editedTemplateName, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const scheduledResponsePromise = studentPage.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/v1/student/tests" &&
          url.searchParams.get("status") === "scheduled" &&
          response.status() === 200
        );
      },
      { timeout: 90_000 },
    );
    await studentPage
      .getByRole("navigation", { name: "Student navigation" })
      .getByRole("link", { name: /^My Tests\b/u })
      .click();
    const scheduledEnvelope = await (await scheduledResponsePromise).json();
    expect(scheduledEnvelope.data.tests[0].runId).toBe(runId);

    await expect
      .poll(() => Date.now(), { timeout: 90_000 })
      .toBeGreaterThanOrEqual(startWindow.getTime());
    const firstStart = await studentPage.request.post("/api/v1/exam/start", {
      data: { intent: "start", runId },
      headers: { Authorization: `Bearer ${studentToken}` },
      timeout: 90_000,
    });
    expect(firstStart.status()).toBe(201);
    const firstStartResult = (await firstStart.json()).data;
    const duplicateStart = await studentPage.request.post("/api/v1/exam/start", {
      data: { intent: "start", runId },
      headers: { Authorization: `Bearer ${studentToken}` },
      timeout: 90_000,
    });
    expect(duplicateStart.status()).toBe(200);
    const duplicateStartResult = (await duplicateStart.json()).data;
    expect(duplicateStartResult.disposition).toBe("replayed");
    expect(duplicateStartResult.sessionId).toBe(firstStartResult.sessionId);
    launchCredential = firstStartResult.launchCredential;
    sessionId = firstStartResult.sessionId;

    const launchUrl = new URL(firstStartResult.examUrl);
    expect(launchUrl.origin).toBe("http://127.0.0.1:5000");
    expect(launchUrl.pathname).toBe(`/session/${sessionId}`);
    const entryResponsePromise = studentPage.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
      { timeout: 90_000 },
    );
    await studentPage.goto(launchUrl.href, { waitUntil: "domcontentloaded" });
    await expect.poll(() => new URL(studentPage.url()).searchParams.has("token")).toBe(false);
    expect((await entryResponsePromise).status()).toBe(200);
    await expect(studentPage.getByText("Complete Entry Check", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const replayContext = await browser.newContext({ bypassCSP: true });
    trackExternalRequests(replayContext, externalRequests);
    const replayPage = await replayContext.newPage();
    try {
      const replayEntryPromise = replayPage.waitForResponse(
        (response) => new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
        { timeout: 90_000 },
      );
      await replayPage.goto(launchUrl.href, { waitUntil: "domcontentloaded" });
      expect((await replayEntryPromise).status()).toBe(401);
    } finally {
      await replayContext.close();
    }

    await studentPage.getByRole("button", { name: "Check Internet" }).click();
    await expect(
      studentPage.getByText("Entry checks complete", { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    const activateResponsePromise = studentPage.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith(`/session/${sessionId}/activate`),
      { timeout: 90_000 },
    );
    await studentPage.getByRole("button", { name: "Continue to Instructions" }).click();
    await studentPage.getByLabel(/I have read and understood the instructions/u).check();
    expect((await activateResponsePromise).status()).toBe(200);
    await expect(studentPage.getByText("Physics · Kinematics · MCQ", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const answerBodies = [];
    let answerAuthorization = "";
    studentPage.on("request", (browserRequest) => {
      if (new URL(browserRequest.url()).pathname.endsWith(`/session/${sessionId}/answers`)) {
        answerAuthorization = browserRequest.headers().authorization ?? "";
        answerBodies.push(browserRequest.postDataJSON());
      }
    });
    await studentContext.setOffline(true);
    await studentPage.getByRole("radio").nth(1).check();
    await studentPage.getByRole("button", { name: "Clear Response" }).click();
    await expect(studentPage.getByText("Offline · 1 pending", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() =>
        studentPage.evaluate(async (expectedSessionId) => {
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open("parabolic-exam-runtime", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          return new Promise((resolve, reject) => {
            const transaction = database.transaction("sessionRecovery", "readonly");
            const request = transaction.objectStore("sessionRecovery").get(expectedSessionId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const pending = request.result?.pendingAnswerMap ?? {};
              database.close();
              resolve(pending);
            };
          });
        }, sessionId),
      )
      .toMatchObject({
        [questionId]: { response: { kind: "unanswered" } },
      });

    const resumedEntryPromise = studentPage.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
      { timeout: 90_000 },
    );
    await studentContext.setOffline(false);
    await studentPage.reload({ waitUntil: "domcontentloaded" });
    expect((await resumedEntryPromise).status()).toBe(200);
    await waitForDocument(
      `${runPath}/sessions/${sessionId}`,
      (data) => data.answerMap?.[questionId]?.response?.kind === "unanswered",
      "offline cleared answer recovery",
    );
    const staleSource = answerBodies.at(-1);
    expect(staleSource).toBeTruthy();
    const staleBatch = await studentPage.request.post(`/api/v1/exam/session/${sessionId}/answers`, {
      data: {
        ...staleSource,
        batchId: `bwm-025-stale-${Date.now()}`,
        batchSequence: staleSource.batchSequence + 1,
        flushReason: "reconnect",
        millisecondsSinceLastWrite: 0,
      },
      headers: { Authorization: answerAuthorization },
      timeout: 90_000,
    });
    expect(staleBatch.status()).toBe(200);
    expect((await staleBatch.json()).data.acknowledgements[0].disposition).toBe("ignored");

    let submitAuthorization = "";
    let submitBody;
    studentPage.on("request", (browserRequest) => {
      if (new URL(browserRequest.url()).pathname.endsWith(`/session/${sessionId}/submit`)) {
        submitAuthorization = browserRequest.headers().authorization ?? "";
        submitBody = browserRequest.postDataJSON();
      }
    });
    await studentPage.getByRole("button", { name: "Submit Test" }).click();
    await studentPage.getByLabel(/I understand 1 question\(s\) will remain unanswered/u).check();
    const submitResponsePromise = studentPage.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith(`/session/${sessionId}/submit`),
      { timeout: 90_000 },
    );
    await studentPage.getByRole("button", { name: "Confirm Final Submit" }).click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.status()).toBe(200);
    submitResult = (await submitResponse.json()).data;
    expect(submitResult.alreadySubmitted).toBe(false);
    expect(submitResult.status).toBe("submitted");
    await expect(studentPage.getByRole("heading", { name: "Exam Submitted" })).toBeVisible({
      timeout: 30_000,
    });

    const duplicateSubmit = await studentPage.request.post(
      `/api/v1/exam/session/${sessionId}/submit`,
      {
        data: submitBody,
        headers: { Authorization: submitAuthorization },
        timeout: 90_000,
      },
    );
    expect(duplicateSubmit.status()).toBe(200);
    expect((await duplicateSubmit.json()).data).toEqual({
      ...submitResult,
      alreadySubmitted: true,
    });
  } finally {
    await studentContext.close();
  }

  const studentMetricsPath =
    `institutes/${instituteId}/academicYears/${yearId}/` + `studentYearMetrics/${studentId}`;
  await waitForDocument(
    runAnalyticsPath,
    (data) =>
      data.resultPropagation?.state === "available" &&
      data.status === "completed" &&
      data.completionRatePercent === 100,
    "available completed run analytics",
  );
  await waitForDocument(
    `${studentMetricsPath}/results/${runId}`,
    (data) => data.sessionId === sessionId && data.runId === runId,
    "Student result projection",
  );
  expect((await firestore.doc(runPath).get()).data().status).toBe("completed");
  expect(
    (await firestore.doc(`${runAnalyticsPath}/processingMarkers/${sessionId}`).get()).data()
      .pipeline.completed,
  ).toBe(true);
  expect(
    (await firestore.doc(`${studentMetricsPath}/processingMarkers/${sessionId}`).get()).data()
      .studentMetricsEngine.processed,
  ).toBe(true);

  const sessionSnapshot = await firestore.doc(`${runPath}/sessions/${sessionId}`).get();
  expect(sessionSnapshot.data().status).toBe("submitted");
  expect(sessionSnapshot.data().answerMap[questionId].response).toEqual({ kind: "unanswered" });
  expect((await firestore.doc(questionEnvelope.data.uploadLogPath).get()).exists).toBe(true);
  expect((await firestore.doc(publishResult.auditPath).get()).exists).toBe(true);
  expect(
    (
      await firestore
        .doc(`institutes/${instituteId}/tests/${createdTemplate.id}/versionSnapshots/1`)
        .get()
    ).exists,
  ).toBe(true);
  expect((await firestore.collection(`${runPath}/sessions`).get()).size).toBe(1);

  const resultContext = await browser.newContext({ bypassCSP: true });
  trackExternalRequests(resultContext, externalRequests);
  const resultPage = await resultContext.newPage();
  try {
    const dashboardResponsePromise = resultPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/student/dashboard" &&
        response.status() === 200,
      { timeout: 90_000 },
    );
    await resultPage.addInitScript(() => {
      window.history.replaceState(null, "", "/student/dashboard");
    });
    await resultPage.goto("/student/index.html", { waitUntil: "domcontentloaded" });
    await resultPage.getByLabel("Email", { exact: true }).fill(identities.student.email);
    await resultPage.getByLabel("Password", { exact: true }).fill(identities.student.password);
    await resultPage.getByRole("button", { name: "Login", exact: true }).click();
    const dashboardEnvelope = await (await dashboardResponsePromise).json();
    expect(dashboardEnvelope.data.recentResults[0].runId).toBe(runId);
    expect(dashboardEnvelope.data.testsAttempted).toBe(1);
    await expect(resultPage.getByText(editedTemplateName, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const completedResponsePromise = resultPage.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/v1/student/tests" &&
          url.searchParams.get("status") === "completed" &&
          response.status() === 200
        );
      },
      { timeout: 90_000 },
    );
    await resultPage
      .getByRole("navigation", { name: "Student navigation" })
      .getByRole("link", { name: /^My Tests\b/u })
      .click();
    const completedEnvelope = await (await completedResponsePromise).json();
    expect(completedEnvelope.data.tests[0]).toMatchObject({ runId, sessionId });

    const performancePromise = resultPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/student/performance" &&
        response.status() === 200,
      { timeout: 90_000 },
    );
    const insightsPromise = resultPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/student/insights" &&
        response.status() === 200,
      { timeout: 90_000 },
    );
    await resultPage
      .getByRole("navigation", { name: "Student navigation" })
      .getByRole("link", { name: /^Analytics\b/u })
      .click();
    expect((await (await performancePromise).json()).data.timeline[0].runId).toBe(runId);
    expect(
      (await (await insightsPromise).json()).data.snapshots.some((snapshot) =>
        snapshot.snapshotId.includes(sessionId),
      ),
    ).toBe(true);
  } finally {
    await resultContext.close();
  }

  const adminResultContext = await browser.newContext({ bypassCSP: true });
  trackExternalRequests(adminResultContext, externalRequests);
  const adminResultPage = await adminResultContext.newPage();
  try {
    const overviewPromise = adminResultPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/overview" && response.status() === 200,
      { timeout: 90_000 },
    );
    await adminResultPage.addInitScript(() => {
      window.history.replaceState(null, "", "/admin/overview");
    });
    await adminResultPage.goto("/admin/index.html", {
      waitUntil: "domcontentloaded",
    });
    await adminResultPage.getByLabel("Email", { exact: true }).fill(identities.teacher.email);
    await adminResultPage.getByLabel("Password", { exact: true }).fill(identities.teacher.password);
    await adminResultPage.getByRole("button", { name: "Login", exact: true }).click();
    const overviewEnvelope = await (await overviewPromise).json();
    expect(overviewEnvelope.data.operationalSnapshot.testsConducted).toBe(1);
    expect(overviewEnvelope.data.currentActivity.lastFiveSubmissions[0].assessmentLabel).toBe(
      editedTemplateName,
    );

    const analyticsPromise = adminResultPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/analytics" && response.status() === 200,
      { timeout: 90_000 },
    );
    await adminResultPage
      .getByRole("link", {
        name: "Open Analytics",
        exact: true,
      })
      .click();
    const analyticsEnvelope = await (await analyticsPromise).json();
    expect(analyticsEnvelope.data.runAnalytics).toHaveLength(1);
    expect(analyticsEnvelope.data.runAnalytics[0].runName).toBe(editedTemplateName);
    expect(analyticsEnvelope.data.studentYearMetrics[0].testsAttempted).toBe(1);
  } finally {
    await adminResultContext.close();
  }

  expect(submitResult).toBeTruthy();
  expect(externalRequests).toEqual([]);
});
