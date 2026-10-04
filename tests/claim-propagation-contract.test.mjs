import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const contractPath = join(rootDirectory, "shared/contracts/claimPropagation.d.ts");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

test("BWM-036 propagation contract is dependency-free and type-valid", async () => {
  const source = await readFile(contractPath, "utf8");
  const result = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: "claimPropagation.ts",
    reportDiagnostics: true,
  });

  assert.deepEqual(result.diagnostics ?? [], []);
  assert.doesNotMatch(source, /^import\s/mu);
});

test("propagation freezes exact bounds, retry policy, and two-stage SLA", async () => {
  const source = await readFile(contractPath, "utf8");
  for (const boundary of [
    "CLAIM_PROPAGATION_SCHEMA_VERSION: 1",
    "CLAIM_PROPAGATION_PAGE_SIZE: 100",
    "CLAIM_PROPAGATION_LEASE_SECONDS: 60",
    "CLAIM_PROPAGATION_MAX_ATTEMPTS: 5",
    "readonly [5, 15, 30, 60]",
    "CLAIM_PROPAGATION_SERVER_SLA_SECONDS: 240",
    "CLAIM_PROPAGATION_BROWSER_SLA_SECONDS: 300",
    "CLAIM_PROPAGATION_TOKEN_REFRESH_SECONDS: 60",
    "CLAIM_PROPAGATION_SCHEDULE_MINUTES: 1",
    "CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS: 100",
    "pageSize: 100",
    "maxAttempts: 5",
  ]) {
    assert.ok(source.includes(boundary), boundary);
  }
});

test("operation and delivery authority is durable, bounded, and recoverable", async () => {
  const source = await readFile(contractPath, "utf8");
  for (const boundary of [
    "ClaimPropagationDesiredAuthority",
    "authorizationVersion: number",
    "activeStudentLimit: number",
    "concurrentSessionLimit: number",
    "ClaimPropagationOperationState",
    '"dead_lettered"',
    "ClaimPropagationDeliveryState",
    "ClaimPropagationOperationId = `v${number}`",
    "ClaimPropagationEnumerationCheckpoint",
    "studentCursor: string | null",
    "staffComplete: boolean",
    "studentsComplete: boolean",
    "leaseExpiresAt: string | null",
    "leaseOwnerHash: string | null",
    "nextAttemptAt: string | null",
    "supersededByOperationId: string | null",
    "claimPropagationOperations/{operationId}",
    "{operationId}/deliveries/{uid}",
    "`v{authorizationVersion}`",
  ]) {
    assert.ok(source.includes(boundary), boundary);
  }
  assert.doesNotMatch(
    source,
    /idToken\s*:|refreshToken\s*:|password\s*:|providerPayload\s*:|rawClaims\s*:/u,
  );
});

test("stale-token, limit, Exam, and browser convergence policies are explicit", async () => {
  const source = await readFile(contractPath, "utf8");
  for (const boundary of [
    "ClaimPropagationManagedClaimTarget",
    "InstituteAuthorityFreshnessDecision",
    '"stale_authorization_version"',
    '"active_student_limit"',
    '"concurrent_session_limit"',
    '"interrupt_recoverable"',
    "Upgrades do not rewrite an active Exam runtime snapshot",
    "browser never",
    '"accept_refreshed_authority"',
    '"force_refresh"',
    '"show_suspended"',
    '"sign_out"',
  ]) {
    assert.ok(source.includes(boundary), boundary);
  }
  assert.ok(source.includes("Mutable usage counts are"));
  assert.ok(source.includes("intentionally excluded from Firebase custom claims"));
});

test("source ownership and non-events remain separated", async () => {
  const source = await readFile(contractPath, "utf8");
  for (const sourceEvent of [
    '"institute_suspended"',
    '"institute_restored"',
    '"institute_archived"',
    '"license_changed"',
    '"stripe_entitlement_reconciled"',
    '"commercial_entitlement_reconciled"',
    '"license_expired"',
    '"grace_expired"',
  ]) {
    assert.ok(source.includes(sourceEvent), sourceEvent);
  }
  assert.doesNotMatch(source, /license_request_approved|invoice_paid|offline_payment_recorded/u);
  assert.ok(source.includes('auditAndHealthReadModelOwner: "BWM-040"'));
  assert.ok(source.includes('productionIamOwner: "BWM-052"'));
  assert.ok(source.includes('deployedInfrastructureOwner: "BWM-053"'));
});

