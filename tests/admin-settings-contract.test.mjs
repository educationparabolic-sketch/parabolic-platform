import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFile(join(rootDirectory, path), "utf8");

const removedActions = [
  "REQUEST_ACADEMIC_YEAR_ARCHIVE",
  "REQUEST_GOVERNANCE_SNAPSHOT",
  "UPDATE_DATA_RETENTION_POLICY",
  "UPDATE_EXECUTION_POLICY",
  "UPDATE_FEATURE_FLAGS",
];

test("Admin settings uses one shared, institute-owned action contract", async () => {
  const [contract, backendTypes, backendApi, backendService, frontend] = await Promise.all([
    read("shared/contracts/adminSettings.d.ts"),
    read("functions/src/types/adminSettings.ts"),
    read("functions/src/api/adminSettings.ts"),
    read("functions/src/services/adminSettings.ts"),
    read("apps/admin/src/features/settings/settingsDataset.ts"),
  ]);

  for (const action of removedActions) {
    assert.doesNotMatch(contract, new RegExp(`"${action}"`));
    assert.doesNotMatch(backendService, new RegExp(`"${action}"`));
    assert.doesNotMatch(frontend, new RegExp(`"${action}"`));
  }

  assert.match(backendTypes, /shared\/contracts\/adminSettings/);
  assert.match(frontend, /shared\/contracts\/adminSettings/);
  assert.doesNotMatch(contract, /AdminStaffRole =[^;]*"support"/s);

  const publicRequest = backendTypes.slice(
    backendTypes.indexOf("export interface AdminSettingsRequest"),
    backendTypes.indexOf("export interface AdminSettingsValidatedRequest"),
  );
  const frontendPayload = frontend.slice(
    frontend.indexOf("async function settingsAction"),
    frontend.indexOf("function requireLiveMutation"),
  );
  assert.doesNotMatch(publicRequest, /instituteId|actorId|primaryAdminUserId/);
  assert.doesNotMatch(frontendPayload, /instituteId|actorId|primaryAdminUserId/);
  assert.match(backendApi, /instituteId: identity\?\.instituteId/);
});

test("Admin settings command contracts make replay and authority explicit", async () => {
  const contract = await read("shared/contracts/adminSettings.d.ts");

  for (const requiredDeclaration of [
    "AdminSettingsCommandMetadata",
    "commandId: string",
    "expectedRevision: number",
    "AdminSettingsCommandReceipt",
    "replayed: boolean",
    "AdminSettingsResolvedAuthority",
    "primaryAdminUserId: string",
    "AdminSettingsAuditPage",
    "nextCursor: string | null",
    "AdminSettingsCommunicationReceipt",
    "AdminAcademicYearArchiveIntent",
    "confirmIrreversibleArchive: true",
    "AdminAcademicYearArchiveReceipt",
  ]) {
    assert.ok(contract.includes(requiredDeclaration), requiredDeclaration);
  }

  const publicIntent = contract.slice(
    contract.indexOf("export type AdminSettingsMutationIntent"),
    contract.indexOf("export type AdminSettingsAuditArea"),
  );
  assert.doesNotMatch(publicIntent, /actorUserId|instituteId|primaryAdminUserId/);
});

test("Admin settings snapshot and supported mutations are strict, bounded, and atomic", async () => {
  const [contract, backend, frontend, workspace] = await Promise.all([
    read("shared/contracts/adminSettings.d.ts"),
    read("functions/src/services/adminSettings.ts"),
    read("apps/admin/src/features/settings/settingsDataset.ts"),
    read("apps/admin/src/features/settings/AdminSettingsWorkspace.tsx"),
  ]);

  for (const declaration of [
    "AdminSettingsSnapshot",
    "revision: number",
    "sessionPolicy: AdminSessionPolicyUpdate",
    "audit: AdminSettingsAuditPage",
  ]) {
    assert.ok(contract.includes(declaration), declaration);
  }

  assert.match(backend, /runTransaction/);
  assert.match(backend, /SETTINGS_COMMANDS_COLLECTION/);
  assert.match(backend, /\.limit\(MAX_ACADEMIC_YEARS \+ 1\)/);
  assert.match(backend, /\.limit\(MAX_AUDIT_ENTRIES \+ 1\)/);
  assert.doesNotMatch(backend, /STUDENTS_COLLECTION|defaultExecutionPolicy|defaultFeatureFlags/);
  assert.doesNotMatch(frontend, /toNumberOrZero|executionPolicy|dataArchiveControls|featureFlags/);
  assert.doesNotMatch(workspace, /FileReader|readAsDataURL|settings-logo-upload|localAudit/);
  assert.match(workspace, /Fixture settings loaded read-only/);
});

