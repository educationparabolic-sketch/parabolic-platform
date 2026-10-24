import {readFileSync} from "node:fs";
import {test, expect} from "playwright/test";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require = createRequire(import.meta.url), admin = require("../../functions/node_modules/firebase-admin");
const fixture = require("../../functions/tests/helpers/crossPortalSecurity.js");
const portal = "http://127.0.0.1:5000", exam = "http://127.0.0.1:5005", vendor = "http://127.0.0.1:5006";
const privateCache = "private, max-age=0, no-store", revalidate = "no-cache, max-age=0, must-revalidate";
test.use({bypassCSP: false, ignoreHTTPSErrors: true, permissions: ["camera"], launchOptions: {args: [
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-proxy-server",
  "--host-resolver-rules=MAP cdn.security.test.invalid:443 127.0.0.1:9443"]}});
let app, auth, db, actor, institute;
test.beforeAll(async () => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  app = admin.initializeApp({projectId: "demo-parabolic-test"}, `headers-${randomUUID()}`); auth = app.auth(); db = app.firestore();
  institute = `bwm047_headers_${randomUUID().slice(0, 8)}`;
  await fixture.seedInstitute(db, institute); actor = await fixture.account(auth, db, institute + "_student", "student", institute);
  await db.doc(`institutes/${institute}/students/${actor.uid}`).update({fullName: '<img src="https://unexpected.invalid/x" onerror="alert(1)">'});
});
test.afterAll(async () => {if (app) {await fixture.cleanup(auth, db, actor ? [actor.uid] : [], [institute]); await app.delete();}});

