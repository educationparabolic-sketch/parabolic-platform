import assert from "node:assert/strict";
import test from "node:test";
import {CustomClaimSynchronizationService} from
  "../services/customClaimSynchronization";
import {
  CustomClaimAuthority,
  CustomClaimSynchronizationError,
} from "../types/customClaimSynchronization";

const createHarness = (input: {
  authority?: CustomClaimAuthority;
  customClaims?: Record<string, unknown>;
  disabled?: boolean;
  returnedUid?: string;
}) => {
  const writes: Array<{claims: Record<string, unknown>; uid: string}> = [];
  const authority: CustomClaimAuthority = input.authority ?? {
    instituteId: "inst_claims",
    isSuspended: false,
    licenseLayer: "L2",
    licenseVersion: "license-v2",
    role: "teacher",
    source: "staff",
    studentId: null,
  };
  const service = new CustomClaimSynchronizationService({
    auth: {
      getUser: async (uid) => ({
        customClaims: input.customClaims,
        disabled: input.disabled ?? false,
        uid: input.returnedUid ?? uid,
      }),
      setCustomUserClaims: async (uid, claims) => {
        writes.push({claims, uid});
      },
    },
    authorityRepository: {
      resolveInstituteAuthority: async () => authority,
    },
  });

  return {service, writes};
};

test("synchronizer replaces managed claims from staff authority", async () => {
  const {service, writes} = createHarness({
    customClaims: {
      analyticsScope: "retained",
      instituteId: "stale-institute",
      isVendor: true,
      role: "vendor",
      tenantId: "legacy-institute",
      userRole: "legacy-role",
    },
  });

  const result = await service.synchronizeInstituteUserClaims({
    instituteId: "inst_claims",
    uid: "staff_1",
  });

  assert.equal(result.changed, true);
  assert.equal(result.authoritySource, "staff");
  assert.deepEqual(result.claims, {
    analyticsScope: "retained",
    instituteId: "inst_claims",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L2",
    licenseVersion: "license-v2",
    role: "teacher",
  });
  assert.deepEqual(writes, [{claims: result.claims, uid: "staff_1"}]);
});

test("synchronizer emits student identity and disabled suspension", async () => {
  const {service, writes} = createHarness({
    authority: {
      instituteId: "inst_claims",
      isSuspended: false,
      licenseLayer: "L1",
      licenseVersion: "license-v1",
      role: "student",
      source: "student",
      studentId: "student_1",
    },
    disabled: true,
  });

  const result = await service.synchronizeInstituteUserClaims({
    instituteId: "inst_claims",
    uid: "student_1",
  });

  assert.equal(result.claims.isSuspended, true);
  assert.equal(result.claims.studentId, "student_1");
  assert.equal(result.claims.role, "student");
  assert.equal(writes.length, 1);
});

test("synchronizer skips an identical claim projection", async () => {
  const customClaims = {
    instituteId: "inst_claims",
    isSuspended: false,
    isVendor: false,
    licenseLayer: "L2",
    licenseVersion: "license-v2",
    role: "teacher",
  };
  const {service, writes} = createHarness({customClaims});

  const result = await service.synchronizeInstituteUserClaims({
    instituteId: "inst_claims",
    uid: "staff_1",
  });

  assert.equal(result.changed, false);
  assert.deepEqual(writes, []);
});

test("synchronizer rejects a mismatched Auth user", async () => {
  const {service, writes} = createHarness({returnedUid: "other_user"});

  await assert.rejects(
    service.synchronizeInstituteUserClaims({
      instituteId: "inst_claims",
      uid: "staff_1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof CustomClaimSynchronizationError);
      assert.equal(error.code, "INVALID_AUTHORITY");
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

test("synchronizer rejects authority from another institute", async () => {
  const {service, writes} = createHarness({
    authority: {
      instituteId: "other_institute",
      isSuspended: false,
      licenseLayer: "L3",
      licenseVersion: "license-v3",
      role: "admin",
      source: "staff",
      studentId: null,
    },
  });

  await assert.rejects(
    service.synchronizeInstituteUserClaims({
      instituteId: "inst_claims",
      uid: "staff_1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof CustomClaimSynchronizationError);
      assert.equal(error.code, "INVALID_AUTHORITY");
      return true;
    },
  );
  assert.deepEqual(writes, []);
});

test("managed-claim clearing retains only external claims", async () => {
  const {service, writes} = createHarness({
    customClaims: {
      externalEntitlement: "retained",
      instituteId: "inst_claims",
      isSuspended: true,
      isVendor: false,
      licenseLayer: "L2",
      licenseVersion: "license-v2",
      role: "teacher",
      tenantId: "legacy",
      userRole: "legacy",
    },
  });

  const result = await service.clearManagedUserClaims("staff_1");

  assert.equal(result.changed, true);
  assert.deepEqual(result.claims, {externalEntitlement: "retained"});
  assert.deepEqual(writes, [{
    claims: {externalEntitlement: "retained"},
    uid: "staff_1",
  }]);
});
