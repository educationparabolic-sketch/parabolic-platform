import { expect, test } from "playwright/test";

const fixtureRecordLabels = [
  "JEE Mock A - Physics Focus",
  "Late-phase drift",
  "Chemistry Rapid Revision",
];

async function expectUnavailableWithoutFixtures(page) {
  await expect(
    page.getByRole("heading", { name: "Authoritative data is unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture data has not been substituted."),
  ).toBeVisible();

  for (const label of fixtureRecordLabels) {
    await expect(page.getByText(label, { exact: false })).toHaveCount(0);
  }
}

test("live Student dashboard fails closed for HTTP 500 and offline network failure", async ({
  context,
  page,
}) => {
  const dashboardResponses = [];
  const failedDashboardRequests = [];

  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/v1/student/dashboard") {
      dashboardResponses.push(response.status());
    }
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/student/dashboard") {
      failedDashboardRequests.push(request.failure()?.errorText ?? "unknown failure");
    }
  });

  await page.goto("/student/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("student@parabolic.local");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/student\/dashboard$/);
  await expectUnavailableWithoutFixtures(page);
  expect(dashboardResponses.length).toBeGreaterThanOrEqual(1);
  expect(dashboardResponses.every((status) => status === 500)).toBe(true);
  await expect(page.getByText("BWM-007 forced server failure.")).toBeVisible();

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();

  await context.setOffline(true);
  try {
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/student\/dashboard$/);
    await expectUnavailableWithoutFixtures(page);
    await expect(
      page.getByText("Network failure for GET /student/dashboard"),
    ).toBeVisible();
    expect(failedDashboardRequests.length).toBeGreaterThanOrEqual(1);
  } finally {
    await context.setOffline(false);
  }
});
