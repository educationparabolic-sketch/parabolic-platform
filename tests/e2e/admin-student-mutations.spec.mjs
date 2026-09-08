import {createHash, createHmac, randomUUID, timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {initializeApp, deleteApp} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {getAuth} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {getFirestore, Timestamp} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
const {getStorage} = require("../../functions/node_modules/firebase-admin/lib/storage/index.js");
const projectId = "demo-parabolic-test";
const instituteId = `bwm026_${randomUUID()}`;
const yearId = "2026-27";
const accounts = [];
let app, db, auth, institute, bucket, edge;
const students = {};
const identities = {};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
test.use({bypassCSP: true});
test.setTimeout(300_000);

async function account(label, claims, uid) {
  const password = randomUUID();
  const email = `${label}-${randomUUID()}@example.test`;
  const user = await auth.createUser({email, password, ...(uid ? {uid} : {})});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, claims);
  return {uid: user.uid, email, password};
}

async function token(request, identity) {
  const response = await request.post(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {data: {email: identity.email, password: identity.password, returnSecureToken: true}},
  );
  expect(response.status()).toBe(200);
  return (await response.json()).idToken;
}

async function api(request, bearer, path, body, method = "POST", status = 200) {
  const response = await request.fetch(`/api/v1/admin/students${path}`, {
    method,
    ...(body === undefined ? {} : {data: body}),
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
  });
  const envelope = await response.json();
  expect(response.status(), JSON.stringify(envelope)).toBe(status);
  expect(envelope.requestId).toBeTruthy();
  expect(Number.isNaN(Date.parse(envelope.timestamp))).toBe(false);
  expect(envelope.success).toBe(status < 400);
  return status < 400 ? envelope.data : envelope.error;
}

async function login(page, identity) {
  await page.addInitScript(() => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", "/admin/students/list");
    }
  });
  await page.goto("/admin/index.html");
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login/i}).click();
  await expect(page.locator("#admin-student-search")).toBeVisible({timeout: 60_000});
}

async function selectRow(page, id) {
  await page.locator("#admin-student-search").fill(id);
  return page.getByRole("row").filter({has: page.getByRole("cell", {name: id, exact: true})});
}

async function uiMutation(page, suffix, action) {
  const pending = page.waitForResponse((response) =>
    response.url().endsWith(suffix) && response.request().method() !== "GET",
  );
  await action();
  const response = await pending;
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return {body: response.request().postDataJSON(), result: payload.data};
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    PROJECT_ID: projectId,
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    CDN_BASE_URL: "http://127.0.0.1:9180",
    REPORTS_BUCKET: `${projectId}-reports`,
  })) expect(process.env[key], key).toBe(expected);
  app = initializeApp({projectId}, instituteId);
  db = getFirestore(app);
  auth = getAuth(app);
  bucket = getStorage(app).bucket(`${projectId}-reports`);
  institute = db.doc(`institutes/${instituteId}`);
  await institute.set({
    profile: {instituteName: "Student mutation proof"},
    status: "active",
  });
  await institute.collection("academicYears").doc(yearId).set({label: yearId, status: "Active", locked: false});
  await institute.collection("license").doc("current").set({currentLayer: "L0"});
  for (const [label, claims] of Object.entries({
    admin: {role: "admin", licenseLayer: "L0"},
    teacher: {role: "teacher", licenseLayer: "L3"},
    director: {role: "director", licenseLayer: "L3"},
    vendor: {role: "vendor", licenseLayer: "L3", isVendor: true},
    suspended: {role: "admin", licenseLayer: "L3", isSuspended: true},
    missingLicense: {role: "admin"},
    other: {role: "admin", licenseLayer: "L3", instituteId: `${instituteId}_other`},
  })) identities[label] = await account(label, {instituteId, ...claims});
  for (const label of ["profile", "invited", "delete", "historical", "concurrent"]) {
    const id = `${instituteId}_${label}`;
    const identity = await account(label, {instituteId, licenseLayer: "L0", role: "student", studentId: id}, id);
    students[label] = identity;
    await institute.collection("students").doc(id).set({
      studentId: id, fullName: `Proof ${label}`, name: `Proof ${label}`,
      email: identity.email, batch: "Original", batchId: "Original", batchName: "Original",
      status: label === "invited" ? "invited" : "active", version: 1,
      identityPhotoCapturedAt: Timestamp.now(),
      identityPhotoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    });
  }
  // A retained session in an older year must block deletion even when current-year metrics are zero.
  await institute.collection("academicYears").doc("2025-26").collection("runs")
    .doc("retained").collection("sessions").doc("retained").set({studentId: students.historical.uid, status: "created"});

  // Local delivery boundary, not a response stub: validate the real URL signature
  // and read the exact bytes uploaded by the production Function to Storage.
  // This does not qualify a deployed CDN (L5).
  edge = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, process.env.CDN_BASE_URL);
      const signature = url.searchParams.get("Signature") ?? "";
      url.searchParams.delete("Signature");
      const expected = createHmac("sha1", Buffer.from(process.env.CDN_SIGNED_URL_KEY_VALUE, "base64url"))
        .update(url.toString()).digest("base64url");
      if (req.method !== "GET" || !url.pathname.startsWith(`/${instituteId}/reports/`) ||
        url.searchParams.get("KeyName") !== process.env.CDN_SIGNED_URL_KEY_NAME ||
        Number(url.searchParams.get("Expires")) <= Date.now() / 1000 ||
        signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        res.writeHead(403).end();
        return;
      }
      const [bytes] = await bucket.file(decodeURIComponent(url.pathname.slice(1))).download();
      res.writeHead(200, {"Content-Type": "text/csv", "Content-Disposition": "attachment; filename=student-export.csv"});
      res.end(bytes);
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {edge.once("error", reject); edge.listen(9180, "127.0.0.1", resolve);});
});

