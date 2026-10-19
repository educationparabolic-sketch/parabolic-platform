import {createRequire} from "node:module";
import {chromium, expect, test} from "playwright/test";
import {calibrationConsumerFixture} from "./calibration-consumer-fixture.mjs";

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

test.use({bypassCSP: true, launchOptions: {args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]}});

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
  const context = await browser.newContext({bypassCSP: true});
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

  let entryAuthorization = "";
  let entryRequestBody = null;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(`/session/${sessionId}/entry`)) {
      entryAuthorization = request.headers().authorization ?? "";
      entryRequestBody = request.postDataJSON();
    }
  });
  const entryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
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
  expect(entryResponse.status()).toBe(200);
  const entryEnvelope = await entryResponse.json();
  expect(entryEnvelope.success).toBe(true);
  expect(entryEnvelope.data.operation).toBe("launch");
  const initialGeneration = entryEnvelope.data.ownership.generation;
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
  await page.getByLabel(/I have read and understood the instructions/u).check();
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

  const replayContext = await browser.newContext({bypassCSP: true});
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
          ownerId: snapshot?.ownerId ?? null,
          pendingCount: Object.keys(snapshot?.pendingAnswerMap ?? {}).length,
          schemaVersion: snapshot?.schemaVersion ?? null,
        });
      };
    });
  }, {expectedOwnerId: studentId, expectedSessionId: sessionId})).toEqual({
    ownerId: studentId,
    pendingCount: 12,
    schemaVersion: 2,
  });

  const recoveryAnswerRequestStart = answerRequestBodies.length;
  const resumedEntryResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/session/${sessionId}/entry`),
  {timeout: 90_000});
  await page.context().setOffline(false);
  await page.reload({waitUntil: "domcontentloaded"});
  const resumedEntryResponse = await resumedEntryResponsePromise;
  expect(resumedEntryResponse.status()).toBe(200);
  expect(entryRequestBody.operation).toBe("recover");
  expect(entryRequestBody.previous.generation).toBe(initialGeneration);
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
  await page.getByLabel(/I have read and understood the instructions/u).check();
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
  const outsider = await browser.newContext({bypassCSP: true});
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
    const launch = await issueLaunch(page);
    const entry = entryResponseFor(page, "launch");
    await page.goto(launch.examUrl); const initial = await entry; expect(initial.status()).toBe(200);
    const body = (await initial.json()).data.entry;
    await expect(page.getByText("Complete Entry Check", {exact: true})).toBeVisible();
    await page.clock.setFixedTime(Date.parse(body.runtimeSnapshot.schedule.sessionEndsAt) + 1000);
    await expect(page.getByRole("heading", {name: "Entry Window Closed"})).toBeVisible();
    await returnToUnauthenticatedStudent(page, "Return to Student Portal");
    const independent = await browser.newContext({bypassCSP: true});
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
          const recovery = entryResponseFor(page, "recover");
          await page.reload(); expect((await recovery).status()).toBe(409);
        } else {
          await firestore.doc(`institutes/${instituteId}`).update({status: "suspended"});
          const renewal = entryResponseFor(page, "renew");
          expect((await renewal).status()).toBe(403);
        }
        // Terminal/authority failure reaches the live ownership interruption
        // guard, before legacy terminal/authority presentation branches.
        await expect(page.getByRole("heading", {name: "Exam runtime paused"})).toBeVisible();
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
    const context = await isolated.newContext({baseURL: examOrigin, bypassCSP: true});
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
    const context = await nativeBrowser.newContext({baseURL: examOrigin, bypassCSP: true});
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
