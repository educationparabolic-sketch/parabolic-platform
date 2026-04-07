import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {
  DataTierPartitionService,
} from "../services/dataTierPartition";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-105-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const partitionService = new DataTierPartitionService({firestore});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "resolveAcademicYearTier and resolveRunTier follow Build 105 rules",
  () => {
    assert.equal(partitionService.getCollectionTier("sessions"), "HOT");
    assert.equal(
      partitionService.getCollectionTier("templateAnalytics"),
      "WARM",
    );
    assert.equal(
      partitionService.getCollectionTier("governanceSnapshots"),
      "COLD",
    );

    assert.equal(
      partitionService.resolveAcademicYearTier({status: "active"}),
      "HOT",
    );
    assert.equal(
      partitionService.resolveAcademicYearTier({status: "locked"}),
      "WARM",
    );
    assert.equal(
      partitionService.resolveAcademicYearTier({status: "archived"}),
      "COLD",
    );

    assert.equal(
      partitionService.resolveRunTier({
        academicYearData: {status: "active"},
        runData: {status: "scheduled"},
      }),
      "HOT",
    );
    assert.equal(
      partitionService.resolveRunTier({
        academicYearData: {status: "active"},
        runData: {status: "completed"},
      }),
      "WARM",
    );
    assert.equal(
      partitionService.resolveRunTier({
        academicYearData: {status: "archived"},
        runData: {status: "scheduled"},
      }),
      "COLD",
    );
  },
);

test(
  "loadAcademicYearPartition blocks operational access for archived years",
  async () => {
    const instituteId = "inst_build_105_partition";
    const yearId = "2025";
    const academicYearPath =
      `institutes/${instituteId}/academicYears/${yearId}`;

    await deleteDocumentIfPresent(academicYearPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);

    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(academicYearPath).set({
      archivedAt: "2026-04-07T00:00:00.000Z",
      status: "archived",
    });

    const partition = await partitionService.loadAcademicYearPartition(
      instituteId,
      yearId,
    );

    assert.equal(partition.tier, "COLD");
    assert.equal(partition.status, "archived");

    assert.throws(
      () =>
        partitionService.assertOperationalAcademicYearAccess({
          operation: "session start",
          partition,
        }),
      /cannot be used for session start/i,
    );

    await deleteDocumentIfPresent(academicYearPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);
  },
);
