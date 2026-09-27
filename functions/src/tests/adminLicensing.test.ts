import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {AdminLicensingService} from "../services/adminLicensing";
import {AdminLicensingValidationError} from "../types/adminLicensing";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const FIXED_NOW = new Date("2026-09-26T12:00:00.000Z");
const PRICING_COLLECTION = "vendorConfig/pricingPlans/pricingPlans";

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanupInstitute = async (instituteId: string): Promise<void> => {
  const institutePath = `institutes/${instituteId}`;
  await Promise.all([
    deleteCollectionDocuments(`${institutePath}/billingRecords`),
    deleteCollectionDocuments(`${institutePath}/license`),
    deleteCollectionDocuments(`${institutePath}/licenseHistory`),
    deleteCollectionDocuments(`${institutePath}/licenseRequestAudit`),
    deleteCollectionDocuments(`${institutePath}/licenseRequestCommands`),
    deleteCollectionDocuments(`${institutePath}/licenseRequests`),
    deleteCollectionDocuments(`${institutePath}/licenseRequestState`),
    deleteCollectionDocuments(`${institutePath}/usageMeter`),
  ]);
  const instituteReference = firestore.doc(institutePath);
  if ((await instituteReference.get()).exists) {
    await instituteReference.delete();
  }
};

const seedPlan = async (
  planId: string,
  layer: "L0" | "L1" | "L2" | "L3",
  studentLimit: number,
): Promise<void> => {
  await firestore.doc(`${PRICING_COLLECTION}/${planId}`).set({
    basePriceMonthly: 1000,
    concurrencyLimit: 40,
    currency: "inr",
    featureFlags: {
      adaptivePhase: layer === "L2" || layer === "L3",
      controlledMode: layer === "L2" || layer === "L3",
      governanceAccess: layer === "L3",
      hardMode: layer === "L2" || layer === "L3",
      riskOverview: layer !== "L0",
    },
    layer,
    maxExamSessionsPerMonth: 100,
    name: `${layer} Test Plan`,
    planId,
    pricePerStudent: 25,
    studentLimit,
  });
};

const createService = (): AdminLicensingService =>
  new AdminLicensingService({firestore, now: () => FIXED_NOW});

const seedRequestAuthority = async (input: {
  currentLayer: "L0" | "L1" | "L2";
  currentPlanId: string;
  instituteId: string;
  licenseVersion: string;
  requestedLayer: "L1" | "L2" | "L3";
  requestedPlanId: string;
}): Promise<void> => {
  const institutePath = `institutes/${input.instituteId}`;
  await cleanupInstitute(input.instituteId);
  await seedPlan(input.currentPlanId, input.currentLayer, 120);
  await seedPlan(input.requestedPlanId, input.requestedLayer, 250);
  await firestore.doc(institutePath).set({
    instituteId: input.instituteId,
    instituteName: `${input.instituteId} Institute`,
    licenseVersion: input.licenseVersion,
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    activeStudentLimit: 120,
    billingCycle: "annual",
    currentLayer: input.currentLayer,
    expiryDate: "2027-09-26T12:00:00.000Z",
    featureFlags: {
      adaptivePhase: input.currentLayer === "L2",
      controlledMode: input.currentLayer === "L2",
      governanceAccess: false,
      hardMode: input.currentLayer === "L2",
      riskOverview: input.currentLayer !== "L0",
    },
    licenseState: "active",
    licenseVersion: input.licenseVersion,
    planId: input.currentPlanId,
    planName: `${input.currentLayer} Current Plan`,
    startDate: "2026-09-01T00:00:00.000Z",
  });
};

