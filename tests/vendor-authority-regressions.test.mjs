import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {componentHarness, nodes, text, control, deferred} from "./helpers/vendor-component-harness.mjs";
const institutePath = "apps/vendor/src/features/institutes/VendorInstituteAuthorityPage.tsx";
const commercialPath = "apps/vendor/src/features/licensing/VendorCommercialAuthorityPage.tsx";
const failure = error => ({kind: error.kind ?? "unavailable", message: error.message, requestId: null});
const list = (items = []) => ({items, totalMatching: items.length, nextCursor: null});
const row = id => ({instituteId: id, registeredName: id, lifecycleState: "active", accessStatus: "enabled", revision: 1,
  updatedAt: null, primaryAdministrator: null, commercial: {authorityState: "unavailable"}, aggregate: {}});
const detail = id => ({...row(id), profile: {registeredName: id}, administrators: [], deletion: {stage: "none"}});
const event = {preventDefault() {}};
async function instituteEnvironment(api, canManage = true) {
  const h = componentHarness(), router = {search: new URLSearchParams(), params: {}};
  const scope = await h.load("apps/vendor/src/features/shared/useVendorReadScope.ts");
  const module = await h.load(institutePath, {
    "../shared/useVendorReadScope": scope,
    "../../portals/vendorAccess": {useVendorCapability: () => canManage},
    "react-router-dom": {Link: "a", useNavigate: () => () => {}, useParams: () => router.params,
      useSearchParams: () => [router.search, value => { router.search = new URLSearchParams(value); }]},
    "./vendorInstitutesApi": {vendorInstitutesApi: api, classifyVendorInstituteFailure: failure, createVendorIdempotencyKey: randomUUID},
  }, "export {InstituteDirectory, InstituteDetailView, OnboardingWorkspace};");
  return {h, router, ...module};
}
async function commercialEnvironment(api) {
  const h = componentHarness(), scope = await h.load("apps/vendor/src/features/shared/useVendorReadScope.ts");
  const module = await h.load(commercialPath, {
    "../shared/useVendorReadScope": scope, "../../portals/vendorAccess": {useVendorCapability: () => true},
    "./vendorCommercialApi": {vendorCommercialApi: api, classifyVendorCommercialFailure: failure,
      createCommercialIdempotencyKey: randomUUID, providerFailure: () => null},
  });
  h.mount(module.default);
  return h;
}

test("directory distinguishes loading, verified empty and failure; superseded filters cannot restore old rows", async () => {
  const reads = [], env = await instituteEnvironment({listInstitutes: query => {
    const d = deferred(); reads.push({...d, query}); return d.promise;
  }}), {h} = env;
  h.mount(env.InstituteDirectory); await h.flush();
  assert.match(text(h.tree), /Loading institutes/u); assert.doesNotMatch(text(h.tree), /No institutes match/u);
  reads[0].resolve(list([row("old_institute")])); await h.flush();
  assert.match(text(h.tree), /old_institute/u);
  const select = nodes(h.tree).find(node => node?.type === "select");
  select.props.onChange({target: {value: "suspended"}});
  h.render(); // Before effects: old query authority must already be hidden.
  assert.doesNotMatch(text(h.tree), /old_institute/u); await h.flush();
  nodes(h.tree).find(node => node?.type === "select").props.onChange({target: {value: "archived"}});
  h.render(); await h.flush();
  reads[2].resolve(list()); await h.flush();
  assert.match(text(h.tree), /No institutes match/u);
  reads[1].resolve(list([row("late_superseded")])); await h.flush();
  assert.doesNotMatch(text(h.tree), /late_superseded/u);
  control(h.tree, "button", "Clear").props.onClick(); h.render(); await h.flush();
  reads[3].reject(new Error("source offline")); await h.flush();
  assert.match(text(h.tree), /source offline/u); assert.doesNotMatch(text(h.tree), /No institutes match/u);
  h.unmount();
});

test("detail aborts superseded targets and ignores late success, late rejection and unmounted completions", async () => {
  const reads = [], env = await instituteEnvironment({getInstitute: (id, signal) => {
    const d = deferred(); reads.push({...d, id, signal}); return d.promise;
  }}), {h} = env;
  h.mount(env.InstituteDetailView, {instituteId: "a"}); await h.flush();
  h.render({instituteId: "b"}); await h.flush();
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve(detail("current_b")); await h.flush();
  reads[0].resolve(detail("stale_a")); await h.flush();
  assert.match(text(h.tree), /current_b/u); assert.doesNotMatch(text(h.tree), /stale_a/u);
  h.render({instituteId: "c"}); await h.flush();
  h.render({instituteId: "d"}); await h.flush();
  reads[2].reject(new Error("late_target_failure")); await h.flush();
  assert.doesNotMatch(text(h.tree), /late_target_failure|current_b/u);
  h.unmount(); assert.equal(reads[3].signal.aborted, true);
  reads[3].resolve(detail("unmounted_d")); await h.flush();
});

