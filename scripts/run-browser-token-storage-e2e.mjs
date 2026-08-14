import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[browser-token-storage] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[browser-token-storage] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[browser-token-storage] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm009tokenstorage",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

run("Build development-mode Admin artifact", npmExecutable, [
  "--prefix",
  "apps/admin",
  "run",
  "build",
  "--",
  "--mode",
  "development",
], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/admin/",
});
run("Build development-mode Student artifact", npmExecutable, [
  "--prefix",
  "apps/student",
  "run",
  "build",
  "--",
  "--mode",
  "development",
], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/student/",
});
run("Build Functions artifact", npmExecutable, ["--prefix", "functions", "run", "build"]);
run("Prepare combined portal artifact", process.execPath, [
  "scripts/frontend-cicd/prepare-portal-hosting.mjs",
]);

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions,hosting:portal",
  "npm run test:e2e:browser-token-storage",
];

console.log(
  `\n[browser-token-storage] firebase ${emulatorArgs
    .map((value) => (value.includes(" ") ? JSON.stringify(value) : value))
    .join(" ")}`,
);
run("Run browser token-storage proof", firebaseExecutable, emulatorArgs, {
  CI: "true",
  FUNCTIONS_DISCOVERY_TIMEOUT: "30",
  NODE_ENV: "test",
  PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
  PROJECT_ID: projectId,
});

console.log("\n[browser-token-storage] PASS: browser bearer-token copies are absent.");
