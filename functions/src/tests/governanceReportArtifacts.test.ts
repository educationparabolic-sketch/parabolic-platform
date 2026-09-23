import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import type {
  AdminGovernanceReportDownloadResult,
  AdminGovernanceReportGenerateResult,
} from "../../../shared/contracts/apiDtos";
import {GovernanceReportArtifactValidationError} from
  "../types/governanceReportArtifacts";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
process.env.REPORTS_BUCKET ??= `${process.env.GCLOUD_PROJECT}.appspot.com`;
process.env.CDN_BASE_URL ??= "https://cdn.example.com";
process.env.CDN_SIGNED_URL_KEY_NAME ??= "governance-test-key";
process.env.CDN_SIGNED_URL_KEY_VALUE ??=
  Buffer.from("governance-report-test-secret").toString("base64url");
gcpMetadata.setGCPResidency(false);

interface ArtifactServiceContract {
  createDownload: (input: {
    actorId: string;
    actorRole: string;
    instituteId: string;
    reportId: string;
  }) => Promise<AdminGovernanceReportDownloadResult>;
  generateReportArtifact: (input: {
    actorId: string;
    actorRole: string;
    idempotencyKey: string;
    instituteId: string;
    snapshotId: string;
    yearId: string;
  }) => Promise<AdminGovernanceReportGenerateResult>;
}

const firestore = getFirestore();
const instituteId = "inst_governance_artifact";
const yearId = "2026";
const snapshotId = "2026_03";
const bucketName = `${process.env.GCLOUD_PROJECT}.appspot.com`;
let service: ArtifactServiceContract;

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const deleteCollection = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const seedSnapshot = async (): Promise<void> => {
  await firestore.doc(`institutes/${instituteId}`).set({name: instituteId});
  await firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}`,
  ).set({status: "active", yearId});
  await firestore.doc(
    `institutes/${instituteId}/academicYears/${yearId}/` +
    `governanceSnapshots/${snapshotId}`,
  ).set({
    academicYear: yearId,
    avgAccuracyPercent: 76,
    avgPhaseAdherence: 70,
    avgRawScorePercent: 64,
    calibrationVersionUsed: "cal-v4",
    createdAt: Timestamp.fromDate(new Date("2026-04-01T00:00:00.000Z")),
    disciplineMean: 71,
    disciplineTrend: -2,
    disciplineVariance: 8,
    easyNeglectPercent: 8,
    executionIntegrityScore: 77,
    generatedAt: Timestamp.fromDate(new Date("2026-04-01T00:00:00.000Z")),
    hardBiasPercent: 7,
    immutable: true,
    instituteId,
    month: "2026-03",
    overrideFrequency: 2,
    phaseCompliancePercent: 70,
    riskClusterDistribution: {
      driftProne: 18,
      impulsive: 9,
      overextended: 4,
      stable: 60,
      volatile: 9,
    },
    riskModelVersionUsed: "risk-v3",
    rushPatternPercent: 11,
    schemaVersion: 1,
    skipBurstPercent: 5,
    stabilityIndex: 78,
    templateVarianceMean: 5.5,
    templateVersionRangeUsed: "v2-v5",
    wrongStreakPercent: 2,
  });
};

test.before(async () => {
  const module = await import("../services/governanceReportArtifacts.js");
  service = module.governanceReportArtifactService;
  await Promise.all([
    deleteCollection(`institutes/${instituteId}/auditLogs`),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/` +
      "governanceReportCommands",
    ),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/governanceReports`,
    ),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`,
    ),
  ]);
  await seedSnapshot();
});

test.after(async () => {
  await Promise.all([
    deleteCollection(`institutes/${instituteId}/auditLogs`),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/` +
      "governanceReportCommands",
    ),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/governanceReports`,
    ),
    deleteCollection(
      `institutes/${instituteId}/academicYears/${yearId}/governanceSnapshots`,
    ),
  ]);
  await getFirebaseAdminApp().delete();
});

