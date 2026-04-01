import assert from "node:assert/strict";
import test from "node:test";
import {cdnCachePolicyService} from "../services/cdnCachePolicy";

test(
  "initializeConfiguration returns deterministic CDN cache thresholds",
  () => {
    const result = cdnCachePolicyService.initializeConfiguration();

    assert.equal(result.warmAfterDaysWithoutAccess, 30);
    assert.equal(
      result.cachePolicies.hot.cacheControl,
      "public, max-age=86400",
    );
    assert.equal(
      result.cachePolicies.warm.cacheControl,
      "public, max-age=604800",
    );
    assert.equal(
      result.cachePolicies.cold.cacheControl,
      "public, max-age=31536000",
    );
  },
);

test("resolveCachePolicy returns hot for active academic-year assets", () => {
  const result = cdnCachePolicyService.resolveCachePolicy({
    lastAccessedAt: "2026-03-20T00:00:00.000Z",
    now: "2026-04-01T00:00:00.000Z",
  });

  assert.equal(result.tier, "hot");
  assert.equal(result.reason, "activeAcademicYear");
  assert.equal(result.durationSeconds, 86400);
});

test("resolveCachePolicy returns warm after 30 days without access", () => {
  const result = cdnCachePolicyService.resolveCachePolicy({
    lastAccessedAt: "2026-03-01T00:00:00.000Z",
    now: "2026-04-01T00:00:00.000Z",
  });

  assert.equal(result.tier, "warm");
  assert.equal(result.reason, "inactiveMoreThan30Days");
  assert.equal(result.cacheControl, "public, max-age=604800");
});

test(
  "resolveCachePolicy returns cold for archived academic-year assets",
  () => {
    const result = cdnCachePolicyService.resolveCachePolicy({
      archivedAcademicYear: true,
      lastAccessedAt: "2026-03-31T00:00:00.000Z",
      now: "2026-04-01T00:00:00.000Z",
    });

    assert.equal(result.tier, "cold");
    assert.equal(result.reason, "archivedAcademicYear");
    assert.equal(result.durationSeconds, 31536000);
  },
);

test(
  "resolveCacheControlHeader returns the selected Cache-Control value",
  () => {
    const result = cdnCachePolicyService.resolveCacheControlHeader({
      archivedAcademicYear: true,
    });

    assert.equal(result, "public, max-age=31536000");
  },
);

test("resolveCachePolicy rejects invalid date input", () => {
  assert.throws(
    () =>
      cdnCachePolicyService.resolveCachePolicy({
        lastAccessedAt: "not-a-date",
      }),
    /must be a valid date/i,
  );

  assert.throws(
    () =>
      cdnCachePolicyService.resolveCachePolicy({
        lastAccessedAt: "2026-04-02T00:00:00.000Z",
        now: "2026-04-01T00:00:00.000Z",
      }),
    /cannot be in the future/i,
  );
});
