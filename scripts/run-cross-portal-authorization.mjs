import {randomBytes} from "node:crypto";
import {securityHostingConfig} from "./frontend-cicd/prepare-security-hosting.mjs";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, readFileSync, unlinkSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const projectId = "demo-parabolic-test", out = resolve(root, process.env.SECURITY_EVIDENCE_DIRECTORY ?? (process.argv.includes("--admission") ? "test-results/bwm047-admission/compatibility" : process.argv.includes("headers") ? "test-results/bwm047-headers" : "test-results/bwm047-authorization"));
mkdirSync(out, {recursive: true});
const phase = process.argv.includes("--phase") ? process.argv[process.argv.indexOf("--phase") + 1] : "all";
const child = process.argv.includes("--child");
assert.ok(["all", "services", "browser", "guards", "headers"].includes(phase));
const common = {...process.env,
  CDN_BASE_URL: "https://cdn.exam-local.test.invalid/published",
  CDN_SIGNED_URL_KEY_NAME: "bwm-048-local-only",
  CDN_SIGNED_URL_KEY_VALUE: Buffer.from("bwm-048-local-exam-test-key").toString("base64url"), VENDOR_AUDIT_CURSOR_KEY: child ? process.env.VENDOR_AUDIT_CURSOR_KEY : randomBytes(32).toString("base64url"), APP_CHECK_MODE: "pending_provisioning", APP_CHECK_ALLOWED_APP_IDS: "1:123456789:web:bwm047security", DEBUG: "", CI: "true", NODE_ENV: "test", PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId, NO_GCE_CHECK: "true", METADATA_SERVER_DETECTION: "none",
  FUNCTIONS_DISCOVERY_TIMEOUT: "120", IDENTITY_PHOTOS_BUCKET: `${projectId}-identity-photos`,
  PARABOLIC_SECURITY_PORTAL_ORIGIN: "http://127.0.0.1:5000", PARABOLIC_SECURITY_VENDOR_ORIGIN: "http://127.0.0.1:5006",
  PARABOLIC_SECURITY_CSP_ENFORCED: "1", PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5005",
  PARABOLIC_STUDENT_BASE_URL: "http://127.0.0.1:5000", EXAM_BASE_URL: "http://127.0.0.1:5005"};
function run(label, cmd, args, env = common) {
  console.log(`[cross-portal-security] ${label}`);
  const result = spawnSync(cmd, args, {cwd: root, env, stdio: "inherit"});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${label} failed`);
}
if (child) {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.ok(process.env.FIREBASE_EMULATOR_HUB);
  if (phase === "guards") run("Sequential real HTTP authorization matrix (not concurrency/timeout proof)", process.execPath,
    ["--test", "tests/security/cross-portal-authorization.emulator.cjs"]);
  if (phase === "services") run("Normal-execution affected regressions", process.execPath,
    ["--test", "--test-concurrency=1", "functions/tests/apiGateway.emulator.test.js", "functions/tests/examStart.emulator.test.js",
      "functions/tests/studentProfileApi.emulator.test.js", "functions/tests/vendorCalibrationApi.emulator.test.js", "functions/tests/vendorAuditHealthApi.emulator.test.js"]);
  if (phase === "headers") {
    run("Real Hosting/API cache and CSP/camera/signed-asset matrix", process.execPath, ["scripts/run-hosting-security-browser.mjs"]);
  }
  if (["browser", "headers"].includes(phase)) {
    run("CSP-enforced native cross-tab SDK persistence", "npx",
      ["--no-install", "playwright", "test", "tests/e2e/cross-portal-authorization.spec.mjs", "--project=chromium"]);
    run("CSP-enforced preserved Exam fragment and revocation flow", "npx",
      ["--no-install", "playwright", "test", "tests/e2e/exam-launch-auth.spec.mjs", "--project=chromium",
        "--grep", process.env.SECURITY_MATRIX_RUN === "1" ? "fragment bootstrap|mounted ownership revocation|mounted ownership fences" : "fragment bootstrap|mounted ownership revocation"]);
  }
} else {
  if (!process.argv.includes("--skip-functions-build")) run("Build Functions", "npm", ["--prefix", "functions", "run", "build"]);
  if (["all", "browser", "headers"].includes(phase) && !process.argv.includes("--skip-frontend-build")) {
    const build = {...common, VITE_APP_CHECK_MODE: "pending_provisioning", NODE_ENV: "production", VITE_CDN_BASE_URL: "https://cdn.security.test.invalid/published", VITE_API_BASE_URL: "", VITE_DATA_MODE: "live",
      VITE_EXAM_DEV_MOCK_ENTRY: "false", VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_APP_ID: "1:123456789:web:bwm047security", VITE_PORTAL_BASE_URL: "http://127.0.0.1:5000", VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.invalid`,
      VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099", VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789"};
    for (const portal of ["admin", "student", "exam", "vendor"]) run(`Build ${portal}`, "npm", ["--prefix", `apps/${portal}`, "run", "build"],
      {...build, VITE_BASE_PATH: ["exam", "vendor"].includes(portal) ? "/" : `/${portal}/`});
    run("Prepare Portal", process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
  }
  let config = JSON.parse(readFileSync(resolve(root, "firebase.json"), "utf8"));
  if (phase === "headers") {
    config = await securityHostingConfig({rootDirectory: root, config, environment: {
      VITE_CDN_BASE_URL: "https://cdn.security.test.invalid/published", CDN_BASE_URL: "https://cdn.security.test.invalid/published"}});
  }
  config.hosting = config.hosting.map(item => {
    const site = `demo-parabolic-test-${item.target}`;
    const copy = {...item, site, public: item.public}; delete copy.target;
    // Explicit isolated loopback test policy. Browser CSP stays enforced; no release header is modified.
    for (const row of copy.headers) for (const header of row.headers) if (header.key === "Content-Security-Policy") {
      header.value = header.value.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9099");
    }
    return copy;
  });
  const configPath = resolve(root, `.firebase-bwm047-authorization-${process.pid}.json`);
  writeFileSync(resolve(out, "firebase.json"), JSON.stringify(config, null, 2));
  writeFileSync(configPath, JSON.stringify(config, null, 2), {flag: "wx"});
  console.log(`[cross-portal-security] Firebase project ${projectId}; CLI local emulator execution only`);

  const phases = phase === "all" ? ["guards", "services", "browser"] : phase === "services" ? process.argv.includes("--skip-guards") ? ["services"] : ["guards", "services"] : [phase];
  try {
    run("Firebase CLI version", "firebase", ["--version"]);
    for (const selected of phases) {
      const services = "auth,firestore,functions,storage" + (["browser", "headers"].includes(selected) ? ",hosting" : "");
      const command = `node scripts/run-cross-portal-authorization.mjs --child --phase ${selected}`;
      // CLI 15.9's supported inspector mode shares one worker for this sequential authorization matrix only.
      // Normal-mode regression/browser phases retain runtime timeouts and ordinary worker concurrency.
      const inspect = selected === "guards" ? ["--inspect-functions=9231"] : [];
      run(`Execute isolated ${selected}`, "firebase", ["emulators:exec", "--project", projectId, "--config", configPath,
        "--only", services, ...inspect, command]);
    }
  } finally {
    unlinkSync(configPath);
  }
}
