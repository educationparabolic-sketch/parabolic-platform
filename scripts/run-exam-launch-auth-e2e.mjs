import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseExecutable = process.platform === "win32" ?
  "firebase.cmd" :
  "firebase";
const proctoringAcceptance = process.argv.includes("--proctoring-acceptance");
const proctoringRuntime = process.argv.includes("--proctoring-runtime");
const mountedOnly = process.argv.includes("--mounted-ownership");
const bootstrapOnly = process.argv.includes("--bootstrap-only");
const securityMatrix = process.argv.includes("--security-matrix");
const returnsOnly = securityMatrix || process.argv.includes("--student-returns");
const scoped = bootstrapOnly || mountedOnly || returnsOnly || proctoringRuntime || proctoringAcceptance;
const projectId = "demo-parabolic-test";
const hostingOrigin = returnsOnly ? "http://127.0.0.1:5005" : "http://127.0.0.1:5000";
const studentOrigin = "http://127.0.0.1:5000";

function run(label, executable, args, extraEnvironment = {}) {
  console.log(`\n[exam-launch-auth] ${label}`);
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: {...process.env, ...extraEnvironment},
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `[exam-launch-auth] Unable to start ${label}: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[exam-launch-auth] FAILED ${label} with exit code ${result.status ?? 1}`,
    );
    process.exit(result.status ?? 1);
  }
}

