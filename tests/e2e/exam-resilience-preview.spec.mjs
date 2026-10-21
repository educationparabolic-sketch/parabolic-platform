import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {test, expect} from "playwright/test";

const out = "test-results/bwm046-public";
let release, fixture, portal, exam;
test.use({bypassCSP: false, trace: "off", screenshot: "off", video: "off"});
test.setTimeout(180000);
test.beforeAll(() => {
  assert.equal(process.env.BWM046_APPROVED_STAGING, "parabolic-dev");
  release = JSON.parse(readFileSync(`${out}/preview-candidate.json`, "utf8"));
  fixture = JSON.parse(readFileSync(`${out}/fixture.private.json`, "utf8"));
  assert.ok(release.deploymentAuthorized && release.backendCompatibilityVerified && !release.reviewOnly);
  ({portalOrigin: portal, examOrigin: exam} = release);
  for (const [origin, site] of [[portal, "parabolic-dev"], [exam, "parabolic-dev-40ec9"]]) {
    const url = new URL(origin);
    assert.equal(origin, url.origin); assert.equal(url.protocol, "https:");
    assert.match(url.hostname, new RegExp(`^${site}--bwm046-resilience-[0-9]{8}-[a-z0-9-]+\\.web\\.app$`));
  }
  assert.equal(fixture.project, "parabolic-dev");
  assert.ok(fixture.instituteId.startsWith("bwm046-public-") && fixture.uid.startsWith("bwm046-student-"));
});

function headers(response, camera = false) {
  const h = response.headers();
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("script-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  if (camera) {
    expect(h["permissions-policy"]).toContain("camera=(self)");
    expect(h["permissions-policy"]).toContain("microphone=()");
  }
}

