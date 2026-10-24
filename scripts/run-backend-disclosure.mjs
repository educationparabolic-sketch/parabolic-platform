import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
const root = resolve(import.meta.dirname, ".."), out = resolve(root, process.env.SECURITY_EVIDENCE_DIRECTORY ?? "test-results/bwm047-redaction");
mkdirSync(out, {recursive: true});
const projectId = "demo-parabolic-test";
const env = {...process.env, APP_CHECK_MODE: "pending_provisioning", APP_CHECK_ALLOWED_APP_IDS: "1:123:web:approved", DEBUG: "", CI: "true", NODE_ENV: "test", PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId, NO_GCE_CHECK: "true", METADATA_SERVER_DETECTION: "none",
  FUNCTIONS_DISCOVERY_TIMEOUT: "120"};
const build = process.argv.includes("--skip-build") ? {status: 0} : spawnSync("npm", ["--prefix", "functions", "run", "build"], {cwd: root, env, stdio: "inherit"});
assert.equal(build.status, 0, "Functions build failed");
const units = spawnSync(process.execPath, ["tests/backend-disclosure.test.mjs"], {cwd: root, env, stdio: "inherit"});
assert.equal(units.status, 0, "Focused disclosure tests failed");
const cli = spawnSync("firebase", ["--version"], {cwd: root, env, encoding: "utf8"});
assert.equal(cli.status, 0); console.log(`[backend-disclosure] Firebase CLI ${cli.stdout.trim()}; project ${projectId}; local Auth/Firestore/Functions only; sequential shared-worker disclosure proof, not timeout/concurrency proof`);
const configPath = resolve(root, `.firebase-bwm047-redaction-${process.pid}.json`);
const config = JSON.parse(readFileSync(resolve(root, "firebase.json"), "utf8")); delete config.hosting;
writeFileSync(configPath, JSON.stringify(config, null, 2), {flag: "wx"});
const command = "node --test tests/security/backend-disclosure.emulator.cjs";
const args = ["emulators:exec", "--project", projectId, "--config", configPath, "--only", "auth,firestore,functions", "--inspect-functions=9231", command];
console.log(`[backend-disclosure] firebase ${args.join(" ")}`);
let output = "";
writeFileSync(resolve(out, "emulator-output.log"), "");
try {
  const child = spawn("firebase", args, {cwd: root, env, stdio: ["ignore", "pipe", "pipe"]});
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {const text = chunk.toString(); output += text; appendFileSync(resolve(out, "emulator-output.log"), text);});
  const result = await new Promise((resolve, reject) => {child.on("error", reject); child.on("close", resolve);});
  writeFileSync(resolve(out, "emulator-output.log"), output);
  assert.equal(result, 0, "Local disclosure integration failed; see emulator-output.log");
  const entries = [];
  for (const line of output.split("\n")) {
    const match = /^>\s+(\{.*\})\s*$/u.exec(line.trim()); if (!match) continue;
    try { const entry = JSON.parse(match[1]); if (entry.service || entry["@type"]) entries.push(entry); } catch { /* Non-JSON CLI text is not application sink output. */ }
  }
  assert.ok(entries.length > 0, "No actual application log entries were captured");
  assert.ok(entries.some(entry => entry["@type"]?.endsWith("ReportedErrorEvent")), "No actual Error Reporting event was captured");
  assert.equal(JSON.stringify(entries).includes("bwm047_PRIVATE_83e4c7b7d01b43ca"), false, "Synthetic sentinel reached an application sink");
  const receipt = {result: "PASS", projectId, cliVersion: cli.stdout.trim(), cases: 6, capturedEntries: entries.length,
    errorReports: entries.filter(entry => entry["@type"]).length, sentinelDisclosures: 0, scope: "Actual local shared-worker SDK/application sink entries; no timeout/concurrency/cloud logging transport claim"};
  writeFileSync(resolve(out, "emulator-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally { unlinkSync(configPath); }
