import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const projectId = "demo-parabolic-test";
const portalOrigin = "http://127.0.0.1:5000";
const examOrigin = "http://127.0.0.1:5005";
const environment = {
  ...process.env,
  CI: "true",
  DEBUG: "",
  EXAM_BASE_URL: examOrigin,
  FUNCTIONS_DISCOVERY_TIMEOUT: "30",
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  NODE_ENV: "test",
  PARABOLIC_E2E_BASE_URL: portalOrigin,
  PARABOLIC_EXAM_E2E_ORIGIN: examOrigin,
  PROJECT_ID: projectId,
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_BASE_URL: examOrigin,
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm036propagation",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

function run(command, args, extraEnvironment = {}) {
  console.log(`[claim-propagation-browser] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: {...environment, ...extraEnvironment},
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!process.argv.includes("--skip-build")) {
  run("npm", ["--prefix", "apps/admin", "run", "build"], {
    NODE_ENV: "production",
    VITE_BASE_PATH: "/admin/",
  });
  run("npm", ["--prefix", "apps/student", "run", "build"], {
    NODE_ENV: "production",
    VITE_BASE_PATH: "/student/",
  });
  run("npm", ["--prefix", "apps/exam", "run", "build"], {
    NODE_ENV: "production",
    VITE_BASE_PATH: "/",
  });
  run("npm", ["--prefix", "functions", "run", "build"]);
  run(process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
}

run("firebase", ["--version"]);
run("firebase", [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions,hosting:portal,hosting:exam",
  "npm run test:e2e:claim-propagation-browser",
]);