test.before(async () => {
  await deleteCollectionDocuments(PRICING_COLLECTION);
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("snapshot projects only bounded authoritative licensing records", async () => {
  const instituteId = "inst_admin_licensing_authority";
  const institutePath = `institutes/${instituteId}`;
  const planId = "L2-STRICT";
  await cleanupInstitute(instituteId);
  await seedPlan("L0-STRICT", "L0", 100);
  await seedPlan(planId, "L2", 250);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "Strict Licensing Institute",
    licenseVersion: "license_version_strict",
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    activeStudentLimit: 250,
    billingCycle: "monthly",
    concurrencyLimit: 40,
    currentLayer: "L2",
    expiryDate: "2027-09-26T12:00:00.000Z",
    externalActions: [{action: "contact_support", url: "https://support.example.test/license"}],
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: false,
      hardMode: true,
      riskOverview: true,
    },
    gracePeriodEndsAt: null,
    licenseState: "active",
    licenseVersion: "license_version_strict",
    planId,
    planName: "Controlled Strict",
    renewalDate: "2027-09-01T00:00:00.000Z",
    startDate: "2026-09-01T00:00:00.000Z",
  });
  await firestore.doc(`${institutePath}/usageMeter/2026-09`).set({
    activeStudentCount: 120,
    activeStudentLimit: 250,
    approachingLimit: false,
    assignedStudentsCount: 140,
    assignmentsCreated: 18,
    billingTierCompliance: true,
    cycleId: "2026-09",
    overLimit: false,
    peakActiveStudents: 130,
    peakStudentUsage: 145,
    pricingPlanId: planId,
    projectedInvoiceAmount: 4000,
    sessionExecutionVolume: 320,
    updatedAt: Timestamp.fromDate(new Date("2026-09-25T10:00:00.000Z")),
  });
  await firestore.doc(`${institutePath}/billingRecords/in_strict_paid`).set({
    amountPaid: 3900,
    billingPeriodEnd: "2026-08-31T23:59:59.000Z",
    billingPeriodStart: "2026-08-01T00:00:00.000Z",
    createdAt: Timestamp.fromDate(new Date("2026-09-01T01:00:00.000Z")),
    currency: "inr",
    status: "paid",
    stripeInvoiceId: "in_strict_paid",
  });
  await firestore.doc(`${institutePath}/licenseRequests/request_strict`).set({
    currentLayer: "L2",
    currentPlanId: planId,
    decidedAt: null,
    decidedByUserId: null,
    decisionNote: null,
    expectedLicenseVersion: "license_version_strict",
    reason: "Governance evaluation is required for the next academic cycle.",
    requestId: "request_strict",
    requestKind: "evaluation",
    requestedLayer: "L3",
    requestedPlanId: "L3-STRICT",
    status: "pending",
    submittedAt: Timestamp.fromDate(new Date("2026-09-25T11:00:00.000Z")),
    submittedByUserId: "admin_strict",
  });
  await firestore.doc(`${institutePath}/licenseRequestState/current`).set({
    openRequestId: "request_strict",
  });

  const historyBatch = firestore.batch();
  for (let index = 0; index < 26; index += 1) {
    const entryId = `history_${String(index).padStart(2, "0")}`;
    const timestamp = new Date(Date.UTC(2026, 8, 26, 0, index));
    historyBatch.set(firestore.doc(`${institutePath}/licenseHistory/${entryId}`), {
      billingPlan: planId,
      changedBy: "vendor_strict",
      effectiveDate: timestamp.toISOString(),
      entryId,
      newLayer: "L2",
      newStudentLimit: 250,
      previousLayer: index === 0 ? "L1" : "L2",
      previousStudentLimit: 120,
      reason: `Strict history event ${index}`,
      timestamp: Timestamp.fromDate(timestamp),
    });
  }
  await historyBatch.commit();

  const result = await createService().executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_strict",
    actorRole: "admin",
    instituteId,
  });
  const snapshot = result.snapshot;

  assert.equal(snapshot.currentLicense.instituteId, instituteId);
  assert.equal(snapshot.currentLicense.instituteName, "Strict Licensing Institute");
  assert.equal(snapshot.currentLicense.layer, "L2");
  assert.equal(snapshot.currentLicense.state, "active");
  assert.equal(snapshot.currentLicense.licenseVersion, "license_version_strict");
  assert.equal(snapshot.usage?.cycleId, "2026-09");
  assert.equal(snapshot.usage?.projectedInvoiceAmount, 4000);
  assert.equal(snapshot.usage?.projectedInvoiceCurrency, "INR");
  assert.equal(snapshot.billing.items[0]?.invoiceId, "in_strict_paid");
  assert.equal(snapshot.billing.items[0]?.amountPaid, 3900);
  assert.equal(snapshot.history.items.length, 25);
  assert.equal(typeof snapshot.history.nextCursor, "string");
  assert.equal(snapshot.requests.openRequestId, "request_strict");
  assert.equal(snapshot.requests.items[0]?.submittedByUserId, "admin_strict");
  assert.equal(snapshot.externalActions[0]?.action, "contact_support");
  assert.equal(
    snapshot.plans.some((plan) => plan.planId === planId),
    true,
  );
  assert.equal(
    snapshot.capabilities.find((capability) => capability.capabilityId === "controlled_mode")
      ?.state,
    "enabled",
  );
  assert.equal(
    snapshot.capabilities.find((capability) => capability.capabilityId === "governance_dashboard")
      ?.lockReason,
    "minimum_layer",
  );
  assert.equal("eligibilityProgress" in snapshot, false);
  assert.equal("usageAndBilling" in snapshot, false);
});

