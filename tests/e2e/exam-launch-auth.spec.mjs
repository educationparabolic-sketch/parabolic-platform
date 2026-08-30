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

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_018_launch_browser";
const studentId = "student_bwm_018_launch_browser";
const yearId = "2026";
const runId = "run_bwm_018_launch_browser";
const questionId = "question_bwm_018_launch_browser";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let studentEmail;
let studentPassword;
let studentUid;

test.use({bypassCSP: true});

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
  await auth.setCustomUserClaims(user.uid, {
    instituteId,
    licenseLayer: "L1",
    role: "student",
    studentId,
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  const run = year.collection("runs").doc(runId);
  await Promise.all([
    institute.set({instituteId}),
    institute.collection("students").doc(studentId).set({
      status: "active",
      studentId,
    }),
    institute.collection("license").doc("main").set({
      currentLayer: "L1",
      eligibilityFlags: {l1Eligible: true},
      featureFlags: {controlledMode: true, hardMode: false},
    }),
    institute.collection("questionBank").doc(questionId).set({
      chapter: "Kinematics",
      correctAnswer: "B",
      createdAt: Timestamp.now(),
      difficulty: "Easy",
      examType: "JEEMains",
      marks: 4,
      negativeMarks: 1,
      options: [
        {correct: false, id: "A", label: "A", text: "v / r"},
        {correct: true, id: "B", label: "B", text: "v² / r"},
      ],
      primaryTag: "motion",
      prompt: "Authoritative browser snapshot question",
      questionId,
      questionImageUrl: "questions/bwm-018-question.png",
      questionType: "MCQ",
      solutionImageUrl: "solutions/bwm-018-solution.png",
      internalNotes: "must never reach the candidate",
      status: "active",
      subject: "Physics",
      tags: ["motion"],
      topic: "Motion",
      uniqueKey: "bwm-018-launch-browser-question",
      usedCount: 0,
      version: 1,
    }),
    year.set({locked: false, status: "Active"}),
    run.set({
      calibrationVersion: "cal_bwm_018",
      endWindow: Timestamp.fromMillis(Date.now() + (60 * 60_000)),
      mode: "Diagnostic",
      phaseConfigSnapshot: {
        phase1Percent: 40,
        phase2Percent: 45,
        phase3Percent: 15,
      },
      proctoringPolicy: {
        browserIntegrityGuardEnabled: false,
        faceIdentityGazeGuardEnabled: false,
      },
      questionIds: [questionId],
      recipientStudentIds: [studentId],
      riskModelVersion: "risk_v3",
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + (5 * 60_000)),
      status: "scheduled",
      templateVersion: "19",
      testId: "test_bwm_018_launch_browser",
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
  }
  if (firestore) {
    await firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    );
  }
  await deleteApp(adminApp);
});

test("Student start authenticates Exam entry once and removes the credential", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
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
  expect(launchUrl.origin).toBe("http://127.0.0.1:5000");
  expect(launchUrl.pathname).toBe(`/session/${encodeURIComponent(sessionId)}`);
  expect(launchUrl.searchParams.get("token")).toBe(launchCredential);

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
  await page.goto(launchUrl.href, {waitUntil: "domcontentloaded"});
  await expect.poll(() => new URL(page.url()).searchParams.has("token"))
    .toBe(false);
  const entryResponse = await entryResponsePromise;
  expect(entryResponse.status()).toBe(200);
  const entryEnvelope = await entryResponse.json();
  expect(entryEnvelope.success).toBe(true);
  expect(entryEnvelope.data.allowed).toBe(true);
  expect(entryEnvelope.data.status).toBe("started");
  expect(entryEnvelope.data.deadlineAt).toBeNull();
  expect(entryEnvelope.data.sessionId).toBe(sessionId);
  expect(entryEnvelope.data.runtimeSnapshot.questionSetVersion).toBe("19");
  expect(entryEnvelope.data.runtimeSnapshot.mode).toBe("Diagnostic");
  expect(entryEnvelope.data.runtimeSnapshot.questions).toHaveLength(1);
  expect(entryEnvelope.data.runtimeSnapshot.questions[0]).toMatchObject({
    id: questionId,
    imageUrl: "questions/bwm-018-question.png",
    text: "Authoritative browser snapshot question",
  });
  expect(JSON.stringify(entryEnvelope.data.runtimeSnapshot)).not.toMatch(
    /correctAnswer|solutionImageUrl|internalNotes|"correct"/i,
  );
  expect(entryRequestBody).toEqual({token: launchCredential});
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
  expect(consumedSession.data().startedAt).toBeTruthy();
  expect(consumedSession.data().deadlineAt).toBeTruthy();

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
});