test("approved resilience preview serves exact assets and rejects query credentials before authentication", async ({page, request}) => {
  for (const f of release.files) {
    const isPortal = f.path.startsWith("portal/");
    assert.ok(isPortal || f.path.startsWith("exam/"));
    const response = await request.get(`${isPortal ? portal : exam}${f.path.slice(isPortal ? 6 : 4)}`);
    expect(response.status()).toBe(200);
    expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(f.sha256);
  }
  let protectedCalls = 0;
  page.on("request", request => {if (/identitytoolkit|\/entry$/u.test(request.url())) protectedCalls++;});
  const response = await page.goto(`${exam}/session/invalid?token=dev&faceGaze=off`);
  expect(response.status()).toBe(200); headers(response, true);
  await expect(page.getByRole("heading", {name: "Session Access Blocked", exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  expect(protectedCalls).toBe(0);
  const returned = page.waitForResponse(r => r.request().isNavigationRequest() && r.url() === `${portal}/student/my-tests`);
  await page.getByRole("button", {name: "Go to Student Portal", exact: true}).click();
  const back = await returned; expect(back.status()).toBe(200); headers(back);
  expect(back.request().headers().referer ?? "").toBe("");
  expect(back.request().headers().authorization).toBeUndefined();
  await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
  writeFileSync(`${out}/public-assets-headers.json`, JSON.stringify({project: "parabolic-dev",
    releaseId: release.releaseId, matchedAssets: release.files.length, cspBypass: false,
    queryRejectedBeforeAuth: true, freshReturnUnauthenticated: true}, null, 2));
});

async function recoveryRecord(page, id) {
  return page.evaluate(async sessionId => {
    const db = await new Promise((resolve, reject) => {const r = indexedDB.open("parabolic-exam-runtime", 1);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);});
    try {return await new Promise((resolve, reject) => {const r = db.transaction("sessionRecovery", "readonly").objectStore("sessionRecovery").get(sessionId);
      r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error);});}
    finally {db.close();}
  }, id);
}

test("approved resilience preview recovers offline drafts and one canonical result through real HTTPS", async ({page, context}) => {
  let observed;
  await context.exposeBinding("__observeResilienceLaunch", (_source, value) => {observed = value;});
  await context.addInitScript(() => {
    const native = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await native(...args);
      if (new URL(response.url).pathname === "/api/v1/exam/start" && response.ok) {
        const {data} = await response.clone().json(); const url = new URL(data.examUrl);
        await window.__observeResilienceLaunch({sessionId: data.sessionId, origin: url.origin,
          fragmentOnly: url.hash === `#launch=${encodeURIComponent(data.launchCredential)}`, search: url.search});
      }
      return response;
    };
  });
  await page.goto(`${portal}/student/my-tests`);
  await page.getByLabel("Email", {exact: true}).fill(fixture.email);
  await page.getByLabel("Password", {exact: true}).fill(fixture.password);
  const tests = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
  await page.getByRole("button", {name: "Login", exact: true}).click();
  expect((await tests).status()).toBe(200);
  const entered = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "launch");
  await page.getByRole("article").filter({has: page.getByRole("heading", {
    name: "BWM046 isolated resilience qualification", exact: true})}).getByRole("button", {name: /Start Test|Resume/u}).click();
  expect((await entered).status()).toBe(200);
  await expect.poll(() => Boolean(observed)).toBe(true);
  expect(observed.origin).toBe(exam); expect(observed.search).toBe(""); expect(observed.fragmentOnly).toBe(true);
  const document = await page.request.get(`${exam}/session/${observed.sessionId}`);
  expect(document.status()).toBe(200); headers(document, true);
  await page.getByRole("button", {name: "Check Internet"}).click();
  await page.getByRole("button", {name: "Continue to Instructions"}).click();
  const activated = page.waitForResponse(r => r.url().endsWith("/activate") && r.status() === 200);
  await page.getByLabel(/I have read and understood the instructions/u).click({noWaitAfter: true});
  const authority = (await (await activated).json()).data;
  await expect(page.getByText("BWM046 public resilience question", {exact: true})).toBeVisible();
  const saved = page.waitForResponse(r => r.url().endsWith("/answers") && r.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap).toEqual({});
  await context.setOffline(true);
  try {
    await page.getByRole("radio").nth(0).check();
    await expect.poll(async () => Object.values((await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap ?? {})
      .map(v => v.response.optionId)).toEqual(["A"]);
    await expect(page.getByRole("region", {name: "Answer recovery status"})).toContainText("Saved on this device");
  } finally {await context.setOffline(false);}
  const recover = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "recover");
  await page.reload();
  const recovered = await recover; expect(recovered.status()).toBe(200);
  const recoveredAuthority = (await recovered.json()).data.entry;
  expect(recoveredAuthority.startedAt).toBe(authority.startedAt);
  expect(recoveredAuthority.deadlineAt).toBe(authority.deadlineAt);
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap).toEqual({});
  await page.getByRole("button", {name: "Submit Test", exact: true}).click();
  await page.getByRole("dialog", {name: "Confirm exam submission"}).getByLabel(/I understand.*will remain unanswered/u).check();
  const submitted = page.waitForResponse(r => r.url().endsWith("/submit") && r.status() === 200);
  await page.getByRole("button", {name: "Confirm Final Submit", exact: true}).click();
  const receipt = (await (await submitted).json()).data;
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  const replay = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "reconcile");
  await page.reload();
  const terminal = (await (await replay).json()).data;
  expect(terminal.status).toBe("submitted");
  expect(terminal.submission).toEqual({...receipt, alreadySubmitted: true});
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.closed).toBe(true);
  const closedGeneration = (await recoveryRecord(page, observed.sessionId)).runtimeGeneration;
  const returned = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`) && r.status() === 200);
  await page.getByRole("button", {name: "Return to Student Portal", exact: true}).click();
  expect((await (await returned).json()).data.contractVersion).toBe(2);
  const dashboard = page.waitForResponse(r => r.url() === `${portal}/api/v1/student/dashboard` && r.status() === 200);
  await page.goto(`${portal}/student/dashboard`);
  const readiness = (await (await dashboard).json()).data.resultReadiness;
  expect(["unknown", "processing", "available"]).toContain(readiness.state);
  writeFileSync(`${out}/public-resilience-receipt.json`, JSON.stringify({project: "parabolic-dev",
    releaseId: release.releaseId, sessionId: observed.sessionId, canonicalReceipt: receipt,
    canonicalReload: true, offlineDraftRecovered: true, independentStudentReturn: true,
    authoritativeTimes: {startedAt: authority.startedAt, deadlineAt: authority.deadlineAt},
    closedGeneration,
    resultReadiness: readiness, cspBypass: false}, null, 2));
});