test("snapshot never falls back to license/main", async () => {
  const instituteId = "inst_admin_licensing_no_current";
  const institutePath = `institutes/${instituteId}`;
  await cleanupInstitute(instituteId);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "No Current License Institute",
  });
  await firestore.doc(`${institutePath}/license/main`).set({
    billingCycle: "monthly",
    currentLayer: "L2",
    licenseState: "active",
    licenseVersion: "legacy_main_version",
    planId: "L2-STRICT",
  });

  await assert.rejects(
    createService().executeRequest({
      actionType: "GET_LICENSE_SNAPSHOT",
      actorId: "admin_no_current",
      actorRole: "admin",
      instituteId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AdminLicensingValidationError);
      assert.equal(error.code, "INTERNAL_ERROR");
      assert.match(error.message, /license\/current/);
      return true;
    },
  );
});

test("past expiry locks capabilities and absent optional sources stay empty", async () => {
  const instituteId = "inst_admin_licensing_expired";
  const institutePath = `institutes/${instituteId}`;
  const planId = "L1-EXPIRED";
  await cleanupInstitute(instituteId);
  await seedPlan(planId, "L1", 120);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "Expired License Institute",
    licenseVersion: "license_version_expired",
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    activeStudentLimit: 120,
    billingCycle: "annual",
    currentLayer: "L1",
    expiryDate: "2026-09-25T11:59:59.000Z",
    featureFlags: {riskOverview: true},
    licenseState: "active",
    licenseVersion: "license_version_expired",
    planId,
    planName: "Expired Diagnostic",
    startDate: "2025-09-26T12:00:00.000Z",
  });

  const result = await createService().executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_expired",
    actorRole: "admin",
    instituteId,
  });

  assert.equal(result.snapshot.currentLicense.state, "expired");
  assert.equal(result.snapshot.usage, null);
  assert.deepEqual(result.snapshot.billing.items, []);
  assert.deepEqual(result.snapshot.history.items, []);
  assert.deepEqual(result.snapshot.requests.items, []);
  assert.deepEqual(result.snapshot.externalActions, []);
  assert.equal(
    result.snapshot.capabilities.every(
      (capability) => capability.state === "locked" && capability.lockReason === "license_expired",
    ),
    true,
  );
});

test("grace state locks all capabilities", async () => {
  const instituteId = "inst_admin_licensing_grace";
  const institutePath = `institutes/${instituteId}`;
  const planId = "L2-GRACE";
  await cleanupInstitute(instituteId);
  await seedPlan(planId, "L2", 250);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "Grace License Institute",
    licenseVersion: "license_version_grace",
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    activeStudentLimit: 250,
    billingCycle: "annual",
    currentLayer: "L2",
    expiryDate: "2027-09-26T12:00:00.000Z",
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: false,
      hardMode: true,
      riskOverview: true,
    },
    gracePeriodEndsAt: "2026-10-03T12:00:00.000Z",
    licenseState: "grace",
    licenseVersion: "license_version_grace",
    planId,
    planName: "Grace Controlled",
    startDate: "2026-09-01T00:00:00.000Z",
  });

  const result = await createService().executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_grace",
    actorRole: "admin",
    instituteId,
  });

  assert.equal(result.snapshot.currentLicense.state, "grace");
  assert.equal(
    result.snapshot.capabilities.every(
      (capability) =>
        capability.state === "locked" && capability.lockReason === "license_grace",
    ),
    true,
  );
});

