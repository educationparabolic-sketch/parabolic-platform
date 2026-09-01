import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";
const hostingOrigin = "http://127.0.0.1:5000";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[golden-path] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[golden-path] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[golden-path] FAILED ${label} with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

const buildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm025goldenpath",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

for (const [portal, basePath] of [
  ["admin", "/admin/"],
  ["student", "/student/"],
  ["exam", "/exam/"],
]) {
  run(
    `Build live ${portal} artifact`,
    npmExecutable,
    ["--prefix", `apps/${portal}`, "run", "build"],
    { ...buildEnvironment, VITE_BASE_PATH: basePath },
  );
}

run("Build Functions artifact", npmExecutable, ["--prefix", "functions", "run", "build"]);
run("Prepare combined golden-path Hosting artifact", process.execPath, [
  "scripts/prepare-golden-path-hosting.mjs",
]);

const emulatorArgs = [
  "emulators:exec",
  "--config",
  "firebase.golden-path.json",
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions,hosting",
  "npm run test:e2e:golden-path",
];

console.log(
  `\n[golden-path] firebase ${emulatorArgs
    .map((value) => (value.includes(" ") ? JSON.stringify(value) : value))
    .join(" ")}`,
);
run("Run complete no-mock Admin to analytics golden path", firebaseExecutable, emulatorArgs, {
  CI: "true",
  EXAM_BASE_URL: hostingOrigin,
  FUNCTIONS_DISCOVERY_TIMEOUT: "30",
  NODE_ENV: "test",
  PARABOLIC_E2E_BASE_URL: hostingOrigin,
  PROJECT_ID: projectId,
});

console.log(
  "\n[golden-path] PASS: complete Admin, Student, Exam, analytics, " +
    "negative-case, audit, and cleanup proof succeeded.",
);
