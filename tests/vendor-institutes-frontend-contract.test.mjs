import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}`), "utf8");

test("Vendor institute live adapter owns every BWM-034 route with runtime response validation", async () => {
  const source = await read("apps/vendor/src/features/institutes/vendorInstitutesApi.ts");
  for (const route of [
    '"/vendor/institutes"',
    '"/vendor/onboarding"',
    "`/vendor/institutes/${encodePathSegment(instituteId)}`",
    "`/vendor/institutes/${encodePathSegment(instituteId)}/lifecycle`",
    "`/vendor/onboarding/${encodePathSegment(onboardingId)}`",
    "`/vendor/onboarding/${encodePathSegment(onboardingId)}/commands`",
    "`/vendor/institutes/${encodePathSegment(instituteId)}/administrators/commands`",
  ]) {
    assert.ok(source.includes(route), route);
  }
  assert.match(source, /responseAdapter:\s*parseVendorInstituteList/u);
  assert.match(source, /responseAdapter:\s*parseVendorInstituteDetail/u);
  assert.match(source, /responseAdapter:\s*parseVendorOnboardingList/u);
  assert.match(source, /responseAdapter:\s*parseVendorOnboardingDetail/u);
  assert.match(source, /Invalid Vendor API response/u);
  assert.match(source, /encodeURIComponent/u);
  assert.equal(
    (source.match(/handledFailureIsReady:\s*true/gu) ?? []).length,
    10,
    "every locally handled route failure must leave the mounted workspace visible",
  );
  assert.equal(
    (source.match(/emptyResultIsReady:\s*true/gu) ?? []).length,
    10,
    "every locally handled empty result must leave the mounted workspace visible",
  );
  assert.doesNotMatch(source, /actorId|actorRole|ipAddress|userAgent/u);
});

test("live institute workspace reloads server authority and exposes required states", async () => {
  const source = await read("apps/vendor/src/features/institutes/VendorInstituteAuthorityPage.tsx");
  for (const boundary of [
    "Loading institutes",
    "No institutes match",
    "Permission required",
    "Authoritative conflict",
    "Institute authority unavailable",
    "Retry authoritative load",
    "Previous page",
    "Next page",
    "No fixture detail is substituted",
    "Commercial controls are unavailable",
    "pending BWM-036",
    "await load()",
    "await loadDetail(selectedId)",
  ]) {
    assert.ok(source.includes(boundary), boundary);
  }
  assert.match(source, /createVendorIdempotencyKey\(\)/u);
  assert.match(source, /expectedRevision:\s*detail\.revision/u);
  assert.match(source, /expectedRevision:\s*detail\.settingsRevision/u);
  assert.doesNotMatch(source, /getVendorInstitutesDataset|INITIAL_LICENSE_REQUESTS/u);
});

test("mounted detail route uses the real institute workspace", async () => {
  const app = await read("apps/vendor/src/App.tsx");
  const route = app.slice(
    app.indexOf('path="institutes/:instituteId"'),
    app.indexOf('path="licensing"'),
  );
  assert.match(route, /<VendorInstituteManagementPage\s*\/>/u);
  assert.doesNotMatch(route, /renderVendorPlaceholder/u);
});

test("fixtures and browser-only mutations are isolated to explicit fixture mode", async () => {
  const page = await read("apps/vendor/src/features/institutes/VendorInstituteManagementPage.tsx");
  const provider = await read(
    "apps/vendor/src/features/institutes/VendorLicenseRequestsContext.tsx",
  );
  assert.match(
    page,
    /shouldUseFixtureData\(\)[\s\S]*?<FixtureVendorInstituteManagementPage\s*\/>[\s\S]*?<VendorInstituteAuthorityPage\s*\/>/u,
  );
  assert.match(provider, /fixtureMode\s*\?\s*INITIAL_LICENSE_REQUESTS\s*:\s*\[\]/u);
  assert.match(provider, /fixtureMode\s*\?\s*INITIAL_ONBOARDING_RECORDS\s*:\s*\[\]/u);
  assert.ok((provider.match(/if \(!fixtureMode\) return;/gu) ?? []).length >= 6);
});

test("authenticated Vendor institute browser proof is live, no-mock, and repeatable", async () => {
  const [runner, browserProof, packageSource] = await Promise.all([
    read("scripts/run-vendor-institutes-e2e.mjs"),
    read("tests/e2e/vendor-institutes.spec.mjs"),
    read("package.json"),
  ]);
  for (const boundary of [
    'VITE_DATA_MODE: "live"',
    '"auth,firestore,functions:apiV1,hosting:vendor"',
    '"npm run test:e2e:vendor-institutes"',
  ]) {
    assert.ok(runner.includes(boundary), boundary);
  }
  for (const proof of [
    "freshContext",
    "Authoritative conflict",
    "Institute authority unavailable",
    "Permission required",
    "Next page",
    "vendor_primary_administrator",
    "primaryContactEmailNormalized",
    "externalRequests",
    "localStorage",
  ]) {
    assert.ok(browserProof.includes(proof), proof);
  }
  assert.doesNotMatch(browserProof, /route\.fulfill|mock response|VITE_DATA_MODE.*fixture/iu);
  assert.match(packageSource, /"test:vendor-institutes:e2e"/u);
  assert.match(packageSource, /"test:e2e:vendor-institutes"/u);
});
