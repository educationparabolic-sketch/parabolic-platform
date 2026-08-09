import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";

function run(
  label,
  executable,
  args,
  extraEnvironment = {},
  workingDirectory = repositoryRoot,
) {
  console.log(`\n[bwm-007-failure-e2e] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: workingDirectory,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[bwm-007-failure-e2e] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[bwm-007-failure-e2e] FAILED ${label} with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
};

run("Build live Admin artifact", npmExecutable, ["--prefix", "apps/admin", "run", "build"], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/admin/",
});
run("Build live Student artifact", npmExecutable, ["--prefix", "apps/student", "run", "build"], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/student/",
});
run("Prepare combined portal artifact", process.execPath, [
  "scripts/frontend-cicd/prepare-portal-hosting.mjs",
]);
run("Prepare isolated failure package", process.execPath, [
  "scripts/prepare-bwm-007-failure-verification.mjs",
]);

const verificationRoot = fileURLToPath(
  new URL("../.firebase/bwm-007-failure-verification/", import.meta.url),
);
const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--config",
  "firebase.json",
  "--only",
  "functions,hosting:portal",
  `npm --prefix ${repositoryRoot} run test:e2e:bwm-007-failures`,
];

console.log(
  `\n[bwm-007-failure-e2e] firebase ${emulatorArgs
    .map((value) => (value.includes(" ") ? JSON.stringify(value) : value))
    .join(" ")}`,
);
run(
  "Run isolated Firebase failure E2E",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
    PROJECT_ID: projectId,
  },
  verificationRoot,
);

console.log("\n[bwm-007-failure-e2e] PASS: HTTP 500 and network failure paths verified.");
