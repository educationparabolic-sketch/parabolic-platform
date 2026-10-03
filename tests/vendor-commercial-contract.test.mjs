import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(rootDirectory, path), "utf8");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath) {
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = {exports: {}};
  const evaluate = new Function("exports", "module", output);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

test("BWM-035 registers the exact secured commercial route boundary", async () => {
  const manifestPath = join(rootDirectory, "functions/src/apiRouteManifest.ts");
  const manifestSource = await readFile(manifestPath, "utf8");
  const {API_ROUTE_MANIFEST} = loadTypeScriptModule(manifestSource, manifestPath);
  const routes = API_ROUTE_MANIFEST.filter((route) =>
    /^VEN-(?:1[7-9]|2\d|30)$/u.test(route.id),
  );

  assert.deepEqual(
    routes.map(({id, method, currentFrontendPath}) => [id, method, currentFrontendPath]),
    [
      ["VEN-17", "GET", "/vendor/license-requests"],
      ["VEN-18", "GET", "/vendor/institutes/{instituteId}/license-requests/{requestId}"],
      ["VEN-19", "POST", "/vendor/institutes/{instituteId}/license-requests/{requestId}/decision"],
      ["VEN-20", "GET", "/vendor/license-catalog"],
      ["VEN-21", "POST", "/vendor/license-catalog/commands"],
      ["VEN-22", "GET", "/vendor/institutes/{instituteId}/subscription"],
      ["VEN-23", "POST", "/vendor/institutes/{instituteId}/subscription/commands"],
      ["VEN-24", "GET", "/vendor/invoices"],
      ["VEN-25", "GET", "/vendor/institutes/{instituteId}/invoices/{invoiceId}"],
      ["VEN-26", "POST", "/vendor/institutes/{instituteId}/invoices/{invoiceId}/commands"],
      ["VEN-27", "POST", "/vendor/institutes/{instituteId}/invoices/{invoiceId}/communications"],
      ["VEN-28", "POST", "/vendor/institutes/{instituteId}/invoices/{invoiceId}/offline-payments"],
      ["VEN-29", "GET", "/vendor/payment-events"],
      ["VEN-30", "POST", "/vendor/payment-events/{eventId}/commands"],
    ],
  );
  routes.forEach((route) => {
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.equal(route.functionExport, "vendorCommercial");
  });
});

test("commercial money, pagination, replay, and provider states are explicit", async () => {
  const contract = await read("shared/contracts/vendorCommercial.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);

  for (const requiredBoundary of [
    "VendorMoney",
    "amountMinor: number",
    "Uppercase ISO 4217 currency code",
    "never a floating amount",
    "Defaults to 25 and may not exceed 50",
    "VendorCommercialRevisionedCommandMetadata",
    "expectedRevision: number",
    "idempotencyKey: string",
    "failed_retryable",
    "failed_terminal",
    "stripe_webhook_and_reconciliation",
    "price change publishes a new plan version",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
});

test("request decisions reuse BWM-031 authority without browser entitlement writes", async () => {
  const contract = await read("shared/contracts/vendorCommercial.d.ts");
  const decisionIntent = contract.slice(
    contract.indexOf("export type VendorLicenseRequestDecisionIntent"),
    contract.indexOf("export interface VendorLicenseRequestDecisionReceipt"),
  );

  for (const requiredBoundary of [
    'action: "approve"',
    'action: "require_payment"',
    'action: "reject"',
    "decisionState: VendorLicenseRequestDecisionState",
    "providerOperation: VendorCommercialProviderOperation | null",
    '"pending_bwm_036"',
    'entitlementAuthority: "license_current_only"',
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
  for (const forbiddenAuthority of [
    "actorUserId",
    "auditEventId",
    "completedAt",
    "instituteId",
    "licenseVersion",
    "providerOperation",
    "requestId",
    "status",
  ]) {
    assert.doesNotMatch(decisionIntent, new RegExp(forbiddenAuthority, "u"));
  }
});

test("offline payment and communication governance fail closed", async () => {
  const contract = await read("shared/contracts/vendorCommercial.d.ts");
  for (const requiredBoundary of [
    'action: "record"',
    'action: "verify" | "reject" | "void"',
    "expectedOfflinePaymentRevision: number",
    'status: VendorOfflinePaymentStatus',
    "Recording an offline payment never marks an invoice paid",
    "Verification requires",
    "a different current Vendor actor",
    "provider reconciliation",
    'recipientClass: "institute_billing_contact"',
    "backend resolves the authoritative billing contact and message body",
    'offlinePaymentAuthority: "two_actor_verified_reconciled"',
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
  assert.doesNotMatch(contract, /recipientEmail|messageBody|rawProviderPayload/u);
});

test("BWM-036 remains the only fleet propagation owner", async () => {
  const contract = await read("shared/contracts/vendorCommercial.d.ts");
  assert.ok(contract.includes('"not_required"'));
  assert.ok(contract.includes('"pending_bwm_036"'));
  assert.doesNotMatch(contract, /propagationState:[^;]*"complete"/u);
  assert.ok(contract.includes("BWM-036 owns fleet claim/session fan-out"));
});

test("request implementation is bounded, secured, replay-safe, and entitlement-neutral", async () => {
  const [service, transport, adminLicensing] = await Promise.all([
    read("functions/src/services/vendorLicenseRequests.ts"),
    read("functions/src/api/vendorCommercial.ts"),
    read("functions/src/services/adminLicensing.ts"),
  ]);

  for (const requiredBoundary of [
    "collectionGroup(LICENSE_REQUESTS_COLLECTION)",
    "pageQuery.limit(request.limit + 1).get()",
    "filteredQuery.count().get()",
    "LICENSE_REQUEST_STATE_COLLECTION",
    "COMMERCIAL_COMMANDS_COLLECTION",
    "ROOT_AUDIT_COLLECTION",
    "INSTITUTE_AUDIT_COLLECTION",
    "runTransaction",
    'propagationState: "not_required"',
    "providerOperation: null",
    'status === "payment_required" ? request.requestId : null',
    "Current entitlement changed after this request was submitted",
  ]) {
    assert.ok(service.includes(requiredBoundary), requiredBoundary);
  }
  assert.doesNotMatch(service, /transaction\.(?:set|update)\(licenseReference/u);
  assert.doesNotMatch(service, /LICENSE_HISTORY_COLLECTION/u);

  for (const requiredBoundary of [
    "verifyIdToken(idToken, true)",
    "getUser(identity.uid)",
    "user.disabled",
    "claims.isSuspended === true",
    '"vendor.licenses.manage"',
    "request.params.instituteId",
    "request.params.requestId",
  ]) {
    assert.ok(transport.includes(requiredBoundary), requiredBoundary);
  }
  assert.ok(adminLicensing.includes("decisionAuditEventIds: []"));
  assert.ok(adminLicensing.includes('decisionState: "undecided"'));
  assert.ok(adminLicensing.includes("revision: 1"));
  assert.ok(adminLicensing.includes("submissionAuditEventId: authority.auditEventId"));
});

test("commercial services reserve provider work before applying validated truth", async () => {
  const [common, catalog, subscriptions, invoices, paymentEvents, index] =
    await Promise.all([
      read("functions/src/services/vendorCommercialCommon.ts"),
      read("functions/src/services/vendorLicenseCatalog.ts"),
      read("functions/src/services/vendorSubscriptions.ts"),
      read("functions/src/services/vendorInvoices.ts"),
      read("functions/src/services/vendorPaymentEvents.ts"),
      read("functions/src/index.ts"),
    ]);

  for (const requiredBoundary of [
    "VendorCommercialProvider",
    "UnavailableVendorCommercialProvider",
    'errorCode: "provider_not_configured"',
    'state: "failed_retryable"',
    "providerResultOperation",
    "idempotencyKeyHash",
  ]) {
    assert.ok(common.includes(requiredBoundary), requiredBoundary);
  }
  for (const requiredBoundary of [
    "catalogRevision",
    'status: "draft"',
    'status: input.command.action === "retire_plan_version"',
    "providerPriceReference",
    "transaction.create(planReference",
  ]) {
    assert.ok(catalog.includes(requiredBoundary), requiredBoundary);
  }
  for (const requiredBoundary of [
    "validateProjection",
    "unfinished provider operation",
    'status: "not_configured"',
    "providerOperation: pendingOperation",
  ]) {
    assert.ok(subscriptions.includes(requiredBoundary), requiredBoundary);
  }
  for (const requiredBoundary of [
    "institute_billing_contact",
    "evidenceReferenceHash",
    "externalReferenceHash",
    "different Vendor actor",
    'status: needsProvider ? "provider_pending" : "verified"',
    "invoiceProjection",
  ]) {
    assert.ok(invoices.includes(requiredBoundary), requiredBoundary);
  }
  for (const requiredBoundary of [
    "retry_reconciliation",
    "reconciliationState",
    "failed_retryable",
    "providerResultOperation",
  ]) {
    assert.ok(paymentEvents.includes(requiredBoundary), requiredBoundary);
  }

  assert.doesNotMatch(index, /vendorLicenseCatalog|vendorSubscriptions|vendorInvoices|vendorPaymentEvents/u);
  assert.ok(index.includes("vendorCommercial"));
  assert.doesNotMatch(invoices, /evidenceReference:\s*command\.evidenceReference/u);
  assert.doesNotMatch(paymentEvents, /rawPayload/u);
});
