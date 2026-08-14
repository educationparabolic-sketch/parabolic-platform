import { expect, test } from "playwright/test";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const target = process.env.PARABOLIC_AUTH_HARDENING_TARGET;

test.use({ bypassCSP: true });

test.beforeAll(() => {
  expect(authHost).toBeTruthy();
  expect(["portal", "vendor"]).toContain(target);
});

const portalCases = {
  portal: [
    {
      email: "admin.test@parabolic.local",
      entryPath: "/admin/index.html",
      heading: "Admin Login",
      loginPath: "/login",
    },
    {
      email: "student.test@parabolic.local",
      entryPath: "/student/index.html",
      heading: "Student Login",
      loginPath: "/student/login",
    },
  ],
  vendor: [
    {
      email: "vendor.test@parabolic.local",
      entryPath: "/index.html",
      heading: "Vendor Login",
      loginPath: "/vendor/login",
    },
  ],
};

test("production login forms are empty and reject loopback development credentials", async ({
  browser,
}) => {
  test.setTimeout(90_000);

  for (const portal of portalCases[target]) {
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    await page.addInitScript(
      ({ path }) => {
        window.history.replaceState(null, "", path);
      },
      { path: portal.loginPath },
    );
    await page.goto(portal.entryPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: portal.heading, exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");

    await page.getByLabel("Email", { exact: true }).fill(portal.email);
    await page.getByLabel("Password", { exact: true }).fill("demo-password");
    const failedSignInPromise = page.waitForResponse(
      (response) =>
        response.url().includes("accounts:signInWithPassword") && response.status() === 400,
    );
    await page.getByRole("button", { name: "Login", exact: true }).click();
    const failedSignIn = await failedSignInPromise;

    expect(new URL(failedSignIn.url()).origin).toBe(`http://${authHost}`);
    await expect(page).toHaveURL(new RegExp(`${portal.loginPath}$`, "u"));
    await expect(page.getByRole("alert")).toBeVisible();
    await context.close();
  }
});
