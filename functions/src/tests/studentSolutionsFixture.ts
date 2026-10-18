/* eslint-disable require-jsdoc */
import {randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {SessionService} from "../services/session";
import {seedConsumerVersion} from "./calibrationConsumerFixture";

export async function seedStudentSolutionsFixture(label: string, images = true) {
  if (process.env.GCLOUD_PROJECT !== "demo-parabolic-test" || !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Isolated emulators are required.");
  const firestore = getFirestore();
  const auth = getFirebaseAdminApp().auth();
  const uid = `student-solutions-${label}`;
  const instituteId = `inst-solutions-${label}`;
  const institute = firestore.doc(`institutes/${instituteId}`);
  const yearId = "opaque-current-year";
  const runId = "run-owned";
  const testId = "test-owned";
  const password = randomUUID();
  const email = `${uid}@emulator.test`;
  await firestore.recursiveDelete(institute);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
  }
  await auth.createUser({uid, email, password});
  const flags = {adaptivePhase: true, controlledMode: true, governanceAccess: false,
    hardMode: true, riskOverview: true};
  const claims = {role: "student", studentId: uid, instituteId, licenseLayer: "L2", licenseVersion: "solutions-v1",
    authorizationVersion: 1, licenseState: "active", expiryDate: "2099-01-01T00:00:00.000Z",
    gracePeriodEndsAt: null, featureFlags: flags};
  await auth.setCustomUserClaims(uid, claims);
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion: claims.licenseVersion});
  const license = {currentLayer: "L2", licenseVersion: claims.licenseVersion, licenseState: "active",
    expiryDate: claims.expiryDate, gracePeriodEndsAt: null, featureFlags: flags,
    activeStudentLimit: 100, concurrentSessionLimit: 20};
  await institute.collection("license").doc("current").set(license);
  await institute.collection("license").doc("main").set(license);
  await institute.collection("students").doc(uid).set({studentId: uid, status: "active", deleted: false,
    fullName: "Solution Student", name: "Solution Student", email});
  const year = institute.collection("academicYears").doc(yearId);
  await year.set({status: "active"});
  await seedConsumerVersion(instituteId, "cal-solutions-v1");
  const ids = ["question-one", "question-two"];
  for (const id of ids) {
    await institute.collection("questionBank").doc(id).set({questionId: id, version: 1, revision: 2,
      correctAnswer: id === ids[0] ? "A" : "C", difficulty: "Easy", questionType: "MCQ",
      prompt: "Captured prompt", subject: "Physics",
      ...(images && id === ids[0] ? {questionImageUrl: `${instituteId}/questions/${id}/v1/question-r1.png`,
        solutionImageUrl: `${instituteId}/questions/${id}/v1/solution-r2.png`,
        questionImageRevision: 1, solutionImageRevision: 2} : {}),
      tutorialVideoLink: "https://learn.example.com/review", simulationLink: "http://127.0.0.1/private"});
  }
  const end = Date.now() + 20000;
  const run = year.collection("runs").doc(runId);
  await run.set({runId, testId, testName: "Owned Completed Test", academicYear: yearId, mode: "Operational",
    recipientStudentIds: [uid], questionIds: ids, templateVersion: "1", status: "scheduled",
    calibrationVersion: "cal-solutions-v1", riskModelVersion: "risk_v3",
    phaseConfigSnapshot: {phase1Percent: 100, phase2Percent: 0, phase3Percent: 0},
    timingProfileSnapshot: {easy: {min: 10, max: 60, recommended: 30},
      medium: {min: 10, max: 120, recommended: 60}, hard: {min: 30, max: 180, recommended: 90}},
    startWindow: Timestamp.fromMillis(Date.now() - 60000), endWindow: Timestamp.fromMillis(end)});
  const context = {instituteId, studentId: uid, studentUid: uid, runId, licenseLayer: "L2" as const,
    intent: "start" as const};
  const sessions = new SessionService();
  const launch = await sessions.startSession(context);
  const session = firestore.doc(launch.sessionPath);
  const captured = (await session.get()).data();
  await session.update({status: "submitted", submittedAt: Timestamp.now(),
    answerMap: {[ids[0]]: {selectedOption: "B"}}});
  await run.update({status: "completed", solutionReleaseAt: Timestamp.fromMillis(end)});
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
    "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  });
  if (response.status !== 200) throw new Error("Synthetic sign-in failed.");
  const token = ((await response.json()) as {idToken: string}).idToken;
  return {uid, instituteId, institute, yearId, year, runId, testId, run, session, ids, end, claims,
    token, email, password, captured, sessions, context,
    cleanup: async () => {
      await firestore.recursiveDelete(institute);
      await auth.deleteUser(uid);
      if ((await institute.get()).exists || !(await year.collection("runs").get()).empty) {
        throw new Error("Synthetic solution data cleanup failed.");
      }
      try {
        await auth.getUser(uid);
        throw new Error("Synthetic solution identity cleanup failed.");
      } catch (error) {
        if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
      }
    }};
}
