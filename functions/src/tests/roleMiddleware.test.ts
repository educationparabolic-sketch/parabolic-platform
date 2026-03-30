import assert from "node:assert/strict";
import test from "node:test";
import {setRequestIdentity} from "../middleware/framework";
import {
  createRoleAuthorizationMiddleware,
  DEFAULT_FORBIDDEN_MESSAGE,
} from "../middleware/role";
import {MiddlewareRejectionError} from "../types/middleware";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test("role middleware rejects requests without identity context", async () => {
  const middleware = createRoleAuthorizationMiddleware({
    allowedRoles: ["admin"],
  });

  await assert.rejects(
    async () => {
      await middleware(
        createMockRequest() as never,
        createMockResponse() as never,
        async (): Promise<void> => undefined,
      );
    },
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "UNAUTHORIZED" &&
      error.message === "Authenticated request context is required.",
  );
});

test("role middleware allows normalized configured roles", async () => {
  const middleware = createRoleAuthorizationMiddleware({
    allowedRoles: [" ADMIN ", "Teacher"],
  });
  const request = createMockRequest();
  let nextCalled = false;

  setRequestIdentity(request as never, {
    instituteId: "inst_build_64",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L2",
    role: "teacher",
    uid: "uid_build_64",
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

test("role middleware rejects unauthorized roles", async () => {
  const middleware = createRoleAuthorizationMiddleware({
    allowedRoles: ["admin", "director"],
    forbiddenMessage: "Only institute leadership roles can archive years.",
  });
  const request = createMockRequest();

  setRequestIdentity(request as never, {
    instituteId: "inst_build_64",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L3",
    role: "teacher",
    uid: "uid_build_64_teacher",
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
      error.code === "FORBIDDEN" &&
      error.message === "Only institute leadership roles can archive years.",
  );
});

test("role middleware uses the default forbidden message", async () => {
  const middleware = createRoleAuthorizationMiddleware({
    allowedRoles: ["vendor"],
  });
  const request = createMockRequest();

  setRequestIdentity(request as never, {
    instituteId: null,
    isSuspended: false,
    isVendor: true,
    licenseLayer: "L3",
    role: "student",
    uid: "uid_build_64_student",
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
      error.code === "FORBIDDEN" &&
      error.message === DEFAULT_FORBIDDEN_MESSAGE,
  );
});
