import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {apiSuites, browserStages} from "../scripts/vendor-acceptance-matrix.mjs";
import {root} from "./helpers/vendor-action-inventory.mjs";
const read = path => readFile(`${root}/${path}`, "utf8");

test("one Vendor acceptance matrix schedules all domain proofs and every required behavior", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["test:vendor-acceptance:e2e"], "node scripts/run-vendor-acceptance-e2e.mjs");
  assert.equal(apiSuites.length, 5); assert.equal(browserStages.length, 9);
  assert.equal(new Set(browserStages.map(s => s.id)).size, 9);
  assert.deepEqual(browserStages.map(s => s.file), ["vendor-audit-health-smoke", "vendor-acceptance-shells", "vendor-capability-alignment", "vendor-truthfulness-repair", "vendor-institutes", "vendor-commercial", "vendor-calibration-acceptance", "vendor-calibration-rollout-acceptance", "vendor-intelligence-acceptance"].map(s => `tests/e2e/${s}.spec.mjs`));
  for (const stage of browserStages) {
    const args = pkg.scripts[stage.script].split(" ");
    assert.deepEqual(args.slice(0, 3), ["playwright", "test", stage.file]);
    assert.ok(args.length === 3 || (args.length === 4 && args[3] === "--project=chromium"));
    const source = await read(stage.file);
    assert.doesNotMatch(source, /route\.fulfill|storageState:/u, stage.id);
    assert.match(source, /FIRESTORE_EMULATOR_HOST/u); assert.match(source, /FIREBASE_AUTH_EMULATOR_HOST/u);
  }
  for (const behavior of ["all-routes", "shells", "navigation", "wrong-role", "current-identity", "target-denial", "onboarding", "administrator", "institute-persistence", "financial-persistence", "calibration-persistence", "calibration-simulation", "rollback", "reload", "fresh-session", "validation", "conflict", "transport", "provider-failure", "post-commit-uncertainty", "failed-reload", "exact-replay", "hostile-storage", "disabled-unsupported", "source-unavailable"]) {
    assert.ok(browserStages.some(stage => stage.proves.includes(behavior)), behavior);
  }
});

test("matrix builds isolated live bytes, guards demo emulators, sequences fresh processes and fails closed", async () => {
  const outer = await read("scripts/run-vendor-audit-health-smoke-e2e.mjs"), inner = await read("scripts/run-vendor-acceptance-browser-matrix.mjs");
  for (const marker of ["mkdtempSync", "hostingRoot", 'VITE_DATA_MODE: "live"', 'NODE_ENV: "production"', "--acceptance-matrix", "node scripts/run-vendor-acceptance-browser-matrix.mjs", "auth,firestore,functions:apiV1,hosting:vendor", "rmSync(configPath", "rmSync(artifactRoot"]) assert.ok(outer.includes(marker), marker);
  assert.match(inner, /for \(const stage of browserStages\) run/u);
  assert.match(inner, /child.status !== 0/u);
  const coordinator = await read("scripts/run-vendor-acceptance-e2e.mjs");
  assert.ok(coordinator.indexOf('run("api-authority"') < coordinator.indexOf('run("browser-matrix"'));
  assert.ok(coordinator.includes("scripts/run-vendor-audit-health-api-emulator.mjs"));
  assert.ok(coordinator.includes("--capability-alignment"));
  assert.ok(coordinator.includes("scripts/run-vendor-audit-health-smoke-e2e.mjs"));
  assert.ok(coordinator.includes("--acceptance-matrix"));
  const apiRunner = await read("scripts/run-vendor-audit-health-api-emulator.mjs");
  for (const suite of apiSuites) assert.ok(apiRunner.includes(suite), suite);
  const env = {...process.env, PROJECT_ID: "non-demo-must-deny"}; delete env.NODE_TEST_CONTEXT;
  const denied = spawnSync(process.execPath, ["scripts/run-vendor-acceptance-browser-matrix.mjs"], {cwd: root, env, encoding: "utf8", timeout: 10000});
  assert.equal(denied.status, 1); assert.doesNotMatch(denied.stdout, /START|PASS/u);
  assert.match(denied.stderr, /AssertionError/u);
});

test("cross-route shell scenario pins current-identity and missing-target persistence assertions", async () => {
  const source = await read("tests/e2e/vendor-acceptance-shells.spec.mjs");
  for (const marker of ["/vendor/unknown-boundary", "/unknown-boundary", "Notification authority unavailable", "Open Calibration", "Open Audit", "License requests: use Licensing and billing", "registeredName: \"Must not create\"", "toBe(404)", "toBe(403)", "toBe(401)", "disabled: true", "browser.newContext", "toEqual(before)", "vendorAuditLogs", "expect(external).toEqual([])"]) assert.ok(source.includes(marker), marker);
  const routes = await read("tests/e2e/vendor-capability-alignment.spec.mjs");
  for (const path of ["/vendor/overview", "/vendor/institutes", "/vendor/licensing", "/vendor/calibration", "/vendor/calibration/simulate", "/vendor/calibration/history", "/vendor/intelligence", "/vendor/system-health", "/vendor/audit"]) assert.ok(routes.includes(path), path);
  assert.match(routes, /\/vendor\/institutes\/\$\{instituteId\}/u);
});
