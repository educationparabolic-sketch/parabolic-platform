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

test("BWM-034 registers the exact secured institute route boundary", async () => {
  const manifestPath = join(rootDirectory, "functions/src/apiRouteManifest.ts");
  const manifestSource = await readFile(manifestPath, "utf8");
  const {API_ROUTE_MANIFEST} = loadTypeScriptModule(manifestSource, manifestPath);
  const routes = API_ROUTE_MANIFEST.filter((route) => /^VEN-(?:0[7-9]|1[0-6])$/u.test(route.id));

  assert.deepEqual(
    routes.map(({id, method, currentFrontendPath}) => [id, method, currentFrontendPath]),
    [
      ["VEN-07", "GET", "/vendor/institutes"],
      ["VEN-08", "POST", "/vendor/institutes"],
      ["VEN-09", "GET", "/vendor/institutes/{instituteId}"],
      ["VEN-10", "PATCH", "/vendor/institutes/{instituteId}"],
      ["VEN-11", "POST", "/vendor/institutes/{instituteId}/lifecycle"],
      ["VEN-12", "GET", "/vendor/onboarding"],
      ["VEN-13", "POST", "/vendor/onboarding"],
      ["VEN-14", "GET", "/vendor/onboarding/{onboardingId}"],
      ["VEN-15", "POST", "/vendor/onboarding/{onboardingId}/commands"],
      ["VEN-16", "POST", "/vendor/institutes/{instituteId}/administrators/commands"],
    ],
  );
  routes.forEach((route) => {
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.equal(route.functionExport, "vendorInstitutes");
  });
});

