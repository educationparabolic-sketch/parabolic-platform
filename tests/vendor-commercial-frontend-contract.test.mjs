import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(path, `file://${root}`), "utf8");

test("one strict Vendor commercial adapter owns every VEN-17 through VEN-30 route", async () => {
  const source = await read("apps/vendor/src/features/licensing/vendorCommercialApi.ts");
  for (const route of [
    '"/vendor/license-requests"',
    '"/vendor/license-catalog"',
    '"/vendor/license-catalog/commands"',
    '"/vendor/invoices"',
    '"/vendor/payment-events"',
    "`/vendor/institutes/${encode(instituteId)}/license-requests/${encode(requestId)}`",
    "`/vendor/institutes/${encode(instituteId)}/subscription`",
    "`/vendor/institutes/${encode(instituteId)}/subscription/commands`",
    "`/vendor/institutes/${encode(instituteId)}/invoices/${encode(invoiceId)}`",
    "`/vendor/payment-events/${encode(eventId)}/commands`",
  ]) {
    assert.ok(source.includes(route), route);
  }
  assert.equal(
    (source.match(/emptyResultIsReady:\s*true/gu) ?? []).length,
    1,
    "shared options must keep all locally handled empty results visible",
  );
  assert.equal(
    (source.match(/handledFailureIsReady:\s*true/gu) ?? []).length,
    1,
    "shared options must keep all locally handled failures visible",
  );
  for (const parser of [
    "parseRequestList",
    "parseRequestDetail",
    "parseRequestReceipt",
    "parseCatalog",
    "parseCatalogReceipt",
    "parseSubscription",
    "parseSubscriptionReceipt",
    "parseInvoiceList",
    "parseInvoiceDetail",
    "parseInvoiceReceipt",
    "parseCommunicationReceipt",
    "parseOfflineReceipt",
    "parsePaymentEventList",
    "parsePaymentEventReceipt",
  ]) {
    assert.ok(source.includes(`responseAdapter: ${parser}`), parser);
  }
  assert.match(source, /Invalid Vendor commercial response/u);
  assert.match(source, /provider_not_configured/u);
  assert.doesNotMatch(source, /actorId|actorRole|ipAddress|userAgent|rawProviderPayload/u);
});

test("live commercial workspace reconciles writes and exposes truthful states", async () => {
  const source = await read(
    "apps/vendor/src/features/licensing/VendorCommercialAuthorityPage.tsx",
  );
  for (const boundary of [
    "Loading commercial authority",
    "No cached, session-local, or fixture commercial values",
    "Permission required",
    "Commercial validation failed",
    "Authoritative conflict",
    "Payment provider unavailable",
    "Commercial authority unavailable",
    "Retry authoritative load",
    "No fixture data is substituted",
    "pending BWM-036",
    "Recording creates pending verification only and never marks the invoice paid",
    "raw provider payload is never exposed",
    "await loadAll()",
    "await loadRequest",
    "await loadInvoice",
    'aria-label="License request pages"',
    'aria-label="Invoice pages"',
    'aria-label="Payment event pages"',
  ]) {
    assert.ok(source.includes(boundary), boundary);
  }
  for (const command of [
    "decideLicenseRequest",
    "commandLicenseCatalog",
    "commandSubscription",
    "commandInvoice",
    "communicateInvoice",
    "commandOfflinePayment",
    "retryPaymentEvent",
  ]) {
    assert.ok(source.includes(`vendorCommercialApi.${command}`), command);
  }
  assert.match(source, /commandIntents\.current/u);
  assert.match(source, /intentFor<VendorSubscriptionCommandIntent>/u);
  assert.match(source, /intentFor<VendorInvoiceCommandIntent>/u);
  assert.match(source, /intentFor<VendorPaymentEventCommandIntent>/u);
  assert.match(
    source,
    /classified\.kind === "conflict" \|\| classified\.kind === "validation"[\s\S]*?clearIntent\(scope\)/u,
  );
  assert.match(source, /classified\.kind === "conflict" && reload[\s\S]*?await reload\(\)/u);
  assert.match(source, /providerFailure\(receipt\.providerOperation/u);
  assert.match(source, /receipt\.reportedFailure \?\?/u);
  for (const action of [
    "change_plan",
    "extend_trial",
    "cancel_at_period_end",
    "cancel_now",
    "resume",
    "finalize",
    "retry_collection",
  ]) {
    assert.ok(source.includes(`value="${action}"`), action);
  }
  assert.doesNotMatch(source, /setInvoices\s*\(\s*\(|setLicensePlans|status:\s*"paid"/u);
});

test("mounted licensing route selects fixtures only by explicit data mode", async () => {
  const [page, app, institutePage] = await Promise.all([
    read("apps/vendor/src/features/licensing/VendorLicensingPage.tsx"),
    read("apps/vendor/src/App.tsx"),
    read("apps/vendor/src/features/institutes/VendorInstituteAuthorityPage.tsx"),
  ]);
  assert.match(
    page,
    /shouldUseFixtureData\(\)[\s\S]*?<FixtureVendorLicensingPage\s*\/>[\s\S]*?<VendorCommercialAuthorityPage\s*\/>/u,
  );
  const route = app.slice(app.indexOf('path="licensing"'), app.indexOf('path="calibration"'));
  assert.match(route, /<VendorLicensingPage\s*\/>/u);
  assert.match(institutePage, /to="\/vendor\/licensing"/u);
  assert.doesNotMatch(institutePage, /Commercial controls are unavailable/u);
});

test("commercial browser proof uses live Firebase authority without fulfilled API mocks", async () => {
  const [proof, runner, packageSource] = await Promise.all([
    read("tests/e2e/vendor-commercial.spec.mjs"),
    read("scripts/run-vendor-commercial-e2e.mjs"),
    read("package.json"),
  ]);
  for (const boundary of [
    "real Auth, Firestore, Functions, Hosting, and fresh browsers",
    "Authoritative conflict",
    "Commercial validation failed",
    "Payment provider unavailable",
    "Commercial authority unavailable",
    "No license requests available",
    "Permission required",
    "pending_verification",
    "Verified",
    "attemptCount",
    "Page 2",
    "North Star Academy",
    "rawProviderPayload",
  ]) {
    assert.ok(proof.includes(boundary), boundary);
  }
  assert.match(proof, /expect\(unauthenticated\.status\(\)\)\.toBe\(401\)/u);
  assert.match(proof, /expect\(wrongRole\.status\(\)\)\.toBe\(403\)/u);
  assert.match(proof, /route\.abort\("failed"\)/u);
  assert.match(proof, /expect\(externalRequests\)\.toEqual\(\[\]\)/u);
  assert.doesNotMatch(proof, /route\.fulfill|localStorage\.setItem/u);
  for (const value of [
    'VITE_DATA_MODE: "live"',
    'VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099"',
    '"auth,firestore,functions:apiV1,hosting:vendor"',
    '"npm run test:e2e:vendor-commercial"',
  ]) {
    assert.ok(runner.includes(value), value);
  }
  assert.match(
    packageSource,
    /"test:vendor-commercial:e2e":\s*"node scripts\/run-vendor-commercial-e2e\.mjs"/u,
  );
});
