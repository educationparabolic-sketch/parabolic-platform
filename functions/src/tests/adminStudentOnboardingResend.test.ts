import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  AdminStudentOnboardingResendService,
} from "../services/adminStudentOnboardingResend";
import {
  AdminStudentOnboardingResendValidationError,
} from "../types/adminStudentOnboardingResend";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("onboarding resend atomically queues and audits one replayable command", async () => {
  const instituteId = "inst_onboarding_replay";
  const studentId = "STU-ONBOARD-1";
  const student = firestore.doc(`institutes/${instituteId}/students/${studentId}`);
  const service = new AdminStudentOnboardingResendService({
    firestore,
    getCurrentTimestamp: () => new Date("2026-09-02T06:00:00.000Z"),
  });
  await student.set({
    email: "invite@example.com",
    fullName: "Invited Student",
    status: "invited",
    studentId,
  });
  const request = service.normalizeRequest({
    actorId: "admin-onboarding",
    actorRole: "admin",
    idempotencyKey: "onboarding-replay-key",
    instituteId,
    studentId,
  });

  const applied = await service.resendOnboardingEmail(request);
  const replayed = await service.resendOnboardingEmail(request);
  const jobs = await firestore.collection("emailQueue")
    .where("instituteId", "==", instituteId).get();
  const audits = await firestore.collection(`institutes/${instituteId}/auditLogs`)
    .where("actionType", "==", "RESEND_STUDENT_ONBOARDING").get();

  assert.equal(applied.disposition, "applied");
  assert.equal(replayed.disposition, "replayed");
  assert.equal(replayed.auditId, applied.auditId);
  assert.equal(replayed.jobId, applied.jobId);
  assert.equal(jobs.size, 1);
  assert.equal(audits.size, 1);
  assert.equal(audits.docs[0]?.get("metadata.idempotencyKey"), undefined);
  assert.equal(jobs.docs[0]?.get("recipientEmail"), "invite@example.com");

  await assert.rejects(
    service.resendOnboardingEmail({...request, studentId: "STU-OTHER"}),
    (error: unknown) => error instanceof AdminStudentOnboardingResendValidationError &&
      error.code === "CONFLICT",
  );

  await Promise.all([
    ...jobs.docs.map((document) => document.ref.delete()),
    ...audits.docs.map((document) => document.ref.delete()),
    student.delete(),
  ]);
});
