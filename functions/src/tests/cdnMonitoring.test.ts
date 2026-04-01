import assert from "node:assert/strict";
import test from "node:test";
import {
  CdnMonitoringValidationError,
  cdnMonitoringService,
} from "../services/cdnMonitoring";

test("initializeConfiguration returns architecture-aligned CDN targets", () => {
  const result = cdnMonitoringService.initializeConfiguration();

  assert.equal(result.cacheHitRatioTargetPercent, 90);
  assert.equal(result.latencyTargets.questionImage.maxEdgeLatencyMs, 200);
  assert.equal(result.latencyTargets.dashboardImage.maxEdgeLatencyMs, 300);
  assert.equal(result.latencyTargets.pdfDownload.maxEdgeLatencyMs, 2000);
});

test("evaluateSnapshot returns healthy metrics for compliant delivery", () => {
  const result = cdnMonitoringService.evaluateSnapshot({
    assetType: "questionImage",
    bandwidthBytes: 1048576,
    cacheHitCount: 95,
    edgeLatencyMs: 180,
    http4xxCount: 0,
    http5xxCount: 0,
    requestCount: 100,
  });

  assert.equal(result.cacheHitRatioPercent, 95);
  assert.equal(result.bandwidthMegabytes, 1);
  assert.equal(result.edgeLatencyTargetMs, 200);
  assert.equal(result.healthStatus, "healthy");
  assert.deepEqual(result.violations, []);
});

test(
  "evaluateSnapshot marks degraded when cache hit and latency regress",
  () => {
    const result = cdnMonitoringService.evaluateSnapshot({
      assetType: "dashboardImage",
      bandwidthBytes: 3145728,
      cacheHitCount: 80,
      edgeLatencyMs: 320,
      http4xxCount: 2,
      http5xxCount: 0,
      requestCount: 100,
    });

    assert.equal(result.healthStatus, "degraded");
    assert.deepEqual(result.violations, [
      "cacheHitRatioBelowTarget",
      "edgeLatencyAboveTarget",
      "http4xxDetected",
    ]);
    assert.equal(result.http4xxRatePercent, 2);
    assert.equal(result.totalErrorRatePercent, 2);
  },
);

test("evaluateSnapshot marks 5xx failures as critical", () => {
  const result = cdnMonitoringService.evaluateSnapshot({
    assetType: "pdfDownload",
    bandwidthBytes: 7340032,
    cacheHitCount: 40,
    edgeLatencyMs: 2100,
    http4xxCount: 1,
    http5xxCount: 3,
    requestCount: 50,
  });

  assert.equal(result.healthStatus, "critical");
  assert.equal(result.http5xxRatePercent, 6);
  assert.ok(result.violations.includes("http5xxDetected"));
});

test("evaluateSnapshot returns unknown when no requests were observed", () => {
  const result = cdnMonitoringService.evaluateSnapshot({
    assetType: "questionImage",
    bandwidthBytes: 0,
    cacheHitCount: 0,
    edgeLatencyMs: 0,
    http4xxCount: 0,
    http5xxCount: 0,
    requestCount: 0,
  });

  assert.equal(result.healthStatus, "unknown");
  assert.equal(result.cacheHitRatioPercent, 0);
  assert.deepEqual(result.violations, []);
});

test("summarizeSnapshots aggregates totals and worst health status", () => {
  const result = cdnMonitoringService.summarizeSnapshots({
    snapshots: [
      {
        assetType: "questionImage",
        bandwidthBytes: 1048576,
        cacheHitCount: 95,
        edgeLatencyMs: 180,
        http4xxCount: 0,
        http5xxCount: 0,
        requestCount: 100,
      },
      {
        assetType: "dashboardImage",
        bandwidthBytes: 2097152,
        cacheHitCount: 70,
        edgeLatencyMs: 400,
        http4xxCount: 2,
        http5xxCount: 0,
        requestCount: 100,
      },
    ],
  });

  assert.equal(result.requestCount, 200);
  assert.equal(result.cacheHitRatioPercent, 82.5);
  assert.equal(result.bandwidthMegabytes, 3);
  assert.equal(result.healthStatus, "degraded");
  assert.equal(result.assetSummaries.length, 2);
});

test("evaluateSnapshot rejects impossible count combinations", () => {
  assert.throws(
    () =>
      cdnMonitoringService.evaluateSnapshot({
        assetType: "questionImage",
        bandwidthBytes: 100,
        cacheHitCount: 101,
        edgeLatencyMs: 100,
        http4xxCount: 0,
        http5xxCount: 0,
        requestCount: 100,
      }),
    /cacheHitCount/i,
  );

  assert.throws(
    () =>
      cdnMonitoringService.evaluateSnapshot({
        assetType: "questionImage",
        bandwidthBytes: 100,
        cacheHitCount: 90,
        edgeLatencyMs: 100,
        http4xxCount: 10,
        http5xxCount: 91,
        requestCount: 100,
      }),
    CdnMonitoringValidationError,
  );
});
