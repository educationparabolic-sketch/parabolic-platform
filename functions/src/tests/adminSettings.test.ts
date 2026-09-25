import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {AdminSettingsService} from "../services/adminSettings";
import {AdminSettingsValidationError} from "../types/adminSettings";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-125-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const FIXED_TIME = Timestamp.fromDate(new Date("2026-09-24T08:00:00.000Z"));

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanupInstitute = async (instituteId: string): Promise<void> => {
  const institutePath = `institutes/${instituteId}`;
  const years = await firestore.collection(`${institutePath}/academicYears`).get();
  await Promise.all(years.docs.map(async (year) => {
    const runs = await year.ref.collection("runs").get();
    await Promise.all(runs.docs.map(async (run) => {
      await deleteCollectionDocuments(`${run.ref.path}/sessions`);
      await run.ref.delete();
    }));
  }));
  const communications = await firestore.collection("emailQueue")
    .where("instituteId", "==", instituteId)
    .get();
  await Promise.all([
    deleteCollectionDocuments(`${institutePath}/academicYears`),
    deleteCollectionDocuments(`${institutePath}/settingsAudit`),
    deleteCollectionDocuments(`${institutePath}/settingsCommands`),
    deleteCollectionDocuments(`${institutePath}/license`),
    ...communications.docs.map((document) => document.ref.delete()),
  ]);
  const reference = firestore.doc(institutePath);
  if ((await reference.get()).exists) await reference.delete();
};

const deleteAuthUserIfPresent = async (uid: string): Promise<void> => {
  try {
    await getFirebaseAdminApp().auth().deleteUser(uid);
  } catch (error) {
    if (!(error instanceof Error && "code" in error &&
      (error as {code?: unknown}).code === "auth/user-not-found")) throw error;
  }
};

