import {randomUUID, createHash} from "node:crypto";
import {createRequire} from "node:module";
import {expect as baseExpect, test} from "playwright/test";
const expect = baseExpect.configure({timeout: 60000});
const require = createRequire(import.meta.url);
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
const {CalibrationRolloutService} = require("../../functions/lib/services/calibrationRollout");
test.use({bypassCSP: true});
test.setTimeout(360000);
test("real rollout uncertainty, pending reload, exact retries and inverse drift never double-apply", async ({page}) => {
  for (const key of ["PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) expect(process.env[key]).toBe("demo-parabolic-test");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIREBASE_EMULATOR_HUB).toMatch(/^(127\.0\.0\.1|localhost):\d+$/u);
  page.setDefaultTimeout(60000);
  const app = getFirebaseAdminApp(), db = getFirestore(), auth = app.auth();
  const user = await auth.createUser({email: `rollout-${randomUUID()}@example.test`, password: "local-rollout-only-password"});
  const versionId = "bwm039_browser_candidate", ids = ["bwm039_browser_a", "bwm039_browser_z"];
  const operations = new Set(), commands = [], external = [];
  const identity = (kind, key) => "cal_" + createHash("sha256").update(JSON.stringify([1, user.uid, kind, key])).digest("hex");
  const storageKey = `vendor-calibration-command-v1:${user.uid}`;
  const workspace = page.locator(".vendor-calibration-page"), publishing = workspace.getByLabel("Immediate calibration publishing");
  const button = name => publishing.getByRole("button", {name, exact: true});
  const state = value => expect(publishing).toContainText(`Authoritative operation: ${value}; revision ${value === "pending" ? 1 : 2}.`);
  const pointers = async () => Promise.all(ids.flatMap(id => ["", "/license/current", "/license/main"].map(async suffix => ({path: `institutes/${id}${suffix}`, data: (await db.doc(`institutes/${id}${suffix}`).get()).data()}))));
  const fact = async id => (await db.doc(`vendorCalibrationLogs/${id}`).get()).data();
  const confirm = () => publishing.getByLabel("Confirm calibration command", {exact: true}).check();
  page.on("request", request => {
    if (/^https?:/u.test(request.url()) && !["localhost", "127.0.0.1"].includes(new URL(request.url()).hostname)) external.push(request.url());
    if (request.method() === "POST" && /\/vendor\/calibration\/(push|operations\/[^/]+\/rollback)$/u.test(new URL(request.url()).pathname)) {
      const kind = request.url().endsWith("/rollback") ? "rollback" : "rollout", body = request.postDataJSON();
      const id = identity(kind, body.idempotencyKey); operations.add(id); commands.push({kind, body, id});
    }
  });
  await page.route("https://**/*", route => route.abort("failed"));
  await page.addInitScript(() => { if (location.pathname === "/index.html") history.replaceState(null, "", "/vendor/calibration"); });
  try {
    await auth.setCustomUserClaims(user.uid, {role: "vendor", isVendor: true, licenseLayer: "L0"});
    const source = {schemaVersion: 1, versionId, isActive: true, createdBy: user.uid, createdAt: "2026-01-01T00:00:00.000Z", activationDate: "2026-01-01T00:00:00.000Z",
      weights: {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0}, thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20}};
    await db.doc(`globalCalibration/${versionId}`).set(source);
    for (const [index, id] of ids.entries()) {
      await db.doc(`institutes/${id}`).set({instituteId: id, registeredName: `Rollout ${index}`, instituteRevision: 1, status: "active", vendorLifecycleState: "active", vendorLicenseLayer: "L0",
        settingsRevision: 0, settingsUsers: {}, primaryAdminUserId: null, pendingPrimaryAdministrator: null, vendorAccountReference: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), ...(index ? {calibrationVersion: null} : {})});
      for (const mirror of ["current", "main"]) await db.doc(`institutes/${id}/license/${mirror}`).set({currentLayer: "L0", licenseVersion: "test_license", licenseState: "active", planId: "L0-test", featureFlags: {}, ...(mirror === "main" ? {calibrationVersion: null} : {})});
    }
    const before = await pointers();
    await page.goto("/index.html"); await page.getByLabel("Email", {exact: true}).fill(user.email); await page.getByLabel("Password", {exact: true}).fill("local-rollout-only-password");
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(workspace).toBeVisible();
    await workspace.getByRole("button", {name: `${versionId} (Active)`, exact: true}).click();
    for (let i = 0; i < 2; i++) await workspace.getByLabel(`Select Rollout ${i}`, {exact: true}).check();
    await expect(publishing).toContainText(`${ids[1]}: expected no institute pointer`);
    await expect(button("Publish calibration")).toBeDisabled(); await confirm(); await expect(button("Publish calibration")).toBeEnabled();

    // Forward the REAL mutation to Functions, then drop its response. Never fulfill/synthesize an API response.
    const blockStatus = route => route.abort("failed");
    const loseCommittedResponse = async route => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed"); };
    await page.route("**/api/v1/vendor/calibration/operations/*", blockStatus);
    await page.route("**/api/v1/vendor/calibration/push", loseCommittedResponse);
    await button("Publish calibration").click(); await expect(publishing.getByRole("alert")).toContainText("Completion is unknown");
    const apply = commands[0]; expect(commands).toHaveLength(1); expect((await db.doc(`vendorCalibrationRollouts/${apply.id}`).get()).get("state")).toBe("applied");
    const applyFact = await fact(apply.id);
    await expect(button("Publish calibration")).toBeDisabled(); await expect(button("Start a new command after terminal status")).toBeDisabled();
    await page.unroute("**/api/v1/vendor/calibration/push", loseCommittedResponse);
    await page.reload(); await expect(publishing.getByRole("alert")).toContainText("Completion is unknown");
    expect(commands).toHaveLength(1); await expect(button("Publish calibration")).toBeDisabled();
    await page.unroute("**/api/v1/vendor/calibration/operations/*", blockStatus);
    await button("Reload operation status").click(); await state("applied");
    await button("Retry / replay exact command").click(); await state("applied");
    expect(commands.filter(command => command.kind === "rollout")).toEqual([apply, apply]); expect(await fact(apply.id)).toEqual(applyFact);
    for (const id of ids) expect((await db.collection(`institutes/${id}/calibrationHistory`).get()).size).toBe(1);

    await page.route("**/api/v1/vendor/calibration/operations/*", blockStatus);
    await page.route("**/api/v1/vendor/calibration/operations/*/rollback", loseCommittedResponse);
    await confirm(); await button("Rollback").click(); await expect(publishing.getByRole("alert")).toContainText("Completion is unknown");
    const inverse = commands.at(-1); expect(inverse.kind).toBe("rollback"); expect(inverse.body.expectedOperationRevision).toBe(2); expect(inverse.body.idempotencyKey).not.toBe(apply.body.idempotencyKey);
    const inverseFact = await fact(inverse.id); expect(await pointers()).toEqual(before);
    await page.unroute("**/api/v1/vendor/calibration/operations/*/rollback", loseCommittedResponse);
    await page.reload(); await expect(publishing.getByRole("alert")).toContainText("Completion is unknown");
    await expect(button("Rollback")).toBeDisabled();
    await page.unroute("**/api/v1/vendor/calibration/operations/*", blockStatus);
    await button("Reload operation status").click(); await state("applied");
    await button("Retry / replay exact command").click(); await state("applied");
    expect(commands.filter(command => command.kind === "rollback")).toEqual([inverse, inverse]); expect(await fact(inverse.id)).toEqual(inverseFact); expect(await fact(apply.id)).toEqual(applyFact);
    expect(await pointers()).toEqual(before);
    for (const id of ids) expect((await db.collection(`institutes/${id}/calibrationHistory`).get()).size).toBe(2);

    await button("Start a new command after terminal status").click();
    const pendingBody = {idempotencyKey: randomUUID(), versionId, targets: ids.map(instituteId => ({instituteId, expectedCalibrationVersion: null}))};
    const pendingId = identity("rollout", pendingBody.idempotencyKey); operations.add(pendingId);
    await expect(new CalibrationRolloutService(db, {afterReservation: () => { throw new Error("PRIVATE_RESERVATION_INTERRUPTION"); }}).apply(user.uid, pendingBody)).rejects.toThrow("PRIVATE_RESERVATION_INTERRUPTION");
    expect(await pointers()).toEqual(before); expect(await fact(pendingId)).toBeUndefined();
    await page.evaluate(({key, operationId, request}) => sessionStorage.setItem(key, JSON.stringify({kind: "rollout", operationId, request})), {key: storageKey, operationId: pendingId, request: pendingBody});
    await page.reload(); await state("pending"); await expect(button("Publish calibration")).toBeDisabled(); await expect(button("Start a new command after terminal status")).toBeDisabled();
    await button("Retry / replay exact command").click(); await state("applied");
    const pendingFact = await fact(pendingId); await button("Retry / replay exact command").click(); await state("applied");
    expect(commands.filter(command => command.id === pendingId).map(command => command.body)).toEqual([pendingBody, pendingBody]); expect(await fact(pendingId)).toEqual(pendingFact);

    await db.doc(`institutes/${ids[1]}/license/main`).update({calibrationVersion: "later_pointer"});
    const drifted = await pointers(); await confirm(); await button("Rollback").click(); await state("not_applied");
    await expect(publishing).toContainText("No targets applied: TARGET_CONFLICT.");
    const failedInverse = commands.at(-1), failureFact = await fact(failedInverse.id);
    expect(await pointers()).toEqual(drifted); await button("Retry / replay exact command").click(); await state("not_applied");
    expect(commands.filter(command => command.id === failedInverse.id)).toEqual([failedInverse, failedInverse]); expect(await fact(failedInverse.id)).toEqual(failureFact); expect(await pointers()).toEqual(drifted);
    expect((await db.doc(`vendorCalibrationRollouts/${pendingId}`).get()).get("state")).toBe("applied");
    for (const name of ["Create version", "Schedule activation"]) await expect(workspace.getByRole("button", {name, exact: true})).toBeDisabled();
    await expect(button("Rollback")).toBeDisabled();
    expect((await db.doc(`globalCalibration/${versionId}`).get()).data()).toEqual(source); expect(external).toEqual([]);
    const journals = await db.collection("vendorCalibrationRollouts").where("vendorUid", "==", user.uid).get();
    expect(journals.size).toBe(4); expect(journals.docs.every(document => operations.has(document.id))).toBe(true);
  } finally {
    for (const id of ids) await db.recursiveDelete(db.doc(`institutes/${id}`));
    await db.doc(`globalCalibration/${versionId}`).delete();
    const journals = await db.collection("vendorCalibrationRollouts").where("vendorUid", "==", user.uid).get();
    for (const journal of journals.docs) operations.add(journal.id);
    for (const id of operations) { await db.doc(`vendorCalibrationRollouts/${id}`).delete(); await db.doc(`vendorCalibrationLogs/${id}`).delete(); }
    await auth.deleteUser(user.uid); await app.delete();
  }
});