test("capability projection covers every layer and exact feature lock", async () => {
  const layers = ["L0", "L1", "L2", "L3"] as const;
  const expectedEnabledByLayer: Record<(typeof layers)[number], string[]> = {
    L0: ["basic_test_engine", "raw_accuracy_analytics"],
    L1: [
      "basic_test_engine",
      "pattern_alerts",
      "raw_accuracy_analytics",
      "risk_overview",
    ],
    L2: [
      "adaptive_phase",
      "basic_test_engine",
      "controlled_mode",
      "hard_mode",
      "pattern_alerts",
      "raw_accuracy_analytics",
      "risk_overview",
    ],
    L3: [
      "adaptive_phase",
      "basic_test_engine",
      "controlled_mode",
      "governance_dashboard",
      "hard_mode",
      "override_audit",
      "pattern_alerts",
      "raw_accuracy_analytics",
      "risk_overview",
    ],
  };
  const flagsByLayer = {
    L0: {},
    L1: {riskOverview: true},
    L2: {
      adaptivePhase: true,
      controlledMode: true,
      hardMode: true,
      riskOverview: true,
    },
    L3: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: true,
      hardMode: true,
      riskOverview: true,
    },
  };

  for (const layer of layers) {
    const instituteId = `inst_admin_licensing_matrix_${layer.toLowerCase()}`;
    const planId = `${layer}-MATRIX`;
    const licenseVersion = `license_matrix_${layer.toLowerCase()}`;
    await cleanupInstitute(instituteId);
    await seedPlan(planId, layer, 300);
    await firestore.doc(`institutes/${instituteId}`).set({
      instituteId,
      instituteName: `${layer} Matrix Institute`,
      licenseVersion,
    });
    await firestore.doc(`institutes/${instituteId}/license/current`).set({
      activeStudentLimit: 300,
      billingCycle: "annual",
      currentLayer: layer,
      expiryDate: "2027-09-26T12:00:00.000Z",
      featureFlags: flagsByLayer[layer],
      licenseState: "active",
      licenseVersion,
      planId,
      startDate: "2026-09-01T00:00:00.000Z",
    });

    const result = await createService().executeRequest({
      actionType: "GET_LICENSE_SNAPSHOT",
      actorId: `admin_matrix_${layer.toLowerCase()}`,
      actorRole: "admin",
      instituteId,
    });
    const enabled = result.snapshot.capabilities
      .filter((capability) => capability.state === "enabled")
      .map((capability) => capability.capabilityId)
      .sort();
    assert.deepEqual(enabled, expectedEnabledByLayer[layer].sort());
    for (const capability of result.snapshot.capabilities) {
      assert.deepEqual(Object.keys(capability.layers), layers);
    }
  }

  const instituteId = "inst_admin_licensing_matrix_features_disabled";
  const planId = "L3-MATRIX-FEATURES-DISABLED";
  await cleanupInstitute(instituteId);
  await seedPlan(planId, "L3", 300);
  await firestore.doc(`institutes/${instituteId}`).set({
    instituteId,
    instituteName: "Feature-disabled Matrix Institute",
    licenseVersion: "license_matrix_features_disabled",
  });
  await firestore.doc(`institutes/${instituteId}/license/current`).set({
    activeStudentLimit: 300,
    billingCycle: "annual",
    currentLayer: "L3",
    expiryDate: "2027-09-26T12:00:00.000Z",
    featureFlags: {
      adaptivePhase: false,
      controlledMode: false,
      governanceAccess: false,
      hardMode: false,
      riskOverview: false,
    },
    licenseState: "active",
    licenseVersion: "license_matrix_features_disabled",
    planId,
    startDate: "2026-09-01T00:00:00.000Z",
  });
  const featureResult = await createService().executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_matrix_features_disabled",
    actorRole: "admin",
    instituteId,
  });
  const featureCapabilities = featureResult.snapshot.capabilities.filter(
    (capability) => capability.featureFlag !== null,
  );
  assert.equal(featureCapabilities.length, 7);
  assert.equal(featureCapabilities.every(
    (capability) =>
      capability.state === "locked" &&
      capability.lockReason === "feature_disabled",
  ), true);
});

