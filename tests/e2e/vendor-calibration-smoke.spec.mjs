import {randomUUID, createHash} from "node:crypto";
import {createRequire} from "node:module";
import {expect as baseExpect, test} from "playwright/test";
const expect = baseExpect.configure({timeout: 60000});
const require = createRequire(import.meta.url);
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
test.use({bypassCSP: true});
test.setTimeout(360000);
test("mounted calibration adopts real version/target authority and exact five-state projections", async ({page}) => {
  page.setDefaultTimeout(60000);
  expect(process.env.PROJECT_ID).toBe("demo-parabolic-test");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  const app = getFirebaseAdminApp(), db = getFirestore(), auth = app.auth();
  const uid = randomUUID(), email = `cal-smoke-${uid}@example.test`, password = "disposable-calibration-smoke";
  const user = await auth.createUser({email, password});
  const versionId = "cal_smoke", instituteId = "inst_cal_smoke";
  const root = `institutes/${instituteId}`;
  const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
  const apiRequests = []; const external = []; const operations = new Set();
  page.on("request", request => {
    if (request.url().includes("/api/v1/vendor/calibration/")) apiRequests.push(request);
    if (/^https?:/.test(request.url()) && !["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname)) external.push(request.url());
  });
  await page.route("https://**/*", route => route.abort());
  try {
    await auth.setCustomUserClaims(user.uid, {role: "vendor", isVendor: true, licenseLayer: "L0"});
    await db.doc(`globalCalibration/${versionId}`).set({schemaVersion: 1, versionId, weights, isActive: true, createdBy: user.uid,
      createdAt: "2026-01-01T00:00:00.000Z", activationDate: "2026-01-01T00:00:00.000Z",
      thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20}});
    await db.doc(root).set({instituteId, instituteRevision: 1, registeredName: "Calibration Smoke Institute", status: "active", vendorLifecycleState: "active",
      settingsRevision: 0, settingsUsers: {}, primaryAdminUserId: null, pendingPrimaryAdministrator: null, vendorAccountReference: null,
      createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01")});
    await db.doc(`${root}/academicYears/2026`).set({academicYearId: "2026"});
    for (let i = 0; i < 5; i++) await db.doc(`${root}/academicYears/2026/studentYearMetrics/s${i}`).set({
      avgGuessRatePercent: i * 25, avgPhaseAdherencePercent: 100 - i * 20, easyNeglectRatePercent: 0, hardBiasRatePercent: 0, wrongStreakActive: false});
    await page.addInitScript(() => {if (location.pathname === "/index.html") history.replaceState(null, "", "/vendor/calibration");});
    await page.goto("/index.html");
    await page.getByLabel("Email", {exact: true}).fill(email); await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    const workspace = page.locator(".vendor-calibration-page");
    await expect(workspace).toBeVisible({timeout: 60000});
    await workspace.getByRole("button", {name: "cal_smoke (Active)", exact: true}).click();
    await expect(workspace.getByLabel("guessWeight", {exact: true})).toHaveValue("1");
    await workspace.getByLabel("guessWeight", {exact: true}).fill("0");
    await workspace.getByLabel("phaseWeight", {exact: true}).fill("1");
    await workspace.getByLabel("Select Calibration Smoke Institute", {exact: true}).check();
    await workspace.getByLabel("Academic year ID", {exact: true}).fill("2026");
    await workspace.getByRole("button", {name: "Run simulation", exact: true}).click();
    await expect(workspace.getByText("Before average: 50.00", {exact: true})).toBeVisible();
    await expect(workspace.getByText("Projected average: 40.00", {exact: true})).toBeVisible();
    for (const state of ["Stable", "Drift-Prone", "Impulsive", "Overextended", "Volatile"]) await expect(workspace.getByRole("rowheader", {name: state, exact: true})).toBeVisible();
    await workspace.getByLabel("Academic year ID", {exact: true}).fill("2025");
    await expect(workspace.getByLabel("Authoritative simulation results")).toHaveCount(0);
    await workspace.getByLabel("Academic year ID", {exact: true}).fill("2026");
    await expect(workspace.getByLabel("Authoritative simulation results")).toHaveCount(0);
    await expect(workspace.getByRole("button", {name: "Publish calibration", exact: true})).toBeDisabled();
    expect(apiRequests.some(request => request.method() === "POST" && request.url().endsWith("/simulate"))).toBe(true);
    expect(apiRequests.some(request => request.url().endsWith("/push"))).toBe(false);
    expect(external).toEqual([]);
    await page.reload(); await expect(workspace.getByText("Select a server version to initialize proposed weights.", {exact: true})).toBeVisible();
    await expect(workspace.getByLabel("Authoritative simulation results")).toHaveCount(0);
    // This bounded smoke adopts the verified immediate workflow. Exhaustive faults remain substep eight.
    await db.doc(root).update({vendorLicenseLayer: "L0"});
    for (const mirror of ["current", "main"]) await db.doc(`${root}/license/${mirror}`).set({currentLayer: "L0", licenseVersion: "smoke_license", licenseState: "active", planId: "L0-test", featureFlags: {}, ...(mirror === "main" ? {calibrationVersion: null} : {})});
    await workspace.getByRole("button", {name: "Refresh targets", exact: true}).click();
    await workspace.getByRole("button", {name: "cal_smoke (Active)", exact: true}).click();
    await workspace.getByLabel("Select Calibration Smoke Institute", {exact: true}).check();
    const publishing = workspace.getByLabel("Immediate calibration publishing");
    await expect(publishing).toContainText(`${instituteId}: expected no institute pointer`);
    // One ordinary service failure qualifies the mounted failed/retry state,
    // not the later exhaustive transaction-boundary fault matrix.
    const mainLicense = (await db.doc(`${root}/license/main`).get()).data();
    await db.doc(`${root}/license/main`).delete();
    await publishing.getByLabel("Confirm calibration command", {exact: true}).check();
    await publishing.getByRole("button", {name: "Publish calibration", exact: true}).click();
    await expect(publishing).toContainText("Authoritative operation: not_applied; revision 2.");
    await expect(publishing).toContainText("No targets applied: INVALID_TARGET.");
    const failedBody = apiRequests.find(request => request.url().endsWith("/push") && request.method() === "POST").postDataJSON();
    const failedId = "cal_" + createHash("sha256").update(JSON.stringify([1, user.uid, "rollout", failedBody.idempotencyKey])).digest("hex"); operations.add(failedId);
    expect((await db.doc(root).get()).get("calibrationVersion")).toBeUndefined();
    await db.doc(`${root}/license/main`).set(mainLicense);
    await publishing.getByRole("button", {name: "Retry / replay exact command", exact: true}).click();
    await expect(publishing).toContainText("Authoritative operation: not_applied; revision 2.");
    expect(apiRequests.filter(request => request.url().endsWith("/push") && request.method() === "POST").map(request => request.postDataJSON())).toEqual([failedBody, failedBody]);
    await publishing.getByRole("button", {name: "Start a new command after terminal status", exact: true}).click();
    await expect(publishing).toContainText(`${instituteId}: expected no institute pointer`);
    await publishing.getByLabel("Confirm calibration command", {exact: true}).check();
    await publishing.getByRole("button", {name: "Publish calibration", exact: true}).click();
    await expect(publishing).toContainText("Authoritative operation: applied; revision 2.");
    const push = apiRequests.filter(request => request.url().endsWith("/push") && request.method() === "POST").at(-1);
    const applyBody = push.postDataJSON();
    expect(applyBody.idempotencyKey).not.toBe(failedBody.idempotencyKey);
    expect(applyBody).toMatchObject({versionId, targets: [{instituteId, expectedCalibrationVersion: null}]});
    const appliedId = "cal_" + createHash("sha256").update(JSON.stringify([1, user.uid, "rollout", applyBody.idempotencyKey])).digest("hex"); operations.add(appliedId);
    const receipt = (await db.doc(`vendorCalibrationLogs/${appliedId}`).get()).data();
    expect((await db.doc(root).get()).get("calibrationVersion")).toBe(versionId);
    await page.reload(); await expect(publishing).toContainText("Authoritative operation: applied; revision 2.");
    await publishing.getByRole("button", {name: "Retry / replay exact command", exact: true}).click();
    await expect(publishing).toContainText("Authoritative operation: applied; revision 2.");
    expect(apiRequests.filter(request => request.url().endsWith("/push") && request.method() === "POST").map(request => request.postDataJSON()).filter(body => body.idempotencyKey === applyBody.idempotencyKey)).toEqual([applyBody, applyBody]);
    expect((await db.doc(`vendorCalibrationLogs/${appliedId}`).get()).data()).toEqual(receipt);
    await publishing.getByLabel("Confirm calibration command", {exact: true}).check();
    await publishing.getByRole("button", {name: "Rollback", exact: true}).click();
    await expect(publishing).toContainText("Authoritative operation: applied; revision 2.");
    await expect(publishing).toContainText("Kind: rollback.");
    const rollback = apiRequests.find(request => request.url().endsWith("/rollback") && request.method() === "POST");
    const inverseBody = rollback.postDataJSON();
    expect(inverseBody.expectedOperationRevision).toBe(2); expect(inverseBody.idempotencyKey).not.toBe(applyBody.idempotencyKey);
    const inverseId = "cal_" + createHash("sha256").update(JSON.stringify([1, user.uid, "rollback", inverseBody.idempotencyKey])).digest("hex"); operations.add(inverseId);
    expect((await db.doc(root).get()).get("calibrationVersion")).toBeUndefined();
    expect((await db.doc(`${root}/license/current`).get()).get("calibrationVersion")).toBeUndefined();
    expect((await db.doc(`${root}/license/main`).get()).get("calibrationVersion")).toBeNull();
    expect((await db.doc(`vendorCalibrationRollouts/${appliedId}`).get()).get("state")).toBe("rolled_back");
    await page.reload(); await expect(publishing).toContainText("Kind: rollback."); await expect(publishing).toContainText("Authoritative operation: applied; revision 2.");
    await expect(publishing.getByRole("button", {name: "Rollback", exact: true})).toBeDisabled();
    await expect(workspace.getByRole("button", {name: "Create version", exact: true})).toBeDisabled();
    await expect(workspace.getByRole("button", {name: "Schedule activation", exact: true})).toBeDisabled();
  } finally {
    for (const operation of operations) { await db.doc(`vendorCalibrationRollouts/${operation}`).delete(); await db.doc(`vendorCalibrationLogs/${operation}`).delete(); }
    await db.recursiveDelete(db.doc(root)); await db.doc(`globalCalibration/${versionId}`).delete();
    await auth.deleteUser(user.uid); await app.delete();
  }
});
