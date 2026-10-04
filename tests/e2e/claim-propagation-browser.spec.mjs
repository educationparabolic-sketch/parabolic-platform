/* eslint-disable max-len */
import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {getAuth} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
  Timestamp,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
const {
  buildClaimPropagationDesiredAuthority,
  ClaimPropagationCoordinator,
} = require("../../functions/lib/services/claimPropagation.js");
const {
  handleClaimPropagationSchedule,
} = require("../../functions/lib/triggers/claimPropagation.js");

const projectId = "demo-parabolic-test";
const portalOrigin = "http://127.0.0.1:5000";
const examOrigin = process.env.PARABOLIC_EXAM_E2E_ORIGIN ?? "http://127.0.0.1:5005";
const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const suffix = Date.now();
const instituteId = `inst_bwm_036_browser_${suffix}`;
const yearId = "2026";
const runId = `run_bwm_036_browser_${suffix}`;
const planId = `L3-BWM036-${suffix}`;
const questionIds = Array.from({length: 12}, (_, index) =>
  `question_bwm_036_browser_${String(index + 1).padStart(2, "0")}`,
);
const password = "bwm-036-browser-proof";
const allFeatureFlags = {
  adaptivePhase: true,
  controlledMode: true,
  governanceAccess: true,
  hardMode: true,
  riskOverview: true,
};
const noFeatureFlags = {
  adaptivePhase: false,
  controlledMode: false,
  governanceAccess: false,
  hardMode: false,
  riskOverview: false,
};
const contexts = [];
const externalOrigins = new Set();
const authorityTimings = [];
let adminApp;
let auth;
let firestore;
let institute;
let pricingPlan;
let coordinator;
let identities;

test.use({bypassCSP: true});
test.setTimeout(900_000);

function decodeClaims(token) {
  const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

function trackExternalRequests(page) {
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (![portalOrigin, examOrigin, authOrigin].includes(url.origin)) {
        externalOrigins.add(url.origin);
      }
    }
  });
}

async function createBrowserPage(browser) {
  const context = await browser.newContext({bypassCSP: true});
  contexts.push(context);
  const page = await context.newPage();
  trackExternalRequests(page);
  return {context, page};
}