const seedInstitute = async (
  instituteId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> => {
  await firestore.doc(`institutes/${instituteId}`).set({
    instituteId,
    profile: {
      academicYearFormat: "YYYY-YY",
      contactEmail: "old@example.test",
      contactPhone: "+1-555-0100",
      defaultExamType: "JEE_MAIN",
      instituteName: "Vendor Registered Institute",
      logoReference: "logos/vendor-owned.png",
      timeZone: "UTC",
    },
    securitySettings: {
      allowMultipleAdminSessions: false,
      forceLogoutOnPasswordChange: true,
      sessionTimeoutDuration: 30,
    },
    settingsRevision: 0,
    settingsUsers: {},
    ...overrides,
  });
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("profile mutation is revisioned, atomic, immutable, and exactly replayable", async () => {
  const instituteId = "inst_settings_profile_authority";
  const institutePath = `institutes/${instituteId}`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId);
  await firestore.doc(`${institutePath}/academicYears/2026`).set({
    academicYearLabel: "2026-27",
    runCount: 3,
    status: "Active",
    studentCount: 42,
  });

  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});
  const command = {
    actionType: "UPDATE_INSTITUTE_PROFILE" as const,
    actorId: "admin_profile",
    actorRole: "admin",
    commandId: "61e7f55e-e0e9-42d8-aeb9-251d74147274",
    expectedRevision: 0,
    instituteId,
    ipAddress: "127.0.0.1",
    profile: {
      academicYearFormat: "YYYY-YYYY",
      contactEmail: "settings@example.test",
      contactPhone: "+1-555-0125",
      defaultExamType: "NEET",
      timeZone: "Asia/Kolkata",
    },
    userAgent: "settings-test",
  };

  const first = await service.executeRequest(command);
  assert.equal(first.receipt?.replayed, false);
  assert.equal(first.receipt?.revision, 1);
  assert.equal(first.snapshot.revision, 1);
  assert.equal(first.snapshot.profile.instituteName, "Vendor Registered Institute");
  assert.equal(first.snapshot.profile.logoReference, "logos/vendor-owned.png");
  assert.equal(first.snapshot.profile.contactEmail, "settings@example.test");
  assert.equal(first.snapshot.academicYears[0]?.studentCount, 42);
  assert.equal(first.snapshot.audit.items.length, 1);
  assert.equal(first.snapshot.audit.items[0]?.revision, 1);

  const persisted = (await firestore.doc(institutePath).get()).data() ?? {};
  assert.equal(persisted.settingsRevision, 1);
  assert.equal(persisted.profile.instituteName, "Vendor Registered Institute");
  const auditSnapshot = await firestore.collection(`${institutePath}/settingsAudit`).get();
  const commandSnapshot = await firestore.collection(`${institutePath}/settingsCommands`).get();
  assert.equal(auditSnapshot.size, 1);
  assert.equal(commandSnapshot.size, 1);
  assert.equal(auditSnapshot.docs[0]?.data().metadata, undefined);
  assert.equal(auditSnapshot.docs[0]?.data().ipAddress, undefined);
  assert.equal(typeof auditSnapshot.docs[0]?.data().ipAddressHash, "string");

  const replay = await service.executeRequest(command);
  assert.equal(replay.receipt?.replayed, true);
  assert.equal(replay.receipt?.auditEventId, first.receipt?.auditEventId);
  assert.equal(replay.receipt?.completedAt, first.receipt?.completedAt);
  assert.equal(replay.snapshot.revision, 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 1);

  await assert.rejects(
    service.executeRequest({
      ...command,
      profile: {...command.profile, contactPhone: "+1-555-9999"},
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "CONFLICT",
  );
  await assert.rejects(
    service.executeRequest({
      ...command,
      commandId: "2d09e463-6705-48b7-8abc-509544c5ab01",
      expectedRevision: 0,
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "CONFLICT",
  );

  await cleanupInstitute(instituteId);
});

test("session-policy mutation stores only supported fields and replays revocation recovery", async () => {
  const instituteId = "inst_settings_session_authority";
  const institutePath = `institutes/${instituteId}`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId, {
    primaryAdminUserId: "admin_session",
    settingsUsers: {
      admin_session: {
        displayName: "Admin Session",
        email: "admin@example.test",
        role: "admin",
        status: "active",
        updatedAt: "2026-09-24T07:00:00.000Z",
      },
      teacher_session: {
        displayName: "Teacher Session",
        email: "teacher@example.test",
        role: "teacher",
        status: "active",
        updatedAt: "2026-09-24T07:00:00.000Z",
      },
    },
  });
  const revoked: string[] = [];
  const securityResult = (uid: string) => ({
    claimsChanged: false,
    refreshTokensRevoked: true,
    uid,
    userMissing: false,
  });
  const service = new AdminSettingsService({
    firestore,
    now: () => FIXED_TIME,
    sessionSecurity: {
      clearClaimsAndRevokeSessions: async (uid) => securityResult(uid),
      revokeSessions: async (uid) => {
        revoked.push(uid);
        return securityResult(uid);
      },
      synchronizeClaimsAndRevokeSessions: async ({uid}) => securityResult(uid),
    },
  });
  const command = {
    actionType: "UPDATE_SECURITY_SETTINGS" as const,
    actorId: "admin_session",
    actorRole: "admin",
    commandId: "304a47f1-0392-4836-a0aa-42d2e346905d",
    expectedRevision: 0,
    instituteId,
    sessionPolicy: {
      allowMultipleAdminSessions: true,
      forceLogoutOnPasswordChange: false,
      sessionTimeoutDuration: 45,
    },
  };

  const first = await service.executeRequest(command);
  const replay = await service.executeRequest(command);
  assert.equal(first.receipt?.replayed, false);
  assert.equal(replay.receipt?.replayed, true);
  assert.deepEqual(revoked, [
    "teacher_session",
    "teacher_session",
  ]);
  const persisted = (await firestore.doc(institutePath).get()).data() ?? {};
  assert.deepEqual(persisted.securitySettings, command.sessionPolicy);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 1);

  await cleanupInstitute(instituteId);
});

test("staff lifecycle is revisioned around deterministic Auth identities and exact replay", async () => {
  const instituteId = "inst_settings_staff_authority";
  const institutePath = `institutes/${instituteId}`;
  const email = "teacher.staff@example.test";
  const targetUserId = `staff_${createHash("sha256")
    .update(`${instituteId}:${email}`)
    .digest("hex")
    .slice(0, 40)}`;
  await cleanupInstitute(instituteId);
  await deleteAuthUserIfPresent(targetUserId);
  await seedInstitute(instituteId, {
    licenseVersion: "license-v1",
    primaryAdminUserId: "admin_primary",
    settingsUsers: {
      admin_primary: {
        displayName: "Primary Admin",
        email: "primary@example.test",
        role: "admin",
        status: "active",
        updatedAt: "2026-09-24T07:00:00.000Z",
      },
    },
    status: "active",
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    currentLayer: "L3",
    licenseVersion: "license-v1",
  });
  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});
  const base = {
    actorId: "admin_primary",
    actorRole: "admin",
    instituteId,
  };
  const invitation = {
    ...base,
    actionType: "UPSERT_USER_ACCESS" as const,
    commandId: "b0a9c94e-ed3a-4e74-8bf9-9e6f11f56fd1",
    expectedRevision: 0,
    invitation: {
      displayName: "Teacher Staff",
      email,
      role: "teacher" as const,
    },
  };

  const invited = await service.executeRequest(invitation);
  assert.equal(invited.receipt?.targetUserId, targetUserId);
  assert.equal(invited.receipt?.replayed, false);
  assert.equal(invited.communication?.kind, "staff_invitation");
  assert.equal(invited.communication?.status, "queued");
  assert.match(invited.communication?.communicationId ?? "", /^settings_communication_[0-9a-f]{40}$/);
  assert.equal(invited.snapshot.users.find((user) => user.userId === targetUserId)?.status, "invitation_pending");
  let authUser = await getFirebaseAdminApp().auth().getUser(targetUserId);
  assert.equal(authUser.email, email);
  assert.equal(authUser.disabled, false);
  assert.equal(authUser.customClaims?.role, "teacher");
  assert.equal(authUser.customClaims?.instituteId, instituteId);

  const invitationReplay = await service.executeRequest(invitation);
  assert.equal(invitationReplay.receipt?.replayed, true);
  assert.deepEqual(invitationReplay.communication, invited.communication);
  assert.equal(invitationReplay.snapshot.revision, 1);

  const activated = await service.executeRequest({
    ...base,
    actionType: "UPSERT_USER_ACCESS",
    commandId: "8ad5cb1f-a5d9-43c0-95d3-c35bb865600f",
    expectedRevision: 1,
    staffUpdate: {role: "director", status: "active", targetUserId},
  });
  assert.equal(activated.snapshot.revision, 2);
  assert.equal(activated.snapshot.users.find((user) => user.userId === targetUserId)?.role, "director");

  const suspended = await service.executeRequest({
    ...base,
    actionType: "UPSERT_USER_ACCESS",
    commandId: "dbb9585a-dd8e-4aa3-8566-19457161923a",
    expectedRevision: 2,
    staffUpdate: {status: "suspended", targetUserId},
  });
  assert.equal(suspended.snapshot.revision, 3);
  authUser = await getFirebaseAdminApp().auth().getUser(targetUserId);
  assert.equal(authUser.disabled, true);
  assert.equal(authUser.customClaims?.isSuspended, true);

  const reset = await service.executeRequest({
    ...base,
    actionType: "RESET_USER_PASSWORD",
    commandId: "d6a6604f-0d7c-4b08-89f1-1b01e1b6447a",
    expectedRevision: 3,
    targetUserId,
  });
  assert.equal(reset.snapshot.revision, 4);
  assert.equal(reset.receipt?.targetUserId, targetUserId);
  assert.equal(reset.communication?.kind, "staff_password_reset");
  assert.equal(reset.communication?.status, "queued");
  const communications = await firestore.collection("emailQueue")
    .where("instituteId", "==", instituteId)
    .get();
  assert.equal(communications.size, 2);
  for (const communication of communications.docs) {
    const persisted = communication.data();
    assert.equal(persisted.status, "pending");
    assert.equal(persisted.source, "admin_settings");
    assert.equal(persisted.recipientEmail, email);
    assert.equal(persisted.actionLink, undefined);
    assert.equal(persisted.link, undefined);
    assert.equal(persisted.password, undefined);
    assert.equal(persisted.credential, undefined);
    assert.doesNotMatch(JSON.stringify(persisted), /oobCode=|https?:\/\//);
  }

  const removed = await service.executeRequest({
    ...base,
    actionType: "REMOVE_USER_ACCESS",
    commandId: "18f326f1-dd92-4071-9b2a-4f8be69c4641",
    expectedRevision: 4,
    targetUserId,
  });
  assert.equal(removed.snapshot.revision, 5);
  assert.equal(removed.snapshot.users.some((user) => user.userId === targetUserId), false);
  authUser = await getFirebaseAdminApp().auth().getUser(targetUserId);
  assert.equal(authUser.disabled, true);
  assert.deepEqual(authUser.customClaims, {});
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 5);
  assert.equal((await firestore.collection(`${institutePath}/settingsCommands`).get()).size, 5);

  const removalReplay = await service.executeRequest({
    ...base,
    actionType: "REMOVE_USER_ACCESS",
    commandId: "18f326f1-dd92-4071-9b2a-4f8be69c4641",
    expectedRevision: 4,
    targetUserId,
  });
  assert.equal(removalReplay.receipt?.replayed, true);
  assert.equal(removalReplay.snapshot.revision, 5);

  await deleteAuthUserIfPresent(targetUserId);
  await cleanupInstitute(instituteId);
});

