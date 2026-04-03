import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  GovernanceReportingResult,
} from "../types/governanceReporting";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-90-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface GovernanceReportingServiceContract {
  generateReport: (
    input: {
      includePdfExport?: boolean;
      instituteId: string;
      month?: string;
      yearId: string;
    },
  ) => Promise<GovernanceReportingResult>;
}

let governanceReportingService: GovernanceReportingServiceContract;

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();

  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

test.before(async () => {
  const module = await import("../services/governanceReporting.js");
  governanceReportingService = module.governanceReportingService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "generateReport composes governance incidents and pdf export metadata",
  async () => {
    const instituteId = "inst_build_90";
    const yearId = "2026";
    const snapshotMonth = "2026-03";
    const governanceSnapshotsPath =
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`;
    const overrideLogsPath = `institutes/${instituteId}/overrideLogs`;
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;

    await Promise.all([
      deleteCollectionDocuments(governanceSnapshotsPath),
      deleteCollectionDocuments(overrideLogsPath),
      deleteCollectionDocuments(auditLogsPath),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({
      calibrationVersion: "cal_v2026_03",
      name: instituteId,
    });
    await firestore
      .doc(`institutes/${instituteId}/academicYears/${yearId}`)
      .set({yearId});
    await firestore.doc(`${governanceSnapshotsPath}/2026_03`).set({
      academicYear: yearId,
      avgAccuracyPercent: 73,
      avgPhaseAdherence: 69,
      avgRawScorePercent: 64,
      createdAt: Timestamp.now(),
      disciplineMean: 71,
      disciplineTrend: -6.2,
      disciplineVariance: 12.8,
      executionIntegrityScore: 62,
      generatedAt: Timestamp.fromDate(new Date("2026-04-01T00:00:00.000Z")),
      immutable: true,
      instituteId,
      month: snapshotMonth,
      overrideFrequency: 7,
      phaseCompliancePercent: 69,
      riskClusterDistribution: {
        driftProne: 18,
        impulsive: 10,
        overextended: 12,
        stable: 48,
        volatile: 12,
      },
      riskDistribution: {
        driftProne: 18,
        impulsive: 10,
        overextended: 12,
        stable: 48,
        volatile: 12,
      },
      rushPatternPercent: 12,
      easyNeglectPercent: 9,
      hardBiasPercent: 8,
      schemaVersion: 1,
      skipBurstPercent: 5,
      stabilityIndex: 58,
      templateVarianceMean: 6.1,
      wrongStreakPercent: 3,
    });
    await Promise.all([
      firestore.doc(`${overrideLogsPath}/override_1`).set({
        instituteId,
        justification: "Emergency lock release",
        overrideId: "override_1",
        overrideType: "FORCE_SUBMIT",
        performedBy: "director_1",
        runId: "run_build_90",
        sessionId: "session_1",
        studentId: "student_1",
        timestamp: Timestamp.fromDate(new Date("2026-03-10T10:00:00.000Z")),
      }),
      firestore.doc(`${overrideLogsPath}/override_2`).set({
        instituteId,
        justification: "Time policy recovery",
        overrideId: "override_2",
        overrideType: "MIN_TIME_BYPASS",
        performedBy: "director_2",
        runId: "run_build_90_b",
        sessionId: "session_2",
        studentId: "student_2",
        timestamp: Timestamp.fromDate(new Date("2026-03-16T09:00:00.000Z")),
      }),
      firestore.doc(`${auditLogsPath}/audit_1`).set({
        actionType: "UPDATE_CALIBRATION",
        actorId: "director_1",
        actorRole: "director",
        actorUid: "director_uid_1",
        additionalFields: {
          runId: "run_build_90",
        },
        auditId: "audit_1",
        instituteId,
        metadata: {},
        targetCollection: "globalCalibration",
        targetId: "cal_v2026_03",
        timestamp: Timestamp.fromDate(new Date("2026-03-12T12:00:00.000Z")),
      }),
    ]);

    const result = await governanceReportingService.generateReport({
      includePdfExport: true,
      instituteId,
      month: snapshotMonth,
      yearId,
    });

    assert.equal(result.header.instituteId, instituteId);
    assert.equal(result.header.calibrationVersion, "cal_v2026_03");
    assert.equal(result.header.month, snapshotMonth);
    assert.equal(result.disciplineDeviation.deviationLevel, "major");
    assert.ok(result.majorIncidentAlerts.length >= 4);
    assert.equal(result.summary.affectedRunCount, 2);
    assert.equal(
      result.pdfExport?.objectPath,
      `${instituteId}/reports/2026/03/governance.pdf`,
    );
    assert.equal(
      result.majorIncidentAlerts.some((incident) =>
        incident.type === "override_spike"),
      true,
    );
    assert.equal(result.incidentTimeline[0]?.at, "2026-03-10T10:00:00.000Z");

    await Promise.all([
      deleteCollectionDocuments(governanceSnapshotsPath),
      deleteCollectionDocuments(overrideLogsPath),
      deleteCollectionDocuments(auditLogsPath),
    ]);
  },
);

test(
  "generateReport defaults to the latest governance snapshot " +
    "when month is omitted",
  async () => {
    const instituteId = "inst_build_90_latest";
    const yearId = "2026";
    const governanceSnapshotsPath =
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`;

    await deleteCollectionDocuments(governanceSnapshotsPath);
    await firestore.doc(`institutes/${instituteId}`).set({name: instituteId});
    await firestore
      .doc(`institutes/${instituteId}/academicYears/${yearId}`)
      .set({yearId});
    await Promise.all([
      firestore.doc(`${governanceSnapshotsPath}/2026_02`).set({
        academicYear: yearId,
        avgAccuracyPercent: 70,
        avgPhaseAdherence: 68,
        avgRawScorePercent: 63,
        createdAt: Timestamp.now(),
        disciplineMean: 70,
        disciplineTrend: 1.1,
        disciplineVariance: 6,
        executionIntegrityScore: 75,
        generatedAt: Timestamp.now(),
        immutable: true,
        instituteId,
        month: "2026-02",
        overrideFrequency: 2,
        phaseCompliancePercent: 68,
        riskClusterDistribution: {
          driftProne: 17,
          impulsive: 8,
          overextended: 4,
          stable: 62,
          volatile: 9,
        },
        riskDistribution: {
          driftProne: 17,
          impulsive: 8,
          overextended: 4,
          stable: 62,
          volatile: 9,
        },
        rushPatternPercent: 11,
        easyNeglectPercent: 8,
        hardBiasPercent: 7,
        schemaVersion: 1,
        skipBurstPercent: 4,
        stabilityIndex: 77,
        templateVarianceMean: 5.1,
        wrongStreakPercent: 2,
      }),
      firestore.doc(`${governanceSnapshotsPath}/2026_03`).set({
        academicYear: yearId,
        avgAccuracyPercent: 72,
        avgPhaseAdherence: 70,
        avgRawScorePercent: 65,
        createdAt: Timestamp.now(),
        disciplineMean: 71,
        disciplineTrend: 1.6,
        disciplineVariance: 5.7,
        executionIntegrityScore: 78,
        generatedAt: Timestamp.now(),
        immutable: true,
        instituteId,
        month: "2026-03",
        overrideFrequency: 1,
        phaseCompliancePercent: 70,
        riskClusterDistribution: {
          driftProne: 15,
          impulsive: 7,
          overextended: 3,
          stable: 67,
          volatile: 8,
        },
        riskDistribution: {
          driftProne: 15,
          impulsive: 7,
          overextended: 3,
          stable: 67,
          volatile: 8,
        },
        rushPatternPercent: 10,
        easyNeglectPercent: 7,
        hardBiasPercent: 6,
        schemaVersion: 1,
        skipBurstPercent: 3,
        stabilityIndex: 80,
        templateVarianceMean: 4.9,
        wrongStreakPercent: 2,
      }),
    ]);

    const result = await governanceReportingService.generateReport({
      includePdfExport: false,
      instituteId,
      yearId,
    });

    assert.equal(result.header.month, "2026-03");
    assert.equal(result.requestedMonth, undefined);
    assert.equal(result.pdfExport, undefined);
    assert.equal(result.summary.incidentCount, 0);

    await deleteCollectionDocuments(governanceSnapshotsPath);
  },
);
