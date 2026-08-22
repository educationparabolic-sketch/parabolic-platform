import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";
const questionAssetsBucket = `${projectId}.appspot.com`;
const cdnBaseUrl = "https://assets.bwm-012.example.test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[question-creation] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `[question-creation] Unable to start ${label}: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[question-creation] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_BASE_PATH: "/admin/",
  VITE_CDN_BASE_URL: cdnBaseUrl,
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm012question",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: questionAssetsBucket,
};

run(
  "Build live Admin artifact",
  npmExecutable,
  ["--prefix", "apps/admin", "run", "build"],
  liveBuildEnvironment,
);
run(
  "Build live Student artifact for combined Portal Hosting",
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
  "auth,firestore,functions,hosting:portal,storage",
  "npm run test:e2e:question-creation",
];

console.log(
  `\n[question-creation] firebase ${emulatorArgs
    .map((value) => value.includes(" ") ? JSON.stringify(value) : value)
    .join(" ")}`,
);
run("Run no-mock question creation browser flow", firebaseExecutable, emulatorArgs, {
  CDN_BASE_URL: cdnBaseUrl,
  CDN_SIGNED_URL_KEY_NAME: "bwm-012-test-key",
  CDN_SIGNED_URL_KEY_VALUE: "YnVpbGQtMTItc2lnbmluZy1rZXk",
  CI: "true",
  FUNCTIONS_DISCOVERY_TIMEOUT: "30",
  NODE_ENV: "test",
  PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
  PROJECT_ID: projectId,
  QUESTION_ASSETS_BUCKET: questionAssetsBucket,
  REPORTS_BUCKET: `${projectId}-reports`,
});

console.log(
  "\n[question-creation] PASS: creation, partial retry, safe reload, access rejection, and cleanup verified.",
);