test("Admin staff commands keep identity authority on the server", async () => {
  const [contract, backendTypes, backend, frontend, workspace] = await Promise.all([
    read("shared/contracts/adminSettings.d.ts"),
    read("functions/src/types/adminSettings.ts"),
    read("functions/src/services/adminSettings.ts"),
    read("apps/admin/src/features/settings/settingsDataset.ts"),
    read("apps/admin/src/features/settings/AdminSettingsWorkspace.tsx"),
  ]);

  assert.match(contract, /AdminStaffLifecycleStatus/);
  assert.match(contract, /isPrimaryAdministrator: boolean/);
  assert.match(contract, /targetUserId\?: string/);
  assert.match(backendTypes, /invitation\?:/);
  assert.match(backendTypes, /staffUpdate\?:/);
  assert.doesNotMatch(backendTypes, /userAccess\?:/);
  assert.match(backend, /createUser/);
  assert.match(backend, /updateUser/);
  assert.match(backend, /primaryAdminUserId/);
  assert.match(backend, /At least one active administrator must remain/);
  assert.match(frontend, /invitation/);
  assert.match(frontend, /targetUserId/);
  assert.doesNotMatch(workspace, /staff_\$\{Date\.now\(\)\}/);
  assert.doesNotMatch(workspace, /Password reset email requested/);
});

