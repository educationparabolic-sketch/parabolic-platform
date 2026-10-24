import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {chromium, expect, test} from "playwright/test";
import {calibrationConsumerFixture} from "./calibration-consumer-fixture.mjs";
import {openNativeForegroundTab} from "./native-visibility.mjs";

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

const projectId = "demo-parabolic-test";
const studentOrigin = process.env.PARABOLIC_STUDENT_BASE_URL;
const examOrigin = process.env.PARABOLIC_E2E_BASE_URL ?? "http://127.0.0.1:5000";
const instituteId = "inst_bwm_018_launch_browser";
let studentId = "student_bwm_018_launch_browser";
const yearId = "2026";
let runId = "run_bwm_018_launch_browser";
const questionIds = Array.from(
  {length: 12},
  (_, index) => `question_bwm_022_launch_browser_${index + 1}`,
);
const questionId = questionIds[0];
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let studentEmail;
let studentPassword;
let studentUid;

const bypassCSP = process.env.PARABOLIC_SECURITY_CSP_ENFORCED !== "1";

test.use({bypassCSP, launchOptions: {args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]}});

async function signInWithPassword(email, password) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-key",
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.idToken;
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp({projectId}, `exam-launch-browser-${Date.now()}`);
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  studentEmail = `exam-launch-browser-${Date.now()}@example.test`;
  studentPassword = "bwm-018-launch-browser";
  const user = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = user.uid;
  studentId = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    authorizationVersion: 1, licenseVersion: "license-consumer-exam",
    expiryDate: "2099-12-31T23:59:59.000Z", gracePeriodEndsAt: null,
    licenseState: "active", featureFlags: {controlledMode: true, hardMode: false, adaptivePhase: false, riskOverview: false, governanceAccess: false},
    instituteId,
    licenseLayer: "L1",
    role: "student",
    studentId,
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  const run = year.collection("runs").doc(runId);
  await Promise.all([
    institute.set({instituteId, status: "active", authorizationVersion: 1,
      licenseVersion: "license-consumer-exam"}),
    institute.collection("students").doc(studentId).set({
      status: "active", fullName: "Exam return fixture", email: studentEmail, version: 1,
      studentId,
    }),
    institute.collection("license").doc("main").set({
      licenseVersion: "license-consumer-exam", licenseState: "active",
      expiryDate: "2099-12-31T23:59:59.000Z", gracePeriodEndsAt: null,
      activeStudentLimit: 100, concurrentSessionLimit: 20,
      currentLayer: "L1",
      eligibilityFlags: {l1Eligible: true},
      featureFlags: {controlledMode: true, hardMode: false, adaptivePhase: false, riskOverview: false, governanceAccess: false},
    }),
    institute.collection("license").doc("current").set({
      licenseVersion: "license-consumer-exam", licenseState: "active",
      expiryDate: "2099-12-31T23:59:59.000Z", gracePeriodEndsAt: null,
      activeStudentLimit: 100, concurrentSessionLimit: 20, currentLayer: "L1",
      featureFlags: {controlledMode: true, hardMode: false, adaptivePhase: false, riskOverview: false, governanceAccess: false},
    }),
    ...questionIds.map((currentQuestionId, index) =>
      institute.collection("questionBank").doc(currentQuestionId).set({
        chapter: "Kinematics",
        correctAnswer: "B",
          revision: 1, questionImageRevision: 1, solutionImageRevision: 1,
        createdAt: Timestamp.now(),
        difficulty: "Easy",
        examType: "JEEMains",
        internalNotes: "must never reach the candidate",
        marks: 4,
        negativeMarks: 1,
        options: [
          {correct: false, id: "A", label: "A", text: "v / r"},
          {correct: true, id: "B", label: "B", text: "v² / r"},
        ],
        primaryTag: "motion",
        prompt: index === 0 ?
          "Authoritative browser snapshot question" :
          `Offline recovery question ${index + 1}`,
        questionId: currentQuestionId,
        questionImageUrl: `${instituteId}/questions/${currentQuestionId}/v1/question-r1.png`,
        questionType: "MCQ",
        solutionImageUrl: `${instituteId}/questions/${currentQuestionId}/v1/solution-r1.png`,
        status: "active",
        subject: "Physics",
        tags: ["motion"],
        topic: "Motion",
        uniqueKey: `bwm-022-launch-browser-question-${index + 1}`,
        usedCount: 0,
        version: 1,
      })),
    year.set({locked: false, status: "Active"}),
    firestore.doc(`institutes/${instituteId}/calibration/cal_bwm_018`)
      .set(calibrationConsumerFixture("cal_bwm_018")),
    run.set({
      calibrationVersion: "cal_bwm_018",
      endWindow: Timestamp.fromMillis(Date.now() + (60 * 60_000)),
      mode: "Operational",
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      proctoringPolicy: {
        browserIntegrityGuardEnabled: false,
        contractVersion: 1, cameraReadiness: "off",
      },
      questionIds,
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v3",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + (5 * 60_000)),
      status: "scheduled",
      templateVersion: "19",
      testId: "test_bwm_018_launch_browser", testName: "Ownership and Student return test",
      timingProfileSnapshot: {
        easy: {max: 60, min: 30, recommended: 45},
        hard: {max: 210, min: 150, recommended: 180},
        medium: {max: 150, min: 60, recommended: 105},
      },
    }),
  ]);
  await run.update({
    endWindow: Timestamp.fromMillis(Date.now() + (60 * 60_000)),
    startWindow: Timestamp.fromMillis(Date.now() - (5 * 60_000)),
  });
});

test.afterAll(async () => {
  if (!adminApp) {
    return;
  }
  if (studentUid) {
    await getAuth(adminApp).deleteUser(studentUid);
    await expect(getAuth(adminApp).getUser(studentUid)).rejects.toMatchObject({code: "auth/user-not-found"});
  }
  if (firestore) {
    await firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    );
    expect((await firestore.doc(`institutes/${instituteId}`).get()).exists).toBe(false);
    expect((await firestore.doc(`institutes/${instituteId}/academicYears/${yearId}`).get()).exists).toBe(false);
  }
  await deleteApp(adminApp);
});

test("fragment bootstrap enters v2 without URL/storage/telemetry credentials and rejects legacy input", async ({page, browser}) => {
  test.setTimeout(180_000);
  const idToken = await signInWithPassword(studentEmail, studentPassword);
  const started = await page.request.post("/api/v1/exam/start", {
    data: {intent: "start", runId}, headers: {Authorization: `Bearer ${idToken}`}, timeout: 90_000,
  });
  expect(started.status()).toBe(201);
  expect(started.headers()["cache-control"]).toContain("no-store");
  const launch = (await started.json()).data;
  const url = new URL(launch.examUrl);
  expect(url.search).toBe("");
  expect(url.hash).toBe(`#launch=${encodeURIComponent(launch.launchCredential)}`);
  const resourceUrls = [];
  const referrers = [];
  let entryCalls = 0;
  const consoleMessages = [];
  let command;
  page.on("console", (event) => consoleMessages.push(event.text()));
  page.on("request", (request) => {
    resourceUrls.push(request.url());
    referrers.push(request.headers().referer ?? "");
    if (request.url().endsWith(`/session/${launch.sessionId}/entry`)) {
      entryCalls++;
      command = request.postDataJSON();
    }
  });
  await page.addInitScript(() => {
    window.__launchAuthLocations = [];
    const original = window.fetch;
    window.fetch = function(...args) {
      const target = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (target.includes("identitytoolkit") || target.includes("/entry")) window.__launchAuthLocations.push(location.href);
      return original.apply(this, args);
    };
  });
  const entry = page.waitForResponse((response) => response.url().endsWith(`/session/${launch.sessionId}/entry`));
  const navigation = await page.goto(url.href, {waitUntil: "domcontentloaded"});
  expect(navigation.headers()["referrer-policy"]).toBe("no-referrer");
  const response = await entry;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const data = (await response.json()).data;
  expect(data.operation).toBe("launch");
  expect(data.ownership.contractVersion).toBe(2);
  expect(data.entry.sessionId).toBe(launch.sessionId);
  expect(data.entry.runtimeSnapshot.questions).toHaveLength(12);
  expect(command.operation).toBe("launch");
  expect(command.token).toBe(launch.launchCredential);
  expect(command.nextOwnerProof).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("");
  const locations = await page.evaluate(() => window.__launchAuthLocations);
  expect(locations.length).toBeGreaterThan(0);
  await page.evaluate((token) => {location.hash = `launch=${encodeURIComponent(token)}`;}, launch.launchCredential);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.goBack();
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("");
  expect(entryCalls).toBe(1);
  for (const referrer of referrers) expect(referrer).toBe("");
  expect(locations.every((value) => !new URL(value).search && !new URL(value).hash)).toBe(true);
  for (const resource of resourceUrls) expect(resource).not.toContain(launch.launchCredential);
  await page.evaluate(({token, proof}) => {
    const message = `request https://firebase.test/?token=${token} ownerProof="${proof}"`;
    window.dispatchEvent(new ErrorEvent("error", {error: new Error(message), message}));
    window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {promise: Promise.resolve(), reason: message}));
  }, {token: launch.launchCredential, proof: command.nextOwnerProof});
  const storage = await page.evaluate(() => JSON.stringify({local: {...localStorage}, session: {...sessionStorage}}));
  expect(storage).toContain("redacted");
  expect(storage).not.toContain(launch.launchCredential);
  const telemetry = await page.evaluate(() => localStorage.getItem("parabolic.frontendTelemetry.events") ?? "");
  for (const secret of [launch.launchCredential, command.nextOwnerProof]) {
    expect(telemetry).not.toContain(secret);
    expect(consoleMessages.join(" ")).not.toContain(secret);
  }
  const persisted = JSON.stringify((await firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`,
  ).get()).data());
  expect(persisted).not.toContain(command.nextOwnerProof);
  expect(persisted).not.toContain(launch.launchCredential);
  const context = await browser.newContext({bypassCSP});
  try {
    const rejected = await context.newPage();
    let authCalls = 0;
    rejected.on("request", (request) => {
      if (request.url().includes("identitytoolkit") || request.url().endsWith("/entry")) authCalls++;
    });
    for (const suffix of [`?token=${encodeURIComponent(launch.launchCredential)}`, "#launch=a&launch=b", "#launch=%ZZ", "#unknown=a", "?token=a#launch=b", "?faceGaze=off#launch=credential", "?cameraReadiness=off#launch=credential", "?token=dev&faceGaze=off", "?mode=Hard#launch=credential"]) {
      await rejected.goto("about:blank");
      await rejected.goto(`${url.origin}${url.pathname}${suffix}`, {waitUntil: "domcontentloaded"});
      await expect(rejected.getByRole("heading", {name: "Session Access Blocked"})).toBeVisible();
      expect(new URL(rejected.url()).search).toBe("");
      expect(new URL(rejected.url()).hash).toBe("");
    }
    expect(authCalls).toBe(0);
  } finally {
    await context.close();
  }
  // Keep the existing full-flow case independent when both cases are selected.
  const ownedSession = firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`,
  );
  await ownedSession.delete();
  expect((await ownedSession.get()).exists).toBe(false);
});

