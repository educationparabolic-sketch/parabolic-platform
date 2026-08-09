import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ? "firebase.cmd" : "firebase";
const projectId = "demo-parabolic-test";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[student-vendor-role-guards] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[student-vendor-role-guards] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[student-vendor-role-guards] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_API_BASE_URL: "",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm008roleguards",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

run("Build live Admin artifact", npmExecutable, ["--prefix", "apps/admin", "run", "build"], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/admin/",
});
run("Build live Student artifact", npmExecutable, ["--prefix", "apps/student", "run", "build"], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/student/",
});
run("Build live Vendor artifact", npmExecutable, ["--prefix", "apps/vendor", "run", "build"], {
  ...liveBuildEnvironment,
  VITE_BASE_PATH: "/",
});
run("Build Functions artifact", npmExecutable, ["--prefix", "functions", "run", "build"]);
run("Prepare combined portal artifact", process.execPath, [
  "scripts/frontend-cicd/prepare-portal-hosting.mjs",
]);

for (const portal of ["student", "vendor"]) {
  const hostingTarget = portal === "student" ? "portal" : "vendor";
  const emulatorArgs = [
    "emulators:exec",
    "--project",
    projectId,
    "--only",
    `auth,firestore,functions,hosting:${hostingTarget}`,
    "npm run test:e2e:student-vendor-role-guards",
  ];
  console.log(
    `\n[student-vendor-role-guards] firebase ${emulatorArgs
      .map((value) => (value.includes(" ") ? JSON.stringify(value) : value))
      .join(" ")}`,
  );
  run(`Run ${portal} role-guard browser flow`, firebaseExecutable, emulatorArgs, {
    CI: "true",
    FUNCTIONS_DISCOVERY_TIMEOUT: "30",
    NODE_ENV: "test",
    PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
    PARABOLIC_ROLE_GUARD_PORTAL: portal,
    PROJECT_ID: projectId,
  });
}

console.log(
  "\n[student-vendor-role-guards] PASS: frontend role UX and server enforcement verified.",
);
