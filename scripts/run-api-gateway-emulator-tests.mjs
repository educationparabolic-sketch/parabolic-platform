import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ?
  "firebase.cmd" :
  "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[api-gateway] ${label}`);

  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[api-gateway] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      `[api-gateway] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

run(
  "Build Functions artifact",
  npmExecutable,
  ["--prefix", "functions", "run", "build"],
);

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  "functions",
  "node --test functions/tests/apiGateway.emulator.test.js",
];

console.log(
  `\n[api-gateway] firebase ${emulatorArgs.map((value) =>
    value.includes(" ") ? JSON.stringify(value) : value).join(" ")}`,
);
run(
  "Run Functions emulator router tests",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PROJECT_ID: projectId,
  },
);

console.log("\n[api-gateway] PASS: permanent Functions emulator router tests completed.");
