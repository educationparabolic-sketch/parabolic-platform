import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[emulator-smoke] ${label}`);

  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[emulator-smoke] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[emulator-smoke] FAILED ${label} with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

run(
  "Build Admin Hosting artifact",
  npmExecutable,
  ["--prefix", "apps/admin", "run", "build"],
  {VITE_BASE_PATH: "/admin/"},
);
run(
  "Build Student Hosting artifact",
  npmExecutable,
  ["--prefix", "apps/student", "run", "build"],
  {VITE_BASE_PATH: "/student/"},
);
run(
  "Build Functions artifact",
  npmExecutable,
  ["--prefix", "functions", "run", "build"],
);
run(
  "Prepare combined portal Hosting artifact",
  process.execPath,
  ["scripts/frontend-cicd/prepare-portal-hosting.mjs"],
);

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "firestore,functions,hosting:portal",
  "node scripts/firebase-emulator-smoke.mjs",
];

console.log(
  `\n[emulator-smoke] firebase ${emulatorArgs.map((value) =>
    value.includes(" ") ? JSON.stringify(value) : value).join(" ")}`,
);
run(
  "Run isolated Firebase emulator checks",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PROJECT_ID: projectId,
  },
);

console.log("\n[emulator-smoke] PASS: Functions, Firestore, Hosting, and browser checks completed.");
