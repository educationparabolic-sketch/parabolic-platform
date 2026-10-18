import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {FieldValue} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {StudentSummaryAuthorityService, StudentSummaryReadScope} from "../services/studentSummaryAuthority";
import {StudentSummaryValidationError} from "../types/studentSummary";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const firestore = getFirestore();
const auth = getFirebaseAdminApp().auth();
const uid = "student-bwm043-authority";
const instituteId = "inst-bwm043-authority";
const institute = firestore.doc(`institutes/${instituteId}`);
const license = institute.collection("license").doc("current");
const student = institute.collection("students").doc(uid);
const years = institute.collection("academicYears");
const fixedNow = new Date("2026-10-17T10:00:00Z");
const expiryDate = "2099-01-01T00:00:00.000Z";
const flags = {adaptivePhase: true, controlledMode: true, governanceAccess: false, hardMode: true, riskOverview: true};
const claims = {role: "student", studentId: uid, instituteId, authorizationVersion: 1,
  licenseLayer: "L2", licenseVersion: "bwm043-v1", licenseState: "active",
  expiryDate, gracePeriodEndsAt: null, featureFlags: flags};
const service = new StudentSummaryAuthorityService({firestore, auth, now: () => fixedNow});
let token: string;
let password: string;
async function login(): Promise<string> {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
    "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({email: "bwm043-authority@emulator.test", password, returnSecureToken: true}),
  });
  assert.equal(response.status, 200);
  return ((await response.json()) as {idToken: string}).idToken;
}
async function seed(): Promise<void> {
  await firestore.recursiveDelete(institute);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
  }
  password = randomUUID();
  await auth.createUser({uid, email: "bwm043-authority@emulator.test", password});
  await auth.setCustomUserClaims(uid, claims);
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion: claims.licenseVersion});
  await license.set({currentLayer: "L2", licenseVersion: claims.licenseVersion, licenseState: "active",
    expiryDate, gracePeriodEndsAt: null, featureFlags: flags, activeStudentLimit: 50, concurrentSessionLimit: 10});
  await student.set({studentId: uid, status: "active", deleted: false});
  await years.doc("year-current-opaque").set({status: "Active"});
  await years.doc("year-past-opaque").set({status: "Archived"});
  token = await login();
}
const select = (resource = "dashboard") => ({resource});
const inspect = (scope: StudentSummaryReadScope) => ({kind: scope.kind,
  years: scope.kind === "current" ? [scope.yearId] : scope.yearIds,
  owner: scope.studentId, access: scope.access});
async function read(input: unknown = select()) {
  return service.withRead(token, input, async (_transaction, scope) => inspect(scope));
}
function rejected(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof StudentSummaryValidationError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /Bearer|bwm043-v1|gs:\/\/|password|2099/u);
    return true;
  };
}
test.beforeEach(seed);
test.after(async () => {
  await firestore.recursiveDelete(institute);
  await auth.deleteUser(uid);
  assert.equal((await years.get()).size, 0);
  await getFirebaseAdminApp().delete();
});

test("all five internal resources derive exact owner, opaque year and current metric grants", async () => {
  for (const resource of ["dashboard", "tests", "performance", "insights", "solutions"]) {
    const result = await read(select(resource));
    assert.equal(result.owner, uid);
    assert.deepEqual(result.years, ["year-current-opaque"]);
    assert.deepEqual(result.access.metrics, {basic: true, execution: true, insights: true,
      advanced: true, controlledComparison: true, hardTiming: true});
  }
});

test("selectors reject browser authority, wrong-resource history, null and malformed values before reads", async () => {
  for (const input of [null, [], {resource: ["dashboard"]}, {...select(), scope: null},
    {...select(), yearId: "year-past-opaque"}, {...select(), instituteId: "other"},
    {...select(), studentId: "other"}, {...select(), licenseLayer: "L3"},
    {...select(), scope: "history"}, {resource: "tests", scope: "history", yearId: "../other"},
    {resource: "tests", scope: "history", yearId: ["year-past-opaque"]}]) {
    await assert.rejects(read(input), rejected("VALIDATION_ERROR"));
  }
  await assert.rejects(service.withRead("invalid", select(), async () => true), rejected("UNAUTHORIZED"));
});

