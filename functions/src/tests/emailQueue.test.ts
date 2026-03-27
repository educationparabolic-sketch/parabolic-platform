import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {emailQueueService} from "../services/emailQueue";
import {
  buildSuccessResponse,
  createInternalEmailQueueHandler,
} from "../api/internalEmailQueue";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-48-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface MockResponse {
  body: unknown;
  statusCode: number;
  json: (value: unknown) => MockResponse;
  status: (statusCode: number) => MockResponse;
}

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

const createMockResponse = (): MockResponse => {
  const response: MockResponse = {
    body: undefined,
    json(value: unknown) {
      response.body = value;
      return response;
    },
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    statusCode: 200,
  };

  return response;
};

const createMockRequest = (overrides: Partial<{
  body: unknown;
  headers: Record<string, string>;
  method: string;
}> = {}) => {
  const headers = Object.fromEntries(
    Object.entries(overrides.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );

  return {
    body: overrides.body ?? {},
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    headers,
    ip: "127.0.0.1",
    method: overrides.method ?? "POST",
    path: "/internal/email/queue",
  };
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "enqueueEmailJob writes a pending email queue document",
  async () => {
    const result = await emailQueueService.enqueueEmailJob({
      payload: {
        instituteId: "inst_build_48_service",
        rawScorePercent: 81,
        studentId: "student_build_48_service",
      },
      recipientEmail: "student.build48@example.com",
      templateType: "test_completed",
    });

    const snapshot = await firestore.doc(result.jobPath).get();

    assert.equal(result.status, "pending");
    assert.equal(snapshot.data()?.instituteId, "inst_build_48_service");
    assert.equal(
      snapshot.data()?.recipientEmail,
      "student.build48@example.com",
    );
    assert.equal(snapshot.data()?.templateType, "test_completed");
    assert.equal(snapshot.data()?.subject, "test_completed");
    assert.equal(snapshot.data()?.status, "pending");
    assert.equal(snapshot.data()?.retryCount, 0);
    assert.equal(snapshot.data()?.sentAt, null);
    assert.equal(
      snapshot.data()?.payload?.studentId,
      "student_build_48_service",
    );
    assert.equal(typeof snapshot.data()?.createdAt?.toDate, "function");

    await deleteDocumentIfPresent(result.jobPath);
  },
);

test(
  "internal email queue handler accepts backend service requests",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob:
        emailQueueService.enqueueEmailJob.bind(emailQueueService),
      verifyIdToken: async () => ({
        instituteId: "inst_build_48_handler",
        role: "service",
        uid: "svc_build_48",
      }) as never,
    });
    const request = createMockRequest({
      body: {
        payload: {
          instituteId: "inst_build_48_handler",
          riskState: "Volatile",
        },
        recipientEmail:
          "alerts.build48@example.com",
        templateType: "high_risk_student_alert",
      },
      headers: {
        authorization: "Bearer build_48_token",
      },
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    const responseBody = response.body as {
      code: string;
      data: {
        jobPath: string;
        status: string;
      };
      success: boolean;
    };
    const snapshot = await firestore.doc(responseBody.data.jobPath).get();

    assert.equal(response.statusCode, 200);
    assert.equal(responseBody.code, "OK");
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.status, "pending");
    assert.equal(
      snapshot.data()?.recipientEmail,
      "alerts.build48@example.com",
    );

    await deleteDocumentIfPresent(responseBody.data.jobPath);
  },
);

test(
  "internal email queue handler rejects non-service roles",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob:
        emailQueueService.enqueueEmailJob.bind(emailQueueService),
      verifyIdToken: async () => ({
        instituteId: "inst_build_48_forbidden",
        role: "student",
        uid: "student_build_48",
      }) as never,
    });
    const request = createMockRequest({
      body: {
        payload: {
          instituteId: "inst_build_48_forbidden",
        },
        recipientEmail: "forbidden.build48@example.com",
        templateType: "discipline_violation_notification",
      },
      headers: {
        authorization: "Bearer build_48_forbidden",
      },
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 403);
    assert.equal(
      (response.body as {
        error: {
          code: string;
          message: string;
        };
        meta: {
          requestId: string;
          timestamp: string;
        };
        success: boolean;
      }).error.code,
      "FORBIDDEN",
    );
    assert.equal(
      (response.body as {
        error: {
          code: string;
          message: string;
        };
      }).error.message,
      "Only backend service roles can enqueue email jobs.",
    );
    assert.equal(
      (response.body as {success: boolean}).success,
      false,
    );
  },
);

test(
  "internal email queue handler rejects tenant mismatches",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob:
        emailQueueService.enqueueEmailJob.bind(emailQueueService),
      verifyIdToken: async () => ({
        instituteId: "inst_build_48_claim",
        role: "backend_service",
        uid: "svc_build_48_claim",
      }) as never,
    });
    const request = createMockRequest({
      body: {
        payload: {
          instituteId: "inst_build_48_body",
        },
        recipientEmail: "tenant.build48@example.com",
        templateType: "high_risk_student_alert",
      },
      headers: {
        authorization: "Bearer build_48_tenant",
      },
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 403);
    assert.equal(
      (response.body as {error: {code: string}}).error.code,
      "TENANT_MISMATCH",
    );
    assert.equal(
      (response.body as {error: {message: string}}).error.message,
      "Token instituteId does not match payload.instituteId.",
    );
    assert.equal(
      typeof (response.body as {meta: {requestId: string}}).meta.requestId,
      "string",
    );
  },
);

test(
  "internal email queue handler rejects invalid payloads",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob:
        emailQueueService.enqueueEmailJob.bind(emailQueueService),
      verifyIdToken: async () => ({
        instituteId: "inst_build_48_invalid",
        role: "service",
        uid: "svc_build_48_invalid",
      }) as never,
    });
    const request = createMockRequest({
      body: {
        payload: [],
        recipientEmail: "",
        templateType: "high_risk_student_alert",
      },
      headers: {
        authorization: "Bearer build_48_invalid",
      },
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 400);
    assert.equal(
      (response.body as {error: {code: string}}).error.code,
      "VALIDATION_ERROR",
    );
    assert.equal(
      (response.body as {error: {message: string}}).error.message,
      "Field \"payload.instituteId\" must be a non-empty string.",
    );
    assert.equal(
      typeof (response.body as {meta: {timestamp: string}}).meta.timestamp,
      "string",
    );
  },
);

test(
  "buildSuccessResponse returns only the queue contract fields",
  () => {
    const response = buildSuccessResponse(
      {
        jobId: "job_build_48",
        jobPath: "emailQueue/job_build_48",
        status: "pending",
      },
      "req_build_48",
      "2026-03-27T10:00:00.000Z",
    );

    assert.deepEqual(response, {
      code: "OK",
      data: {
        jobId: "job_build_48",
        jobPath: "emailQueue/job_build_48",
        status: "pending",
      },
      message: "Email job queued.",
      requestId: "req_build_48",
      success: true,
      timestamp: "2026-03-27T10:00:00.000Z",
    });
  },
);
