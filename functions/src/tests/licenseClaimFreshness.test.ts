import assert from "node:assert/strict";
import test from "node:test";
import {LicenseClaimFreshnessService} from
  "../services/licenseClaimFreshness";

test(
  "license freshness synchronizes and revokes every authoritative identity",
  async () => {
    const userIds = Array.from({length: 27}, (_, index) => `user_${index}`);
    const calls: string[] = [];
    const service = new LicenseClaimFreshnessService({
      loadInstituteIdentitySnapshot: async () => ({
        licenseVersion: "license-v2",
        userIds,
      }),
      synchronizeClaimsAndRevokeSessions: async ({uid}) => {
        calls.push(uid);
        return {
          claimsChanged: uid !== "user_26",
          refreshTokensRevoked: uid !== "user_25",
          userMissing: uid === "user_25",
        };
      },
    });

    const result = await service.propagateInstituteLicenseChange({
      instituteId: "inst_freshness",
      licenseVersion: "license-v2",
    });

    assert.deepEqual(calls, userIds);
    assert.deepEqual(result, {
      claimsChanged: 26,
      instituteId: "inst_freshness",
      licenseVersion: "license-v2",
      refreshTokensRevoked: 26,
      superseded: false,
      userCount: 27,
      usersMissing: 1,
    });
  },
);

test("license freshness skips a superseded version before mutations", async () => {
  let mutationCalls = 0;
  const service = new LicenseClaimFreshnessService({
    loadInstituteIdentitySnapshot: async () => ({
      licenseVersion: "license-v3",
      userIds: ["user_1"],
    }),
    synchronizeClaimsAndRevokeSessions: async () => {
      mutationCalls += 1;
      return {
        claimsChanged: true,
        refreshTokensRevoked: true,
        userMissing: false,
      };
    },
  });

  const result = await service.propagateInstituteLicenseChange({
    instituteId: "inst_freshness",
    licenseVersion: "license-v2",
  });

  assert.equal(result.superseded, true);
  assert.equal(mutationCalls, 0);
});
