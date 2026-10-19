import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {test, expect} from "playwright/test";
const out = "test-results/bwm045-public";
let release, fixture, portal, exam;
test.use({channel: "chromium", launchOptions: {args: ["--use-fake-device-for-media-stream"]}, bypassCSP: false, trace: "off", screenshot: "off", video: "off"});
test.setTimeout(180000);
test.beforeAll(() => {
  assert.equal(process.env.BWM045_APPROVED_STAGING, "parabolic-dev");
  release = JSON.parse(readFileSync(`${out}/preview-candidate.json`, "utf8"));
  fixture = JSON.parse(readFileSync(`${out}/fixture.private.json`, "utf8"));
  ({portalOrigin: portal, examOrigin: exam} = release);
  assert.ok(release.previewOrigins && release.deploymentAuthorized);
  for (const [origin, site] of [[portal, "parabolic-dev"], [exam, "parabolic-dev-40ec9"]]) {
    const u = new URL(origin); assert.equal(origin, u.origin); assert.equal(u.protocol, "https:");
    assert.match(u.hostname, new RegExp(`^${site}--bwm045-proctoring-[0-9]{8}-[a-z0-9-]+\\.web\\.app$`));
  }
  assert.equal(fixture.project, "parabolic-dev");
});
function headers(response, camera = false) {
  const h = response.headers();
  expect(h["referrer-policy"]).toBe("no-referrer"); expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("script-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  if (camera) {expect(h["permissions-policy"]).toContain("camera=(self)"); expect(h["permissions-policy"]).toContain("microphone=()");}
}
test("approved public candidate assets, security headers and pre-Auth query isolation", async ({page, request}) => {
  for (const f of release.files) {
    const isPortal = f.path.startsWith("portal/"); assert.ok(isPortal || f.path.startsWith("exam/"));
    const path = f.path.slice(isPortal ? 6 : 4);
    const r = await request.get(`${isPortal ? portal : exam}${path}`); expect(r.status()).toBe(200);
    expect(createHash("sha256").update(await r.body()).digest("hex")).toBe(f.sha256);
  }
  let authCalls = 0;
  page.on("request", r => {if (/identitytoolkit|\/entry$/u.test(r.url())) authCalls++;});
  const doc = await page.goto(`${exam}/session/invalid?token=dev&faceGaze=off`); expect(doc.status()).toBe(200); headers(doc, true);
  await expect(page.getByRole("heading", {name: "Session Access Blocked", exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe(""); expect(authCalls).toBe(0);
  const returned = page.waitForResponse(r => r.request().isNavigationRequest() && r.url() === `${portal}/student/my-tests`);
  await page.getByRole("button", {name: "Go to Student Portal", exact: true}).click();
  const r = await returned; expect(r.status()).toBe(200); headers(r);
  expect(r.request().headers().referer ?? "").toBe(""); expect(r.request().headers().authorization).toBeUndefined();
  await expect(page.getByRole("heading", {name: "Student Login", exact: true})).toBeVisible();
  writeFileSync(`${out}/public-assets-headers.json`, JSON.stringify({project: "parabolic-dev", releaseId: release.releaseId, filesMatched: release.files.length, cspBypass: false, queryRejectedBeforeAuth: true, freshReturnDoesNotAuthenticate: true}, null, 2) + "\n");
});
test("approved public Student launch enforces v1 native camera readiness, durable receipts and release privacy", async ({page, context}) => {
  let observedLaunch;
  await context.exposeBinding("__observeStudentLaunch", (_source, value) => {observedLaunch = value;});
  await context.addInitScript(() => {
    // Observe the actual response before the application navigates away. Return
    // the original native Response unchanged; never substitute network success.
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (new URL(response.url).pathname === "/api/v1/exam/start" && response.ok) {
        const {data} = await response.clone().json(); const url = new URL(data.examUrl);
        await window.__observeStudentLaunch({sessionId: data.sessionId, origin: url.origin,
          search: url.search, fragmentOnly: url.hash === `#launch=${encodeURIComponent(data.launchCredential)}`});
      }
      return response;
    };
    window.__nativeCamera = {calls: [], streams: []};
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      window.__nativeCamera.calls.push(options); const stream = await native(options);
      window.__nativeCamera.streams.push(stream); return stream;
    };
  });
  const mediaRequests = [], receipts = [];
  page.on("request", r => {const u = new URL(r.url()); if (u.pathname.startsWith("/api/v1/") && (/identity|upload|media/iu.test(u.pathname) || /image|audio|video|multipart/iu.test(r.headers()["content-type"] ?? ""))) mediaRequests.push(u.pathname);});
  page.on("response", async r => {
    if (r.url().endsWith("/integrity-events") && r.status() === 200) {
      try {receipts.push({data: (await r.json()).data, body: r.request().postData(), headers: r.request().headers()});} catch { /* Context may close after all assertions. */ }
    }
  });
  await page.goto(`${portal}/student/my-tests`);
  await page.getByLabel("Email", {exact: true}).fill(fixture.email); await page.getByLabel("Password", {exact: true}).fill(fixture.password);
  const reader = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
  await page.getByRole("button", {name: "Login", exact: true}).click();
  const read = await reader; expect(read.status()).toBe(200); expect((await read.json()).data.contractVersion).toBe(2);
  const studentHeader = read.request().headers().authorization;
  const launched = page.waitForResponse(r => r.url() === `${portal}/api/v1/exam/start`);
  const entry = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "launch");
  await page.getByRole("article").filter({has: page.getByRole("heading", {name: "BWM045 isolated camera qualification", exact: true})}).getByRole("button", {name: /Start Test|Resume/u}).click();
  const launchResponse = await launched; expect([200, 201]).toContain(launchResponse.status());
  await expect.poll(() => Boolean(observedLaunch)).toBe(true);
  const launch = observedLaunch;
  expect(launch.origin).toBe(exam); expect(launch.search).toBe(""); expect(launch.fragmentOnly).toBe(true);
  const entered = await entry; expect(entered.status()).toBe(200); expect(entered.headers()["cache-control"]).toContain("no-store");
  const snapshot = (await entered.json()).data.entry.runtimeSnapshot;
  expect(snapshot.proctoringPolicy.contractVersion).toBe(1); expect(snapshot.proctoringPolicy.cameraReadiness).toBe("required");
  expect(snapshot.proctoringPolicy.capabilities.automatedFaceMatching).toBe("unavailable"); expect(snapshot.proctoringPolicy.capabilities.automatedGazeTracking).toBe("unavailable");
  expect(new URL(page.url()).hash).toBe(""); expect(new URL(page.url()).search).toBe("");
  const doc = await page.request.get(`${exam}/session/${launch.sessionId}`); headers(doc, true);
  await expect(page.getByText("Automated face matching and gaze tracking are unavailable. No identity photo is fetched.")).toBeVisible();
  expect(await page.evaluate(() => window.__nativeCamera.calls.length)).toBe(0);
  const cdp = await context.newCDPSession(page); const {targetInfo} = await cdp.send("Target.getTargetInfo");
  const permission = setting => cdp.send("Browser.setPermission", {permission: {name: "camera"}, setting, origin: exam, browserContextId: targetInfo.browserContextId});
  const allEnded = () => page.evaluate(() => window.__nativeCamera.streams.flatMap(s => s.getTracks()).every(t => t.readyState === "ended"));
  await permission("denied");
  expect(await page.evaluate(async () => (await navigator.permissions.query({name: "camera"})).state)).toBe("denied");
  await page.getByRole("button", {name: /I agree.*Start Camera/u}).click();
  await expect(page.getByText(/Camera readiness unavailable/u)).toBeVisible();
  await expect(page.getByRole("button", {name: "Continue to Instructions", exact: true})).toBeDisabled();
  expect(await page.evaluate(() => window.__nativeCamera.streams.length)).toBe(0);
  async function ready() {
    await page.getByRole("button", {name: /I agree.*(?:Start|Retry) Camera/u}).click();
    await expect(page.getByText(/Local camera preview ready/u)).toBeVisible();
    await expect.poll(() => page.getByLabel("Local camera preview", {exact: true}).evaluate(v => v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0)).toBe(true);
    expect(await page.evaluate(() => window.__nativeCamera.calls.every(c => c.audio === false) && window.__nativeCamera.streams.every(s => s.getAudioTracks().length === 0))).toBe(true);
  }
  await permission("granted"); await ready();
  await page.getByRole("button", {name: "Stop Camera", exact: true}).click(); await expect.poll(allEnded).toBe(true);
  await expect(page.getByRole("button", {name: "Continue to Instructions", exact: true})).toBeDisabled();
  await ready(); await page.getByRole("button", {name: "Check Internet", exact: true}).click();
  await page.getByRole("button", {name: "Continue to Instructions", exact: true}).click();
  const activation = page.waitForResponse(r => r.url().endsWith("/activate") && r.status() === 200);
  await page.getByLabel(/I have read and understood the instructions/u).check(); await activation;
  await expect(page.getByText("BWM045 public camera readiness question", {exact: true})).toBeVisible();
  await expect.poll(() => receipts.length).toBeGreaterThan(0);
  const last = receipts.at(-1); expect(last.data.source).toBe("client_report"); expect(last.data.disposition).toBe("accepted");
  const replay = await page.request.post(`${exam}/api/v1/exam/session/${launch.sessionId}/integrity-events`, {data: last.body, headers: {authorization: last.headers.authorization, "X-Parabolic-Exam-Owner": last.headers["x-parabolic-exam-owner"], "X-Parabolic-Exam-Generation": last.headers["x-parabolic-exam-generation"], "content-type": "application/json"}});
  expect(replay.status()).toBe(200); expect((await replay.json()).data).toEqual({...last.data, disposition: "replayed"});
  const released = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "release");
  expect(await allEnded()).toBe(false); await page.getByRole("button", {name: "Sign out of Exam", exact: true}).click(); expect((await released).status()).toBe(200);
  await expect.poll(allEnded).toBe(true); await expect(page.getByRole("heading", {name: "Exam runtime paused", exact: true})).toBeVisible();
  await expect(page.getByRole("region", {name: "Client observation reporting"})).toContainText("stopped");
  const returnedRead = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
  const returnedDoc = page.waitForResponse(r => r.request().isNavigationRequest() && r.url() === `${portal}/student/my-tests`);
  await page.getByRole("button", {name: "Return to Student Portal", exact: true}).click();
  const navigation = await returnedDoc; headers(navigation); expect(navigation.request().headers().referer ?? "").toBe("");
  const returned = await returnedRead; expect(returned.status()).toBe(200);
  expect(returned.request().headers()["x-parabolic-exam-owner"]).toBeUndefined();
  const claims = JSON.parse(Buffer.from(returned.request().headers().authorization.slice(7).split(".")[1], "base64url").toString());
  expect(claims.sub).toBe(fixture.uid); expect(claims.sessionId).toBeUndefined(); expect(claims.launchNonce).toBeUndefined(); expect(studentHeader).not.toBe(last.headers.authorization);
  expect(mediaRequests).toEqual([]); await cdp.detach();
  writeFileSync(`${out}/public-camera-receipts.json`, JSON.stringify({project: "parabolic-dev", releaseId: release.releaseId, sessionId: launch.sessionId, acceptedBatchIds: [...new Set(receipts.map(r => r.data.batchId))], replayedBatchId: last.data.batchId, realStudentUiLaunch: true, fragmentOnly: true, policyVersion: 1, nativeDeniedGranted: true, zeroAudio: true, explicitStopRetry: true, liveCameraReleased: true, independentStudentReturn: true, mediaRequests, cspBypass: false, limitation: "Native synthetic video proves permission/readiness, never physical hardware continuity or face/gaze verification."}, null, 2) + "\n");
});
