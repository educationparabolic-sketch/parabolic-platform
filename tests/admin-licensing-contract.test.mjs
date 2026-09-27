import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFile(join(rootDirectory, path), "utf8");

test("Admin licensing has one shared server-authoritative request contract", async () => {
  const [contract, backendTypes, backendApi, routeManifest] = await Promise.all([
    read("shared/contracts/adminLicensing.d.ts"),
    read("functions/src/types/adminLicensing.ts"),
    read("functions/src/api/adminLicensing.ts"),
    read("functions/src/apiRouteManifest.ts"),
  ]);

  assert.match(contract, /"GET_LICENSE_SNAPSHOT"/);
  assert.match(contract, /"REQUEST_LICENSE_UPGRADE"/);
  assert.match(backendTypes, /shared\/contracts\/adminLicensing/);

  const publicIntent = contract.slice(
    contract.indexOf("export interface AdminLicenseUpgradeRequestIntent"),
    contract.indexOf("export type AdminLicensingPublicRequest"),
  );
  for (const forbiddenAuthority of [
    "actorUserId",
    "currentLayer",
    "currentPlanId",
    "instituteId",
    "requestedBy",
    "status",
  ]) {
    assert.doesNotMatch(publicIntent, new RegExp(forbiddenAuthority));
  }
  for (const requiredIntent of [
    "expectedLicenseVersion: string",
    "idempotencyKey: string",
    "reason: string",
    "requestKind: AdminLicenseRequestKind",
    "requestedPlanId: string",
  ]) {
    assert.ok(publicIntent.includes(requiredIntent), requiredIntent);
  }

  assert.match(
    backendApi,
    /resolveRequestInstituteId: \(request\): string \| null =>\s*request\.context\.identity\?\.instituteId/,
  );
  assert.match(backendApi, /createCapabilityAuthorizationMiddleware\(\{/);
  assert.match(backendApi, /roleMinimumLicenseLayers: \{director: "L3"\}/);
  assert.doesNotMatch(backendApi, /body\.instituteId/);

  const licensingRoute = routeManifest.slice(
    routeManifest.indexOf('"ADM-16"'),
    routeManifest.indexOf('"ADM-17"'),
  );
  assert.match(licensingRoute, /"implemented"/);
});

test("Admin licensing snapshot encodes strict nullable authority without estimates", async () => {
  const contract = await read("shared/contracts/adminLicensing.d.ts");

  for (const requiredDeclaration of [
    "AdminCurrentLicenseSnapshot",
    "AdminLicenseCapabilitySnapshot",
    "AdminLicensePlanSnapshot",
    "AdminLicenseUsageSnapshot",
    "AdminLicenseBillingRecordSnapshot",
    "AdminLicenseHistoryEntrySnapshot",
    "AdminLicenseUpgradeRequestSnapshot",
    "AdminLicenseSnapshot",
    "usage: AdminLicenseUsageSnapshot | null",
    "nextCursor: string | null",
    "openRequestId: string | null",
  ]) {
    assert.ok(contract.includes(requiredDeclaration), requiredDeclaration);
  }

  assert.match(contract, /AdminLicenseState = "active" \| "grace" \| "expired"/);
  assert.match(contract, /layer: AdminLicenseLayer/);
  assert.match(contract, /licenseVersion: string/);
  assert.match(contract, /featureFlags: AdminLicenseFeatureFlags/);
  assert.match(contract, /expiryDate: string \| null/);
  assert.match(contract, /gracePeriodEndsAt: string \| null/);
  assert.doesNotMatch(contract, /estimatedCurrentBill|attemptsRemaining|remainingStudentSlots/);
});

test("Admin licensing request replay, one-open, claims, and ownership are explicit", async () => {
  const contract = await read("shared/contracts/adminLicensing.d.ts");

  for (const requiredBoundary of [
    "BWM-035 owns Vendor catalog, decision, invoice",
    "BWM-036 owns fleet-wide propagation timing",
    'AdminLicenseMutationDisposition = "applied" | "replayed"',
    "At most one pending or payment-required request may be present.",
    "LicenseEntitlementClaimContract",
    "licenseState: AdminLicenseState",
    "AdminLicenseUpgradeRequestReceipt",
    "auditEventId: string",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }

  const resolvedAuthority = contract.slice(
    contract.indexOf("export interface AdminLicensingResolvedAuthority"),
    contract.indexOf("export interface LicenseEntitlementClaimContract"),
  );
  assert.match(resolvedAuthority, /actorUserId: string/);
  assert.match(resolvedAuthority, /instituteId: string/);
});

test("ADM-16 snapshot implementation has no legacy fallback or synthesized commercial data", async () => {
  const [service, backendTypes, overview] = await Promise.all([
    read("functions/src/services/adminLicensing.ts"),
    read("functions/src/types/adminLicensing.ts"),
    read("functions/src/services/adminOverview.ts"),
  ]);

  assert.match(backendTypes, /SharedAdminLicensingResult/);
  assert.match(service, /LICENSE_CURRENT_DOCUMENT_ID = "current"/);
  assert.match(service, /\.limit\(PAGE_LIMIT \+ 1\)/);
  assert.match(service, /\.limit\(PRICING_PLAN_LIMIT \+ 1\)/);
  assert.match(service, /AdminLicenseUsageSnapshot \| null =>/);
  assert.doesNotMatch(service, /license\/main|LICENSE_MAIN_DOCUMENT_ID/);
  assert.doesNotMatch(
    service,
    /buildEligibilityStages|eligibilityProgress|estimatedCurrentBill|remainingStudentSlots|vendor\.yourdomain/,
  );
  assert.match(overview, /eligibilityL1Percentage = null/);
  assert.match(overview, /peakConcurrencyThisMonth: null/);
});

test("ADM-16 request command is transactional, replay-safe, and entitlement-read-only", async () => {
  const [service, backendTypes, backendApi] = await Promise.all([
    read("functions/src/services/adminLicensing.ts"),
    read("functions/src/types/adminLicensing.ts"),
    read("functions/src/api/adminLicensing.ts"),
  ]);
  const commandImplementation = service.slice(
    service.indexOf("private async createLicenseRequest"),
    service.indexOf("private async getSnapshot"),
  );

  for (const requiredAuthority of [
    "LICENSE_REQUEST_COMMANDS_COLLECTION",
    "LICENSE_REQUEST_AUDIT_COLLECTION",
    "LICENSE_REQUEST_STATE_COLLECTION",
    "runTransaction",
    "idempotencyKeyHash",
    "fingerprint",
    "expectedLicenseVersion",
    "openRequestsQuery",
    "transaction.create(requestReference",
    "transaction.create(auditReference",
    "transaction.create(commandReference",
    "transaction.set(requestStateReference",
    'disposition: "replayed"',
    'disposition: "applied"',
  ]) {
    assert.ok(commandImplementation.includes(requiredAuthority), requiredAuthority);
  }
  assert.doesNotMatch(
    commandImplementation,
    /transaction\.(?:set|update)\(currentLicenseReference/,
  );
  assert.doesNotMatch(commandImplementation, /license\/main|LICENSE_MAIN_DOCUMENT_ID/);
  assert.doesNotMatch(commandImplementation, /idempotencyKey:/);
  assert.match(backendTypes, /AdminLicensingResult = SharedAdminLicensingResult/);
  assert.match(backendApi, /expectedLicenseVersion: body\.expectedLicenseVersion/);
  assert.match(backendApi, /idempotencyKey: body\.idempotencyKey/);
  assert.match(backendApi, /requestedPlanId: body\.requestedPlanId/);
  assert.match(backendApi, /requestKind: body\.requestKind/);
});

test("license claims and privileged enforcement share complete fail-closed authority", async () => {
  const [contract, claims, entitlement, capability, portalState] = await Promise.all([
    read("shared/contracts/adminLicensing.d.ts"),
    read("functions/src/services/customClaimSynchronization.ts"),
    read("functions/src/middleware/licenseEntitlement.ts"),
    read("functions/src/middleware/capability.ts"),
    read("shared/services/globalPortalState.tsx"),
  ]);

  for (const field of [
    "expiryDate",
    "featureFlags",
    "gracePeriodEndsAt",
    "licenseLayer",
    "licenseState",
    "licenseVersion",
  ]) {
    assert.match(contract, new RegExp(`${field}:`));
    assert.match(claims, new RegExp(`${field}: authority\\.${field}`));
  }
  assert.doesNotMatch(claims, /collection\("license"\)\.doc\("main"\)/);
  assert.match(entitlement, /revokeRefreshTokens\(identity\.uid\)/);
  assert.match(entitlement, /entitlement\.state === "grace"/);
  assert.match(capability, /enforceActiveLicenseEntitlement/);
  assert.match(portalState, /currentLayer: entitlementActive \? claimedLayer : status \? "L0" : null/);
  assert.match(portalState, /featureFlags: entitlementActive \? claimedFeatureFlags : EMPTY_LICENSE_FEATURE_FLAGS/);
});

test("mounted Admin licensing consumes strict authority without fallback or local success", async () => {
  const [dataset, workspace, routes] = await Promise.all([
    read("apps/admin/src/features/licensing/licensingDataset.ts"),
    read("apps/admin/src/features/licensing/AdminLicensingWorkspace.tsx"),
    read("apps/admin/src/portals/adminRoutes.ts"),
  ]);

  assert.match(dataset, /shared\/contracts\/adminLicensing/);
  assert.match(dataset, /body: \{actionType: "GET_LICENSE_SNAPSHOT"\}/);
  assert.match(dataset, /const snapshot = await fetchLicensingSnapshot\(\)/);
  assert.match(dataset, /was not confirmed by an authoritative snapshot reload/);
  assert.match(dataset, /globalThis\.crypto\?\.randomUUID/);
  assert.match(dataset, /fixture mode is active/);
  assert.doesNotMatch(dataset, /FALLBACK_SNAPSHOT|LICENSE_PLANS/);

  const submitImplementation = dataset.slice(
    dataset.indexOf("export async function submitLicenseUpgradeRequest"),
    dataset.indexOf("export function createLicenseRequestIdempotencyKey"),
  );
  for (const forbiddenBrowserAuthority of [
    "instituteId",
    "currentPlanId",
    "requestedBy",
  ]) {
    assert.doesNotMatch(submitImplementation, new RegExp(forbiddenBrowserAuthority));
  }

  assert.match(workspace, /CAPABILITY_MATRIX\["admin\.license\.upgrade_request"\]/);
  assert.match(workspace, /const LICENSE_LAYERS[^;]+\["L0", "L1", "L2", "L3"\]/s);
  assert.match(workspace, /Authoritative licensing data unavailable/);
  assert.match(workspace, /No cached or fixture licensing values are shown/);
  assert.match(workspace, /The browser does not generate invoices/);
  assert.doesNotMatch(workspace, /new Blob|URL\.createObjectURL|buildInvoiceDocument/);
  assert.doesNotMatch(workspace, /setSnapshot\(\(previous\)/);

  assert.match(routes, /ADMIN_LICENSE_READ_POLICY = CAPABILITY_MATRIX\["admin\.license\.read"\]/);
  assert.match(routes, /roleMinimumLicenseLayers: ADMIN_LICENSE_READ_POLICY\.roleMinimumLicenseLayers/);
});

test("Admin licensing permanent proof is registered across contract, emulator, and browser", async () => {
  const [packageJson, runner, browser, serviceTest] = await Promise.all([
    read("package.json"),
    read("scripts/run-admin-licensing-e2e.mjs"),
    read("tests/e2e/admin-licensing.spec.mjs"),
    read("functions/src/tests/adminLicensing.test.ts"),
  ]);

  for (const command of [
    '"test:admin-licensing:e2e"',
    '"test:admin-licensing:proof"',
    '"test:e2e:admin-licensing"',
  ]) {
    assert.ok(packageJson.includes(command), command);
  }
  assert.match(runner, /VITE_DATA_MODE: "live"/);
  assert.match(runner, /auth,firestore,functions:apiV1,hosting:portal/);
  assert.doesNotMatch(runner, /VITE_DATA_MODE: "fixture"/);

  for (const proof of [
    "snapshot.currentLicense.instituteId",
    "licenseRequests",
    "licenseRequestCommands",
    "licenseRequestAudit",
    "licenseRequestState",
    "disposition).toBe(\"replayed\")",
    "Authoritative license loaded",
    "Authoritative license/current is unavailable.",
    "Fixture data has not been substituted.",
    "license-downgrade-after",
    '"graceAdmin"',
    '"expiredAdmin"',
    '"missingAdmin"',
    '["L0", "L1", "L2", "L3"]',
  ]) {
    assert.ok(browser.includes(proof), proof);
  }
  assert.match(browser, /mutationBody\.instituteId\)\.toBeUndefined/);
  assert.match(browser, /externalRequests\)\.toEqual\(\[\]\)/);
  assert.match(
    serviceTest,
    /capability projection covers every layer and exact feature lock/,
  );
  assert.match(
    serviceTest,
    /authoritative reload reflects a persisted L3 to L0 downgrade/,
  );
});
