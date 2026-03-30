import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIdentityContext,
  createAuthenticationMiddleware,
  getBearerToken,
} from "../middleware/auth";
import {MiddlewareRejectionError} from "../types/middleware";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test("getBearerToken rejects missing authorization headers", () => {
  assert.throws(
    () => getBearerToken(undefined),
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "UNAUTHORIZED" &&
      error.message === "Missing authorization header.",
  );
});

test("getBearerToken rejects non-bearer authorization headers", () => {
  assert.throws(
    () => getBearerToken("Basic abc123"),
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "UNAUTHORIZED" &&
      error.message === "Authorization header must be in Bearer token format.",
  );
});

test("buildIdentityContext requires uid, role, and licenseLayer claims", () => {
  assert.throws(
    () => buildIdentityContext({
      instituteId: "inst_build_62",
      role: "student",
      uid: "",
    } as never),
    (error: unknown) =>
      error instanceof MiddlewareRejectionError &&
      error.code === "UNAUTHORIZED" &&
      error.message === "Authentication token is missing required claims.",
  );
});

test(
  "authentication middleware attaches normalized identity context",
  async () => {
    const middleware = createAuthenticationMiddleware(
      {
        verifyIdToken: async () => ({
          instituteId: "inst_build_62",
          isSuspended: false,
          licenseLayer: "l2",
          role: "Student",
          studentId: "student_build_62",
          uid: "uid_build_62",
        }) as never,
      },
      {attachStudentId: true},
    );
    const request = createMockRequest({
      headers: {
        authorization: "Bearer build_62_token",
      },
    });
    const response = createMockResponse();
    let nextCalled = false;

    await middleware(
      request as never,
      response as never,
      async (): Promise<void> => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
    assert.deepEqual(
      (request as {context: {identity: unknown}}).context.identity,
      {
        instituteId: "inst_build_62",
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L2",
        role: "student",
        uid: "uid_build_62",
      },
    );
    assert.deepEqual(
      (request as {context: {requestData: Record<string, unknown>}})
        .context.requestData,
      {studentId: "student_build_62"},
    );
  },
);

test(
  "authentication middleware converts verification failures into unauthorized",
  async () => {
    const middleware = createAuthenticationMiddleware({
      verifyIdToken: async () => {
        throw new Error("token expired");
      },
    });
    const request = createMockRequest({
      headers: {
        authorization: "Bearer build_62_expired",
      },
    });
    const response = createMockResponse();

    await assert.rejects(
      async () => {
        await middleware(
          request as never,
          response as never,
          async (): Promise<void> => undefined,
        );
      },
      (error: unknown) =>
        error instanceof MiddlewareRejectionError &&
        error.code === "UNAUTHORIZED" &&
        error.message === "Invalid or expired authentication token.",
    );
  },
);
