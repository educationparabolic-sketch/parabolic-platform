import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {
  StudentBulkIngestionService,
} from "../services/studentBulkIngestion";
import {
  StudentBulkIngestionValidationError,
} from "../types/studentBulkIngestion";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-m2-tests";
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
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

const createAuthStub = () => {
  const users = new Map<string, {
    claims?: Record<string, unknown>;
    disabled?: boolean;
    displayName?: string;
    email?: string;
    uid: string;
  }>();

  return {
    createUser: async (input: {
      disabled?: boolean;
      displayName?: string;
      email: string;
      uid: string;
    }) => {
      users.set(input.uid, {...input});
      return {uid: input.uid, email: input.email};
    },
    deleteUser: async (uid: string) => {
      users.delete(uid);
    },
    getUser: async (uid: string) => {
      const existing = users.get(uid);

      if (!existing) {
        const error = new Error("auth user not found") as Error & {
          code?: string;
        };
        error.code = "auth/user-not-found";
        throw error;
      }

      return {uid, email: existing.email, disabled: existing.disabled};
    },
    setCustomUserClaims: async (
      uid: string,
      claims: Record<string, unknown>,
    ) => {
      const existing = users.get(uid);
      if (!existing) {
        throw new Error("cannot set claims for missing auth user");
      }

      users.set(uid, {...existing, claims});
    },
    updateUser: async (uid: string, input: {
      disabled?: boolean;
      displayName?: string;
      email?: string;
    }) => {
      const existing = users.get(uid);
      if (!existing) {
        const error = new Error("auth user not found") as Error & {
          code?: string;
        };
        error.code = "auth/user-not-found";
        throw error;
      }

      const nextUser = {...existing, ...input, uid};
      users.set(uid, nextUser);
      return {uid, email: nextUser.email, disabled: nextUser.disabled};
    },
    users,
  };
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "student bulk ingestion validates CSV input and commits created, updated, " +
    "and deactivated student records with audit logging",
  async () => {
    const instituteId = "inst_build_m2";
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;
    const studentsPath = `institutes/${instituteId}/students`;
    const existingStudentPath = `${studentsPath}/STU-002`;
    const staleStudentPath = `${studentsPath}/STU-999`;
    const authStub = createAuthStub();
    const service = new StudentBulkIngestionService({
      auth: authStub,
      firestore,
      getCurrentTimestamp: () => new Date("2026-05-03T09:00:00.000Z"),
      logStudentImport:
        administrativeActionLoggingService.logStudentImport.bind(
          administrativeActionLoggingService,
        ),
    });

    await deleteCollectionDocuments(auditLogsPath);
    await deleteCollectionDocuments(studentsPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);

    await firestore.doc(`institutes/${instituteId}`).set({
      instituteId,
      name: "Build M2 Institute",
    });
    await firestore.doc(existingStudentPath).set({
      batch: "Batch-B",
      batchId: "Batch-B",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      deleted: false,
      email: "existing@example.com",
      name: "Existing Student",
      status: "active",
      studentId: "STU-002",
    });
    await firestore.doc(staleStudentPath).set({
      batch: "Batch-Z",
      batchId: "Batch-Z",
      deleted: false,
      email: "stale@example.com",
      name: "Stale Student",
      status: "active",
      studentId: "STU-999",
    });

    const request = service.normalizeRequest({
      actorId: "admin_build_m2",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      commit: true,
      csvContent: [
        "StudentID,FullName,Email,Batch,ParentEmail,Phone,EnrollmentYear",
        "STU-001,New Student,new.student@example.com,Batch-A,parent1@example.com,+1555000001,2026",
        "STU-002,Existing Student,existing@example.com,Batch-C,parent2@example.com,+1555000002,2025",
      ].join("\n"),
      deactivateMissing: true,
      instituteId,
    });

    const result = await service.ingestStudents(request);
    const createdSnapshot = await firestore.doc(`${studentsPath}/STU-001`).get();
    const updatedSnapshot = await firestore.doc(existingStudentPath).get();
    const deactivatedSnapshot = await firestore.doc(staleStudentPath).get();
    const auditSnapshot = await firestore.collection(auditLogsPath)
      .where("actionType", "==", "IMPORT_STUDENTS")
      .get();

    assert.equal(result.committed, true);
    assert.equal(result.summary.created, 1);
    assert.equal(result.summary.updated, 1);
    assert.equal(result.summary.deactivated, 1);
    assert.equal(createdSnapshot.get("status"), "invited");
    assert.equal(createdSnapshot.get("batchId"), "Batch-A");
    assert.equal(updatedSnapshot.get("batchId"), "Batch-C");
    assert.equal(updatedSnapshot.get("status"), "active");
    assert.equal(deactivatedSnapshot.get("status"), "inactive");
    assert.equal(auditSnapshot.size, 1);
    assert.equal(authStub.users.get("STU-001")?.email, "new.student@example.com");
    assert.deepEqual(authStub.users.get("STU-001")?.claims, {
      instituteId,
      licenseLayer: "L2",
      role: "student",
      studentId: "STU-001",
    });

    await deleteCollectionDocuments(auditLogsPath);
    await deleteCollectionDocuments(studentsPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);
  },
);