test("authoritative reload reflects a persisted L3 to L0 downgrade", async () => {
  const instituteId = "inst_admin_licensing_downgrade";
  const institutePath = `institutes/${instituteId}`;
  await cleanupInstitute(instituteId);
  await seedPlan("L3-DOWNGRADE", "L3", 300);
  await seedPlan("L0-DOWNGRADE", "L0", 100);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "Downgrade Institute",
    licenseVersion: "license_before_downgrade",
  });
  const licenseReference = firestore.doc(`${institutePath}/license/current`);
  await licenseReference.set({
    activeStudentLimit: 300,
    billingCycle: "annual",
    currentLayer: "L3",
    expiryDate: "2027-09-26T12:00:00.000Z",
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: true,
      hardMode: true,
      riskOverview: true,
    },
    licenseState: "active",
    licenseVersion: "license_before_downgrade",
    planId: "L3-DOWNGRADE",
    startDate: "2026-09-01T00:00:00.000Z",
  });
  const service = createService();
  const before = await service.executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_downgrade",
    actorRole: "admin",
    instituteId,
  });
  assert.equal(before.snapshot.currentLicense.layer, "L3");
  assert.equal(before.snapshot.capabilities.every(
    (capability) => capability.state === "enabled",
  ), true);

  await Promise.all([
    firestore.doc(institutePath).update({
      licenseVersion: "license_after_downgrade",
    }),
    licenseReference.set({
      activeStudentLimit: 100,
      billingCycle: "annual",
      currentLayer: "L0",
      expiryDate: "2027-09-26T12:00:00.000Z",
      featureFlags: {
        adaptivePhase: false,
        controlledMode: false,
        governanceAccess: false,
        hardMode: false,
        riskOverview: false,
      },
      licenseState: "active",
      licenseVersion: "license_after_downgrade",
      planId: "L0-DOWNGRADE",
      startDate: "2026-09-01T00:00:00.000Z",
    }),
  ]);
  const after = await service.executeRequest({
    actionType: "GET_LICENSE_SNAPSHOT",
    actorId: "admin_downgrade",
    actorRole: "admin",
    instituteId,
  });
  assert.equal(after.snapshot.currentLicense.layer, "L0");
  assert.equal(after.snapshot.currentLicense.licenseVersion, "license_after_downgrade");
  assert.deepEqual(
    after.snapshot.currentLicense.featureFlags,
    {
      adaptivePhase: false,
      controlledMode: false,
      governanceAccess: false,
      hardMode: false,
      riskOverview: false,
    },
  );
  assert.equal(after.snapshot.capabilities.filter(
    (capability) => capability.state === "enabled",
  ).length, 2);
});

test("snapshot rejects a malformed optional license timestamp", async () => {
  const instituteId = "inst_admin_licensing_bad_expiry";
  const institutePath = `institutes/${instituteId}`;
  const planId = "L1-BAD-EXPIRY";
  await cleanupInstitute(instituteId);
  await seedPlan(planId, "L1", 120);
  await firestore.doc(institutePath).set({
    instituteId,
    instituteName: "Malformed Expiry Institute",
  });
  await firestore.doc(`${institutePath}/license/current`).set({
    activeStudentLimit: 120,
    billingCycle: "annual",
    currentLayer: "L1",
    expiryDate: "not-a-timestamp",
    featureFlags: {riskOverview: true},
    licenseState: "active",
    licenseVersion: "license_version_bad_expiry",
    planId,
  });

  await assert.rejects(
    createService().executeRequest({
      actionType: "GET_LICENSE_SNAPSHOT",
      actorId: "admin_bad_expiry",
      actorRole: "admin",
      instituteId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AdminLicensingValidationError);
      assert.equal(error.code, "INTERNAL_ERROR");
      assert.match(error.message, /license\.expiryDate/);
      return true;
    },
  );
});