test("committed profile plus failed reconciliation never reports success; synchronous handler exclusion survives render delay", async () => {
  const read = deferred(), mutation = deferred(); let loads = 0, writes = 0;
  const env = await instituteEnvironment({getInstitute: async () => ++loads === 1 ? detail("a") : read.promise,
    updateInstitute: async (id, body) => { writes++; assert.equal(id, "a"); assert.equal(body.expectedRevision, 1); await mutation.promise; return {}; }});
  const {h} = env; h.mount(env.InstituteDetailView, {instituteId: "a"}); await h.flush();
  const submit = control(h.tree, "form", "Vendor-owned profile").props.onSubmit;
  submit(event); submit(event); assert.equal(writes, 1);
  mutation.resolve(); await h.flush();
  assert.doesNotMatch(text(h.tree), /Profile saved/u);
  read.reject(new Error("post_commit_read_failed")); await h.flush();
  assert.match(text(h.tree), /post_commit_read_failed/u); assert.doesNotMatch(text(h.tree), /Profile saved|revision 1/u);
  h.unmount();
});

test("onboarding selection ignores old detail responses and failed selected loads cannot fabricate an empty application", async () => {
  const reads = [], env = await instituteEnvironment({listOnboarding: async () => list([{onboardingId: "a", registeredName: "Application A", status: "draft", revision: 1}]),
    getOnboarding: (id, _query, signal) => { const d = deferred(); reads.push({...d, id, signal}); return d.promise; }});
  const {h, router} = env; router.search = new URLSearchParams({onboarding: "a"});
  h.mount(env.OnboardingWorkspace); await h.flush();
  router.search = new URLSearchParams({onboarding: "b"}); h.render(); await h.flush();
  assert.equal(reads[0].signal.aborted, true);
  reads[0].resolve({registeredName: "stale_application"}); await h.flush();
  assert.doesNotMatch(text(h.tree), /stale_application/u);
  reads[1].reject(new Error("selected_application_offline")); await h.flush();
  assert.match(text(h.tree), /selected_application_offline/u);
  assert.doesNotMatch(text(h.tree), /No onboarding records/u); h.unmount();
});

test("commercial distinguishes failed partial snapshots from verified empty across all five workspace views", async () => {
  const catalog = deferred(); let fail = true;
  const h = await commercialEnvironment({listLicenseRequests: async () => list(), getLicenseCatalog: () => fail ? catalog.promise : Promise.resolve({catalogRevision: 1, plans: []}),
    listInvoices: async () => list(), listPaymentEvents: async () => list()});
  await h.flush(); assert.match(text(h.tree), /Loading commercial authority/u);
  assert.doesNotMatch(text(h.tree), /No license requests available/u);
  catalog.reject(new Error("catalog_source_offline")); await h.flush();
  assert.match(text(h.tree), /catalog_source_offline/u);
  for (const tab of ["Catalog", "Subscriptions", "Invoices", "Events", "Requests"]) {
    control(h.tree, "button", tab).props.onClick(); h.render();
    assert.doesNotMatch(text(h.tree), /No .* available|Publish new immutable version/u);
  }
  fail = false; control(h.tree, "button", "Retry authoritative load").props.onClick(); await h.flush();
  assert.match(text(h.tree), /No license requests available/u);
  control(h.tree, "button", "Catalog").props.onClick(); h.render();
  assert.match(text(h.tree), /No catalog versions available/u);
  control(h.tree, "button", "Invoices").props.onClick(); h.render();
  assert.match(text(h.tree), /No invoices available/u); h.unmount();
});

test("commercial same resource ID in two institutes retains latest selected authority and suppresses late tenant errors", async () => {
  const reads = [], h = await commercialEnvironment({
    listLicenseRequests: async () => list(["a", "b"].map(instituteId => ({instituteId, requestId: "shared_id", currentLayer: "L0", requestedLayer: "L1", status: "pending"}))),
    getLicenseCatalog: async () => ({catalogRevision: 1, plans: []}), listInvoices: async () => list(), listPaymentEvents: async () => list(),
    getLicenseRequest: (instituteId, requestId, signal) => { const d = deferred(); reads.push({...d, instituteId, requestId, signal}); return d.promise; },
  });
  await h.flush();
  let buttons = nodes(h.tree).filter(node => node?.type === "button" && text(node.props.children) === "shared_id");
  buttons[0].props.onClick(); buttons[1].props.onClick(); await h.flush();
  assert.deepEqual(reads.map(r => [r.instituteId, r.requestId]), [["a", "shared_id"], ["b", "shared_id"]]);
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve({requestId: "shared_id", reason: "current_tenant_b", revision: 2, decisionState: "pending", status: "pending"}); await h.flush();
  reads[0].reject(new Error("stale_tenant_a_failure")); await h.flush();
  assert.match(text(h.tree), /current_tenant_b/u); assert.doesNotMatch(text(h.tree), /stale_tenant_a_failure/u);
  h.unmount();
});