test("fresh Auth demotion, ownership changes, suspension and disabled users block old valid tokens", async () => {
  for (const update of [{role: "teacher"}, {studentId: "other"}, {instituteId: "other"},
    {tenantId: "other"}, {userRole: "teacher"}, {isVendor: true}, {isSuspended: true}, {suspended: true}]) {
    await auth.setCustomUserClaims(uid, {...claims, ...update});
    await assert.rejects(read(), rejected("FORBIDDEN"));
  }
  await auth.setCustomUserClaims(uid, claims);
  await auth.updateUser(uid, {disabled: true});
  await assert.rejects(read(), rejected("UNAUTHORIZED"));
});

test("token UID versus Student mismatch cannot select another Student even with valid current Auth", async () => {
  await auth.setCustomUserClaims(uid, {...claims, studentId: "other"});
  const bad = await login();
  await auth.setCustomUserClaims(uid, claims);
  await assert.rejects(service.withRead(bad, select(), async () => true), rejected("FORBIDDEN"));
});

test("revocation, missing current identity and current Auth infrastructure failure stay failures", async () => {
  // Auth revocation has whole-second precision; cross one second before revoking
  // so this real emulator-issued token is deterministically older than validSince.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await auth.revokeRefreshTokens(uid);
  await assert.rejects(read(), rejected("UNAUTHORIZED"));
  await auth.deleteUser(uid);
  await assert.rejects(read(), rejected("UNAUTHORIZED"));
  await auth.createUser({uid, email: "bwm043-authority@emulator.test", password});
  await auth.setCustomUserClaims(uid, claims);
  token = await login();
  const broken = new StudentSummaryAuthorityService({firestore, now: () => fixedNow, auth: {
    verifyIdToken: auth.verifyIdToken.bind(auth),
    getUser: async () => {
      throw new Error("dependency down");
    },
  }});
  await assert.rejects(broken.withRead(token, select(), async () => true), rejected("INTERNAL_ERROR"));
});

test("persisted institute suspension, archive and lock deny otherwise active claims", async () => {
  for (const status of ["suspended", "archived", "Locked"]) {
    await institute.update({status});
    await assert.rejects(read(), rejected("FORBIDDEN"));
  }
});

test("grace, expired and elapsed expiry deny rather than reducing server authority to L0", async () => {
  for (const update of [{licenseState: "grace", gracePeriodEndsAt: "2099-02-01T00:00:00Z"},
    {licenseState: "expired"}, {licenseState: "active", expiryDate: fixedNow.toISOString()}]) {
    await license.update(update);
    await assert.rejects(read(), rejected("LICENSE_RESTRICTED"));
  }
});

test("stale token or current Auth version, flags and deadlines cannot grant current reads", async () => {
  await institute.update({authorizationVersion: 2});
  await assert.rejects(read(), rejected("FORBIDDEN"));
  await institute.update({authorizationVersion: 1});
  for (const update of [{licenseVersion: "stale"}, {licenseLayer: "L3"},
    {featureFlags: {...flags, controlledMode: false}}, {featureFlags: {...flags, governanceAccess: "false"}},
    {expiryDate: null}, {expiryDate: undefined},
    {gracePeriodEndsAt: undefined}]) {
    const changed: Record<string, unknown> = {...claims, ...update};
    for (const key of Object.keys(changed)) {
      if (changed[key] === undefined) delete changed[key];
    }
    await auth.setCustomUserClaims(uid, changed);
    await assert.rejects(read(), rejected("FORBIDDEN"));
  }
  await auth.setCustomUserClaims(uid, {...claims, expiryDate: null});
  const stale = await login();
  await auth.setCustomUserClaims(uid, claims);
  await assert.rejects(service.withRead(stale, select(), async () => true), rejected("FORBIDDEN"));
});

test("malformed or incomplete persisted entitlement and Student aliases fail closed", async () => {
  for (const featureFlags of [{}, {...flags, riskOverview: "true"}]) {
    await license.update({featureFlags});
    await assert.rejects(read(), rejected("CONFLICT"));
  }
  await license.update({featureFlags: flags});
  for (const key of ["expiryDate", "gracePeriodEndsAt"]) {
    await license.update({[key]: FieldValue.delete()});
    await assert.rejects(read(), rejected("CONFLICT"));
    await license.update({[key]: key === "expiryDate" ? expiryDate : null});
  }
  for (const update of [{deleted: "false"}, {studentId: "other"}, {uid: "other"},
    {studentUid: "other"}, {instituteId: "other"}]) {
    await student.set({studentId: uid, status: "active", deleted: false, ...update});
    await assert.rejects(read(), rejected("CONFLICT"));
  }
  for (const update of [{status: "inactive"}, {deleted: true}]) {
    await student.set({studentId: uid, status: "active", deleted: false, ...update});
    await assert.rejects(read(), rejected("NOT_FOUND"));
  }
});

