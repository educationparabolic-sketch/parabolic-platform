import assert from "node:assert/strict";
import test from "node:test";
import {setRequestIdentity} from "../middleware/framework";
import {
  createGovernanceAccessMiddleware,
  DEFAULT_GOVERNANCE_LICENSE_MESSAGE,
} from "../middleware/governanceAccess";
import {MiddlewareRejectionError} from "../types/middleware";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test(
  "governance access middleware rejects requests without identity context",
  async () => {
    const middleware = createGovernanceAccessMiddleware();

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
  },
);

test(
  "governance access middleware allows director users with L3 access",
  async () => {
    const middleware = createGovernanceAccessMiddleware();
    const request = createMockRequest();
    let nextCalled = false;

    setRequestIdentity(request as never, {
      instituteId: "inst_build_89",
      isSuspended: false,
      isVendor: false,
      licenseLayer: "L3",
      role: "director",
      uid: "uid_build_89_director",
    });

    await middleware(
      request as never,
      createMockResponse() as never,
      async (): Promise<void> => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  },
);

test(
  "governance access middleware allows vendor users without L3 licensing",
  async () => {
    const middleware = createGovernanceAccessMiddleware();
    const request = createMockRequest();
    let nextCalled = false;

    setRequestIdentity(request as never, {
      instituteId: null,
      isSuspended: false,
      isVendor: true,
      licenseLayer: "L0",
      role: "vendor",
      uid: "uid_build_89_vendor",
    });

    await middleware(
      request as never,
      createMockResponse() as never,
      async (): Promise<void> => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  },
);

test(
  "governance access middleware rejects non-vendor users below L3",
  async () => {
    const middleware = createGovernanceAccessMiddleware();
    const request = createMockRequest();

    setRequestIdentity(request as never, {
      instituteId: "inst_build_89",
      isSuspended: false,
      isVendor: false,
      licenseLayer: "L2",
      role: "director",
      uid: "uid_build_89_director",
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
        error.code === "LICENSE_RESTRICTED" &&
        error.message === DEFAULT_GOVERNANCE_LICENSE_MESSAGE,
    );
  },
);