test(
  "generation persists real PDF bytes, audit, replay, and bounded download",
  async () => {
    const request = {
      actorId: "director-governance",
      actorRole: "director",
      idempotencyKey: "governance-report-command-1",
      instituteId,
      snapshotId,
      yearId,
    };
    const concurrent = await Promise.all([
      service.generateReportArtifact(request),
      service.generateReportArtifact(request),
    ]);
    assert.deepEqual(
      concurrent.map((result) => result.disposition).sort(),
      ["applied", "replayed"],
    );
    const report = concurrent[0].report;
    assert.deepEqual(concurrent[1].report, report);
    assert.equal(report.contentType, "application/pdf");
    assert.equal(report.immutable, true);
    assert.equal(report.status, "ready");
    assert.equal(report.source.snapshotId, snapshotId);
    assert.equal(report.source.calibrationVersionUsed, "cal-v4");
    assert.equal(report.source.riskModelVersionUsed, "risk-v3");
    assert.equal(report.source.templateVersionRangeUsed, "v2-v5");
    assert.equal(report.source.eventRecordCount, 0);

    const reportPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `governanceReports/${report.reportId}`;
    const commandPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `governanceReportCommands/${report.reportId}`;
    const [reportSnapshot, commandSnapshot, auditSnapshot] = await Promise.all([
      firestore.doc(reportPath).get(),
      firestore.doc(commandPath).get(),
      firestore.doc(`institutes/${instituteId}/auditLogs/${report.auditId}`).get(),
    ]);
    assert.equal(reportSnapshot.exists, true);
    assert.equal(commandSnapshot.get("status"), "complete");
    assert.equal(auditSnapshot.get("actionType"), "GENERATE_GOVERNANCE_REPORT");
    assert.equal(auditSnapshot.get("targetId"), report.reportId);

    const objectPath =
      `${instituteId}/reports/2026/03/${report.reportId}.pdf`;
    const file = getFirebaseAdminApp().storage().bucket(bucketName).file(objectPath);
    const [[bytes], [metadata]] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    assert.equal(bytes.subarray(0, 8).toString("ascii"), "%PDF-1.4");
    assert.match(bytes.toString("ascii"), /%%EOF\n$/u);
    assert.equal(bytes.length, report.sizeBytes);
    assert.equal(sha256(bytes), report.sha256);
    assert.equal(metadata.contentType, "application/pdf");
    assert.equal(metadata.metadata?.reportId, report.reportId);
    assert.equal(metadata.metadata?.immutable, "true");

    const replay = await service.generateReportArtifact(request);
    assert.equal(replay.disposition, "replayed");
    assert.deepEqual(replay.report, report);

    await assert.rejects(
      service.generateReportArtifact({...request, snapshotId: "2026_04"}),
      (error: unknown) =>
        error instanceof GovernanceReportArtifactValidationError &&
        error.code === "CONFLICT",
    );

    const beforeDownload = Date.now();
    const download = await service.createDownload({
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId,
      reportId: report.reportId,
    });
    const url = new URL(download.downloadUrl);
    assert.equal(download.reportId, report.reportId);
    assert.equal(download.sha256, report.sha256);
    assert.equal(download.sizeBytes, report.sizeBytes);
    assert.equal(url.origin, "https://cdn.example.com");
    assert.equal(url.pathname, `/${objectPath}`);
    assert.ok(new Date(download.expiresAt).getTime() - beforeDownload <= 600_000);
    assert.doesNotMatch(
      JSON.stringify({download, report}),
      /bucketName|gsUri|objectPath|appspot\.com/u,
    );

    await file.save(Buffer.from("tampered"), {
      contentType: "application/pdf",
      metadata: {metadata: metadata.metadata},
      resumable: false,
    });
    await assert.rejects(
      service.createDownload({
        actorId: request.actorId,
        actorRole: request.actorRole,
        instituteId,
        reportId: report.reportId,
      }),
      (error: unknown) =>
        error instanceof GovernanceReportArtifactValidationError &&
        error.code === "CONFLICT",
    );
    await file.delete({ignoreNotFound: true});
  },
);
