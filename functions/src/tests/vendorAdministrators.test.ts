/* eslint-disable max-len */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import type {VendorAdministratorCommandIntent} from "../../../shared/contracts/vendorInstitutes";
import {VendorAdministratorService} from "../services/vendorAdministrators";
import {
  VendorAdministratorCommunicationService,
} from "../services/vendorAdministratorCommunication";
import {
  EmailDeliveryProvider,
  EmailDeliveryMessage,
} from "../services/emailDeliveryProvider";
import {VendorInstituteValidationError} from "../types/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {identitySessionSecurityService} from "../services/identitySessionSecurity";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const auth = getFirebaseAdminApp().auth();
const FIXED_TIME = Timestamp.fromDate(new Date("2026-10-02T06:30:00.000Z"));
const BASE = {actorId: "vendor_administrator_operator", actorRole: "vendor" as const};

const uidFor = (instituteId: string, email: string): string =>
  `staff_${createHash("sha256").update(`${instituteId}:${email}`).digest("hex").slice(0, 40)}`;

const command = (
  instituteId: string,
  value: VendorAdministratorCommandIntent,
) => ({...BASE, command: value, instituteId});

const license = {
  currentLayer: "L1",
  featureFlags: {
    adaptivePhase: false,
    controlledMode: false,
    governanceAccess: false,
    hardMode: false,
    riskOverview: false,
  },
  licenseState: "active",
  licenseVersion: "license-v1",
};

const deleteQuery = async (query: FirebaseFirestore.Query): Promise<void> => {
  const snapshot = await query.get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const deleteUser = async (uid: string): Promise<void> => {
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (!(error instanceof Error && "code" in error &&
      (error as {code?: unknown}).code === "auth/user-not-found")) throw error;
  }
};

const cleanup = async (instituteId: string, userIds: string[] = []): Promise<void> => {
  const instituteReference = firestore.doc(`institutes/${instituteId}`);
  await Promise.all([
    deleteQuery(instituteReference.collection("vendorCommands")),
    deleteQuery(instituteReference.collection("auditLogs")),
    deleteQuery(firestore.collection("vendorAuditLogs").where("instituteId", "==", instituteId)),
    deleteQuery(firestore.collection("emailQueue").where("instituteId", "==", instituteId)),
  ]);
  await instituteReference.collection("license").doc("current").delete();
  await instituteReference.delete();
  await Promise.all(userIds.map(deleteUser));
};

const seedInstitute = async (
  instituteId: string,
  overrides: Record<string, unknown> = {},
  withLicense = true,
): Promise<void> => {
  await firestore.doc(`institutes/${instituteId}`).set({
    instituteId,
    instituteRevision: 1,
    licenseVersion: "license-v1",
    pendingPrimaryAdministrator: null,
    primaryAdminUserId: null,
    registeredName: "Administrator Test Institute",
    settingsRevision: 0,
    settingsUsers: {},
    status: "suspended",
    vendorLicenseLayer: "L1",
    vendorLifecycleState: "onboarding",
    ...overrides,
  });
  if (withLicense) {
    await firestore.doc(`institutes/${instituteId}/license/current`).set(license);
  }
};

const signIn = async (email: string, password: string): Promise<void> => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST as string;
  const response = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"content-type": "application/json"},
      method: "POST",
    },
  );
  assert.equal(response.ok, true, await response.text());
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("administrator commands require Vendor authority and bounded revisioned intent", () => {
  const service = new VendorAdministratorService({firestore});
  assert.throws(
    () => service.normalizeCommandRequest({
      action: "invite_primary",
      actorId: "admin_wrong_role",
      actorRole: "admin",
      administrator: {displayName: "Primary Admin", email: "primary@example.test"},
      expectedRevision: 0,
      idempotencyKey: "6a6e4a86-1db8-4da8-a4c5-950f243b0a6a",
      instituteId: "inst_vendor_admin_validation",
    }),
    (error: unknown) => error instanceof VendorInstituteValidationError && error.code === "FORBIDDEN",
  );
  assert.throws(
    () => service.normalizeCommandRequest({
      action: "suspend_primary_access",
      actorId: BASE.actorId,
      actorRole: BASE.actorRole,
      expectedRevision: -1,
      idempotencyKey: "not-a-uuid",
      instituteId: "inst_vendor_admin_validation",
      targetUserId: "staff_target",
    }),
    (error: unknown) => error instanceof VendorInstituteValidationError && error.code === "VALIDATION_ERROR",
  );
});

