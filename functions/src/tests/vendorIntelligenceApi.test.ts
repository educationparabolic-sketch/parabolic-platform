import assert from "node:assert/strict";
import test from "node:test";
import {createVendorIntelligenceInitializeHandler} from "../api/vendorIntelligenceInitialize";
import {createVendorRevenueAnalyticsHandler} from "../api/vendorRevenueAnalytics";
import {createVendorLayerDistributionHandler} from "../api/vendorLayerDistribution";
import {createVendorChurnTrackingHandler} from "../api/vendorChurnTracking";
import {createVendorRevenueForecastingHandler} from "../api/vendorRevenueForecasting";
import {VendorIntelligenceReadError} from "../services/vendorIntelligenceReadModel";
import {VendorRevenueAnalyticsError} from "../services/vendorRevenueAnalytics";
import {VendorLayerDistributionError} from "../services/vendorLayerDistribution";
import {VendorChurnTrackingError} from "../services/vendorChurnTracking";
import {VendorRevenueForecastingError} from "../services/vendorRevenueForecasting";
import {createMockRequest, createMockResponse} from "./helpers/http";

const cases = [
  [createVendorIntelligenceInitializeHandler, "initializePlatform", VendorIntelligenceReadError],
  [createVendorRevenueAnalyticsHandler, "computeRevenueAnalytics", VendorRevenueAnalyticsError],
  [createVendorLayerDistributionHandler, "computeLayerDistribution", VendorLayerDistributionError],
  [createVendorChurnTrackingHandler, "computeChurnTracking", VendorChurnTrackingError],
  [createVendorRevenueForecastingHandler, "computeRevenueForecast", VendorRevenueForecastingError],
] as const;

for (const [factory, method, ServiceError] of cases) {
  test(`${method} enforces current Vendor capability and strict filters before reads`, async () => {
    let reads = 0;
    let observed: unknown;
    let currentUser = {disabled: false, customClaims: {isSuspended: false, role: "vendor", isVendor: true}};
    let tokenRole = "vendor";
    let serviceError: Error | null = null;
    let authError = false;
    const handler = factory({
      getUser: async () => currentUser,
      verifyIdToken: async () => {
        if (authError) throw new Error("revoked");
        return {uid: "intelligence_actor", licenseLayer: "L0", role: tokenRole};
      },
      [method]: async (query: unknown) => {
        reads += 1;
        observed = query;
        if (serviceError) throw serviceError;
        return {metadata: {availability: "empty"}};
      },
    } as never);
    const run = async (query: Record<string, unknown> = {}, body = {}, method = "GET") => {
      const response = Object.assign(createMockResponse(), {
        setHeader: (name: string, value: string) => {
          assert.equal(name, "Allow");
          assert.equal(value, "GET");
        },
      });
      await handler(createMockRequest({
        body, headers: {authorization: "Bearer test-token"}, method, query: query as never,
      }) as never, response as never);
      return response;
    };

    assert.equal((await run({asOfMonth: "2026-08", windowMonths: "3"})).statusCode, 200);
    assert.deepEqual(observed, {asOfMonth: "2026-08", windowMonths: 3});
    assert.equal((await run()).statusCode, 200);
    assert.deepEqual(observed, {});
    for (const query of [
      {windowMonths: "4"}, {windowMonths: "03"}, {windowMonths: "3.0"},
      {windowMonths: ["3", "6"]}, {asOfMonth: "2026-13"}, {asOfMonth: "2026-8"},
      {asOfMonth: ""}, {asOfMonth: {month: "2026-08"}}, {instituteId: "forged"},
      {actorId: "forged"}, {studentId: "forged"}, {examType: "mock"},
    ]) {
      assert.equal((await run(query)).statusCode, 400, JSON.stringify(query));
    }
    assert.equal((await run({}, {role: "vendor"})).statusCode, 400);
    assert.equal((await run({}, {}, "POST")).statusCode, 405);
    assert.equal(reads, 2);
    for (const role of ["student", "teacher", "admin", "director"]) {
      tokenRole = role;
      assert.equal((await run()).statusCode, 403);
    }
    tokenRole = "vendor";
    for (const current of [
      {disabled: true, customClaims: {isSuspended: false, role: "vendor", isVendor: true}},
      {disabled: false, customClaims: {isSuspended: true, role: "vendor", isVendor: true}},
      {disabled: false, customClaims: {isSuspended: false, role: "admin", isVendor: true}},
      {disabled: false, customClaims: {isSuspended: false, role: "vendor", isVendor: false}},
    ]) {
      currentUser = current;
      assert.equal((await run()).statusCode, 403);
    }
    assert.equal(reads, 2);
    currentUser = {disabled: false, customClaims: {isSuspended: false, role: "vendor", isVendor: true}};
    authError = true;
    assert.equal((await run()).statusCode, 401);
    assert.equal(reads, 2);
    authError = false;
    serviceError = new ServiceError("INTERNAL_ERROR", "private authority path");
    const malformed = await run();
    assert.equal(malformed.statusCode, 500);
    assert.equal((malformed.body as {error: {message: string}}).error.message,
      "Vendor intelligence authority is unavailable.");
  });
}
