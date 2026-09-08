import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const projectId = "demo-parabolic-test";
const environment = {
  ...process.env,
  CI: "true",
  DEBUG: "",
  FUNCTIONS_DISCOVERY_TIMEOUT: "30",
  NODE_ENV: "test",
  PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  CDN_BASE_URL: "http://127.0.0.1:9180",
  CDN_SIGNED_URL_KEY_NAME: "bwm-026-local-only",
  CDN_SIGNED_URL_KEY_VALUE: Buffer.from("bwm-026-local-test-key").toString("base64url"),
  QUESTION_ASSETS_BUCKET: `${projectId}.appspot.com`,
  REPORTS_BUCKET: `${projectId}-reports`,
  PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm026students",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

function run(command, args, extraEnvironment = {}) {
  console.log(`[admin-student-mutations] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: {...environment, ...extraEnvironment},
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const skipBuild = process.argv.includes("--skip-build");
if (!skipBuild) {
  for (const portal of ["admin", "student"]) {
    run("npm", ["--prefix", `apps/${portal}`, "run", "build"], {
      VITE_BASE_PATH: `/${portal}/`,
    });
  }
  run("npm", ["--prefix", "functions", "run", "build"]);
}
run(process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
run("firebase", ["--version"]);
run("firebase", [
  "emulators:exec", "--project", projectId,
  "--only", "auth,firestore,functions,hosting:portal,storage",
  "npm run test:e2e:admin-student-mutations",
]);