test("initial invitation is redacted, replayable, Auth-accepted, and atomically activated", async () => {
  const instituteId = "inst_vendor_admin_initial";
  const email = "initial.primary@example.test";
  const targetUserId = uidFor(instituteId, email);
  await cleanup(instituteId, [targetUserId]);
  await seedInstitute(instituteId);
  const service = new VendorAdministratorService({firestore, now: () => FIXED_TIME});
  const invite = command(instituteId, {
    action: "invite_primary",
    administrator: {displayName: "Initial Primary", email},
    expectedRevision: 0,
    idempotencyKey: "4212c1fe-f9c5-4cea-b26b-e0c7f4345b39",
  });

  const invited = await service.executeCommand(invite);
  assert.equal(invited.settingsRevision, 1);
  assert.equal(invited.primaryAdministrator, null);
  assert.equal(invited.reconciliationState, "complete");
  assert.equal(invited.communication?.status, "queued");
  let persisted = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(persisted.primaryAdminUserId, null);
  assert.equal(persisted.pendingPrimaryAdministrator.userId, targetUserId);
  assert.equal(persisted.settingsUsers[targetUserId].status, "invitation_pending");
  let user = await auth.getUser(targetUserId);
  assert.equal(user.disabled, false);
  assert.deepEqual(user.customClaims ?? {}, {});

  const jobs = await firestore.collection("emailQueue").where("instituteId", "==", instituteId).get();
  assert.equal(jobs.size, 1);
  const jobJson = JSON.stringify(jobs.docs[0]?.data());
  assert.doesNotMatch(jobJson, /oobCode=|https?:\/\//);
  assert.equal(jobs.docs[0]?.get("source"), "vendor_primary_administrator");

  const messages: EmailDeliveryMessage[] = [];
  const provider: EmailDeliveryProvider = {
    send: async (message) => {
      messages.push(message);
      return {providerMessageId: "vendor-provider-sensitive-id"};
    },
  };
  const communicationService = new VendorAdministratorCommunicationService({
    auth,
    firestore,
    now: () => FIXED_TIME,
    provider,
  });
  assert.equal(await communicationService.processCommunication(invited.communication?.communicationId as string), true);
  assert.equal(messages.length, 1);
  assert.match(messages[0]?.text ?? "", /oobCode=/);
  const deliveredJob = (await jobs.docs[0]?.ref.get())?.data() ?? {};
  assert.equal(deliveredJob.status, "sent");
  assert.doesNotMatch(JSON.stringify(deliveredJob), /oobCode=|https?:\/\/|vendor-provider-sensitive-id/);

  const replay = await service.executeCommand(invite);
  assert.equal(replay.replayed, true);
  assert.equal(replay.settingsRevision, 1);
  assert.equal(replay.communication?.status, "delivered");
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 1);
  await assert.rejects(
    service.executeCommand(command(instituteId, {
      action: "invite_primary",
      administrator: {displayName: "Changed Name", email},
      expectedRevision: 0,
      idempotencyKey: "4212c1fe-f9c5-4cea-b26b-e0c7f4345b39",
    })),
    (error: unknown) => error instanceof VendorInstituteValidationError && error.code === "CONFLICT",
  );

  const activation = command(instituteId, {
    action: "activate_primary_replacement",
    expectedRevision: 1,
    idempotencyKey: "430f955c-e6f0-4de7-a191-1e584fe5d2d5",
    targetUserId,
  });
  await assert.rejects(
    service.executeCommand(activation),
    (error: unknown) => error instanceof VendorInstituteValidationError && error.code === "CONFLICT",
  );
  await auth.updateUser(targetUserId, {password: "Primary!Pass123"});
  await signIn(email, "Primary!Pass123");
  await auth.updateUser(targetUserId, {emailVerified: true});
  const activated = await service.executeCommand(activation);
  assert.equal(activated.settingsRevision, 2);
  assert.equal(activated.primaryAdministrator?.userId, targetUserId);
  assert.equal(activated.primaryAdministrator?.invitationStatus, "accepted");
  assert.equal(activated.reconciliationState, "complete");
  persisted = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(persisted.primaryAdminUserId, targetUserId);
  assert.equal(persisted.pendingPrimaryAdministrator, null);
  user = await auth.getUser(targetUserId);
  assert.equal(user.customClaims?.role, "admin");
  assert.equal(user.customClaims?.instituteId, instituteId);
  assert.equal(user.customClaims?.isSuspended, true);
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 2);
  assert.equal((await firestore.collection("vendorAuditLogs").where("instituteId", "==", instituteId).get()).size, 2);

  await cleanup(instituteId, [targetUserId]);
});

