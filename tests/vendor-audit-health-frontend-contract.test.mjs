import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
function load(source, dependencies = {}) {
  const module = {exports: {}};
  new Function("exports", "module", "require", ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText)(
    module.exports, module, name => { assert.ok(name in dependencies, name); return dependencies[name]; });
  return module.exports;
}
const parsers = load(await read("apps/vendor/src/features/audit/vendorAuditHealthResponse.ts"));
const at = "2026-10-13T00:00:00.000Z";
const metadata = Object.fromEntries(["operationId", "requestId", "invoiceId", "versionId", "cycleId", "eventType", "processingState", "reconciliationState", "previousLicenseLayer", "nextLicenseLayer", "amountMinor", "currency", "affectedInstituteCount", "revision"].map(key => [key, null]));
const event = {eventId: "audit_" + "a".repeat(24), occurredAt: at, source: "vendor_command_audit", category: "institute", status: "completed",
  action: "update_profile", summary: "Vendor updated profile.", actor: {userId: "vendor", role: "vendor"},
  institute: {instituteId: "inst_a", displayName: null}, target: {kind: "institute", targetId: "inst_a"}, metadata};
const page = {generatedAt: at, items: [event], hasMore: false, nextCursor: null};
const queue = {totalCount: 1, outstandingCount: 1, processingCount: 0, retryingCount: 0, succeededCount: 0, failedCount: 0, oldestOutstandingAt: at, newestActivityAt: at};
const available = data => ({availability: "available", observedAt: at, data});
const unsupported = Object.fromEntries(parsers.unavailableHealthNames.map(key => [key, {availability: "unavailable", observedAt: at,
  reason: ["cloudMonitoring", "errorReporting"].includes(key) ? "adapter_not_implemented" : "no_durable_source"}]));
const health = {generatedAt: at, release: available({releaseId: "unit-release", commitSha: "a".repeat(40), builtAt: at, environment: "test", functionsRevision: null}),
  failureRecovery: available(queue), emailDelivery: available(queue), stripeReconciliation: available(queue), calibrationOperations: available(queue), ...unsupported};

test("audit adapter validates closed nested metadata, selected filters, order, cursor and sparse pages", () => {
  assert.deepEqual(parsers.parseVendorAuditEvents(page, {category: "institute", limit: 1, instituteId: "inst_a", from: at, to: at}), page);
  for (const mutate of [p => {p.total = 1;}, p => {p.items[0].metadata.rawPayload = "private";}, p => {p.items[0].actor.email = "private";},
    p => {p.items[0].metadata.amountMinor = -1;}, p => {p.items[0].eventId = "evt_provider";}, p => {p.items[0].occurredAt = "yesterday";},
    p => {p.items[0].target = {kind: "payment_event", targetId: "evt_private"};}, p => {p.items.push({...event});},
    p => {p.nextCursor = "unexpected";}, p => {p.hasMore = true;}, p => {p.items[0].metadata.currency = "inr";},
    p => {p.items[0].metadata.processingState = "fake";}, p => {delete p.items[0].metadata.revision;},
  ]) { const bad = structuredClone(page); mutate(bad); assert.throws(() => parsers.parseVendorAuditEvents(bad, {limit: 2})); }
  for (const query of [{category: "billing"}, {status: "failed"}, {instituteId: "other"}, {from: "2026-10-14T00:00:00.000Z"}]) assert.throws(() => parsers.parseVendorAuditEvents(page, query));
  assert.throws(() => parsers.parseVendorAuditEvents({...page, items: [event, {...event, eventId: "audit_" + "b".repeat(24), occurredAt: "2026-10-14T00:00:00.000Z"}]}));
  assert.deepEqual(parsers.parseVendorAuditEvents({generatedAt: at, items: [], hasMore: true, nextCursor: "opaque_cursor"}), {generatedAt: at, items: [], hasMore: true, nextCursor: "opaque_cursor"});
  assert.throws(() => parsers.parseVendorAuditEvents({generatedAt: at, items: [], hasMore: true, nextCursor: "same"}, {cursor: "same"}));
  const ties = {...page, items: [{...event, eventId: "audit_" + "z".repeat(24)}, event]};
  assert.deepEqual(parsers.parseVendorAuditEvents(ties), ties, "opaque IDs do not define private tie order");
});

