import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectId = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
assert.equal(process.env.PROJECT_ID, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.ok(process.env.FIREBASE_EMULATOR_HUB, "Run only under Firebase emulators:exec.");
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const suites = [
  "billingSnapshot", "usageMetering", "paymentEventIntegration",
  "vendorIntelligenceRollup", "vendorIntelligence", "vendorRevenueAnalytics",
  "vendorLayerDistribution", "vendorChurnTracking", "vendorRevenueForecasting",
];
// The rollup deliberately enumerates the whole institute portfolio. Each proof
// must have an empty disposable database, not another suite's legacy tenants.
const reset = async () => {
  const response = await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE", signal: AbortSignal.timeout(30_000) },
  );
  assert.equal(response.status, 200, "Disposable demo emulator reset failed.");
};
try {
  for (const suite of suites) {
    await reset();
    console.log(`[vendor-intelligence-regressions] ${suite}`);
    const result = spawnSync(process.execPath, ["--test", `functions/lib/tests/${suite}.test.js`], {
      cwd: repositoryRoot, env: process.env, stdio: "inherit", timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${suite} failed; remaining suites were not run.`);
  }
  console.log(`[vendor-intelligence-regressions] Passed ${suites.length}/${suites.length} isolated suites.`);
} finally {
  await reset();
}
