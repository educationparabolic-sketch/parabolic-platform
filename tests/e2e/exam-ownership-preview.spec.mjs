import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {expect, test} from "playwright/test";

let portal, exam, release;
const output = "test-results/bwm044-closeout";
test.use({trace: "off", screenshot: "off", video: "off", bypassCSP: false});
test.setTimeout(90000);
test.beforeAll(() => {
  assert.equal(process.env.BWM044_APPROVED_STAGING_PREVIEW, "parabolic-dev", "Explicit staging preview approval is required.");
  portal = process.env.BWM044_PORTAL_PREVIEW_ORIGIN;
  exam = process.env.BWM044_EXAM_PREVIEW_ORIGIN;
  for (const [value, site] of [[portal, "parabolic-dev"], [exam, "parabolic-dev-40ec9"]]) {
    const url = new URL(value); assert.equal(value, url.origin); assert.equal(url.protocol, "https:");
    assert.equal(url.port, "");
    assert.match(url.hostname, new RegExp(String.raw`^${site}--bwm044-returns-[0-9]{8}-[a-z0-9-]+\.web\.app$`));
  }
  assert.notEqual(portal, exam);
  release = JSON.parse(readFileSync(`${output}/preview-candidate.json`, "utf8"));
  assert.ok(release.previewOrigins && release.portalOrigin === portal && release.examOrigin === exam,
    "Artifacts must be rebuilt for the provider-returned preview origins.");
  mkdirSync(output, {recursive: true});
});
function headers(response) {
  const h = response.headers();
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("script-src 'self'");
}
async function reader(response) {
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.data.contractVersion).toBe(2); expect(body.data.scope.kind).toBe("current");
  expect(Array.isArray(body.data.page.items)).toBe(true);
  const h = response.request().headers();
  expect(h["x-parabolic-exam-owner"]).toBeUndefined(); expect(h["x-parabolic-exam-generation"]).toBeUndefined();
  const claims = JSON.parse(Buffer.from(h.authorization.slice(7).split(".")[1], "base64url").toString());
  expect(claims.aud).toBe("parabolic-dev"); expect(claims.role).toBe("student");
  expect(claims.sessionId === undefined && claims.launchNonce === undefined).toBe(true);
}
async function returnFromInvalid(page) {
  const doc = await page.goto(`${exam}/session/invalid?returnUrl=https://untrusted.invalid`);
  expect(doc.status()).toBe(200); headers(doc);
  await expect(page.getByRole("heading", {name: "Session Access Blocked", exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  const navigation = page.waitForResponse(r => r.request().isNavigationRequest() && r.url() === `${portal}/student/my-tests`);
  await page.getByRole("button", {name: "Go to Student Portal", exact: true}).click();
  const response = await navigation; expect(response.status()).toBe(200); headers(response);
  expect(await response.text()).toContain("/student/assets/");
  const h = response.request().headers();
  expect(h.authorization).toBeUndefined(); expect(h["x-parabolic-exam-owner"]).toBeUndefined();
  expect(h.referer ?? "").toBe("");
}
test("approved public Student deep links preserve HTML and security headers on refresh", async ({page, request}) => {
  for (const file of release.files) {
    const isPortal = file.path.startsWith("portal/");
    assert.ok(isPortal || file.path.startsWith("exam/"));
    const path = file.path.slice(isPortal ? "portal".length : "exam".length);
    const response = await request.get(`${isPortal ? portal : exam}${path}`);
    expect(response.status()).toBe(200);
    expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(file.sha256);
  }
  const paths = ["/student", "/student/", "/student/my-tests", "/student/login"];
  for (const path of paths) {
    const response = await request.get(`${portal}${path}`);
    expect(response.status(), path).toBe(200); headers(response);
    expect(await response.text()).toContain("/student/assets/");
  }
  await page.goto(`${portal}/student/my-tests`);
  await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
  const refreshed = await page.reload(); expect(refreshed.status()).toBe(200); headers(refreshed);
  writeFileSync(`${output}/preview-public-headers.json`, JSON.stringify({portal, exam, paths, refresh: "passed", releaseId: release.releaseId, hashedFiles: release.files.length, cspBypass: false}, null, 2) + "\n");
});
test("approved public Exam return retains independent existing Student authentication", async ({page}) => {
  let raw = readFileSync(process.env.BWM044_PREVIEW_CREDENTIAL_FILE, "utf8");
  let email, password;
  try {({email, password} = JSON.parse(raw));}
  catch {
    password = raw.match(/Temporary test password[^]*?`([^`]+)`/i)?.[1];
    email = [...raw.matchAll(/`([^`\s]+@[^`\s]+)`/g)].map(m => m[1]).find(v => v.startsWith("student."));
  }
  assert.ok(email && password, "Approved existing staging Student credentials are required.");
  try {
    await page.goto(`${portal}/student/my-tests`);
    try {
      await page.getByLabel("Email", {exact: true}).fill(email);
      await page.getByLabel("Password", {exact: true}).fill(password);
    } catch {
      throw new Error("Approved staging sign-in fields were unavailable.");
    }
    const read = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await reader(await read);
    await expect(page.getByRole("region", {name: "My Tests", exact: true}).getByRole("heading", {name: "My Tests", exact: true})).toBeVisible();
    const returnedRead = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
    await returnFromInvalid(page); await reader(await returnedRead);
    await expect(page).toHaveURL(`${portal}/student/my-tests`);
    await expect(page.getByRole("region", {name: "My Tests", exact: true}).getByRole("heading", {name: "My Tests", exact: true})).toBeVisible();
    writeFileSync(`${output}/preview-authenticated-return.json`, JSON.stringify({project: "parabolic-dev", portal, exam,
      authenticatedStudentReaderV2: true, absoluteReturn: true, credentialBridge: false, cspBypass: false,
      limitation: "Targeted Hosting qualification; no staging Exam/session/account mutation or deployed legacy migration proof."}, null, 2) + "\n");
  } finally {raw = null; email = null; password = null;}
});
test("approved public Exam return does not sign a fresh context into Student", async ({page}) => {
  await returnFromInvalid(page);
  await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
});