test("selected-priority ties, unknown year status and 26-year overflow reject current authority", async () => {
  await years.doc("second-active").set({status: "active"});
  await assert.rejects(read(), rejected("CONFLICT"));
  await years.doc("second-active").set({status: "started"});
  assert.deepEqual((await read()).years, ["year-current-opaque"]);
  await years.doc("second-active").update({status: "unexpected"});
  await assert.rejects(read(), rejected("CONFLICT"));
  await years.doc("second-active").delete();
  const batch = firestore.batch();
  for (let index = 0; index < 24; index++) batch.set(years.doc(`old-${index}`), {status: "archived"});
  await batch.commit();
  await assert.rejects(read(), rejected("CONFLICT"));
});

test("rollover and archived history use server year state; locked/missing years grant no raw access", async () => {
  await years.doc("year-current-opaque").update({status: "Archived"});
  await assert.rejects(read(), rejected("CONFLICT"));
  const history = await read({resource: "tests", scope: "history"});
  assert.equal(history.kind, "history");
  assert.deepEqual(history.years, ["year-past-opaque", "year-current-opaque"]);
  assert.deepEqual(history.access.metrics, {basic: true, execution: false, insights: false,
    advanced: false, controlledComparison: false, hardTiming: false});
  await years.doc("new-opaque").set({status: "Scheduled"});
  assert.deepEqual((await read()).years, ["new-opaque"]);
  await years.doc("year-past-opaque").update({status: "Locked"});
  for (const yearId of ["year-past-opaque", "new-opaque", "other-tenant-year"]) {
    await assert.rejects(read({resource: "tests", scope: "history", yearId}), rejected("NOT_FOUND"));
  }
  await service.withRead(token, {resource: "tests", scope: "history"}, async (_tx, scope) => {
    assert.throws(() => service.assertRunAllowed(scope, "Operational"), rejected("FORBIDDEN"));
    assert.ok(!("yearReference" in scope));
  });
});

test("current layer and feature flags govern metric groups, insights and every run mode", async () => {
  for (const layer of ["L0", "L1", "L2", "L3"]) {
    for (const enabled of [false, true]) {
      const featureFlags = {...flags, riskOverview: enabled, controlledMode: enabled,
        hardMode: enabled, adaptivePhase: enabled};
      await license.update({currentLayer: layer, featureFlags});
      await auth.setCustomUserClaims(uid, {...claims, licenseLayer: layer, featureFlags});
      token = await login();
      const advanced = layer === "L2" || layer === "L3";
      const result = await read();
      assert.equal(result.access.metrics.advanced, advanced);
      assert.equal(result.access.metrics.insights, layer !== "L0" && enabled);
      assert.equal(result.access.metrics.controlledComparison, advanced && enabled);
      assert.equal(result.access.metrics.hardTiming, advanced && enabled);
      if (layer === "L0" || !enabled) await assert.rejects(read(select("insights")), rejected("LICENSE_RESTRICTED"));
      else await read(select("insights"));
      await service.withRead(token, select("solutions"), async (_tx, scope) => {
        service.assertRunAllowed(scope, "Operational");
        for (const mode of ["Diagnostic", "Controlled", "Hard"]) {
          const allowed = mode === "Diagnostic" ? layer !== "L0" : advanced && enabled;
          if (allowed) service.assertRunAllowed(scope, mode);
          else assert.throws(() => service.assertRunAllowed(scope, mode), rejected("LICENSE_RESTRICTED"));
        }
        if (advanced && enabled) service.assertRunAllowed(scope, "Operational", true);
        else assert.throws(() => service.assertRunAllowed(scope, "Operational", true), rejected("LICENSE_RESTRICTED"));
        assert.throws(() => service.assertRunAllowed(scope, "Unknown"), rejected("CONFLICT"));
        assert.throws(() => service.assertRunAllowed(scope, "Operational", "true"), rejected("CONFLICT"));
      });
    }
  }
});

test("transaction retry rereads current Auth before reentering the protected callback", async () => {
  let attempts = 0;
  await assert.rejects(service.withRead(token, select(), async () => {
    attempts++;
    await auth.setCustomUserClaims(uid, {...claims, role: "teacher"});
    throw Object.assign(new Error("retry"), {code: 10});
  }), rejected("FORBIDDEN"));
  assert.equal(attempts, 1);
});