test("staff lifecycle protects primary-administrator and self authority", async () => {
  const instituteId = "inst_settings_staff_guards";
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId, {
    primaryAdminUserId: "admin_primary",
    settingsUsers: {
      admin_primary: {
        displayName: "Primary Admin",
        email: "primary@example.test",
        role: "admin",
        status: "active",
        updatedAt: "2026-09-24T07:00:00.000Z",
      },
      admin_secondary: {
        displayName: "Secondary Admin",
        email: "secondary@example.test",
        role: "admin",
        status: "active",
        updatedAt: "2026-09-24T07:00:00.000Z",
      },
    },
  });
  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});
  await assert.rejects(
    service.executeRequest({
      actionType: "REMOVE_USER_ACCESS",
      actorId: "admin_secondary",
      actorRole: "admin",
      commandId: "617f3e94-91f9-4ac2-9863-58a616c7719d",
      expectedRevision: 0,
      instituteId,
      targetUserId: "admin_primary",
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    service.executeRequest({
      actionType: "UPSERT_USER_ACCESS",
      actorId: "admin_secondary",
      actorRole: "admin",
      commandId: "cce17da9-049d-470a-854a-239997309ea7",
      expectedRevision: 0,
      instituteId,
      staffUpdate: {status: "suspended", targetUserId: "admin_secondary"},
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "FORBIDDEN",
  );
  assert.equal((await firestore.doc(`institutes/${instituteId}`).get()).data()?.settingsRevision, 0);
  assert.equal((await firestore.collection(`institutes/${instituteId}/settingsAudit`).get()).size, 0);
  await cleanupInstitute(instituteId);
});

test("snapshot rejects academic-year results beyond the hard bound", async () => {
  const instituteId = "inst_settings_year_bound";
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId);
  await Promise.all(Array.from({length: 26}, (_, index) =>
    firestore.doc(`institutes/${instituteId}/academicYears/year_${index}`).set({
      academicYearLabel: `Year ${String(index).padStart(2, "0")}`,
      status: "Archived",
    })));
  const service = new AdminSettingsService({firestore});
  await assert.rejects(
    service.loadSettingsSnapshot(instituteId),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "CONFLICT",
  );
  await cleanupInstitute(instituteId);
});

test("settings audit snapshot returns exactly fifty newest events and a cursor sentinel", async () => {
  const instituteId = "inst_settings_audit_bound";
  const institutePath = `institutes/${instituteId}`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId, {settingsRevision: 51});
  const batch = firestore.batch();
  for (let index = 0; index < 51; index += 1) {
    const occurredAt = Timestamp.fromMillis(FIXED_TIME.toMillis() - index * 1_000);
    const eventId = `audit_${String(index).padStart(2, "0")}`;
    batch.set(firestore.doc(`${institutePath}/settingsAudit/${eventId}`), {
      actionType: "UPDATE_INSTITUTE_PROFILE",
      actorUserId: "admin_audit_bound",
      area: "institute_profile",
      eventId,
      occurredAt,
      revision: 51 - index,
      summary: `Bounded audit event ${index}.`,
      targetId: instituteId,
    });
  }
  await batch.commit();

  const snapshot = await new AdminSettingsService({firestore})
    .loadSettingsSnapshot(instituteId);
  assert.equal(snapshot.audit.items.length, 50);
  assert.equal(snapshot.audit.items[0]?.eventId, "audit_00");
  assert.equal(snapshot.audit.items[49]?.eventId, "audit_49");
  assert.equal(snapshot.audit.nextCursor, "audit_50");
  await cleanupInstitute(instituteId);
});

