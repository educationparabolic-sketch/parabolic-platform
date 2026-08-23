import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { firebaseEmulatorHarness } from "./firebase-emulator-harness-config.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = resolve(repositoryRoot, "functions");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const expectedProjectId = firebaseEmulatorHarness.projectId;
const fullServicesPhase = process.argv.includes("--full-services");
const firestoreOnlyPhase = process.argv.includes("--firestore-only");
const emulatorMarkers = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "firebase emulators",
];

assert.notEqual(
  fullServicesPhase,
  firestoreOnlyPhase,
  "Select exactly one emulator integration phase",
);
assert.equal(process.env.GCLOUD_PROJECT, expectedProjectId);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, expectedProjectId);
assert.equal(process.env.PROJECT_ID, expectedProjectId);
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
if (fullServicesPhase) {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.ok(process.env.FUNCTIONS_EMULATOR_HOST);
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
}

async function discoverCompiledFirestoreSuites() {
  const sourceDirectory = resolve(functionsRoot, "src/tests");
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((file) => file.endsWith(".test.ts"))
    .sort();
  const suites = [];

  for (const file of sourceFiles) {
    const source = await readFile(resolve(sourceDirectory, file), "utf8");
    if (emulatorMarkers.some((marker) => source.includes(marker))) {
      suites.push(resolve(functionsRoot, "lib/tests", file.replace(/\.ts$/u, ".js")));
    }
  }

  return suites;
}

async function discoverExplicitEmulatorSuites() {
  const externalDirectory = resolve(functionsRoot, "tests");
  return (await readdir(externalDirectory))
    .filter((file) => file.endsWith(".emulator.test.js"))
    .sort()
    .map((file) => resolve(externalDirectory, file));
}

async function clearEmulatorData() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const cleanupRequests = [];
  if (authHost) {
    cleanupRequests.push([
      "Auth",
      `http://${authHost}/emulator/v1/projects/${expectedProjectId}/accounts`,
    ]);
  }
  cleanupRequests.push([
    "Firestore",
    `http://${firestoreHost}/emulator/v1/projects/${expectedProjectId}` +
      "/databases/(default)/documents",
  ]);

  const results = await Promise.all(cleanupRequests.map(async ([label, url]) => {
    const response = await fetch(url, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    assert.ok(response.ok, `${label} cleanup failed with HTTP ${response.status}: ${body}`);
    return label;
  }));

  console.log(`[emulator-suite] Cleared ${results.join(" and ")} test data.`);
}

const firestoreSuites = await discoverCompiledFirestoreSuites();
const explicitSuites = await discoverExplicitEmulatorSuites();

assert.equal(firestoreSuites.length, 63, "Firestore suite inventory changed");
assert.equal(explicitSuites.length, 8, "explicit emulator suite inventory changed");

const selectedSuites = fullServicesPhase ? explicitSuites : firestoreSuites;
const phaseLabel = fullServicesPhase ?
  `${explicitSuites.length} explicit full-service emulator suites` :
  `${firestoreSuites.length} Firestore-backed suites`;

console.log(`[emulator-suite] Running ${phaseLabel} serially.`);

let result;
try {
  if (fullServicesPhase) {
    const smokeResult = spawnSync(
      process.execPath,
      ["scripts/firebase-emulator-smoke.mjs"],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: "inherit",
      },
    );
    if (smokeResult.error) {
      throw smokeResult.error;
    }
    if (smokeResult.status !== 0) {
      result = smokeResult;
    }
  }
  if (!result) {
    const suiteGroups = firestoreOnlyPhase ?
      selectedSuites.map((suite) => [suite]) :
      [selectedSuites];
    let firstFailedResult;
    let firestoreAssertionCount = 0;
    for (const suiteGroup of suiteGroups) {
      result = spawnSync(
        process.execPath,
        [
          "--test",
          "--test-concurrency=1",
          ...suiteGroup,
        ],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            FAILURE_RECOVERY_USE_CLOUD_TASKS: "false",
            STRIPE_WEBHOOK_SECRET: "whsec_bwm_010_emulator",
          },
          ...(firestoreOnlyPhase ? {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          } : {stdio: "inherit"}),
        },
      );
      if (result.error) {
        throw result.error;
      }
      if (firestoreOnlyPhase) {
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        if (result.status === 0) {
          const assertionCount = Number(output.match(/# tests (\d+)/u)?.[1] ?? 0);
          firestoreAssertionCount += assertionCount;
          console.log(
            `[emulator-suite] PASS: ${basename(suiteGroup[0])} ` +
              `(${assertionCount} assertions).`,
          );
        } else {
          process.stdout.write(output);
        }
      }
      if (firestoreOnlyPhase) {
        await clearEmulatorData();
      }
      if (result.status !== 0 && !firstFailedResult) {
        firstFailedResult = result;
      }
    }
    if (firestoreOnlyPhase) {
      console.log(
        `[emulator-suite] Firestore phase completed ${selectedSuites.length} ` +
          `files with ${firestoreAssertionCount} passing assertions.`,
      );
    }
    result = firstFailedResult ?? result;
  }
} finally {
  await clearEmulatorData();
}

process.exit(result?.status ?? 1);