test("Vendor institute transport derives current Auth and exact capability authority", async () => {
  const source = await read("functions/src/api/vendorInstitutes.ts");
  for (const requiredBoundary of [
    "verifyIdToken(idToken, true)",
    "getUser(identity.uid)",
    "user.disabled",
    "claims.isSuspended === true",
    '"vendor.institutes.read"',
    '"vendor.institutes.manage_lifecycle"',
    "assertVendorCapability(request, capability)",
    "request.params.instituteId",
    "request.params.onboardingId",
    "buildSuccessResponse",
    "VendorInstituteValidationError",
  ]) {
    assert.ok(source.includes(requiredBoundary), requiredBoundary);
  }
  assert.match(source, /\.\.\.\(bodyRecord\(request\)[\s\S]*?\.\.\.context/u);
  assert.match(source, /\.\.\.context,[\s\S]*?instituteId/u);
});

test("shared Vendor intent omits actor, status, audit, and timestamp authority", async () => {
  const contract = await read("shared/contracts/vendorInstitutes.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);

  const onboardingIntent = contract.slice(
    contract.indexOf("export interface VendorOnboardingApplicationIntent"),
    contract.indexOf("export interface VendorOnboardingSummary"),
  );
  for (const forbiddenAuthority of [
    "actorUserId",
    "auditEventId",
    "createdAt",
    "instituteId",
    "lifecycleState",
    "revision",
    "status",
    "updatedAt",
  ]) {
    assert.doesNotMatch(onboardingIntent, new RegExp(forbiddenAuthority, "u"));
  }

  for (const requiredBoundary of [
    "VendorCommandMetadata",
    "VendorRevisionedCommandMetadata",
    "expectedRevision: number",
    "idempotencyKey: string",
    "VendorInstituteCreateIntent",
    "VendorInstituteProfileUpdateIntent",
    "VendorInstituteLifecycleIntent",
    "VendorInstituteLifecycleTransition",
    "VendorOnboardingCreateIntent",
    "VendorOnboardingCommandIntent",
    "VendorOnboardingTransition",
    "VendorAdministratorCommandIntent",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
});

test("Vendor read contracts are bounded, nullable, and commercially read-only", async () => {
  const contract = await read("shared/contracts/vendorInstitutes.d.ts");

  for (const requiredBoundary of [
    "Defaults to 25 and may not exceed 50",
    "nextCursor: string | null",
    "totalMatching: number",
    "activeStudentCount: number | null",
    "aggregateAsOf: string | null",
    'authorityState: "available" | "not_configured" | "invalid"',
    "licenseLayer: VendorInstituteLicenseLayer | null",
    "administrators: VendorInstituteAdministratorRecord[]",
    "existing 100-record settingsUsers limit",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
  assert.doesNotMatch(contract, /paymentStatus|invoice|offlinePayment|subscriptionStatus/u);
});

test("lifecycle, deletion, onboarding, and administrator ownership fail closed", async () => {
  const contract = await read("shared/contracts/vendorInstitutes.d.ts");

  for (const requiredBoundary of [
    'action: "suspend"',
    'action: "restore"',
    'action: "archive"',
    'action: "schedule_deletion"',
    'action: "cancel_deletion"',
    'action: "execute_purge" | "retry_purge"',
    'action: "schedule_deletion"; from: "archived"; to: "deletion_scheduled"',
    'action: "retry_purge"; from: "recovery_required"; to: "purging"',
    'action: "submit"; from: "draft" | "information_required"; to: "pending_review"',
    'action: "activate"; from: "ready_for_activation"; to: "active"',
    '"reconcile_prerequisites"',
    "eventsCursor?: string",
    "eventsLimit?: number",
    "propagation: VendorInstituteClaimPropagationReceipt",
    "propagationState: VendorInstituteClaimPropagationState",
    'commercialReadiness: "not_configured" | "configured" | "invalid"',
    '"invite_primary" | "propose_primary_replacement"',
    '"revoke_primary_invitation"',
    '"activate_primary_replacement"',
    'reconciliationState: "complete" | "pending" | "blocked_missing_entitlement"',
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }

  assert.doesNotMatch(contract, /mark_payment_received|approve_license|send_proposal/u);
  assert.doesNotMatch(contract, /mark_invitation_accepted/u);
});

test("institute read model is bounded and avoids operational collection scans", async () => {
  const source = await read("functions/src/services/vendorInstituteReadModels.ts");
  assert.match(source, /\.limit\(request\.limit \+ 1\)/u);
  assert.match(source, /filteredQuery\.count\(\)\.get\(\)/u);
  assert.match(source, /firestore\.getAll/u);
  assert.match(source, /where\(\s*"vendorLifecycleState"/u);
  assert.match(source, /where\(\s*"vendorLicenseLayer"/u);
  assert.match(source, /"vendorFilterKeys",\s*"array-contains"/u);
  assert.match(source, /orderBy\("updatedAt", "desc"\)/u);
  assert.match(source, /FieldPath\.documentId\(\), "desc"/u);
  assert.doesNotMatch(source, /collectionGroup|STUDENTS_COLLECTION|RUNS_COLLECTION|SESSIONS_COLLECTION/u);
});

test("institute commands use revisioned replay, dual audits, and reservation-only purge", async () => {
  const source = await read("functions/src/services/vendorInstituteCommands.ts");
  for (const requiredBoundary of [
    'const ROOT_COMMANDS_COLLECTION = "vendorInstituteCommands"',
    'const INSTITUTE_COMMANDS_COLLECTION = "vendorCommands"',
    'const ROOT_AUDIT_COLLECTION = "vendorAuditLogs"',
    'const INSTITUTE_AUDIT_COLLECTION = "auditLogs"',
    "RETENTION_PERIOD_MILLIS = 30 * 24 * 60 * 60 * 1000",
    "idempotencyKeyHash",
    "fingerprint",
    "transaction.create(rootAuditReference, audit)",
    "transaction.create(instituteAuditReference, audit)",
    "this.propagationCoordinator.stageOperation",
    'propagationSource = "institute_suspended"',
    'workerState: "reserved"',
    'checkpoint: "retention_and_legal_hold_verified"',
    "deletionLegalHold",
  ]) {
    assert.ok(source.includes(requiredBoundary), requiredBoundary);
  }
  assert.match(source, /runTransaction/u);
  assert.match(source, /current\.revision !== request\.command\.expectedRevision/u);
  assert.match(source, /sha256\(`\$\{actorId\}:\$\{scope\}:\$\{idempotencyKey\}`\)/u);
  assert.doesNotMatch(source, /recursiveDelete|transaction\.delete|complete_purge|fail_purge/u);
});

test("onboarding is bounded, revisioned, and derives rather than accepts prerequisites", async () => {
  const source = await read("functions/src/services/vendorOnboarding.ts");
  for (const requiredBoundary of [
    ".limit(request.limit + 1)",
    "filteredQuery.count().get()",
    ".limit(request.eventsLimit + 1)",
    '"onboardingFilterKeys"',
    'orderBy("updatedAt", "desc")',
    'orderBy("occurredAt", "desc")',
    'const COMMANDS_COLLECTION = "commands"',
    'const EVENTS_COLLECTION = "events"',
    'const ROOT_AUDIT_COLLECTION = "vendorAuditLogs"',
    'const CURRENT_LICENSE_DOCUMENT = "current"',
    'const ACADEMIC_YEARS_COLLECTION = "academicYears"',
    'action === "reconcile_prerequisites"',
    'commercialReadiness !== "configured"',
    "primaryAdministratorReady",
    "initialSettingsReady",
    "request.command.expectedRevision",
    "idempotencyKeyHash",
    "receiptHash",
    "transaction.create(rootAuditReference, audit)",
  ]) {
    assert.ok(source.includes(requiredBoundary), requiredBoundary);
  }
  assert.match(source, /runTransaction/u);
  assert.doesNotMatch(source, /collectionGroup|STUDENTS_COLLECTION|RUNS_COLLECTION|SESSIONS_COLLECTION/u);
  assert.doesNotMatch(source, /mark_payment_received|approve_license|send_proposal|invoice|subscription/u);
});

test("primary-administrator commands preserve two-stage Auth and redacted recovery authority", async () => {
  const service = await read("functions/src/services/vendorAdministrators.ts");
  const communication = await read("functions/src/services/vendorAdministratorCommunication.ts");
  const emailQueueTrigger = await read("functions/src/triggers/emailQueue.ts");
  for (const requiredBoundary of [
    'pendingPrimaryAdministrator',
    'primaryAdminUserId',
    'settingsUsers',
    'settingsRevision',
    'invite_primary',
    'propose_primary_replacement',
    'activate_primary_replacement',
    'revoke_primary_invitation',
    'user.emailVerified',
    'user.metadata.lastSignInTime',
    'clearClaimsAndRevokeSessions',
    'claimsWithheld',
    'synchronizeClaimsAndRevokeSessions',
    'blocked_missing_entitlement',
    'transaction.create(rootAuditReference, audit)',
    'transaction.create(instituteAuditReference, audit)',
    'idempotencyKeyHash',
    'receiptHash',
  ]) {
    assert.ok(service.includes(requiredBoundary), requiredBoundary);
  }
  for (const requiredBoundary of [
    'source: SOURCE',
    'generateEmailVerificationLink',
    'generatePasswordResetLink',
    'providerMessageIdHash',
    'invitation_revoked',
    'primary_authority_changed',
    'MAX_RETRIES = 5',
  ]) {
    assert.ok(communication.includes(requiredBoundary), requiredBoundary);
  }
  assert.match(service, /runTransaction/u);
  assert.match(emailQueueTrigger, /vendorAdministratorCommunicationService\.processDueCommunications\(50\)/u);
  assert.doesNotMatch(service, /deleteUser|mark_payment_received|approve_license|invoice|subscription/u);
  assert.doesNotMatch(communication, /actionLink\s*:|password\s*:|credential\s*:/u);
});