test("read-only institute identity disables profile, lifecycle and administrator dispatch", async () => {
  let writes = 0;
  const env = await instituteEnvironment({getInstitute: async () => detail("a"), updateInstitute: async () => { writes++; }, commandAdministrator: async () => { writes++; }}, false);
  const {h} = env; h.mount(env.InstituteDetailView, {instituteId: "a"}); await h.flush();
  assert.equal(control(h.tree, "button", "Save and reload").props.disabled, true);
  assert.equal(control(h.tree, "button", "Run command and reload").props.disabled, true);
  for (const [label, value] of [["Administrator name", "Reviewed Name"], ["Administrator email", "admin@example.test"]]) {
    nodes(control(h.tree, "label", label)).find(node => node?.type === "input").props.onChange({target: {value}});
  }
  h.render();
  const invite = control(h.tree, "button", "Invite primary administrator");
  assert.equal(invite.props.disabled, true); invite.props.onClick();
  control(h.tree, "form", "Vendor-owned profile").props.onSubmit(event); await h.flush();
  assert.equal(writes, 0); h.unmount();
});

for (const conflict of [false, true]) test(conflict
  ? "commercial conflict preserves freshly reloaded revision for a new decision"
  : "commercial committed decision with failed detail reload hides stale authority and success", async () => {
  let selectedReads = 0, writes = 0;
  const selected = {instituteId: "tenant_a", requestId: "shared_id", currentLayer: "L0", requestedLayer: "L1", status: "pending",
    reason: "review me", revision: 1, decisionState: "pending"};
  const h = await commercialEnvironment({listLicenseRequests: async () => list([selected]),
    getLicenseCatalog: async () => ({catalogRevision: 1, plans: []}), listInvoices: async () => list(), listPaymentEvents: async () => list(),
    getLicenseRequest: async () => {
      if (++selectedReads > 1 && !conflict) throw new Error("committed_detail_offline");
      return {...selected, revision: selectedReads};
    },
    decideLicenseRequest: async (instituteId, requestId, body) => {
      writes++; assert.deepEqual([instituteId, requestId, body.expectedRevision], ["tenant_a", "shared_id", 1]);
      if (conflict) throw Object.assign(new Error("revision conflict"), {kind: "conflict"});
      return {};
    },
  });
  await h.flush(); control(h.tree, "button", "shared_id").props.onClick(); await h.flush();
  control(h.tree, "form", "Request shared_id").props.onSubmit(event); await h.flush();
  assert.equal(writes, 1); assert.doesNotMatch(text(h.tree), /Decision persisted/u);
  if (conflict) {
    assert.match(text(h.tree), /Authoritative conflict/u); assert.match(text(h.tree), /Revision 2/u);
    assert.equal(control(h.tree, "button", "Persist decision and reload").props.disabled, false);
  } else {
    assert.match(text(h.tree), /committed_detail_offline/u); assert.doesNotMatch(text(h.tree), /Revision 1|No license requests available/u);
  }
  h.unmount();
});

test("Audit cursor navigation retains Previous history while query-keyed reads replace the page", async () => {
  const h = componentHarness(); let params = new URLSearchParams("limit=2");
  const queries = [];
  const hooks = await h.load("apps/vendor/src/features/audit/useVendorAuditHealth.ts", {
    "../../../../../shared/services/authProvider": {useAuthProvider: () => ({session: {status: "authenticated", user: {uid: "vendor_a"}, idToken: "token_a"}})},
    "./vendorAuditHealthApi": {auditHealthFailure: failure, vendorAuditHealthApi: {audit: async (query, signal) => {
      queries.push({query, signal});
      return {generatedAt: "2026-10-15T00:00:00.000Z", hasMore: !query.cursor, nextCursor: query.cursor ? null : "next_cursor",
        items: [{eventId: query.cursor ? "e2" : "e0", summary: query.cursor ? "second_page" : "first_page", occurredAt: "2026-10-15T00:00:00.000Z", category: "institute", status: "completed", action: "update_profile", institute: null, metadata: {}}]};
    }}},
  });
  const response = await h.load("apps/vendor/src/features/audit/vendorAuditHealthResponse.ts");
  const status = await h.load("apps/vendor/src/features/audit/VendorAuditHealthStatus.tsx");
  const page = await h.load("apps/vendor/src/features/audit/VendorAuditAuthorityPage.tsx", {
    "react-router-dom": {useSearchParams: () => [params, next => { params = new URLSearchParams(next); }]},
    "./vendorAuditHealthResponse": response, "./useVendorAuditHealth": hooks, "./VendorAuditHealthStatus": status,
  });
  h.mount(page.default); await h.flush();
  assert.match(text(h.tree), /first_page/u);
  assert.equal(control(h.tree, "button", "Previous audit page").props.disabled, true);
  control(h.tree, "button", "Next audit page").props.onClick(); h.render(); await h.flush();
  assert.match(text(h.tree), /second_page/u); assert.doesNotMatch(text(h.tree), /first_page/u);
  assert.equal(control(h.tree, "button", "Previous audit page").props.disabled, false);
  assert.equal(queries[0].signal.aborted, true); assert.equal(queries[1].query.cursor, "next_cursor");
  control(h.tree, "button", "Previous audit page").props.onClick(); h.render(); await h.flush();
  assert.match(text(h.tree), /first_page/u); assert.equal(params.has("cursor"), false);
  assert.equal(control(h.tree, "button", "Previous audit page").props.disabled, true);
  h.unmount();
});
