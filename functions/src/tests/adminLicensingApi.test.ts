import assert from "node:assert/strict";
import test from "node:test";
import {createAdminLicensingHandler} from "../api/adminLicensing";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_150",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_150",
  ...overrides,
});

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const errorResponse = responseBody as {
    error: {
      code: string;
      message: string;
    };
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
};

test("admin licensing handler accepts snapshot read request", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => ({
      actionType: "GET_LICENSE_SNAPSHOT",
      snapshot: {
        currentPlan: {
          activeStudentCount: 128,
          attemptsQuotaThisMonth: 900,
          attemptsUsedThisMonth: 412,
          billingCycle: "monthly",
          concurrencyLimit: 45,
          currentLayer: "L2",
          expiryDate: "2026-12-31",
          licenseStartDate: "2026-01-01",
          maxStudentLimit: 200,
          planName: "Controlled",
          renewalDate: "2027-01-01",
        },
        eligibilityProgress: [],
        featureMatrix: [],
        licenseHistory: [],
        upgradePreview: {
          currentLayer: "L2",
          previewCards: [],
          requestUpgradeUrl: "https://vendor.yourdomain.com/licensing/request-upgrade",
          scheduleEvaluationUrl: "https://vendor.yourdomain.com/licensing/schedule-evaluation",
        },
        usageAndBilling: {
          actions: {
            contactSupportUrl: "https://vendor.yourdomain.com/support",
            downloadInvoiceUrl: "https://vendor.yourdomain.com/billing/invoice/latest",
            updatePaymentMethodUrl: "https://vendor.yourdomain.com/billing/payment-method",
            viewBillingHistoryUrl: "https://vendor.yourdomain.com/billing/history",
          },
          activeStudents: 128,
          attemptsRemaining: 488,
          attemptsUsed: 412,
          estimatedCurrentBill: "USD 999.00",
          maxConcurrentAllowed: 45,
          maxStudentsAllowed: 200,
          nextBillingDate: "2026-05-01",
          peakConcurrency: 39,
          remainingStudentSlots: 72,
        },
      },
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_LICENSE_SNAPSHOT",
      instituteId: "inst_build_150",
    },
    headers: {
      authorization: "Bearer build_150_token",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin licensing handler rejects teacher role", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "teacher"}) as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "GET_LICENSE_SNAPSHOT",
        instituteId: "inst_build_150",
      },
      headers: {
        authorization: "Bearer build_150_teacher",
      },
      path: "/admin/licensing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access licensing configuration.",
  );
});

test("admin licensing handler allows director snapshot read", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => ({
      actionType: "GET_LICENSE_SNAPSHOT",
      snapshot: {
        currentPlan: {
          activeStudentCount: 64,
          attemptsQuotaThisMonth: 400,
          attemptsUsedThisMonth: 180,
          billingCycle: "monthly",
          concurrencyLimit: 20,
          currentLayer: "L1",
          expiryDate: "2026-12-31",
          licenseStartDate: "2026-01-01",
          maxStudentLimit: 120,
          planName: "Diagnostic",
          renewalDate: "2027-01-01",
        },
        eligibilityProgress: [],
        featureMatrix: [],
        licenseHistory: [],
        upgradePreview: {
          currentLayer: "L1",
          previewCards: [],
          requestUpgradeUrl: "https://vendor.yourdomain.com/licensing/request-upgrade",
          scheduleEvaluationUrl: "https://vendor.yourdomain.com/licensing/schedule-evaluation",
        },
        usageAndBilling: {
          actions: {
            contactSupportUrl: "https://vendor.yourdomain.com/support",
            downloadInvoiceUrl: "https://vendor.yourdomain.com/billing/invoice/latest",
            updatePaymentMethodUrl: "https://vendor.yourdomain.com/billing/payment-method",
            viewBillingHistoryUrl: "https://vendor.yourdomain.com/billing/history",
          },
          activeStudents: 64,
          attemptsRemaining: 220,
          attemptsUsed: 180,
          estimatedCurrentBill: "USD 480.00",
          maxConcurrentAllowed: 20,
          maxStudentsAllowed: 120,
          nextBillingDate: "2026-05-01",
          peakConcurrency: 14,
          remainingStudentSlots: 56,
        },
      },
    }),
    verifyIdToken: async () =>
      createAdminToken({role: "director", uid: "director_build_150"}) as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_LICENSE_SNAPSHOT",
      instituteId: "inst_build_150",
    },
    headers: {
      authorization: "Bearer build_150_director",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin licensing handler rejects unsupported action type", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "DELETE_LICENSE",
      instituteId: "inst_build_150",
    },
    headers: {
      authorization: "Bearer build_150_token",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"actionType\" is not supported.",
  );
});
