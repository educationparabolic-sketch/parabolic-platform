import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const out = resolve(root, "test-results/bwm046-acceptance");
mkdirSync(out, {recursive: true});
const projectId = "demo-parabolic-test";
const examOrigin = "http://127.0.0.1:5005", portalOrigin = "http://127.0.0.1:5000";
const child = process.argv.includes("--child") ? process.argv[process.argv.indexOf("--child") + 1] : null;
const phase = process.argv.includes("--phase") ? process.argv[process.argv.indexOf("--phase") + 1] : "all";
assert.ok(["all", "static", "services", "browser"].includes(phase));
assert.ok(child === null || ["services", "browser"].includes(child));
const commands = [];
const common = {...process.env,
  CDN_BASE_URL: "https://cdn.exam-local.test.invalid/published",
  CDN_SIGNED_URL_KEY_NAME: "bwm-048-local-only",
  CDN_SIGNED_URL_KEY_VALUE: Buffer.from("bwm-048-local-exam-test-key").toString("base64url"), DEBUG: "", CI: "true", NODE_ENV: "test",
  GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId, PROJECT_ID: projectId,
  NO_GCE_CHECK: "true", METADATA_SERVER_DETECTION: "none",
  FUNCTIONS_DISCOVERY_TIMEOUT: "120", IDENTITY_PHOTOS_BUCKET: `${projectId}-identity-photos`,
  EXAM_BASE_URL: examOrigin, PARABOLIC_STUDENT_BASE_URL: ""};
