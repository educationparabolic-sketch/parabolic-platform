/* eslint-disable max-len, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {createVendorAuditEventsHandler} = require("../lib/api/vendorAuditEvents");
const {createVendorSystemHealthHandler} = require("../lib/api/vendorSystemHealth");
const {loadVendorAuditCursorKey} = require("../lib/utils/vendorAuditCursorKey");
const {VendorAuditReadError} = require("../lib/services/vendorAuditReadModel");
const {GoogleAuth} = require("google-auth-library");

const invoke = async (handler, overrides = {}) => {
  const request = {method: "GET", path: "/", url: "/", query: {}, body: {}, rawBody: Buffer.alloc(0),
    headers: {authorization: "Bearer token"}, get: () => undefined,
    header: (name) => name.toLowerCase() === "authorization" ? "Bearer token" : undefined, ...overrides};
  const result = {statusCode: 200, headers: {}};
  const response = {setHeader: (key, value) => {
    result.headers[key] = value;
  },
  status: (code) => {
    result.statusCode = code; return response;
  },
  json: (value) => {
    result.body = value; return response;
  }};
  await handler(request, response);
  return result;
};
const identity = {
  verifyIdToken: async () => ({uid: "vendor", role: "vendor", isVendor: true, licenseLayer: "L0"}),
  getUser: async () => ({uid: "vendor", disabled: false, customClaims: {role: "vendor", isVendor: true}}),
};

test("strict transport rejects ambiguous filters, body bytes and wrong direct paths before reads", async () => {
  let reads = 0;
  const audit = createVendorAuditEventsHandler({...identity, listEvents: async (query) => {
    reads++; return query;
  }});
  const health = createVendorSystemHealthHandler({...identity, read: async () => {
    reads++; return {};
  }});
  for (const [handler, overrides] of [
    [audit, {url: "/?limit=2&limit=2", query: {limit: "2"}}],
    [audit, {url: "/?category[billing]=x", query: {category: {billing: "x"}}}],
    [audit, {url: "/?actorUserId=forged", query: {actorUserId: "forged"}}],
    [audit, {url: "/?limit=01", query: {limit: "01"}}],
    [audit, {rawBody: Buffer.from("{}"), body: {}}],
    [audit, {path: "/vendor/system-health"}],
    [health, {url: "/?limit=2", query: {limit: "2"}}],
    [health, {body: {scope: "global"}}],
  ]) {
    const result = await invoke(handler, overrides);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error.code, "VALIDATION_ERROR");
  }
  assert.equal(reads, 0);
  const result = await invoke(audit, {url: "/?limit=2&category=billing", query: {limit: "2", category: "billing"}});
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, {limit: 2, category: "billing"});
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});

test("current Vendor capability boundary denies changed identity before service invocation", async () => {
  for (const create of [createVendorAuditEventsHandler, createVendorSystemHealthHandler]) {
    for (const user of [
      {disabled: true, customClaims: {role: "vendor"}},
      {customClaims: {role: "student"}},
      {customClaims: {role: "vendor", isSuspended: "true"}},
      {customClaims: {role: "vendor", isVendor: false}},
    ]) {
      const read = async () => assert.fail("unauthorized read");
      const handler = create({...identity, getUser: async () => user, listEvents: read, read});
      const result = await invoke(handler);
      assert.equal(result.statusCode, 403);
      assert.equal(result.body.error.code, "FORBIDDEN");
    }
  }
});

test("source and configuration failures expose fixed redacted errors", async () => {
  for (const error of [new VendorAuditReadError("SOURCE_INVALID", "private/path provider-id"),
    new Error("secret key payload"), new VendorAuditReadError("VALIDATION_ERROR", "private cursor")]) {
    const handler = createVendorAuditEventsHandler({...identity, listEvents: async () => {
      throw error;
    }});
    const result = await invoke(handler);
    assert.equal(result.statusCode, error.code === "VALIDATION_ERROR" ? 400 : 500);
    assert.doesNotMatch(JSON.stringify(result.body), /private|provider-id|secret key payload/);
  }
});

test("cursor key has no fallback and release configuration cannot use local values or latest", async () => {
  const original = {...process.env};
  try {
    process.env.NODE_ENV = "test";
    delete process.env.VENDOR_AUDIT_CURSOR_KEY;
    await assert.rejects(loadVendorAuditCursorKey(), /unavailable/);
    for (const value of ["bad", Buffer.alloc(31).toString("base64url"), `${Buffer.alloc(32).toString("base64url")}=`]) {
      process.env.VENDOR_AUDIT_CURSOR_KEY = value;
      await assert.rejects(loadVendorAuditCursorKey(), /unavailable/);
    }
    process.env.VENDOR_AUDIT_CURSOR_KEY = Buffer.alloc(32, 40).toString("base64url");
    assert.equal((await loadVendorAuditCursorKey()).length, 32);
    for (const mode of ["staging", "production"]) {
      process.env.NODE_ENV = mode;
      process.env.GCLOUD_PROJECT = "parabolic-dev";
      process.env.GOOGLE_CLOUD_PROJECT = "parabolic-dev";
      process.env.PROJECT_ID = "parabolic-dev";
      for (const resource of ["", "projects/parabolic-dev/secrets/key/versions/latest",
        "projects/other/secrets/key/versions/1"]) {
        process.env.VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION = resource;
        await assert.rejects(loadVendorAuditCursorKey(), /unavailable/);
      }
      process.env.VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION = "projects/parabolic-dev/secrets/key/versions/1";
      process.env.PROJECT_ID = "other-project";
      await assert.rejects(loadVendorAuditCursorKey(), /unavailable/);
    }
  } finally {
    for (const key of ["NODE_ENV", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "PROJECT_ID",
      "VENDOR_AUDIT_CURSOR_KEY", "VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION"]) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});

test("release cursor key resolves the pinned authority, validates its response and caches only success", async () => {
  const original = {...process.env};
  const getClient = GoogleAuth.prototype.getClient;
  const resource = "projects/parabolic-dev/secrets/audit-cursor-unit/versions/7";
  let accesses = 0;
  let payload = "invalid";
  GoogleAuth.prototype.getClient = async () => ({request: async (options) => {
    accesses++;
    assert.equal(options.url, `https://secretmanager.googleapis.com/v1/${resource}:access`);
    return {data: {name: "projects/123456/secrets/audit-cursor-unit/versions/7",
      payload: {data: Buffer.from(payload).toString("base64")}}};
  }});
  try {
    process.env.NODE_ENV = "production";
    process.env.GCLOUD_PROJECT = "parabolic-dev";
    process.env.GOOGLE_CLOUD_PROJECT = "parabolic-dev";
    process.env.PROJECT_ID = "parabolic-dev";
    process.env.VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION = resource;
    process.env.VENDOR_AUDIT_CURSOR_KEY = Buffer.alloc(32, 1).toString("base64url");
    await assert.rejects(loadVendorAuditCursorKey(), /unavailable/);
    payload = Buffer.alloc(32, 40).toString("base64url");
    const value = await loadVendorAuditCursorKey();
    assert.deepEqual(value, Buffer.alloc(32, 40));
    value.fill(0);
    assert.deepEqual(await loadVendorAuditCursorKey(), Buffer.alloc(32, 40));
    assert.equal(accesses, 2);
  } finally {
    GoogleAuth.prototype.getClient = getClient;
    for (const key of ["NODE_ENV", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "PROJECT_ID",
      "VENDOR_AUDIT_CURSOR_KEY", "VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION"]) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});
