import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("permanent calibration acceptance is an isolated real production-build emulator flow", async () => {
  const source = await read("tests/e2e/vendor-calibration-acceptance.spec.mjs");
  const runner = await read("scripts/run-vendor-calibration-smoke-e2e.mjs");
  const pkg = JSON.parse(await read("package.json"));
  assert.match(pkg.scripts["test:vendor-calibration-acceptance:e2e"], /--acceptance/u);
  assert.match(pkg.scripts["test:e2e:vendor-calibration-acceptance"], /vendor-calibration-acceptance.spec.mjs/u);
  for (const value of ["mkdtempSync", "--acceptance", 'NODE_ENV: "production"', 'VITE_DATA_MODE: "live"', "auth,firestore,functions:apiV1,hosting:vendor", "test:e2e:vendor-calibration-acceptance"]) assert.ok(runner.includes(value), value);
  assert.doesNotMatch(source, /route\.fulfill|route\.fetch|storageState:/u);
  for (const value of ["FIREBASE_EMULATOR_HUB", "GOOGLE_CLOUD_PROJECT", "createUser", "setCustomUserClaims", "page.reload", "browser.newContext", "malformed", "No calibration versions available", "No institutes available", "Empty population:", "permission:", "Validation:", "unavailable:", "revokeRefreshTokens", "allRoutesDenied", "SECRET_CAL_SESSION", "expect(status).toBe(403)", "originalMetric", "FORGED_LOCAL_CALIBRATION", "expect(storage.audit).toBe(initialAudit)", "db.recursiveDelete", "auth.deleteUser", "expect(external).toEqual([])"]) assert.ok(source.includes(value), value);
});

test("acceptance asserts exact model/selection/distribution/schema and all disabled lifecycle modes", async () => {
  const source = await read("tests/e2e/vendor-calibration-acceptance.spec.mjs");
  for (const value of ["50.00", "40.00", "64.29", "28.57", "100.00", "25.00", "20.00", "-1 / -20", "summaryDocumentCount: 5", "student_year_summaries", "phaseWeights", "toHaveCount(25)", "toHaveCount(2)", "missing_year", "actorId: \"forged\"", "strategyProfileParameters", "[200, 400, 401, 403, 500]", "Create version", "Publish calibration", "Schedule activation", "Rollback", "Publishing supports only immediate selected-version publishing and explicit inverse restoration.", "Server audit history is available in the Audit workspace."]) assert.ok(source.includes(value), value);
});

test("rollout acceptance uses guarded real SDK boundaries and drops only actual committed HTTP responses", async () => {
  const fixture = await read("functions/src/tests/calibrationFaultFixture.ts"), api = await read("functions/tests/vendorCalibrationOperations.emulator.test.js");
  const source = await read("tests/e2e/vendor-calibration-rollout-acceptance.spec.mjs"), runner = await read("scripts/run-vendor-calibration-smoke-e2e.mjs");
  const pkg = JSON.parse(await read("package.json"));
  for (const value of ["beforeRead", "afterRead", "afterWrite", "afterCommit", "recoveryRead", "reservation", "effects", "failure", "runTransaction", "Reflect.apply", "demo-parabolic-test", "FIREBASE_EMULATOR_HUB"]) assert.ok(fixture.includes(value), value);
  for (const value of ["unexercised seam", "partial", "immutablePaths", "calibrationFaultPoints", "status.body.data", "recovered.body.data", "HTTP competing keys", "HTTP late-target drift"]) assert.ok(api.includes(value), value);
  assert.doesNotMatch(source, /route\.fulfill|storageState:/u);
  for (const value of ["route.fetch()", "response.status()).toBe(200)", "route.abort", "Completion is unknown", "page.reload", "PRIVATE_RESERVATION_INTERRUPTION", "pendingBody", "TARGET_CONFLICT", "calibrationHistory", "toBe(4)", "Start a new command after terminal status", "expect(external).toEqual([])"]) assert.ok(source.includes(value), value);
  assert.match(pkg.scripts["test:vendor-calibration-rollout:e2e"], /--rollout/u);
  assert.match(pkg.scripts["test:e2e:vendor-calibration-rollout"], /vendor-calibration-rollout-acceptance.spec.mjs/u);
  assert.ok(runner.includes("test:e2e:vendor-calibration-rollout"));
  assert.ok(runner.includes('process.argv.includes("--closeout")'));
  assert.ok(runner.includes('["smoke", "acceptance", "rollout"]'));
  const index = await read("functions/src/index.ts");
  assert.doesNotMatch(index, /calibrationFaultFixture/);
});
