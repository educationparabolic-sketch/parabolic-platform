import {createHmac, randomUUID, timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {initializeApp, deleteApp} = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js",
);
const {getAuth} = require(
  "../../functions/node_modules/firebase-admin/lib/auth/index.js",
);
const {getFirestore, Timestamp} = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js",
);
const {getStorage} = require(
  "../../functions/node_modules/firebase-admin/lib/storage/index.js",
);

const projectId = "demo-parabolic-test";
const instituteId = `bwm029_${randomUUID()}`;
const yearId = "2026-27";
const snapshotId = "2026_08";
const sourceTimestamp = "2026-09-23T05:30:00.000Z";
const accounts = [];
const identities = {};
let app;
let auth;
let bucket;
let db;
let edge;
let institute;

test.use({bypassCSP: true});
test.setTimeout(300_000);

async function account(label, claims) {
  const password = randomUUID();
  const email = `${label}-${randomUUID()}@example.test`;
  const user = await auth.createUser({email, password});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, {instituteId, ...claims});
  return {email, password, uid: user.uid};
}

async function token(request, identity) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const response = await request.post(
    `http://${host}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    {data: {
      email: identity.email,
      password: identity.password,
      returnSecureToken: true,
    }},
  );
  expect(response.status()).toBe(200);
  return (await response.json()).idToken;
}

async function api(
  request,
  bearer,
  path,
  {data, method = "GET", status = 200} = {},
) {
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    ...(data === undefined ? {} : {data}),
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
  });
  const envelope = await response.json();
  expect(response.status(), JSON.stringify(envelope)).toBe(status);
  expect(envelope.success).toBe(status < 400);
  expect(envelope.requestId).toBeTruthy();
  return status < 400 ? envelope.data : envelope.error;
}

async function login(page, identity, destination, heading) {
  await page.addInitScript((route) => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", route);
    }
  }, destination);
  await page.goto("/admin/index.html");
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login/i}).click();
  await expect(page.getByRole("heading", {name: heading})).toBeVisible({
    timeout: 60_000,
  });
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    CDN_BASE_URL: "http://127.0.0.1:9180",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
    REPORTS_BUCKET: `${projectId}-reports`,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({projectId}, instituteId);
  auth = getAuth(app);
  db = getFirestore(app);
  bucket = getStorage(app).bucket(`${projectId}-reports`);
  institute = db.doc(`institutes/${instituteId}`);
  await institute.set({profile: {instituteName: "BWM-029 proof"}, status: "active"});
  const year = institute.collection("academicYears").doc(yearId);
  await year.set({label: yearId, locked: false, status: "Active"});
  await institute.collection("license").doc("current").set({currentLayer: "L3"});
  await year.collection("governanceSnapshots").doc(snapshotId).set({
    academicYear: yearId,
    avgAccuracyPercent: 76,
    avgPhaseAdherence: 70,
    avgRawScorePercent: 64,
    calibrationVersionUsed: "cal-v4",
    createdAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
    disciplineMean: 71,
    disciplineTrend: -2,
    disciplineVariance: 8,
    easyNeglectPercent: 8,
    executionIntegrityScore: 77,
    generatedAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
    hardBiasPercent: 7,
    immutable: true,
    instituteId,
    month: "2026-08",
    overrideFrequency: 2,
    phaseCompliancePercent: 70,
    riskClusterDistribution: {
      driftProne: 18,
      impulsive: 9,
      overextended: 4,
      stable: 60,
      volatile: 9,
    },
    riskModelVersionUsed: "risk-v3",
    rushPatternPercent: 11,
    schemaVersion: 1,
    skipBurstPercent: 5,
    stabilityIndex: 78,
    templateVarianceMean: 5.5,
    templateVersionRangeUsed: "v2-v5",
    wrongStreakPercent: 2,
  });
  for (const [studentId, studentName, lastUpdated] of [
    ["student-critical", "Critical Candidate", Timestamp.fromDate(
      new Date(sourceTimestamp),
    )],
    ["student-no-source", "Missing Source Candidate", undefined],
  ]) {
    await institute.collection("students").doc(studentId).set({
      name: studentName,
      studentId,
    });
    await year.collection("studentYearMetrics").doc(studentId).set({
      avgAccuracyPercent: 48,
      avgRawScorePercent: 44,
      disciplineIndex: 35,
      guessRatePercent: 32,
      ...(lastUpdated ? {lastUpdated} : {}),
      rollingRiskCluster: "critical",
      studentId,
      studentName,
      testsAttempted: 3,
    });
  }
  const flags = {governanceAccess: true, riskOverview: true};
  identities.director = await account("director", {
    featureFlags: flags,
    licenseLayer: "L3",
    role: "director",
  });
  identities.teacher = await account("teacher", {
    featureFlags: {riskOverview: true},
    licenseLayer: "L1",
    role: "teacher",
  });
  identities.lowDirector = await account("low-director", {
    featureFlags: flags,
    licenseLayer: "L2",
    role: "director",
  });
  identities.noGovernance = await account("no-governance", {
    featureFlags: {riskOverview: true},
    licenseLayer: "L3",
    role: "director",
  });
  identities.noRisk = await account("no-risk", {
    featureFlags: {},
    licenseLayer: "L1",
    role: "teacher",
  });
  identities.suspended = await account("suspended", {
    featureFlags: flags,
    isSuspended: true,
    licenseLayer: "L3",
    role: "director",
  });
  identities.vendor = await account("vendor", {
    featureFlags: {},
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });

  edge = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, process.env.CDN_BASE_URL);
      const signature = url.searchParams.get("Signature") ?? "";
      url.searchParams.delete("Signature");
      const expected = createHmac(
        "sha1",
        Buffer.from(process.env.CDN_SIGNED_URL_KEY_VALUE, "base64url"),
      ).update(url.toString()).digest("base64url");
      const valid = request.method === "GET" &&
        url.pathname.startsWith(`/${instituteId}/reports/`) &&
        url.searchParams.get("KeyName") ===
          process.env.CDN_SIGNED_URL_KEY_NAME &&
        Number(url.searchParams.get("Expires")) > Date.now() / 1000 &&
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!valid) {
        response.writeHead(403).end();
        return;
      }
      const [bytes] = await bucket.file(
        decodeURIComponent(url.pathname.slice(1)),
      ).download();
      response.writeHead(200, {
        "Content-Disposition": "attachment; filename=governance-report.pdf",
        "Content-Type": "application/pdf",
      });
      response.end(bytes);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    edge.once("error", reject);
    edge.listen(9180, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  if (edge?.listening) {
    await new Promise((resolve) => edge.close(resolve));
  }
  if (!app) return;
  try {
    await bucket.deleteFiles({prefix: `${instituteId}/`});
    await db.recursiveDelete(institute);
    await auth.deleteUsers(accounts);
  } finally {
    await deleteApp(app);
  }
});

test("governance and interventions persist through no-mock Admin UI", async ({
  browser,
  page,
  request,
}) => {
  const external = [];
  page.on("request", (entry) => {
    if (/^https?:/u.test(entry.url()) &&
      new URL(entry.url()).hostname !== "127.0.0.1") {
      external.push(entry.url());
    }
  });
  const directorToken = await token(request, identities.director);
  const teacherToken = await token(request, identities.teacher);
  const lowDirectorToken = await token(request, identities.lowDirector);
  const noGovernanceToken = await token(request, identities.noGovernance);
  const noRiskToken = await token(request, identities.noRisk);
  const suspendedToken = await token(request, identities.suspended);
  const vendorToken = await token(request, identities.vendor);

  const denials = [
    [null, "/admin/governance/snapshots?yearId=2026-27", 401, "UNAUTHORIZED"],
    [lowDirectorToken, "/admin/governance/snapshots?yearId=2026-27", 403,
      "LICENSE_RESTRICTED"],
    [noGovernanceToken, "/admin/governance/snapshots?yearId=2026-27", 403,
      "FORBIDDEN"],
    [suspendedToken, "/admin/governance/snapshots?yearId=2026-27", 403,
      "FORBIDDEN"],
    [vendorToken, "/admin/governance/snapshots?yearId=2026-27", 400,
      "VALIDATION_ERROR"],
    [vendorToken, "/admin/interventions?yearId=2026-27", 403, "FORBIDDEN"],
    [noRiskToken, "/admin/interventions?yearId=2026-27", 403, "FORBIDDEN"],
  ];
  for (const [bearer, path, status, code] of denials) {
    expect((await api(request, bearer, path, {status})).code).toBe(code);
  }
  expect((await api(
    request,
    vendorToken,
    `/admin/governance/snapshots?yearId=${yearId}` +
      `&targetInstituteId=${instituteId}`,
  )).snapshots).toHaveLength(1);
  for (const [bearer, path] of [
    [directorToken, `/admin/governance/snapshots?yearId=${yearId}&limit=37`],
    [directorToken, `/admin/governance/reports?yearId=${yearId}&limit=51`],
    [teacherToken, `/admin/interventions?yearId=${yearId}&limit=51`],
  ]) {
    expect((await api(request, bearer, path, {status: 400})).code)
      .toBe("VALIDATION_ERROR");
  }

  await login(
    page,
    identities.director,
    "/admin/governance/reports",
    "Governance Report Sources",
  );
  await expect(page.getByText("2026_08", {exact: true})).toBeVisible();
  const generatedResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/governance/reports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", {name: "Generate PDF"}).click();
  const generatedHttp = await generatedResponse;
  expect(generatedHttp.status()).toBe(200);
  const generatedEnvelope = await generatedHttp.json();
  const generatedBody = generatedHttp.request().postDataJSON();
  expect(generatedBody.actorId).toBeUndefined();
  expect(generatedBody.actorRole).toBeUndefined();
  expect(generatedBody.instituteId).toBeUndefined();
  await expect(page.getByText("New immutable PDF is ready.")).toBeVisible();
  await expect(page.getByRole("button", {name: "Download PDF"}))
    .toBeVisible();

  const replay = await api(request, directorToken, "/admin/governance/reports", {
    data: generatedBody,
    method: "POST",
  });
  expect(replay.disposition).toBe("replayed");
  expect(replay.report.reportId).toBe(
    generatedEnvelope.data.report.reportId,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download PDF"}).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
  expect(bytes.length).toBe(generatedEnvelope.data.report.sizeBytes);
  const reportDocuments = await institute.collection("academicYears")
    .doc(yearId).collection("governanceReports").get();
  expect(reportDocuments.size).toBe(1);
  expect(reportDocuments.docs[0].get("source.snapshotId")).toBe(snapshotId);
  expect(reportDocuments.docs[0].get("immutable")).toBe(true);

  const teacherContext = await browser.newContext({bypassCSP: true});
  const teacherPage = await teacherContext.newPage();
  await login(
    teacherPage,
    identities.teacher,
    "/admin/insights/interventions",
    "Intervention Recommendations",
  );
  const candidateRow = teacherPage.getByRole("row").filter({
    hasText: "Critical Candidate",
  });
  const missingSourceRow = teacherPage.getByRole("row").filter({
    hasText: "Missing Source Candidate",
  });
  await expect(candidateRow.getByRole("button", {
    name: "Recommend remedial test",
  })).toBeEnabled();
  await expect(missingSourceRow.getByRole("button", {
    name: "Recommend remedial test",
  })).toBeDisabled();
  await expect(missingSourceRow).toContainText(
    "Source metrics timestamp unavailable.",
  );
  const createdResponse = teacherPage.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/interventions/recommendations") &&
      response.request().method() === "POST",
  );
  await candidateRow.getByRole("button", {
    name: "Recommend remedial test",
  }).click();
  const createdHttp = await createdResponse;
  expect(createdHttp.status()).toBe(200);
  const createdEnvelope = await createdHttp.json();
  const createdBody = createdHttp.request().postDataJSON();
  expect(createdBody.actorId).toBeUndefined();
  expect(createdBody.instituteId).toBeUndefined();
  await expect(teacherPage.getByText(
    "Advisory remedial test recommendation saved.",
  )).toBeVisible();
  const interventionId = createdEnvelope.data.recommendation.interventionId;
  expect((await api(
    request,
    teacherToken,
    "/admin/interventions/recommendations",
    {data: createdBody, method: "POST"},
  )).disposition).toBe("replayed");
  const timelineRow = teacherPage.getByRole("row").filter({
    hasText: "Critical Candidate",
  }).filter({hasText: "pending · rev 1"});
  await timelineRow.getByPlaceholder("Outcome notes").fill(
    "Improving after the advisory review.",
  );
  await timelineRow.getByRole("button", {name: "Save outcome"}).click();
  await expect(teacherPage.getByText(
    "Outcome saved and reconciled from the authoritative timeline.",
  )).toBeVisible();
  await expect(teacherPage.getByRole("row").filter({
    hasText: "Critical Candidate",
  }).filter({hasText: "improving · rev 2"})).toBeVisible();
  const action = await db.doc(
    `interventionRecommendations/${yearId}/institutes/${instituteId}/` +
      `actions/${interventionId}`,
  ).get();
  expect(action.get("revision")).toBe(2);
  expect(action.get("advisoryOnly")).toBe(true);
  const interventionCommands = await db.collection(
    `interventionRecommendations/${yearId}/institutes/${instituteId}/commands`,
  ).get();
  expect(interventionCommands.docs.every((document) =>
    document.get("actorId") === identities.teacher.uid,
  )).toBe(true);
  await teacherContext.close();

  const readOnlyContext = await browser.newContext({bypassCSP: true});
  const readOnlyPage = await readOnlyContext.newPage();
  await login(
    readOnlyPage,
    identities.director,
    "/admin/insights/interventions",
    "Intervention Recommendations",
  );
  await expect(readOnlyPage.getByText("Director access is read-only."))
    .toBeVisible();
  await expect(readOnlyPage.getByRole("button", {
    name: "Recommend remedial test",
  }).first()).toBeDisabled();
  await expect(readOnlyPage.getByRole("button", {name: "Save outcome"}))
    .toBeDisabled();
  await readOnlyContext.close();
  expect(external).toEqual([]);
});
