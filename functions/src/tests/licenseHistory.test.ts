import assert from "node:assert/strict";
import test from "node:test";
import {licenseHistoryService} from "../services/licenseHistory";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-8-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

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

test("createLicenseHistoryEntry stores an immutable institute license record", async () => {
  const entryId = "build-8-license-history";
  const instituteId = "inst_008";
  const entryPath = `institutes/${instituteId}/licenseHistory/${entryId}`;

  await deleteDocumentIfPresent(entryPath);

  const result = await licenseHistoryService.createLicenseHistoryEntry({
    billingPlan: "annual_growth",
    changedBy: "vendor_008",
    effectiveDate: "2026-04-01T00:00:00.000Z",
    entryId,
    instituteId,
    newLayer: "L2",
    newStudentLimit: 500,
    previousLayer: "L1",
    previousStudentLimit: 200,
    reason: "Upgrade request approved",
    stripeInvoiceId: "in_123456789",
  });

  assert.equal(result.entryId, entryId);
  assert.equal(result.instituteId, instituteId);
  assert.equal(result.path, entryPath);

  const snapshot = await firestore.doc(entryPath).get();
  const licenseHistory = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(licenseHistory?.entryId, entryId);
  assert.equal(licenseHistory?.instituteId, instituteId);
  assert.equal(licenseHistory?.previousLayer, "L1");
  assert.equal(licenseHistory?.newLayer, "L2");
  assert.equal(licenseHistory?.billingPlan, "annual_growth");
  assert.equal(licenseHistory?.changedBy, "vendor_008");
  assert.equal(licenseHistory?.reason, "Upgrade request approved");
  assert.equal(licenseHistory?.previousStudentLimit, 200);
  assert.equal(licenseHistory?.newStudentLimit, 500);
  assert.equal(licenseHistory?.stripeInvoiceId, "in_123456789");
  assert.equal(
    licenseHistory?.effectiveDate,
    "2026-04-01T00:00:00.000Z",
  );
  assert.equal(typeof licenseHistory?.timestamp?.toDate, "function");

  await assert.rejects(
    licenseHistoryService.createLicenseHistoryEntry({
      billingPlan: "annual_growth",
      changedBy: "vendor_008",
      effectiveDate: "2026-04-01T00:00:00.000Z",
      entryId,
      instituteId,
      newLayer: "L3",
      previousLayer: "L2",
      reason: "Duplicate immutable write",
    }),
  );

  await deleteDocumentIfPresent(entryPath);
});

test("createLicenseHistoryEntry rejects invalid effective dates", async () => {
  await assert.rejects(
    licenseHistoryService.createLicenseHistoryEntry({
      billingPlan: "monthly_standard",
      changedBy: "vendor_009",
      effectiveDate: "not-a-date",
      instituteId: "inst_009",
      newLayer: "L1",
      previousLayer: "L0",
      reason: "Trial activation",
    }),
    (error: unknown) => {
      assert.match(String(error), /effectiveDate/i);
      return true;
    },
  );
});

test("createLicenseHistoryEntry rejects negative student limits", async () => {
  await assert.rejects(
    licenseHistoryService.createLicenseHistoryEntry({
      billingPlan: "monthly_standard",
      changedBy: "vendor_010",
      effectiveDate: new Date("2026-04-02T00:00:00.000Z"),
      instituteId: "inst_010",
      newLayer: "L1",
      newStudentLimit: -1,
      previousLayer: "L0",
      reason: "Invalid limit test",
    }),
    (error: unknown) => {
      assert.match(String(error), /non-negative number/i);
      return true;
    },
  );
});
