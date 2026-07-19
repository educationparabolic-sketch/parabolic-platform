import {expect, test} from "playwright/test";

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
  await expect(page.getByRole("heading", {name: "Admin Login"})).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  const studentResponse = await page.goto("/student", {waitUntil: "domcontentloaded"});
  expect(studentResponse?.status()).toBe(200);
  expect(studentResponse?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", {name: "Student Login"})).toBeVisible();
  await expect(page).toHaveURL(/\/student\/login$/);

  expect(failedSameOriginRequests, "same-origin Hosting requests").toEqual([]);
  expect(browserErrors, "browser console and page errors").toEqual([]);
});
