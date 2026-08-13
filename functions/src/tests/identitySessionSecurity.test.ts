import assert from "node:assert/strict";
import test from "node:test";
import {
  IdentitySessionSecurityService,
} from "../services/identitySessionSecurity";

test("synchronization completes before session revocation", async () => {
  const events: string[] = [];
  const service = new IdentitySessionSecurityService({
    clearManagedUserClaims: async () => ({changed: false}),
    revokeRefreshTokens: async (uid) => {
      events.push(`revoke:${uid}`);
    },
    synchronizeInstituteUserClaims: async ({instituteId, uid}) => {
      events.push(`sync:${instituteId}:${uid}`);
      return {changed: true};
    },
  });

  const result = await service.synchronizeClaimsAndRevokeSessions({
    instituteId: "inst_security",
    uid: "staff_security",
  });

  assert.deepEqual(events, [
    "sync:inst_security:staff_security",
    "revoke:staff_security",
  ]);
  assert.deepEqual(result, {
    claimsChanged: true,
    refreshTokensRevoked: true,
    uid: "staff_security",
    userMissing: false,
  });
});

test("privilege removal clears claims before session revocation", async () => {
  const events: string[] = [];
  const service = new IdentitySessionSecurityService({
    clearManagedUserClaims: async (uid) => {
      events.push(`clear:${uid}`);
      return {changed: true};
    },
    revokeRefreshTokens: async (uid) => {
      events.push(`revoke:${uid}`);
    },
    synchronizeInstituteUserClaims: async () => ({changed: false}),
  });

  await service.clearClaimsAndRevokeSessions("student_security");

  assert.deepEqual(events, [
    "clear:student_security",
    "revoke:student_security",
  ]);
});

test("missing Auth users are already session-safe", async () => {
  const missingUserError = Object.assign(new Error("missing"), {
    code: "auth/user-not-found",
  });
  const service = new IdentitySessionSecurityService({
    clearManagedUserClaims: async () => {
      throw missingUserError;
    },
    revokeRefreshTokens: async () => {
      throw missingUserError;
    },
    synchronizeInstituteUserClaims: async () => {
      throw missingUserError;
    },
  });

  const syncResult = await service.synchronizeClaimsAndRevokeSessions({
    instituteId: "inst_security",
    uid: "missing_security",
  });
  const clearResult = await service.clearClaimsAndRevokeSessions(
    "missing_security",
  );
  const revokeResult = await service.revokeSessions("missing_security");

  for (const result of [syncResult, clearResult, revokeResult]) {
    assert.equal(result.userMissing, true);
    assert.equal(result.refreshTokensRevoked, false);
    assert.equal(result.claimsChanged, null);
  }
});
