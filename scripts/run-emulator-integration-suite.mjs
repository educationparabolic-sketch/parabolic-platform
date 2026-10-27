import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import assert from "node:assert/strict";
import {executeBackendCommand, assertBackendResult} from "./backend-test-process.mjs";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

import { firebaseEmulatorHarness, firebaseIntegrationGroups } from "./firebase-emulator-harness-config.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const failureProbe = process.argv.includes("--failure-cleanup-probe");
const projectId = firebaseEmulatorHarness.projectId;
const supportPorts = [4400, 4500, 9150, 9299, 9499];
const allPorts = [
  ...Object.values(firebaseEmulatorHarness.ports),
  ...supportPorts,
];

const controller = new AbortController();
const interrupt = () => controller.abort();
process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
process.on("exit", () => {process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);});
async function runBuild(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[emulator-suite] ${label}`);
  const result = await executeBackendCommand({root: repositoryRoot, command: executable, args,
    env: {...process.env, ...extraEnvironment}, signal: controller.signal, timeoutMs: 10 * 60_000});
  assertBackendResult(result, label);
}

function phaseEnvironment(extraEnvironment = {}) {
  const environment = {
    ...process.env,
    CI: "true",
    DEBUG: "",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PROJECT_ID: projectId,
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
    NO_GCE_CHECK: "true",
    METADATA_SERVER_DETECTION: "none",
    // Explicit disposable test key shared by Functions workers in this phase.
    VENDOR_AUDIT_CURSOR_KEY: randomBytes(32).toString("base64url"),
    CDN_BASE_URL: "https://cdn.emulator.test.invalid/published",
    CDN_SIGNED_URL_KEY_NAME: "bwm-048-local-only",
    CDN_SIGNED_URL_KEY_VALUE: randomBytes(32).toString("base64url"),
    ...extraEnvironment,
  };
  for (const key of Object.keys(environment)) {
    if (/EMULATOR_(HOST|HUB)$/u.test(key) && !(key in extraEnvironment)) delete environment[key];
  }
  delete environment.GOOGLE_APPLICATION_CREDENTIALS;
  delete environment.FIREBASE_TOKEN;
  delete environment.NODE_TEST_CONTEXT;
  for (const key of ["PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (environment[key] !== projectId) throw new Error("Non-demo emulator project override rejected");
  }
  return environment;
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", closed);
    socket.once("timeout", closed);
  });
}

async function assertPortsReleased() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const states = await Promise.all(allPorts.map(portIsOpen));
    if (states.every((open) => !open)) {
      console.log("[emulator-suite] All emulator and support ports released.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const states = await Promise.all(allPorts.map(portIsOpen));
  const remaining = allPorts.filter((_, index) => states[index]);
  throw new Error(`Emulator listeners remain on ports: ${remaining.join(", ")}`);
}

const versionDirectory = await mkdtemp(join(tmpdir(), "backend-firebase-version-"));
let firebaseCliVersion;
try {
  const log = join(versionDirectory, "version.log");
  const version = await executeBackendCommand({root: repositoryRoot, command: firebaseExecutable,
    args: ["--version"], log, signal: controller.signal, timeoutMs: 30_000});
  assertBackendResult(version, "Firebase CLI version");
  firebaseCliVersion = (await readFile(log, "utf8")).trim();
} finally {await rm(versionDirectory, {recursive: true, force: true});}
assert.equal(firebaseCliVersion, firebaseEmulatorHarness.firebaseCliVersion, "Firebase CLI version changed");
console.log(`[emulator-suite] Firebase CLI ${firebaseCliVersion}`);

if (!failureProbe) {
  await runBuild(
    "Build Admin Hosting artifact",
    npmExecutable,
    ["--prefix", "apps/admin", "run", "build"],
    { VITE_API_BASE_URL: "", VITE_BASE_PATH: "/admin/" },
  );
  await runBuild(
    "Build Student Hosting artifact",
    npmExecutable,
    ["--prefix", "apps/student", "run", "build"],
    { VITE_API_BASE_URL: "", VITE_BASE_PATH: "/student/" },
  );
  await runBuild(
    "Build Functions artifact",
    npmExecutable,
    ["--prefix", "functions", "run", "build"],
  );
  await runBuild(
    "Prepare combined portal Hosting artifact",
    process.execPath,
    ["scripts/frontend-cicd/prepare-portal-hosting.mjs"],
  );
}

async function runEmulatorPhase(label, services, innerCommand, environment = {}) {
  const emulatorArgs = [
    "emulators:exec",
    "--project",
    projectId,
    "--only",
    services.join(","),
    innerCommand,
  ];

  console.log(`\n[emulator-suite] ${label}`);
  console.log(
    `[emulator-suite] firebase ${emulatorArgs.map((value) =>
      value.includes(" ") ? JSON.stringify(value) : value).join(" ")}`,
  );

  const result = await executeBackendCommand({root: repositoryRoot, command: firebaseExecutable,
    args: emulatorArgs, env: phaseEnvironment(environment), signal: controller.signal, timeoutMs: 45 * 60_000});
  await assertPortsReleased();
  if (result.timedOut || result.aborted || result.descendants) throw new Error("Emulator phase interrupted or not cleaned");
  return result;
}

if (failureProbe) {
  const temporary = await mkdtemp(join(tmpdir(), "backend-failure-cleanup-"));
  try {
    const receiptPath = join(temporary, "verified.json");
    const result = await runEmulatorPhase("Intentional failure cleanup proof", ["auth", "firestore"],
      "node functions/tests/emulatorFailureCleanup.probe.js", {BACKEND_FAILURE_CLEANUP_RECEIPT: receiptPath});
    assert.equal(result.code, 23, "Only the verified deliberate exit 23 qualifies cleanup");
    assert.deepEqual(JSON.parse(await readFile(receiptPath, "utf8")),
      {project: projectId, dataRemoved: true, intentionalExit: 23});
    console.log("[emulator-suite] PASS: intentional failure cleaned data and released processes.");
  } finally {await rm(temporary, {recursive: true, force: true});}
  process.exit(0);
}

for (const group of Object.keys(firebaseIntegrationGroups)) {
  const fullServicesResult = await runEmulatorPhase(
    `Full-service integration group: ${group}`,
    firebaseEmulatorHarness.services,
    `node scripts/firebase-emulator-integration-suite.mjs --full-services --group=${group}`,
    {
      FUNCTIONS_DISCOVERY_TIMEOUT: "120",
      IDENTITY_PHOTOS_BUCKET: `${projectId}-identity-photos`,
      FUNCTIONS_EMULATOR_HOST:
        `127.0.0.1:${firebaseEmulatorHarness.ports.functions}`,
    },
  );
  if (fullServicesResult.code !== 0) {
    process.exit(fullServicesResult.code ?? 1);
  }
}

const firestoreResult = await runEmulatorPhase(
  "Firestore/Storage-backed Functions integration suites",
  ["auth", "firestore", "storage"],
  "node scripts/firebase-emulator-integration-suite.mjs --firestore-only",
  {QUESTION_ASSETS_BUCKET: `${projectId}.appspot.com`},
);
if (firestoreResult.code !== 0) {
  process.exit(firestoreResult.code ?? 1);
}

console.log(
  "[emulator-suite] PASS: all accumulated backend emulator suites completed.",
);
