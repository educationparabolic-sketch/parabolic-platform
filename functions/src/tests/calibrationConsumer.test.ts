/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore, getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {freezeCalibration, validateFrozenCalibration,
  assertSameFrozenCalibration} from "../services/calibrationConsumer";
import {computeProjectedRiskScore, toRiskState, toStudentMetricSignal,
  calibrationSimulationService} from "../services/calibrationSimulation";
import {riskEngineService} from "../services/riskEngine";
import {studentMetricsEngineService} from "../services/studentMetricsEngine";
import {patternEngineService} from "../services/patternEngine";
import {consumerVersion} from "./calibrationConsumerFixture";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const firestore = getFirestore();
test.after(async () => getFirebaseAdminApp().delete());
const instituteId = "inst_consumer_039";
const yearId = "2026";
const studentId = "student_consumer_039";
const root = `institutes/${instituteId}`;
const year = `${root}/academicYears/${yearId}`;
const metricsPath = `${year}/studentYearMetrics/${studentId}`;
const snapshot = freezeCalibration(consumerVersion("v039"), instituteId, "v039");

test("frozen snapshots reject dangling/malformed/changed authority", () => {
  assert.throws(() => freezeCalibration(undefined, instituteId, "v039"));
  assert.throws(() => freezeCalibration({...consumerVersion("v039"),
    isActive: false}, instituteId, "v039"));
  assert.throws(() => freezeCalibration(consumerVersion("other"),
    instituteId, "v039"));
  assert.deepEqual(validateFrozenCalibration(snapshot, instituteId, "v039"),
    snapshot);
  for (const bad of [{...snapshot, fingerprint: "changed"},
    {...snapshot, instituteId: "other"}, {...snapshot, sourcePath: "global/v039"},
    {...snapshot, weights: {...snapshot.weights, overstayWeight: 0.1}},
    {...snapshot, thresholds: undefined}, {...snapshot, model: "legacy"}]) {
    assert.throws(() => validateFrozenCalibration(bad, instituteId, "v039"));
  }
  assert.throws(() => assertSameFrozenCalibration(
    {calibrationVersion: "v039", calibrationSnapshot: snapshot},
    {calibrationVersion: "v039"}, instituteId,
  ));
  assert.throws(() => assertSameFrozenCalibration(
    {calibrationVersion: "v039", calibrationModel: "risk_projection_v1"},
    {calibrationVersion: "v039"}, instituteId,
  ));
  assert.equal(assertSameFrozenCalibration(
    {calibrationVersion: "legacy"}, {calibrationVersion: "legacy"}, instituteId,
  ), undefined);
});

