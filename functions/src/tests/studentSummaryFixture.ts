/* eslint-disable require-jsdoc */
import {randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import type {StudentLicenseLayer} from "../../../shared/contracts/apiDtos";
export async function seedStudentSummaryFixture(label: string) {
  if (process.env.GCLOUD_PROJECT !== "demo-parabolic-test" || !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Disposable Auth/Firestore emulators are required.");
  const firestore = getFirestore();
  const auth = getFirebaseAdminApp().auth();
  const uid = `student-summary-${label}`;
  const instituteId = `inst-summary-${label}`;
  const institute = firestore.doc(`institutes/${instituteId}`);
  await firestore.recursiveDelete(institute);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
  }
  const email = `${uid}@emulator.test`;
  const password = randomUUID();
  await auth.createUser({uid, email, password});
  const flags = {adaptivePhase: true, controlledMode: true, governanceAccess: false, hardMode: true,
    riskOverview: true};
  let claims = {role: "student", studentId: uid, instituteId, licenseLayer: "L2" as StudentLicenseLayer,
    licenseVersion: "summary-v1", authorizationVersion: 1, licenseState: "active",
    expiryDate: "2099-01-01T00:00:00.000Z", gracePeriodEndsAt: null, featureFlags: flags};
  const signIn = async () => {
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({email, password, returnSecureToken: true}),
    });
    if (response.status !== 200) throw new Error("Synthetic summary sign-in failed.");
    return ((await response.json()) as {idToken: string}).idToken;
  };
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion: claims.licenseVersion});
  await institute.collection("students").doc(uid).set({studentId: uid, status: "active", deleted: false,
    fullName: "Summary Student", name: "Summary Student", email});
  const yearId = "opaque-current-year";
  const year = institute.collection("academicYears").doc(yearId);
  await year.set({status: "active"});
  const metrics = year.collection("studentYearMetrics").doc(uid);
  const summary = {runId: "run-completed", studentId: uid, testId: "test-completed", testName: "Own Completed Test",
    mode: "Operational", rawScorePercent: 73, accuracyPercent: 61, disciplineIndex: 91, guessRatePercent: 87,
    minTimeViolationPercent: 92, maxTimeViolationPercent: 93, overstayFrequencyPercent: 94,
    timeAllocationBalancePercent: 82, phaseAdherencePercent: 81,
    submittedAt: Timestamp.fromMillis(Date.now() - 3600000), timeSpentMinutes: 25, sessionId: "session-own",
    startWindow: Timestamp.fromMillis(Date.now() - 7200000), endWindow: Timestamp.fromMillis(Date.now() - 3600000)};
  const run = year.collection("runs").doc(summary.runId);
  await run.set({...summary, recipientStudentIds: [uid], status: "completed", templateVersion: "1"});
  await metrics.collection("results").doc(summary.runId).set(summary);
  await metrics.set({studentId: uid, avgRawScorePercent: 73, avgAccuracyPercent: 61, testsAttempted: 1,
    avgDisciplineIndex: 91, avgGuessRatePercent: 87, avgOverstayQuestionsPercent: 94,
    avgPhaseAdherencePercent: 81, easyNeglectRate: 83, hardBiasRate: 84,
    phaseComplianceMiniTrend: [{label: "HIDDEN_987.6", value: 82}],
    controlledModeImprovementDeltaPercent: 95,
    controlledModeComparison: {disciplineIndexDeltaPercent: 96, maxTimeViolationDeltaPercent: 97},
    behaviorSummaryTag: "HIDDEN_987.6", executionStabilityFlag: "HIDDEN_987.6",
    disciplineImprovementSuggestions: ["HIDDEN_987.6"], phaseAdherenceFeedback: "HIDDEN_987.6",
    topicPerformance: [{topic: "Motion", rawScorePercent: 73, accuracyPercent: 61}],
    topicWeaknessSummary: [{topic: "Motion", weaknessPercent: 24, feedback: "HIDDEN_987.6",
      tutorialVideoLink: "https://secret.example.com/unreleased",
      simulationLink: "https://secret.example.com/simulation"}],
    recentResults: [summary], processingMarkers: {studentMetricsEngine: {latestSessionSummary: summary,
      recentGovernanceMetrics: [summary]}}});
  await year.collection("insightSnapshots").doc("own-snapshot").set({studentId: uid, snapshotType: "student",
    sourceSubmittedAt: summary.submittedAt, dominantPattern: "guess_detection", metrics: {
      sessionRawScorePercent: 73, sessionAccuracyPercent: 61, guessDetectionPercent: 87, latePhaseDropPercent: 12}});
  for (const id of ["z-past-year", "a-past-year"]) {
    const old = institute.collection("academicYears").doc(id);
    await old.set({status: "archived"});
    await old.collection("studentYearMetrics").doc(uid).collection("results").doc(`old-${id}`).set(summary);
    // Path ownership is canonical; omit the current run alias in this retained historical seed.
    await old.collection("studentYearMetrics").doc(uid).collection("results").doc(`old-${id}`)
      .update({runId: `old-${id}`});
  }
  const setEntitlement = async (layer: StudentLicenseLayer, changes: Partial<typeof flags> = {}) => {
    claims = {...claims, licenseLayer: layer, featureFlags: {...flags, ...changes}};
    await auth.setCustomUserClaims(uid, claims);
    await institute.collection("license").doc("current").set({currentLayer: layer,
      licenseVersion: claims.licenseVersion,
      licenseState: "active", expiryDate: claims.expiryDate, gracePeriodEndsAt: null, featureFlags: claims.featureFlags,
      activeStudentLimit: 100, concurrentSessionLimit: 20});
    return signIn();
  };
  const token = await setEntitlement("L2");
  return {uid, instituteId, institute, year, yearId, metrics, summary, run, token, email, password, setEntitlement,
    claims: () => claims, signIn,
    cleanup: async () => {
      await firestore.recursiveDelete(institute);
      await auth.deleteUser(uid);
      try {
        await auth.getUser(uid);
        throw new Error("Summary fixture identity cleanup failed.");
      } catch (error) {
        if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
      }
      if ((await institute.get()).exists || !(await institute.collection("academicYears").get()).empty) {
        throw new Error("Summary fixture cleanup failed.");
      }
    }};
}
