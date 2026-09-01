import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ?
  "firebase.cmd" :
  "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[result-propagation] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm024propagation",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

run(
  "Build live Admin artifact",
  npmExecutable,
  ["--prefix", "apps/admin", "run", "build"],
  {...liveBuildEnvironment, VITE_BASE_PATH: "/admin/"},
);
run(
  "Build live Student artifact",
  npmExecutable,
  ["--prefix", "apps/student", "run", "build"],
  {...liveBuildEnvironment, VITE_BASE_PATH: "/student/"},
);
run("Build Functions artifact", npmExecutable, [
  "--prefix",
  "functions",
  "run",
  "build",
]);
run("Prepare combined Portal Hosting artifact", process.execPath, [
  "scripts/frontend-cicd/prepare-portal-hosting.mjs",
]);

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions,hosting:portal",
  "npm run test:e2e:result-propagation",
];

run(
  "Run no-mock submission-to-Student/Admin result propagation flow",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
    PROJECT_ID: projectId,
  },
);

console.log(
  "\n[result-propagation] PASS: one real submission propagated through " +
  "idempotent analytics into live Student and Admin portal summaries.",
);
