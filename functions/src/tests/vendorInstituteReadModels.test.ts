/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {VendorInstituteReadModelsService} from "../services/vendorInstituteReadModels";
import {VendorInstituteValidationError} from "../types/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const service = new VendorInstituteReadModelsService({firestore});
const TEST_PREFIX = "inst_bwm034_read_";

const at = (value: string): Timestamp =>
  Timestamp.fromDate(new Date(value));

const expectCode = async (
  promise: Promise<unknown>,
  code: VendorInstituteValidationError["code"],
): Promise<void> => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === code);
};

const cleanup = async (): Promise<void> => {
  const snapshot = await firestore.collection("institutes").get();
  await Promise.all(snapshot.docs
    .filter((document) => document.id.startsWith(TEST_PREFIX))
    .map((document) => firestore.recursiveDelete(document.ref)));
};

const seedInstitute = async (input: {
  administration?: Record<string, unknown>;
  deletionOperation?: Record<string, unknown>;
  id: string;
  layer?: "L0" | "L1" | "L2" | "L3";
  licenseLayerOverride?: "L0" | "L1" | "L2" | "L3";
  lifecycleState?: "active" | "archived" | "deletion_scheduled";
  registeredName: string;
  updatedAt: string;
  vendorSummary?: Record<string, unknown>;
}): Promise<void> => {
  const lifecycleState = input.lifecycleState ?? "active";
  const instituteReference = firestore.doc(`institutes/${input.id}`);
  const userId = `admin_${input.id}`;
  await instituteReference.set({
    createdAt: at("2026-01-01T00:00:00.000Z"),
    ...(input.deletionOperation ? {deletionOperation: input.deletionOperation} : {}),
    instituteId: input.id,
    instituteRevision: 4,
    primaryAdminUserId: userId,
    registeredName: input.registeredName,
    settingsRevision: 7,
    settingsUsers: {
      [userId]: {
        displayName: `${input.registeredName} Administrator`,
        email: `${input.id}@example.test`,
        role: "admin",
        status: "active",
        updatedAt: at("2026-09-29T10:00:00.000Z"),
      },
    },
    status: lifecycleState === "active" ? "active" : "suspended",
    updatedAt: at(input.updatedAt),
    vendorAccountReference: `account_${input.id}`,
    vendorFilterKeys: [
      `query=${input.registeredName.toLowerCase()}`,
      `query=${input.registeredName.toLowerCase().split(" ")[0]}`,
    ],
    ...(input.layer ? {
      vendorLicenseLayer: input.licenseLayerOverride ?? input.layer,
    } : {}),
    vendorLifecycleState: lifecycleState,
    ...(input.vendorSummary ? {vendorSummary: input.vendorSummary} : {}),
    ...(input.administration ?? {}),
  });
  if (input.layer) {
    await instituteReference.collection("license").doc("current").set({
      currentLayer: input.layer,
      licenseState: "active",
      licenseVersion: `license_${input.id}_4`,
      planId: `${input.layer}-standard`,
    });
  }
};

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("normalizers require Vendor authority and enforce bounded filters", () => {
  assert.deepEqual(service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    query: "  Alpha   Academy ",
  }), {
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 25,
    query: "alpha academy",
  });
  assert.throws(() => service.normalizeListRequest({
    actorId: "admin_operator",
    actorRole: "admin",
  }), (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === "FORBIDDEN");
  assert.throws(() => service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 51,
  }), (error: unknown) =>
    error instanceof VendorInstituteValidationError && error.code === "VALIDATION_ERROR");
  assert.throws(() => service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    lifecycleState: "unknown",
  }));
  assert.throws(() => service.normalizeDetailRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    instituteId: "",
  }));
});