const build = {...common, NODE_ENV: "production", VITE_API_BASE_URL: "", VITE_DATA_MODE: "live", VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_PORTAL_BASE_URL: portalOrigin, VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm018launchauth", VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.invalid`,
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099", VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`};
function run(label, executable, args, env = common) {
  const item = {label, executable, args, startedAt: new Date().toISOString()};
  commands.push(item); writeFileSync(resolve(out, `commands-${child ?? phase}.json`), JSON.stringify(commands, null, 2));
  console.log(`\n[exam-resilience] ${label}`);
  const result = spawnSync(executable, args, {cwd: root, env, stdio: "inherit"});
  item.exit = result.status ?? 1;
  writeFileSync(resolve(out, `commands-${child ?? phase}.json`), JSON.stringify(commands, null, 2));
  if (result.error) throw result.error;
  assert.equal(item.exit, 0, `${label} failed`);
}
const roots = [
  "tests/exam-clock-transport.test.mjs",
  "tests/exam-transport-ownership.test.mjs",
  "tests/exam-answer-recovery.test.mjs",
  "tests/exam-resilience-contract.test.mjs",
  "tests/exam-runtime-auth-contract.test.mjs",
  "tests/exam-runtime-ownership-contract.test.mjs",
  "tests/exam-mounted-ownership.test.mjs",
  "tests/portal-response-adapters.test.mjs",
  "tests/exam-proctoring-runtime.test.mjs",
  "tests/exam-proctoring-contract.test.mjs",
  "tests/exam-launch-bootstrap.test.mjs",
  "tests/exam-student-return.test.mjs",
  "tests/api-auth-scope.test.mjs",
  "tests/frontend-api-routing.test.mjs",
  "tests/frontend-data-states.test.mjs",
  "tests/frontend-production-fallbacks.test.mjs",
  "tests/api-envelope-contract.test.mjs",
  "tests/browser-authority-convergence.test.mjs",
  "tests/per-origin-firebase-auth.test.mjs",
  "tests/production-auth-hardening.test.mjs",
  "tests/browser-token-storage.test.mjs",
  "tests/frontend-data-mode.test.mjs",
  "tests/student-result-recovery.test.mjs",
  "tests/student-summary-v2-adapters.test.mjs",
  "tests/student-entitlement-contract.test.mjs"
];
const services = ["examRuntimeOwnership", "examSessionEntryApi", "examSessionActivateApi", "sessionStart",
  "sessionLifecycle", "sessionAnswerBatch", "sessionSubmission", "studentSummaryService",
  "submissionAnalyticsTrigger", "studentMetricsEngine"].map(name => `functions/lib/tests/${name}.test.js`);
function emulatorIdentity() {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST); assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
}
function filesBelow(folder) {
  return readdirSync(folder, {withFileTypes: true}).flatMap(entry => entry.isDirectory()
    ? filesBelow(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]);
}
function fingerprint() {
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {encoding: "utf8"});
  assert.equal(listed.status, 0);
  const paths = listed.stdout.split("\0").filter(path => path && !path.startsWith("docs/") && !path.endsWith(".md"));
  for (const folder of ["apps/exam/dist", ".firebase/hosting/portal", "functions/lib"]) paths.push(...filesBelow(folder));
  return Object.fromEntries([...new Set(paths)].sort().map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
}
function assertCandidate() {
  const candidate = JSON.parse(readFileSync(resolve(out, "candidate.json"), "utf8"));
  assert.deepEqual(fingerprint(), candidate, "Source/test/served candidate changed; rerun static verification.");
}
if (child === "services") {
  emulatorIdentity();
  run("Real service/handler and propagation matrix", process.execPath, ["--test", "--test-concurrency=1", ...services]);
} else if (child === "browser") {
  emulatorIdentity(); assertCandidate();
  run("Signed HTTP entry, canonical submit and current summaries", process.execPath,
    ["--test", "--test-concurrency=1", "functions/tests/examStart.emulator.test.js", "functions/tests/studentSummary.emulator.test.js"]);
  // Native tab visibility requires headed Chromium. Unattended Linux owners
  // provide a real virtual display rather than substituting visibility state.
  const playwright = resolve(root, "node_modules/.bin/playwright");
  const browserArgs = ["test", "tests/e2e/exam-launch-auth.spec.mjs", "--grep", "fragment bootstrap|mounted ownership|security matrix|resilience ", "--project=chromium"];
  run("Permanent Exam browser matrix", process.env.DISPLAY ? playwright : "xvfb-run",
    process.env.DISPLAY ? browserArgs : ["--auto-servernum", playwright, ...browserArgs],
    {...common, PARABOLIC_E2E_BASE_URL: examOrigin});
  const summaryArgs = ["test", "tests/e2e/student-summary-contract.spec.mjs", "--project=chromium"];
  run("Permanent Student result/entitlement browser matrix", process.env.DISPLAY ? playwright : "xvfb-run",
    process.env.DISPLAY ? summaryArgs : ["--auto-servernum", playwright, ...summaryArgs],
    {...common, PARABOLIC_E2E_BASE_URL: portalOrigin});
  assertCandidate();
} else {
  if (phase === "all" || phase === "static") {
    for (const path of ["apps/exam", "apps/student", "functions"]) {
      const base = path === "apps/student" ? "/student/" : "/";
      for (const action of ["lint", "build"]) run(`${path} ${action}`, "npm", ["--prefix", path, "run", action], {...build, VITE_BASE_PATH: base});
    }
    run("Build companion Admin shell for existing Portal target", "npm", ["--prefix", "apps/admin", "run", "build"], {...build, VITE_BASE_PATH: "/admin/"});
    run("Prepare existing Portal Hosting artifact", process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
    for (const file of ["tests/e2e/exam-launch-auth.spec.mjs", "tests/e2e/student-summary-contract.spec.mjs", "tests/e2e/native-visibility.mjs"]) run(`Syntax ${file}`, process.execPath, ["--check", file]);
    for (const file of roots) run(`Root ${file}`, process.execPath, [file]);
    writeFileSync(resolve(out, "candidate.json"), JSON.stringify(fingerprint(), null, 2));
  } else assertCandidate();
  run("Firebase CLI version", "firebase", ["--version"]);
  const selected = phase === "all" ? ["services", "browser"] : phase === "static" ? [] : [phase];
  for (const target of selected) {
    const only = target === "services" ? "auth,firestore" : "auth,firestore,functions,hosting:portal,hosting:exam";
    console.log(`[exam-resilience] project=${projectId}; only=${only}; no cloud deployment`);
    run(`Firebase ${target}`, "firebase", ["emulators:exec", "--project", projectId, "--only", only,
      `node scripts/run-exam-resilience-acceptance.mjs --child ${target}`]);
    assertCandidate();
  }
  writeFileSync(resolve(out, `result-${phase}.json`), JSON.stringify({status: "PASS", phase, executed: commands.length,
    projectId, candidateUnchanged: true, rootFiles: roots.length, completedAt: new Date().toISOString()}, null, 2));
  console.log(`[exam-resilience] PASS ${phase}; candidate unchanged; production NO_GO`);
}
