import {expect, test} from "playwright/test";

const expectedPermissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)";

function expectBaselineSecurityHeaders(headers) {
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toBe(expectedPermissionsPolicy);
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
}

test("portal Hosting serves the Admin and Student entry routes", async ({page}) => {
  const browserErrors = [];
  const failedSameOriginRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(`page: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === new URL(page.url()).origin) {
      failedSameOriginRequests.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      new URL(response.url()).origin === new URL(page.url()).origin &&
      response.status() >= 400
    ) {
      failedSameOriginRequests.push(
        `${response.request().method()} ${response.url()}: HTTP ${response.status()}`,
      );
    }
  });

  const adminResponse = await page.goto("/admin", {waitUntil: "domcontentloaded"});
  expect(adminResponse?.status()).toBe(200);
  expect(adminResponse?.headers()["content-type"]).toContain("text/html");
  expectBaselineSecurityHeaders(adminResponse?.headers() ?? {});
  await expect(page.getByRole("heading", {name: "Admin Login"})).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  const studentResponse = await page.goto("/student", {waitUntil: "domcontentloaded"});
  expect(studentResponse?.status()).toBe(200);
  expect(studentResponse?.headers()["content-type"]).toContain("text/html");
  expectBaselineSecurityHeaders(studentResponse?.headers() ?? {});
  await expect(page.getByRole("heading", {name: "Student Login"})).toBeVisible();
  await expect(page).toHaveURL(/\/student\/login$/);

  expect(failedSameOriginRequests, "same-origin Hosting requests").toEqual([]);
  expect(browserErrors, "browser console and page errors").toEqual([]);
});

test("portal Hosting routes API requests before the SPA fallback", async ({page}) => {
  const response = await page.goto("/api/v1/hosting-rewrite-probe", {
    waitUntil: "domcontentloaded",
  });
  const responseBody = await response?.text();

  expect(response?.status()).toBe(404);
  expect(response?.headers()["content-type"]).toContain("application/json");
  expect(responseBody).not.toMatch(/<!doctype html>/i);
  expect(JSON.parse(responseBody ?? "{}").error?.code).toBe("NOT_FOUND");
});
