import assert from "node:assert/strict";
import test from "node:test";
import {UserRecord} from "firebase-admin/auth";
import {assertCurrentVendorIdentity} from "../middleware/currentVendor";
import {buildIdentityContext, createAuthenticationMiddleware} from "../middleware/auth";
import {hasConsistentVendorClaims, VendorCapability, VENDOR_CAPABILITY_ROLES} from "../policy/vendorRolePolicy";
import {MiddlewareIdentityContext, MiddlewareRequest, MiddlewareRejectionError} from "../types/middleware";
import {createMockRequest, createMockResponse} from "./helpers/http";

const identity: MiddlewareIdentityContext = {
  uid: "verified_vendor", role: "vendor", isVendor: true, isSuspended: false,
  instituteId: null, studentId: null, licenseLayer: "L0",
};
const request = (overrides: Partial<MiddlewareIdentityContext> = {}): MiddlewareRequest => ({
  context: {requestId: "current-vendor-proof", identity: {...identity, ...overrides}},
}) as MiddlewareRequest;
const rejected = (code: string) => (error: unknown): boolean =>
  error instanceof MiddlewareRejectionError && error.code === code;
const user = (customClaims: Record<string, unknown>, disabled = false): UserRecord => ({
  uid: identity.uid, disabled, customClaims, emailVerified: true, providerData: [],
  metadata: {creationTime: "2026-10-01T00:00:00.000Z", lastSignInTime: "2026-10-01T00:00:00.000Z", toJSON: () => ({})},
  toJSON: () => ({uid: identity.uid}),
});

test("Vendor capabilities require current authority and preserve verified actor identity", async () => {
  for (const capability of Object.keys(VENDOR_CAPABILITY_ROLES) as VendorCapability[]) {
    let lookup = "";
    const result = await assertCurrentVendorIdentity(request(), {
      getUser: async (uid) => {
        lookup = uid;
        return user({role: "vendor"});
      },
    }, capability);
    assert.equal(lookup, identity.uid);
    assert.equal(result.actorId, identity.uid);
    assert.equal(result.user.uid, identity.uid);
    assert.deepEqual(VENDOR_CAPABILITY_ROLES[capability], ["vendor"]);
  }
});

test("current contradictions, suspension and disabled identities fail every domain", async () => {
  const variants = [
    {role: "admin", isVendor: true}, {role: "teacher", isVendor: true}, {isVendor: true},
    {role: "vendor", isVendor: false}, {role: "vendor", isVendor: "true"},
    {role: "vendor", userRole: "admin"}, {role: "vendor", isSuspended: true},
    {role: "vendor", isSuspended: "false"}, {role: "vendor", suspended: true},
  ];
  for (const capability of Object.keys(VENDOR_CAPABILITY_ROLES) as VendorCapability[]) {
    for (const customClaims of variants) {
      await assert.rejects(assertCurrentVendorIdentity(request(), {
        getUser: async () => user(customClaims),
      }, capability), rejected("FORBIDDEN"));
    }
    await assert.rejects(assertCurrentVendorIdentity(request(), {
      getUser: async () => user({role: "vendor", isVendor: true}, true),
    }, capability), rejected("FORBIDDEN"));
  }
});

test("token context cannot bypass Vendor checks with spoofed or missing authority", async () => {
  let lookups = 0;
  const dependencies = {getUser: async () => {
    lookups++; return user({role: "vendor"});
  }};
  for (const overrides of [{role: "admin", isVendor: true}, {isVendor: false}, {isSuspended: true}]) {
    await assert.rejects(assertCurrentVendorIdentity(
      request(overrides), dependencies, "vendor.institutes.read",
    ), rejected("FORBIDDEN"));
  }
  await assert.rejects(assertCurrentVendorIdentity(
    {context: {requestId: "missing"}} as MiddlewareRequest, dependencies, "vendor.audit.read",
  ), rejected("UNAUTHORIZED"));
  await assert.rejects(assertCurrentVendorIdentity(
    request(), dependencies, "admin.students.manage" as VendorCapability,
  ), rejected("FORBIDDEN"));
  assert.equal(lookups, 0);
});

test("missing Auth identity is unauthorized and lookup outage never falls back", async () => {
  await assert.rejects(assertCurrentVendorIdentity(request(), {
    getUser: async () => {
      throw Object.assign(new Error("not found"), {code: "auth/user-not-found"});
    },
  }, "vendor.support.manage"), rejected("UNAUTHORIZED"));
  const outage = new Error("Auth lookup unavailable");
  await assert.rejects(assertCurrentVendorIdentity(request(), {
    getUser: async () => {
      throw outage;
    },
  }, "vendor.licenses.manage"), (error) => error === outage);
});

test("Vendor contradictions cannot pass authentication or the domain guard", async () => {
  for (const claims of [
    {role: "vendor", isVendor: false}, {role: "vendor", userRole: "admin"}, {role: "vendor", isVendor: "true"},
  ]) {
    const req = createMockRequest({headers: {authorization: "Bearer verified"}}) as unknown as MiddlewareRequest;
    req.context = {requestId: "token-contradiction"};
    const decoded = {uid: identity.uid, licenseLayer: "L0", ...claims};
    await assert.rejects(async () => createAuthenticationMiddleware({
      verifyIdToken: async () => decoded as never,
    })(req, createMockResponse() as never, async () => {
      throw new Error("Contradictory authority cannot reach downstream services");
    }), rejected("FORBIDDEN"));
    req.context.identity = buildIdentityContext(decoded as never);
    assert.equal(req.context.identity?.isVendor, false);
    await assert.rejects(assertCurrentVendorIdentity(req, {
      getUser: async () => user({role: "vendor"}),
    }, "vendor.calibration.manage"), rejected("FORBIDDEN"));
  }
  assert.equal(hasConsistentVendorClaims({
    role: "vendor", isVendor: true, userRole: "vendor", isSuspended: false,
  }), true);
});

test("non-Vendor tokens cannot gain global bypass through a retained true marker", async () => {
  const req = createMockRequest({headers: {authorization: "Bearer verified"}}) as unknown as MiddlewareRequest;
  req.context = {requestId: "non-vendor-marker"};
  await assert.rejects(async () => createAuthenticationMiddleware({
    verifyIdToken: async () => ({uid: identity.uid, licenseLayer: "L0", role: "admin", isVendor: true}) as never,
  })(req, createMockResponse() as never, async () => {
    throw new Error("Contradictory authority must not reach downstream services");
  }), rejected("FORBIDDEN"));
});
