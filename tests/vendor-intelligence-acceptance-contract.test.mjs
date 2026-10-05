import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("intelligence acceptance remains isolated, production-built, authenticated, and unmocked", async () => {
  const source = await read("tests/e2e/vendor-intelligence-acceptance.spec.mjs");
  const runner = await read("scripts/run-vendor-intelligence-smoke-e2e.mjs");
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["test:vendor-intelligence-acceptance:e2e"], "node scripts/run-vendor-intelligence-smoke-e2e.mjs --acceptance");
  assert.match(scripts["test:e2e:vendor-intelligence-acceptance"], /playwright test tests\/e2e\/vendor-intelligence-acceptance.spec.mjs/u);
  for (const required of ["--acceptance", "test:e2e:vendor-intelligence-acceptance", "mkdtempSync", 'NODE_ENV: "production"', "demo-parabolic-test", "auth,firestore,functions:apiV1,hosting:vendor", "Production intelligence build contains a fixture showcase chunk"]) assert.ok(runner.includes(required), required);
  assert.doesNotMatch(source, /route\.fulfill|localStorage\.setItem|sessionStorage\.setItem|storageState:/u);
  for (const required of ["seedVendorIntelligenceReadFixtures", "resetVendorIntelligenceReadFixtures", "createUser", "setCustomUserClaims", "getByLabel(\"Password\"", "page.reload", "browser.newContext", "windowMonths=12", "Complete intelligence authority", "Stale intelligence authority", "Intelligence validation failed", "Permission required", "Intelligence authority unavailable", "No complete intelligence snapshots available", "failed_retryable", 'role: "admin"', "disabled", "revoked", "revokeRefreshTokens", "DO_NOT_EXPOSE_STUDENT", "SECRET_SESSION", "privateStudent, privateSession", "expect(raw).toBe(403)", "Object.keys(localStorage)", "expect(externalRequests).toEqual([])", "auth.deleteUser", "db.recursiveDelete"]) assert.ok(source.includes(required), required);
});

test("exact aggregate and failure assertions cover all five live routes", async () => {
  const source = await read("tests/e2e/vendor-intelligence-acceptance.spec.mjs");
  for (const route of ["readiness", "revenue", "layer-distribution", "churn", "revenue-forecasting"]) assert.ok(source.includes(`"${route}"`));
  for (const exact of ["₹1,800.00", "₹21,600.00", "₹3,000.00", "₹4,200.00", "420", "92 inactive days", "33.33%", "Active Paying Institute Trend", "Active Student Trend"]) assert.ok(source.includes(exact), exact);
  assert.match(source, /for \(const status of \[200, 400, 401, 403, 500\]\)/u);
  assert.match(source, /req.method\)\.toBe\("GET"\)/u);
  assert.match(source, /toBe\("http:\/\/127\.0\.0\.1:5000"\)/u);
});
