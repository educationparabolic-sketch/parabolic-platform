import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../.github/workflows/frontend-ci-cd.yml", import.meta.url),
);
const functionsPackagePath = fileURLToPath(
  new URL("../functions/package.json", import.meta.url),
);
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

  assert.match(workflow, /^  backend-ci:\n    name: Backend Validate$/mu);
  assert.match(workflow, /npm --prefix functions run lint/u);
  assert.match(workflow, /npm --prefix functions run build/u);
  assert.match(workflow, /npm --prefix functions run test:ci:non-emulator/u);
  assert.match(workflow, /npm run test:emulators:ci/u);
  assert.match(workflow, /npm run test:emulators:failure-cleanup/u);
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

  assert.match(runner, /--test-concurrency=1/u);
  assert.match(runner, /source suite inventory changed/u);
  assert.match(runner, /existing endpoint framework baseline is 55 passing and 13 failing/u);
});