test("directory uses deterministic bounded cursors and nullable aggregate authority", async () => {
  await Promise.all([
    seedInstitute({
      id: `${TEST_PREFIX}alpha`,
      layer: "L2",
      registeredName: "Alpha Academy",
      updatedAt: "2026-10-01T10:00:00.000Z",
      vendorSummary: {
        activeStudentCount: 120,
        aggregateAsOf: at("2026-10-01T09:55:00.000Z"),
        lastActiveAt: at("2026-10-01T09:50:00.000Z"),
        monthlyTestRuns: 18,
      },
    }),
    seedInstitute({
      id: `${TEST_PREFIX}beta`,
      registeredName: "Beta School",
      updatedAt: "2026-09-30T10:00:00.000Z",
    }),
    seedInstitute({
      id: `${TEST_PREFIX}gamma`,
      layer: "L1",
      lifecycleState: "archived",
      registeredName: "Gamma Institute",
      updatedAt: "2026-09-29T10:00:00.000Z",
    }),
  ]);
  const request = service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 1,
  });
  const first = await service.listInstitutes(request);
  assert.equal(first.totalMatching >= 3, true);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].instituteId, `${TEST_PREFIX}alpha`);
  assert.equal(first.items[0].aggregate.activeStudentCount, 120);
  assert.equal(first.items[0].commercial.licenseLayer, "L2");
  assert.equal(first.items[0].primaryAdministrator?.status, "active");
  assert.ok(first.nextCursor);

  const second = await service.listInstitutes({...request, cursor: first.nextCursor});
  assert.equal(second.items[0].instituteId, `${TEST_PREFIX}beta`);
  assert.deepEqual(second.items[0].aggregate, {
    activeStudentCount: null,
    aggregateAsOf: null,
    lastActiveAt: null,
    monthlyTestRuns: null,
  });
  assert.deepEqual(second.items[0].commercial, {
    authorityState: "not_configured",
    licenseLayer: null,
    licenseState: null,
    licenseVersion: null,
    planId: null,
  });

  await expectCode(service.listInstitutes({
    ...request,
    cursor: first.nextCursor,
    lifecycleState: "archived",
  }), "VALIDATION_ERROR");
});

test("detail projects bounded staff and durable deletion state", async () => {
  const instituteId = `${TEST_PREFIX}detail`;
  await seedInstitute({
    deletionOperation: {
      eligibleAt: at("2026-11-01T00:00:00.000Z"),
      lastErrorCode: null,
      operationId: "delete_detail_1",
      scheduledAt: at("2026-10-01T00:00:00.000Z"),
      stage: "scheduled",
    },
    id: instituteId,
    layer: "L3",
    lifecycleState: "deletion_scheduled",
    registeredName: "Detail Institute",
    updatedAt: "2026-10-01T11:00:00.000Z",
  });
  const detail = await service.getInstituteDetail({
    actorId: "vendor_operator",
    actorRole: "vendor",
    instituteId,
  });
  assert.equal(detail.instituteId, instituteId);
  assert.equal(detail.accessStatus, "suspended");
  assert.equal(detail.lifecycleState, "deletion_scheduled");
  assert.equal(detail.deletion.stage, "scheduled");
  assert.equal(detail.deletion.eligibleAt, "2026-11-01T00:00:00.000Z");
  assert.equal(detail.administrators.length, 1);
  assert.equal(detail.administrators[0].isPrimaryAdministrator, true);
  assert.equal(detail.profile.vendorAccountReference, `account_${instituteId}`);
  assert.equal(detail.settingsRevision, 7);
});

test("detail projects a valid initial pending primary administrator", async () => {
  const instituteId = `${TEST_PREFIX}pending-primary`;
  const pendingUserId = `staff_${instituteId}`;
  await seedInstitute({
    administration: {
      pendingPrimaryAdministrator: {
        currentPrimaryUserId: null,
        kind: "initial",
        proposedAt: at("2026-10-01T10:00:00.000Z"),
        userId: pendingUserId,
      },
      primaryAdminUserId: null,
      settingsRevision: 8,
      settingsUsers: {
        [pendingUserId]: {
          displayName: "Pending Administrator",
          email: "pending@example.test",
          invitationStatus: "queued",
          role: "admin",
          status: "invitation_pending",
          updatedAt: at("2026-10-01T10:00:00.000Z"),
        },
      },
    },
    id: instituteId,
    layer: "L1",
    registeredName: "Pending Primary Institute",
    updatedAt: "2026-10-01T10:00:00.000Z",
  });

  const detail = await service.getInstituteDetail({
    actorId: "vendor_operator",
    actorRole: "vendor",
    instituteId,
  });
  assert.equal(detail.primaryAdministrator, null);
  assert.equal(detail.administrators.length, 1);
  assert.equal(detail.administrators[0].userId, pendingUserId);
  assert.equal(detail.administrators[0].isPrimaryAdministrator, false);
  assert.equal(detail.administrators[0].status, "invitation_pending");
});

test("missing and inconsistent persisted authority fail closed", async () => {
  const mismatchedId = `${TEST_PREFIX}mismatch`;
  await seedInstitute({
    id: mismatchedId,
    layer: "L2",
    licenseLayerOverride: "L1",
    registeredName: "Mismatch Institute",
    updatedAt: "2026-10-01T12:00:00.000Z",
  });
  await expectCode(service.getInstituteDetail({
    actorId: "vendor_operator",
    actorRole: "vendor",
    instituteId: mismatchedId,
  }), "INTERNAL_ERROR");
  await expectCode(service.getInstituteDetail({
    actorId: "vendor_operator",
    actorRole: "vendor",
    instituteId: `${TEST_PREFIX}missing`,
  }), "NOT_FOUND");
});
