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

test("support contract separates public intent from server authority", async () => {
  const contract = await read("shared/contracts/adminSupport.d.ts");

  for (const requiredType of [
    "AdminSupportTicketCreateRequest",
    "AdminSupportTicketCommandRequest",
    "VendorSupportTicketCommandRequest",
    "AdminSupportTicketListResult",
    "VendorSupportTicketListResult",
    "AdminSupportTicketDetailResult",
    "VendorSupportTicketDetailResult",
    "SupportAttachmentDownloadResult",
    "SupportNotificationReceipt",
    "SupportAuditEventContract",
  ]) {
    assert.ok(contract.includes(requiredType), requiredType);
  }

  const adminIntent = contract.slice(
    contract.indexOf("export interface AdminSupportTicketCreateRequest"),
    contract.indexOf("export type AdminSupportLifecycleAction"),
  );
  for (const forbiddenAuthority of [
    "actorRole",
    "actorUserId",
    "assignedOperatorUserId",
    "assignedTeam",
    "authorType",
    "createdAt",
    "instituteId",
    "status",
    "updatedAt",
  ]) {
    assert.doesNotMatch(adminIntent, new RegExp(forbiddenAuthority));
  }
  for (const requiredIntent of [
    "attachments: SupportAttachmentUploadIntent[]",
    "category: SupportCategory",
    "description: string",
    "idempotencyKey: string",
    "priority: SupportPriority",
    "sourceRoute: string",
    "subject: string",
  ]) {
    assert.ok(adminIntent.includes(requiredIntent), requiredIntent);
  }

  const adminAuthority = contract.slice(
    contract.indexOf("export interface AdminSupportResolvedAuthority"),
    contract.indexOf("export interface VendorSupportResolvedAuthority"),
  );
  assert.match(adminAuthority, /actorRole: "admin" \| "director" \| "teacher"/u);
  assert.match(adminAuthority, /actorUserId: string/u);
  assert.match(adminAuthority, /instituteId: string/u);
  assert.match(contract, /actorRole: "vendor"/u);
});

test("support attachment, pagination, replay, notification, and audit boundaries are strict", async () => {
  const contract = await read("shared/contracts/adminSupport.d.ts");

  for (const policy of [
    "maxAttachmentCount: 5",
    "maxAttachmentSizeBytes: 1048576",
    "maxTotalAttachmentBytes: 5242880",
    '"image/jpeg"',
    '"image/png"',
    '"image/webp"',
    '"application/pdf"',
  ]) {
    assert.ok(contract.includes(policy), policy);
  }
  assert.doesNotMatch(contract, /text\/csv|spreadsheetml|application\/zip/u);

  const publicAttachment = contract.slice(
    contract.indexOf("export interface SupportAttachmentRecord"),
    contract.indexOf("export interface SupportAttachmentDownloadResult"),
  );
  assert.doesNotMatch(
    publicAttachment,
    /bucket|gsUri|objectPath|storagePath|url:/u,
  );
  assert.match(contract, /nextCursor: string \| null/u);
  assert.match(contract, /messageCursor\?: string/u);
  assert.match(contract, /expectedRevision: number/u);
  assert.match(contract, /SupportCommandDisposition = "applied" \| "replayed"/u);
  assert.match(contract, /notification: SupportNotificationReceipt/u);

  const notificationContract = contract.slice(
    contract.indexOf("export type SupportNotificationKind"),
    contract.indexOf("export interface AdminSupportTicketCommandResult"),
  );
  assert.doesNotMatch(notificationContract, /body|contentBase64|fileName/u);

  const auditContract = contract.slice(
    contract.indexOf("export interface SupportAuditEventContract"),
    contract.indexOf("export interface AdminSupportResolvedAuthority"),
  );
  assert.doesNotMatch(auditContract, /body|contentBase64|fileName/u);
});

