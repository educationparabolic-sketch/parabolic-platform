import assert from "node:assert/strict";
import test from "node:test";
import {createCapabilityAuthorizationMiddleware} from "../middleware/capability";
import {setRequestIdentity} from "../middleware/framework";
import {MiddlewareRejectionError} from "../types/middleware";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createIdentity = (overrides: Record<string, unknown> = {}) => ({
  expiryDate: "2099-09-26T00:00:00.000Z",
  featureFlags: {riskOverview: true},
  gracePeriodEndsAt: null,
  instituteId: "inst_capability",
  isSuspended: false,
  isVendor: false,
  licenseLayer: "L2" as const,
  licenseState: "active" as const,
  licenseVersion: "license-capability-v2",
  role: "teacher",
  studentId: null,
  uid: "teacher_capability",
  ...overrides,
});

test("capability middleware accepts complete active entitlement", async () => {
  const request = createMockRequest();
  setRequestIdentity(request as never, createIdentity() as never);
  let nextCalled = false;

  await createCapabilityAuthorizationMiddleware({
    minimumLicenseLayer: "L1",
    requiredFeatureFlag: "riskOverview",
  })(request as never, createMockResponse() as never, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("capability middleware fails closed for incomplete claim versions", async () => {
  const request = createMockRequest();
  setRequestIdentity(
    request as never,
    createIdentity({licenseVersion: null}) as never,
  );

  await assert.rejects(
    async () => createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L1",
    })(request as never, createMockResponse() as never, async () => undefined),
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "LICENSE_RESTRICTED" &&
      /incomplete/.test(error.message),
  );
});

test("capability middleware checks feature authority after entitlement", async () => {
  const request = createMockRequest();
  setRequestIdentity(
    request as never,
    createIdentity({featureFlags: {riskOverview: false}}) as never,
  );

  await assert.rejects(
    async () => createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L1",
      requiredFeatureFlag: "riskOverview",
    })(request as never, createMockResponse() as never, async () => undefined),
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "FORBIDDEN" &&
      /riskOverview/.test(error.message),
  );
});

test("reviewed Vendor bypass does not require institute entitlement", async () => {
  const request = createMockRequest();
  setRequestIdentity(request as never, createIdentity({
    expiryDate: null,
    featureFlags: {},
    instituteId: null,
    isVendor: true,
    licenseLayer: "L0",
    licenseState: null,
    licenseVersion: null,
    role: "vendor",
    uid: "vendor_capability",
  }) as never);
  let nextCalled = false;

  await createCapabilityAuthorizationMiddleware({
    minimumLicenseLayer: "L3",
    requiredFeatureFlag: "governanceAccess",
    vendorBypass: true,
  })(request as never, createMockResponse() as never, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