const liveBuildEnvironment = {
  VITE_CDN_BASE_URL: "https://cdn.exam-local.test.invalid/published",
  VITE_API_BASE_URL: "",
  VITE_BASE_PATH: "/",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  ...(returnsOnly ? {VITE_PORTAL_BASE_URL: studentOrigin} : {}),
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm018launchauth",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

if (returnsOnly) {
  run("Build Portal Admin shell", npmExecutable, ["--prefix", "apps/admin", "run", "build"], {...liveBuildEnvironment, VITE_BASE_PATH: "/admin/"});
  run("Build live Student artifact", npmExecutable, ["--prefix", "apps/student", "run", "build"], {...liveBuildEnvironment, VITE_BASE_PATH: "/student/"});
  run("Assemble existing Portal Hosting target", process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
}
run(
  "Build live Exam artifact",
  npmExecutable,
  ["--prefix", "apps/exam", "run", "build"],
  liveBuildEnvironment,
);
run("Build Functions artifact", npmExecutable, [
  "--prefix",
  "functions",
  "run",
  "build",
]);

if (securityMatrix) {
  // Domain fixtures exercise real transactions without enqueuing unrelated
  // producer triggers. HTTP/browser acceptance starts with fresh emulator data.
  run("Run ownership service/handler transactions", firebaseExecutable, [
    "emulators:exec", "--project", projectId, "--only", "firestore",
    "env GCLOUD_PROJECT=demo-parabolic-test GOOGLE_CLOUD_PROJECT=demo-parabolic-test PROJECT_ID=demo-parabolic-test NODE_ENV=test NO_GCE_CHECK=true METADATA_SERVER_DETECTION=none node --test --test-concurrency=1 functions/lib/tests/examRuntimeOwnership.test.js functions/lib/tests/examSessionEntryApi.test.js functions/lib/tests/examSessionActivateApi.test.js functions/lib/tests/sessionStart.test.js functions/lib/tests/sessionLifecycle.test.js functions/lib/tests/sessionAnswerBatch.test.js functions/lib/tests/sessionSubmission.test.js functions/lib/tests/adminAssignmentOperations.test.js",
  ], {CI: "true", DEBUG: ""});
}

if (proctoringAcceptance) {
  run("Run proctoring policy/receipt/activation/answer/submission transactions", firebaseExecutable, [
    "emulators:exec", "--project", projectId, "--only", "auth,firestore",
    "env GCLOUD_PROJECT=demo-parabolic-test GOOGLE_CLOUD_PROJECT=demo-parabolic-test PROJECT_ID=demo-parabolic-test NODE_ENV=test NO_GCE_CHECK=true METADATA_SERVER_DETECTION=none node --test --test-concurrency=1 functions/lib/tests/examIntegrity.test.js functions/lib/tests/examProctoringPolicy.test.js functions/lib/tests/examIntegrityApi.test.js functions/lib/tests/examSessionActivateApi.test.js functions/lib/tests/sessionLifecycle.test.js functions/lib/tests/sessionStart.test.js functions/lib/tests/sessionAnswerBatch.test.js functions/lib/tests/sessionSubmission.test.js",
  ], {CI: "true", DEBUG: ""});
}

const emulatorArgs = [
  "emulators:exec",
  "--project",
  projectId,
  "--only",
  securityMatrix ? "auth,firestore,storage,functions,hosting:portal,hosting:exam" : returnsOnly ? "auth,firestore,functions,hosting:portal,hosting:exam" : "auth,firestore,functions,hosting:exam",
  proctoringAcceptance ? "env GCLOUD_PROJECT=demo-parabolic-test GOOGLE_CLOUD_PROJECT=demo-parabolic-test PROJECT_ID=demo-parabolic-test NODE_ENV=test NO_GCE_CHECK=true METADATA_SERVER_DETECTION=none node --test functions/tests/examStart.emulator.test.js && npm run test:e2e:exam-proctoring-acceptance" : proctoringRuntime ? "npm run test:e2e:exam-proctoring-runtime" : scoped ? "env GCLOUD_PROJECT=demo-parabolic-test GOOGLE_CLOUD_PROJECT=demo-parabolic-test PROJECT_ID=demo-parabolic-test NODE_ENV=test NO_GCE_CHECK=true METADATA_SERVER_DETECTION=none node --test --test-concurrency=1 " + (securityMatrix ? "functions/tests/examStart.emulator.test.js functions/tests/studentProfileApi.emulator.test.js" : "functions/lib/tests/examStartApi.test.js functions/lib/tests/examRuntimeOwnership.test.js functions/lib/tests/examSessionEntryApi.test.js functions/lib/tests/sessionStart.test.js functions/tests/examStart.emulator.test.js") + " && " + (securityMatrix ? "npm run test:e2e:exam-security" : returnsOnly ? "npm run test:e2e:exam-student-return" : mountedOnly ? "npm run test:e2e:exam-runtime-ownership" : "npm run test:e2e:exam-launch-bootstrap") : "npm run test:e2e:exam-launch-auth",
];

console.log(
  `\n[exam-launch-auth] firebase ${emulatorArgs
    .map((value) => value.includes(" ") ? JSON.stringify(value) : value)
    .join(" ")}`,
);
run(
  "Run no-mock Student start to authenticated Exam entry browser flow",
  firebaseExecutable,
  emulatorArgs,
  {
    CI: "true",
    CDN_BASE_URL: "https://cdn.exam-local.test.invalid/published",
    CDN_SIGNED_URL_KEY_NAME: "bwm-048-local-only",
    CDN_SIGNED_URL_KEY_VALUE: Buffer.from("bwm-048-local-exam-test-key").toString("base64url"),
    ...(scoped ? {DEBUG: ""} : {}),
    EXAM_BASE_URL: hostingOrigin,
    ...(scoped ? {IDENTITY_PHOTOS_BUCKET: `${projectId}-identity-photos`} : {}),
    FUNCTIONS_DISCOVERY_TIMEOUT: scoped ? "120" : "30",
    NODE_ENV: "test",
    PARABOLIC_E2E_BASE_URL: hostingOrigin,
    ...(returnsOnly ? {PARABOLIC_STUDENT_BASE_URL: studentOrigin} : {}),
    PROJECT_ID: projectId,
  },
);

if (returnsOnly) {
  run("Build missing-return configuration artifact", npmExecutable, ["--prefix", "apps/exam", "run", "build"], {...liveBuildEnvironment, VITE_PORTAL_BASE_URL: ""});
  run("Verify missing-return configuration without fallback", firebaseExecutable,
    [...emulatorArgs.slice(0, -1), "npm run test:e2e:exam-student-return:missing"], {
      CI: "true", DEBUG: "", EXAM_BASE_URL: hostingOrigin, PROJECT_ID: projectId, NODE_ENV: "test",
      IDENTITY_PHOTOS_BUCKET: `${projectId}-identity-photos`, FUNCTIONS_DISCOVERY_TIMEOUT: "120",
      PARABOLIC_E2E_BASE_URL: hostingOrigin, PARABOLIC_RETURN_CONFIG_MISSING: "true",
    });
}

console.log(
  proctoringAcceptance ? "\n[exam-proctoring-acceptance] PASS: permanent policy, receipt, authority, camera, privacy and queue service/HTTP/browser acceptance; aggregate and approved public qualification remain substep 8." :
  proctoringRuntime ? "\n[exam-proctoring-runtime] PASS: mounted v1 activation, camera readiness, bounded reporting replay and answer/submission regression; broader acceptance and approved L5 remain pending." :
  securityMatrix ? "\n[exam-security] PASS: focused ownership/security service, HTTP and browser matrix plus missing-return configuration; aggregate and approved L5 remain pending." :
  returnsOnly ? "\n[exam-student-return] PASS: absolute Student Hosting returns and missing-config denial; security aggregate pending." :
  mountedOnly ? "\n[exam-runtime-ownership] PASS: scoped mounted ownership/recovery verification; absolute returns and full security aggregate remain pending." :
  bootstrapOnly ? "\n[exam-launch-bootstrap] PASS: early fragment capture, v2 initial entry and privacy/rejection checks; mounted lease/reload adoption pending." :
  "\n[exam-launch-auth] PASS: a Student launch credential exchanged into " +
    "session-bound Firebase auth, entered once, disappeared from browser " +
    "history, and failed closed on replay.",
);