test("Admin settings communications are provider-backed, retryable, deduplicated, and link-safe", async () => {
  const [contract, backendTypes, settingsService, communicationService, provider, trigger, index, frontend, workspace] = await Promise.all([
    read("shared/contracts/adminSettings.d.ts"),
    read("functions/src/types/adminSettings.ts"),
    read("functions/src/services/adminSettings.ts"),
    read("functions/src/services/adminSettingsCommunication.ts"),
    read("functions/src/services/emailDeliveryProvider.ts"),
    read("functions/src/triggers/emailQueue.ts"),
    read("functions/src/index.ts"),
    read("apps/admin/src/features/settings/settingsDataset.ts"),
    read("apps/admin/src/features/settings/AdminSettingsWorkspace.tsx"),
  ]);

  assert.match(contract, /AdminSettingsCommunicationReceipt/);
  assert.match(backendTypes, /communication\?: AdminSettingsCommunicationReceipt/);
  assert.match(settingsService, /buildAdminSettingsCommunicationDocument/);
  assert.match(settingsService, /transaction\.create\(communicationReference/);
  assert.match(communicationService, /generatePasswordResetLink/);
  assert.match(communicationService, /RETRY_DELAYS_MS = \[60_000, 300_000, 900_000, 3_600_000, 21_600_000\]/);
  assert.match(communicationService, /status: "processing"/);
  assert.match(communicationService, /providerMessageIdHash/);
  assert.match(provider, /api\.sendgrid\.com\/v3\/mail\/send/);
  assert.match(provider, /EMAIL_FROM_ADDRESS/);
  assert.match(trigger, /every 1 minutes/);
  assert.match(index, /export \{processEmailQueue\}/);
  assert.match(frontend, /normalizeCommunication/);
  assert.match(workspace, /Invitation email queued/);
  assert.match(workspace, /password-reset email queued/);
  assert.doesNotMatch(workspace, /delivery is not yet configured/);

  const publicResult = backendTypes.slice(
    backendTypes.indexOf("export interface AdminSettingsResult"),
  );
  assert.doesNotMatch(publicResult, /actionLink|passwordResetLink|credential|providerKey/);
});

test("Academic-year lock and archive use durable commands and the mounted Admin endpoint", async () => {
  const [contract, settingsService, archiveService, archiveApi, frontend, workspace, partition] = await Promise.all([
    read("shared/contracts/adminSettings.d.ts"),
    read("functions/src/services/adminSettings.ts"),
    read("functions/src/services/archivePipeline.ts"),
    read("functions/src/api/adminAcademicYearArchive.ts"),
    read("apps/admin/src/features/settings/settingsDataset.ts"),
    read("apps/admin/src/features/settings/AdminSettingsWorkspace.tsx"),
    read("functions/src/services/dataTierPartition.ts"),
  ]);

  assert.match(contract, /AdminAcademicYearArchiveReceipt/);
  assert.match(contract, /stage: AdminAcademicYearArchiveStage/);
  assert.match(settingsService, /every run and session is terminal/);
  assert.match(settingsService, /transaction\.create\(commandReference/);
  assert.match(archiveService, /checkpointStage/);
  assert.match(archiveService, /Archive export row count conflicts/);
  assert.match(archiveService, /transaction\.create\(authority\.settingsAuditReference/);
  assert.match(archiveApi, /targetInstituteId/);
  assert.match(frontend, /\/admin\/academicYear\/archive/);
  assert.match(frontend, /confirmIrreversibleArchive: true/);
  assert.match(workspace, /Archive Academic Year/);
  assert.match(workspace, /irreversible archive workflow/i);
  assert.doesNotMatch(workspace, /Archive request queued locally/);
  assert.match(partition, /return "WARM"/);
});

test("Mounted settings installs only reloaded authority and exposes removed-action boundaries", async () => {
  const [frontend, workspace, app, routes, settingsApi, archiveApi] = await Promise.all([
    read("apps/admin/src/features/settings/settingsDataset.ts"),
    read("apps/admin/src/features/settings/AdminSettingsWorkspace.tsx"),
    read("apps/admin/src/App.tsx"),
    read("apps/admin/src/portals/adminRoutes.ts"),
    read("functions/src/api/adminSettings.ts"),
    read("functions/src/api/adminAcademicYearArchive.ts"),
  ]);

  assert.match(frontend, /normalizeCommandReceipt/);
  assert.match(frontend, /reconcileMutation/);
  assert.match(frontend, /const snapshot = await fetchSettingsSnapshot\(\)/);
  assert.match(frontend, /audit\.items\.some\(\(entry\) => entry\.eventId === receipt\.auditEventId\)/);
  assert.match(workspace, /applyAuthoritativeSnapshot/);
  assert.doesNotMatch(workspace, /applyLocalSnapshot|resolveAdminInstituteId/);
  assert.match(workspace, /Tenant derived from authenticated server identity/);
  assert.match(workspace, /additional history exists outside this bounded settings snapshot/);
  assert.match(workspace, /Settings action unavailable/);
  assert.match(app, /path="settings\/execution-policy"[\s\S]*?<AdminSettingsWorkspace \/>/);
  assert.doesNotMatch(app, /path="settings\/(?:execution-policy|data|system)" element=\{<Navigate/);
  assert.match(routes, /ADMIN_SETTINGS_READ_POLICY/);
  assert.match(routes, /roleMinimumLicenseLayers/);
  assert.match(settingsApi, /createCapabilityAuthorizationMiddleware/);
  assert.match(settingsApi, /roleMinimumLicenseLayers: \{director: "L3"\}/);
  assert.match(archiveApi, /createCapabilityAuthorizationMiddleware/);
});

test("Admin settings permanent proof spans bounded audits, races, emulators, and a no-mock browser", async () => {
  const [
    rootPackage,
    runner,
    browserProof,
    settingsTests,
    archiveTests,
  ] = await Promise.all([
    read("package.json"),
    read("scripts/run-admin-settings-e2e.mjs"),
    read("tests/e2e/admin-settings.spec.mjs"),
    read("functions/src/tests/adminSettings.test.ts"),
    read("functions/src/tests/archivePipeline.test.ts"),
  ]);

  assert.match(rootPackage, /"test:admin-settings:proof"/);
  assert.match(rootPackage, /"test:e2e:admin-settings"/);
  assert.match(runner, /VITE_DATA_MODE: "live"/);
  assert.match(runner, /auth,firestore,functions:apiV1,hosting:portal/);
  assert.match(runner, /npm run test:e2e:admin-settings/);
  assert.match(settingsTests, /exactly fifty newest events and a cursor sentinel/);
  assert.match(settingsTests, /concurrent academic-year locks commit one command and one audit/);
  assert.match(archiveTests, /concurrent archive commands reserve and finalize exactly one authority/);

  for (const permanentScenario of [
    "UPDATE_INSTITUTE_PROFILE",
    "UPDATE_SECURITY_SETTINGS",
    "LOCK_ACADEMIC_YEAR",
    "Send Reset Email",
    "Settings action unavailable",
    "settingsRevision",
    "customClaims",
    "externalRequests",
  ]) {
    assert.ok(browserProof.includes(permanentScenario), permanentScenario);
  }
  assert.doesNotMatch(browserProof, /page\.route|route\.fulfill/);
});
