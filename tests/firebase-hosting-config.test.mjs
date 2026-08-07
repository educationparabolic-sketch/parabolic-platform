import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NON_PRODUCTION_FIREBASE_MAPPING } from "../scripts/frontend-cicd/validate-deploy-target.mjs";

const firebaseConfig = JSON.parse(
  await readFile(new URL("../firebase.json", import.meta.url), "utf8"),
);
const firebaseRc = JSON.parse(await readFile(new URL("../.firebaserc", import.meta.url), "utf8"));

const baselineSecurityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const permissionsPolicyByTarget = {
  portal: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
  exam: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
  vendor: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
};

test("every Hosting target routes /api/v1/** to apiV1 before SPA rewrites", () => {
  const hostingTargets = new Map(
    firebaseConfig.hosting.map((hosting) => [hosting.target, hosting]),
  );

  assert.deepEqual([...hostingTargets.keys()].sort(), ["exam", "portal", "vendor"]);

  for (const target of ["portal", "exam", "vendor"]) {
    const rewrites = hostingTargets.get(target)?.rewrites;

    assert.ok(Array.isArray(rewrites), `${target} must define Hosting rewrites`);
    assert.deepEqual(
      rewrites[0],
      {
        source: "/api/v1/**",
        function: {
          functionId: "apiV1",
          region: "us-central1",
        },
      },
      `${target} must route the versioned API before any SPA rewrite`,
    );

    const spaRewriteIndex = rewrites.findIndex(
      (rewrite) =>
        typeof rewrite.destination === "string" && rewrite.destination.endsWith("/index.html"),
    );
    assert.ok(spaRewriteIndex > 0, `${target} SPA rewrite must follow the API rewrite`);
  }
});

test("the dedicated non-production project has explicit Hosting target mappings", () => {
  assert.equal(firebaseRc.projects?.default, NON_PRODUCTION_FIREBASE_MAPPING.projectId);
  assert.deepEqual(
    firebaseRc.targets?.[NON_PRODUCTION_FIREBASE_MAPPING.projectId]?.hosting,
    Object.fromEntries(
      Object.entries(NON_PRODUCTION_FIREBASE_MAPPING.sites).map(([target, site]) => [
        target,
        [site],
      ]),
    ),
  );
});

test("every Hosting target applies the baseline security headers and least-privilege camera policy", () => {
  for (const hosting of firebaseConfig.hosting) {
    assert.equal(hosting.headers?.length, 1, `${hosting.target} must define one header rule`);
    assert.equal(hosting.headers[0].source, "**");
    const configuredHeaders = Object.fromEntries(
      hosting.headers[0].headers.map(({ key, value }) => [key, value]),
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(configuredHeaders).filter(([key]) => key !== "Permissions-Policy"),
      ),
      baselineSecurityHeaders,
      `${hosting.target} must use the reviewed baseline header set`,
    );
    assert.equal(
      configuredHeaders["Permissions-Policy"],
      permissionsPolicyByTarget[hosting.target],
      `${hosting.target} must use its least-privilege camera policy`,
    );
  }
});
