import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

  assert.equal(firestoreSuiteCount, 65);
  assert.equal(explicitSuiteCount, 9);
  assert.equal(
    rootPackage.scripts["test:emulators:ci"],
    "node scripts/run-emulator-integration-suite.mjs",
  );
  assert.equal(
    rootPackage.scripts["test:emulators:failure-cleanup"],
    "node scripts/run-emulator-integration-suite.mjs --failure-cleanup-probe",
  );
  assert.match(workflow, /npm install --global firebase-tools@15\.9\.0/u);
  assert.match(workflow, /npm run test:emulators:ci/u);
  assert.match(workflow, /npm run test:emulators:failure-cleanup/u);
  assert.match(outerRunner, /async function runEmulatorPhase/u);
  assert.match(outerRunner, /await assertPortsReleased\(\)/u);
  assert.match(outerRunner, /FUNCTIONS_EMULATOR_HOST:/u);
  assert.match(outerRunner, /--full-services/u);
  assert.match(outerRunner, /--firestore-only/u);
  assert.match(innerRunner, /--test-concurrency=1/u);
  assert.match(innerRunner, /selectedSuites\.map\(\(suite\) => \[suite\]\)/u);
  assert.match(innerRunner, /firstFailedResult \?\? result/u);
  assert.match(innerRunner, /Fire(?:store phase completed|store-backed suites)/u);
  assert.match(innerRunner, /Select exactly one emulator integration phase/u);
  assert.match(innerRunner, /finally \{\n  await clearEmulatorData\(\);\n\}/u);
});
