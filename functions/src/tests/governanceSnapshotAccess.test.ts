import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  GovernanceSnapshotAccessResult,
} from "../types/governanceAccess";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-89-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface GovernanceSnapshotAccessServiceContract {
  readSnapshots: (
    input: {
      instituteId: string;
      limit?: number;
      month?: string;
      yearId: string;
    },
  ) => Promise<GovernanceSnapshotAccessResult>;
}

let governanceSnapshotAccessService: GovernanceSnapshotAccessServiceContract;

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();

  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

test.before(async () => {
  const module = await import("../services/governanceSnapshotAccess.js");
  governanceSnapshotAccessService = module.governanceSnapshotAccessService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "readSnapshots returns latest governance snapshots in reverse month order",
  async () => {
    const instituteId = "inst_build_89";
    const yearId = "2026";
    const collectionPath =
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`;

    await deleteCollectionDocuments(collectionPath);
    await firestore.doc(`institutes/${instituteId}`).set({name: instituteId});
    await firestore
      .doc(`institutes/${instituteId}/academicYears/${yearId}`)
      .set({yearId});

    await Promise.all([
      firestore.doc(`${collectionPath}/2026_01`).set({
        academicYear: yearId,
        avgAccuracyPercent: 72,
        avgPhaseAdherence: 68,
        avgRawScorePercent: 61,
        createdAt: Timestamp.now(),
        disciplineMean: 69,
        disciplineTrend: 1.5,
        disciplineVariance: 8.2,
        executionIntegrityScore: 74,
        generatedAt: Timestamp.now(),
        immutable: true,
        instituteId,
        month: "2026-01",
        overrideFrequency: 3,
        phaseCompliancePercent: 68,
        riskClusterDistribution: {
          driftProne: 20,
          impulsive: 10,
          overextended: 5,
          stable: 55,
          volatile: 10,
        },
        riskDistribution: {
          driftProne: 20,
          impulsive: 10,
          overextended: 5,
          stable: 55,
          volatile: 10,
        },
        rushPatternPercent: 12,
        easyNeglectPercent: 9,
        hardBiasPercent: 8,
        skipBurstPercent: 4,
        schemaVersion: 1,
        stabilityIndex: 75,
        templateVarianceMean: 6,
        wrongStreakPercent: 3,
      }),
      firestore.doc(`${collectionPath}/2026_02`).set({
        academicYear: yearId,
        avgAccuracyPercent: 76,
        avgPhaseAdherence: 70,
        avgRawScorePercent: 64,
        createdAt: Timestamp.now(),
        disciplineMean: 71,
        disciplineTrend: 2.1,
        disciplineVariance: 7.6,
        executionIntegrityScore: 77,
        generatedAt: Timestamp.now(),
        immutable: true,
        instituteId,
        month: "2026-02",
        overrideFrequency: 2,
        phaseCompliancePercent: 70,
        riskClusterDistribution: {
          driftProne: 18,
          impulsive: 9,
          overextended: 4,
          stable: 60,
          volatile: 9,
        },
        riskDistribution: {
          driftProne: 18,
          impulsive: 9,
          overextended: 4,
          stable: 60,
          volatile: 9,
        },
        rushPatternPercent: 11,
        easyNeglectPercent: 8,
        hardBiasPercent: 7,
        skipBurstPercent: 5,
        schemaVersion: 1,
        stabilityIndex: 78,
        templateVarianceMean: 5.5,
        wrongStreakPercent: 2,
      }),
    ]);

    const result = await governanceSnapshotAccessService.readSnapshots({
      instituteId,
      limit: 2,
      yearId,
    });

    assert.equal(result.instituteId, instituteId);
    assert.equal(result.yearId, yearId);
    assert.equal(result.snapshots.length, 2);
    assert.equal(result.snapshots[0]?.month, "2026-02");
    assert.equal(result.snapshots[1]?.month, "2026-01");
    assert.equal(
      result.snapshots[0]?.documentPath,
      `${collectionPath}/2026_02`,
    );

    await deleteCollectionDocuments(collectionPath);
  },
);

test(
  "readSnapshots returns a specific governance snapshot by requested month",
  async () => {
    const instituteId = "inst_build_89_month";
    const yearId = "2026";
    const collectionPath =
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`;

    await deleteCollectionDocuments(collectionPath);
    await firestore.doc(`institutes/${instituteId}`).set({name: instituteId});
    await firestore
      .doc(`institutes/${instituteId}/academicYears/${yearId}`)
      .set({yearId});
    await firestore.doc(`${collectionPath}/2026_03`).set({
      academicYear: yearId,
      avgAccuracyPercent: 80,
      avgPhaseAdherence: 74,
      avgRawScorePercent: 67,
      createdAt: Timestamp.now(),
      disciplineMean: 72,
      disciplineTrend: 2.6,
      disciplineVariance: 6.8,
      executionIntegrityScore: 81,
      generatedAt: Timestamp.now(),
      immutable: true,
      instituteId,
      month: "2026-03",
      overrideFrequency: 1,
      phaseCompliancePercent: 74,
      riskClusterDistribution: {
        driftProne: 14,
        impulsive: 8,
        overextended: 3,
        stable: 67,
        volatile: 8,
      },
      riskDistribution: {
        driftProne: 14,
        impulsive: 8,
        overextended: 3,
        stable: 67,
        volatile: 8,
      },
      rushPatternPercent: 10,
      easyNeglectPercent: 7,
      hardBiasPercent: 6,
      skipBurstPercent: 3,
      schemaVersion: 1,
      stabilityIndex: 82,
      templateVarianceMean: 5,
      wrongStreakPercent: 2,
    });

    const result = await governanceSnapshotAccessService.readSnapshots({
      instituteId,
      month: "2026-03",
      yearId,
    });

    assert.equal(result.requestedMonth, "2026-03");
    assert.equal(result.snapshots.length, 1);
    assert.equal(result.snapshots[0]?.documentId, "2026_03");
    assert.equal(result.snapshots[0]?.month, "2026-03");

    await deleteCollectionDocuments(collectionPath);
  },
);