test("mounted ownership preserves activation, acknowledged/offline answers, rotating reload and canonical submission", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  if (studentOrigin) {
    await page.goto(`${studentOrigin}/student/my-tests`);
    await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
    await page.getByLabel("Email", {exact: true}).fill(studentEmail);
    await page.getByLabel("Password", {exact: true}).fill(studentPassword);
    const login = page.waitForResponse(response => response.url().includes("accounts:signInWithPassword") && response.status() === 200);
    await page.getByRole("button", {name: "Login", exact: true}).click(); await login;
    await expect(page.getByRole("heading", {name: "My Tests", exact: true})).toBeVisible({timeout: 30000});
  }
  const studentIdToken = await signInWithPassword(studentEmail, studentPassword);
  const startResponse = await page.request.post("/api/v1/exam/start", {
    data: {intent: "start", runId},
    headers: {Authorization: `Bearer ${studentIdToken}`},
    timeout: 90_000,
  });
  expect(startResponse.status()).toBe(201);
  const startEnvelope = await startResponse.json();
  expect(startEnvelope.success).toBe(true);
  expect(startEnvelope.data.disposition).toBe("created");
  const launchCredential = startEnvelope.data.launchCredential;
  const sessionId = startEnvelope.data.sessionId;
  const launchUrl = new URL(startEnvelope.data.examUrl);
  expect(launchUrl.origin).toBe(examOrigin);
  expect(launchUrl.pathname).toBe(`/session/${encodeURIComponent(sessionId)}`);
  expect(decodeURIComponent(launchUrl.hash.slice("#launch=".length))).toBe(launchCredential);

  const entryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`) && response.request().postDataJSON()?.operation === "launch",
  {timeout: 90_000});
  await page.addInitScript(() => {
    window.__cameraOffRequests = 0;
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = options => {window.__cameraOffRequests++; return native(options);};
  });
  await page.goto(launchUrl.href, {waitUntil: "domcontentloaded"});
  await expect.poll(() => new URL(page.url()).searchParams.has("token"))
    .toBe(false);
  const entryResponse = await entryResponsePromise;
  const entryRequestBody = entryResponse.request().postDataJSON();
  const entryAuthorization = entryResponse.request().headers().authorization ?? "";
  expect(entryResponse.status()).toBe(200);
  const entryEnvelope = await entryResponse.json();
  expect(entryEnvelope.success).toBe(true);
  expect(entryEnvelope.data.operation).toBe("launch");
  const initialGeneration = entryEnvelope.data.ownership.generation;
  const initialRenewal = entryResponseFor(page, "renew");
  entryEnvelope.data = entryEnvelope.data.entry;
  expect(entryEnvelope.data.allowed).toBe(true);
  expect(entryEnvelope.data.status).toBe("started");
  expect(entryEnvelope.data.deadlineAt).toBeNull();
  expect(entryEnvelope.data.sessionId).toBe(sessionId);
  expect(entryEnvelope.data.runtimeSnapshot.questionSetVersion).toBe("19");
  expect(entryEnvelope.data.runtimeSnapshot.mode).toBe("Operational");
  expect(entryEnvelope.data.runtimeSnapshot.questions).toHaveLength(12);
  expect(entryEnvelope.data.runtimeSnapshot.questions[0]).toMatchObject({
    id: questionId,
    imageUrl: `${instituteId}/questions/${questionId}/v1/question-r1.png`,
    text: "Authoritative browser snapshot question",
  });
  expect(JSON.stringify(entryEnvelope.data.runtimeSnapshot)).not.toMatch(
    /correctAnswer|solutionImageUrl|internalNotes|"correct"/i,
  );
  expect(entryRequestBody).toMatchObject({operation: "launch", token: launchCredential, nextOwnerProof: expect.any(String)});
  expect(entryAuthorization).toMatch(/^Bearer /);
  expect(entryAuthorization).not.toBe(`Bearer ${launchCredential}`);
  await expect(page.getByText("Complete Entry Check", {exact: true}))
    .toBeVisible({timeout: 30_000});
  await page.getByRole("button", {name: "Check Internet"}).click();
  await expect(page.getByText("Entry checks complete", {exact: true}).first())
    .toBeVisible({timeout: 30_000});
  const activationResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/activate`),
  {timeout: 90_000});
  await page.getByRole("button", {name: "Continue to Instructions"}).click();
  // Activation unmounts the checkbox; verify the real server transition below.
  await page.getByLabel(/I have read and understood the instructions/u).click({noWaitAfter: true});
  const activationResponse = await activationResponsePromise;
  expect(activationResponse.status()).toBe(200);
  const activationEnvelope = await activationResponse.json();
  expect(activationEnvelope.data.status).toBe("active");
  expect(activationEnvelope.data.replayed).toBe(false);
  expect(Date.parse(activationEnvelope.data.serverTime)).not.toBeNaN();
  expect(Date.parse(activationEnvelope.data.startedAt)).not.toBeNaN();
  expect(Date.parse(activationEnvelope.data.deadlineAt)).not.toBeNaN();
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true}))
    .toBeVisible({timeout: 30_000});
  expect(await page.evaluate(() => window.__cameraOffRequests)).toBe(0);
  let answerRequestBody = null;
  let answerAuthorization = "";
  const answerRequestBodies = [];
  const answerResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/answers`),
  {timeout: 90_000});
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(`/session/${sessionId}/answers`)) {
      answerAuthorization = request.headers().authorization ?? "";
      answerRequestBody = request.postDataJSON();
      answerRequestBodies.push(answerRequestBody);
    }
  });
  await page.getByRole("radio").nth(1).check();
  const answerResponse = await answerResponsePromise;
  expect(answerResponse.status()).toBe(200);
  expect(answerRequestBody.answers).toHaveLength(1);
  expect(answerRequestBody.answers[0]).toMatchObject({
    clientRevision: expect.any(Number),
    questionId,
    response: {kind: "mcq", optionId: "B"},
  });
  expect(answerRequestBody).toMatchObject({
    batchId: expect.any(String),
    batchSequence: expect.any(Number),
    flushReason: "scheduled",
  });
  expect(answerRequestBody.answers[0].timeSpentSeconds).toEqual(expect.any(Number));
  expect(await page.evaluate((credential) => ({
    local: Object.values(localStorage).includes(credential),
    session: Object.values(sessionStorage).includes(credential),
  }), launchCredential)).toEqual({local: false, session: false});

  const sessionPath =
    `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/` +
    `sessions/${sessionId}`;
  const consumedSession = await firestore.doc(sessionPath).get();
  expect(consumedSession.data().launchCredentialHashes).toHaveLength(0);
  expect(consumedSession.data().consumedLaunchCredentialHashes).toHaveLength(1);
  expect(consumedSession.data().status).toBe("active");
  expect(consumedSession.get("calibrationSnapshot.model")).toBe("risk_projection_v1");
  expect(consumedSession.data().startedAt).toBeTruthy();
  expect(consumedSession.data().deadlineAt).toBeTruthy();
  expect(consumedSession.data().answerMap[questionId]).toMatchObject({
    response: {kind: "mcq", optionId: "B"},
    selectedOption: "B",
  });
  expect(consumedSession.data().questionTimeMap[questionId].cumulativeTimeSpent)
    .toBe(consumedSession.data().answerMap[questionId].timeSpentSeconds);

  const replayContext = await browser.newContext({bypassCSP});
  const replayPage = await replayContext.newPage();
  try {
    let replayAuthorization = "";
    replayPage.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(`/session/${sessionId}/entry`)) {
        replayAuthorization = request.headers().authorization ?? "";
      }
    });
    const replayResponsePromise = replayPage.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
    {timeout: 90_000});
    await replayPage.goto(launchUrl.href, {waitUntil: "domcontentloaded"});
    await expect.poll(() => new URL(replayPage.url()).searchParams.has("token"))
      .toBe(false);
    const replayResponse = await replayResponsePromise;
    expect(replayResponse.status()).toBe(401);
    const replayEnvelope = await replayResponse.json();
    expect(replayEnvelope.success).toBe(false);
    expect(replayEnvelope.error.code).toBe("UNAUTHORIZED");
    expect(replayAuthorization).toMatch(/^Bearer /);
    expect(replayAuthorization).not.toBe(`Bearer ${launchCredential}`);
  } finally {
    await replayContext.close();
  }

  // Keep this below-renewal offline drain independent of slow initial loading.
  // Exhausted/offline renewal is covered separately; never bypass its pause.
  expect((await initialRenewal).status()).toBe(200);
  await page.context().setOffline(true);
  const palette = page.getByLabel("Question status tiles");
  for (let index = 0; index < questionIds.length; index += 1) {
    await palette.getByRole("button", {name: String(index + 1), exact: true}).click();
    if (index === 0) {
      await page.getByRole("radio").nth(0).check();
    }
    await page.getByRole("radio").nth(1).check();
    if (index === 5) {
      await page.getByRole("button", {name: "Clear Response"}).click();
    }
  }
  await expect(page.getByText("Offline · 12 pending", {exact: true}))
    .toBeVisible({timeout: 30_000});
  await expect.poll(async () => page.evaluate(async ({expectedOwnerId, expectedSessionId}) => {
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
        resolve({
          scopeValid: /^[a-f0-9]{64}$/u.test(snapshot?.scopeHash ?? ""),
          pendingCount: Object.keys(snapshot?.pendingAnswerMap ?? {}).length,
          schemaVersion: snapshot?.schemaVersion ?? null,
        });
      };
    });
  }, {expectedOwnerId: studentId, expectedSessionId: sessionId})).toEqual({
    scopeValid: true,
    pendingCount: 12,
    schemaVersion: 3,
  });

  const recoveryAnswerRequestStart = answerRequestBodies.length;
  const resumedEntryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`) && response.request().postDataJSON()?.operation === "recover",
  {timeout: 90_000});
  await page.context().setOffline(false);
  await page.reload({waitUntil: "domcontentloaded"});
  const resumedEntryResponse = await resumedEntryResponsePromise;
  expect(resumedEntryResponse.status()).toBe(200);
  const recoveredEntryRequest = resumedEntryResponse.request().postDataJSON();
  expect(recoveredEntryRequest.operation).toBe("recover");
  expect(recoveredEntryRequest.previous.generation).toBe(initialGeneration);
  expect((await resumedEntryResponse.json()).data.ownership.generation).toBe(initialGeneration + 1);
  await expect(page.getByText("Offline recovery question 12", {exact: true}))
    .toBeVisible({timeout: 30_000});

  await expect.poll(async () => {
    const recoveredSession = await firestore.doc(sessionPath).get();
    return Object.keys(recoveredSession.data()?.answerMap ?? {}).length;
  }, {timeout: 90_000}).toBe(12);
  const recoveryAnswerRequests = answerRequestBodies.slice(recoveryAnswerRequestStart);
  expect(recoveryAnswerRequests.length).toBeGreaterThanOrEqual(2);
  expect(recoveryAnswerRequests.every((body) => body.answers.length <= 10)).toBe(true);
  expect(new Set(recoveryAnswerRequests.flatMap((body) =>
    body.answers.map((answer) => answer.questionId))).size).toBe(12);
  expect(recoveryAnswerRequests.some((body) =>
    body.flushReason === "reconnect" || body.flushReason === "submission")).toBe(true);

  const recoveredSession = await firestore.doc(sessionPath).get();
  const recoveredAnswerMap = recoveredSession.data().answerMap;
  for (const currentQuestionId of questionIds) {
    if (currentQuestionId === questionIds[5]) {
      expect(recoveredAnswerMap[currentQuestionId]).toMatchObject({
        response: {kind: "unanswered"},
        selectedOption: null,
      });
    } else {
      expect(recoveredAnswerMap[currentQuestionId]).toMatchObject({
        response: {kind: "mcq", optionId: "B"},
        selectedOption: "B",
      });
    }
  }

  let submitAuthorization = "";
  let submitRequestBody = null;
  let submitOwnerHeaders;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(`/session/${sessionId}/submit`)) {
      submitAuthorization = request.headers().authorization ?? "";
      submitOwnerHeaders = {"X-Parabolic-Exam-Owner": request.headers()["x-parabolic-exam-owner"],
        "X-Parabolic-Exam-Generation": request.headers()["x-parabolic-exam-generation"]};
      submitRequestBody = request.postDataJSON();
    }
  });
  await page.getByRole("button", {name: "Submit Test"}).click();
  await page.getByLabel(/I understand 1 question\(s\) will remain unanswered/u).check();
  const submitResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/submit`),
  {timeout: 90_000});
  await page.getByRole("button", {name: "Confirm Final Submit"}).click();
  const submitResponse = await submitResponsePromise;
  expect(submitResponse.status()).toBe(200);
  const submitEnvelope = await submitResponse.json();
  const submitResult = submitEnvelope.data;
  expect(submitRequestBody).toEqual({
    instituteId,
    reason: "manual",
    runId,
    yearId,
  });
  expect(submitAuthorization).toMatch(/^Bearer /u);
  expect(submitResult).toMatchObject({
    accuracyPercent: expect.any(Number),
    alreadySubmitted: false,
    disciplineIndex: expect.any(Number),
    guessRatePercent: expect.any(Number),
    maxTimeViolationPercent: expect.any(Number),
    minTimeViolationPercent: expect.any(Number),
    phaseAdherencePercent: expect.any(Number),
    rawScorePercent: expect.any(Number),
    riskState: expect.any(String),
    status: "submitted",
    submissionReason: "manual",
    submittedAt: expect.any(String),
  });
  expect(Date.parse(submitResult.submittedAt)).not.toBeNaN();
  await expect(page.getByRole("heading", {name: "Exam Submitted"}))
    .toBeVisible({timeout: 30_000});
  const authoritativeMetrics = page.getByLabel("Authoritative submission metrics");
  await expect(authoritativeMetrics).toContainText(
    `Raw Score: ${submitResult.rawScorePercent.toFixed(2)}%`,
  );
  await expect(authoritativeMetrics).toContainText(
    `Accuracy: ${submitResult.accuracyPercent.toFixed(2)}%`,
  );
  await expect(authoritativeMetrics).toContainText(
    `Discipline Index: ${submitResult.disciplineIndex.toFixed(2)}%`,
  );
  await expect(authoritativeMetrics).toContainText(`Risk State: ${submitResult.riskState}`);
  await expect(authoritativeMetrics).toContainText("Server Disposition: Finalized now");
  const submittedSession = await firestore.doc(sessionPath).get();
  expect(submittedSession.data().status).toBe("submitted");
  expect(submittedSession.get("calibrationSnapshot"))
    .toEqual(consumedSession.get("calibrationSnapshot"));
  const yearMetrics = firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}/studentYearMetrics/${studentId}`,
  );
  await expect.poll(async () => (await yearMetrics.get()).get(
    "processingMarkers.riskEngine.lastProcessedStudentMetricsSessionId",
  ), {timeout: 30_000}).toBe(sessionId);
  const projection = (await yearMetrics.get()).data();
  const weights = projection.calibrationSnapshot.weights;
  const expectedProjection = Math.round(100 * (
    projection.avgGuessRatePercent * weights.guessWeight +
    (100 - projection.avgPhaseAdherencePercent) * weights.phaseWeight +
    projection.easyNeglectRatePercent * weights.easyNeglectWeight +
    projection.hardBiasRatePercent * weights.hardBiasWeight +
    (projection.wrongStreakActive ? 100 : 0) * weights.wrongStreakWeight
  ) / Object.values(weights).reduce((sum, weight) => sum + weight, 0)) / 100;
  expect(projection.riskModelVersion).toBe("risk_projection_v1");
  expect(projection.riskScore).toBe(expectedProjection);
  expect(Object.keys(submittedSession.data().answerMap)).toHaveLength(12);
  expect(submittedSession.data().answerMap[questionIds[5]].response)
    .toEqual({kind: "unanswered"});

  const replayResponse = await page.request.post(
    `/api/v1/exam/session/${encodeURIComponent(sessionId)}/submit`,
    {
      data: submitRequestBody,
      headers: {Authorization: submitAuthorization, ...submitOwnerHeaders},
      timeout: 90_000,
    },
  );
  expect(replayResponse.status()).toBe(200);
  const replayEnvelope = await replayResponse.json();
  expect(replayEnvelope.data).toEqual({
    ...submitResult,
    alreadySubmitted: true,
  });

  const finalAnswerRequest = answerRequestBodies.at(-1);
  const postSubmitAnswerBody = {
    ...finalAnswerRequest,
    answers: [{
      ...finalAnswerRequest.answers[0],
      clientRevision: finalAnswerRequest.answers[0].clientRevision + 1_000,
      response: {kind: "mcq", optionId: "A"},
    }],
    batchId: `post-submit-${Date.now()}`,
    batchSequence: finalAnswerRequest.batchSequence + 1_000,
  };
  const postSubmitAnswerResponse = await page.request.post(
    `/api/v1/exam/session/${encodeURIComponent(sessionId)}/answers`,
    {
      data: postSubmitAnswerBody,
      headers: {Authorization: submitAuthorization, ...submitOwnerHeaders},
      timeout: 90_000,
    },
  );
  expect(postSubmitAnswerResponse.status()).toBe(409);
  const postSubmitAnswerEnvelope = await postSubmitAnswerResponse.json();
  expect(postSubmitAnswerEnvelope.error.code).toBe("SESSION_LOCKED");
  const immutableSession = await firestore.doc(sessionPath).get();
  expect(immutableSession.data().answerMap[questionId].response)
    .toEqual(submittedSession.data().answerMap[questionId].response);
  if (studentOrigin) {
    const document = page.waitForResponse(response => response.request().isNavigationRequest() && response.url() === `${studentOrigin}/student/my-tests`);
    const testsRead = page.waitForResponse(response => response.url().startsWith(`${studentOrigin}/api/v1/student/tests`));
    await page.getByRole("button", {name: "Return to Student Portal", exact: true}).click();
    const navigation = await document;
    expect(navigation.status()).toBe(200);
    expect(await navigation.text()).toContain("/student/assets/");
    expect(navigation.request().headers().authorization).toBeUndefined();
    expect(navigation.request().headers()["x-parabolic-exam-owner"]).toBeUndefined();
    expect(navigation.request().headers().referer ?? "").toBe("");
    await expect(page).toHaveURL(`${studentOrigin}/student/my-tests`);
    await expect(page.getByRole("heading", {name: "My Tests", exact: true})).toBeVisible();
    const response = await testsRead; expect(response.status()).toBe(200);
    expect(response.request().headers()["x-parabolic-exam-owner"]).toBeUndefined();
    expect(response.request().headers()["x-parabolic-exam-generation"]).toBeUndefined();
    const header = response.request().headers().authorization;
    const claims = JSON.parse(Buffer.from(header.slice(7).split(".")[1], "base64url").toString());
    expect(claims.sub).toBe(studentUid); expect(claims.role).toBe("student");
    expect(claims.sessionId).toBeUndefined(); expect(claims.launchNonce).toBeUndefined();
    expect(header === submitAuthorization).toBe(false);
    expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  }


});

