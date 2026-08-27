import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const instituteId = "inst_student_summary_service";
const otherInstituteId = "inst_student_summary_other";
const studentId = "student_summary_service";
const otherStudentId = "student_summary_unassigned";
const deletedStudentId = "student_summary_deleted";
const currentYearPath = `institutes/${instituteId}/academicYears/2026`;
const oldYearPath = `institutes/${instituteId}/academicYears/2025`;
const otherYearPath =
  `institutes/${otherInstituteId}/academicYears/2026`;

interface StudentSummaryServiceContract {
  getDashboard: (request: {
    instituteId: string;
    licenseLayer: "L0" | "L1";
    studentId: string;
  }) => Promise<{
    avgRawScorePercent: number;
    disciplineIndex: number;
    easyNeglectPercent: number;
    licenseLayer: string;
    phaseComplianceMiniTrend: Array<{value: number}>;
    recentResults: Array<{runId: string}>;
    testsAttempted: number;
    upcomingTests: Array<{mode: string; runId: string}>;
  }>;
  listTests: (request: {
    instituteId: string;
    licenseLayer: "L1";
    page: number;
    pageSize: number;
    status: "all" | "archived" | "completed";
    studentId: string;
  }) => Promise<{
    hasMore: boolean;
    tests: Array<{runId: string; status: string}>;
    total: number;
  }>;
  normalizeTestsRequest: (request: {
    instituteId?: unknown;
    licenseLayer?: unknown;
    page?: unknown;
    pageSize?: unknown;
    status?: unknown;
    studentId?: unknown;
  }) => unknown;
}

let studentSummaryService: StudentSummaryServiceContract;

