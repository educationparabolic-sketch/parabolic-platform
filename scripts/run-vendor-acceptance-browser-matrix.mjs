import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {browserStages} from "./vendor-acceptance-matrix.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of ["PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) assert.equal(process.env[name], "demo-parabolic-test", name);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.match(process.env.FIREBASE_EMULATOR_HUB ?? "", /^(?:127\.0\.0\.1|localhost):\d+$/u);
function run(label, command, args) {
  console.log(`[vendor-acceptance-matrix] START ${label}`);
  const child = spawnSync(command, args, {cwd: root, env: {...process.env, NO_GCE_CHECK: "true", METADATA_SERVER_DETECTION: "none"}, stdio: "inherit"});
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Vendor acceptance stage ${label} failed (${child.status ?? child.signal}).`);
  console.log(`[vendor-acceptance-matrix] PASS ${label}`);
}
for (const stage of browserStages) run(stage.id, "npm", ["run", stage.script]);
console.log(`[vendor-acceptance-matrix] PASS ${browserStages.length}/${browserStages.length} browser stages`);
