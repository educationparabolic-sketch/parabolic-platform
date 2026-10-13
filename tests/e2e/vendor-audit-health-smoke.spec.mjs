import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {expect as baseExpect, test} from "playwright/test";
const expect = baseExpect.configure({timeout: 60000});
const require = createRequire(import.meta.url);
const functionsRequire = createRequire(new URL("../../functions/package.json", import.meta.url));
const {Timestamp} = functionsRequire("firebase-admin/firestore");
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
test.use({bypassCSP: true});
test.setTimeout(300000);
test("mounted audit, health and Overview consume real server evidence with pagination, fresh sessions, corruption and current-Auth denial", async ({page, browser}) => {
  page.setDefaultTimeout(60000);
  expect(process.env.PROJECT_ID).toBe("demo-parabolic-test");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIREBASE_EMULATOR_HUB).toBeTruthy();
  const app = getFirebaseAdminApp(), db = getFirestore(), auth = app.auth();
  const email = `audit-health-${randomUUID()}@example.test`, password = "disposable-audit-health-smoke";
  const user = await auth.createUser({email, password});
  const at = hour => Timestamp.fromDate(new Date(`2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`));
  const docs = Object.fromEntries(Array.from({length: 4}, (_, i) => [`vendorAuditLogs/vendor_institute_audit_bwm040_browser_${i}`, {
    action: "update_profile", actorRole: "vendor", actorUserId: user.uid, auditEventId: `vendor_institute_audit_bwm040_browser_${i}`,
    instituteId: i === 0 ? "inst_other" : "inst_browser", occurredAt: at(10 - i), summary: `Server profile event ${i}`,
    fingerprint: "PRIVATE_MARKER", ipAddressHash: "PRIVATE_MARKER",
  }]));
  Object.assign(docs, {
    "systemFlags/failureRecoveryRetryQueue/jobs/bwm040_browser_pending": {status: "pending", createdAt: at(1), updatedAt: at(2), payload: "PRIVATE_MARKER"},
    "emailQueue/bwm040_browser_sent": {status: "sent", createdAt: at(2), sentAt: at(3), recipientEmail: "PRIVATE_MARKER"},
    "vendorCalibrationRollouts/bwm040_browser_pending": {state: "pending", createdAt: at(3).toDate().toISOString(), updatedAt: at(4).toDate().toISOString()},
  });
  const apiRequests = [];
  page.on("request", request => { if (/\/api\/v1\/vendor\/(?:audit-events|system-health)/.test(request.url())) apiRequests.push(request); });
  await page.route("https://**/*", route => route.abort());
  try {
    const reset = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-parabolic-test/databases/(default)/documents", {method: "DELETE"});
    expect(reset.ok).toBe(true);
    await auth.setCustomUserClaims(user.uid, {role: "vendor", isVendor: true, licenseLayer: "L0"});
    await Promise.all(Object.entries(docs).map(([path, data]) => db.doc(path).create(data)));
    const before = await Promise.all(Object.keys(docs).map(async path => JSON.stringify((await db.doc(path).get()).data())));
    await page.addInitScript(() => {
      localStorage.setItem("parabolic.frontendTelemetry.events", JSON.stringify([{message: "HOSTILE_BROWSER_AUTHORITY", eventCount: 99999}]));
      localStorage.setItem("vendor-build-138-calibration-audit", JSON.stringify([{note: "HOSTILE_BROWSER_AUTHORITY"}]));
      if (location.pathname === "/index.html") history.replaceState(null, "", "/vendor/audit?limit=2");
    });
    await page.goto("/index.html");
    await page.getByLabel("Email", {exact: true}).fill(email); await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    const audit = page.locator(".vendor-audit-page");
    await expect(audit.getByRole("table", {name: "Authoritative audit events"})).toBeVisible();
    await expect(audit.getByRole("row")).toHaveCount(3);
    await expect(audit).toContainText("Server profile event 0");
    await expect(audit.getByRole("button", {name: "Previous audit page", exact: true})).toBeDisabled();
    await audit.getByLabel("Search this page", {exact: true}).fill("event 0");
    await expect(audit.getByRole("row")).toHaveCount(2);
    await audit.getByLabel("Search this page", {exact: true}).fill("");
    await audit.getByRole("button", {name: "Next audit page", exact: true}).click();
    await expect(audit).toContainText("Server profile event 2");
    await expect(audit).not.toContainText("Server profile event 0");
    await audit.getByRole("button", {name: "Previous audit page", exact: true}).click();
    await expect(audit).toContainText("Server profile event 0");
    await audit.getByLabel("Institute ID", {exact: true}).fill("inst_browser");
    await audit.getByRole("button", {name: "Apply audit filters", exact: true}).click();
    await expect(audit).toContainText("Server profile event 1");
    await expect(audit).not.toContainText("Server profile event 0");
    await page.reload(); await expect(audit).toContainText("Server profile event 1");
    await audit.getByLabel("Institute ID", {exact: true}).fill("inst_empty");
    await audit.getByRole("button", {name: "Apply audit filters", exact: true}).click();
    await expect(audit).toContainText("No audit events on this page.");
    await audit.getByRole("button", {name: "Clear audit filters", exact: true}).click();
    await expect(audit.getByRole("row")).toHaveCount(5);
    await page.getByRole("link", {name: /System Health/}).first().click();
    const health = page.locator(".vendor-system-health-page");
    await expect(health.getByLabel("Runtime release", {exact: true})).toContainText("bwm040-adoption");
    await expect(health.getByLabel("Failure recovery", {exact: true})).toContainText("Outstanding: 1");
    await expect(health.getByLabel("Email delivery", {exact: true})).toContainText("Succeeded1");
    await expect(health.getByLabel("Stripe reconciliation", {exact: true})).toContainText("No records in this source.");
    await expect(health.getByLabel("Unavailable monitoring sources", {exact: true})).toContainText("Frontend telemetry");
    await expect(health).not.toContainText("HOSTILE_BROWSER_AUTHORITY");
    await page.reload(); await expect(health.getByLabel("Failure recovery", {exact: true})).toContainText("Outstanding: 1");
    await page.getByRole("link", {name: /Overview/}).first().click();
    const overview = page.locator(".vendor-overview-page");
    await expect(overview).toContainText("Server profile event 0");
    await expect(overview.getByLabel("Calibration operations", {exact: true})).toContainText("Outstanding: 1");
    await expect(overview).not.toContainText("All clear"); await expect(overview).not.toContainText("Active globally");
    await expect(overview).not.toContainText("HOSTILE_BROWSER_AUTHORITY");
    const after = await Promise.all(Object.keys(docs).map(async path => JSON.stringify((await db.doc(path).get()).data())));
    expect(after).toEqual(before);
    await db.doc("emailQueue/bwm040_browser_sent").update({status: "invalid"});
    await page.getByRole("link", {name: /System Health/}).first().click();
    await expect(health.getByLabel("Email delivery", {exact: true})).toContainText("Unavailable:");
    await expect(health.getByLabel("Failure recovery", {exact: true})).toContainText("Outstanding: 1");
    await db.doc("vendorAuditLogs/vendor_institute_audit_bwm040_browser_0").update({actorRole: 123});
    await page.getByRole("link", {name: /Audit/}).first().click();
    await expect(audit.getByRole("alert")).toContainText("audit events unavailable");
    await expect(audit.getByRole("table")).toHaveCount(0);
    await db.doc("vendorAuditLogs/vendor_institute_audit_bwm040_browser_0").update({actorRole: "vendor"});
    await audit.getByRole("button", {name: "Retry audit events", exact: true}).click();
    await expect(audit.getByRole("table")).toBeVisible();
    expect(apiRequests.every(request => request.method() === "GET")).toBe(true);
    expect(apiRequests.some(request => new URL(request.url()).searchParams.has("cursor"))).toBe(true);
    expect(apiRequests.some(request => new URL(request.url()).searchParams.get("instituteId") === "inst_browser")).toBe(true);
    expect(apiRequests.some(request => request.url().includes("/system-health"))).toBe(true);
    await db.doc("emailQueue/bwm040_browser_sent").set(docs["emailQueue/bwm040_browser_sent"]);
    const fresh = await browser.newContext({baseURL: test.info().project.use.baseURL, bypassCSP: true});
    try {
      const freshPage = await fresh.newPage();
      await freshPage.route("https://**/*", route => route.abort());
      await freshPage.addInitScript(() => {
        if (location.pathname === "/index.html") history.replaceState(null, "", "/vendor/audit");
      });
      let token;
      freshPage.on("request", request => {
        if (request.url().includes("/api/v1/vendor/audit-events")) {
          token = request.headers().authorization?.replace(/^Bearer /u, "");
        }
      });
      await freshPage.goto("/index.html");
      await freshPage.getByLabel("Email", {exact: true}).fill(email);
      await freshPage.getByLabel("Password", {exact: true}).fill(password);
      await freshPage.getByRole("button", {name: "Login", exact: true}).click();
      await expect(freshPage.locator(".vendor-audit-page")).toContainText("Server profile event 0");
      await freshPage.getByRole("link", {name: /System Health/}).first().click();
      await expect(freshPage.locator(".vendor-system-health-page").getByLabel("Failure recovery", {exact: true})).toContainText("Outstanding: 1");
      await freshPage.getByRole("link", {name: /Overview/}).first().click();
      await expect(freshPage.locator(".vendor-overview-page")).toContainText("Server profile event 0");
      await freshPage.getByRole("link", {name: /Audit/}).first().click();
      await expect(freshPage.getByRole("table", {name: "Authoritative audit events"})).toBeVisible();
      expect(token).toBeTruthy();
      // Retain the real signed token only in memory: current Auth must supersede it.
      for (const claims of [
        {role: "student", isVendor: false, licenseLayer: "L0"},
        {role: "vendor", isVendor: true, isSuspended: true, licenseLayer: "L0"},
      ]) {
        await auth.setCustomUserClaims(user.uid, claims);
        const statuses = await freshPage.evaluate(async signedToken => {
          return Promise.all(["audit-events", "system-health"].map(async endpoint => {
            const response = await fetch(`/api/v1/vendor/${endpoint}`, {headers: {authorization: `Bearer ${signedToken}`}});
            const body = await response.text();
            return {status: response.status, leaked: body.includes("Server profile event") || body.includes("PRIVATE_MARKER")};
          }));
        }, token);
        expect(statuses.every(result => [401, 403].includes(result.status) && !result.leaked)).toBe(true);
      }
      await freshPage.reload();
      await expect(freshPage.getByRole("table", {name: "Authoritative audit events"})).toHaveCount(0);
      await expect(freshPage.locator("body")).not.toContainText("Server profile event 0");
      await auth.setCustomUserClaims(user.uid, {role: "vendor", isVendor: true, licenseLayer: "L0"});
    } finally {
      await fresh.close();
    }
    const afterDenials = await Promise.all(Object.keys(docs).map(async path => JSON.stringify((await db.doc(path).get()).data())));
    // Intentional corruption/restore changes Firestore map insertion order,
    // not authority. Compare every stored field, including timestamp values.
    expect(afterDenials.map(value => JSON.parse(value))).toEqual(before.map(value => JSON.parse(value)));
  } finally {
    await Promise.all(Object.keys(docs).map(path => db.doc(path).delete()));
    await auth.deleteUser(user.uid); await app.delete();
  }
});