test("support routes preserve their ordered implementation boundary", async () => {
  const manifestPath = join(rootDirectory, "functions/src/apiRouteManifest.ts");
  const manifestSource = await readFile(manifestPath, "utf8");
  const {API_ROUTE_MANIFEST} = loadTypeScriptModule(manifestSource, manifestPath);
  const expectedRoutes = new Map([
    ["ADM-56", ["GET", "/admin/support/tickets"]],
    ["ADM-57", ["POST", "/admin/support/tickets"]],
    ["ADM-58", ["GET", "/admin/support/tickets/{ticketId}"]],
    ["ADM-59", ["POST", "/admin/support/tickets/{ticketId}/commands"]],
    ["ADM-60", ["GET", "/admin/support/tickets/{ticketId}/attachments/{attachmentId}/download"]],
    ["VEN-03", ["GET", "/vendor/support/tickets"]],
    ["VEN-04", ["GET", "/vendor/support/tickets/{ticketId}"]],
    ["VEN-05", ["POST", "/vendor/support/tickets/{ticketId}/commands"]],
    ["VEN-06", ["GET", "/vendor/support/tickets/{ticketId}/attachments/{attachmentId}/download"]],
  ]);

  for (const [routeId, [method, path]] of expectedRoutes) {
    const route = API_ROUTE_MANIFEST.find((candidate) => candidate.id === routeId);
    assert.ok(route, routeId);
    assert.equal(route.method, method);
    assert.equal(route.currentFrontendPath, path);
    assert.equal(route.canonicalPath, `/api/v1${path}`);
    assert.equal(route.declaration, "planned");
    assert.equal(
      route.status,
      "implemented",
    );
    assert.equal(
      route.functionExport,
      routeId.startsWith("ADM-") ? "adminSupport" : "vendorSupport",
    );
  }
});

test("support backend owns identity, replay, notifications, operator authority, audit, and private attachments", async () => {
  const [api, vendorApi, service, notifications, attachments, worker, storageRules] = await Promise.all([
    read("functions/src/api/adminSupport.ts"),
    read("functions/src/api/vendorSupport.ts"),
    read("functions/src/services/adminSupport.ts"),
    read("functions/src/services/supportNotifications.ts"),
    read("functions/src/services/supportAttachments.ts"),
    read("functions/src/triggers/emailQueue.ts"),
    read("storage.rules"),
  ]);

  assert.match(api, /identity\?\.instituteId/u);
  assert.match(api, /allowedRoles: \["teacher", "admin", "director"\]/u);
  assert.match(api, /minimumLicenseLayer: "L0"/u);
  assert.match(api, /roleMinimumLicenseLayers: \{director: "L3"\}/u);
  assert.doesNotMatch(api, /instituteId:\s*body\./u);
  for (const requiredAuthority of [
    "supportTickets",
    "supportCommands",
    "supportTicketStats",
    "auditLogs",
    "runTransaction",
    "expectedRevision",
    "idempotencyKeyHash",
    "fingerprint",
    "FieldPath.documentId()",
    "filterKeys",
  ]) {
    assert.ok(service.includes(requiredAuthority), requiredAuthority);
  }
  assert.match(vendorApi, /allowedRoles: \["vendor"\]/u);
  assert.match(vendorApi, /getUser/u);
  assert.match(service, /vendorAuditLogs/u);
  assert.match(service, /vendorFilterKeys/u);
  assert.match(service, /SUPPORT_REPLY_ADDED/u);
  assert.match(notifications, /source: SOURCE/u);
  assert.match(notifications, /processDueNotifications/u);
  assert.match(notifications, /providerMessageIdHash/u);
  assert.doesNotMatch(notifications, /contentBase64|fileName|attachments:/u);
  assert.match(worker, /supportNotificationService/u);
  for (const requiredAttachmentAuthority of [
    "ifGenerationMatch: 0",
    "contentBase64",
    "contentSha256",
    "hasSignature",
    "supportAttachments",
    "cleanupAfter",
    "deleteAfter",
    "getSignedUrl",
    "ATTACHMENT_DOWNLOADED",
  ]) {
    assert.ok(attachments.includes(requiredAttachmentAuthority), requiredAttachmentAuthority);
  }
  assert.match(storageRules, /allow read, write: if false/u);
  assert.doesNotMatch(attachments, /emailQueue/u);
});

test("support authorization capabilities preserve institute and operator boundaries", async () => {
  const matrixPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
  const matrixSource = await readFile(matrixPath, "utf8");
  const {CAPABILITY_MATRIX} = loadTypeScriptModule(matrixSource, matrixPath);

  assert.deepEqual(CAPABILITY_MATRIX["admin.support.manage"], {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: {director: "L3"},
  });
  assert.deepEqual(CAPABILITY_MATRIX["vendor.support.manage"], {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  });
});

