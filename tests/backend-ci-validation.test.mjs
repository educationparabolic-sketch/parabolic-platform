import assert from "node:assert/strict";
import {BACKEND_STAGES, BACKEND_CONTRACTS} from "../scripts/run-backend-tests.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../.github/workflows/frontend-ci-cd.yml", import.meta.url),
);
const functionsPackagePath = fileURLToPath(new URL("../functions/package.json", import.meta.url));
const runnerPath = fileURLToPath(
  new URL("../functions/scripts/run-non-emulator-tests.mjs", import.meta.url),
);

test("backend CI gates deploy on Functions lint, build, and deterministic tests", async () => {
  const [workflow, functionsPackageSource, runner] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(functionsPackagePath, "utf8"),
    readFile(runnerPath, "utf8"),
  ]);
  const functionsPackage = JSON.parse(functionsPackageSource);
  const backendJobStart = workflow.indexOf("  backend-ci:");
  const stagingDeployStart = workflow.indexOf("  staging-deploy:");
  const backendJob = workflow.slice(backendJobStart, stagingDeployStart);

  assert.ok(backendJobStart >= 0 && stagingDeployStart > backendJobStart);
  assert.match(backendJob, /^  backend-ci:\n    name: Backend Validate$/mu);
  const javaSetup = backendJob.indexOf("uses: actions/setup-java@v5");
  const firebaseCliInstall = backendJob.indexOf("npm install --global firebase-tools@15.9.0");
  const aggregateStart = backendJob.indexOf("npm run test:backend");
  assert.match(backendJob, /distribution: "temurin"/u);
  assert.match(backendJob, /java-version: "21"/u);
  assert.match(backendJob, /java -version/u);
  assert.ok(
    javaSetup >= 0 && javaSetup < firebaseCliInstall && firebaseCliInstall < aggregateStart,
    "Java 21 and the pinned Firebase CLI must be ready before the emulator aggregate",
  );
  for (const dependencyRoot of ["apps/admin", "apps/student", "shared"]) {
    const installCommand = `npm ci --prefix ${dependencyRoot}`;
    assert.match(backendJob, new RegExp(installCommand.replace("/", "\\/"), "u"));
    assert.ok(
      backendJob.indexOf(installCommand) < aggregateStart,
      `${dependencyRoot} dependencies must be installed before the aggregate builds Portal Hosting`,
    );
  }
  assert.match(backendJob, /- name: Run complete backend verification\n        run: npm run test:backend/u);
  assert.deepEqual(BACKEND_STAGES.slice(0, 2).map(stage => stage.args),
    [["--prefix", "functions", "run", "lint"], ["--prefix", "functions", "run", "build"]]);
  assert.deepEqual(BACKEND_STAGES.find(stage => stage.id === "unit").args,
    ["--prefix", "functions", "run", "test:ci:non-emulator"]);
  assert.deepEqual(BACKEND_STAGES.find(stage => stage.id === "emulators").args, ["run", "test:emulators:ci"]);
  assert.deepEqual(BACKEND_STAGES.find(stage => stage.id === "failure-cleanup").args, ["run", "test:emulators:failure-cleanup"]);
  for (const file of ["staging-deployment-pipeline", "staging-smoke", "production-promotion-separation"]) {
    assert.ok(BACKEND_CONTRACTS.includes(`tests/${file}.test.mjs`));
  }
  assert.match(workflow, /needs: \[frontend-ci, backend-ci\]/u);
  assert.equal(
    functionsPackage.scripts["test:ci:non-emulator"],
    "node scripts/run-non-emulator-tests.mjs",
  );

  for (const requiredSuite of [
    "apiGateway.test.js",
    "apiRouteManifest.test.js",
    "authMiddleware.test",
    "customClaimSynchronization.test",
    "firestoreIndexes.test",
    "firestoreQueryGovernance.test",
    "identitySessionSecurity.test",
    "systemEventTopology.test",
  ]) {
    assert.ok(runner.includes(`\"${requiredSuite}\"`), `${requiredSuite} must be selected`);
  }

  assert.match(runner, /for \(const file of testFiles\)/u);
  assert.match(runner, /executeBackendSuite/u);
  assert.match(runner, /source suite inventory changed/u);
  const exclusionStart = runner.indexOf("const baselineExclusions");
  const exclusionEnd = runner.indexOf("export const selectedExternalSuites");
  assert.ok(exclusionStart > 0 && exclusionEnd > exclusionStart);
  assert.ok(runner.slice(0, exclusionStart).includes('"adminStudentsApi.test"'),
    "the repaired Admin student handler suite must run in mandatory CI");
  assert.ok(!runner.slice(exclusionStart, exclusionEnd).includes('"adminStudentsApi.test"'),
    "the repaired Admin student handler suite must not remain excluded");
  assert.ok(runner.slice(0, exclusionStart).includes('"endpointTestingFramework.test"'),
    "the repaired endpoint framework must execute in mandatory CI");
  assert.match(runner.slice(exclusionStart, exclusionEnd).trim(), /^const baselineExclusions = new Map\(\);$/u,
    "both repaired baseline suites must remain selected, with no baseline exclusions");
});
