import assert from "node:assert/strict";
import {BACKEND_STAGES} from "../scripts/run-backend-tests.mjs";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {firebaseIntegrationGroups} from "../scripts/firebase-emulator-harness-config.mjs";

const repositoryFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

test("backend CI aggregates every emulator-backed Functions suite", async () => {
  const [workflow, packageSource, outerRunner, innerRunner, sourceFiles, externalFiles] =
    await Promise.all([
      readFile(repositoryFile(".github/workflows/frontend-ci-cd.yml"), "utf8"),
      readFile(repositoryFile("package.json"), "utf8"),
      readFile(repositoryFile("scripts/run-emulator-integration-suite.mjs"), "utf8"),
      readFile(repositoryFile("scripts/firebase-emulator-integration-suite.mjs"), "utf8"),
      readdir(repositoryFile("functions/src/tests")),
      readdir(repositoryFile("functions/tests")),
    ]);
  const rootPackage = JSON.parse(packageSource);
  const markers = [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "firebase emulators",
  ];
  let firestoreSuiteCount = 0;

  for (const file of sourceFiles.filter((name) => name.endsWith(".test.ts"))) {
    const source = await readFile(repositoryFile(`functions/src/tests/${file}`), "utf8");
    if (markers.some((marker) => source.includes(marker))) {
      firestoreSuiteCount += 1;
    }
  }
  const explicitSuiteCount = externalFiles.filter(
    (file) => file.endsWith(".emulator.test.js"),
  ).length;

  assert.equal(firestoreSuiteCount, 99);
  assert.equal(explicitSuiteCount, 20);
  assert.equal(workflow.split('- "scripts/firebase-emulator-*.mjs"').length - 1, 2);
  assert.deepEqual(Object.keys(firebaseIntegrationGroups), ["foundation", "student", "vendor"]);
  assert.deepEqual(Object.values(firebaseIntegrationGroups).map((group) => group.length), [8, 5, 7]);
  assert.deepEqual(Object.values(firebaseIntegrationGroups).flat().sort(), externalFiles.filter((name) => name.endsWith(".emulator.test.js")).sort());
  assert.match(outerRunner, /for \(const group of Object.keys\(firebaseIntegrationGroups\)\)/u);
  assert.match(innerRunner, /Every explicit suite belongs to exactly one lifecycle group/u);
  assert.doesNotMatch(outerRunner, /inspect-functions/u);
  for (const file of ["vendorAuditReadModel.test.ts", "vendorSystemHealthReadModel.test.ts"]) {
    assert.ok(sourceFiles.includes(file), file);
  }
  assert.ok(externalFiles.includes("vendorAuditHealthApi.emulator.test.js"));
  assert.ok(externalFiles.includes("vendorCapabilityAlignment.emulator.test.js"));
  assert.equal(
    rootPackage.scripts["test:emulators:ci"],
    "node scripts/run-emulator-integration-suite.mjs",
  );
  assert.equal(
    rootPackage.scripts["test:emulators:failure-cleanup"],
    "node scripts/run-emulator-integration-suite.mjs --failure-cleanup-probe",
  );
  assert.match(workflow, /npm install --global firebase-tools@15\.9\.0/u);
  assert.match(workflow, /npm run test:backend/u);
  assert.deepEqual(BACKEND_STAGES.find(s => s.id === "emulators").args, ["run", "test:emulators:ci"]);
  assert.deepEqual(BACKEND_STAGES.find(s => s.id === "failure-cleanup").args, ["run", "test:emulators:failure-cleanup"]);
  assert.match(outerRunner, /async function runEmulatorPhase/u);
  assert.match(outerRunner, /await assertPortsReleased\(\)/u);
  assert.match(outerRunner, /FUNCTIONS_EMULATOR_HOST:/u);
  assert.match(outerRunner, /--full-services/u);
  assert.match(outerRunner, /--firestore-only/u);
  assert.match(outerRunner, /\["auth", "firestore", "storage"\]/u);
  assert.match(outerRunner, /QUESTION_ASSETS_BUCKET:/u);
  assert.match(outerRunner, /IDENTITY_PHOTOS_BUCKET: `\$\{projectId\}-identity-photos`/u);
  assert.match(outerRunner, /VENDOR_AUDIT_CURSOR_KEY: randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.match(innerRunner, /executeBackendSuite/u);
  assert.match(innerRunner, /selectedSuites\.map\(\(suite\) => \[suite\]\)/u);
  assert.match(innerRunner, /result: "FAIL", failure: error.message/u);
  assert.match(innerRunner, /assertBackendEmulators\(process.env, fullServicesPhase\)/u);
  assert.match(innerRunner, /Fire(?:store phase completed|store-backed suites)/u);
  assert.match(innerRunner, /Select exactly one emulator integration phase/u);
  assert.match(innerRunner, /cleanupMaxAttempts = 3/u);
  assert.match(innerRunner, /transientCleanupCodes/u);
  assert.match(innerRunner, /finally \{await clearEmulatorData\(\);\}/u);
});

test("emulator phases supply explicit scoped per-phase cursor keys without changing process environment", async () => {
  const source = await readFile(repositoryFile("scripts/run-emulator-integration-suite.mjs"), "utf8");
  const start = source.indexOf("function phaseEnvironment(");
  const end = source.indexOf("\nfunction portIsOpen(", start);
  assert.ok(start >= 0 && end > start);
  const make = new Function("randomBytes", "projectId", `${source.slice(start, end)}\nreturn phaseEnvironment;`)(randomBytes, "demo-parabolic-test");
  const originalKey = process.env.VENDOR_AUDIT_CURSOR_KEY;
  const originalCdnKey = process.env.CDN_SIGNED_URL_KEY_VALUE;
  const first = make(), second = make({FUNCTIONS_EMULATOR_HOST: "127.0.0.1:5001"});
  for (const environment of [first, second]) {
    assert.equal(environment.NODE_ENV, "test");
    for (const name of ["PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
      assert.equal(environment[name], "demo-parabolic-test");
    }
    assert.equal(environment.CDN_BASE_URL, "https://cdn.emulator.test.invalid/published");
    assert.equal(environment.CDN_SIGNED_URL_KEY_NAME, "bwm-048-local-only");
    assert.equal(Buffer.from(environment.CDN_SIGNED_URL_KEY_VALUE, "base64url").length, 32);
    const bytes = Buffer.from(environment.VENDOR_AUDIT_CURSOR_KEY, "base64url");
    assert.equal(bytes.length, 32);
    assert.equal(bytes.toString("base64url"), environment.VENDOR_AUDIT_CURSOR_KEY);
  }
  assert.notEqual(first.VENDOR_AUDIT_CURSOR_KEY, second.VENDOR_AUDIT_CURSOR_KEY);
  assert.notEqual(first.CDN_SIGNED_URL_KEY_VALUE, second.CDN_SIGNED_URL_KEY_VALUE);
  assert.equal(first.FUNCTIONS_EMULATOR_HOST, undefined);
  assert.equal(second.FUNCTIONS_EMULATOR_HOST, "127.0.0.1:5001");
  assert.equal(process.env.VENDOR_AUDIT_CURSOR_KEY, originalKey);
  assert.equal(process.env.CDN_SIGNED_URL_KEY_VALUE, originalCdnKey);
});

test("the cross-portal export matrix has a dedicated local owner separate from ordinary concurrency regressions", async () => {
  const rootPackage = JSON.parse(await readFile(repositoryFile("package.json"), "utf8"));
  assert.equal(rootPackage.scripts["test:cross-portal-authorization"], "node scripts/run-cross-portal-authorization.mjs");
  const runner = await readFile(repositoryFile("scripts/run-cross-portal-authorization.mjs"), "utf8");
  const spec = await readFile(repositoryFile("tests/security/cross-portal-authorization.emulator.cjs"), "utf8");
  assert.match(runner, /tests\/security\/cross-portal-authorization\.emulator\.cjs/u);
  assert.match(runner, /phase === "all" \? \["guards", "services", "browser"\]/u);
  assert.match(runner, /selected === "guards" \? \["--inspect-functions=9231"\] : \[\]/u);
  assert.match(spec, /for \(const route of API_ROUTE_MANIFEST\)/u);
  assert.match(spec, /for \(const item of BACKEND_HTTP_EXPORT_MANIFEST\)/u);
});
