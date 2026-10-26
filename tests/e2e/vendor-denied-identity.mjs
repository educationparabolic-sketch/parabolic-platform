import assert from "node:assert/strict";

// Valid current non-Vendor authority lets denial probes reach role admission.
// Callers remove the owned fixture before asserting business directory counts.
export async function seedVendorDeniedIdentity(auth, db, user, role) {
  assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.ok(["admin", "director", "teacher", "student"].includes(role));
  const instituteId = `vendor_denied_${user.uid}`;
  const root = db.doc(`institutes/${instituteId}`);
  const featureFlags = {adaptivePhase: false, controlledMode: false,
    governanceAccess: false, hardMode: false, riskOverview: false};
  const claims = {role, isVendor: false, isSuspended: false, instituteId,
    ...(role === "student" ? {studentId: user.uid} : {}),
    authorizationVersion: 1, licenseLayer: "L0", licenseVersion: "denied-v1",
    licenseState: "active", expiryDate: "2099-01-01T00:00:00.000Z",
    gracePeriodEndsAt: null, featureFlags};
  await root.set({status: "active", authorizationVersion: 1,
    licenseVersion: claims.licenseVersion,
    settingsUsers: role === "student" ? {} : {[user.uid]: {role, status: "active"}}});
  await root.collection("license").doc("current").set({currentLayer: "L0",
    licenseVersion: claims.licenseVersion, licenseState: claims.licenseState,
    expiryDate: claims.expiryDate, gracePeriodEndsAt: null, featureFlags,
    activeStudentLimit: 100, concurrentSessionLimit: 20});
  if (role === "student") await root.collection("students").doc(user.uid)
    .set({studentId: user.uid, status: "active", deleted: false});
  await auth.setCustomUserClaims(user.uid, claims);
  return () => db.recursiveDelete(root);
}

// Delay actual requests by this actor to respect the existing server budget.
// Never reset rate documents, alter clocks or manufacture an API response.
export async function paceVendorExpensiveRequests(page, uid, limit, state = {sent: [], turn: Promise.resolve()}) {
  assert.ok(Number.isSafeInteger(limit) && limit > 0);
  const {sent} = state;
  await page.route("**/api/v1/vendor/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const costly = request.method() !== "GET" && /\/calibration\/(simulate|push)$/u.test(path) ||
      request.method() === "GET" && path === "/api/v1/vendor/intelligence/readiness";
    if (!costly) return route.continue();
    let actor;
    try {
      const token = request.headers().authorization?.replace(/^Bearer /u, "");
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      actor = claims.user_id ?? claims.sub;
    } catch { return route.continue(); }
    if (actor !== uid) return route.continue();
    const previous = state.turn;
    let release;
    state.turn = new Promise(resolve => {release = resolve;});
    await previous;
    try {
      while (sent.length && sent[0] <= Date.now() - 60_100) sent.shift();
      if (sent.length >= limit) await new Promise(resolve => setTimeout(resolve, sent[0] + 60_100 - Date.now()));
      while (sent.length && sent[0] <= Date.now() - 60_100) sent.shift();
      sent.push(Date.now());
    } finally {release();}
    return route.continue();
  });
  return state;
}