async function prepareOwnershipRun(suffix, camera = false) {
  const root = `institutes/${instituteId}/academicYears/${yearId}/runs`;
  const template = (await firestore.doc(`${root}/run_bwm_018_launch_browser`).get()).data();
  runId = `run_bwm_044_${suffix}`;
  const ref = firestore.doc(`${root}/${runId}`);
  await ref.set({...template, runId, status: "scheduled",
    startWindow: Timestamp.fromMillis(Date.now() + 300000),
    endWindow: Timestamp.fromMillis(Date.now() + 3600000),
    proctoringPolicy: {contractVersion: 1, browserIntegrityGuardEnabled: false, cameraReadiness: camera ? "required" : "off"}});
  await ref.update({startWindow: Timestamp.fromMillis(Date.now() - 300000)});
}
async function issueLaunch(page, intent = "start") {
  const token = await signInWithPassword(studentEmail, studentPassword);
  const response = await page.request.post("/api/v1/exam/start", {data: {intent, runId},
    headers: {authorization: `Bearer ${token}`}, timeout: 90000});
  expect(response.status()).toBe(intent === "start" ? 201 : 200);
  return (await response.json()).data;
}
const entryResponseFor = (page, operation) => page.waitForResponse(response =>
  response.url().endsWith("/entry") && response.request().postDataJSON()?.operation === operation, {timeout: 90000});
async function beginOwnedExam(page) {
  await page.getByRole("button", {name: "Check Internet"}).click();
  await page.getByRole("button", {name: "Continue to Instructions"}).click();
  await page.getByLabel(/I have read and understood the instructions/u).click({noWaitAfter: true});
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible({timeout: 30000});
}
async function recoveryRecord(page, sessionId) {
  return page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("parabolic-exam-runtime", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise(resolve => {
      const request = db.transaction("sessionRecovery", "readonly").objectStore("sessionRecovery").get(id);
      request.onsuccess = () => {db.close(); resolve(request.result ?? null);};
      request.onerror = () => {db.close(); resolve(null);};
    });
  }, sessionId);
}

async function editRecoveryRecord(page, sessionId, edit) {
  return page.evaluate(async ({id, action}) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("parabolic-exam-runtime", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("sessionRecovery", "readwrite"), store = tx.objectStore("sessionRecovery");
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
      if (action === "delete") store.delete(id);
    });
    db.close();
  }, {id: sessionId, action: edit});
}

test("resilience transport keeps exact signed intent through 429 and 503 and refreshes a 401 within budget", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("resilience_transport");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const entry = entryResponseFor(page, "launch"); await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
  await beginOwnedExam(page);
  const original = (await ref.get()).data();
  const cdp = await page.context().newCDPSession(page);
  let failures = [429, 503], dispatches = [], tokenRefreshes = 0, driverError;
  page.on("request", request => {if (request.url().includes("securetoken.googleapis.com")) tokenRefreshes++;});
  cdp.on("Fetch.requestPaused", async event => {
    try {
      if (!event.request.url.endsWith("/answers")) {await cdp.send("Fetch.continueRequest", {requestId: event.requestId}); return;}
      const headers = Object.fromEntries(Object.entries(event.request.headers).map(([key, value]) => [key.toLowerCase(), value]));
      expect(headers.authorization).toMatch(/^Bearer /u);
      expect(headers["x-parabolic-exam-owner"]).toBeTruthy(); expect(headers["x-parabolic-exam-generation"]).toBe("1");
      dispatches.push({body: event.request.postData, at: performance.now()});
      if (failures.length) {
        // The signed request reached the real backend. Replace only its response with a failure.
        const status = failures.shift();
        await cdp.send("Fetch.fulfillRequest", {requestId: event.requestId, responseCode: status,
          responseHeaders: [{name: "Content-Type", value: "application/json"}, {name: "Retry-After", value: "1"}],
          body: Buffer.from(JSON.stringify({success: false, error: {code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", message: "Injected transport failure"},
            requestId: "transport-fault", timestamp: new Date().toISOString()})).toString("base64")});
      } else await cdp.send("Fetch.continueRequest", {requestId: event.requestId});
    } catch (error) {driverError = error; await cdp.send("Fetch.continueRequest", {requestId: event.requestId}).catch(() => undefined);}
  });
  await cdp.send("Fetch.enable", {patterns: [{urlPattern: `${examOrigin}/api/v1/exam/session/*/answers`, requestStage: "Response"}]});
  try {
    let acceptedResponse = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
    await page.getByRole("radio").nth(1).check(); await acceptedResponse;
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null, {timeout: 30000}).toEqual({});
    expect(driverError).toBeUndefined(); expect(dispatches).toHaveLength(3);
    expect(new Set(dispatches.map(item => item.body)).size).toBe(1);
    expect(dispatches[1].at - dispatches[0].at).toBeGreaterThanOrEqual(950);
    expect(dispatches[2].at - dispatches[1].at).toBeGreaterThanOrEqual(1950);
    expect((await ref.get()).data().answerMap[questionId].response).toEqual({kind: "mcq", optionId: "B"});
    failures = [401]; dispatches = []; const refreshBefore = tokenRefreshes;
    acceptedResponse = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
    await page.getByRole("radio").nth(0).check(); await acceptedResponse;
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null, {timeout: 30000}).toEqual({});
    expect(driverError).toBeUndefined(); expect(dispatches).toHaveLength(2);
    expect(dispatches[0].body).toBe(dispatches[1].body); expect(tokenRefreshes).toBeGreaterThan(refreshBefore);
    const final = (await ref.get()).data();
    expect(final.answerMap[questionId].response).toEqual({kind: "mcq", optionId: "A"});
    expect(final.deadlineAt.toMillis()).toBe(original.deadlineAt.toMillis());
    expect(final.startedAt.toMillis()).toBe(original.startedAt.toMillis()); expect(final.status).toBe("active"); expect(final.submittedAt).toBeNull();
  } finally {await cdp.send("Fetch.disable").catch(() => undefined); await cdp.detach();}
});

test("resilience lobby exposes explicit recovery after bounded uncertain renewal without extending its receipt", async ({page}) => {
  test.setTimeout(120000);
  await prepareOwnershipRun("resilience_lobby");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const entry = entryResponseFor(page, "launch"); await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
  await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
  const initial = (await ref.get()).data(), commands = [];
  const cdp = await page.context().newCDPSession(page); let driverError;
  cdp.on("Fetch.requestPaused", async event => {
    try {
      const body = JSON.parse(event.request.postData ?? "{}");
      if (body.operation !== "renew") {await cdp.send("Fetch.continueRequest", {requestId: event.requestId}); return;}
      commands.push(body);
      if (commands.length <= 3) await cdp.send("Fetch.fulfillRequest", {requestId: event.requestId, responseCode: 429,
        responseHeaders: [{name: "Content-Type", value: "application/json"}, {name: "Retry-After", value: "1"}],
        body: Buffer.from(JSON.stringify({success: false, error: {code: "INTERNAL_ERROR", message: "Injected renewal response loss"},
          requestId: "renewal-fault", timestamp: new Date().toISOString()})).toString("base64")});
      else await cdp.send("Fetch.continueRequest", {requestId: event.requestId});
    } catch (error) {driverError = error; await cdp.send("Fetch.continueRequest", {requestId: event.requestId}).catch(() => undefined);}
  });
  await cdp.send("Fetch.enable", {patterns: [{urlPattern: `${examOrigin}/api/v1/exam/session/*/entry`, requestStage: "Response"}]});
  try {
    await expect.poll(() => commands.length, {timeout: 45000}).toBe(3);
    await expect(page.getByRole("button", {name: "Retry clock and connection"})).toBeVisible();
    expect(driverError).toBeUndefined(); expect(new Set(commands.map(command => command.commandId)).size).toBe(1);
    const uncertain = (await ref.get()).data();
    expect(uncertain.runtimeOwnership.generation).toBe(1); expect(uncertain.status).toBe("started");
    await expect(page.getByRole("button", {name: "Retry clock and connection"})).toBeEnabled();
    await page.getByRole("button", {name: "Retry clock and connection"}).click();
    await expect(page.getByRole("button", {name: "Retry clock and connection"})).toHaveCount(0);
    expect(commands).toHaveLength(4); expect(new Set(commands.map(command => command.commandId)).size).toBe(1);
    const final = (await ref.get()).data();
    expect(final.runtimeOwnership.expiresAt.toMillis()).toBe(uncertain.runtimeOwnership.expiresAt.toMillis());
    expect(final.status).toBe("started"); expect(final.startedAt).toEqual(initial.startedAt);
    expect(final.deadlineAt).toEqual(initial.deadlineAt); expect(final.submittedAt).toBeNull();
    await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
  } finally {await cdp.send("Fetch.disable").catch(() => undefined); await cdp.detach();}
});

test("resilience clock ignores both wall jumps and reconciles after a real blocked renderer without inventing dwell", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("resilience_clock");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const entry = entryResponseFor(page, "launch"); await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
  await beginOwnedExam(page);
  const initial = (await ref.get()).data(), timer = page.locator(".exam-header-timer");
  const seconds = text => text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const started = await page.evaluate(() => performance.now()), before = seconds(await timer.innerText());
  await page.evaluate(() => {window.originalClockNow = Date.now; Date.now = () => window.originalClockNow() + 86400000;});
  let saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  let accepted = (await ref.get()).data().answerMap[questionId];
  expect(Math.abs(accepted.clientTimestamp - Date.now())).toBeLessThan(30000);
  await page.evaluate(() => {Date.now = () => window.originalClockNow() - 86400000;});
  saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
  await page.getByRole("radio").nth(0).check(); await saved;
  const previousTimestamp = accepted.clientTimestamp; accepted = (await ref.get()).data().answerMap[questionId];
  expect(accepted.clientTimestamp).toBeGreaterThan(previousTimestamp);
  expect(Math.abs(accepted.clientTimestamp - Date.now())).toBeLessThan(30000);
  const elapsed = (await page.evaluate(() => performance.now()) - started) / 1000;
  expect(Math.abs(before - seconds(await timer.innerText()) - elapsed)).toBeLessThan(2.5);
  await page.evaluate(() => {Date.now = window.originalClockNow;});
  // Finish wall-jump reconciliation before measuring the separate renderer stall.
  const restored = entryResponseFor(page, "reconcile");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await restored).status()).toBe(200);
  await expect(page.getByRole("button", {name: "Retry clock and connection"})).toHaveCount(0);
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null).toEqual({});
  const dwell = (await recoveryRecord(page, launch.sessionId)).questionTimingById[questionId].timeSpentMs;
  const reconcile = entryResponseFor(page, "reconcile");
  // Block the actual renderer task queue. CDP lifecycle freeze alone can leave foreground timers running.
  const blockedMs = await page.evaluate(() => {
    const start = performance.now();
    while (performance.now() - start < 6500) { /* Real long task: no synthetic clock or business response. */ }
    return performance.now() - start;
  });
  expect(blockedMs).toBeGreaterThanOrEqual(6500);
  expect((await reconcile).status()).toBe(200);
  await expect(page.getByRole("button", {name: "Retry clock and connection"})).toHaveCount(0);
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  const snapshot = await recoveryRecord(page, launch.sessionId);
  expect(snapshot.questionTimingById[questionId].timeSpentMs - dwell).toBeLessThan(5000);
  const final = (await ref.get()).data();
  expect(snapshot.questionTimingById[questionId].timeSpentMs).toBeGreaterThanOrEqual(final.questionTimeMap[questionId].cumulativeTimeSpent * 1000);
  expect(final.deadlineAt.toMillis()).toBe(initial.deadlineAt.toMillis()); expect(final.startedAt.toMillis()).toBe(initial.startedAt.toMillis());
  expect(final.answerMap[questionId].response).toEqual({kind: "mcq", optionId: "A"}); expect(final.status).toBe("active");
});

