import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

import { firebaseEmulatorHarness } from "./firebase-emulator-harness-config.mjs";

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

function runBuild(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[emulator-suite] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
    ...extraEnvironment,
  };
  if (!("FUNCTIONS_EMULATOR_HOST" in extraEnvironment)) {
    delete environment.FUNCTIONS_EMULATOR_HOST;
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

const version = spawnSync(firebaseExecutable, ["--version"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (version.error) {
  throw version.error;
}
if (version.status !== 0) {
  process.stderr.write(version.stderr);
  process.exit(version.status ?? 1);
}
const firebaseCliVersion = version.stdout.trim();
if (firebaseCliVersion !== firebaseEmulatorHarness.firebaseCliVersion) {
  throw new Error(
    `Expected Firebase CLI ${firebaseEmulatorHarness.firebaseCliVersion}, ` +
      `received ${firebaseCliVersion || "no version"}.`,
  );
}
console.log(`[emulator-suite] Firebase CLI ${firebaseCliVersion}`);

if (!failureProbe) {
  runBuild(
    "Build Admin Hosting artifact",
    npmExecutable,
    ["--prefix", "apps/admin", "run", "build"],
    { VITE_API_BASE_URL: "", VITE_BASE_PATH: "/admin/" },
  );
  runBuild(
    "Build Student Hosting artifact",
    npmExecutable,
    ["--prefix", "apps/student", "run", "build"],
    { VITE_API_BASE_URL: "", VITE_BASE_PATH: "/student/" },
  );
  runBuild(
    "Build Functions artifact",
    npmExecutable,
    ["--prefix", "functions", "run", "build"],
  );
  runBuild(
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

  const result = spawnSync(firebaseExecutable, emulatorArgs, {
    cwd: repositoryRoot,
    env: phaseEnvironment(environment),
    stdio: "inherit",
  });

  await assertPortsReleased();
  if (result.error) {
    throw result.error;
  }
  return result;
}

if (failureProbe) {
  const result = await runEmulatorPhase(
    "Intentional failure cleanup proof",
    ["auth", "firestore"],
    "node functions/tests/emulatorFailureCleanup.probe.js",
  );
  if (result.status === 0) {
    throw new Error("Intentional failure probe unexpectedly exited successfully.");
  }
  console.log(
    "[emulator-suite] PASS: intentional failure cleaned data and released processes.",
  );
  process.exit(0);
}

const fullServicesResult = await runEmulatorPhase(
  "Full-service smoke and explicit integration suites",
  firebaseEmulatorHarness.services,
  "node scripts/firebase-emulator-integration-suite.mjs --full-services",
  {
    FUNCTIONS_EMULATOR_HOST:
      `127.0.0.1:${firebaseEmulatorHarness.ports.functions}`,
  },
);
if (fullServicesResult.status !== 0) {
  process.exit(fullServicesResult.status ?? 1);
}

const firestoreResult = await runEmulatorPhase(
  "Firestore-backed Functions integration suites",
  ["firestore"],
  "node scripts/firebase-emulator-integration-suite.mjs --firestore-only",
);
if (firestoreResult.status !== 0) {
  process.exit(firestoreResult.status ?? 1);
}

console.log(
  "[emulator-suite] PASS: all accumulated backend emulator suites completed.",
);
