import { expect, test } from "playwright/test";

const crossPortalStorageKey = "parabolic.crossPortalAuthSession.v1";
const localFallbackStorageKey = "parabolic.localAuthToken";
const legacyCookieKey = "parabolic_cross_portal_auth_v1";

async function seedLegacyTokenCopies(page, routePath) {
  await page.addInitScript(
    ({ cookieKey, localKey, path, storageKey }) => {
      const token = "legacy.header.payload.signature";
      const now = Date.now();
      window.history.replaceState(null, "", path);
      window.localStorage.setItem(localKey, token);
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          sourcePortal: path.startsWith("/student/") ? "student" : "admin",
          idToken: token,
          issuedAt: now,
          expiresAt: now + 10 * 60 * 1000,
        }),
      );
      document.cookie =
        `${cookieKey}=${encodeURIComponent(token)}; Path=/; Max-Age=900; SameSite=Lax`;
    },
    {
      cookieKey: legacyCookieKey,
      localKey: localFallbackStorageKey,
      path: routePath,
      storageKey: crossPortalStorageKey,
    },
  );
}

async function expectNoApplicationOwnedTokenCopy(page) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ cookieKey, localKey, storageKey }) => ({
          cookiePresent: document.cookie.includes(`${cookieKey}=`),
          localFallback: window.localStorage.getItem(localKey),
          storedBridge: window.localStorage.getItem(storageKey),
          tokenLikeValues: Object.values(window.localStorage).filter(
            (value) =>
              typeof value === "string" &&
              (value.includes("legacy.header.payload.signature") || value.includes("local-auth-fallback")),
          ),
        }),
        {
          cookieKey: legacyCookieKey,
          localKey: localFallbackStorageKey,
          storageKey: crossPortalStorageKey,
        },
      ),
    )
    .toEqual({
      cookiePresent: false,
      localFallback: null,
      storedBridge: null,
      tokenLikeValues: [],
    });
}

test("Admin and Student purge retired token copies and keep loopback fallback sessions in memory", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const portals = [
    {
      entryPath: "/admin/index.html",
      email: "admin.test@parabolic.local",
      loginHeading: "Admin Login",
      loginPath: "/login",
      protectedPath: /\/admin\/overview$/u,
    },
    {
      entryPath: "/student/index.html",
      email: "student.test@parabolic.local",
      loginHeading: "Student Login",
      loginPath: "/student/login",
      protectedPath: /\/student\/dashboard$/u,
    },
  ];

  for (const portal of portals) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await seedLegacyTokenCopies(page, portal.loginPath);
    await page.goto(portal.entryPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: portal.loginHeading })).toBeVisible();
    await expectNoApplicationOwnedTokenCopy(page);

    const unauthorizedResponsePromise = portal.loginPath === "/login"
      ? page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/v1/admin/overview" &&
            response.status() === 401,
          { timeout: 30_000 },
        )
      : null;
    await page.getByLabel("Email").fill(portal.email);
    await page.getByLabel("Password").fill("demo-password");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(portal.protectedPath);
    await expectNoApplicationOwnedTokenCopy(page);
    if (unauthorizedResponsePromise) {
      expect((await unauthorizedResponsePromise).status()).toBe(401);
    }

    await page.goto(portal.entryPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: portal.loginHeading })).toBeVisible();
    await expectNoApplicationOwnedTokenCopy(page);
    await context.close();
  }
});
