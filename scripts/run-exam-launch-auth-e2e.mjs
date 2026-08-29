import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ?
  "firebase.cmd" :
  "firebase";
const projectId = "demo-parabolic-test";
const hostingOrigin = "http://127.0.0.1:5000";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[exam-launch-auth] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `[exam-launch-auth] Unable to start ${label}: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[exam-launch-auth] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_BASE_PATH: "/",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm018launchauth",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

run(
  "Build live Exam artifact",
  npmExecutable,
  ["--prefix", "apps/exam", "run", "build"],
  liveBuildEnvironment,
);
run("Build Functions artifact", npmExecutable, [
  "--prefix",
  "functions",
  "run",
  "build",
]);

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions,hosting:exam",
  "npm run test:e2e:exam-launch-auth",
];

console.log(
  `\n[exam-launch-auth] firebase ${emulatorArgs
    .map((value) => value.includes(" ") ? JSON.stringify(value) : value)
    .join(" ")}`,
);
run(
  "Run no-mock Student start to authenticated Exam entry browser flow",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    EXAM_BASE_URL: hostingOrigin,
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PARABOLIC_E2E_BASE_URL: hostingOrigin,
    PROJECT_ID: projectId,
  },
);

console.log(
  "\n[exam-launch-auth] PASS: a Student launch credential exchanged into " +
    "session-bound Firebase auth, entered once, disappeared from browser " +
    "history, and failed closed on replay.",
);