test("real Hosting revalidates HTML/deep links/404/maps and caches only existing hashed assets", async ({request}) => {
  for (const [origin, paths] of [[portal, ["/", "/admin", "/login", "/admin/students", "/student/profile", "/unknown"]],
    [exam, ["/", "/session/missing"]], [vendor, ["/", "/vendor/system-health"]]]) {
    for (const path of paths) {
      const response = await request.get(origin + path, {maxRedirects: 0});
      expect(response.headers()["cache-control"], origin + path).toBe(revalidate);
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    }
    const html = await (await request.get(origin + (origin === portal ? "/admin" : "/"))).text();
    const js = html.match(/src="([^"]+\.js)"/)[1];
    const asset = await request.get(origin + js);
    expect(asset.status()).toBe(200); expect(asset.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    // Exam's bootstrap lazy-loads its stylesheet; inspect the actual candidate inventory.
    const target = origin === portal ? "portal" : origin === exam ? "exam" : "vendor";
    const candidate = JSON.parse(readFileSync(`${process.env.SECURITY_EVIDENCE_DIRECTORY ?? "test-results/bwm047-headers"}/firebase.json`, "utf8"));
    const css = candidate.hosting.find(row => row.site.endsWith("-" + target)).headers
      .find(row => row.source.endsWith(".css") && row.headers.some(header => header.value.includes("immutable"))).source;
    expect((await request.get(origin + css)).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    for (const path of [js + ".map", js.replace(/-[^-]+\.js$/, "-missing123.js"), "/manifest.webmanifest"]) {
      const result = await request.get(origin + path);
      expect(result.headers()["cache-control"]).toBe(revalidate);
      expect(result.headers()["content-type"]).toMatch(/^text\/(?:html|plain)/);
      expect(await result.text()).not.toMatch(/"sourcesContent"\s*:|"mappings"\s*:|sourceMappingURL\s*=/);
    }
  }
});

for (const [caseIndex, name] of ["gateway positive", "gateway authentication denial", "gateway unknown", "gateway method",
  "direct positive", "direct unknown", "direct method", "closed legacy", "webhook exception", "health exception"].entries())
test(`real API private cache: ${name}`, async ({request}) => {
  const direct = "http://127.0.0.1:5001/demo-parabolic-test/us-central1/";
  const cases = [
    [portal + "/api/v1/student/profile", "GET", actor.token, 200],
    [exam + "/api/v1/student/profile", "GET", undefined, 401],
    [vendor + "/api/v1/unknown", "GET", undefined, 404],
    [portal + "/api/v1/student/profile", "PUT", actor.token, 405],
    [direct + "studentProfile/student/profile", "GET", actor.token, 200],
    [direct + "studentProfile/unknown", "GET", actor.token, 404],
    [direct + "adminStudents/", "POST", undefined, 405],
    [direct + "vendorLicenseUpdate/", "POST", undefined, 404],
    [direct + "stripeWebhook/", "POST", undefined, [400, 500]],
    [direct + "helloWorld/", "GET", undefined, [200, 500]],
  ];
  {
    const [url, method, token, status] = cases[caseIndex];
    const result = await request.fetch(url, {method, headers: token ? {authorization: `Bearer ${token}`} : {}});
    expect([status].flat()).toContain(result.status());
    expect(result.headers()["cache-control"], url).toBe(privateCache);
    expect(result.headers()["x-content-type-options"]).toBe("nosniff");
    if (!url.includes("helloWorld") || result.status() !== 200) expect(result.headers()["content-type"]).toContain("application/json");
  }
});
for (const [name, url, camera] of [["Admin", portal + "/", false], ["Student", portal + "/student/profile", true],
  ["Exam", exam + "/", true], ["Vendor", vendor + "/", false]]) {
  test(`${name}: CSP blocks active/remote content and enforces camera scope`, async ({page}) => {
    await page.goto(url);
    if (name === "Admin") await expect(page).toHaveURL(/\/login$/);
    const permission = await page.evaluate(async () => {
      try {const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
        const tracks = stream.getTracks(); tracks.forEach(track => track.stop()); return tracks.length > 0;
      } catch {return false;}
    });
    expect(permission).toBe(camera);
    await page.evaluate(async () => {
      window.__blocked = []; window.__inlineRan = false;
      document.addEventListener("securitypolicyviolation", event => window.__blocked.push(event.effectiveDirective));
      const inline = document.createElement("script"); inline.textContent = "window.__inlineRan = true"; document.body.append(inline);
      const script = document.createElement("script"); script.src = "https://unexpected.invalid/remote.js"; document.body.append(script);
      const img = new Image(); img.src = "https://unexpected.invalid/probe.png"; document.body.append(img);
      const frame = document.createElement("iframe"); frame.src = location.origin; document.body.append(frame);
      await fetch("https://unexpected.invalid/private").catch(() => {});
    });
    await expect.poll(() => page.evaluate(() => [...new Set(window.__blocked)].sort())).toEqual(["connect-src", "frame-src", "img-src", "script-src-elem"]);
    expect(await page.evaluate(() => window.__inlineRan)).toBe(false);
  });
}
test("enforced CSP loads exact signed immutable bytes; managed policy rejects another object", async ({page}) => {
  await page.goto(portal + "/admin");
  await page.addScriptTag({url: portal + "/admin/assets/security-policy-probe.js", type: "module"});
  const result = await page.evaluate(async signed => {
    const {managedSignedAssetUrl} = window.__assetPolicy;
    const base = "https://cdn.security.test.invalid/published", path = "tenant/questions/q/v1/question-r2.png";
    const allowed = managedSignedAssetUrl(signed, base, path);
    const rejected = managedSignedAssetUrl(signed, base, path.replace("/q/", "/other/"));
    const image = new Image(); image.src = allowed; document.body.append(image); await image.decode();
    return {sameBytes: allowed === signed, rejected, width: image.naturalWidth};
  }, process.env.PARABOLIC_SECURITY_SIGNED_ASSET);
  expect(result).toEqual({sameBytes: true, rejected: "", width: 1});
});
test("mounted Student renders malicious profile text and history after logout contains no previous identity", async ({page}) => {
  await page.goto(portal + "/student/profile");
  await page.getByLabel("Email", {exact: true}).fill(actor.email);
  await page.getByLabel("Password", {exact: true}).fill(actor.password);
  await page.getByRole("button", {name: "Login", exact: true}).click();
  const text = '<img src="https://unexpected.invalid/x" onerror="alert(1)">';
  await expect(page.getByText(text, {exact: true})).toBeVisible();
  await expect(page.locator('img[src="https://unexpected.invalid/x"]')).toHaveCount(0);
  await page.goto(portal + "/student/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", {name: "Sign out", exact: true}).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack(); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(text, {exact: true})).toHaveCount(0);
});