test.before(async () => {
  const module = await import("../services/studentSummary.js");
  studentSummaryService = new module.StudentSummaryService(
    firestore,
    () => new Date("2026-08-26T00:00:00.000Z"),
  );
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const runFixture = (input: {
  mode: "Controlled" | "Diagnostic" | "Operational";
  recipientStudentIds: string[];
  startWindow: string;
  status: "completed" | "scheduled" | "stopped";
  testId: string;
}) => ({
  academicYear: "2026",
  createdAt: Timestamp.fromDate(new Date(input.startWindow)),
  endWindow: Timestamp.fromDate(
    new Date(Date.parse(input.startWindow) + (90 * 60_000)),
  ),
  mode: input.mode,
  recipientStudentIds: input.recipientStudentIds,
  startWindow: Timestamp.fromDate(new Date(input.startWindow)),
  status: input.status,
  testId: input.testId,
  testName: `Name ${input.testId}`,
});

test(
  "Student summaries are identity-scoped, current-year, licensed, and paged",
  async () => {
    const documentPaths = [
      `institutes/${instituteId}/students/${studentId}`,
      `institutes/${instituteId}/students/${otherStudentId}`,
      `institutes/${instituteId}/students/${deletedStudentId}`,
      currentYearPath,
      oldYearPath,
      otherYearPath,
      `${currentYearPath}/studentYearMetrics/${studentId}`,
      `${currentYearPath}/runs/run-scheduled-operational`,
      `${currentYearPath}/runs/run-scheduled-diagnostic`,
      `${currentYearPath}/runs/run-scheduled-controlled`,
      `${currentYearPath}/runs/run-completed-operational`,
      `${currentYearPath}/runs/run-completed-diagnostic`,
      `${currentYearPath}/runs/run-stopped-operational`,
      `${currentYearPath}/runs/run-unassigned`,
      `${oldYearPath}/runs/run-old-year`,
      `${otherYearPath}/runs/run-other-tenant`,
    ];

    await Promise.all([
      firestore.doc(documentPaths[0]).set({
        status: "active",
        studentId,
      }),
      firestore.doc(documentPaths[1]).set({
        status: "active",
        studentId: otherStudentId,
      }),
      firestore.doc(documentPaths[2]).set({
        deleted: true,
        status: "active",
        studentId: deletedStudentId,
      }),
      firestore.doc(currentYearPath).set({status: "Active"}),
      firestore.doc(oldYearPath).set({status: "Archived"}),
      firestore.doc(otherYearPath).set({status: "Active"}),
      firestore.doc(documentPaths[6]).set({
        avgAccuracyPercent: 84,
        avgDisciplineIndex: 79,
        avgGuessRatePercent: 13,
        avgOverstayQuestionsPercent: 17,
        avgPhaseAdherencePercent: 88,
        avgRawScorePercent: 76,
        easyNeglectRatePercent: 12,
        hardBiasRatePercent: 8,
        phaseComplianceMiniTrend: [
          {label: "P1", value: 82},
          {label: "P2", value: 88},
        ],
        recentResults: [{
          accuracyPercent: 84,
          completedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:00:00.000Z"),
          ),
          rawScorePercent: 76,
          runId: "run-completed-operational",
          testName: "Completed Operational",
        }],
        riskState: "high",
        studentId,
        totalTests: 6,
      }),
      firestore.doc(documentPaths[7]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [studentId],
        startWindow: "2026-09-01T09:00:00.000Z",
        status: "scheduled",
        testId: "test-scheduled-operational",
      })),
      firestore.doc(documentPaths[8]).set(runFixture({
        mode: "Diagnostic",
        recipientStudentIds: [studentId],
        startWindow: "2026-09-02T09:00:00.000Z",
        status: "scheduled",
        testId: "test-scheduled-diagnostic",
      })),
      firestore.doc(documentPaths[9]).set(runFixture({
        mode: "Controlled",
        recipientStudentIds: [studentId],
        startWindow: "2026-09-03T09:00:00.000Z",
        status: "scheduled",
        testId: "test-scheduled-controlled",
      })),
      firestore.doc(documentPaths[10]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [studentId],
        startWindow: "2026-08-20T09:00:00.000Z",
        status: "completed",
        testId: "test-completed-operational",
      })),
      firestore.doc(documentPaths[11]).set(runFixture({
        mode: "Diagnostic",
        recipientStudentIds: [studentId],
        startWindow: "2026-08-21T09:00:00.000Z",
        status: "completed",
        testId: "test-completed-diagnostic",
      })),
      firestore.doc(documentPaths[12]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [studentId],
        startWindow: "2026-08-19T09:00:00.000Z",
        status: "stopped",
        testId: "test-stopped-operational",
      })),
      firestore.doc(documentPaths[13]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [otherStudentId],
        startWindow: "2026-09-04T09:00:00.000Z",
        status: "scheduled",
        testId: "test-unassigned",
      })),
      firestore.doc(documentPaths[14]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [studentId],
        startWindow: "2026-07-01T09:00:00.000Z",
        status: "completed",
        testId: "test-old-year",
      })),
      firestore.doc(documentPaths[15]).set(runFixture({
        mode: "Operational",
        recipientStudentIds: [studentId],
        startWindow: "2026-09-05T09:00:00.000Z",
        status: "scheduled",
        testId: "test-other-tenant",
      })),
    ]);

    const dashboard = await studentSummaryService.getDashboard({
      instituteId,
      licenseLayer: "L1",
      studentId,
    });
    assert.equal(dashboard.avgRawScorePercent, 76);
    assert.equal(dashboard.testsAttempted, 6);
    assert.equal(dashboard.easyNeglectPercent, 12);
    assert.equal(dashboard.disciplineIndex, 0);
    assert.deepEqual(
      dashboard.upcomingTests.map((run) => run.runId),
      ["run-scheduled-operational", "run-scheduled-diagnostic"],
    );
    assert.deepEqual(
      dashboard.upcomingTests.map((run) => run.mode),
      ["Operational", "Diagnostic"],
    );
    assert.deepEqual(dashboard.recentResults.map((run) => run.runId), [
      "run-completed-operational",
    ]);
    assert.deepEqual(
      dashboard.phaseComplianceMiniTrend.map((point) => point.value),
      [82, 88],
    );

    const firstPage = await studentSummaryService.listTests({
      instituteId,
      licenseLayer: "L1",
      page: 1,
      pageSize: 2,
      status: "all",
      studentId,
    });
    assert.equal(firstPage.total, 5);
    assert.equal(firstPage.hasMore, true);
    assert.deepEqual(firstPage.tests.map((run) => run.runId), [
      "run-scheduled-diagnostic",
      "run-scheduled-operational",
    ]);

    const secondPage = await studentSummaryService.listTests({
      instituteId,
      licenseLayer: "L1",
      page: 2,
      pageSize: 2,
      status: "all",
      studentId,
    });
    assert.deepEqual(secondPage.tests.map((run) => run.runId), [
      "run-completed-diagnostic",
      "run-completed-operational",
    ]);

    const completed = await studentSummaryService.listTests({
      instituteId,
      licenseLayer: "L1",
      page: 1,
      pageSize: 10,
      status: "completed",
      studentId,
    });
    assert.equal(completed.total, 2);
    assert.ok(completed.tests.every((run) => run.status === "completed"));

    const archived = await studentSummaryService.listTests({
      instituteId,
      licenseLayer: "L1",
      page: 1,
      pageSize: 10,
      status: "archived",
      studentId,
    });
    assert.equal(archived.total, 1);
    assert.deepEqual(archived.tests.map((run) => run.runId), [
      "run-stopped-operational",
    ]);
    assert.equal(archived.tests[0].status, "archived");

    const unassigned = await studentSummaryService.listTests({
      instituteId,
      licenseLayer: "L1",
      page: 1,
      pageSize: 10,
      status: "all",
      studentId: otherStudentId,
    });
    assert.deepEqual(unassigned.tests.map((run) => run.runId), [
      "run-unassigned",
    ]);

    await assert.rejects(
      studentSummaryService.getDashboard({
        instituteId,
        licenseLayer: "L0",
        studentId: deletedStudentId,
      }),
      /Active Student summary authority was not found/u,
    );
    await assert.rejects(
      studentSummaryService.getDashboard({
        instituteId: otherInstituteId,
        licenseLayer: "L1",
        studentId,
      }),
      /Active Student summary authority was not found/u,
    );
    assert.throws(
      () => studentSummaryService.normalizeTestsRequest({
        instituteId,
        licenseLayer: "L1",
        page: 1,
        pageSize: 51,
        studentId,
      }),
      /between 1 and 50/u,
    );

    await Promise.all(
      documentPaths.slice().reverse().map((path) =>
        firestore.doc(path).delete()),
    );
  },
);