test("replacement, resend, reset, suspension, and restoration reconcile both Auth identities", async () => {
  const instituteId = "inst_vendor_admin_replacement";
  const currentUserId = "staff_current_primary";
  const currentEmail = "current.primary@example.test";
  const replacementEmail = "replacement.primary@example.test";
  const replacementUserId = uidFor(instituteId, replacementEmail);
  await cleanup(instituteId, [currentUserId, replacementUserId]);
  await seedInstitute(instituteId, {
    primaryAdminUserId: currentUserId,
    settingsUsers: {
      [currentUserId]: {
        displayName: "Current Primary",
        email: currentEmail,
        invitationStatus: "accepted",
        role: "admin",
        status: "active",
        updatedAt: FIXED_TIME,
      },
    },
    status: "active",
    vendorLifecycleState: "active",
  });
  await auth.createUser({email: currentEmail, password: "Current!Pass123", uid: currentUserId});
  const service = new VendorAdministratorService({firestore, now: () => FIXED_TIME});

  const proposed = await service.executeCommand(command(instituteId, {
    action: "propose_primary_replacement",
    administrator: {displayName: "Replacement Primary", email: replacementEmail},
    expectedRevision: 0,
    idempotencyKey: "46e2edc2-d0c2-4c0f-807c-1191fef52133",
  }));
  assert.equal(proposed.primaryAdministrator?.userId, currentUserId);
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get()).get("primaryAdminUserId"), currentUserId);
  await identitySessionSecurityService.synchronizeClaimsAndRevokeSessions({
    instituteId,
    uid: replacementUserId,
  });
  assert.equal((await auth.getUser(replacementUserId)).customClaims?.isSuspended, true);

  const resent = await service.executeCommand(command(instituteId, {
    action: "resend_primary_invitation",
    expectedRevision: 1,
    idempotencyKey: "f9340967-77df-4325-ae2a-71ccfe8d139a",
    targetUserId: replacementUserId,
  }));
  assert.equal(resent.settingsRevision, 2);
  assert.equal(resent.communication?.status, "queued");
  await auth.updateUser(replacementUserId, {password: "Replacement!Pass123"});
  await signIn(replacementEmail, "Replacement!Pass123");
  await auth.updateUser(replacementUserId, {emailVerified: true});

  const activatedCommand = command(instituteId, {
    action: "activate_primary_replacement",
    expectedRevision: 2,
    idempotencyKey: "89384752-e88c-4ae3-ad8f-f99323664227",
    targetUserId: replacementUserId,
  });
  const activated = await service.executeCommand(activatedCommand);
  assert.equal(activated.primaryAdministrator?.userId, replacementUserId);
  assert.equal(activated.settingsRevision, 3);
  let root = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(root.settingsUsers[currentUserId].status, "suspended");
  assert.equal((await auth.getUser(currentUserId)).disabled, true);
  assert.deepEqual((await auth.getUser(currentUserId)).customClaims ?? {}, {});
  assert.equal((await auth.getUser(replacementUserId)).customClaims?.role, "admin");

  const activationReplay = await service.executeCommand(activatedCommand);
  assert.equal(activationReplay.replayed, true);
  assert.equal(activationReplay.settingsRevision, 3);

  const suspended = await service.executeCommand(command(instituteId, {
    action: "suspend_primary_access",
    expectedRevision: 3,
    idempotencyKey: "e3763871-8ec2-4682-be3e-e6e902a1ad4d",
    targetUserId: replacementUserId,
  }));
  assert.equal(suspended.primaryAdministrator?.status, "suspended");
  assert.equal((await auth.getUser(replacementUserId)).disabled, true);
  assert.deepEqual((await auth.getUser(replacementUserId)).customClaims ?? {}, {});

  const restored = await service.executeCommand(command(instituteId, {
    action: "restore_primary_access",
    expectedRevision: 4,
    idempotencyKey: "6bf41c29-3a71-47e7-95ec-ab7d121be5f8",
    targetUserId: replacementUserId,
  }));
  assert.equal(restored.primaryAdministrator?.status, "active");
  assert.equal((await auth.getUser(replacementUserId)).disabled, false);
  assert.equal((await auth.getUser(replacementUserId)).customClaims?.role, "admin");

  const reset = await service.executeCommand(command(instituteId, {
    action: "reset_primary_access",
    expectedRevision: 5,
    idempotencyKey: "c7a0f748-3111-44be-8f40-0b3973e43dc0",
    targetUserId: replacementUserId,
  }));
  assert.equal(reset.settingsRevision, 6);
  assert.equal(reset.communication?.kind, "primary_administrator_password_reset");
  root = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(root.primaryAdminUserId, replacementUserId);
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 6);

  await cleanup(instituteId, [currentUserId, replacementUserId]);
});