test("URL and request filters reject duplicates, nested/scope intent, coercion and invalid ranges", () => {
  assert.deepEqual(parsers.parseAuditSearch(new URLSearchParams("category=license&limit=2")), {category: "license", limit: 2});
  for (const query of ["limit=2&limit=2", "limit=01", "limit=51", "category[foo]=billing", "scope=global", "category=bad", "from=invalid", "cursor=", "instituteId=bad/path"]) {
    assert.throws(() => parsers.parseAuditSearch(new URLSearchParams(query)), query);
  }
  for (const query of [{limit: "25"}, {limit: 0}, {from: "2026-10-14T00:00:00.000Z", to: at}, {cursor: "="}, {actorId: "forged"}]) assert.throws(() => parsers.parseAuditQuery(query));
});

test("health adapter rejects fabricated posture, unavailable data and malformed or contradictory counts", () => {
  assert.deepEqual(parsers.parseVendorSystemHealth(health), health);
  for (const mutate of [h => {h.healthy = true;}, h => {h.cloudMonitoring = available({value: 1});}, h => {h.emailDelivery.data.totalCount = 1001;},
    h => {h.emailDelivery.data.processingCount = 2;}, h => {h.release.data.commitSha = "abc";}, h => {h.release.data.environment = "unknown";},
    h => {h.emailDelivery.observedAt = "2026-10-14T00:00:00.000Z";}, h => {h.emailDelivery.data.oldestOutstandingAt = null;},
    h => {h.deploymentHistory.reason = "source_unavailable";}, h => {h.emailDelivery.data.outstandingCount = "1";}, h => {h.emailDelivery.rawJobs = [];},
  ]) { const bad = structuredClone(health); mutate(bad); assert.throws(() => parsers.parseVendorSystemHealth(bad)); }
  const partial = structuredClone(health); partial.emailDelivery = {availability: "unavailable", reason: "source_limit_exceeded", observedAt: at};
  assert.deepEqual(parsers.parseVendorSystemHealth(partial), partial);
  const empty = structuredClone(health); empty.emailDelivery = available({...queue, totalCount: 0, outstandingCount: 0, oldestOutstandingAt: null, newestActivityAt: null});
  assert.deepEqual(parsers.parseVendorSystemHealth(empty), empty);
});

test("shared authenticated API uses exact intent and sanitizes failure classification", async () => {
  const calls = []; const client = {get: async (...args) => {calls.push(args); return args;}};
  class ApiClientError extends Error {}
  const {vendorAuditHealthApi: api, auditHealthFailure} = load(await read("apps/vendor/src/features/audit/vendorAuditHealthApi.ts"), {
    "../../../../../shared/services/apiClient": {ApiClientError},
    "../../../../../shared/services/portalIntegration": {getPortalApiClient: portal => {assert.equal(portal, "vendor"); return client;}},
    "./vendorAuditHealthResponse": parsers,
  });
  const controller = new AbortController(); await api.audit({limit: 2}, controller.signal); await api.health(controller.signal);
  assert.deepEqual(calls.map(([path]) => path), ["/vendor/audit-events", "/vendor/system-health"]);
  assert.equal(calls[0][1].signal, controller.signal); assert.deepEqual(calls[0][1].query, {limit: 2});
  assert.equal(calls[1][1].query, undefined); assert.equal(calls[1][1].body, undefined);
  assert.deepEqual(calls[0][1].responseAdapter(page), page); assert.deepEqual(calls[1][1].responseAdapter(health), health);
  for (const [status, kind] of [[400, "validation"], [401, "permission"], [403, "permission"], [500, "unavailable"]]) {
    const failure = auditHealthFailure(Object.assign(new ApiClientError("private detail"), {status, requestId: "safe-request"}));
    assert.equal(failure.kind, kind); assert.equal(failure.requestId, "safe-request"); assert.doesNotMatch(failure.message, /private detail/);
  }
});