test("resilience answers reconstruct server state after stale/missing storage and disclose memory-only crash loss", async () => {
  test.setTimeout(180000);
  const isolated = await chromium.launch();
  try {
    const context = await isolated.newContext({baseURL: examOrigin, bypassCSP});
    const page = await context.newPage();
    await prepareOwnershipRun("resilience_storage");
    const launch = await issueLaunch(page), ref = sessionFor(launch);
    let entry = entryResponseFor(page, "launch");
    await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
    await beginOwnedExam(page);
    const answer = page.waitForResponse(r => r.url().endsWith("/answers"));
    await page.getByRole("radio").nth(1).check();
    const saved = await answer; expect(saved.status()).toBe(200);
    const headers = {authorization: saved.request().headers().authorization,
      "X-Parabolic-Exam-Owner": saved.request().headers()["x-parabolic-exam-owner"],
      "X-Parabolic-Exam-Generation": saved.request().headers()["x-parabolic-exam-generation"]};
    const before = (await ref.get()).data();
    await page.context().setOffline(true);
    await page.getByRole("radio").nth(0).check();
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap[questionId]?.response.optionId).toBe("A");
    const local = await recoveryRecord(page, launch.sessionId);
    expect(local.schemaVersion).toBe(3); expect(local.scopeHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(local)).not.toMatch(/"proof"|"token"|"ownerId"|launchNonce/u);
    // Establish a genuinely newer accepted answer through the real signed handler.
    const accepted = {...saved.request().postDataJSON(), batchId: crypto.randomUUID(), batchSequence: 900,
      answers: [{...local.pendingAnswerMap[questionId], clientRevision: 900,
        clientTimestamp: local.lastIssuedClientTimestamp + 1, response: {kind: "mcq", optionId: "B"}}]};
    const newer = await page.request.post(`/api/v1/exam/session/${launch.sessionId}/answers`, {headers, data: accepted});
    expect(newer.status()).toBe(200);
    await page.context().setOffline(false);
    entry = entryResponseFor(page, "recover"); await page.reload(); expect((await entry).status()).toBe(200);
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    const status = page.getByRole("region", {name: "Answer recovery status"});
    await expect(status).toContainText("superseded");
    await expect(status.getByRole("checkbox")).not.toBeChecked();
    await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {unknown: 1}).length).toBe(0);
    expect((await ref.get()).get(`answerMap.${questionId}.clientTimestamp`)).toBe(accepted.answers[0].clientTimestamp);
    // Remove only this disposable local record; accepted server data must reconstruct it.
    await editRecoveryRecord(page, launch.sessionId, "delete");
    entry = entryResponseFor(page, "recover"); await page.reload(); expect((await entry).status()).toBe(200);
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await expect(status).toContainText("Pending edits without a completed local save may have been lost");
    // Break only the exam's IndexedDB. Firebase identity persistence remains real.
    await page.addInitScript(() => {
      const original = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function(name, ...args) {
        if (name === "parabolic-exam-runtime") throw new DOMException("Injected local storage failure", "QuotaExceededError");
        return original.call(this, name, ...args);
      };
    });
    entry = entryResponseFor(page, "recover"); await page.reload(); expect((await entry).status()).toBe(200);
    await expect(page.getByRole("radio").nth(1)).toBeChecked(); await expect(status).toContainText("Memory only");
    // Keep identity/reload networking real. Abort only answer dispatch so this
    // memory-only edit cannot commit before the actual renderer crash.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    // Native URL blocking needs no Playwright routing callback after a crash.
    await cdp.send("Network.setBlockedURLs", {urls: [`${examOrigin}/api/v1/exam/session/${launch.sessionId}/answers`]});
    await page.getByRole("radio").nth(0).check();
    await expect(page.getByRole("radio").nth(0)).toBeChecked(); await expect(status).toContainText("may be lost on reload");
    expect((await ref.get()).get(`answerMap.${questionId}.response.optionId`)).toBe("B");
    const generation = (await ownerRecord(page)).current.generation;
    const browserCdp = await isolated.newBrowserCDPSession();
    const crashed = page.waitForEvent("crash");
    const {processInfo} = await browserCdp.send("SystemInfo.getProcessInfo");
    const renderers = processInfo.filter(info => info.type === "renderer"); expect(renderers.length).toBeGreaterThan(0);
    for (const renderer of renderers) {
      expect(Number.isSafeInteger(renderer.id) && renderer.id > 0 && renderer.id !== process.pid).toBe(true);
      try {process.kill(renderer.id, "SIGKILL");} catch (error) {if (error.code !== "ESRCH") throw error;}
    }
    await crashed;
    // Playwright closes page action scopes after a real crash. Reload this same
    // surviving target through CDP, as in the permanent durable-pending case.
    await cdp.send("Page.reload");
    let lastCrashState;
    await expect.poll(async () => {
      try {
        const result = await cdp.send("Runtime.evaluate", {expression: `JSON.stringify((() => {let generation = null; try {generation = JSON.parse(sessionStorage.getItem(${JSON.stringify(ownerKey)}))?.current?.generation ?? null;} catch {} return {generation, accepted: document.querySelectorAll('[role="radiogroup"] input')[1]?.checked === true, disclosed: document.body.innerText.includes('Memory only'), heading: document.querySelector('h1')?.textContent ?? '', protocol: location.protocol};})())`, returnByValue: true});
        const value = result.result.value ? JSON.parse(result.result.value) : null;
        if (JSON.stringify(value) !== lastCrashState) {lastCrashState = JSON.stringify(value); console.info("[exam-memory-crash]", lastCrashState);}
        return value ? {generation: value.generation, accepted: value.accepted, disclosed: value.disclosed} : null;
      } catch {return null;}
    }, {timeout: 90000}).toEqual({generation: generation + 1, accepted: true, disclosed: true});
    const final = (await ref.get()).data();
    expect(final.answerMap[questionId].response.optionId).toBe("B");
    expect(final.deadlineAt.toMillis()).toBe(before.deadlineAt.toMillis()); expect(final.startedAt.toMillis()).toBe(before.startedAt.toMillis());
    expect(final.status).toBe("active"); expect(final.submittedAt).toBeNull();
    await cdp.detach(); await browserCdp.detach();
  } finally {await isolated.close();}
});

test("resilience answers preserve a newer edit across an old receipt and reconcile a real ignored write before submission", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("resilience_receipts");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const entry = entryResponseFor(page, "launch"); await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
  await beginOwnedExam(page);
  let gate = await pauseEntry(page, null, "Response", "answers");
  try {
    await page.getByRole("radio").nth(1).check();
    expect((await gate.paused).responseStatusCode).toBe(200);
    await page.getByRole("radio").nth(0).check();
  } finally {await gate.dispose();}
  await expect.poll(async () => (await ref.get()).get(`answerMap.${questionId}.response.optionId`), {timeout: 30000}).toBe("A");
  await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {unknown: 1}).length).toBe(0);
  const before = (await ref.get()).data();
  gate = await pauseEntry(page, null, "Request", "answers");
  let sent;
  try {
    await page.getByRole("radio").nth(1).check();
    const paused = await gate.paused; sent = JSON.parse(paused.request.postData);
    const headers = Object.fromEntries(Object.entries(paused.request.headers).filter(([key]) =>
      ["authorization", "x-parabolic-exam-owner", "x-parabolic-exam-generation"].includes(key.toLowerCase())));
    const accepted = {...sent, batchId: crypto.randomUUID(), batchSequence: sent.batchSequence + 1000,
      answers: [{...sent.answers[0], clientRevision: sent.answers[0].clientRevision + 1000,
        clientTimestamp: sent.answers[0].clientTimestamp + 1, response: {kind: "mcq", optionId: "A"}}]};
    const response = await page.request.post(`/api/v1/exam/session/${launch.sessionId}/answers`, {headers, data: accepted});
    expect(response.status()).toBe(200);
    const ignored = page.waitForResponse(r => r.url().endsWith("/answers") && r.request().postDataJSON().batchId === sent.batchId);
    const reconcile = entryResponseFor(page, "reconcile");
    await gate.dispose(); gate = null;
    const receipt = await ignored; expect(receipt.status()).toBe(200);
    expect((await receipt.json()).data.acknowledgements[0].disposition).toBe("ignored");
    expect((await reconcile).status()).toBe(200);
  } finally {if (gate) await gate.dispose();}
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  const status = page.getByRole("region", {name: "Answer recovery status"});
  await expect(status).toContainText("superseded");
  await page.getByRole("button", {name: "Submit Test", exact: true}).click();
  const dialog = page.getByRole("dialog", {name: "Confirm exam submission"});
  await dialog.getByLabel(/I understand.*will remain unanswered/u).check();
  await expect(dialog.getByRole("button", {name: "Confirm Final Submit"})).toBeDisabled();
  // A known rejected change needs explicit disclosure acceptance; uncertainty cannot be waived.
  await dialog.getByRole("button", {name: "Cancel", exact: true}).click();
  await status.getByRole("checkbox").check();
  await page.getByRole("button", {name: "Submit Test", exact: true}).click();
  await dialog.getByLabel(/I understand.*will remain unanswered/u).check();
  const submitted = page.waitForResponse(r => r.url().endsWith("/submit"));
  await dialog.getByRole("button", {name: "Confirm Final Submit"}).click();
  expect((await submitted).status()).toBe(200);
  const final = (await ref.get()).data(); expect(final.status).toBe("submitted");
  expect(final.answerMap[questionId].response.optionId).toBe("A");
  expect(final.deadlineAt.toMillis()).toBe(before.deadlineAt.toMillis());
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.closed).toBe(true);
  expect(Object.keys(await recoveryRecord(page, launch.sessionId)).sort()).toEqual(["closed", "runtimeGeneration", "schemaVersion", "scopeHash", "sessionId"]);
});

test("mounted ownership fences cloned tabs, independent replay, renewal, release and same-UID replacement", async ({page, browser}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("clones");
  const launch = await issueLaunch(page);
  const entryPath = `/api/v1/exam/session/${launch.sessionId}/entry`;
  const sessionRef = firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`);
  let leakedHeaders = false;
  page.on("request", request => {
    if (!request.url().includes(`/api/v1/exam/session/${launch.sessionId}/`) && request.headers()["x-parabolic-exam-owner"]) leakedHeaders = true;
  });
  const initial = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl);
  const first = (await (await initial).json()).data;
  await beginOwnedExam(page);
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.runtimeGeneration).toBe(first.ownership.generation);
  const renewal = entryResponseFor(page, "renew");
  const renew = await renewal;
  expect(renew.status()).toBe(200);
  const renewed = (await renew.json()).data.ownership;
  expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(first.ownership.expiresAt));
  const oldHeaders = renew.request().headers();
  const oldProofHeaders = {authorization: oldHeaders.authorization,
    "X-Parabolic-Exam-Owner": oldHeaders["x-parabolic-exam-owner"],
    "X-Parabolic-Exam-Generation": oldHeaders["x-parabolic-exam-generation"]};
  const cloneResponse = page.context().waitForEvent("response", {predicate: response => response.url().endsWith("/entry") &&
    response.request().postDataJSON()?.operation === "recover", timeout: 90000});
  const popup = page.waitForEvent("popup");
  await page.evaluate(path => window.open(path, "_blank"), new URL(launch.examUrl).pathname);
  const clone = await popup;
  const recoveredResponse = await cloneResponse;
  expect(recoveredResponse.status()).toBe(200);
  const recovered = (await recoveredResponse.json()).data;
  expect(recovered.ownership.generation).toBe(first.ownership.generation + 1);
  await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
  await expect(clone.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  expect(recovered.entry.deadlineAt).toBe((await sessionRef.get()).get("deadlineAt").toDate().toISOString());
  const before = JSON.stringify((await sessionRef.get()).get("answerMap"));
  for (const [path, body] of [
    [entryPath, {operation: "release", commandId: crypto.randomUUID()}],
    [entryPath.replace(/entry$/u, "activate"), {contractVersion: 1, preflight: {camera: "not_requested"}}],
    [entryPath.replace(/entry$/u, "answers"), {instituteId, runId, yearId, batchId: "stale-tab", batchSequence: 100,
      flushReason: "scheduled", millisecondsSinceLastWrite: 5000, answers: [{questionId, clientRevision: 100,
        clientTimestamp: Date.now(), response: {kind: "mcq", optionId: "A"}, timeSpentSeconds: 0}]}],
    [entryPath.replace(/entry$/u, "submit"), {instituteId, runId, yearId, reason: "manual"}],
  ]) {
    const denied = await page.request.post(path, {data: body, headers: oldProofHeaders});
    expect(denied.status()).toBe(409);
  }
  expect(JSON.stringify((await sessionRef.get()).get("answerMap"))).toBe(before);
  expect((await sessionRef.get()).get("submissionLock")).toBe(false);
  const outsider = await browser.newContext({bypassCSP});
  try {
    const other = await outsider.newPage();
    const denied = entryResponseFor(other, "launch");
    await other.goto(launch.examUrl);
    expect((await denied).status()).toBe(401);
    await other.reload();
    await expect(other.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
    await expect(other.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
  } finally {await outsider.close();}
  const release = entryResponseFor(clone, "release");
  await clone.getByRole("button", {name: "Sign out of Exam"}).click();
  expect((await release).status()).toBe(200);
  await expect(clone.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
  expect((await sessionRef.get()).get("runtimeOwnership.state")).toBe("released");
  expect((await recoveryRecord(clone, launch.sessionId)).runtimeGeneration).toBe(recovered.ownership.generation);
  const fresh = await issueLaunch(page, "resume");
  const next = entryResponseFor(page, "launch");
  await page.goto("about:blank"); await page.goto(fresh.examUrl);
  expect((await next).status()).toBe(200);
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  const generation = (await sessionRef.get()).get("runtimeOwnership.generation");
  const replacement = await issueLaunch(page, "resume");
  const deniedReplacement = entryResponseFor(clone, "launch");
  await clone.goto("about:blank"); await clone.goto(replacement.examUrl);
  expect((await deniedReplacement).status()).toBe(409);
  await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible({timeout: 15000});
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
  expect((await sessionRef.get()).get("runtimeOwnership.generation")).toBe(generation);
  expect((await sessionRef.get()).get("status")).toBe("active");
  expect(leakedHeaders).toBe(false);
  await clone.close();
});

test("mounted ownership revocation stops real camera tracks and preserves recovery without submission", async ({page}) => {
  test.setTimeout(120000);
  await prepareOwnershipRun("revocation", true);
  await page.context().grantPermissions(["camera"]);
  await page.addInitScript(() => {
    window.__examStreams = [];
    window.__examCameraRequests = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const pending = original(options); window.__examCameraRequests.push(pending);
      const stream = await pending; window.__examStreams.push(stream); return stream;
    };
  });
  const launch = await issueLaunch(page);
  const initial = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl); const entry = await initial; expect(entry.status()).toBe(200);
  expect((await entry.json()).data.entry.runtimeSnapshot.proctoringPolicy.cameraReadiness).toBe("required");
  const cameraAcknowledged = page.waitForResponse(r => r.url().endsWith("/integrity-events") && r.status() === 200);
  await page.getByRole("button", {name: /I agree.*Start Camera/u}).click();
  expect(await page.evaluate(async () => {
    if (!window.__examCameraRequests.length) throw new Error("Camera request was not started.");
    await Promise.all(window.__examCameraRequests);
    return window.__examStreams.flatMap(stream => stream.getTracks()).some(track => track.readyState === "live");
  })).toBe(true);
  await expect(page.getByText(/Local camera preview ready/u)).toBeVisible();
  await cameraAcknowledged;
  await getAuth(adminApp).updateUser(studentUid, {disabled: true});
  try {
    const renewal = entryResponseFor(page, "renew");
    expect((await renewal).status()).toBe(401);
    await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__examStreams.flatMap(stream => stream.getTracks()).every(track => track.readyState === "ended"))).toBe(true);
    const session = (await firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`).get()).data();
    expect(session.status).toBe("started");
    expect(session.submittedAt).toBeNull();
  } finally {await getAuth(adminApp).updateUser(studentUid, {disabled: false});}
});