test("revocation prevents queued delivery and removes pending authority", async () => {
  const instituteId = "inst_vendor_admin_revoke";
  const email = "revoked.primary@example.test";
  const targetUserId = uidFor(instituteId, email);
  await cleanup(instituteId, [targetUserId]);
  await seedInstitute(instituteId);
  const service = new VendorAdministratorService({firestore, now: () => FIXED_TIME});
  const invited = await service.executeCommand(command(instituteId, {
    action: "invite_primary",
    administrator: {displayName: "Revoked Primary", email},
    expectedRevision: 0,
    idempotencyKey: "ced784dd-2931-49e8-a9e7-04880ef41a0e",
  }));
  const revokedCommand = command(instituteId, {
    action: "revoke_primary_invitation",
    expectedRevision: 1,
    idempotencyKey: "c4bd2566-fbe5-4f24-b395-ef6cc1c47e8a",
    targetUserId,
  });
  const revoked = await service.executeCommand(revokedCommand);
  assert.equal(revoked.settingsRevision, 2);
  const root = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(root.pendingPrimaryAdministrator, null);
  assert.equal(root.settingsUsers[targetUserId].invitationStatus, "revoked");
  assert.equal((await auth.getUser(targetUserId)).disabled, true);

  let deliveries = 0;
  const communication = new VendorAdministratorCommunicationService({
    auth,
    firestore,
    now: () => FIXED_TIME,
    provider: {send: async () => {
      deliveries += 1;
      return {};
    }},
  });
  assert.equal(await communication.processCommunication(invited.communication?.communicationId as string), true);
  assert.equal(deliveries, 0);
  assert.equal((await communication.loadReceipt(invited.communication?.communicationId as string)).status, "failed");
  const replay = await service.executeCommand(revokedCommand);
  assert.equal(replay.replayed, true);
  assert.equal(replay.reconciliationState, "complete");

  await cleanup(instituteId, [targetUserId]);
});

