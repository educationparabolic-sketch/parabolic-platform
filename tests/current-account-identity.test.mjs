import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const {verifyCurrentAccountIdentity, currentIdentityClaims, hasCurrentStaffMembership} =
  require("../functions/lib/services/currentAccountIdentity.js");
const base = {role: "student", instituteId: "tenant_a", studentId: "uid_a", licenseLayer: "L0"};
function environment(tokenClaims = base, currentClaims = tokenClaims, extra = {}) {
  const calls = [], token = {uid: "uid_a", ...tokenClaims};
  return {calls, token, auth: {
    verifyIdToken: async (...args) => {calls.push(["verify", ...args]); return token;},
    getUser: async uid => {calls.push(["getUser", uid]); return {uid, disabled: false, customClaims: currentClaims, ...extra};},
  }};
}
test("fresh identities preserve the exact signed token and check revocation before current lookup", async () => {
  for (const role of ["student", "admin", "teacher", "director", "vendor", "service", "backend_service"]) {
    const env = environment({...base, role, ...(role === "vendor" ? {isVendor: true} : {})});
    assert.equal((await verifyCurrentAccountIdentity(env.auth, "synthetic-input")).token, env.token);
    assert.deepEqual(env.calls, [["verify", "synthetic-input", true], ["getUser", "uid_a"]]);
  }
});
for (const [label, claims] of Object.entries({
  demoted: {...base, role: "teacher"}, tenantChanged: {...base, instituteId: "tenant_b"},
  aliasConflict: {...base, tenantId: "tenant_b"}, roleConflict: {...base, userRole: "admin"},
  suspended: {...base, suspended: true}, missingClaims: {}, studentAlias: {...base, studentId: "other_student"},
})) test(`current ${label} denies instead of adopting newer privileges`, async () => {
  const env = environment(base, claims);
  await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"));
});
test("disabled, missing, substituted and unavailable Auth accounts fail closed", async () => {
  for (const extra of [{disabled: true}, {uid: "other_uid"}]) {
    const env = environment(base, base, extra);
    await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"));
  }
  for (const code of ["auth/user-not-found", "auth/internal-error"]) {
    const env = environment(); env.auth.getUser = async () => {throw Object.assign(new Error("synthetic"), {code});};
    await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"));
  }
});
test("signed malformed/contradictory aliases cannot initiate current lookups", async () => {
  for (const claims of [{...base, tenantId: "tenant_b"}, {...base, userRole: "admin"}, {...base, isVendor: true},
    {...base, uid: " uid_a "}, {...base, instituteId: "../tenant"}, {...base, studentId: "other_uid"},
    {...base, role: "vendor", isVendor: false}]) {
    const env = environment(claims);
    await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"));
    assert.equal(env.calls.length, 1);
  }
  assert.throws(() => currentIdentityClaims({...base, suspended: "false"}, "uid_a"));
});
test("staff membership requires an exact active own record, including prototype and malformed-map negatives", () => {
  assert.equal(hasCurrentStaffMembership({uid_a: {status: "active", role: "admin"}}, "uid_a", "admin"), true);
  for (const members of [undefined, null, [], {}, {uid_a: null}, {uid_a: {status: "suspended", role: "admin"}},
    {uid_a: {status: "active", role: "teacher"}}, Object.create({uid_a: {status: "active", role: "admin"}})]) {
    assert.equal(hasCurrentStaffMembership(members, "uid_a", "admin"), false);
  }
});

test("provider outages stay retryable server failures rather than revoked-user denials", async () => {
  for (const [code, expected] of [["auth/id-token-revoked", "UNAUTHORIZED"], ["auth/internal-error", "INTERNAL_ERROR"]]) {
    const env = environment();
    env.auth.verifyIdToken = async () => {throw Object.assign(new Error("synthetic"), {code});};
    await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"), error => error.code === expected);
    assert.equal(env.calls.length, 0);
  }
  const env = environment();
  env.auth.getUser = async () => {throw Object.assign(new Error("synthetic"), {code: "auth/internal-error"});};
  await assert.rejects(verifyCurrentAccountIdentity(env.auth, "synthetic"), error => error.code === "INTERNAL_ERROR");
});