test("academic-year lock is atomic, terminal-guarded, and exactly replayable", async () => {
  const instituteId = "inst_settings_year_lock";
  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/2026`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId);
  await firestore.doc(yearPath).set({
    academicYearLabel: "2025-26",
    runCount: 1,
    status: "Active",
    studentCount: 1,
  });
  await firestore.doc(`${yearPath}/runs/run_terminal`).set({status: "completed"});
  await firestore.doc(`${yearPath}/runs/run_terminal/sessions/session_terminal`).set({
    status: "submitted",
  });
  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});
  const command = {
    academicYearId: "2026",
    actionType: "LOCK_ACADEMIC_YEAR" as const,
    actorId: "admin_lock",
    actorRole: "admin",
    commandId: "7c1c1d0c-c0e6-4e3d-a18d-52eb4894c823",
    expectedRevision: 0,
    instituteId,
  };

  const applied = await service.executeRequest(command);
  const replay = await service.executeRequest(command);
  assert.equal(applied.receipt?.replayed, false);
  assert.equal(applied.receipt?.revision, 1);
  assert.equal(replay.receipt?.replayed, true);
  assert.equal(replay.receipt?.auditEventId, applied.receipt?.auditEventId);
  assert.equal((await firestore.doc(yearPath).get()).get("status"), "Locked");
  assert.equal((await firestore.doc(institutePath).get()).get("settingsRevision"), 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsCommands`).get()).size, 1);
  await cleanupInstitute(instituteId);
});