test("mounted Admin support consumes strict APIs without browser authority or fallback state", async () => {
  const [dataset, page, routes] = await Promise.all([
    read("apps/admin/src/features/support/supportDataset.ts"),
    read("apps/admin/src/features/support/AdminHelpSupportPage.tsx"),
    read("apps/admin/src/portals/adminRoutes.ts"),
  ]);

  for (const path of [
    '"/admin/support/tickets"',
    "/attachments/${encodeURIComponent(attachmentId)}/download",
    "/commands",
  ]) {
    assert.ok(dataset.includes(path), path);
  }
  for (const authority of [
    "listResult",
    "detailResult",
    "commandResult",
    "reconcileSupportMutation",
    "crypto.subtle.digest",
    "MAX_ATTACHMENT_COUNT = 5",
    "MAX_ATTACHMENT_SIZE_BYTES = 1_048_576",
  ]) {
    assert.ok(dataset.includes(authority), authority);
  }
  assert.doesNotMatch(dataset, /localStorage|FALLBACK_TICKETS|shouldUseFixtureData/u);
  assert.doesNotMatch(page, /resolveAdminInstituteId|session\.user|navigator\.userAgent/u);
  assert.doesNotMatch(page, /\.csv|\.xlsx/u);
  assert.doesNotMatch(page, /authorType\s*:|assignedTeam\s*:/u);
  assert.match(page, /Loading authoritative requests/u);
  assert.match(page, /No authoritative requests match/u);
  assert.match(page, /Retry loading/u);
  assert.match(page, /Previous messages/u);
  assert.match(page, /notification \$\{result\.notification\.status\}/u);
  assert.match(routes, /ADMIN_SUPPORT_POLICY/u);
  assert.match(routes, /roleMinimumLicenseLayers: ADMIN_SUPPORT_POLICY\.roleMinimumLicenseLayers/u);
});

test("permanent support proof spans security, failures, persistence, pagination, Storage, and a no-mock browser", async () => {
  const [
    rootPackage,
    runner,
    browserProof,
    adminServiceProof,
    adminApiProof,
    vendorServiceProof,
  ] = await Promise.all([
    read("package.json"),
    read("scripts/run-admin-support-e2e.mjs"),
    read("tests/e2e/admin-support.spec.mjs"),
    read("functions/src/tests/adminSupport.test.ts"),
    read("functions/src/tests/adminSupportApi.test.ts"),
    read("functions/src/tests/vendorSupport.test.ts"),
  ]);

  assert.match(rootPackage, /"test:admin-support:proof"/u);
  assert.match(rootPackage, /"test:admin-support:e2e"/u);
  assert.match(rootPackage, /"test:e2e:admin-support"/u);
  assert.match(runner, /VITE_DATA_MODE: "live"/u);
  assert.match(runner, /auth,firestore,functions:apiV1,hosting:portal,storage/u);
  assert.match(runner, /SUPPORT_ATTACHMENTS_BUCKET/u);
  assert.match(runner, /SUPPORT_NOTIFICATION_EMAIL/u);
  assert.match(runner, /npm run test:e2e:admin-support/u);
  assert.doesNotMatch(browserProof, /page\.route\(|context\.route\(|route\.fulfill\(/u);

  for (const permanentScenario of [
    "lowDirector",
    "suspended",
    "incomplete",
    "grace",
    "expired",
    "noTenant",
    "otherAdmin",
    "Concurrent institute reply A",
    "disposition).toBe(\"replayed\")",
    "supportAttachments",
    "Next messages",
    "browser.newContext",
    "Object.keys(localStorage)",
    "externalRequests",
  ]) {
    assert.ok(browserProof.includes(permanentScenario), permanentScenario);
  }
  assert.match(adminServiceProof, /concurrent commands against one expected revision commit at most once/u);
  assert.match(adminServiceProof, /bounded filter-bound cursors/u);
  assert.match(adminServiceProof, /direct browser-style support attachment Storage writes remain denied/u);
  assert.match(adminServiceProof, /private create-only objects with replay-safe opaque metadata/u);
  assert.match(adminApiProof, /enforces Director L3 and active entitlement/u);
  assert.match(vendorServiceProof, /support notification provider failures use bounded retry authority/u);
});
