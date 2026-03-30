import assert from "node:assert/strict";
import test from "node:test";
import {setRequestIdentity} from "../middleware/framework";
import {
  createLicenseEnforcementMiddleware,
  DEFAULT_LICENSE_RESTRICTED_MESSAGE,
  isLicenseLayerSufficient,
} from "../middleware/license";
import {MiddlewareRejectionError} from "../types/middleware";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test(
  "license middleware rejects requests without identity context",
  async () => {
    const middleware = createLicenseEnforcementMiddleware({
      requiredLayer: "L1",
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
  },
);

test(
  "license middleware allows requests at or above the required layer",
  async () => {
    const middleware = createLicenseEnforcementMiddleware({
      requiredLayer: "L2",
    });
    const request = createMockRequest();
    let nextCalled = false;

    setRequestIdentity(request as never, {
      instituteId: "inst_build_65",
      isSuspended: false,
      isVendor: false,
      licenseLayer: "L3",
      role: "admin",
      uid: "uid_build_65_admin",
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

test("license middleware rejects insufficient license layers", async () => {
  const middleware = createLicenseEnforcementMiddleware({
    requiredLayer: "L3",
    restrictionMessage: "Governance access requires license layer L3.",
  });
  const request = createMockRequest();

  setRequestIdentity(request as never, {
    instituteId: "inst_build_65",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L2",
    role: "director",
    uid: "uid_build_65_director",
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
      error.message === "Governance access requires license layer L3.",
  );
});

test(
  "license middleware exposes the shared default restriction message",
  async () => {
    const middleware = createLicenseEnforcementMiddleware({
      requiredLayer: "L1",
    });
    const request = createMockRequest();

    setRequestIdentity(request as never, {
      instituteId: "inst_build_65",
      isSuspended: false,
      isVendor: false,
      licenseLayer: "L0",
      role: "teacher",
      uid: "uid_build_65_teacher",
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
        error.message === DEFAULT_LICENSE_RESTRICTED_MESSAGE,
    );
  },
);

test("isLicenseLayerSufficient follows the architecture layer order", () => {
  assert.equal(isLicenseLayerSufficient("L0", "L0"), true);
  assert.equal(isLicenseLayerSufficient("L2", "L1"), true);
  assert.equal(isLicenseLayerSufficient("L1", "L2"), false);
});
