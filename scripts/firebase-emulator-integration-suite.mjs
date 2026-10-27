import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {assertBackendEmulators, executeBackendSuite, executeBackendCommand, assertBackendResult} from "./backend-test-process.mjs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { firebaseEmulatorHarness, firebaseIntegrationGroups } from "./firebase-emulator-harness-config.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = resolve(repositoryRoot, "functions");
const expectedProjectId = firebaseEmulatorHarness.projectId;
const fullServicesPhase = process.argv.includes("--full-services");
const firestoreOnlyPhase = process.argv.includes("--firestore-only");
const integrationGroup = process.argv.find((argument) => argument.startsWith("--group="))?.slice(8);
assert.ok(integrationGroup === undefined || fullServicesPhase && Object.hasOwn(firebaseIntegrationGroups, integrationGroup), "Unknown integration suite group");
const emulatorMarkers = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "firebase emulators",
];
const cleanupMaxAttempts = 3;
const cleanupRetryDelayMs = 250;
const transientCleanupCodes = new Set(["UND_ERR_SOCKET", "ECONNRESET"]);

assert.notEqual(
  fullServicesPhase,
  firestoreOnlyPhase,
  "Select exactly one emulator integration phase",
);
assertBackendEmulators(process.env, fullServicesPhase);

async function discoverCompiledFirestoreSuites() {
  const sourceDirectory = resolve(functionsRoot, "src/tests");
  const sourceFiles = (await readdir(sourceDirectory, {recursive: true}))
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
  return (await readdir(externalDirectory, {recursive: true}))
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

  const results = [];
  for (const [label, url] of cleanupRequests) {
    for (let attempt = 1; attempt <= cleanupMaxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "DELETE",
          signal: AbortSignal.timeout(15_000),
        });
        const body = await response.text();
        assert.ok(
          response.ok,
          `${label} cleanup failed with HTTP ${response.status}: ${body}`,
        );
        results.push(label);
        break;
      } catch (error) {
        const errorCode = error?.cause?.code;
        const retryable =
          error instanceof TypeError && transientCleanupCodes.has(errorCode);
        if (!retryable || attempt === cleanupMaxAttempts) {
          throw error;
        }
        console.warn(
          `[emulator-suite] ${label} cleanup transport retry ${attempt} of ` +
            `${cleanupMaxAttempts - 1}.`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, cleanupRetryDelayMs * attempt));
      }
    }
  }

  console.log(`[emulator-suite] Cleared ${results.join(" and ")} test data.`);
}

const firestoreSuites = await discoverCompiledFirestoreSuites();
const explicitSuites = await discoverExplicitEmulatorSuites();

assert.equal(firestoreSuites.length, 99, "Firestore suite inventory changed");
assert.equal(explicitSuites.length, 20, "explicit emulator suite inventory changed");

assert.deepEqual(Object.values(firebaseIntegrationGroups).flat().sort(), explicitSuites.map((suite) => basename(suite)).sort(), "Every explicit suite belongs to exactly one lifecycle group");
const selectedSuites = fullServicesPhase ? explicitSuites.filter((suite) =>
  integrationGroup === undefined || firebaseIntegrationGroups[integrationGroup].includes(basename(suite))) : firestoreSuites;
const phaseLabel = fullServicesPhase ?
  `${selectedSuites.length} explicit full-service emulator suites (${integrationGroup ?? "all"})` :
  `${firestoreSuites.length} Firestore-backed suites`;

console.log(`[emulator-suite] Running ${phaseLabel} serially.`);

const controller = new AbortController();
const interrupt = () => controller.abort();
process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
const receipts = [];
const evidence = process.env.BACKEND_TEST_STAGE_DIRECTORY ?? resolve(repositoryRoot, "test-results/backend-emulator/run");
await mkdir(evidence, {recursive: true});
const save = () => writeFile(resolve(evidence, `${integrationGroup ?? "firestore"}-suites.json`), JSON.stringify(receipts, null, 2));
try {
  if (fullServicesPhase && (integrationGroup === undefined || integrationGroup === "foundation")) {
    const smoke = await executeBackendCommand({root: repositoryRoot, command: process.execPath,
      args: ["scripts/firebase-emulator-smoke.mjs"], env: process.env, signal: controller.signal, timeoutMs: 180_000});
    assertBackendResult(smoke, "Hosting/Auth/Firestore/Storage smoke");
  }
  const suiteGroups = selectedSuites.map((suite) => [suite]);
  for (const [suite] of suiteGroups) {
    await clearEmulatorData();
    try {
      const receipt = await executeBackendSuite(repositoryRoot, suite, {
        ...process.env, FAILURE_RECOVERY_USE_CLOUD_TASKS: "false", STRIPE_WEBHOOK_SECRET: "whsec_bwm_010_emulator",
      }, {signal: controller.signal, timeoutMs: fullServicesPhase ? 15 * 60_000 : 180_000});
      receipts.push({file: suite, result: "PASS", ...receipt}); await save();
      console.log(`[emulator-suite] PASS: ${basename(suite)} (${receipt.passed} assertions).`);
    } catch (error) {
      receipts.push({file: suite, result: "FAIL", failure: error.message}); await save(); throw error;
    } finally {await clearEmulatorData();}
  }
  console.log(`[emulator-suite] ${fullServicesPhase ? "HTTP" : "Firestore"} phase completed ${selectedSuites.length} ` +
    `files with ${receipts.reduce((sum, entry) => sum + entry.passed, 0)} passing assertions; zero skips/TODOs.`);
} finally {
  process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
  await clearEmulatorData();
}