test.afterAll(async () => {
  if (edge?.listening) await new Promise((resolve) => edge.close(resolve));
  if (!app) return;
  try {
    const jobs = await db.collection("emailQueue").where("instituteId", "==", instituteId).get();
    await Promise.all(jobs.docs.map((doc) => doc.ref.delete()));
    await bucket.deleteFiles({prefix: `${instituteId}/`});
    // Student onWrite metering can finish just after the first delete. Delete
    // the namespace once more after those local trigger writes have settled.
    await db.recursiveDelete(institute);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await db.recursiveDelete(institute);
    // Bulk creates identities whose UID is supplied by this namespace too.
    const bulkId = `${instituteId}_bulk`;
    const deletion = await auth.deleteUsers([...new Set([...accounts, bulkId])]);
    expect(deletion.failureCount).toBe(0);
    expect((await institute.listCollections()).length).toBe(0);
    expect((await bucket.getFiles({prefix: `${instituteId}/`}))[0]).toHaveLength(0);
    expect((await db.collection("emailQueue").where("instituteId", "==", instituteId).get()).empty).toBe(true);
  } finally {await deleteApp(app);}
});

test("Student mutations persist, replay, enforce boundaries, download, and survive browser reload", async ({page, request, browser}) => {
  const external = [];
  page.on("request", (req) => {
    if (/^https?:/.test(req.url()) && new URL(req.url()).hostname !== "127.0.0.1") external.push(req.url());
  });
  const bearer = await token(request, identities.admin);
  const id = students.profile.uid;
  const profileBody = {email: students.profile.email, fullName: "Denied", expectedVersion: 1, idempotencyKey: "denied"};
  const cases = [
    [`/${id}/profile`, profileBody, "PATCH"],
    ["/batch-assignment", {students: [{studentId: id, expectedVersion: 1}], targetBatch: "Denied", idempotencyKey: "denied"}],
    [`/${id}/lifecycle`, {status: "inactive", reason: "Denied", expectedVersion: 1, idempotencyKey: "denied"}],
    [`/${id}/photo-review`, {decision: "verified", expectedPhotoCapturedAt: new Date().toISOString(), expectedVersion: 1, idempotencyKey: "denied"}],
    [`/${id}/data-export`, {includeAiSummaries: false, idempotencyKey: "denied"}],
    [`/${id}/soft-delete`, {reason: "Denied", expectedVersion: 1, idempotencyKey: "denied"}],
    ["/onboarding-resend", {studentId: students.invited.uid, idempotencyKey: "denied"}],
    ["/bulk", {students: [], commit: true, deactivateMissing: false, idempotencyKey: "denied"}],
  ];
  for (const [label, status, code] of [
    [null, 401, "UNAUTHORIZED"], ["teacher", 403, "FORBIDDEN"], ["director", 403, "FORBIDDEN"],
    ["vendor", 403, "FORBIDDEN"], ["suspended", 403, "FORBIDDEN"], ["missingLicense", 401, "UNAUTHORIZED"],
  ]) {
    const deniedToken = label ? await token(request, identities[label]) : null;
    for (const [path, body, method] of cases) expect((await api(request, deniedToken, path, body, method, status)).code).toBe(code);
  }
  const other = await token(request, identities.other);
  expect((await api(request, other, `/${id}/profile`, profileBody, "PATCH", 404)).code).toBe("NOT_FOUND");
  expect((await institute.collection("auditLogs").get()).size).toBe(0);

  await login(page, identities.admin);
  let row = await selectRow(page, id);
  await row.getByRole("button", {name: "Edit", exact: true}).click();
  await expect(page.locator("#admin-edit-student-batch")).toBeDisabled();
  const newEmail = `edited-${randomUUID()}@example.test`;
  await page.locator("#admin-edit-student-name").fill("Edited Student");
  await page.locator("#admin-edit-student-email").fill(newEmail);
  const profile = await uiMutation(page, "/profile", () => page.getByRole("button", {name: "Save Details"}).click());
  await expect(row).toContainText(newEmail);
  expect((await auth.getUser(id)).email).toBe(newEmail);
  expect(profile.result.auth.refreshTokensRevoked).toBe(true);
  const replay = await api(request, bearer, `/${id}/profile`, profile.body, "PATCH");
  expect(replay.auditId).toBe(profile.result.auditId);
  expect(replay.disposition).toBe("replayed");

  await page.getByRole("checkbox", {name: `Select ${id}`, exact: true}).check();
  await page.locator("#admin-student-target-batch").fill("Moved Batch");
  const batch = await uiMutation(page, "/batch-assignment", () => page.getByRole("button", {name: "Assign Batch", exact: true}).click());
  await expect(row).toContainText("Moved Batch");
  expect((await api(request, bearer, "/batch-assignment", batch.body)).auditId).toBe(batch.result.auditId);

  for (const [button, status] of [["Set inactive", "inactive"], ["Activate", "active"], ["Suspend", "suspended"], ["Reinstate", "active"]]) {
    const mutation = await uiMutation(page, "/lifecycle", () => row.getByRole("button", {name: button, exact: true}).click());
    await expect(row.locator(".admin-student-status")).toHaveText(status);
    const identity = await auth.getUser(id);
    expect(identity.disabled).toBe(status === "inactive");
    if (status === "inactive") expect(identity.customClaims.role).toBeUndefined();
    else expect(identity.customClaims.isSuspended).toBe(status === "suspended");
    expect((await api(request, bearer, `/${id}/lifecycle`, mutation.body)).auditId).toBe(mutation.result.auditId);
  }
  for (const button of ["Verify photo", "Mark unverified"]) {
    const photo = await uiMutation(page, "/photo-review", () => row.getByRole("button", {name: button, exact: true}).click());
    await expect(row.getByRole("button", {name: button === "Verify photo" ? "Mark unverified" : "Verify photo", exact: true})).toBeVisible();
    expect((await api(request, bearer, `/${id}/photo-review`, photo.body)).auditId).toBe(photo.result.auditId);
  }
  await page.goto("/admin/index.html");
  row = await selectRow(page, id);
  await expect(row).toContainText(newEmail);
  await expect(row).toContainText("Moved Batch");

  // Real offline failure keeps the draft and retry key; no request is intercepted.
  await row.getByRole("button", {name: "Edit", exact: true}).click();
  await page.locator("#admin-edit-student-name").fill("Retried Student");
  await page.context().setOffline(true);
  await page.getByRole("button", {name: "Save Details"}).click();
  await expect(page.getByText(/Student profile update failed/)).toBeVisible({timeout: 30_000});
  await page.context().setOffline(false);
  await uiMutation(page, "/profile", () => page.getByRole("button", {name: "Save Details"}).click());
  await expect(row).toContainText("Retried Student");

  const concurrentId = students.concurrent.uid;
  const writes = ["One", "Two"].map((fullName) => request.patch(`/api/v1/admin/students/${concurrentId}/profile`, {
    headers: {Authorization: `Bearer ${bearer}`},
    data: {email: students.concurrent.email, fullName, expectedVersion: 1, idempotencyKey: `race-${fullName}`},
  }));
  expect((await Promise.all(writes)).map((response) => response.status()).sort()).toEqual([200, 409]);
  expect((await institute.collection("students").doc(concurrentId).get()).data().version).toBe(2);

  row = await selectRow(page, students.invited.uid);
  const resend = await uiMutation(page, "/onboarding-resend", () => row.getByRole("button", {name: "Resend onboarding"}).click());
  expect((await api(request, bearer, "/onboarding-resend", resend.body)).auditId).toBe(resend.result.auditId);

  row = await selectRow(page, id);
  const downloadPromise = page.waitForEvent("download");
  const exported = await uiMutation(page, "/data-export", () => row.getByRole("button", {name: "Export data"}).click());
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const bytes = await readFile(await download.path());
  expect(sha256(bytes)).toBe(exported.result.exportHash);
  expect(bytes.toString()).toContain("Retried Student");
  expect((await api(request, bearer, `/${id}/data-export`, exported.body)).downloadUrl).toBe(exported.result.downloadUrl);
  const tampered = new URL(exported.result.downloadUrl);
  tampered.searchParams.set("Signature", "tampered");
  expect((await request.get(tampered.toString())).status()).toBe(403);

  row = await selectRow(page, students.historical.uid);
  page.once("dialog", (dialog) => dialog.accept());
  const deniedDeletion = page.waitForResponse((response) => response.url().endsWith("/soft-delete"));
  await row.getByRole("button", {name: "Soft delete"}).click();
  expect((await deniedDeletion).status()).toBe(409);
  await expect(page.getByText(/Student deletion failed/)).toBeVisible();
  row = await selectRow(page, students.delete.uid);
  page.once("dialog", (dialog) => dialog.accept());
  const deleted = await uiMutation(page, "/soft-delete", () => row.getByRole("button", {name: "Soft delete"}).click());
  await expect(row).toHaveCount(0);
  expect((await api(request, bearer, `/${students.delete.uid}/soft-delete`, deleted.body)).auditId).toBe(deleted.result.auditId);
  expect((await auth.getUser(students.delete.uid)).customClaims.role).toBeUndefined();

  await page.getByRole("link", {name: /Bulk Upload/}).first().click();
  const bulkId = `${instituteId}_bulk`;
  await page.locator("input[type=file]").setInputFiles({
    name: "roster.csv", mimeType: "text/csv",
    buffer: Buffer.from(`StudentID,FullName,Email,Batch\n${bulkId},Bulk Student,bulk-${randomUUID()}@example.test,Bulk Batch\n`),
  });
  const validationResponse = page.waitForResponse((response) =>
    response.url().endsWith("/bulk") &&
    response.request().postDataJSON()?.commit === false,
  );
  await page.getByRole("button", {name: /Validate Upload/i}).click();
  expect((await validationResponse).status()).toBe(200);
  const bulk = await uiMutation(page, "/bulk", () => page.getByRole("button", {name: "Confirm and Create Accounts"}).click());
  expect(bulk.result.committed).toBe(true);
  expect((await api(request, bearer, "/bulk", bulk.body)).auditId).toBe(bulk.result.auditId);
  expect((await auth.getUser(bulkId)).customClaims.role).toBe("student");

  await page.getByRole("link", {name: "Academic Year Archive", exact: true}).click();
  for (const label of ["Archive status", "Archive date", "Cold data transition"]) {
    await expect(page.getByLabel(new RegExp(label, "i"))).toBeDisabled();
  }
  const teacherContext = await browser.newContext({baseURL: "http://127.0.0.1:5000", bypassCSP: true});
  try {
    const teacherPage = await teacherContext.newPage();
    await login(teacherPage, identities.teacher);
    const teacherRow = await selectRow(teacherPage, id);
    for (const label of ["Edit", "Suspend", "Verify photo", "Export data", "Soft delete"]) {
      await expect(teacherRow.getByRole("button", {name: label, exact: true})).toHaveCount(0);
    }
    await expect(teacherPage.getByRole("button", {name: "Assign Batch", exact: true})).toBeDisabled();
  } finally {await teacherContext.close();}
  const audits = await institute.collection("auditLogs").get();
  expect(new Set(audits.docs.map((doc) => doc.data().actionType))).toEqual(new Set([
    "UPDATE_STUDENT_PROFILE", "ASSIGN_STUDENT_BATCH", "UPDATE_STUDENT_LIFECYCLE", "REVIEW_STUDENT_PHOTO",
    "RESEND_STUDENT_ONBOARDING", "DATA_EXPORT", "SOFT_DELETE_STUDENT", "IMPORT_STUDENTS",
  ]));
  for (const doc of audits.docs) expect(doc.data().timestamp).toBeTruthy();
  expect(external).toEqual([]);
});