test("academic-year lock rejects non-terminal session authority without writes", async () => {
  const instituteId = "inst_settings_year_lock_guard";
  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/2026`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId);
  await firestore.doc(yearPath).set({
    academicYearLabel: "2025-26",
    runCount: 1,
    status: "Active",
    studentCount: 1,
  });
  await firestore.doc(`${yearPath}/runs/run_active`).set({status: "completed"});
  await firestore.doc(`${yearPath}/runs/run_active/sessions/session_active`).set({
    status: "active",
  });
  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});

  await assert.rejects(
    service.executeRequest({
      academicYearId: "2026",
      actionType: "LOCK_ACADEMIC_YEAR",
      actorId: "admin_lock",
      actorRole: "admin",
      commandId: "45382100-66f8-40f0-8ed6-ac4f8182de19",
      expectedRevision: 0,
      instituteId,
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError &&
      error.code === "CONFLICT" && error.message.includes("terminal"),
  );
  assert.equal((await firestore.doc(yearPath).get()).get("status"), "Active");
  assert.equal((await firestore.doc(institutePath).get()).get("settingsRevision"), 0);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 0);
  assert.equal((await firestore.collection(`${institutePath}/settingsCommands`).get()).size, 0);
  await cleanupInstitute(instituteId);
});

test("concurrent academic-year locks commit one command and one audit", async () => {
  const instituteId = "inst_settings_year_lock_race";
  const institutePath = `institutes/${instituteId}`;
  const yearPath = `${institutePath}/academicYears/2026`;
  await cleanupInstitute(instituteId);
  await seedInstitute(instituteId);
  await firestore.doc(yearPath).set({
    academicYearLabel: "2025-26",
    runCount: 1,
    status: "Active",
    studentCount: 1,
  });
  await firestore.doc(`${yearPath}/runs/run_terminal`).set({status: "completed"});
  await firestore.doc(`${yearPath}/runs/run_terminal/sessions/session_terminal`).set({
    status: "submitted",
  });
  const service = new AdminSettingsService({firestore, now: () => FIXED_TIME});
  const base = {
    academicYearId: "2026",
    actionType: "LOCK_ACADEMIC_YEAR" as const,
    actorId: "admin_lock",
    actorRole: "admin",
    expectedRevision: 0,
    instituteId,
  };
  const commands = [
    {...base, commandId: "2cc47827-7140-43df-b8f9-a958a0c5b790"},
    {...base, commandId: "5bdb6922-8572-438b-891c-157db73ed31c"},
  ];
  const results = await Promise.allSettled(commands.map((command) =>
    service.executeRequest(command)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof AdminSettingsValidationError);
  assert.equal(rejected.reason.code, "CONFLICT");
  assert.equal((await firestore.doc(institutePath).get()).get("settingsRevision"), 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsAudit`).get()).size, 1);
  assert.equal((await firestore.collection(`${institutePath}/settingsCommands`).get()).size, 1);
  await cleanupInstitute(instituteId);
});

test("admin settings rejects vendor-owned settings actions", async () => {
  const service = new AdminSettingsService({firestore});
  await assert.rejects(
    service.executeRequest({
      actionType: "UPDATE_EXECUTION_POLICY",
      actorId: "admin_build_125",
      actorRole: "admin",
      instituteId: "inst_build_125",
    } as never),
    (error: unknown) =>
      error instanceof AdminSettingsValidationError &&
      error.message === "Field \"actionType\" is not supported.",
  );
});

test("admin settings blocks director profile mutations", async () => {
  const service = new AdminSettingsService({firestore});
  await assert.rejects(
    service.executeRequest({
      actionType: "UPDATE_INSTITUTE_PROFILE",
      actorId: "director_build_125",
      actorRole: "director",
      commandId: "d704ba3c-3e26-4aef-8d15-5c390eb07316",
      expectedRevision: 0,
      instituteId: "inst_build_125",
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "director@example.test",
        contactPhone: "+1-555-0199",
        defaultExamType: "JEE_MAIN",
        timeZone: "Asia/Kolkata",
      },
    }),
    (error: unknown) => error instanceof AdminSettingsValidationError && error.code === "FORBIDDEN",
  );
});
