import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";

const run = (command, args, env) => {
  const result = spawnSync(command, args, {env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (!process.argv.includes("--skip-functions-build")) {
  run("npm", ["--prefix", "functions", "run", "build"], process.env);
}
run("firebase", ["--version"], process.env);
run("firebase", ["emulators:exec", "--project", "demo-parabolic-test", "--only", "auth,firestore,functions",
  "node --test --test-concurrency=1 " + (process.argv.includes("--capability-alignment") ? "functions/tests/vendorCapabilityAlignment.emulator.test.js functions/tests/vendorInstitutesApi.emulator.test.js functions/tests/vendorCommercialApi.emulator.test.js " : "") + "functions/tests/vendorAuditHealthApi.emulator.test.js functions/tests/apiGateway.emulator.test.js"], {
  ...process.env, DEBUG: "", FUNCTIONS_DISCOVERY_TIMEOUT: "30", CI: "true", NODE_ENV: "test",
  PROJECT_ID: "demo-parabolic-test", GCLOUD_PROJECT: "demo-parabolic-test", GOOGLE_CLOUD_PROJECT: "demo-parabolic-test",
  NO_GCE_CHECK: "true", METADATA_SERVER_DETECTION: "none",
  // Per-run fixture key stays stable across emulator workers, never logged or persisted.
  VENDOR_AUDIT_CURSOR_KEY: randomBytes(32).toString("base64url"),
});