async function signInWithPassword(email, userPassword = password) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    {
      body: JSON.stringify({email, password: userPassword, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.idToken;
}

async function authenticatePortal(browser, identity, portal) {
  const {context, page} = await createBrowserPage(browser);
  const routePath = portal === "admin" ? "/admin/overview" : "/student/dashboard";
  const entryPath = portal === "admin" ? "/admin/index.html" : "/student/index.html";
  await page.addInitScript(({path, studentDebug}) => {
    if (studentDebug) window.localStorage.setItem("student-debug-mode", "true");
    window.history.replaceState(null, "", path);
  }, {path: routePath, studentDebug: portal === "student"});
  await page.goto(`${portalOrigin}${entryPath}`, {waitUntil: "domcontentloaded"});
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel("Email", {exact: true}).fill(identity.email);
  await page.getByLabel("Password", {exact: true}).fill(identity.password);
  const signInResponsePromise = page.waitForResponse((response) =>
    response.url().includes("accounts:signInWithPassword") && response.status() === 200,
  {timeout: 30_000});
  await page.getByRole("button", {name: "Login", exact: true}).click();
  const signInResponse = await signInResponsePromise;
  const signInBody = await signInResponse.json();
  return {context, entryPath, idToken: signInBody.idToken, page, portal};
}

async function expectPortalLayer(session, layer) {
  await expect(session.page.getByText(`Layer: ${layer}`, {exact: true}).first())
    .toBeVisible({timeout: 60_000});
}

async function expectPortalAuthorityOutcome(session, options) {
  await session.page.goto(`${portalOrigin}${session.entryPath}`, {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(async () => {
    const text = await session.page.locator("body").innerText();
    if (text.includes("Institute access suspended")) return "suspended";
    if (text.includes("Admin Login") || text.includes("Student Login")) return "signed_out";
    if (options.layer && text.includes(`Layer: ${options.layer}`)) return options.layer;
    return "pending";
  }, {timeout: 90_000}).not.toBe("pending");
  return session.page.locator("body").innerText();
}

async function callExamStartFromBrowser(session, token, intent) {
  return session.page.evaluate(async ({bearer, requestedIntent, targetRunId}) => {
    const response = await fetch("/api/v1/exam/start", {
      body: JSON.stringify({intent: requestedIntent, runId: targetRunId}),
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    return {body: await response.json(), status: response.status};
  }, {bearer: token, requestedIntent: intent, targetRunId: runId});
}

async function createOrResumeExam(token, intent) {
  const response = await fetch(`${portalOrigin}/api/v1/exam/start`, {
    body: JSON.stringify({intent, runId}),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(90_000),
  });
  return {body: await response.json(), status: response.status};
}

async function enterInitialExam(browser, launch) {
  const {context, page} = await createBrowserPage(browser);
  const entryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${launch.sessionId}/entry`),
  {timeout: 90_000});
  await page.goto(launch.examUrl, {waitUntil: "domcontentloaded"});
  expect((await entryResponsePromise).status()).toBe(200);
  await expect(page.getByText("Complete Entry Check", {exact: true}))
    .toBeVisible({timeout: 30_000});
  await page.getByRole("button", {name: "Check Internet"}).click();
  await expect(page.getByText("Entry checks complete", {exact: true}).first())
    .toBeVisible({timeout: 30_000});
  const activationResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${launch.sessionId}/activate`),
  {timeout: 90_000});
  await page.getByRole("button", {name: "Continue to Instructions"}).click();
  await page.getByLabel(/I have read and understood the instructions/u).check();
  expect((await activationResponsePromise).status()).toBe(200);
  await expect(page.getByText("BWM-036 authoritative question 1", {exact: true}))
    .toBeVisible({timeout: 30_000});
  return {context, page, sessionId: launch.sessionId};
}

async function resumeExam(examSession, launch) {
  const entryResponsePromise = examSession.page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${launch.sessionId}/entry`),
  {timeout: 90_000});
  await examSession.page.goto(launch.examUrl, {waitUntil: "domcontentloaded"});
  expect((await entryResponsePromise).status()).toBe(200);
  await expect(examSession.page.getByLabel("Question status tiles"))
    .toBeVisible({timeout: 60_000});
}

async function createPendingExamAnswer(examSession, questionIndex) {
  await examSession.context.setOffline(true);
  const palette = examSession.page.getByLabel("Question status tiles");
  await palette.getByRole("button", {name: String(questionIndex + 1), exact: true}).click();
  await examSession.page.getByRole("radio").nth(1).check();
  await expect(examSession.page.getByText("Offline · 1 pending", {exact: true}))
    .toBeVisible({timeout: 30_000});
  await expect.poll(() => pendingAnswerCount(examSession.page), {timeout: 30_000}).toBe(1);
}

async function pendingAnswerCount(page) {
  return page.evaluate(async (expectedSessionId) => {
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
        const snapshot = request.result;
        database.close();
        resolve(Object.keys(snapshot?.pendingAnswerMap ?? {}).length);
      };
    });
  }, examSessionId);
}

async function expectExamInterruption(examSession, acceptedHeadings) {
  await examSession.context.setOffline(false);
  await expect.poll(async () => {
    const body = await examSession.page.locator("body").innerText();
    return acceptedHeadings.find((heading) => body.includes(heading)) ?? "pending";
  }, {timeout: 90_000}).not.toBe("pending");
  await expect(examSession.page.getByText(/The exam was not auto-submitted/u))
    .toBeVisible({timeout: 30_000});
  await expect(examSession.page.getByText(/1 pending response update/u))
    .toBeVisible({timeout: 30_000});
  expect(await pendingAnswerCount(examSession.page)).toBe(1);
}

async function noBrowserAuthorityKeys(page) {
  return page.evaluate(() => {
    const forbidden = /authorization|entitlement|license|suspend|claim/i;
    return {
      local: Object.keys(localStorage).filter((key) => forbidden.test(key)),
      session: Object.keys(sessionStorage).filter((key) => forbidden.test(key)),
    };
  });
}

async function transitionAuthority({layer, limits, source, status, version}) {
  const startedAt = Date.now();
  const licenseVersion = `license-browser-v${version}`;
  const featureFlags = layer === "L3" ? allFeatureFlags : noFeatureFlags;
  const instituteData = {
    authorizationVersion: version,
    instituteId,
    instituteRevision: version,
    licenseVersion,
    status,
  };
  const licenseData = {
    activeStudentLimit: limits.activeStudentLimit,
    concurrentSessionLimit: limits.concurrentSessionLimit,
    concurrencyLimit: limits.concurrentSessionLimit,
    currentLayer: layer,
    expiryDate: "2099-12-31T00:00:00.000Z",
    featureFlags,
    gracePeriodEndsAt: null,
    licenseState: "active",
    licenseVersion,
  };
  const desiredAuthority = buildClaimPropagationDesiredAuthority(
    instituteId,
    instituteData,
    licenseData,
  );
  await firestore.runTransaction(async (transaction) => {
    transaction.set(institute, instituteData, {merge: true});
    transaction.set(institute.collection("license").doc("current"), licenseData, {merge: true});
    transaction.set(institute.collection("license").doc("main"), licenseData, {merge: true});
    coordinator.stageOperation(transaction, {desiredAuthority, source}, new Date(startedAt));
  });
  const scheduleResult = await handleClaimPropagationSchedule(`browser-v${version}-${suffix}`);
  expect(scheduleResult.operations.processed).toBeGreaterThan(0);
  const operation = await institute.collection("claimPropagationOperations").doc(`v${version}`).get();
  expect(operation.get("state")).toBe("succeeded");
  expect(operation.get("counts.discovered")).toBe(2);
  expect(operation.get("desiredAuthority.activeStudentLimit")).toBe(limits.activeStudentLimit);
  expect(operation.get("desiredAuthority.concurrentSessionLimit")).toBe(limits.concurrentSessionLimit);
  const serverConvergenceMs = Date.parse(operation.get("completedAt")) - startedAt;
  expect(serverConvergenceMs).toBeGreaterThanOrEqual(0);
  expect(serverConvergenceMs).toBeLessThanOrEqual(240_000);
  return {serverConvergenceMs, startedAt, version};
}

async function expectOldTokenDenied(token) {
  const response = await fetch(`${portalOrigin}/api/v1/admin/overview`, {
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  expect(response.status).toBe(401);
  expect(body.error?.code).toBe("UNAUTHORIZED");
}

async function recordBrowserConvergence(transition, pagesReady) {
  await pagesReady;
  const browserConvergenceMs = Date.now() - transition.startedAt;
  expect(browserConvergenceMs).toBeLessThanOrEqual(300_000);
  authorityTimings.push({
    authorizationVersion: transition.version,
    browserConvergenceMs,
    serverConvergenceMs: transition.serverConvergenceMs,
  });
}

test.beforeAll(async () => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(examOrigin).toBe("http://127.0.0.1:5005");
  adminApp = initializeApp({projectId}, `claim-propagation-browser-${suffix}`);
  auth = getAuth(adminApp);
  firestore = getFirestore(adminApp);
  institute = firestore.doc(`institutes/${instituteId}`);
  pricingPlan = firestore.doc(`vendorConfig/pricingPlans/pricingPlans/${planId}`);
  coordinator = new ClaimPropagationCoordinator({firestore, now: () => new Date()});
  const adminIdentity = {
    email: `admin-bwm-036-${suffix}@example.test`,
    password,
    uid: `admin_bwm_036_${suffix}`,
  };
  const studentIdentity = {
    email: `student-bwm-036-${suffix}@example.test`,
    password,
    uid: `student_bwm_036_${suffix}`,
  };
  identities = {admin: adminIdentity, student: studentIdentity};
  await Promise.all([
    auth.createUser(adminIdentity),
    auth.createUser(studentIdentity),
  ]);
  const initialClaims = {
    authorizationVersion: 1,
    expiryDate: "2099-12-31T00:00:00.000Z",
    featureFlags: allFeatureFlags,
    gracePeriodEndsAt: null,
    instituteId,
    isSuspended: false,
    licenseLayer: "L3",
    licenseState: "active",
    licenseVersion: "license-browser-v1",
  };
  await Promise.all([
    auth.setCustomUserClaims(adminIdentity.uid, {...initialClaims, role: "admin"}),
    auth.setCustomUserClaims(studentIdentity.uid, {
      ...initialClaims,
      role: "student",
      studentId: studentIdentity.uid,
    }),
  ]);
  const run = institute.collection("academicYears").doc(yearId).collection("runs").doc(runId);
  const licenseData = {
    activeStudentLimit: 500,
    billingCycle: "annual",
    concurrentSessionLimit: 50,
    concurrencyLimit: 50,
    currentLayer: "L3",
    expiryDate: "2099-12-31T00:00:00.000Z",
    externalActions: [],
    featureFlags: allFeatureFlags,
    gracePeriodEndsAt: null,
    licenseState: "active",
    licenseVersion: "license-browser-v1",
    planId,
    planName: "BWM-036 Browser L3 Plan",
    renewalDate: "2099-12-01T00:00:00.000Z",
    startDate: "2026-10-01T00:00:00.000Z",
  };
  await Promise.all([
    pricingPlan.set({
      basePriceMonthly: 4800,
      concurrencyLimit: 50,
      currency: "inr",
      featureFlags: allFeatureFlags,
      layer: "L3",
      maxExamSessionsPerMonth: 200,
      name: "BWM-036 Browser L3 Plan",
      planId,
      pricePerStudent: 30,
      studentLimit: 500,
    }),
    institute.set({
      authorizationVersion: 1,
      instituteId,
      instituteName: "BWM-036 Browser Institute",
      instituteRevision: 1,
      licenseVersion: "license-browser-v1",
      primaryAdminUserId: adminIdentity.uid,
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "bwm-036@example.test",
        contactPhone: "+1-555-0360",
        defaultExamType: "JEE_MAIN",
        instituteName: "BWM-036 Browser Institute",
        logoReference: "logos/bwm-036.png",
        timeZone: "UTC",
      },
      securitySettings: {
        allowMultipleAdminSessions: false,
        forceLogoutOnPasswordChange: true,
        sessionTimeoutDuration: 30,
      },
      settingsRevision: 0,
      settingsUsers: {
        [adminIdentity.uid]: {
          displayName: "BWM-036 Admin",
          email: adminIdentity.email,
          role: "admin",
          status: "active",
          updatedAt: Timestamp.now(),
        },
      },
      status: "active",
    }),
    institute.collection("students").doc(studentIdentity.uid).set({
      email: studentIdentity.email,
      status: "active",
      studentId: studentIdentity.uid,
    }),
    institute.collection("license").doc("current").set(licenseData),
    institute.collection("license").doc("main").set(licenseData),
    institute.collection("usageMeter").doc("2026-10").set({
      activeStudentCount: 1,
      activeStudentLimit: 500,
      approachingLimit: false,
      assignedStudentsCount: 1,
      assignmentsCreated: 1,
      billingTierCompliance: true,
      currency: "inr",
      cycleId: "2026-10",
      overLimit: false,
      peakActiveStudents: 1,
      peakStudentUsage: 1,
      pricingPlanId: planId,
      projectedInvoiceAmount: 4800,
      sessionExecutionVolume: 1,
      updatedAt: Timestamp.now(),
    }),
    institute.collection("academicYears").doc(yearId).set({
      academicYearLabel: "2026-27",
      label: "2026-27",
      locked: false,
      runCount: 1,
      status: "Active",
      studentCount: 1,
    }),
    ...questionIds.map((questionId, index) =>
      institute.collection("questionBank").doc(questionId).set({
        chapter: "Kinematics",
        correctAnswer: "B",
        createdAt: Timestamp.now(),
        difficulty: "Easy",
        examType: "JEEMains",
        internalNotes: "never expose",
        marks: 4,
        negativeMarks: 1,
        options: [
          {correct: false, id: "A", label: "A", text: "v / r"},
          {correct: true, id: "B", label: "B", text: "v² / r"},
        ],
        primaryTag: "motion",
        prompt: `BWM-036 authoritative question ${index + 1}`,
        questionId,
        questionImageUrl: `questions/${questionId}.png`,
        questionType: "MCQ",
        solutionImageUrl: `solutions/${questionId}.png`,
        status: "active",
        subject: "Physics",
        tags: ["motion"],
        topic: "Motion",
        uniqueKey: `${questionId}-key`,
        usedCount: 0,
        version: 1,
      })),
    run.set({
      calibrationVersion: "cal_bwm_036",
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60_000),
      mode: "Controlled",
      phaseConfigSnapshot: {phase1Percent: 40, phase2Percent: 45, phase3Percent: 15},
      proctoringPolicy: {
        browserIntegrityGuardEnabled: false,
        faceIdentityGazeGuardEnabled: false,
      },
      questionIds,
      recipientStudentIds: [studentIdentity.uid],
      riskModelVersion: "risk_v3",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      status: "scheduled",
      templateVersion: "36",
      testId: `test_bwm_036_${suffix}`,
      timingProfileSnapshot: {
        easy: {max: 60, min: 30, recommended: 45},
        hard: {max: 210, min: 150, recommended: 180},
        medium: {max: 150, min: 60, recommended: 105},
      },
    }),
  ]);
  await run.update({
    endWindow: Timestamp.fromMillis(Date.now() + 60 * 60_000),
    startWindow: Timestamp.fromMillis(Date.now() - 5 * 60_000),
  });
});

test.afterAll(async () => {
  await Promise.allSettled(contexts.map((context) => context.close()));
  if (auth && identities) {
    await Promise.allSettled([
      auth.deleteUser(identities.admin.uid),
      auth.deleteUser(identities.student.uid),
    ]);
  }
  if (firestore && institute) await firestore.recursiveDelete(institute);
  if (pricingPlan) await pricingPlan.delete();
  if (adminApp) await deleteApp(adminApp);
});

let examSessionId = "";

test("real Admin, Student, and Exam browsers converge through suspend, restore, downgrade, and upgrade", async ({browser}) => {
  const activeAdmin = await authenticatePortal(browser, identities.admin, "admin");
  const activeStudent = await authenticatePortal(browser, identities.student, "student");
  await expectPortalLayer(activeAdmin, "L3");
  await expectPortalLayer(activeStudent, "L3");
  const initialLaunch = await callExamStartFromBrowser(activeStudent, activeStudent.idToken, "start");
  expect(initialLaunch.status).toBe(201);
  expect(new URL(initialLaunch.body.data.examUrl).origin).toBe(examOrigin);
  const examSession = await enterInitialExam(browser, initialLaunch.body.data);
  examSessionId = examSession.sessionId;

  await createPendingExamAnswer(examSession, 1);
  const suspension = await transitionAuthority({
    layer: "L3",
    limits: {activeStudentLimit: 500, concurrentSessionLimit: 50},
    source: "institute_suspended",
    status: "suspended",
    version: 2,
  });
  await expectOldTokenDenied(activeAdmin.idToken);
  await recordBrowserConvergence(suspension, Promise.all([
    expectPortalAuthorityOutcome(activeAdmin, {}),
    expectPortalAuthorityOutcome(activeStudent, {}),
    expectExamInterruption(examSession, [
      "Institute access suspended",
      "Exam session authorization ended",
    ]),
  ]));

  const freshSuspendedAdmin = await authenticatePortal(browser, identities.admin, "admin");
  const freshSuspendedStudent = await authenticatePortal(browser, identities.student, "student");
  await expect(freshSuspendedAdmin.page.getByRole("heading", {name: "Institute access suspended"}))
    .toBeVisible({timeout: 30_000});
  await expect(freshSuspendedStudent.page.getByRole("heading", {name: "Institute access suspended"}))
    .toBeVisible({timeout: 30_000});
  const suspendedStart = await callExamStartFromBrowser(
    freshSuspendedStudent,
    freshSuspendedStudent.idToken,
    "resume",
  );
  expect(suspendedStart.status).toBe(403);
  expect(["FORBIDDEN", "LICENSE_RESTRICTED"]).toContain(suspendedStart.body.error?.code);

  const restoration = await transitionAuthority({
    layer: "L3",
    limits: {activeStudentLimit: 500, concurrentSessionLimit: 50},
    source: "institute_restored",
    status: "active",
    version: 3,
  });
  const restoredAdmin = await authenticatePortal(browser, identities.admin, "admin");
  const restoredStudent = await authenticatePortal(browser, identities.student, "student");
  await expectPortalLayer(restoredAdmin, "L3");
  await expectPortalLayer(restoredStudent, "L3");
  const restoredLaunch = await callExamStartFromBrowser(restoredStudent, restoredStudent.idToken, "resume");
  expect(restoredLaunch.status).toBe(200);
  await resumeExam(examSession, restoredLaunch.body.data);
  await expect.poll(async () => {
    const session = await institute.collection("academicYears").doc(yearId)
      .collection("runs").doc(runId).collection("sessions").doc(examSession.sessionId).get();
    return session.get(`answerMap.${questionIds[1]}.response.optionId`) ?? null;
  }, {timeout: 90_000}).toBe("B");
  await expect.poll(() => pendingAnswerCount(examSession.page), {timeout: 90_000}).toBe(0);
  await recordBrowserConvergence(restoration, Promise.resolve());

  await createPendingExamAnswer(examSession, 2);
  const downgrade = await transitionAuthority({
    layer: "L0",
    limits: {activeStudentLimit: 1, concurrentSessionLimit: 1},
    source: "license_changed",
    status: "active",
    version: 4,
  });
  await expectOldTokenDenied(restoredAdmin.idToken);
  await recordBrowserConvergence(downgrade, Promise.all([
    expectPortalAuthorityOutcome(restoredAdmin, {layer: "L0"}),
    expectPortalAuthorityOutcome(restoredStudent, {layer: "L0"}),
    expectExamInterruption(examSession, [
      "Exam paused after a license change",
      "Exam session authorization ended",
    ]),
  ]));

  const downgradedAdmin = await authenticatePortal(browser, identities.admin, "admin");
  const downgradedStudent = await authenticatePortal(browser, identities.student, "student");
  await expectPortalLayer(downgradedAdmin, "L0");
  await expectPortalLayer(downgradedStudent, "L0");
  const downgradedClaims = decodeClaims(downgradedStudent.idToken);
  expect(downgradedClaims.authorizationVersion).toBe(4);
  expect(downgradedClaims.licenseLayer).toBe("L0");
  expect("activeStudentLimit" in downgradedClaims).toBe(false);
  expect("concurrentSessionLimit" in downgradedClaims).toBe(false);
  const downgradedResume = await callExamStartFromBrowser(
    downgradedStudent,
    downgradedStudent.idToken,
    "resume",
  );
  expect(downgradedResume.status).toBe(403);
  expect(downgradedResume.body.error?.code).toBe("LICENSE_RESTRICTED");

  const upgrade = await transitionAuthority({
    layer: "L3",
    limits: {activeStudentLimit: 750, concurrentSessionLimit: 75},
    source: "license_changed",
    status: "active",
    version: 5,
  });
  await expectOldTokenDenied(downgradedAdmin.idToken);
  await Promise.all([
    expectPortalAuthorityOutcome(downgradedAdmin, {layer: "L3"}),
    expectPortalAuthorityOutcome(downgradedStudent, {layer: "L3"}),
  ]);
  const upgradedAdmin = await authenticatePortal(browser, identities.admin, "admin");
  const upgradedStudent = await authenticatePortal(browser, identities.student, "student");
  await expectPortalLayer(upgradedAdmin, "L3");
  await expectPortalLayer(upgradedStudent, "L3");
  const upgradedClaims = decodeClaims(upgradedStudent.idToken);
  expect(upgradedClaims.authorizationVersion).toBe(5);
  expect(upgradedClaims.licenseLayer).toBe("L3");
  const upgradedLaunch = await callExamStartFromBrowser(upgradedStudent, upgradedStudent.idToken, "resume");
  expect(upgradedLaunch.status).toBe(200);
  await resumeExam(examSession, upgradedLaunch.body.data);
  await expect.poll(async () => {
    const session = await institute.collection("academicYears").doc(yearId)
      .collection("runs").doc(runId).collection("sessions").doc(examSession.sessionId).get();
    return session.get(`answerMap.${questionIds[2]}.response.optionId`) ?? null;
  }, {timeout: 90_000}).toBe("B");
  await expect.poll(() => pendingAnswerCount(examSession.page), {timeout: 90_000}).toBe(0);
  const persistedSession = await institute.collection("academicYears").doc(yearId)
    .collection("runs").doc(runId).collection("sessions").doc(examSession.sessionId).get();
  expect(persistedSession.get("status")).toBe("active");
  expect(persistedSession.get("submittedAt") ?? null).toBeNull();
  await recordBrowserConvergence(upgrade, Promise.resolve());

  for (const page of [upgradedAdmin.page, upgradedStudent.page, examSession.page]) {
    expect(await noBrowserAuthorityKeys(page)).toEqual({local: [], session: []});
  }
  expect(externalOrigins).toEqual(new Set());
  expect(authorityTimings).toHaveLength(4);
  console.log("BWM-036 browser timing evidence", JSON.stringify(authorityTimings));
});