test(
  "student bulk ingestion returns row-level validation errors and prevents " +
    "commit on duplicates or conflicts",
  async () => {
    const instituteId = "inst_build_m2_conflict";
    const studentsPath = `institutes/${instituteId}/students`;
    const authStub = createAuthStub();
    const service = new StudentBulkIngestionService({
      auth: authStub,
      firestore,
      getCurrentTimestamp: () => new Date("2026-05-03T09:30:00.000Z"),
      logStudentImport:
        administrativeActionLoggingService.logStudentImport.bind(
          administrativeActionLoggingService,
        ),
    });

    await deleteCollectionDocuments(studentsPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);

    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(`${studentsPath}/STU-900`).set({
      batch: "Batch-A",
      batchId: "Batch-A",
      deleted: false,
      email: "existing@example.com",
      name: "Existing Student",
      status: "active",
      studentId: "STU-900",
    });

    const request = service.normalizeRequest({
      actorId: "admin_build_m2_conflict",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      commit: true,
      deactivateMissing: false,
      instituteId,
      students: [
        {
          batch: "Batch-A",
          email: "duplicate@example.com",
          fullName: "Student One",
          studentId: "STU-001",
        },
        {
          batch: "Batch-B",
          email: "duplicate@example.com",
          fullName: "Student Two",
          studentId: "STU-002",
        },
        {
          batch: "Batch-C",
          email: "existing@example.com",
          fullName: "Student Three",
          studentId: "STU-003",
        },
      ],
    });

    const result = await service.ingestStudents(request);
    const studentSnapshot = await firestore.doc(`${studentsPath}/STU-001`).get();

    assert.equal(result.committed, false);
    assert.equal(result.summary.invalid, 2);
    assert.match(result.rows[1]?.errors[0] ?? "", /duplicate email/i);
    assert.match(result.rows[2]?.errors[0] ?? "", /another student record/i);
    assert.equal(studentSnapshot.exists, false);
    assert.equal(authStub.users.size, 0);

    await deleteCollectionDocuments(studentsPath);
    await deleteDocumentIfPresent(`institutes/${instituteId}`);
  },
);

test("student bulk ingestion rejects malformed input rows", () => {
  const service = new StudentBulkIngestionService({
    auth: createAuthStub(),
    firestore,
    getCurrentTimestamp: () => new Date("2026-05-03T10:00:00.000Z"),
    logStudentImport:
      administrativeActionLoggingService.logStudentImport.bind(
        administrativeActionLoggingService,
      ),
  });

  assert.throws(
    () => {
      service.normalizeRequest({
        actorId: "admin_build_m2_invalid",
        actorLicenseLayer: "L2",
        actorRole: "admin",
        instituteId: "inst_build_m2_invalid",
        students: [
          {
            batch: "Batch-A",
            email: "not-an-email",
            fullName: "Broken Student",
            studentId: "STU-001",
          },
        ],
      });
    },
    (error: unknown) =>
      error instanceof StudentBulkIngestionValidationError &&
      error.code === "VALIDATION_ERROR",
  );
});
