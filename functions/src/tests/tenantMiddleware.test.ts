import assert from "node:assert/strict";
import test from "node:test";
import {setRequestIdentity} from "../middleware/framework";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {MiddlewareRejectionError} from "../types/middleware";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test("tenant middleware rejects institute mismatches", async () => {
  const middleware = createTenantGuardMiddleware({
    resolveRequestInstituteId: (request) =>
      ((request.body ?? {}) as {instituteId?: string}).instituteId,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_63_request",
    },
  });

  setRequestIdentity(request as never, {
    instituteId: "inst_build_63_token",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L1",
    role: "student",
    uid: "uid_build_63",
  });

  await assert.rejects(
    async () => {
      await middleware(
        request as never,
        createMockResponse() as never,
        async (): Promise<void> => undefined,
      );
    },
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "TENANT_MISMATCH" &&
      error.message === "Token instituteId does not match request instituteId.",
  );
});

test("tenant middleware allows matching institute access", async () => {
  const middleware = createTenantGuardMiddleware({
    resolveRequestInstituteId: (request) =>
      ((request.body ?? {}) as {instituteId?: string}).instituteId,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_63_match",
    },
  });
  let nextCalled = false;

  setRequestIdentity(request as never, {
    instituteId: "inst_build_63_match",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L1",
    role: "student",
    uid: "uid_build_63",
  });

  await middleware(
    request as never,
    createMockResponse() as never,
    async (): Promise<void> => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
});

test("tenant middleware bypasses vendor requests", async () => {
  const middleware = createTenantGuardMiddleware({
    resolveRequestInstituteId: (request) =>
      ((request.body ?? {}) as {instituteId?: string}).instituteId,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_63_request",
    },
  });
  let nextCalled = false;

  setRequestIdentity(request as never, {
    instituteId: null,
    isSuspended: false,
    isVendor: true,
    licenseLayer: "L3",
    role: "vendor",
    uid: "uid_build_63_vendor",
  });

  await middleware(
    request as never,
    createMockResponse() as never,
    async (): Promise<void> => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
});
