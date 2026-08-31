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
    ...questionIds.map((currentQuestionId, index) =>
      institute.collection("questionBank").doc(currentQuestionId).set({
        chapter: "Kinematics",
        correctAnswer: "B",
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
        questionImageUrl: `questions/bwm-022-question-${index + 1}.png`,
        questionType: "MCQ",
        solutionImageUrl: `solutions/bwm-022-solution-${index + 1}.png`,
        status: "active",
        subject: "Physics",
        tags: ["motion"],
        topic: "Motion",
        uniqueKey: `bwm-022-launch-browser-question-${index + 1}`,
        usedCount: 0,
        version: 1,
      })),
    year.set({locked: false, status: "Active"}),
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
        faceIdentityGazeGuardEnabled: false,
      },
      questionIds,
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
  expect(entryEnvelope.data.runtimeSnapshot.mode).toBe("Operational");
  expect(entryEnvelope.data.runtimeSnapshot.questions).toHaveLength(12);
  expect(entryEnvelope.data.runtimeSnapshot.questions[0]).toMatchObject({
    id: questionId,
    imageUrl: "questions/bwm-022-question-1.png",
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
  expect(entryRequestBody).toEqual({resume: true});
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
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(`/session/${sessionId}/submit`)) {
      submitAuthorization = request.headers().authorization ?? "";
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
  expect(Object.keys(submittedSession.data().answerMap)).toHaveLength(12);
  expect(submittedSession.data().answerMap[questionIds[5]].response)
    .toEqual({kind: "unanswered"});

  const replayResponse = await page.request.post(
    `/api/v1/exam/session/${encodeURIComponent(sessionId)}/submit`,
    {
      data: submitRequestBody,
      headers: {Authorization: submitAuthorization},
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
      headers: {Authorization: answerAuthorization},
      timeout: 90_000,
    },
  );
  expect(postSubmitAnswerResponse.status()).toBe(409);
  const postSubmitAnswerEnvelope = await postSubmitAnswerResponse.json();
  expect(postSubmitAnswerEnvelope.error.code).toBe("SESSION_LOCKED");
  const immutableSession = await firestore.doc(sessionPath).get();
  expect(immutableSession.data().answerMap[questionId].response)
    .toEqual(submittedSession.data().answerMap[questionId].response);

});