if (studentOrigin) {
  test("Student returns reach the configured Hosting target from invalid, closed and denied entry", async ({page, browser}) => {
    test.setTimeout(120000);
    async function returnToUnauthenticatedStudent(target, name) {
      const document = target.waitForResponse(response => response.request().isNavigationRequest() && response.url() === `${studentOrigin}/student/my-tests`);
      await target.getByRole("button", {name, exact: true}).click();
      const response = await document; expect(response.status()).toBe(200);
      expect(await response.text()).toContain("/student/assets/");
      expect(response.request().headers().authorization).toBeUndefined();
      expect(response.request().headers()["x-parabolic-exam-owner"]).toBeUndefined();
      expect(response.request().headers().referer ?? "").toBe("");
      await expect(target.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
      expect(new URL(target.url()).origin).toBe(studentOrigin);
      expect(new URL(target.url()).search).toBe(""); expect(new URL(target.url()).hash).toBe("");
    }
    await page.goto(`${examOrigin}/session/invalid?returnUrl=https://untrusted.invalid&redirect=https://untrusted.invalid`);
    await expect(page.getByRole("heading", {name: "Session Access Blocked"})).toBeVisible();
    await returnToUnauthenticatedStudent(page, "Go to Student Portal");
    await prepareOwnershipRun("returns");
    // Use a real short server window. Wall-clock jumps cannot close the
    // monotonic server-anchored lobby introduced by resilience recovery.
    const returnRun = firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`);
    await returnRun.update({endWindow: Timestamp.fromMillis(Date.now() + 20000)});
    const launch = await issueLaunch(page);
    const entry = entryResponseFor(page, "launch");
    await page.goto(launch.examUrl); const initial = await entry; expect(initial.status()).toBe(200);
    const body = (await initial.json()).data.entry;
    await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
    await page.clock.setFixedTime(Date.parse(body.runtimeSnapshot.schedule.sessionEndsAt) + 1000);
    await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
    await expect(page.getByRole("heading", {name: "Entry Window Closed"})).not.toBeVisible();
    await expect(page.getByRole("heading", {name: "Entry Window Closed"})).toBeVisible({timeout: 25000});
    await returnToUnauthenticatedStudent(page, "Return to Student Portal");
    const independent = await browser.newContext({bypassCSP});
    try {
      const deniedPage = await independent.newPage();
      const denied = entryResponseFor(deniedPage, "launch");
      await deniedPage.goto(launch.examUrl); expect((await denied).status()).toBe(401);
      await expect(deniedPage.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
      await returnToUnauthenticatedStudent(deniedPage, "Return to Student Portal");
    } finally {await independent.close();}
    const session = (await firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`).get()).data();
    expect(session.status).toBe("started"); expect(session.submittedAt).toBeNull();
  });
}
if (process.env.PARABOLIC_RETURN_CONFIG_MISSING === "true") {
  test("missing Student return configuration disables navigation without an Exam fallback", async ({page}) => {
    await page.goto(`${examOrigin}/session/invalid?returnUrl=https://untrusted.invalid`);
    await expect(page.getByRole("heading", {name: "Session Access Blocked"})).toBeVisible();
    await expect(page.getByRole("button", {name: "Go to Student Portal", exact: true})).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Student Portal link is unavailable");
    expect(new URL(page.url()).origin).toBe(examOrigin);
    expect(new URL(page.url()).pathname).toBe("/session/invalid");
    expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  });
}

// Pause Chromium's real network delivery. Never synthesize or replace a response.
// Response-stage gates run only after Functions has committed the actual request.
async function pauseEntry(page, operation, stage = "Response", suffix = "entry") {
  const cdp = await page.context().newCDPSession(page);
  let resolve;
  const paused = new Promise(done => {resolve = done;});
  let captured;
  cdp.on("Fetch.requestPaused", event => {
    const body = event.request.postData ? JSON.parse(event.request.postData) : {};
    if (!captured && (suffix !== "entry" || body.operation === operation)) {
      captured = event; resolve(event);
    } else void cdp.send("Fetch.continueRequest", {requestId: event.requestId}).catch(() => undefined);
  });
  await cdp.send("Fetch.enable", {patterns: [{urlPattern: `*/api/v1/exam/session/*/${suffix}`, requestStage: stage}]});
  return {paused, async abort() {
    if (captured) await cdp.send("Fetch.failRequest", {requestId: captured.requestId, errorReason: "Aborted"});
  }, async dispose() {
    // Navigation/abort may already have removed this real request.
    if (captured) await cdp.send("Fetch.continueRequest", {requestId: captured.requestId}).catch(() => undefined);
    await cdp.detach();
  }};
}
const ownerKey = "parabolic.exam.runtimeOwner.v2";
const ownerRecord = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), ownerKey);
const sessionFor = launch => firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`);

test("security matrix recovers committed lost launch/recovery responses but denies an uncommitted pending command", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("lost_response");
  const launch = await issueLaunch(page);
  const ref = sessionFor(launch);
  let gate = await pauseEntry(page, "launch");
  try {
    await page.goto(launch.examUrl);
    expect((await gate.paused).responseStatusCode).toBe(200);
    const pendingLaunch = await ownerRecord(page);
    expect(pendingLaunch.pending.commandId).toBeTruthy();
    expect(pendingLaunch.current).toBeUndefined();
    expect((await ref.get()).get("runtimeOwnership.generation")).toBe(1);
    await page.goto("about:blank"); // Lose the actual successful response before application adoption.
  } finally {await gate.dispose();}
  let response = entryResponseFor(page, "recover");
  await page.goto(`${examOrigin}/session/${launch.sessionId}`);
  let recovered = await response;
  expect(recovered.status()).toBe(200);
  expect(recovered.request().postDataJSON().previous.pendingCommandId).toBeTruthy();
  await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
  expect((await ownerRecord(page)).current.generation).toBe(2);

  gate = await pauseEntry(page, "recover");
  try {
    await page.reload();
    expect((await gate.paused).responseStatusCode).toBe(200);
    expect((await ref.get()).get("runtimeOwnership.generation")).toBe(3);
    const unresolved = await ownerRecord(page);
    expect(unresolved.current.generation).toBe(2);
    expect(unresolved.pending.commandId).toBeTruthy();
    await page.goto("about:blank");
  } finally {await gate.dispose();}
  response = entryResponseFor(page, "recover");
  await page.goto(`${examOrigin}/session/${launch.sessionId}`);
  expect((await response).status()).toBe(200);
  await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
  expect((await ownerRecord(page)).current.generation).toBe(4);
  expect((await ownerRecord(page)).pending).toBeUndefined();

  // This recovery is paused BEFORE dispatch. A saved pending record must not
  // fall back to its otherwise valid current proof when that command never ran.
  gate = await pauseEntry(page, "recover", "Request");
  try {
    await page.reload(); await gate.paused;
    expect((await ownerRecord(page)).current.generation).toBe(4);
    expect((await ownerRecord(page)).pending).toBeTruthy();
    await page.goto("about:blank");
  } finally {await gate.dispose();}
  response = entryResponseFor(page, "recover");
  await page.goto(`${examOrigin}/session/${launch.sessionId}`);
  const denied = await response;
  expect(denied.status()).toBe(409);
  expect((await denied.json()).error.details.reason).toBe("ownership_lost");
  await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
  const final = (await ref.get()).data();
  expect(final.runtimeOwnership.generation).toBe(4);
  expect(final.status).toBe("started"); expect(final.submittedAt).toBeNull();
});

test("security matrix expires offline on the real lease clock and recovers pending answers without moving the deadline", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("offline_expiry");
  const launch = await issueLaunch(page);
  const ref = sessionFor(launch);
  const response = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl); expect((await response).status()).toBe(200);
  await beginOwnedExam(page);
  const initial = (await ref.get()).data();
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.runtimeGeneration).toBe(1);
  await page.context().setOffline(true);
  try {
    await page.getByRole("radio").nth(1).check();
    await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {}).length).toBe(1);
    // No clock mocking or Firestore expiry edit: both clocks must really expire.
    await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible({timeout: 100000});
    await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
    expect(Object.keys((await recoveryRecord(page, launch.sessionId)).pendingAnswerMap)).toHaveLength(1);
    const expired = (await ref.get()).data();
    expect(expired.runtimeOwnership.expiresAt.toMillis()).toBeLessThanOrEqual(Date.now());
    expect(expired.status).toBe("active"); expect(expired.submittedAt).toBeNull();
    expect(expired.deadlineAt.toMillis()).toBe(initial.deadlineAt.toMillis());
  } finally {await page.context().setOffline(false);}
  const recovery = entryResponseFor(page, "recover");
  const flushed = page.waitForResponse(response => response.url().endsWith(`/session/${launch.sessionId}/answers`), {timeout: 90000});
  await page.reload(); expect((await recovery).status()).toBe(200);
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  expect((await flushed).status()).toBe(200);
  expect((await ref.get()).get(`answerMap.${questionId}.selectedOption`)).toBe("B");
  await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {}).length).toBe(0);
  const final = (await ref.get()).data();
  expect(final.runtimeOwnership.generation).toBe(2);
  expect(final.deadlineAt.toMillis()).toBe(initial.deadlineAt.toMillis());
  expect(final.startedAt.toMillis()).toBe(initial.startedAt.toMillis());
  expect(final.status).toBe("active"); expect(final.submittedAt).toBeNull();
});

test("security matrix ignores a delayed answer callback after rotation and stops on a different UID", async ({page}) => {
  test.setTimeout(120000);
  await prepareOwnershipRun("stale_callback");
  const launch = await issueLaunch(page);
  const ref = sessionFor(launch);
  const entry = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
  await beginOwnedExam(page);
  const gate = await pauseEntry(page, null, "Response", "answers");
  let clone;
  try {
    await page.getByRole("radio").nth(1).check();
    expect((await gate.paused).responseStatusCode).toBe(200);
    expect((await ref.get()).get(`answerMap.${questionId}.selectedOption`)).toBe("B");
    const recovery = page.context().waitForEvent("response", {predicate: response => response.url().endsWith("/entry") && response.request().postDataJSON()?.operation === "recover"});
    const popup = page.waitForEvent("popup");
    await page.evaluate(path => window.open(path, "_blank"), `/session/${launch.sessionId}`);
    clone = await popup; expect((await recovery).status()).toBe(200);
    await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
    await expect(clone.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  } finally {await gate.dispose();}
  await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
  await expect.poll(async () => (await recoveryRecord(clone, launch.sessionId))?.runtimeGeneration).toBe(2);
  const before = await recoveryRecord(clone, launch.sessionId);
  // Deliver an actual SDK Auth replacement through another same-profile tab.
  // The new UID has no Student authority and must never inherit the old runtime.
  const replacement = await getAuth(adminApp).createUser({});
  const tab = await page.context().newPage();
  try {
    const credential = await getAuth(adminApp).createCustomToken(replacement.uid, {
      role: "student", instituteId, yearId, runId, sessionId: launch.sessionId,
      studentId, launchNonce: "never-issued-other-uid"});
    const denied = entryResponseFor(tab, "launch");
    await tab.goto(`${examOrigin}/session/${launch.sessionId}#launch=${encodeURIComponent(credential)}`);
    expect((await denied).status()).toBe(401);
    await expect(clone.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible({timeout: 15000});
    await expect(clone.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
    const retained = await recoveryRecord(clone, launch.sessionId);
    expect(retained.runtimeGeneration).toBe(before.runtimeGeneration);
    expect(before.responseStateByQuestionId[questionId]).toBeTruthy();
    expect(retained.responseStateByQuestionId).toEqual(before.responseStateByQuestionId);
    const final = (await ref.get()).data();
    expect(final.runtimeOwnership.generation).toBe(2);
    expect(final.status).toBe("active"); expect(final.submittedAt).toBeNull();
  } finally {
    await tab.close(); await clone?.close();
    await getAuth(adminApp).deleteUser(replacement.uid);
    await expect(getAuth(adminApp).getUser(replacement.uid)).rejects.toMatchObject({code: "auth/user-not-found"});
  }
});

if (studentOrigin) {
  test("security matrix returns from actual system termination and institute authority loss", async ({page}) => {
    test.setTimeout(120000);
    const systemApp = initializeApp({projectId});
    try {
      const {SessionService} = require("../../functions/lib/services/session.js");
      const service = new SessionService();
      for (const state of ["terminated", "suspended"]) {
        await prepareOwnershipRun(`return_${state}`);
        const launch = await issueLaunch(page);
        const ref = sessionFor(launch);
        const entry = entryResponseFor(page, "launch");
        await page.goto(launch.examUrl); expect((await entry).status()).toBe(200);
        await beginOwnedExam(page);
        if (state === "terminated") {
          const context = {actorType: "system", instituteId, yearId, runId, sessionId: launch.sessionId};
          await service.transitionSessionState(context, "expired");
          await service.transitionSessionState(context, "terminated");
          expect((await ref.get()).get("runtimeOwnership.state")).toBe("closed");
          const closed = (await ref.get()).data();
          const reconciliation = entryResponseFor(page, "reconcile");
          const writes = [];
          const observe = request => {
            if (/\/(?:activate|answers|submit)$/u.test(request.url()) ||
              request.url().endsWith("/entry") && request.postDataJSON()?.operation === "recover") writes.push(request.url());
          };
          page.on("request", observe);
          try {
            await page.reload();
            const response = await reconciliation; expect(response.status()).toBe(200);
            expect((await response.json()).data.status).toBe("terminated");
            await expect(page.getByRole("heading", {name: "Session Terminated", exact: true})).toBeVisible();
            expect(writes).toEqual([]);
            const final = (await ref.get()).data();
            expect(final.runtimeOwnership).toEqual(closed.runtimeOwnership);
            expect(final.startedAt).toEqual(closed.startedAt); expect(final.deadlineAt).toEqual(closed.deadlineAt);
            expect(final.result ?? null).toBeNull();
          } finally {page.off("request", observe);}
        } else {
          await firestore.doc(`institutes/${instituteId}`).update({status: "suspended"});
          const renewal = entryResponseFor(page, "renew");
          expect((await renewal).status()).toBe(403);
        }
        // Canonical termination is read-only; authority loss remains paused.
        await expect(page.getByRole("heading", {name: state === "terminated" ? "Session Terminated" : "Exam runtime paused", exact: true})).toBeVisible();
        await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).not.toBeVisible();
        const navigation = page.waitForResponse(response => response.request().isNavigationRequest() && response.url() === `${studentOrigin}/student/my-tests`);
        await page.getByRole("button", {name: "Return to Student Portal", exact: true}).click();
        const document = await navigation; expect(document.status()).toBe(200);
        expect(await document.text()).toContain("/student/assets/");
        const headers = document.request().headers();
        expect(headers.authorization).toBeUndefined();
        expect(headers["x-parabolic-exam-owner"]).toBeUndefined();
        expect(headers.referer ?? "").toBe("");
        await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
        expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
        expect((await ref.get()).get("submittedAt")).toBeNull();
        await firestore.doc(`institutes/${instituteId}`).update({status: "active"});
      }
    } finally {
      await firestore.doc(`institutes/${instituteId}`).update({status: "active"});
      await deleteApp(systemApp);
    }
  });
}

