import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("audit and health declarations accept only the closed read contract", () => {
  const file = `${root}tests/__vendor_audit_health_contract_probe.ts`;
  const source = `
    import type {VendorAuditEventsQuery, VendorAuditEventsResult,
      VendorSystemHealthResult, VendorAuditCursorPayload}
      from "../shared/contracts/vendorAuditHealth";
    const query: VendorAuditEventsQuery = {category: "billing", status: "failed",
      instituteId: "inst_1", from: "2026-01-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z", limit: 25, cursor: "opaque"};
    const cursor: VendorAuditCursorPayload = {version: 1, filterFingerprint: "hash",
      anchors: {vendorCommandAudit: null, vendorSystemAudit: null,
        calibrationTerminal: null, stripeEvent: null, billingSnapshot: null,
        licenseHistory: null}};
    // @ts-expect-error source is deliberately not a public filter
    const sourceFilter: VendorAuditEventsQuery = {source: "stripe_event"};
    // @ts-expect-error arbitrary search is page-local and not server authority
    const searchFilter: VendorAuditEventsQuery = {search: "invoice"};
    declare const audit: VendorAuditEventsResult;
    if (audit.items[0]) {
      const closedMetadata: number | null = audit.items[0].metadata.amountMinor;
      // @ts-expect-error raw provider payload is not in the DTO
      const raw = audit.items[0].metadata.payload;
    }
    declare const health: VendorSystemHealthResult;
    // @ts-expect-error an overall health verdict is forbidden
    const inventedHealth = health.healthy;
    const cloud: "unavailable" = health.cloudMonitoring.availability;
    // @ts-expect-error unsupported cloud monitoring has no fabricated data
    const cloudData = health.cloudMonitoring.data;
  `;
  const options = {strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022};
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) => name === file ?
    ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
});

test("VEN-40 and VEN-41 are exact registered read routes", () => {
  const output = ts.transpileModule(read("functions/src/apiRouteManifest.ts"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const module = {exports: {}};
  new Function("exports", "module", output)(module.exports, module);
  const routes = module.exports.API_ROUTE_MANIFEST.filter((route) =>
    ["VEN-40", "VEN-41"].includes(route.id));
  assert.deepEqual(routes.map(({id, method, canonicalPath, status, functionExport, declaration}) =>
    [id, method, canonicalPath, status, functionExport, declaration]), [
    ["VEN-40", "GET", "/api/v1/vendor/audit-events", "implemented", "vendorAuditEvents", "planned"],
    ["VEN-41", "GET", "/api/v1/vendor/system-health", "implemented", "vendorSystemHealth", "planned"],
  ]);

  const contract = read("shared/contracts/vendorAuditHealth.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);
  assert.doesNotMatch(contract, /\[key:\s*string\]|Record<string/u);
  for (const requirement of ["defaultAuditPageSize: 25", "maximumAuditPageSize: 50",
    "maximumCursorLength: 4096", 'cursorProtection: "authenticated_encryption"',
    "maximumHealthSourceDocuments: 1000", 'healthSourceOverflowDisposition: "unavailable"',
    '"source_limit_exceeded"', "filterFingerprint", "vendorCommandAudit",
    "vendorSystemAudit", "partialAuditSourceAcceptanceAllowed: false",
    "rawProviderPayloadAllowed: false", "inferredOverallHealthAllowed: false",
    "cloudMonitoring: VendorHealthUnavailableSource", "BWM-051", "BWM-052", "BWM-053"]) {
    assert.ok(contract.includes(requirement), requirement);
  }
});

test("system-health reader is bounded, source-specific, unavailable-aware and read-only", () => {
  const service = read("functions/src/services/vendorSystemHealthReadModel.ts");
  for (const requirement of ["MAX_SOURCE_DOCUMENTS = 1000", "MAX_SOURCE_DOCUMENTS + 1",
    'collection("systemFlags/failureRecoveryRetryQueue/jobs")',
    'collection("emailQueue")', 'collection("vendor/stripeEvents/events")',
    'collection("vendorCalibrationRollouts")', "Promise.all", "source_unavailable",
    "source_limit_exceeded",
    "adapter_not_implemented", "no_durable_source", "RELEASE_COMMIT_SHA", "K_REVISION"]) {
    assert.ok(service.includes(requirement), requirement);
  }
  assert.doesNotMatch(service, /transaction\.(?:create|delete|set|update)\(/u);
  assert.doesNotMatch(service, /\.(?:create|delete|set|update)\(/u);
  assert.doesNotMatch(service, /getFirestore\(/u);
  assert.doesNotMatch(service, /healthy|degraded|sla/iu);
});

test("audit/health transport follows distinct canonical capability policy and declares only the required index", () => {
  const output = ts.transpileModule(read("shared/contracts/capabilityPolicy.ts"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const module = {exports: {}};
  new Function("exports", "module", output)(module.exports, module);
  for (const [file, capability] of [["vendorAuditEvents", "vendor.audit.read"],
    ["vendorSystemHealth", "vendor.system_health.read"]]) {
    assert.deepEqual(module.exports.CAPABILITY_MATRIX[capability].allowedRoles, ["vendor"]);
    const handler = read(`functions/src/api/${file}.ts`);
    assert.ok(handler.includes(`vendorAuditHealthMiddlewares("${capability}"`));
    assert.ok(handler.includes("verifyIdToken(token, true)"));
  }
  const indexes = JSON.parse(read("firestore.indexes.json"));
  const override = indexes.fieldOverrides.find((entry) =>
    entry.collectionGroup === "licenseHistory" && entry.fieldPath === "timestamp");
  assert.deepEqual(override.indexes, [
    {order: "ASCENDING", queryScope: "COLLECTION"},
    {order: "DESCENDING", queryScope: "COLLECTION"},
    {order: "DESCENDING", queryScope: "COLLECTION_GROUP"},
  ]);
});

test("audit reader is bounded, authenticated, source-specific and read-only", () => {
  const service = read("functions/src/services/vendorAuditReadModel.ts");
  for (const requirement of ["createCipheriv", "createDecipheriv", "aes-256-gcm",
    "filterFingerprint", "limit(query.limit + 1)", "Promise.all",
    'collection("vendorAuditLogs")', 'collection("vendorCalibrationLogs")',
    'collection("vendor/stripeEvents/events")', 'collection("billingSnapshots")',
    'collectionGroup("licenseHistory")', "validateCalibrationOperationResult",
    "SOURCE_INVALID", "publicId"]) {
    assert.ok(service.includes(requirement), requirement);
  }
  assert.doesNotMatch(service, /transaction\.(?:create|delete|set|update)\(/u);
  assert.doesNotMatch(service, /\.doc\([^\n]+\)\.(?:create|delete|set|update)\(/u);
  assert.doesNotMatch(service, /getFirestore\(/u);
});
