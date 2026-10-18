import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {expect, test} from "playwright/test";

const origin = process.env.PARABOLIC_STUDENT_PROFILE_PREVIEW_URL ?? JSON.parse(readFileSync("test-results/bwm042-preview/preview.json", "utf8")).origin;
assert.match(origin ?? "", /^https:\/\/parabolic-dev--bwm042-photo-camera-[a-z0-9-]+\.web\.app$/);
const output = "test-results/bwm042-preview";
mkdirSync(output, {recursive: true});
test.use({baseURL: origin, trace: "off", screenshot: "off", permissions: ["camera"],
  launchOptions: {args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]}});
test.setTimeout(90_000);
const policy = (student) => `camera=${student ? "(self)" : "()"}, microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)`;

test("approved public preview preserves headers and deep refresh for Student and Admin", async ({request, page}) => {
  const results = [];
  for (const path of ["/student", "/student/", "/student/profile", "/student/login", "/student/index.html", "/admin", "/admin/students/list", "/login"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers["permissions-policy"], path).toBe(policy(path === "/student" || path.startsWith("/student/")));
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("script-src 'self'");
    results.push({path, status: response.status(), permissionsPolicy: headers["permissions-policy"]});
  }
  for (const path of ["/student/profile", "/admin/students/list"]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", {name: path.startsWith("/student") ? "Student Login" : "Admin Login", exact: true})).toBeVisible();
    expect((await page.reload()).status()).toBe(200);
  }
  const api = await request.get("/api/v1/student/profile");
  expect(api.headers()["content-type"]).toContain("application/json");
  expect(await api.text()).not.toMatch(/<!doctype html>/i);
  writeFileSync(`${output}/public-headers.json`, JSON.stringify({origin, paths: results, profileApiStatus: api.status()}, null, 2) + "\n");
});

test("HTTPS Student camera acquires real synthetic tracks and Admin policy denies it", async ({page}) => {
  const results = [];
  for (const [path, allowed] of [["/student/login", true], ["/admin", false]]) {
    await page.goto(path);
    const result = await page.evaluate(async () => {
      const enabled = document.featurePolicy.allowsFeature("camera");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
        const tracks = stream.getTracks();
        const acquired = tracks.length > 0 && tracks.every((track) => track.readyState === "live");
        tracks.forEach((track) => track.stop());
        return {secure: isSecureContext, enabled, acquired, stopped: tracks.every((track) => track.readyState === "ended")};
      } catch (error) {return {secure: isSecureContext, enabled, acquired: false, errorName: error.name};}
    });
    expect(result.secure).toBe(true); expect(result.enabled).toBe(allowed); expect(result.acquired).toBe(allowed);
    if (allowed) expect(result.stopped).toBe(true);
    else expect(result.errorName).toBe("NotAllowedError");
    results.push({path, ...result});
  }
  writeFileSync(`${output}/public-camera.json`, JSON.stringify({origin, results, syntheticInput: true, faceMatching: "unavailable"}, null, 2) + "\n");
});

test("role-enabled staging Student signs in on the preview and retains the Student camera policy", async ({page, request}) => {
  const credentials = readFileSync(process.env.PARABOLIC_PREVIEW_CREDENTIAL_FILE ?? "docs/LOCAL_TEST_CREDENTIALS.md", "utf8");
  const password = credentials.match(/Temporary test password[^]*?`([^`]+)`/i)?.[1];
  const email = [...credentials.matchAll(/`([^`\s]+@[^`\s]+)`/g)].map((match) => match[1]).find((value) => value.startsWith("student."));
  assert.ok(password && email, "An existing staging Student credential file is required.");
  const config = readFileSync("apps/student/.env.local", "utf8");
  const apiKey = config.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1].replace(/^['"]|['"]$/g, "");
  const signIn = await request.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {data: {email, password, returnSecureToken: true}});
  expect(signIn.status(), "Existing non-production test account must authenticate").toBe(200);
  const account = await signIn.json();
  const claims = JSON.parse(Buffer.from(account.idToken.split(".")[1], "base64url"));
  expect(claims.aud).toBe("parabolic-dev");
  const readiness = {project: claims.aud, firebaseSignIn: "passed", studentRole: claims.role === "student", tenantClaim: typeof claims.instituteId === "string"};
  writeFileSync(`${output}/authenticated-readiness.json`, JSON.stringify(readiness, null, 2) + "\n");
  assert.ok(readiness.studentRole && readiness.tenantClaim, "Existing staging Student lacks Student/tenant role claims. Account privilege changes are outside this preview authorization.");
  await page.goto("/student/profile");
  await page.getByLabel("Email", {exact: true}).fill(email);
  await page.evaluate((value) => {
    const input = document.querySelector("#student-login-password");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
  }, password);
  const authentication = page.waitForResponse((response) => response.url().includes("accounts:signInWithPassword"));
  await page.getByRole("button", {name: "Login", exact: true}).click();
  expect((await authentication).status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/student/profile`);
  await expect(page.locator("#student-profile-title")).toBeVisible();
  const refresh = await page.reload();
  expect(refresh.status()).toBe(200);
  expect(refresh.headers()["permissions-policy"]).toBe(policy(true));
  await expect(page.locator("#student-profile-title")).toBeVisible();
  expect(await page.evaluate(() => document.featurePolicy.allowsFeature("camera"))).toBe(true);
  const camera = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
    const tracks = stream.getTracks();
    const acquired = tracks.length > 0 && tracks.every((track) => track.readyState === "live");
    tracks.forEach((track) => track.stop());
    return {acquired, stopped: tracks.every((track) => track.readyState === "ended")};
  });
  expect(camera).toEqual({acquired: true, stopped: true});
  writeFileSync(`${output}/authenticated-readiness.json`, JSON.stringify({...readiness, portalSignIn: "passed", cameraPolicy: "self", authenticatedCamera: camera}, null, 2) + "\n");
});