test("security matrix recovers an actual crashed renderer through browser reload", async () => {
  test.setTimeout(120000);
  // Own this entire browser process so the crash cannot affect another test or
  // a developer browser. SystemInfo returns only this browser's child PIDs.
  const isolated = await chromium.launch();
  try {
    const context = await isolated.newContext({baseURL: examOrigin, bypassCSP});
    const page = await context.newPage();
    await prepareOwnershipRun("renderer_crash");
    const launch = await issueLaunch(page);
    const ref = sessionFor(launch);
    const initial = entryResponseFor(page, "launch");
    await page.goto(launch.examUrl); expect((await initial).status()).toBe(200);
    await beginOwnedExam(page);
    const before = (await ref.get()).data();
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.runtimeGeneration).toBe(1);
    const answerGate = await pauseEntry(page, null, "Request", "answers");
    await page.getByRole("radio").nth(1).check();
    await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {}).length).toBe(1);
    await answerGate.paused;
    expect((await ref.get()).get(`answerMap.${questionId}`)).toBeUndefined();
    await answerGate.abort();
    await answerGate.dispose();
    console.info("[exam-security-crash] pending answer retained; transport canceled");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const flushed = new Promise(resolve => cdp.on("Network.responseReceived", event => {
      if (event.response.url.endsWith(`/session/${launch.sessionId}/answers`)) resolve(event.response.status);
    }));
    const crashed = page.waitForEvent("crash");
    const browserCdp = await isolated.newBrowserCDPSession();
    const {processInfo} = await browserCdp.send("SystemInfo.getProcessInfo");
    const renderers = processInfo.filter(info => info.type === "renderer");
    expect(renderers.length).toBeGreaterThan(0);
    for (const renderer of renderers) {
      expect(Number.isSafeInteger(renderer.id) && renderer.id > 0 && renderer.id !== process.pid).toBe(true);
      try {process.kill(renderer.id, "SIGKILL");}
      catch (error) {if (error.code !== "ESRCH") throw error;}
    }
    await crashed;
    console.info("[exam-security-crash] renderer crash observed; reloading same target");
    // Playwright permanently closes its Page action scope on crash. Use the
    // browser protocol to reload the SAME target, without copying storage/proofs.
    await cdp.send("Page.reload");
    await expect.poll(async () => {
      try {
        const result = await cdp.send("Runtime.evaluate", {expression: `JSON.stringify({generation: JSON.parse(sessionStorage.getItem(${JSON.stringify(ownerKey)}))?.current?.generation, visible: document.body.innerText.includes('Authoritative browser snapshot question'), clean: !location.search && !location.hash})`, returnByValue: true});
        return result.result.value ? JSON.parse(result.result.value) : null;
      } catch {return null;}
    }, {timeout: 90000}).toEqual({generation: 2, visible: true, clean: true});
    console.info("[exam-security-crash] generation rotated; awaiting answer acknowledgement");
    expect(await flushed).toBe(200);
    const after = (await ref.get()).data();
    expect(after.answerMap[questionId].selectedOption).toBe("B");
    expect(after.runtimeOwnership.generation).toBe(2);
    expect(after.deadlineAt.toMillis()).toBe(before.deadlineAt.toMillis());
    expect(after.startedAt.toMillis()).toBe(before.startedAt.toMillis());
    expect(after.submittedAt).toBeNull(); expect(after.status).toBe("active");
    await cdp.detach();
    await browserCdp.detach();
  } finally {await isolated.close();}
});