test("shared five-signal projection keeps inclusive boundaries and strict input", () => {
  const weights = {...snapshot.weights, guessWeight: 1, phaseWeight: 0,
    easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
  for (const [score, state] of [[20, "Stable"], [40, "Drift-Prone"],
    [60, "Impulsive"], [80, "Overextended"], [100, "Volatile"]] as const) {
    const signal = toStudentMetricSignal({avgGuessRatePercent: score,
      avgPhaseAdherencePercent: 100, easyNeglectRatePercent: 0,
      hardBiasRatePercent: 0, wrongStreakActive: false}, "fixture");
    assert.equal(computeProjectedRiskScore(signal, weights), score);
    assert.equal(toRiskState(score), state);
    assert.throws(() => toStudentMetricSignal({...signal,
      guessRate: score + 1}, "conflicting alias"));
    assert.throws(() => toStudentMetricSignal({...signal,
      wrongStreakActive: undefined}, "missing boolean"));
  }
});

test("submitted summaries freeze source, exact projection, replay and late events", async () => {
  await firestore.doc(root).set({calibrationVersion: "v039"});
  await firestore.doc(year).set({status: "active"});
  await firestore.doc(`${root}/calibration/v039`).set(consumerVersion("v039"));
  await firestore.doc("globalCalibration/consumer_global_039")
    .set(consumerVersion("consumer_global_039"));
  const context = {instituteId, yearId, studentId};
  const submit = async (sessionId: string, runId: string, millis: number,
    source = snapshot, streak = 5, omitSignal = false) => {
    await firestore.doc(`${year}/runs/${runId}`).set({
      calibrationVersion: source.versionId, calibrationSnapshot: source,
    });
    const data = {studentId, status: "submitted", submittedAt:
      Timestamp.fromMillis(millis), calibrationVersion: source.versionId,
    calibrationSnapshot: source, rawScorePercent: 70, accuracyPercent: 80,
    disciplineIndex: 60, guessRatePercent: 90, phaseAdherencePercent: 10,
    easyNeglectRatePercent: omitSignal ? undefined : 30,
    hardBiasRatePercent: 70, consecutiveWrongStreakMax: streak,
    normalizedRiskScore: 1};
    return studentMetricsEngineService.processSubmittedSession(
      {instituteId, yearId, sessionId, runId}, {status: "active"}, data,
    );
  };
  try {
    await submit("s1", "r1", 1000);
    const event1 = (await firestore.doc(metricsPath).get()).data();
    await riskEngineService.processStudentYearMetricsUpdate(
      context, undefined, event1,
    );
    let current = (await firestore.doc(metricsPath).get()).data();
    assert.equal(current?.riskScore, computeProjectedRiskScore(
      toStudentMetricSignal(current, metricsPath), snapshot.weights,
    ));
    assert.equal(current?.riskModelVersion, "risk_projection_v1");
    assert.notEqual(current?.riskScore, 85); // no legacy behavioral floor
    assert.equal((await submit("s1", "r1", 1000)).idempotent, true);
    const newer = freezeCalibration({...consumerVersion("v040"), weights:
      {...snapshot.weights, guessWeight: 1, phaseWeight: 0,
        easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0}},
    instituteId, "v040");
    await submit("s2", "r2", 3000, newer, 0);
    await submit("s0", "r0", 500, snapshot, 0);
    const aggregate = (await firestore.doc(metricsPath).get()).data();
    assert.equal(aggregate?.calibrationVersion, "v040");
    await firestore.doc(root).update({calibrationVersion: "unrelated"});
    await firestore.doc(`${root}/calibration/v040`).set({malformed: true});
    // An old delivery computes current committed aggregate/source, not old input.
    await riskEngineService.processStudentYearMetricsUpdate(
      context, undefined, event1,
    );
    current = (await firestore.doc(metricsPath).get()).data();
    assert.equal(current?.riskScore, 90);
    assert.equal(current?.processingMarkers.riskEngine
      .lastProcessedStudentMetricsSessionId, "s0");
    await patternEngineService.processStudentYearMetricsUpdate(
      context, undefined, aggregate,
    );
    assert.equal((await firestore.doc(metricsPath).get()).get(
      "wrongStreakActive"), true);
    const frozenResult = (await firestore.doc(`${metricsPath}/results/r1`)
      .get()).get("calibrationSnapshot");
    assert.deepEqual(frozenResult, snapshot);
    await assert.rejects(submit("bad", "bad", 4000, newer, 0, true));
    assert.equal((await firestore.doc(metricsPath).get()).get("totalTests"), 3);
    // Real simulation with the same frozen weights yields the production score.
    await firestore.doc(root).update({calibrationVersion: "v039"});
    const simulation = await calibrationSimulationService.simulateCalibrationImpact({
      academicYearId: yearId, institutes: [instituteId], weights: newer.weights,
    });
    assert.equal(simulation.after?.averageProjectedRiskScore, current?.riskScore);
    await firestore.doc(metricsPath).update({
      "calibrationSnapshot.fingerprint": "tampered",
      "processingMarkers.studentMetricsEngine.lastProcessedSessionId": "invalid",
    });
    await assert.rejects(riskEngineService.processStudentYearMetricsUpdate(
      context, undefined, (await firestore.doc(metricsPath).get()).data(),
    ));
    assert.equal((await firestore.doc(metricsPath).get()).get("riskScore"), 90);
    await firestore.doc(metricsPath).delete();
    assert.equal((await riskEngineService.processStudentYearMetricsUpdate(
      context, undefined, event1,
    )).reason, "deleted");
    assert.equal((await firestore.doc(metricsPath).get()).exists, false);
  } finally {
    await firestore.doc("globalCalibration/consumer_global_039").delete();
  }
});
