import assert from "node:assert/strict";
import test from "node:test";
import {licenseManagementService} from "../services/licenseManagement";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-93-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";

const firestore = getFirestore();

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "updateInstituteLicense writes current, mirrored, and history documents",
  async () => {
    const instituteId = "inst_build_93_a";
    const institutePath = `institutes/${instituteId}`;
    const currentLicensePath = `${institutePath}/license/current`;
    const mainLicensePath = `${institutePath}/license/main`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L2";

    await Promise.all([
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(institutePath).set({
      instituteId,
      name: "Build 93 Institute",
    });
    await firestore.doc(currentLicensePath).set({
      billingCycle: "monthly",
      currentLayer: "L1",
      expiryDate: "2026-06-01T00:00:00.000Z",
      licenseState: "grace",
      stripeCustomerId: "cus_build_93",
    });
    await firestore.doc(pricingPlanPath).set({
      featureFlags: {
        adaptivePhase: true,
        controlledMode: true,
        governanceAccess: false,
        hardMode: true,
      },
      name: "Controlled",
      planId: "L2",
      studentLimit: 250,
    });

    const result = await licenseManagementService.updateInstituteLicense({
      billingPlan: "Controlled",
      changedBy: "vendor_build_93",
      instituteId,
      newLayer: "L2",
    });

    assert.equal(result.instituteId, instituteId);
    assert.equal(result.previousLayer, "L1");
    assert.equal(result.newLayer, "L2");
    assert.equal(result.planId, "L2");
    assert.equal(result.planName, "Controlled");
    assert.equal(result.activeStudentLimit, 250);
    assert.equal(result.licensePath, currentLicensePath);
    assert.equal(result.compatibilityLicensePath, mainLicensePath);
    assert.match(
      result.licenseHistoryPath,
      new RegExp(`^${institutePath}/licenseHistory/`),
    );
    assert.equal(
      result.licenseHistoryPath,
      `${institutePath}/licenseHistory/${result.licenseHistoryEntryId}`,
    );

    const [
      currentLicenseSnapshot,
      mainLicenseSnapshot,
      licenseHistorySnapshot,
    ] = await Promise.all([
      firestore.doc(currentLicensePath).get(),
      firestore.doc(mainLicensePath).get(),
      firestore.doc(result.licenseHistoryPath).get(),
    ]);

    const currentLicense = currentLicenseSnapshot.data();
    const mainLicense = mainLicenseSnapshot.data();
    const licenseHistory = licenseHistorySnapshot.data();

    assert.equal(currentLicenseSnapshot.exists, true);
    assert.equal(mainLicenseSnapshot.exists, true);
    assert.equal(licenseHistorySnapshot.exists, true);
    assert.equal(currentLicense?.currentLayer, "L2");
    assert.equal(currentLicense?.planId, "L2");
    assert.equal(currentLicense?.planName, "Controlled");
    assert.equal(currentLicense?.activeStudentLimit, 250);
    assert.equal(currentLicense?.billingCycle, "monthly");
    assert.equal(currentLicense?.expiryDate, "2026-06-01T00:00:00.000Z");
    assert.equal(currentLicense?.licenseState, "grace");
    assert.equal(currentLicense?.stripeCustomerId, "cus_build_93");
    assert.deepEqual(currentLicense?.featureFlags, {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: false,
      hardMode: true,
    });
    assert.equal(currentLicense?.updatedBy, "vendor_build_93");
    assert.equal(typeof currentLicense?.updatedAt?.toDate, "function");

    assert.equal(mainLicense?.currentLayer, "L2");
    assert.equal(mainLicense?.planId, "L2");
    assert.equal(mainLicense?.activeStudentLimit, 250);
    assert.deepEqual(mainLicense?.featureFlags, currentLicense?.featureFlags);
    assert.equal(licenseHistory?.entryId, result.licenseHistoryEntryId);
    assert.equal(licenseHistory?.instituteId, instituteId);
    assert.equal(licenseHistory?.previousLayer, "L1");
    assert.equal(licenseHistory?.newLayer, "L2");
    assert.equal(licenseHistory?.billingPlan, "Controlled");
    assert.equal(licenseHistory?.changedBy, "vendor_build_93");
    assert.equal(
      licenseHistory?.reason,
      "Vendor license update via POST /vendor/license/update.",
    );
    assert.equal(licenseHistory?.previousStudentLimit, undefined);
    assert.equal(licenseHistory?.newStudentLimit, 250);
    assert.equal(typeof licenseHistory?.timestamp?.toDate, "function");
    assert.equal(
      typeof licenseHistory?.effectiveDate,
      "string",
    );

    await Promise.all([
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(result.licenseHistoryPath),
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);

test(
  "updateInstituteLicense rejects billing plans with layer mismatch",
  async () => {
    const instituteId = "inst_build_93_b";
    const institutePath = `institutes/${instituteId}`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L2";

    await Promise.all([
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(institutePath).set({instituteId});
    await firestore.doc(pricingPlanPath).set({
      featureFlags: {
        adaptivePhase: true,
        controlledMode: true,
        governanceAccess: false,
        hardMode: true,
      },
      name: "Controlled",
      planId: "L2",
      studentLimit: 250,
    });

    await assert.rejects(
      licenseManagementService.updateInstituteLicense({
        billingPlan: "Controlled",
        changedBy: "vendor_build_93",
        instituteId,
        newLayer: "L1",
      }),
      (error: unknown) => {
        assert.match(
          String(error),
          /does not match the requested license layer/i,
        );
        return true;
      },
    );

    await Promise.all([
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);

test("updateInstituteLicense rejects unknown institutes", async () => {
  const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L1";

  await deleteDocumentIfPresent(pricingPlanPath);
  await firestore.doc(pricingPlanPath).set({
    featureFlags: {
      adaptivePhase: false,
      controlledMode: false,
      governanceAccess: false,
      hardMode: false,
    },
    name: "Diagnostic",
    planId: "L1",
    studentLimit: 100,
  });

  await assert.rejects(
    licenseManagementService.updateInstituteLicense({
      billingPlan: "Diagnostic",
      changedBy: "vendor_build_93",
      instituteId: "missing_build_93",
      newLayer: "L1",
    }),
    (error: unknown) => {
      assert.match(String(error), /does not exist/i);
      return true;
    },
  );

  await deleteDocumentIfPresent(pricingPlanPath);
});