test("proctoring runtime uses consent and native readiness, replays real lost reporting response and pauses questions without blocking saves or submit", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("proctoring", true);
  await page.context().grantPermissions(["camera"]);
  await page.addInitScript(() => {
    window.__examStreams = []; window.__examCameraCalls = []; window.__integrityPosts = [];
    let deny = true, loseResponse = true;
    const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      window.__examCameraCalls.push(options);
      if (deny) {deny = false; throw new DOMException("Denied by test", "NotAllowedError");}
      const stream = await media(options); window.__examStreams.push(stream); return stream;
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const response = await nativeFetch(input, options);
      if (String(input).includes("/integrity-events")) {
        window.__integrityPosts.push({body: options.body, result: await response.clone().json()});
        if (loseResponse && response.ok) {loseResponse = false; throw new TypeError("Simulated lost response after real commit");}
      }
      return response;
    };
  });
  const launch = await issueLaunch(page); const initial=entryResponseFor(page,"launch");
  await page.goto(launch.examUrl); const entry=await initial;expect(entry.status()).toBe(200);
  const policy=(await entry.json()).data.entry.runtimeSnapshot.proctoringPolicy;
  expect(policy).toMatchObject({contractVersion:1,cameraReadiness:"required",capabilities:{automatedFaceMatching:"unavailable",automatedGazeTracking:"unavailable"}});
  expect(await page.evaluate(()=>window.__examCameraCalls.length)).toBe(0);
  await expect(page.getByRole("button",{name:"Continue to Instructions"})).toBeDisabled();
  await page.getByRole("button",{name:/I agree.*Start Camera/u}).click();
  await expect(page.getByText(/Camera readiness unavailable/u)).toBeVisible();
  await page.getByRole("button",{name:/I agree.*Retry Camera/u}).click();
  await expect(page.getByText(/Local camera preview ready/u)).toBeVisible();
  expect(await page.evaluate(()=>window.__examCameraCalls.every(c=>c.audio===false))).toBe(true);
  const sessionRef=firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${launch.sessionId}`);
  await expect.poll(()=>page.evaluate(()=>window.__integrityPosts.length),{timeout:30000}).toBeGreaterThanOrEqual(2);
  const posts=await page.evaluate(()=>window.__integrityPosts);
  expect(posts[0].body).toBe(posts[1].body);expect(posts[1].result.data.disposition).toBe("replayed");
  const batch=JSON.parse(posts[0].body); const stored=(await sessionRef.collection("integrityBatches").doc(batch.batchId).get()).data();
  expect(stored.events).toEqual(batch.events);expect(stored.source).toBe("client_report");
  expect(JSON.stringify(stored)).not.toMatch(/video|audio|image|cameraStream|ownerProof/u);
  await beginOwnedExam(page);
  const preflight=(await sessionRef.get()).data().activationPreflight;
  expect(preflight).toMatchObject({contractVersion:1,source:"client_report",preflight:{camera:"client_reported_ready",consentNoticeVersion:"exam-camera-local-v1",consentAccepted:true}});
  await page.context().setOffline(true);
  await page.getByRole("radio").nth(0).check();
  await page.evaluate(()=>window.__examStreams.forEach(s=>s.getTracks().forEach(t=>t.stop())));
  await expect(page.getByRole("heading",{name:"Question interaction paused"})).toBeVisible();
  await expect(page.getByText("Authoritative browser snapshot question",{exact:true})).toBeHidden();
  expect((await sessionRef.get()).data().status).toBe("active");
  const answerSaved=page.waitForResponse(r=>r.url().endsWith(`/session/${launch.sessionId}/answers`) && r.status()===200,{timeout:90000});
  await page.context().setOffline(false); await answerSaved;
  await expect.poll(async()=> (await sessionRef.get()).get(`answerMap.${questionId}.response`), {timeout:30000}).toEqual({kind:"mcq",optionId:"A"});

  await page.getByRole("button",{name:/I agree.*Retry Camera/u}).click();
  await expect(page.getByText("Authoritative browser snapshot question",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Stop Camera",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Question interaction paused"})).toBeVisible();
  // Existing real terminal UI remains available independently of camera and telemetry.
  await page.getByRole("button",{name:"Submit Test",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel(/I understand 11 question\(s\) will remain unanswered/u).check();
  const submit=page.waitForResponse(r=>r.url().endsWith(`/session/${launch.sessionId}/submit`),{timeout:90000});
  await page.getByRole("button",{name:"Confirm Final Submit",exact:true}).click();
  expect((await submit).status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>window.__examStreams.flatMap(s=>s.getTracks()).every(t=>t.readyState==="ended"))).toBe(true);
  expect((await sessionRef.get()).data().status).toBe("submitted");
});

// Test instrumentation wraps native devices/transport. It never manufactures a
// successful media track, API receipt or Firebase response.
async function instrumentProctoring(context) {
  await context.addInitScript(() => {
    const state = window.__proctoring = {streams: [], calls: [], errors: [], posts: [], receipts: [], failReporting: false, holdNext: false, release: null};
    const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      state.calls.push(options);
      let stream;
      try {stream = await media(options);} catch (error) {state.errors.push({stage: "getUserMedia", name: error.name}); throw error;}
      state.streams.push(stream);
      if (state.holdNext) {state.holdNext = false; return new Promise(resolve => {state.release = () => {state.release = null; resolve(stream);};});}
      return stream;
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const reporting = String(input instanceof Request ? input.url : input).includes("/integrity-events");
      if (reporting) {
        state.posts.push(options.body);
        if (state.failReporting) throw new TypeError("Test transport unavailable before dispatch");
      }
      const response = await nativeFetch(input, options);
      if (reporting) state.receipts.push(await response.clone().json());
      return response;
    };
  });
}
const nativeTracksEnded = page => page.evaluate(() => window.__proctoring.streams.flatMap(s => s.getTracks()).every(t => t.readyState === "ended"));
async function cameraReady(page) {
  await page.getByRole("button", {name: /I agree.*(?:Start|Retry) Camera/u}).click();
  await expect(page.getByText(/Local camera preview ready/u)).toBeVisible().catch(async error => {
    const state = await page.evaluate(async () => ({permission: (await navigator.permissions.query({name: "camera"})).state,
      calls: window.__proctoring.calls.length, errors: window.__proctoring.errors,
      tracks: window.__proctoring.streams.flatMap(s => s.getTracks()).map(t => ({state: t.readyState, enabled: t.enabled, muted: t.muted})),
      videos: [...document.querySelectorAll("video")].map(v => ({state: v.readyState, width: v.videoWidth, height: v.videoHeight})),
      unavailable: document.body.innerText.includes("Camera readiness unavailable"), waiting: document.body.innerText.includes("Waiting for permission"),
      interrupted: document.body.innerText.includes("Exam runtime paused") }));
    await test.info().attach("native-camera-state", {body: JSON.stringify(state), contentType: "application/json"});
    throw error;
  });
  await expect.poll(() => page.getByLabel("Local camera preview", {exact: true}).evaluate(video => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)).toBe(true);
  expect(await page.evaluate(() => window.__proctoring.calls.every(c => c.audio === false))).toBe(true);
  expect(await page.evaluate(() => window.__proctoring.streams.every(s => s.getAudioTracks().length === 0))).toBe(true);
  await expect(page.getByRole("button", {name: /Verify Face|Calibration/u})).toHaveCount(0);
}
async function enteredCameraRun(page, suffix) {
  await prepareOwnershipRun(suffix, true);
  const launch = await issueLaunch(page), response = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl); expect((await response).status()).toBe(200);
  return launch;
}
async function noStoredObservationIntent(page, batchId, sessionId) {
  expect(await page.evaluate(id => JSON.stringify({...localStorage, ...sessionStorage}).includes(id), batchId)).toBe(false);
  const recovery = await recoveryRecord(page, sessionId);
  expect(JSON.stringify(recovery)).not.toContain(batchId);
  expect(JSON.stringify(recovery)).not.toMatch(/cameraStream|consentAccepted|integrityEvents|integrityBatches/u);
}

test("proctoring acceptance denies native camera permission and fences cancellation, replacement and late navigation results", async () => {
  test.setTimeout(180000);
  // Automatic permission UI would override denial. Use the same native fake
  // video device in a separate browser without the auto-accept flag.
  const nativeBrowser = await chromium.launch({channel: "chromium", args: ["--use-fake-device-for-media-stream"]});
  try {
    const context = await nativeBrowser.newContext({baseURL: examOrigin, bypassCSP});
    const page = await context.newPage();
    await instrumentProctoring(page.context());
    await enteredCameraRun(page, "permission_lifetime");
    const cdp = await page.context().newCDPSession(page);
    const {targetInfo} = await cdp.send("Target.getTargetInfo");
    const permission = setting => cdp.send("Browser.setPermission", {permission: {name: "camera"}, setting, origin: examOrigin, browserContextId: targetInfo.browserContextId});
    try {
      await permission("denied");
      expect(await page.evaluate(async () => (await navigator.permissions.query({name: "camera"})).state)).toBe("denied");
      expect(await page.evaluate(() => window.__proctoring.calls.length)).toBe(0);
      await page.getByRole("button", {name: /I agree.*Start Camera/u}).click();
      await expect(page.getByText(/Camera readiness unavailable/u)).toBeVisible();
      expect(await page.evaluate(() => window.__proctoring.streams.length)).toBe(0);
      await expect(page.getByRole("button", {name: "Continue to Instructions"})).toBeDisabled();
      await permission("granted"); await cameraReady(page);
      // Native disabled track must invalidate readiness, with no automatic retry.
      await page.evaluate(() => {window.__proctoring.streams.at(-1).getVideoTracks()[0].enabled = false;});
      await expect(page.getByText(/Camera readiness unavailable/u)).toBeVisible();
      await expect.poll(() => nativeTracksEnded(page)).toBe(true);
      const calls = await page.evaluate(() => window.__proctoring.calls.length);
      await page.evaluate(() => {window.__proctoring.holdNext = true;});
      await page.getByRole("button", {name: /I agree.*Retry Camera/u}).click();
      await expect.poll(() => page.evaluate(() => !!window.__proctoring.release)).toBe(true);
      await page.getByRole("button", {name: "Stop Camera", exact: true}).click();
      await page.evaluate(() => window.__proctoring.release());
      await expect.poll(() => nativeTracksEnded(page)).toBe(true);
      await expect(page.getByText(/Fresh consent and local readiness/u)).toBeVisible();
      expect(await page.evaluate(() => window.__proctoring.calls.length)).toBe(calls + 1);
      await cameraReady(page);
      // A queued old-stream event must not invalidate the newly ready stream.
      await page.evaluate(() => window.__proctoring.streams[0].getVideoTracks()[0].dispatchEvent(new Event("ended")));
      await expect(page.getByText(/Local camera preview ready/u)).toBeVisible();
      await page.evaluate(() => {window.__proctoring.holdNext = true;});
      await page.getByRole("button", {name: /I agree.*Start Camera/u}).click();
      await expect.poll(() => page.evaluate(() => !!window.__proctoring.release)).toBe(true);
      // Real same-document route navigation unmounts the runtime while the actual
      // native permission result is withheld. Resolve it only after teardown.
      await page.evaluate(() => {history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate"));});
      await expect(page.getByRole("heading", {name: "Session Access Blocked"})).toBeVisible();
      await page.evaluate(() => window.__proctoring.release());
      await expect.poll(() => nativeTracksEnded(page)).toBe(true);
      expect(await page.locator("video").count()).toBe(0);
    } finally {await cdp.detach();}
  } finally {await nativeBrowser.close();}
});

test("proctoring acceptance bounds failed reporting, explicitly retries exact intent and discards it across camera recovery ownership", async ({page}) => {
  test.setTimeout(180000);
  await instrumentProctoring(page.context()); await page.context().grantPermissions(["camera"]);
  const launch = await enteredCameraRun(page, "queue_recovery"), ref = sessionFor(launch);
  let sentHeaders;
  page.on("request", request => {if (request.url().endsWith("/integrity-events")) sentHeaders = request.headers();});
  await page.evaluate(() => {window.__proctoring.failReporting = true;});
  await cameraReady(page); await beginOwnedExam(page);
  const deadline = (await ref.get()).get("deadlineAt").toMillis();
  await page.evaluate(() => {for (let i = 0; i < 65; i++) dispatchEvent(new Event(i % 2 ? "online" : "offline"));});
  const status = page.getByRole("region", {name: "Client observation reporting"});
  await expect(status).toContainText("60 not yet saved");
  await expect(status).toContainText("6 lost or discarded");
  await expect(status).toContainText("unavailable", {timeout: 15000});
  const attempts = await page.evaluate(() => window.__proctoring.posts);
  expect(attempts).toHaveLength(4); expect(new Set(attempts).size).toBe(1);
  const batch = JSON.parse(attempts[0]);
  expect((await ref.collection("integrityBatches").get()).size).toBe(0);
  await noStoredObservationIntent(page, batch.batchId, launch.sessionId);
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  await page.evaluate(() => {window.__proctoring.failReporting = false;});
  const accepted = page.waitForResponse(r => r.url().endsWith("/integrity-events") && r.status() === 200);
  await page.getByRole("button", {name: "Retry reporting", exact: true}).click(); await accepted;
  // Re-block later unique batches while the popup loads: the test transfers
  // ownership with an uncertain queue, rather than racing a legitimate flush.
  await page.evaluate(() => {window.__proctoring.failReporting = true;});
  await expect(status).toContainText(`${batch.events.length} acknowledged`);
  expect((await ref.collection("integrityBatches").doc(batch.batchId).get()).get("events")).toEqual(batch.events);
  const recover = page.context().waitForEvent("response", {predicate: r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "recover", timeout: 90000});
  const popup = page.waitForEvent("popup");
  await page.evaluate(path => window.open(path, "_blank"), `/session/${launch.sessionId}`);
  const clone = await popup;
  try {
    const entry = (await (await recover).json()).data; expect(entry.ownership.generation).toBe(2);
    await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
    await expect.poll(() => nativeTracksEnded(page)).toBe(true);
    await expect(status).toContainText("stopped");
    await expect(status).toContainText("0 not yet saved");
    await expect(clone.getByText("Authoritative browser snapshot question", {exact: true})).toBeHidden();
    expect(await clone.evaluate(() => window.__proctoring.calls.length)).toBe(0);
    const oldAttempts = await page.evaluate(() => window.__proctoring.posts.length);
    // Absence window spans the next scheduled unique-batch flush.
    await new Promise(resolve => setTimeout(resolve, 5200));
    expect(await page.evaluate(() => window.__proctoring.posts.length)).toBe(oldAttempts);
    expect(await clone.evaluate(() => window.__proctoring.posts.length)).toBe(0);
    const counts = (await ref.get()).get("integrityReportingState");
    const denied = await page.request.post(`/api/v1/exam/session/${launch.sessionId}/integrity-events`, {data: batch, headers: {
      authorization: sentHeaders.authorization, "X-Parabolic-Exam-Owner": sentHeaders["x-parabolic-exam-owner"],
      "X-Parabolic-Exam-Generation": sentHeaders["x-parabolic-exam-generation"]}});
    expect(denied.status()).toBe(409); expect((await ref.get()).get("integrityReportingState")).toEqual(counts);
    await cameraReady(clone);
    await expect(clone.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
    await expect.poll(async () => (await ref.collection("integrityBatches").get()).size).toBe(2);
    const fresh = await clone.evaluate(() => JSON.parse(window.__proctoring.posts[0]));
    expect(fresh.batchId).not.toBe(batch.batchId);
    expect((await ref.collection("integrityBatches").doc(fresh.batchId).get()).get("generation")).toBe(2);
    expect((await ref.get()).get("integrityReportingState.acceptedBatchCount")).toBe(2);
    expect((await ref.get()).get("integrityReportingState.acceptedEventCount")).toBe(batch.events.length + fresh.events.length);
    expect((await ref.get()).get("deadlineAt").toMillis()).toBe(deadline);
    const released = entryResponseFor(clone, "release");
    await clone.getByRole("button", {name: "Sign out of Exam", exact: true}).click(); expect((await released).status()).toBe(200);
    await expect.poll(() => nativeTracksEnded(clone)).toBe(true);
    expect((await ref.get()).get("status")).toBe("active");
    expect((await ref.get()).get("submittedAt")).toBeNull();
  } finally {await clone.close();}
});

test("proctoring acceptance submits with a live camera and unavailable reporting without uploads or a terminal drain", async ({page}) => {
  test.setTimeout(180000);
  await instrumentProctoring(page.context()); await page.context().grantPermissions(["camera"]);
  const launch = await enteredCameraRun(page, "terminal_camera"), ref = sessionFor(launch);
  const mediaRequests = [];
  page.on("request", request => {if (new URL(request.url()).pathname.startsWith("/api/v1/") && (/image|audio|video|multipart/iu.test(request.headers()["content-type"] ?? "") || /identity|upload|media/iu.test(new URL(request.url()).pathname))) mediaRequests.push(request.url());});
  await page.evaluate(() => {window.__proctoring.failReporting = true;});
  await cameraReady(page); await beginOwnedExam(page);
  expect(await nativeTracksEnded(page)).toBe(false);
  await page.getByRole("button", {name: "Submit Test", exact: true}).click();
  await page.getByLabel(/I understand 12 question\(s\) will remain unanswered/u).check();
  const result = page.waitForResponse(r => r.url().endsWith("/submit"), {timeout: 90000});
  await page.getByRole("button", {name: "Confirm Final Submit", exact: true}).click(); expect((await result).status()).toBe(200);
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  await expect.poll(() => nativeTracksEnded(page)).toBe(true);
  await expect(page.getByRole("region", {name: "Client observation reporting"})).toContainText("stopped");
  expect((await ref.get()).get("integrityReportingState.acceptedBatchCount")).toBe(0);
  expect((await ref.collection("integrityBatches").get()).size).toBe(0);
  expect(mediaRequests).toEqual([]);
  expect(await page.evaluate(() => window.__proctoring.calls.length)).toBe(1);
});

test("proctoring acceptance stops camera and private pending observations on an actual different-UID Firebase replacement", async ({page}) => {
  test.setTimeout(180000);
  await instrumentProctoring(page.context()); await page.context().grantPermissions(["camera"]);
  const launch = await enteredCameraRun(page, "identity_camera"), ref = sessionFor(launch);
  const receipt = page.waitForResponse(r => r.url().endsWith("/integrity-events") && r.status() === 200);
  await cameraReady(page); await receipt; await beginOwnedExam(page);
  const saved = page.waitForResponse(r => r.url().endsWith("/answers") && r.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.runtimeGeneration).toBe(1);
  await page.evaluate(() => {window.__proctoring.failReporting = true; dispatchEvent(new Event("offline"));});
  const before = (await ref.get()).data();
  const replacement = await getAuth(adminApp).createUser({}), tab = await page.context().newPage();
  try {
    const credential = await getAuth(adminApp).createCustomToken(replacement.uid, {role: "student", instituteId, yearId, runId, sessionId: launch.sessionId, studentId, launchNonce: "never-issued-other-uid"});
    const denied = entryResponseFor(tab, "launch");
    await tab.goto(`${examOrigin}/session/${launch.sessionId}#launch=${encodeURIComponent(credential)}`); expect((await denied).status()).toBe(401);
    await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible({timeout: 15000});
    await expect.poll(() => nativeTracksEnded(page)).toBe(true);
    await expect(page.getByRole("region", {name: "Client observation reporting"})).toContainText("stopped");
    const after = (await ref.get()).data();
    expect(after.answerMap).toEqual(before.answerMap); expect(after.runtimeOwnership.generation).toBe(1);
    expect(after.status).toBe("active"); expect(after.submittedAt).toBeNull();
    expect((await recoveryRecord(page, launch.sessionId)).runtimeGeneration).toBe(1);
  } finally {await tab.close(); await getAuth(adminApp).deleteUser(replacement.uid);}
});