test("upgrade request persists one replay-safe command, request, state, and audit", async () => {
  const instituteId = "inst_admin_licensing_request";
  const institutePath = `institutes/${instituteId}`;
  const licenseVersion = "license_version_request";
  const idempotencyKey = "00000000-0000-4000-8000-000000000201";
  await seedRequestAuthority({
    currentLayer: "L1",
    currentPlanId: "L1-REQUEST",
    instituteId,
    licenseVersion,
    requestedLayer: "L2",
    requestedPlanId: "L2-REQUEST",
  });
  const service = createService();
  const request = service.normalizeRequest({
    actionType: "REQUEST_LICENSE_UPGRADE",
    actorId: "admin_request",
    actorRole: "admin",
    expectedLicenseVersion: licenseVersion,
    idempotencyKey,
    instituteId,
    ipAddress: "127.0.0.1",
    reason: "Controlled examinations require the higher published plan.",
    requestedPlanId: "L2-REQUEST",
    requestKind: "upgrade",
    userAgent: "admin-licensing-test",
  });
  const licenseBefore = (await firestore.doc(`${institutePath}/license/current`).get()).data();

  const applied = await service.executeRequest(request);
  const replayed = await service.executeRequest(request);

  assert.equal(applied.actionType, "REQUEST_LICENSE_UPGRADE");
  assert.equal(replayed.actionType, "REQUEST_LICENSE_UPGRADE");
  if (
    applied.actionType !== "REQUEST_LICENSE_UPGRADE" ||
    replayed.actionType !== "REQUEST_LICENSE_UPGRADE"
  ) {
    throw new Error("Expected licensing request results.");
  }
  assert.equal(applied.receipt.disposition, "applied");
  assert.equal(replayed.receipt.disposition, "replayed");
  assert.equal(replayed.receipt.request.requestId, applied.receipt.request.requestId);
  assert.equal(replayed.receipt.auditEventId, applied.receipt.auditEventId);
  assert.equal(applied.receipt.request.currentLayer, "L1");
  assert.equal(applied.receipt.request.requestedLayer, "L2");
  assert.equal(applied.receipt.request.status, "pending");
  assert.equal(applied.snapshot.requests.openRequestId, applied.receipt.request.requestId);
  assert.equal(applied.snapshot.requests.items[0]?.requestId, applied.receipt.request.requestId);

  const [requests, commands, audits, state, licenseAfter] = await Promise.all([
    firestore.collection(`${institutePath}/licenseRequests`).get(),
    firestore.collection(`${institutePath}/licenseRequestCommands`).get(),
    firestore.collection(`${institutePath}/licenseRequestAudit`).get(),
    firestore.doc(`${institutePath}/licenseRequestState/current`).get(),
    firestore.doc(`${institutePath}/license/current`).get(),
  ]);
  assert.equal(requests.size, 1);
  assert.equal(commands.size, 1);
  assert.equal(audits.size, 1);
  assert.equal(state.get("openRequestId"), applied.receipt.request.requestId);
  assert.deepEqual(licenseAfter.data(), licenseBefore);
  assert.equal(JSON.stringify(commands.docs[0]?.data()).includes(idempotencyKey), false);
  assert.equal(JSON.stringify(audits.docs[0]?.data()).includes(idempotencyKey), false);
  assert.equal(commands.docs[0]?.get("idempotencyKey"), undefined);
  assert.equal(audits.docs[0]?.get("reason"), undefined);
});

test("upgrade request rejects stale authority and changed idempotency intent", async () => {
  const instituteId = "inst_admin_licensing_request_conflict";
  const licenseVersion = "license_version_conflict";
  const idempotencyKey = "00000000-0000-4000-8000-000000000202";
  await seedRequestAuthority({
    currentLayer: "L1",
    currentPlanId: "L1-CONFLICT",
    instituteId,
    licenseVersion,
    requestedLayer: "L2",
    requestedPlanId: "L2-CONFLICT",
  });
  const service = createService();

  await assert.rejects(
    service.executeRequest(service.normalizeRequest({
      actionType: "REQUEST_LICENSE_UPGRADE",
      actorId: "admin_conflict",
      actorRole: "admin",
      expectedLicenseVersion: "stale_license_version",
      idempotencyKey: "00000000-0000-4000-8000-000000000203",
      instituteId,
      reason: "Controlled examinations require a higher published plan.",
      requestedPlanId: "L2-CONFLICT",
      requestKind: "upgrade",
    })),
    (error: unknown) => {
      assert.ok(error instanceof AdminLicensingValidationError);
      assert.equal(error.code, "CONFLICT");
      assert.match(error.message, /License version changed/);
      return true;
    },
  );

  await service.executeRequest(service.normalizeRequest({
    actionType: "REQUEST_LICENSE_UPGRADE",
    actorId: "admin_conflict",
    actorRole: "admin",
    expectedLicenseVersion: licenseVersion,
    idempotencyKey,
    instituteId,
    reason: "Controlled examinations require a higher published plan.",
    requestedPlanId: "L2-CONFLICT",
    requestKind: "upgrade",
  }));
  await assert.rejects(
    service.executeRequest(service.normalizeRequest({
      actionType: "REQUEST_LICENSE_UPGRADE",
      actorId: "admin_conflict",
      actorRole: "admin",
      expectedLicenseVersion: licenseVersion,
      idempotencyKey,
      instituteId,
      reason: "A different operational reason reuses the same command key.",
      requestedPlanId: "L2-CONFLICT",
      requestKind: "upgrade",
    })),
    (error: unknown) => {
      assert.ok(error instanceof AdminLicensingValidationError);
      assert.equal(error.code, "CONFLICT");
      assert.match(error.message, /different licensing intent/);
      return true;
    },
  );
});

