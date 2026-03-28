import assert from "node:assert/strict";
import test from "node:test";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {StudentFilteringQueryRequest} from "../types/studentSearch";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-53-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";

const firestore = getFirestore();
const instituteId = "inst_build_53";
const yearId = "2026";
const studentIds = [
  "student_build_53_1",
  "student_build_53_2",
  "student_build_53_3",
  "student_build_53_4",
  "student_build_53_5",
];

const getStudentPath = (studentId: string): string =>
  `institutes/${instituteId}/students/${studentId}`;

const getMetricsPath = (studentId: string): string =>
  `institutes/${instituteId}/academicYears/${yearId}/` +
  `studentYearMetrics/${studentId}`;

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

const seedStudents = async (): Promise<void> => {
  await Promise.all([
    firestore.doc(getStudentPath(studentIds[0])).set({
      batchId: "batch-a",
      name: "Aarav",
      status: "active",
      studentId: studentIds[0],
    }),
    firestore.doc(getStudentPath(studentIds[1])).set({
      batchId: "batch-a",
      name: "Bhavya",
      status: "active",
      studentId: studentIds[1],
    }),
    firestore.doc(getStudentPath(studentIds[2])).set({
      batchId: "batch-b",
      name: "Charu",
      status: "inactive",
      studentId: studentIds[2],
    }),
    firestore.doc(getStudentPath(studentIds[3])).set({
      batchId: "batch-a",
      name: "Dev",
      status: "active",
      studentId: studentIds[3],
    }),
    firestore.doc(getStudentPath(studentIds[4])).set({
      batchId: "batch-c",
      name: "Esha",
      status: "active",
      studentId: studentIds[4],
    }),
  ]);

  await Promise.all([
    firestore.doc(getMetricsPath(studentIds[0])).set({
      avgRawScorePercent: 82,
      disciplineIndex: 91,
      riskState: "Stable",
      studentId: studentIds[0],
    }),
    firestore.doc(getMetricsPath(studentIds[1])).set({
      avgRawScorePercent: 64,
      disciplineIndex: 58,
      riskState: "Impulsive",
      studentId: studentIds[1],
    }),
    firestore.doc(getMetricsPath(studentIds[2])).set({
      avgRawScorePercent: 48,
      disciplineIndex: 72,
      riskState: "Drift-Prone",
      studentId: studentIds[2],
    }),
    firestore.doc(getMetricsPath(studentIds[3])).set({
      avgRawScorePercent: 70,
      disciplineIndex: 76,
      riskState: "Impulsive",
      studentId: studentIds[3],
    }),
  ]);
};

let studentFilteringQueryService: {
  searchStudents: (
    request: StudentFilteringQueryRequest,
  ) => ReturnType<
    typeof import("../services/studentSearchQuery").studentFilteringQueryService
      .searchStudents
  >;
};

test.before(async () => {
  const module = await import("../services/studentSearchQuery.js");
  studentFilteringQueryService = module.studentFilteringQueryService;
  await Promise.all(
    studentIds.flatMap((studentId) => [
      deleteDocumentIfPresent(getStudentPath(studentId)),
      deleteDocumentIfPresent(getMetricsPath(studentId)),
    ]),
  );
  await seedStudents();
});

test.after(async () => {
  await Promise.all(
    studentIds.flatMap((studentId) => [
      deleteDocumentIfPresent(getStudentPath(studentId)),
      deleteDocumentIfPresent(getMetricsPath(studentId)),
    ]),
  );
  await getFirebaseAdminApp().delete();
});

test(
  "searchStudents supports batch filtering from student documents",
  async () => {
    const result = await studentFilteringQueryService.searchStudents({
      actorRole: "teacher",
      filter: {
        batchId: "batch-a",
      },
      instituteId,
      limit: 10,
      yearId,
    });

    assert.deepEqual(
      result.students.map((student) => student.studentId),
      [
        "student_build_53_1",
        "student_build_53_2",
        "student_build_53_4",
      ],
    );
    assert.equal(result.students[2]?.metrics?.riskState, "Impulsive");
    assert.equal(result.nextCursor, null);
  },
);

test(
  "searchStudents supports risk-state filtering from yearly metrics",
  async () => {
    const result = await studentFilteringQueryService.searchStudents({
      actorRole: "admin",
      filter: {
        riskState: "Impulsive",
      },
      instituteId,
      limit: 10,
      yearId,
    });

    assert.deepEqual(
      result.students.map((student) => student.studentId),
      [
        "student_build_53_2",
        "student_build_53_4",
      ],
    );
    assert.equal(result.students[0]?.batchId, "batch-a");
  },
);

test(
  "searchStudents supports batch and score-range filtering " +
    "with deterministic pagination",
  async () => {
    const firstPage = await studentFilteringQueryService.searchStudents({
      actorRole: "teacher",
      filter: {
        avgRawScorePercentRange: {
          min: 70,
        },
        batchId: "batch-a",
      },
      instituteId,
      limit: 1,
      yearId,
    });

    assert.deepEqual(
      firstPage.students.map((student) => student.studentId),
      ["student_build_53_1"],
    );
    assert.deepEqual(firstPage.nextCursor, {
      baseDomain: "studentYearMetrics",
      sortDirection: "desc",
      sortField: "avgRawScorePercent",
      sortValue: 82,
      studentId: "student_build_53_1",
    });

    const secondPage = await studentFilteringQueryService.searchStudents({
      actorRole: "teacher",
      cursor: firstPage.nextCursor ?? undefined,
      filter: {
        avgRawScorePercentRange: {
          min: 70,
        },
        batchId: "batch-a",
      },
      instituteId,
      limit: 1,
      yearId,
    });

    assert.deepEqual(
      secondPage.students.map((student) => student.studentId),
      ["student_build_53_4"],
    );
    assert.equal(secondPage.nextCursor, null);
  },
);

test("searchStudents supports discipline-index range filtering", async () => {
  const result = await studentFilteringQueryService.searchStudents({
    actorRole: "admin",
    filter: {
      disciplineIndexRange: {
        min: 70,
      },
    },
    instituteId,
    limit: 10,
    yearId,
  });

  assert.deepEqual(
    result.students.map((student) => student.studentId),
    [
      "student_build_53_1",
      "student_build_53_4",
      "student_build_53_3",
    ],
  );
});

test(
  "searchStudents returns batch students without metrics when batch filter " +
    "is the only filter",
  async () => {
    const result = await studentFilteringQueryService.searchStudents({
      actorRole: "teacher",
      filter: {
        batchId: "batch-c",
      },
      instituteId,
      limit: 10,
      yearId,
    });

    assert.deepEqual(
      result.students.map((student) => student.studentId),
      ["student_build_53_5"],
    );
    assert.equal(result.students[0]?.metrics, null);
  },
);

test(
  "searchStudents rejects multiple score-range filters in one query",
  async () => {
    await assert.rejects(
      studentFilteringQueryService.searchStudents({
        actorRole: "admin",
        filter: {
          avgRawScorePercentRange: {
            min: 60,
          },
          disciplineIndexRange: {
            min: 70,
          },
        },
        instituteId,
        limit: 10,
        yearId,
      }),
      (error: unknown) => {
        assert.match(String(error), /one score range filter/i);
        return true;
      },
    );
  },
);