test("resilience expiry entry needs no camera or instructions and recovers after exhausted finalization", async ({page}) => {
  test.setTimeout(180000);
  await instrumentProctoring(page.context());
  await prepareOwnershipRun("resilience_expired_entry", true);
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const deadline = Timestamp.fromMillis(Date.now() - 1000);
  await ref.update({status: "expired", deadlineAt: deadline});
  let dispatches = 0;
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Fetch.requestPaused", event => {dispatches++; void cdp.send("Fetch.failRequest", {requestId: event.requestId, errorReason: "Aborted"});});
  await cdp.send("Fetch.enable", {patterns: [{urlPattern: "*/api/v1/exam/session/*/submit", requestStage: "Request"}]});
  await page.goto(launch.examUrl, {waitUntil: "domcontentloaded"});
  await expect(page.getByRole("heading", {name: "Exam time expired", exact: true})).toBeVisible({timeout: 60000});
  await expect(page.getByRole("button", {name: "Retry submission confirmation", exact: true})).toBeEnabled({timeout: 30000});
  await expect.poll(() => dispatches).toBe(3);
  await expect(page.getByRole("status").filter({hasText: "Submission confirmation unavailable"})).toBeVisible();
  expect((await ref.get()).get("status")).toBe("expired");
  await expect(page.getByRole("button", {name: "Continue to Instructions"})).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  expect(await page.evaluate(() => window.__proctoring.calls.length)).toBe(0);
  await cdp.detach();
  await page.getByRole("button", {name: "Retry submission confirmation", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible({timeout: 60000});
  expect((await ref.get()).get("submissionReason")).toBe("expiry");
  expect((await ref.get()).get("deadlineAt").toMillis()).toBe(deadline.toMillis());
});

test("resilience expiry retains late offline edits and reads a lost committed receipt on reload", async ({page, context}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("resilience_lost_expiry");
  const runRef = firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`);
  await runRef.update({endWindow: Timestamp.fromMillis(Date.now() + 25000)});
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  await page.goto(launch.examUrl, {waitUntil: "domcontentloaded"}); await beginOwnedExam(page);
  await page.getByRole("radio").nth(1).check();
  await expect.poll(async () => (await ref.get()).get(`answerMap.${questionId}.response.optionId`), {timeout: 20000}).toBe("B");
  const before = (await ref.get()).data();
  await context.setOffline(true);
  await page.getByRole("radio").nth(0).check();
  await expect.poll(async () => Object.keys((await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? {}).length).toBeGreaterThan(0);
  const wait = before.deadlineAt.toMillis() - Date.now() + 1500;
  if (wait > 0) await page.waitForTimeout(wait);
  expect((await ref.get()).get(`answerMap.${questionId}.response.optionId`)).toBe("B");
  const gate = await pauseEntry(page, null, "Response", "submit");
  await context.setOffline(false);
  await gate.paused;
  const committed = (await ref.get()).data();
  expect(committed.status).toBe("submitted"); expect(committed.submissionReason).toBe("expiry");
  expect(committed.answerMap[questionId].response.optionId).toBe("B");
  expect(committed.deadlineAt.toMillis()).toBe(before.deadlineAt.toMillis());
  await gate.abort(); await gate.dispose();
  const probe = entryResponseFor(page, "reconcile");
  await page.reload({waitUntil: "domcontentloaded"});
  expect((await probe).status()).toBe(200);
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible({timeout: 60000});
  await expect(page.getByText("Already finalized", {exact: true})).toBeVisible();
  await expect(page.getByText(/Local changes received after the deadline were not accepted/u)).toBeVisible();
  const replay = (await ref.get()).data();
  expect(replay.submittedAt.toMillis()).toBe(committed.submittedAt.toMillis());
  expect(replay.runtimeOwnership.generation).toBe(committed.runtimeOwnership.generation);
  expect(replay.runtimeOwnership.expiresAt.toMillis()).toBeLessThanOrEqual(Date.now());
  expect(replay.answerMap).toEqual(committed.answerMap);
});

test("resilience terminal reload shows termination without submission metrics or acquisition", async ({page}) => {
  await prepareOwnershipRun("resilience_terminal_read");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  const entered = entryResponseFor(page, "launch");
  await page.goto(launch.examUrl, {waitUntil: "domcontentloaded"}); expect((await entered).status()).toBe(200);
  const owner = (await ref.get()).get("runtimeOwnership");
  await expect.poll(async () => (await ownerRecord(page))?.current?.generation).toBe(owner.generation);
  await ref.update({status: "terminated", "runtimeOwnership.state": "closed", "runtimeOwnership.expiresAt": Timestamp.fromMillis(Date.now() - 1000)});
  const operations = [];
  page.on("request", request => {if (request.url().endsWith("/entry")) operations.push(request.postDataJSON().operation);});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.getByRole("heading", {name: "Session Terminated", exact: true})).toBeVisible({timeout: 60000});
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toHaveCount(0);
  await expect(page.locator('[aria-label="Authoritative submission metrics"]')).toHaveCount(0);
  expect(operations).toEqual(["reconcile"]);
  expect((await ref.get()).get("runtimeOwnership.generation")).toBe(owner.generation);
});

test("resilience acceptance restores accepted answers through corrupt foreign legacy aborted slow and blocked native storage", async ({browser}) => {
  test.setTimeout(300000);
  for (const mode of ["corrupt", "foreign", "legacy", "abort", "slow", "blocked"]) {
    const context = await browser.newContext({baseURL: examOrigin, bypassCSP});
    const page = await context.newPage();
    try {
      await prepareOwnershipRun(`acceptance_storage_${mode}`);
      const launch = await issueLaunch(page), ref = sessionFor(launch);
      await page.goto(launch.examUrl); await beginOwnedExam(page);
      const saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
      await page.getByRole("radio").nth(1).check(); await saved;
      await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null).toEqual({});
      const before = (await ref.get()).data();
      if (["corrupt", "foreign", "legacy"].includes(mode)) {
        await page.evaluate(async ({id, mode, studentId}) => {
          const db = await new Promise((resolve, reject) => {const request = indexedDB.open("parabolic-exam-runtime", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
          await new Promise((resolve, reject) => {
            const tx = db.transaction("sessionRecovery", "readwrite"), store = tx.objectStore("sessionRecovery"), read = store.get(id);
            read.onsuccess = () => {
              const row = read.result;
              if (mode === "corrupt") delete row.questionTimingById;
              if (mode === "foreign") row.scopeHash = "b".repeat(64);
              if (mode === "legacy") {row.schemaVersion = 2; delete row.scopeHash; row.ownerId = studentId;}
              store.put(row);
            };
            tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
          }); db.close();
        }, {id: launch.sessionId, mode, studentId});
      } else if (mode === "abort") {
        await page.addInitScript(() => {
          const transaction = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function(...args) {
            const tx = transaction.apply(this, args);
            if (this.name === "parabolic-exam-runtime") queueMicrotask(() => {try {tx.abort(); window.__nativeRecoveryAborts = (window.__nativeRecoveryAborts ?? 0) + 1;} catch {}});
            return tx;
          };
        });
      } else if (mode === "slow") {
        await page.addInitScript(() => {
          const open = IDBFactory.prototype.open, setter = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess").set;
          IDBFactory.prototype.open = function(name, ...args) {
            const request = open.call(this, name, ...args);
            if (name === "parabolic-exam-runtime") Object.defineProperty(request, "onsuccess", {set(handler) {
              setter.call(request, event => {
                window.__nativeRecoverySuccesses = (window.__nativeRecoverySuccesses ?? 0) + 1;
                setTimeout(() => {window.__lateRecoveryCallbacks = (window.__lateRecoveryCallbacks ?? 0) + 1; handler.call(request, event);}, 2500);
              });
            }});
            return request;
          };
        });
      } else {
        const blocker = await context.newPage(); await blocker.goto(examOrigin);
        await blocker.evaluate(async () => {
          window.__heldRecoveryDb = await new Promise((resolve, reject) => {const request = indexedDB.open("parabolic-exam-runtime", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
          window.__heldRecoveryDb.onversionchange = () => {};
          const upgrade = indexedDB.open("parabolic-exam-runtime", 2);
          upgrade.onblocked = () => {window.__nativeRecoveryBlocked = true;};
        });
        await expect.poll(() => blocker.evaluate(() => window.__nativeRecoveryBlocked === true)).toBe(true);
      }
      const recovered = entryResponseFor(page, "recover"); await page.reload(); expect((await recovered).status()).toBe(200);
      await expect(page.getByRole("radio").nth(1)).toBeChecked({timeout: 15000});
      const status = page.getByRole("region", {name: "Answer recovery status"});
      if (["corrupt", "foreign", "legacy"].includes(mode)) {
        await expect(status).toContainText("corrupt, unsupported or belongs to another scope");
        const row = await recoveryRecord(page, launch.sessionId);
        if (mode === "foreign") expect(row.scopeHash).toBe("b".repeat(64));
        if (mode === "legacy") expect(row.schemaVersion).toBe(2);
        if (mode === "corrupt") expect(row.questionTimingById).toBeUndefined();
      } else {
        await expect(status).toContainText("Memory only");
        if (mode === "abort") expect(await page.evaluate(() => window.__nativeRecoveryAborts)).toBeGreaterThan(0);
        if (mode === "slow") {
          await expect.poll(() => page.evaluate(() => window.__lateRecoveryCallbacks ?? 0)).toBeGreaterThan(0);
          expect(await page.evaluate(() => window.__nativeRecoverySuccesses)).toBeGreaterThan(0);
          await expect(page.getByRole("radio").nth(1)).toBeChecked();
        }
      }
      const after = (await ref.get()).data();
      expect(after.answerMap).toEqual(before.answerMap); expect(after.runtimeOwnership.generation).toBe(2);
      expect(after.startedAt).toEqual(before.startedAt); expect(after.deadlineAt).toEqual(before.deadlineAt);
      expect(after.status).toBe("active"); expect(after.submittedAt).toBeNull();
    } finally {await context.close();}
  }
});

test("resilience acceptance bounds a genuinely hung committed answer response and ignores its late receipt", async ({page}) => {
  test.setTimeout(90000);
  await prepareOwnershipRun("acceptance_hung_answer");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  await page.goto(launch.examUrl); await beginOwnedExam(page);
  const before = (await ref.get()).data(), requests = [];
  page.on("request", request => {if (request.url().endsWith("/answers")) requests.push({body: request.postDataJSON(), at: performance.now()});});
  const gate = await pauseEntry(page, null, "Response", "answers");
  try {
    await page.getByRole("radio").nth(1).check(); expect((await gate.paused).responseStatusCode).toBe(200);
    await expect.poll(() => requests.length, {timeout: 25000}).toBe(2);
    expect(requests[1].at - requests[0].at).toBeGreaterThanOrEqual(15000);
    expect(requests[1].body).toEqual(requests[0].body);
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null).toEqual({});
    const newer = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
    await page.getByRole("radio").nth(0).check(); await newer;
  } finally {await gate.dispose();}
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  await expect.poll(async () => (await ref.get()).get(`answerMap.${questionId}.response.optionId`)).toBe("A");
  const after = (await ref.get()).data();
  expect(after.deadlineAt).toEqual(before.deadlineAt); expect(after.startedAt).toEqual(before.startedAt);
  expect(after.status).toBe("active"); expect(after.submittedAt).toBeNull();
});

test("resilience acceptance excludes real hidden-tab dwell and reconciles foreground authority", async () => {
  test.setTimeout(120000);
  const nativeBrowser = await chromium.launch({headless: false,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]});
  try {
  const context = await nativeBrowser.newContext({baseURL: examOrigin, bypassCSP});
  const page = await context.newPage();
  await prepareOwnershipRun("acceptance_visibility");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  await page.goto(launch.examUrl); await beginOwnedExam(page);
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.runtimeGeneration).toBe(1);
  const before = (await ref.get()).data();
  const initialDwell = (await recoveryRecord(page, launch.sessionId)).questionTimingById[questionId].timeSpentMs;
  const foreground = await openNativeForegroundTab(page);
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("hidden");
  await foreground.waitForTimeout(6500);
  const reconciled = entryResponseFor(page, "reconcile"); await page.bringToFront(); expect((await reconciled).status()).toBe(200);
  await expect(page.getByText("Authoritative browser snapshot question", {exact: true})).toBeVisible();
  const dwell = (await recoveryRecord(page, launch.sessionId)).questionTimingById[questionId].timeSpentMs;
  expect(dwell - initialDwell).toBeLessThan(5000);
  const after = (await ref.get()).data();
  expect(after.deadlineAt).toEqual(before.deadlineAt); expect(after.startedAt).toEqual(before.startedAt);
  expect(after.answerMap).toEqual(before.answerMap); expect(after.status).toBe("active"); await foreground.close();
  } finally {await nativeBrowser.close();}
});

test("resilience acceptance converges concurrent real submits and fences a stale native writer after canonical close", async ({page}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("acceptance_submit_race");
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  await page.goto(launch.examUrl); await beginOwnedExam(page);
  const saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap ?? null).toEqual({});
  const local = await recoveryRecord(page, launch.sessionId), before = (await ref.get()).data();
  const ts = require("../../functions/node_modules/typescript");
  const source = await readFile(new URL("../../apps/exam/src/recoveryStorage.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  await page.evaluate(async ({moduleUrl, local}) => {
    const {RecoveryStorage} = await import(moduleUrl);
    // A separate instance deliberately retains stale observer knowledge. The
    // native transaction must still honor the persisted close fence.
    window.__staleRecoveryWriter = new RecoveryStorage(local.sessionId, local.scopeHash, local.runtimeGeneration, () => true);
    window.__staleRecoverySnapshot = local;
  }, {moduleUrl, local});
  const gate = await pauseEntry(page, null, "Request", "submit");
  let body, headers, canonical;
  try {
    await page.getByRole("button", {name: "Submit Test", exact: true}).click();
    await page.getByRole("dialog", {name: "Confirm exam submission"}).getByLabel(/I understand.*will remain unanswered/u).check();
    const mounted = page.waitForResponse(response => response.url().endsWith("/submit"), {timeout: 90000});
    await page.getByRole("button", {name: "Confirm Final Submit", exact: true}).click();
    const paused = await gate.paused; body = JSON.parse(paused.request.postData);
    headers = Object.fromEntries(Object.entries(paused.request.headers).filter(([key]) => ["authorization", "x-parabolic-exam-owner", "x-parabolic-exam-generation"].includes(key.toLowerCase())));
    const concurrent = page.request.post(`/api/v1/exam/session/${launch.sessionId}/submit`, {headers, data: body, timeout: 90000});
    await gate.dispose();
    const [first, other] = await Promise.all([mounted, concurrent]);
    expect([200, 409]).toContain(first.status()); expect([200, 409]).toContain(other.status());
    expect([first.status(), other.status()]).toContain(200);
    canonical = (await (first.status() === 200 ? first : other).json()).data;
    if (first.status() !== 200) await page.getByRole("button", {name: "Retry submission confirmation", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible({timeout: 30000});
  } finally {await gate.dispose().catch(() => undefined);}
  await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.closed).toBe(true);
  const late = await page.evaluate(async () => {
    const save = await window.__staleRecoveryWriter.save(window.__staleRecoverySnapshot);
    const discard = await window.__staleRecoveryWriter.discard("stale");
    return {save: save.state, discard: discard.state};
  });
  expect(late).toEqual({save: "memory_only", discard: "memory_only"});
  const fence = await recoveryRecord(page, launch.sessionId);
  expect(Object.keys(fence).sort()).toEqual(["closed", "runtimeGeneration", "schemaVersion", "scopeHash", "sessionId"]);
  const metrics = firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/studentYearMetrics/${studentId}`);
  await expect.poll(async () => (await metrics.get()).get("resultPropagation"), {timeout: 30000}).toMatchObject({state: "available", sessionId: launch.sessionId});
  const total = (await metrics.get()).get("totalTests");
  const replay = await page.request.post(`/api/v1/exam/session/${launch.sessionId}/submit`, {headers, data: body, timeout: 90000});
  expect(replay.status()).toBe(200); expect((await replay.json()).data).toEqual({...canonical, alreadySubmitted: true});
  await page.reload(); await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  const after = (await ref.get()).data();
  expect(after.startedAt).toEqual(before.startedAt); expect(after.deadlineAt).toEqual(before.deadlineAt);
  expect(after.answerMap[questionId].response.optionId).toBe("B");
  expect(after.runtimeOwnership.generation).toBe(before.runtimeOwnership.generation);
  expect(after.submittedAt.toDate().toISOString()).toBe(canonical.submittedAt);
  expect((await metrics.get()).get("totalTests")).toBe(total);
});

test("resilience acceptance recovers above both real lease expiry and exam deadline without accepting late local edits", async ({page, context}) => {
  test.setTimeout(180000);
  await prepareOwnershipRun("acceptance_both_expired");
  await firestore.doc(`institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`).update({endWindow: Timestamp.fromMillis(Date.now() + 25000)});
  const launch = await issueLaunch(page), ref = sessionFor(launch);
  await page.goto(launch.examUrl); await beginOwnedExam(page);
  const saved = page.waitForResponse(response => response.url().endsWith("/answers") && response.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  const before = (await ref.get()).data();
  await context.setOffline(true);
  try {
    await page.getByRole("radio").nth(0).check();
    await expect.poll(async () => (await recoveryRecord(page, launch.sessionId))?.pendingAnswerMap[questionId]?.response.optionId).toBe("A");
    await expect(page.getByRole("heading", {name: "Exam runtime paused", exact: true})).toBeVisible({timeout: 100000});
    const expired = (await ref.get()).data();
    expect(expired.runtimeOwnership.expiresAt.toMillis()).toBeLessThanOrEqual(Date.now());
    expect(expired.deadlineAt.toMillis()).toBeLessThan(Date.now());
    expect(expired.status).toBe("active"); expect(expired.submittedAt).toBeNull();
    expect(expired.answerMap[questionId].response.optionId).toBe("B");
  } finally {await context.setOffline(false);}
  const recovered = entryResponseFor(page, "recover"); await page.reload(); expect((await recovered).status()).toBe(200);
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible({timeout: 30000});
  await expect(page.getByText(/Local changes received after the deadline were not accepted/u)).toBeVisible();
  const after = (await ref.get()).data();
  expect(after.runtimeOwnership.generation).toBe(before.runtimeOwnership.generation + 1);
  expect(after.deadlineAt).toEqual(before.deadlineAt); expect(after.startedAt).toEqual(before.startedAt);
  expect(after.answerMap).toEqual(before.answerMap); expect(after.submissionReason).toBe("expiry");
});