test("mounted live authority isolates DEV showcases, aborts stale requests and bounds page-local history", async () => {
  const live = (await Promise.all(["audit/VendorAuditAuthorityPage.tsx", "system-health/VendorSystemHealthAuthorityPage.tsx", "overview/VendorOverviewAuthorityPage.tsx", "audit/useVendorAuditHealth.ts"].map(file => read(`apps/vendor/src/features/${file}`)))).join("\n");
  assert.doesNotMatch(live, /getVendorCalibrationDataset|getVendorSystemHealthDataset|getVendorInstitutesDataset|localStorage|appendCalibrationAudit|All clear|Active globally/);
  for (const [file, component] of [["audit/VendorUnifiedAuditWorkspace.tsx", "VendorAuditAuthorityPage"], ["system-health/VendorSystemHealthDashboardPage.tsx", "VendorSystemHealthAuthorityPage"]]) {
    const wrapper = await read(`apps/vendor/src/features/${file}`);
    assert.match(wrapper, /import\.meta\.env\.DEV \? lazy/u); assert.match(wrapper, /FixturePage && shouldUseFixtureData\(\)/u); assert.ok(wrapper.includes(`<${component} />`));
  }
  for (const marker of ["AbortController", "state.key === key", "session.user?.uid", "session.idToken", "slice(-50)", "Search this page", "Previous audit page", "Next audit page", "useVendorAudit({ limit: 6 })"]) assert.ok(live.includes(marker), marker);
});

test("authority hooks hide old query/session data and ignore late success or failure after abort", async () => {
  const slots = [], pendingEffects = [], requests = [];
  let index = 0, session = {status: "authenticated", user: {uid: "vendor_a"}, idToken: "memory-token-a"};
  const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => {slots[slot] = typeof value === "function" ? value(slots[slot]) : value;}];
    },
    useCallback(callback, deps) {
      const slot = index++;
      if (!same(slots[slot]?.deps, deps)) slots[slot] = {deps, callback};
      return slots[slot].callback;
    },
    useEffect(effect, deps) {
      const slot = index++;
      if (!same(slots[slot]?.deps, deps)) {
        slots[slot]?.cleanup?.();
        slots[slot] = {deps};
        pendingEffects.push(() => {slots[slot].cleanup = effect();});
      }
    },
  };
  const hooks = load(await read("apps/vendor/src/features/audit/useVendorAuditHealth.ts"), {
    react,
    "../../../../../shared/services/authProvider": {useAuthProvider: () => ({session})},
    "./vendorAuditHealthApi": {auditHealthFailure: () => ({kind: "unavailable"}), vendorAuditHealthApi: {
      audit: (query, signal) => new Promise((resolve, reject) => requests.push({query, signal, resolve, reject})),
    }},
  });
  const render = query => {index = 0; return hooks.useVendorAudit(query);};
  const flush = async () => {pendingEffects.splice(0).forEach(effect => effect()); await Promise.resolve(); await Promise.resolve();};
  render({limit: 2}); await flush();
  requests[0].resolve(page); await flush();
  assert.deepEqual(render({limit: 2}).data, page);
  assert.equal(render({limit: 1}).data, null); await flush();
  assert.equal(requests[0].signal.aborted, true);
  session = {...session, idToken: "memory-token-b"};
  assert.equal(render({limit: 1}).data, null); await flush();
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve({private: "STALE_QUERY"}); await flush();
  assert.equal(render({limit: 1}).data, null);
  session = {...session, user: {uid: "vendor_b"}};
  assert.equal(render({limit: 1}).data, null); await flush();
  requests[2].reject(new Error("STALE_SESSION")); await flush();
  assert.equal(render({limit: 1}).failure, null);
  requests[3].resolve(page); await flush();
  const current = render({limit: 1}); assert.deepEqual(current.data, page);
  assert.deepEqual(Object.keys(current).sort(), ["data", "failure", "loading", "retry"]);
  current.retry(); assert.equal(render({limit: 1}).data, null); await flush();
  session = {status: "unauthenticated", user: null, idToken: null};
  assert.equal(render({limit: 1}).data, null); await flush();
  assert.equal(requests[4].signal.aborted, true);
  requests[4].resolve({private: "SIGNED_OUT"}); await flush();
  assert.equal(render({limit: 1}).data, null);
  assert.equal(render({limit: 1}).loading, false);
});
