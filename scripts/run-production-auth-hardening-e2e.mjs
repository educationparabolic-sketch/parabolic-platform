import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[production-auth-hardening] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[production-auth-hardening] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[production-auth-hardening] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const productionBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm009authhardening",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

for (const [portal, basePath] of [
  ["admin", "/admin/"],
  ["student", "/student/"],
  ["vendor", "/"],
]) {
  run(`Build ${portal} production artifact`, npmExecutable, [
    "--prefix",
    `apps/${portal}`,
    "run",
    "build",
  ], {
    ...productionBuildEnvironment,
    VITE_BASE_PATH: basePath,
  });
}

run("Prepare combined portal artifact", process.execPath, [
  "scripts/frontend-cicd/prepare-portal-hosting.mjs",
]);

for (const target of ["portal", "vendor"]) {
  const emulatorArgs = [
    "emulators:exec",
    "--project",
    projectId,
    "--only",
    `auth,hosting:${target}`,
    "npm run test:e2e:production-auth-hardening",
  ];
  run(`Run ${target} production fallback denial`, firebaseExecutable, emulatorArgs, {
    CI: "true",
    NODE_ENV: "test",
    PARABOLIC_AUTH_HARDENING_TARGET: target,
    PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
    PROJECT_ID: projectId,
  });
}

console.log(
  "\n[production-auth-hardening] PASS: production loopback bundles reject development fallback credentials.",
);