test("authority-changing sources stage durable operations while non-events remain separate", async () => {
  const [worker, lifecycle, license, stripe, requests, subscriptions] = await Promise.all([
    readFile(join(rootDirectory, "functions/src/services/claimPropagation.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/vendorInstituteCommands.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/licenseManagement.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/paymentEventIntegration.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/vendorLicenseRequests.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/vendorSubscriptions.ts"), "utf8"),
  ]);

  assert.match(worker, /claimPropagationOperations/u);
  assert.match(worker, /class ClaimPropagationCoordinator/u);
  assert.match(worker, /class ClaimPropagationWorker/u);
  assert.match(worker, /\.limit\(CLAIM_PROPAGATION_PAGE_SIZE\)/u);
  assert.doesNotMatch(worker, /collection\("students"\)\.get\(\)/u);
  assert.match(worker, /class ClaimPropagationDeadlineService/u);
  assert.match(lifecycle, /stageOperation/u);
  assert.match(lifecycle, /institute_suspended/u);
  assert.match(license, /source: "license_changed"/u);
  assert.match(stripe, /source: "stripe_entitlement_reconciled"/u);
  assert.doesNotMatch(requests, /stageOperation|claimPropagationOperations/u);
  assert.doesNotMatch(subscriptions, /stageOperation|claimPropagationOperations/u);
  assert.doesNotMatch(lifecycle, /pending_bwm_036/u);
});

test("bounded worker schedule, topology event, export, and indexes are registered", async () => {
  const [worker, trigger, index, topology, manifest] = await Promise.all([
    readFile(join(rootDirectory, "functions/src/services/claimPropagation.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/triggers/claimPropagation.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/index.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/systemEventTopology.ts"), "utf8"),
    readFile(join(rootDirectory, "firestore.indexes.json"), "utf8"),
  ]);

  assert.match(worker, /processDueOperations/u);
  assert.match(worker, /collectionGroup\(OPERATIONS_COLLECTION\)/u);
  assert.match(worker, /CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS/u);
  assert.match(trigger, /schedule\("every 1 minutes"\)/u);
  assert.match(trigger, /ClaimPropagationSweepScheduled/u);
  assert.match(index, /export \{claimPropagationSweepEveryMinute\}/u);
  assert.match(topology, /name: "ClaimPropagationSweepScheduled"/u);
  const indexes = JSON.parse(manifest).indexes;
  assert.ok(indexes.some((definition) =>
    definition.collectionGroup === "claimPropagationOperations" &&
    definition.queryScope === "COLLECTION_GROUP"));
  assert.equal(indexes.filter((definition) =>
    definition.collectionGroup === "license" &&
    definition.queryScope === "COLLECTION_GROUP").length >= 2, true);
});

test("current institute authority guards every affected Student and Exam boundary", async () => {
  const [
    authority,
    studentMutations,
    onboardingActivation,
    bulkIngestion,
    session,
    answers,
    submission,
  ] = await Promise.all([
    readFile(join(rootDirectory, "functions/src/services/instituteAuthorityEnforcement.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/adminStudentMutations.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/studentOnboardingActivation.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/studentBulkIngestion.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/session.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/answerBatch.ts"), "utf8"),
    readFile(join(rootDirectory, "functions/src/services/submission.ts"), "utf8"),
  ]);

  for (const boundary of [
    "assertDecodedTokenAuthority",
    "assertStudentActivationCapacity",
    "assertConcurrentSessionCapacity",
    "assertActiveSessionAllowed",
    'where("status", "==", "active")',
    '.where("instituteId", "==", authority.instituteId)',
  ]) {
    assert.ok(authority.includes(boundary), boundary);
  }
  assert.match(studentMutations, /assertStudentActivationCapacity/u);
  assert.match(onboardingActivation, /assertStudentActivationCapacity/u);
  assert.match(bulkIngestion, /readCurrentAuthority/u);
  assert.match(session, /assertConcurrentSessionCapacity/u);
  assert.match(session, /assertActiveSessionAllowed/u);
  assert.match(answers, /assertActiveSessionAllowed/u);
  assert.match(submission, /assertCurrentSessionAuthority/u);

  for (const apiFile of [
    "adminStudentMutations.ts",
    "adminStudentsBulk.ts",
    "examStart.ts",
    "examSessionEntry.ts",
    "examSessionActivate.ts",
    "examSessionAnswers.ts",
    "examSessionSubmit.ts",
  ]) {
    const source = await readFile(
      join(rootDirectory, "functions/src/api", apiFile),
      "utf8",
    );
    assert.match(source, /verifyCurrentAuthorityIdToken/u, apiFile);
  }

  assert.doesNotMatch(
    session,
    /activeStudentLimit:\s*launchAuthority|concurrentSessionLimit:\s*launchAuthority/u,
  );
});
