/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const {randomUUID} = require("node:crypto");
const {Timestamp} = require("firebase-admin/firestore");
const projectId = "demo-parabolic-test";
const flags = {adaptivePhase: false, controlledMode: false, governanceAccess: false, hardMode: false, riskOverview: false};
const claims = (instituteId, role, uid) => ({role, instituteId, authorizationVersion: 1,
  licenseLayer: "L3", licenseVersion: "security-v1", licenseState: "active", featureFlags: flags,
  expiryDate: "2099-01-01T00:00:00.000Z", gracePeriodEndsAt: null, ...(role === "student" ? {studentId: uid} : {})});
async function seedInstitute(db, id) {
  const ref = db.doc(`institutes/${id}`);
  await ref.create({status: "active", authorizationVersion: 1, licenseVersion: "security-v1", settingsRevision: 0,
    settingsUsers: {}, profile: {academicYearFormat: "YYYY-YY", contactEmail: "synthetic@example.invalid",
      contactPhone: "0000000000", defaultExamType: "Synthetic", instituteName: id, logoReference: "none", timeZone: "Asia/Kolkata"},
    securitySettings: {allowMultipleAdminSessions: true, forceLogoutOnPasswordChange: true, sessionTimeoutDuration: 30}});
  await ref.collection("license").doc("current").create({currentLayer: "L3", licenseVersion: "security-v1", licenseState: "active",
    featureFlags: flags, expiryDate: "2099-01-01T00:00:00.000Z", gracePeriodEndsAt: null, activeStudentLimit: 1000, concurrentSessionLimit: 100});
  await ref.collection("academicYears").doc("year").create({status: "active", academicYearLabel: "Synthetic year", runCount: 0, studentCount: 2});
  await ref.collection("students").doc("shared_resource").create({status: "active", fullName: `${id} shared student`, email: "shared@example.invalid", version: 1});
}
async function account(auth, db, id, role, instituteId) {
  const uid = id; const email = `${id}@security.emulator.test`; const password = randomUUID();
  await auth.createUser({uid, email, password});
  const current = role === "vendor" ? {role, licenseLayer: "L0", isVendor: true} : claims(instituteId, role, uid);
  await auth.setCustomUserClaims(uid, current);
  if (["admin", "teacher", "director"].includes(role)) {
    const ref = db.doc(`institutes/${instituteId}`);
    await ref.update({[`settingsUsers.${uid}`]: {role, status: "active", displayName: id, email, updatedAt: Timestamp.now()},
      ...(role === "admin" ? {primaryAdminUserId: uid} : {})});
  }
  if (role === "student") {
    await db.doc(`institutes/${instituteId}/students/${uid}`).create({status: "active", studentId: uid,
      fullName: `${id} Student`, email, version: 1, profilePreferences: {sidebarCollapsed: false}});
  }
  const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
    signal: AbortSignal.timeout(15000),
  });
  if (login.status !== 200) throw new Error("Synthetic login failed.");
  return {uid, email, password, claims: current, token: (await login.json()).idToken};
}
async function cleanup(auth, db, users, institutes) {
  for (const uid of users) {
    await auth.deleteUser(uid).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
  }
  for (const id of institutes) await db.recursiveDelete(db.doc(`institutes/${id}`));
}
async function currentRoleClaims(db, uid, role, instituteId) {
  const institute = db.doc(`institutes/${instituteId}`);
  if (!(await institute.get()).exists) await seedInstitute(db, instituteId);
  if (["admin", "teacher", "director"].includes(role)) {
    await institute.update({
      [`settingsUsers.${uid}`]: {role, status: "active"},
    });
  }
  if (role === "student") {
    await institute.collection("students").doc(uid).set({studentId: uid, status: "active", fullName: "Synthetic role negative"});
  }
  return claims(instituteId, role, uid);
}
module.exports = {projectId, flags, claims, seedInstitute, account, cleanup, currentRoleClaims};
