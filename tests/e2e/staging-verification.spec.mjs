import {expect, test} from "playwright/test";

const stagingUrls = {
  portal: process.env.PARABOLIC_STAGING_PORTAL_URL,
  exam: process.env.PARABOLIC_STAGING_EXAM_URL,
  vendor: process.env.PARABOLIC_STAGING_VENDOR_URL,
};

const commonPermissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)";
const examPermissionsPolicy =
  "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)";

function requireStagingUrls() {
  for (const [target, url] of Object.entries(stagingUrls)) {
    expect(url, `PARABOLIC_STAGING_${target.toUpperCase()}_URL`).toBeTruthy();
    expect(new URL(url).protocol).toBe("https:");
  }
}

function expectSecurityHeaders(headers, permissionsPolicy) {
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toBe(permissionsPolicy);
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
}

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("public preview routes refresh with the reviewed target-specific headers", async ({page}) => {
  requireStagingUrls();
  const routes = [
    [new URL("/admin/deep-link", stagingUrls.portal).href, "portal-admin", commonPermissionsPolicy],
    [new URL("/student/deep-link", stagingUrls.portal).href, "portal-student", commonPermissionsPolicy],
    [new URL("/deep-link", stagingUrls.exam).href, "exam", examPermissionsPolicy],
    [new URL("/deep-link", stagingUrls.vendor).href, "vendor", commonPermissionsPolicy],
  ];

  for (const [url, target, permissionsPolicy] of routes) {
    const response = await page.goto(url, {waitUntil: "domcontentloaded"});
    expect(response?.status(), url).toBe(200);
    expectSecurityHeaders(response?.headers() ?? {}, permissionsPolicy);
    await expect(page.locator(`[data-bwm004-target="${target}"]`)).toBeVisible();
  }
});

test("public preview API rewrites return JSON rather than SPA HTML", async ({request}) => {
  requireStagingUrls();
  for (const [target, baseUrl] of Object.entries(stagingUrls)) {
    const response = await request.get(new URL("/api/v1/hosting-rewrite-probe", baseUrl).href);
    const responseBody = await response.text();
    expect(response.status(), target).toBe(404);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(responseBody).not.toMatch(/<!doctype html>/i);
    expect(JSON.parse(responseBody).error?.code).toBe("NOT_FOUND");
  }
});

test("an unauthorized cross-origin browser request is blocked", async ({page}) => {
  requireStagingUrls();
  await page.goto(new URL("/admin", stagingUrls.portal).href, {
    waitUntil: "domcontentloaded",
  });

  const crossOriginResult = await page.evaluate(async (examUrl) => {
    try {
      await fetch(new URL("/api/v1/hosting-rewrite-probe", examUrl), {
        headers: {Authorization: "BWM004Verification"},
      });
      return {blocked: false};
    } catch (error) {
      return {
        blocked: true,
        errorName: error instanceof Error ? error.name : "unknown",
      };
    }
  }, stagingUrls.exam);

  expect(crossOriginResult).toEqual({blocked: true, errorName: "TypeError"});
});

test("the public Exam preview can request same-origin camera video only", async ({page}) => {
  requireStagingUrls();
  const response = await page.goto(new URL("/", stagingUrls.exam).href, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.headers()["permissions-policy"]).toBe(examPermissionsPolicy);

  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
    const result = {
      audio: stream.getAudioTracks().length,
      video: stream.getVideoTracks().length,
    };
    stream.getTracks().forEach((track) => track.stop());
    return result;
  });
  expect(tracks).toEqual({audio: 0, video: 1});
});