test("concurrent licensing requests allow exactly one open request", async () => {
  const instituteId = "inst_admin_licensing_request_race";
  const institutePath = `institutes/${instituteId}`;
  const licenseVersion = "license_version_race";
  await seedRequestAuthority({
    currentLayer: "L1",
    currentPlanId: "L1-RACE",
    instituteId,
    licenseVersion,
    requestedLayer: "L2",
    requestedPlanId: "L2-RACE",
  });
  const service = createService();
  const buildRequest = (idempotencyKey: string, reason: string) =>
    service.normalizeRequest({
      actionType: "REQUEST_LICENSE_UPGRADE",
      actorId: "admin_race",
      actorRole: "admin",
      expectedLicenseVersion: licenseVersion,
      idempotencyKey,
      instituteId,
      reason,
      requestedPlanId: "L2-RACE",
      requestKind: "upgrade",
    });

  const results = await Promise.allSettled([
    service.executeRequest(buildRequest(
      "00000000-0000-4000-8000-000000000204",
      "Controlled examinations require the first request path.",
    )),
    service.executeRequest(buildRequest(
      "00000000-0000-4000-8000-000000000205",
      "Controlled examinations require the second request path.",
    )),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof AdminLicensingValidationError);
  assert.equal(rejected.reason.code, "CONFLICT");

  const [requests, commands, audits, state] = await Promise.all([
    firestore.collection(`${institutePath}/licenseRequests`).get(),
    firestore.collection(`${institutePath}/licenseRequestCommands`).get(),
    firestore.collection(`${institutePath}/licenseRequestAudit`).get(),
    firestore.doc(`${institutePath}/licenseRequestState/current`).get(),
  ]);
  assert.equal(requests.size, 1);
  assert.equal(commands.size, 1);
  assert.equal(audits.size, 1);
  assert.equal(state.get("openRequestId"), requests.docs[0]?.id);
});

test("licensing request enforces published higher-layer and evaluation semantics", async () => {
  const instituteId = "inst_admin_licensing_request_policy";
  const licenseVersion = "license_version_policy";
  await seedRequestAuthority({
    currentLayer: "L2",
    currentPlanId: "L2-POLICY",
    instituteId,
    licenseVersion,
    requestedLayer: "L3",
    requestedPlanId: "L3-POLICY",
  });
  const service = createService();

  await assert.rejects(
    service.executeRequest(service.normalizeRequest({
      actionType: "REQUEST_LICENSE_UPGRADE",
      actorId: "admin_policy",
      actorRole: "admin",
      expectedLicenseVersion: licenseVersion,
      idempotencyKey: "00000000-0000-4000-8000-000000000206",
      instituteId,
      reason: "Governance capability is required for the coming year.",
      requestedPlanId: "L3-POLICY",
      requestKind: "upgrade",
    })),
    (error: unknown) => {
      assert.ok(error instanceof AdminLicensingValidationError);
      assert.equal(error.code, "CONFLICT");
      assert.match(error.message, /L3 requires an evaluation/);
      return true;
    },
  );

  const applied = await service.executeRequest(service.normalizeRequest({
    actionType: "REQUEST_LICENSE_UPGRADE",
    actorId: "admin_policy",
    actorRole: "admin",
    expectedLicenseVersion: licenseVersion,
    idempotencyKey: "00000000-0000-4000-8000-000000000207",
    instituteId,
    reason: "Governance capability is required for the coming year.",
    requestedPlanId: "L3-POLICY",
    requestKind: "evaluation",
  }));
  assert.equal(applied.actionType, "REQUEST_LICENSE_UPGRADE");
  if (applied.actionType === "REQUEST_LICENSE_UPGRADE") {
    assert.equal(applied.receipt.request.requestedLayer, "L3");
    assert.equal(applied.receipt.request.requestKind, "evaluation");
  }
});
