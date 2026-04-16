import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
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

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    await reference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "admin settings service persists profile updates and audit entries",
  async () => {
    const instituteId = "inst_build_125";
    const yearId = "2026";
    const service = new AdminSettingsService({firestore});

    const institutePath = `institutes/${instituteId}`;
    const yearPath = `${institutePath}/academicYears/${yearId}`;
    const auditPath = `${institutePath}/settingsAudit`;

    await deleteCollectionDocuments(auditPath);
    await Promise.all([
      deleteDocumentIfPresent(yearPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(institutePath).set({
      instituteId,
      profile: {
        instituteName: "Old Name",
      },
    });

    await firestore.doc(yearPath).set({
      academicYearLabel: "2026-27",
      status: "Active",
    });

    const result = await service.executeRequest({
      actionType: "UPDATE_INSTITUTE_PROFILE",
      actorId: "admin_build_125",
      actorRole: "admin",
      instituteId,
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "settings@example.org",
        contactPhone: "+1-555-0125",
        defaultExamType: "JEE_MAIN",
        instituteName: "Build 125 Institute",
        logoReference: "logos/build-125.png",
        timeZone: "Asia/Kolkata",
      },
    });

    assert.equal(result.actionType, "UPDATE_INSTITUTE_PROFILE");
    assert.equal(Boolean(result.mutationAuditId), true);
    assert.equal(result.snapshot.profile.instituteName, "Build 125 Institute");

    const auditSnapshot = await firestore.collection(auditPath).get();
    assert.equal(auditSnapshot.size, 1);

    const auditDocument = auditSnapshot.docs[0]?.data() ?? {};
    assert.equal(auditDocument.actionType, "UPDATE_INSTITUTE_PROFILE");

    await deleteCollectionDocuments(auditPath);
    await Promise.all([
      deleteDocumentIfPresent(yearPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);

test("admin settings service rejects invalid phase split updates", async () => {
  const service = new AdminSettingsService({firestore});

  await assert.rejects(
    async () => {
      await service.executeRequest({
        actionType: "UPDATE_EXECUTION_POLICY",
        actorId: "admin_build_125",
        actorRole: "admin",
        executionPolicy: {
          advancedControls: {
            adaptivePhaseEnabled: true,
            hardModeAvailable: false,
            manualOverrideAllowed: false,
          },
          alertFrequencyPolicy: {
            alertCooldownInterval: 10,
            escalationThreshold: 3,
            maxAlertsPerSection: 2,
          },
          phaseSplit: {
            phase1Percent: 10,
            phase2Percent: 10,
            phase3Percent: 10,
          },
          timingPresets: {
            JEE_MAIN: {
              easy: {max: 120, min: 30},
              hard: {max: 240, min: 90},
              medium: {max: 180, min: 60},
            },
          },
        },
        instituteId: "inst_build_125",
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof AdminSettingsValidationError, true);
      assert.equal(
        (error as AdminSettingsValidationError).message,
        "executionPolicy.phaseSplit must sum to 100.",
      );
      return true;
    },
  );
});

test("admin settings service blocks director from profile mutation actions", async () => {
  const service = new AdminSettingsService({firestore});

  await assert.rejects(
    async () => {
      await service.executeRequest({
        actionType: "UPDATE_INSTITUTE_PROFILE",
        actorId: "director_build_125",
        actorRole: "director",
        instituteId: "inst_build_125",
        profile: {
          academicYearFormat: "YYYY-YY",
          contactEmail: "director@example.org",
          contactPhone: "+1-555-0199",
          defaultExamType: "JEE_MAIN",
          instituteName: "Director Attempt",
          logoReference: "logos/director.png",
          timeZone: "Asia/Kolkata",
        },
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof AdminSettingsValidationError, true);
      assert.equal(
        (error as AdminSettingsValidationError).message,
        "Role is not permitted to perform this settings action.",
      );
      return true;
    },
  );
});