test("concurrent same-revision invitations admit one durable winner", async () => {
  const instituteId = "inst_vendor_admin_concurrency";
  const firstEmail = "concurrent.one@example.test";
  const secondEmail = "concurrent.two@example.test";
  const firstUserId = uidFor(instituteId, firstEmail);
  const secondUserId = uidFor(instituteId, secondEmail);
  await cleanup(instituteId, [firstUserId, secondUserId]);
  await seedInstitute(instituteId);
  const service = new VendorAdministratorService({firestore, now: () => FIXED_TIME});
  const results = await Promise.allSettled([
    service.executeCommand(command(instituteId, {
      action: "invite_primary",
      administrator: {displayName: "Concurrent One", email: firstEmail},
      expectedRevision: 0,
      idempotencyKey: "70a985a7-f369-4cb7-9e8d-dd87e4408fef",
    })),
    service.executeCommand(command(instituteId, {
      action: "invite_primary",
      administrator: {displayName: "Concurrent Two", email: secondEmail},
      expectedRevision: 0,
      idempotencyKey: "8f67cdde-c2c9-48cf-8a77-cdc525d94ab1",
    })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason instanceof VendorInstituteValidationError, true);
  assert.equal(rejected.reason.code, "CONFLICT");
  const root = (await firestore.doc(`institutes/${instituteId}`).get()).data() ?? {};
  assert.equal(root.settingsRevision, 1);
  assert.equal(Object.keys(root.settingsUsers).length, 1);
  assert.equal((await firestore.collection(`institutes/${instituteId}/auditLogs`).get()).size, 1);
  assert.equal((await firestore.collection(`institutes/${instituteId}/vendorCommands`).get()).size, 1);

  await cleanup(instituteId, [firstUserId, secondUserId]);
});

test("external reconciliation is durable across transient and missing-entitlement failures", async () => {
  const transientInstituteId = "inst_vendor_admin_recovery";
  const transientEmail = "recovery.primary@example.test";
  const transientUserId = uidFor(transientInstituteId, transientEmail);
  await cleanup(transientInstituteId, [transientUserId]);
  await seedInstitute(transientInstituteId);
  let attempts = 0;
  const securityResult = (uid: string) => ({
    claimsChanged: true,
    refreshTokensRevoked: true,
    uid,
    userMissing: false,
  });
  const recoveringService = new VendorAdministratorService({
    firestore,
    now: () => FIXED_TIME,
    sessionSecurity: {
      clearClaimsAndRevokeSessions: async (uid) => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient-session-service-failure");
        return securityResult(uid);
      },
      revokeSessions: async (uid) => securityResult(uid),
      synchronizeClaimsAndRevokeSessions: async ({uid}) => securityResult(uid),
    },
  });
  const recoveryCommand = command(transientInstituteId, {
    action: "invite_primary",
    administrator: {displayName: "Recovery Primary", email: transientEmail},
    expectedRevision: 0,
    idempotencyKey: "efeeed09-3dbc-4c44-9817-1a7c5818b5da",
  });
  const pending = await recoveringService.executeCommand(recoveryCommand);
  assert.equal(pending.reconciliationState, "pending");
  const recovered = await recoveringService.executeCommand(recoveryCommand);
  assert.equal(recovered.replayed, true);
  assert.equal(recovered.reconciliationState, "complete");
  assert.equal((await firestore.collection(`institutes/${transientInstituteId}/auditLogs`).get()).size, 1);
  await cleanup(transientInstituteId, [transientUserId]);

  const entitlementInstituteId = "inst_vendor_admin_entitlement_recovery";
  const entitlementUserId = "staff_entitlement_primary";
  const entitlementEmail = "entitlement.primary@example.test";
  await cleanup(entitlementInstituteId, [entitlementUserId]);
  await seedInstitute(entitlementInstituteId, {
    primaryAdminUserId: entitlementUserId,
    settingsUsers: {
      [entitlementUserId]: {
        displayName: "Entitlement Primary",
        email: entitlementEmail,
        invitationStatus: "accepted",
        role: "admin",
        status: "suspended",
        updatedAt: FIXED_TIME,
      },
    },
    status: "active",
    vendorLifecycleState: "active",
  }, false);
  await auth.createUser({disabled: true, email: entitlementEmail, password: "Entitlement!Pass123", uid: entitlementUserId});
  const entitlementService = new VendorAdministratorService({firestore, now: () => FIXED_TIME});
  const restoreCommand = command(entitlementInstituteId, {
    action: "restore_primary_access",
    expectedRevision: 0,
    idempotencyKey: "5fa16ea9-8f66-4976-a400-714fd1ab6c1e",
    targetUserId: entitlementUserId,
  });
  const blocked = await entitlementService.executeCommand(restoreCommand);
  assert.equal(blocked.reconciliationState, "blocked_missing_entitlement");
  assert.equal((await auth.getUser(entitlementUserId)).customClaims, undefined);
  await firestore.doc(`institutes/${entitlementInstituteId}/license/current`).set(license);
  const completed = await entitlementService.executeCommand(restoreCommand);
  assert.equal(completed.replayed, true);
  assert.equal(completed.reconciliationState, "complete");
  assert.equal((await auth.getUser(entitlementUserId)).customClaims?.role, "admin");
  assert.equal((await firestore.collection(`institutes/${entitlementInstituteId}/auditLogs`).get()).size, 1);

  await cleanup(entitlementInstituteId, [entitlementUserId]);
});
