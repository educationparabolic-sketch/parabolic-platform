/* eslint-disable max-len */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {VendorInstituteCommandsService} from "../services/vendorInstituteCommands";
import {VendorInstituteValidationError} from "../types/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const TEST_PREFIX = "bwm034_command_";
let currentTime = new Date("2026-10-01T12:00:00.000Z");
const service = new VendorInstituteCommandsService({
  firestore,
  now: () => new Date(currentTime),
});

const uuid = (suffix: string): string =>
  `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const expectCode = async (
  promise: Promise<unknown>,
  code: VendorInstituteValidationError["code"],
): Promise<void> => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === code);
};

const deleteQuery = async (
  query: FirebaseFirestore.Query,
): Promise<void> => {
  const snapshot = await query.get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanup = async (): Promise<void> => {
  const [institutes, onboardings] = await Promise.all([
    firestore.collection("institutes").get(),
    firestore.collection("vendorOnboarding").get(),
  ]);
  await Promise.all([
    ...institutes.docs.filter((document) => document.id.startsWith(TEST_PREFIX))
      .map((document) => firestore.recursiveDelete(document.ref)),
    ...onboardings.docs.filter((document) => document.id.startsWith(TEST_PREFIX))
      .map((document) => firestore.recursiveDelete(document.ref)),
  ]);
  await Promise.all([
    deleteQuery(firestore.collection("vendorAuditLogs")
      .where("instituteId", ">=", TEST_PREFIX)
      .where("instituteId", "<", `${TEST_PREFIX}\uf8ff`)),
    deleteQuery(firestore.collection("vendorInstituteCommands")
      .where("onboardingId", ">=", TEST_PREFIX)
      .where("onboardingId", "<", `${TEST_PREFIX}\uf8ff`)),
  ]);
};

const seedInstitute = async (input: {
  deletionOperation?: Record<string, unknown>;
  id: string;
  legalHold?: boolean;
  lifecycleState: "active" | "suspended" | "archived" | "deletion_scheduled" | "recovery_required";
  revision: number;
}): Promise<void> => {
  await firestore.doc(`institutes/${input.id}`).set({
    authorizationVersion: 1,
    createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
    ...(input.deletionOperation ? {deletionOperation: input.deletionOperation} : {}),
    ...(input.legalHold !== undefined ? {deletionLegalHold: input.legalHold} : {}),
    instituteId: input.id,
    instituteRevision: input.revision,
    primaryAdminUserId: null,
    registeredName: `Institute ${input.id}`,
    settingsRevision: 0,
    settingsUsers: {},
    status: input.lifecycleState === "active" ? "active" : "suspended",
    updatedAt: Timestamp.fromDate(new Date("2026-09-30T00:00:00.000Z")),
    vendorAccountReference: null,
    vendorFilterKeys: [`query=institute ${input.id}`],
    vendorLifecycleState: input.lifecycleState,
  });
  await firestore.doc(`institutes/${input.id}/license/current`).set({
    activeStudentLimit: 500,
    concurrentSessionLimit: 100,
    currentLayer: "L3",
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: true,
      hardMode: true,
      riskOverview: true,
    },
    licenseState: "active",
    licenseVersion: `license_${input.id}`,
  });
};

const lifecycleRequest = (input: {
  action: "suspend" | "restore" | "archive" | "schedule_deletion" | "cancel_deletion" | "execute_purge" | "retry_purge";
  expectedRevision: number;
  idempotencyKey: string;
  instituteId: string;
  reason?: string;
}) => service.normalizeLifecycleRequest({
  action: input.action,
  actorId: "vendor_operator",
  actorRole: "vendor",
  ...(input.action === "schedule_deletion" || input.action === "execute_purge" || input.action === "retry_purge" ?
    {confirmInstituteId: input.instituteId} : {}),
  expectedRevision: input.expectedRevision,
  idempotencyKey: input.idempotencyKey,
  instituteId: input.instituteId,
  ...(input.reason ? {reason: input.reason} : {}),
});

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("normalizers require Vendor context, UUID idempotency, and owned fields", () => {
  assert.throws(() => service.normalizeCreateRequest({
    actorId: "admin_user",
    actorRole: "admin",
    expectedOnboardingRevision: 1,
    idempotencyKey: uuid("1"),
    onboardingId: `${TEST_PREFIX}normalizer`,
  }), (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === "FORBIDDEN");
  assert.throws(() => service.normalizeProfileUpdateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 1,
    idempotencyKey: "not-a-uuid",
    instituteId: `${TEST_PREFIX}normalizer`,
    profile: {registeredName: "Valid Name"},
  }));
  assert.throws(() => service.normalizeProfileUpdateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 1,
    idempotencyKey: uuid("2"),
    instituteId: `${TEST_PREFIX}normalizer`,
    profile: {},
  }));
  assert.throws(() => service.normalizeLifecycleRequest({
    action: "complete_purge",
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 1,
    idempotencyKey: uuid("3"),
    instituteId: `${TEST_PREFIX}normalizer`,
  }));
});

test("approved onboarding creates one deterministic institute with exact replay and atomic audits", async () => {
  const onboardingId = `${TEST_PREFIX}create`;
  await firestore.doc(`vendorOnboarding/${onboardingId}`).set({
    application: {registeredName: "Creation Academy"},
    createdAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
    instituteId: null,
    onboardingId,
    revision: 3,
    status: "approved",
    updatedAt: Timestamp.fromDate(new Date("2026-09-30T00:00:00.000Z")),
  });
  const request = service.normalizeCreateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedOnboardingRevision: 3,
    idempotencyKey: uuid("10"),
    onboardingId,
  });
  const applied = await service.createInstitute(request);
  assert.equal(applied.replayed, false);
  assert.equal(applied.institute.lifecycleState, "onboarding");
  assert.equal(applied.institute.revision, 1);
  assert.equal(applied.institute.registeredName, "Creation Academy");
  assert.equal(applied.institute.commercial.authorityState, "not_configured");
  const [institute, onboarding, command, vendorAudit, instituteAudit, events] =
    await Promise.all([
      firestore.doc(`institutes/${applied.institute.instituteId}`).get(),
      firestore.doc(`vendorOnboarding/${onboardingId}`).get(),
      firestore.doc(`vendorInstituteCommands/${applied.commandId}`).get(),
      firestore.doc(`vendorAuditLogs/${applied.auditEventId}`).get(),
      firestore.doc(`institutes/${applied.institute.instituteId}/auditLogs/${applied.auditEventId}`).get(),
      firestore.collection(`vendorOnboarding/${onboardingId}/events`).get(),
    ]);
  assert.equal(institute.get("status"), "suspended");
  assert.equal(institute.get("vendorLifecycleState"), "onboarding");
  assert.equal(onboarding.get("status"), "institute_provisioned");
  assert.equal(onboarding.get("revision"), 4);
  assert.equal(vendorAudit.get("action"), "CREATE_INSTITUTE");
  assert.equal(instituteAudit.exists, true);
  assert.equal(events.size, 1);
  assert.equal(command.get("idempotencyKey"), undefined);
  assert.equal(command.get("ipAddress"), undefined);
  assert.equal(command.get("idempotencyKeyHash"), createHash("sha256")
    .update(`vendor_operator:create:${onboardingId}:${uuid("10")}`).digest("hex"));

  const replayed = await service.createInstitute(request);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.commandId, applied.commandId);
  assert.equal(replayed.institute.instituteId, applied.institute.instituteId);
  await expectCode(service.createInstitute(service.normalizeCreateRequest({
    ...request,
    expectedOnboardingRevision: 4,
  })), "CONFLICT");
  await expectCode(service.createInstitute(service.normalizeCreateRequest({
    ...request,
    idempotencyKey: uuid("11"),
  })), "CONFLICT");
});

test("profile updates replay exactly and concurrent stale revisions admit only one winner", async () => {
  const instituteId = `${TEST_PREFIX}profile`;
  await seedInstitute({id: instituteId, lifecycleState: "active", revision: 5});
  const firstRequest = service.normalizeProfileUpdateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 5,
    idempotencyKey: uuid("20"),
    instituteId,
    profile: {
      registeredName: "Renamed Institute",
      vendorAccountReference: "account-20",
    },
  });
  const first = await service.updateProfile(firstRequest);
  assert.equal(first.revision, 6);
  assert.equal(first.propagationState, "not_required");
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get())
    .get("registeredName"), "Renamed Institute");
  assert.equal((await service.updateProfile(firstRequest)).replayed, true);
  await expectCode(service.updateProfile(service.normalizeProfileUpdateRequest({
    ...firstRequest,
    ...firstRequest.command,
    profile: {registeredName: "Different Intent"},
  })), "CONFLICT");

  const requests = ["21", "22"].map((key, index) =>
    service.updateProfile(service.normalizeProfileUpdateRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      expectedRevision: 6,
      idempotencyKey: uuid(key),
      instituteId,
      profile: {vendorAccountReference: `race-${index}`},
    })));
  const settled = await Promise.allSettled(requests);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected" &&
    result.reason instanceof VendorInstituteValidationError &&
    result.reason.code === "CONFLICT").length, 1);
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get())
    .get("instituteRevision"), 7);
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 2);
});

test("lifecycle graph stages durable claim propagation operations transactionally", async () => {
  const instituteId = `${TEST_PREFIX}lifecycle`;
  await seedInstitute({id: instituteId, lifecycleState: "active", revision: 2});
  const suspendedRequest = lifecycleRequest({
    action: "suspend",
    expectedRevision: 2,
    idempotencyKey: uuid("30"),
    instituteId,
    reason: "Security review",
  });
  const suspended = await service.transitionLifecycle(suspendedRequest);
  assert.equal(suspended.lifecycleState, "suspended");
  assert.equal(suspended.propagationState, "pending");
  assert.equal(suspended.propagation.operationId, "v2");
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get()).get("status"), "suspended");
  assert.equal((await service.transitionLifecycle(suspendedRequest)).replayed, true);
  await expectCode(service.transitionLifecycle(lifecycleRequest({
    action: "suspend",
    expectedRevision: 3,
    idempotencyKey: uuid("31"),
    instituteId,
    reason: "Duplicate suspension",
  })), "CONFLICT");

  const restored = await service.transitionLifecycle(lifecycleRequest({
    action: "restore",
    expectedRevision: 3,
    idempotencyKey: uuid("32"),
    instituteId,
    reason: "Review complete",
  }));
  assert.equal(restored.lifecycleState, "active");
  assert.equal(restored.propagationState, "pending");
  assert.equal(restored.propagation.operationId, "v3");
  const archived = await service.transitionLifecycle(lifecycleRequest({
    action: "archive",
    expectedRevision: 4,
    idempotencyKey: uuid("33"),
    instituteId,
    reason: "Contract ended",
  }));
  assert.equal(archived.lifecycleState, "archived");
  assert.equal(archived.propagationState, "pending");
  assert.equal(archived.propagation.operationId, "v4");
  const audit = await firestore.doc(
    `vendorAuditLogs/${archived.auditEventId}`,
  ).get();
  assert.equal(audit.get("reason"), undefined);
  assert.equal(typeof audit.get("reasonHash"), "string");
  assert.equal((await firestore.doc(
    `institutes/${instituteId}/claimPropagationOperations/v4`,
  ).get()).get("source"), "institute_archived");
});

test("deletion is cancellable, retention/legal-hold gated, and only reserves resumable purge", async () => {
  const instituteId = `${TEST_PREFIX}deletion`;
  currentTime = new Date("2026-10-01T12:00:00.000Z");
  await seedInstitute({id: instituteId, lifecycleState: "archived", revision: 10});
  const scheduled = await service.transitionLifecycle(lifecycleRequest({
    action: "schedule_deletion",
    expectedRevision: 10,
    idempotencyKey: uuid("40"),
    instituteId,
    reason: "Approved retention workflow",
  }));
  assert.equal(scheduled.lifecycleState, "deletion_scheduled");
  assert.equal(scheduled.deletion.stage, "scheduled");
  assert.equal(scheduled.deletion.eligibleAt, "2026-10-31T12:00:00.000Z");
  await expectCode(service.transitionLifecycle(lifecycleRequest({
    action: "execute_purge",
    expectedRevision: 11,
    idempotencyKey: uuid("41"),
    instituteId,
  })), "CONFLICT");

  currentTime = new Date("2026-11-01T12:00:00.000Z");
  await firestore.doc(`institutes/${instituteId}`).update({deletionLegalHold: true});
  await expectCode(service.transitionLifecycle(lifecycleRequest({
    action: "execute_purge",
    expectedRevision: 11,
    idempotencyKey: uuid("42"),
    instituteId,
  })), "CONFLICT");
  await firestore.doc(`institutes/${instituteId}`).update({deletionLegalHold: false});
  const reserved = await service.transitionLifecycle(lifecycleRequest({
    action: "execute_purge",
    expectedRevision: 11,
    idempotencyKey: uuid("43"),
    instituteId,
  }));
  assert.equal(reserved.lifecycleState, "purging");
  assert.equal(reserved.deletion.stage, "quiescing");
  assert.equal(reserved.propagationState, "not_required");
  const reservedAuthority = await firestore.doc(`institutes/${instituteId}`).get();
  assert.equal(reservedAuthority.get("deletionOperation.workerState"), "reserved");
  assert.equal(reservedAuthority.get("deletionOperation.checkpoint"), "retention_and_legal_hold_verified");
  assert.equal(reservedAuthority.exists, true);
  assert.equal((await firestore.collection(`institutes/${instituteId}/vendorCommands`).get()).size, 2);

  const cancelId = `${TEST_PREFIX}cancel`;
  currentTime = new Date("2026-10-01T12:00:00.000Z");
  await seedInstitute({id: cancelId, lifecycleState: "archived", revision: 4});
  await service.transitionLifecycle(lifecycleRequest({
    action: "schedule_deletion",
    expectedRevision: 4,
    idempotencyKey: uuid("44"),
    instituteId: cancelId,
    reason: "Schedule for cancellation proof",
  }));
  const cancelled = await service.transitionLifecycle(lifecycleRequest({
    action: "cancel_deletion",
    expectedRevision: 5,
    idempotencyKey: uuid("45"),
    instituteId: cancelId,
    reason: "Retention request withdrawn",
  }));
  assert.equal(cancelled.lifecycleState, "archived");
  assert.equal(cancelled.deletion.stage, "none");
  assert.equal((await firestore.doc(`institutes/${cancelId}`).get())
    .get("deletionOperation"), undefined);
});

test("failed purge authority supports an idempotent durable retry reservation", async () => {
  const instituteId = `${TEST_PREFIX}retry`;
  const scheduledAt = Timestamp.fromDate(new Date("2026-08-01T00:00:00.000Z"));
  await seedInstitute({
    deletionOperation: {
      attempt: 2,
      checkpoint: "bounded_batch_3",
      eligibleAt: Timestamp.fromDate(new Date("2026-08-31T00:00:00.000Z")),
      lastErrorCode: "WORKER_INTERRUPTED",
      operationId: "vendor_delete_retry",
      scheduledAt,
      stage: "failed",
      workerState: "failed",
    },
    id: instituteId,
    lifecycleState: "recovery_required",
    revision: 8,
  });
  currentTime = new Date("2026-11-01T12:00:00.000Z");
  const request = lifecycleRequest({
    action: "retry_purge",
    expectedRevision: 8,
    idempotencyKey: uuid("50"),
    instituteId,
  });
  const retried = await service.transitionLifecycle(request);
  assert.equal(retried.lifecycleState, "purging");
  assert.equal(retried.deletion.stage, "quiescing");
  assert.equal(retried.deletion.lastErrorCode, null);
  assert.equal((await service.transitionLifecycle(request)).replayed, true);
  const authority = await firestore.doc(`institutes/${instituteId}`).get();
  assert.equal(authority.get("deletionOperation.attempt"), 3);
  assert.equal(authority.get("deletionOperation.checkpoint"), "retry_reserved");
});
