/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {VendorInstituteCommandsService} from "../services/vendorInstituteCommands";
import {VendorOnboardingService} from "../services/vendorOnboarding";
import {VendorInstituteValidationError} from "../types/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
let currentTime = new Date("2026-10-01T10:00:00.000Z");
const onboardingService = new VendorOnboardingService({
  firestore,
  now: () => new Date(currentTime),
});
const instituteService = new VendorInstituteCommandsService({
  firestore,
  now: () => new Date(currentTime),
});

const uuid = (suffix: string): string =>
  `20000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const application = (name: string, email: string) => ({
  expectedConcurrentStudents: 120,
  expectedExamSessionsPerMonth: 30,
  expectedStudents: 300,
  instituteType: "Coaching institute",
  location: "Pune, Maharashtra",
  primaryContactEmail: email,
  primaryContactName: "BWM 034 Contact",
  primaryContactPhone: "+91 98765 43210",
  registeredName: name,
  timezone: "Asia/Kolkata",
});

const expectCode = async (
  promise: Promise<unknown>,
  code: VendorInstituteValidationError["code"],
): Promise<void> => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === code);
};

const clearCollection = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) =>
    firestore.recursiveDelete(document.ref)));
};

const cleanup = async (): Promise<void> => {
  await Promise.all([
    clearCollection("vendorOnboarding"),
    clearCollection("institutes"),
    clearCollection("vendorAuditLogs"),
    clearCollection("vendorInstituteCommands"),
  ]);
};

const createOnboarding = async (input: {
  email: string;
  key: string;
  name: string;
  saveAs?: "draft" | "pending_review";
}) => onboardingService.createOnboarding(
  onboardingService.normalizeCreateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    application: application(input.name, input.email),
    idempotencyKey: uuid(input.key),
    saveAs: input.saveAs ?? "draft",
  }),
);

const command = (input: {
  action: "submit" | "approve" | "request_information" | "expire" | "reject" | "update_application" | "verify_profile" | "reconcile_prerequisites" | "complete_initial_settings" | "activate";
  applicationValue?: ReturnType<typeof application>;
  expectedRevision: number;
  key: string;
  note?: string;
  onboardingId: string;
  reason?: string;
}) => onboardingService.normalizeCommandRequest({
  action: input.action,
  actorId: "vendor_operator",
  actorRole: "vendor",
  ...(input.applicationValue ? {application: input.applicationValue} : {}),
  expectedRevision: input.expectedRevision,
  idempotencyKey: uuid(input.key),
  ...(input.note ? {note: input.note} : {}),
  onboardingId: input.onboardingId,
  ...(input.reason ? {reason: input.reason} : {}),
});

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("normalizers enforce Vendor authority, bounds, application consistency, and derived-only actions", () => {
  assert.throws(() => onboardingService.normalizeListRequest({
    actorId: "admin_operator",
    actorRole: "admin",
  }), (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === "FORBIDDEN");
  assert.throws(() => onboardingService.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 51,
  }));
  assert.throws(() => onboardingService.normalizeCreateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    application: {
      ...application("BWM 034 Invalid", "invalid@example.test"),
      expectedConcurrentStudents: 301,
    },
    idempotencyKey: uuid("1"),
    saveAs: "draft",
  }));
  const reconcile = onboardingService.normalizeCommandRequest({
    action: "reconcile_prerequisites",
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 4,
    idempotencyKey: uuid("2"),
    onboardingId: "onboarding_valid",
  });
  assert.equal(reconcile.command.action, "reconcile_prerequisites");
  assert.throws(() => onboardingService.normalizeCommandRequest({
    action: "mark_payment_received",
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 4,
    idempotencyKey: uuid("3"),
    onboardingId: "onboarding_valid",
  }));
});

test("create has deterministic duplicate prevention, exact replay, and bounded list/detail cursors", async () => {
  currentTime = new Date("2026-10-01T10:00:00.000Z");
  const alphaRequest = onboardingService.normalizeCreateRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    application: application("BWM 034 Alpha Academy", "alpha-bwm034@example.test"),
    idempotencyKey: uuid("10"),
    saveAs: "draft",
  });
  const alpha = await onboardingService.createOnboarding(alphaRequest);
  assert.equal(alpha.onboarding.status, "draft");
  assert.equal(alpha.onboarding.revision, 1);
  assert.deepEqual(alpha.onboarding.activationBlockers, [
    "institute_not_provisioned",
    "commercial_authority_missing",
    "primary_administrator_missing",
    "profile_not_verified",
    "settings_incomplete",
  ]);
  assert.equal((await onboardingService.createOnboarding(alphaRequest)).replayed, true);
  await expectCode(createOnboarding({
    email: "alpha-bwm034@example.test",
    key: "11",
    name: "BWM 034 Alpha Academy",
  }), "CONFLICT");
  await expectCode(createOnboarding({
    email: "alpha-bwm034@example.test",
    key: "111",
    name: "BWM 034 Different Name",
  }), "CONFLICT");
  await expectCode(createOnboarding({
    email: "different-bwm034@example.test",
    key: "112",
    name: "BWM 034 Alpha Academy",
  }), "CONFLICT");

  currentTime = new Date("2026-10-01T11:00:00.000Z");
  const beta = await createOnboarding({
    email: "beta-bwm034@example.test",
    key: "12",
    name: "BWM 034 Beta Institute",
    saveAs: "pending_review",
  });
  const listRequest = onboardingService.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 1,
  });
  const first = await onboardingService.listOnboarding(listRequest);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].onboardingId, beta.onboarding.onboardingId);
  assert.ok(first.nextCursor);
  const second = await onboardingService.listOnboarding({
    ...listRequest,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].onboardingId, alpha.onboarding.onboardingId);
  await expectCode(onboardingService.listOnboarding({
    ...listRequest,
    cursor: first.nextCursor,
    status: "draft",
  }), "VALIDATION_ERROR");
  const search = await onboardingService.listOnboarding(
    onboardingService.normalizeListRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      query: "alpha-bwm034@",
    }),
  );
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].onboardingId, alpha.onboarding.onboardingId);
  const detail = await onboardingService.getOnboardingDetail(
    onboardingService.normalizeDetailRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      eventsLimit: 1,
      onboardingId: beta.onboarding.onboardingId,
    }),
  );
  assert.equal(detail.events.items.length, 1);
  assert.equal(detail.events.items[0].type, "pending_review");
  assert.equal(detail.commercialReadiness, "not_configured");
});

test("review commands are revisioned, legally ordered, audited, replayable, and race-safe", async () => {
  const created = await createOnboarding({
    email: "review-bwm034@example.test",
    key: "20",
    name: "BWM 034 Review Institute",
  });
  const onboardingId = created.onboarding.onboardingId;
  const updatedApplication = application(
    "BWM 034 Review Institute Updated",
    "review-bwm034@example.test",
  );
  const updated = await onboardingService.executeCommand(command({
    action: "update_application",
    applicationValue: updatedApplication,
    expectedRevision: 1,
    key: "21",
    onboardingId,
  }));
  assert.equal(updated.revision, 2);
  const submitted = await onboardingService.executeCommand(command({
    action: "submit",
    expectedRevision: 2,
    key: "22",
    note: "Ready for review",
    onboardingId,
  }));
  assert.equal(submitted.status, "pending_review");
  const information = await onboardingService.executeCommand(command({
    action: "request_information",
    expectedRevision: 3,
    key: "23",
    note: "Need confirmation",
    onboardingId,
  }));
  assert.equal(information.status, "information_required");
  await onboardingService.executeCommand(command({
    action: "update_application",
    applicationValue: updatedApplication,
    expectedRevision: 4,
    key: "24",
    onboardingId,
  }));
  await onboardingService.executeCommand(command({
    action: "submit",
    expectedRevision: 5,
    key: "25",
    note: "Resubmitted",
    onboardingId,
  }));

  const approveRequest = command({
    action: "approve",
    expectedRevision: 6,
    key: "26",
    note: "Approved",
    onboardingId,
  });
  const rejectRequest = command({
    action: "reject",
    expectedRevision: 6,
    key: "27",
    onboardingId,
    reason: "Conflicting concurrent decision",
  });
  const settled = await Promise.allSettled([
    onboardingService.executeCommand(approveRequest),
    onboardingService.executeCommand(rejectRequest),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected" &&
    result.reason instanceof VendorInstituteValidationError &&
    result.reason.code === "CONFLICT").length, 1);
  const authority = await firestore.doc(`vendorOnboarding/${onboardingId}`).get();
  assert.equal(authority.get("revision"), 7);
  assert.ok(["approved", "rejected"].includes(authority.get("status")));
  const winner = settled.find((result) => result.status === "fulfilled");
  assert.ok(winner && winner.status === "fulfilled");
  const winningRequest = winner.value.status === "approved" ? approveRequest : rejectRequest;
  assert.equal((await onboardingService.executeCommand(winningRequest)).replayed, true);
  const audit = await firestore.doc(`vendorAuditLogs/${winner.value.auditEventId}`).get();
  assert.equal(audit.get("note"), undefined);
  assert.equal(audit.get("reason"), undefined);
});

test("provisioning through activation readiness derives commercial, primary, and settings authority", async () => {
  currentTime = new Date("2026-10-02T10:00:00.000Z");
  const created = await createOnboarding({
    email: "activation-bwm034@example.test",
    key: "30",
    name: "BWM 034 Activation Institute",
    saveAs: "pending_review",
  });
  const onboardingId = created.onboarding.onboardingId;
  await onboardingService.executeCommand(command({
    action: "approve",
    expectedRevision: 1,
    key: "31",
    note: "Approved for provisioning",
    onboardingId,
  }));
  const provisioned = await instituteService.createInstitute(
    instituteService.normalizeCreateRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      expectedOnboardingRevision: 2,
      idempotencyKey: uuid("32"),
      onboardingId,
    }),
  );
  const instituteId = provisioned.institute.instituteId;
  const verified = await onboardingService.executeCommand(command({
    action: "verify_profile",
    expectedRevision: 3,
    key: "33",
    onboardingId,
  }));
  assert.equal(verified.status, "awaiting_commercial_authority");
  await expectCode(onboardingService.executeCommand(command({
    action: "reconcile_prerequisites",
    expectedRevision: 4,
    key: "34",
    onboardingId,
  })), "CONFLICT");

  const instituteReference = firestore.doc(`institutes/${instituteId}`);
  await instituteReference.update({vendorLicenseLayer: "L1"});
  await instituteReference.collection("license").doc("current").set({
    currentLayer: "L1",
    licenseState: "active",
    licenseVersion: "license_bwm034_activation_1",
    planId: "L1-standard",
  });
  const commercialReady = await onboardingService.executeCommand(command({
    action: "reconcile_prerequisites",
    expectedRevision: 4,
    key: "35",
    onboardingId,
  }));
  assert.equal(commercialReady.status, "ready_for_administrator");
  await expectCode(onboardingService.executeCommand(command({
    action: "reconcile_prerequisites",
    expectedRevision: 5,
    key: "36",
    onboardingId,
  })), "CONFLICT");

  const primaryUserId = "vendor_primary_bwm034";
  await instituteReference.update({
    primaryAdminUserId: primaryUserId,
    settingsRevision: 1,
    settingsUsers: {
      [primaryUserId]: {
        displayName: "BWM 034 Primary",
        email: "primary-bwm034@example.test",
        invitationStatus: "accepted",
        role: "admin",
        status: "active",
        updatedAt: Timestamp.fromDate(currentTime),
      },
    },
  });
  const administratorReady = await onboardingService.executeCommand(command({
    action: "reconcile_prerequisites",
    expectedRevision: 5,
    key: "37",
    onboardingId,
  }));
  assert.equal(administratorReady.status, "setup_in_progress");
  await expectCode(onboardingService.executeCommand(command({
    action: "complete_initial_settings",
    expectedRevision: 6,
    key: "38",
    onboardingId,
  })), "CONFLICT");

  await instituteReference.update({
    profile: {
      academicYearFormat: "YYYY-YYYY",
      contactEmail: "office-bwm034@example.test",
      contactPhone: "+91 98765 43210",
      defaultExamType: "Mock",
      instituteName: "BWM 034 Activation Institute",
      logoReference: "logos/bwm034.svg",
      timeZone: "Asia/Kolkata",
    },
    securitySettings: {
      allowMultipleAdminSessions: false,
      forceLogoutOnPasswordChange: true,
      sessionTimeoutDuration: 60,
    },
  });
  await instituteReference.collection("academicYears").doc("2026-27").set({
    academicYearLabel: "2026-27",
    status: "Active",
  });
  const settingsReady = await onboardingService.executeCommand(command({
    action: "complete_initial_settings",
    expectedRevision: 6,
    key: "39",
    onboardingId,
  }));
  assert.equal(settingsReady.status, "ready_for_activation");
  const activated = await onboardingService.executeCommand(command({
    action: "activate",
    expectedRevision: 7,
    key: "40",
    onboardingId,
  }));
  assert.equal(activated.status, "active");
  const [onboardingAuthority, instituteAuthority, detail, instituteAudit] =
    await Promise.all([
      firestore.doc(`vendorOnboarding/${onboardingId}`).get(),
      instituteReference.get(),
      onboardingService.getOnboardingDetail(
        onboardingService.normalizeDetailRequest({
          actorId: "vendor_operator",
          actorRole: "vendor",
          eventsLimit: 2,
          onboardingId,
        }),
      ),
      firestore.doc(`institutes/${instituteId}/auditLogs/${activated.auditEventId}`).get(),
    ]);
  assert.equal(onboardingAuthority.get("revision"), 8);
  assert.equal(instituteAuthority.get("vendorLifecycleState"), "active");
  assert.equal(instituteAuthority.get("status"), "active");
  assert.equal(instituteAuthority.get("instituteRevision"), 2);
  assert.deepEqual(detail.activationBlockers, []);
  assert.equal(detail.commercialReadiness, "configured");
  assert.equal(detail.primaryAdministrator?.userId, primaryUserId);
  assert.equal(detail.profileVerified, true);
  assert.equal(detail.initialSettingsComplete, true);
  assert.equal(detail.events.items.length, 2);
  assert.ok(detail.events.nextCursor);
  assert.equal(instituteAudit.exists, true);
});

test("terminal review states and activation cannot bypass legal transitions", async () => {
  const created = await createOnboarding({
    email: "terminal-bwm034@example.test",
    key: "50",
    name: "BWM 034 Terminal Institute",
    saveAs: "pending_review",
  });
  const onboardingId = created.onboarding.onboardingId;
  const rejected = await onboardingService.executeCommand(command({
    action: "reject",
    expectedRevision: 1,
    key: "51",
    onboardingId,
    reason: "Application does not meet requirements",
  }));
  assert.equal(rejected.status, "rejected");
  await expectCode(onboardingService.executeCommand(command({
    action: "submit",
    expectedRevision: 2,
    key: "52",
    note: "Attempted restart",
    onboardingId,
  })), "CONFLICT");
  await expectCode(onboardingService.executeCommand(command({
    action: "activate",
    expectedRevision: 2,
    key: "53",
    onboardingId,
  })), "CONFLICT");
});
