import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-126-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface AdminRunsServiceContract {
  getRun: (request: {instituteId: string; runId: string}) => Promise<{
    run: {id: string; status: string};
  }>;
  listRuns: (request: {
    cursor?: string;
    instituteId: string;
    limit: number;
    status?: "active" | "cancelled" | "completed" | "scheduled" | "stopped";
  }) => Promise<{
    nextCursor: string | null;
    runs: Array<{id: string; status: string}>;
  }>;
  normalizeListRequest: (request: {
    cursor?: unknown;
    instituteId?: unknown;
    limit?: unknown;
    status?: unknown;
  }) => unknown;
}

let adminRunsService: AdminRunsServiceContract;

test.before(async () => {
  const module = await import("../services/adminRuns.js");
  adminRunsService = new module.AdminRunsService(firestore);
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const createRunFixture = (
  id: string,
  createdAt: string,
  status: "active" | "completed" | "scheduled",
) => ({
  academicYear: "2026",
  attemptLimit: 1,
  canonicalId: `canonical-${id}`,
  createdAt: Timestamp.fromDate(new Date(createdAt)),
  endWindow: Timestamp.fromDate(new Date("2026-08-25T11:00:00.000Z")),
  gracePeriodMinutes: 10,
  mode: "Diagnostic",
  proctoringPolicy: {
    browserIntegrityGuardEnabled: true,
    faceIdentityGazeGuardEnabled: false,
  },
  recipientStudentIds: ["student-1", "student-2"],
  shuffleQuestionOrder: true,
  startWindow: Timestamp.fromDate(new Date("2026-08-25T09:00:00.000Z")),
  status,
  templateVersion: 4,
  testId: `test-${id}`,
  timezone: "Asia/Kolkata",
});

test(
  "Admin runs reads are tenant-current, cursor-paginated, filtered, and strict",
  async () => {
    const instituteId = "inst_build_126_runs";
    const otherInstituteId = "inst_build_126_other";
    const archivedOnlyInstituteId = "inst_build_126_archived_only";
    const currentYearPath =
      `institutes/${instituteId}/academicYears/2026`;
    const oldYearPath = `institutes/${instituteId}/academicYears/2025`;
    const otherYearPath =
      `institutes/${otherInstituteId}/academicYears/2026`;
    const archivedOnlyYearPath =
      `institutes/${archivedOnlyInstituteId}/academicYears/2025`;
    const currentRunPaths = [
      `${currentYearPath}/runs/run-1`,
      `${currentYearPath}/runs/run-2`,
      `${currentYearPath}/runs/run-3`,
    ];
    const oldRunPath = `${oldYearPath}/runs/run-old`;

    await Promise.all([
      firestore.doc(currentYearPath).set({status: "Active"}),
      firestore.doc(oldYearPath).set({status: "Archived"}),
      firestore.doc(otherYearPath).set({status: "Active"}),
      firestore.doc(archivedOnlyYearPath).set({status: "Archived"}),
      firestore.doc(currentRunPaths[0]).set(createRunFixture(
        "run-1",
        "2026-08-20T08:00:00.000Z",
        "scheduled",
      )),
      firestore.doc(currentRunPaths[1]).set(createRunFixture(
        "run-2",
        "2026-08-20T09:00:00.000Z",
        "completed",
      )),
      firestore.doc(currentRunPaths[2]).set(createRunFixture(
        "run-3",
        "2026-08-20T10:00:00.000Z",
        "active",
      )),
      firestore.doc(oldRunPath).set(createRunFixture(
        "run-old",
        "2026-08-21T10:00:00.000Z",
        "completed",
      )),
    ]);

    const firstPage = await adminRunsService.listRuns({
      instituteId,
      limit: 2,
    });
    assert.deepEqual(firstPage.runs.map((run) => run.id), ["run-3", "run-2"]);
    assert.equal(typeof firstPage.nextCursor, "string");

    const secondPage = await adminRunsService.listRuns({
      cursor: firstPage.nextCursor ?? undefined,
      instituteId,
      limit: 2,
    });
    assert.deepEqual(secondPage.runs.map((run) => run.id), ["run-1"]);
    assert.equal(secondPage.nextCursor, null);

    const completed = await adminRunsService.listRuns({
      instituteId,
      limit: 10,
      status: "completed",
    });
    assert.deepEqual(completed.runs.map((run) => run.id), ["run-2"]);

    const detail = await adminRunsService.getRun({
      instituteId,
      runId: "run-2",
    });
    assert.equal(detail.run.status, "completed");

    await assert.rejects(
      adminRunsService.getRun({
        instituteId: otherInstituteId,
        runId: "run-2",
      }),
      (error: unknown) => (
        error instanceof Error &&
        error.name === "AdminRunsValidationError" &&
        /current academic year/u.test(error.message)
      ),
    );
    await assert.rejects(
      adminRunsService.getRun({instituteId, runId: "run-old"}),
      /current academic year/u,
    );
    await assert.rejects(
      adminRunsService.listRuns({
        instituteId: archivedOnlyInstituteId,
        limit: 2,
      }),
      /no current operational academic year/u,
    );
    assert.throws(
      () => adminRunsService.normalizeListRequest({
        instituteId,
        limit: 51,
      }),
      /between 1 and 50/u,
    );
    await assert.rejects(
      adminRunsService.listRuns({
        cursor: "not-a-cursor",
        instituteId,
        limit: 2,
      }),
      /cursor/u,
    );

    await Promise.all([
      ...currentRunPaths.map((path) => firestore.doc(path).delete()),
      firestore.doc(oldRunPath).delete(),
    ]);
    await Promise.all([
      firestore.doc(currentYearPath).delete(),
      firestore.doc(oldYearPath).delete(),
      firestore.doc(otherYearPath).delete(),
      firestore.doc(archivedOnlyYearPath).delete(),
    ]);
  },
);
