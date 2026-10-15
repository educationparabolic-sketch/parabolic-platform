import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
import {root, ts} from "./helpers/vendor-action-inventory.mjs";
const require = createRequire(import.meta.url);
const read = path => readFile(`${root}/${path}`, "utf8");
function load(source, resolve = () => { throw new Error("Unexpected dependency"); }) {
  const module = {exports: {}};
  new Function("exports", "module", "require", ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText)(module.exports, module, resolve);
  return module.exports;
}
const [policySource, serverSource, globalSource, accessSource, routesSource, ledgerSource] = await Promise.all([
  read("shared/contracts/capabilityPolicy.ts"), read("functions/src/policy/vendorRolePolicy.ts"),
  read("shared/services/globalPortalState.tsx"), read("apps/vendor/src/portals/vendorAccess.ts"),
  read("apps/admin/src/portals/vendorRoutes.ts"), read("apps/vendor/src/portals/vendorActionLedger.ts"),
]);
const policy = load(policySource), server = load(serverSource);
const global = load(globalSource, name => {
  if (name === "react") return require(`${root}/apps/vendor/node_modules/react`);
  if (name === "react/jsx-runtime") return require(`${root}/apps/vendor/node_modules/react/jsx-runtime`);
  if (name.endsWith("capabilityPolicy")) return policy;
  if (name.endsWith("frontendEnvironment")) return {getFrontendEnvironment: () => ({dataMode: "live"})};
  if (name.endsWith("authProvider")) return {useAuthProvider: () => { throw new Error("No hook execution here"); }};
  throw new Error(name);
});
const access = load(accessSource, name => {
  if (name.endsWith("capabilityPolicy")) return policy;
  if (name.endsWith("globalPortalState")) return global;
  if (name.endsWith("authProvider")) return {useAuthProvider: () => { throw new Error("No hook execution here"); }};
  throw new Error(name);
});
const routes = load(routesSource, () => policy);
const ledger = load(ledgerSource);
const session = claims => ({status: "authenticated", user: null, authorityIssue: null,
  idToken: `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`});

test("deployable Vendor capabilities and claim predicate match the shared policy exactly", () => {
  const capabilities = Object.keys(policy.CAPABILITY_MATRIX).filter(key => key.startsWith("vendor.") || key === "portal.vendor.access");
  assert.deepEqual(Object.keys(server.VENDOR_CAPABILITY_ROLES), capabilities);
  for (const capability of capabilities) assert.deepEqual(server.VENDOR_CAPABILITY_ROLES[capability], policy.CAPABILITY_MATRIX[capability].allowedRoles);
  for (const role of [undefined, "vendor", "admin", "teacher", "director", "student", "Vendor", null]) {
    for (const isVendor of [undefined, true, false, "true", null]) {
      for (const isSuspended of [undefined, false, true, "false", null]) {
        for (const userRole of [undefined, "vendor", "admin"]) {
          const claims = {role, isVendor, isSuspended, userRole};
          const expected = role === "vendor" && [undefined, true].includes(isVendor) &&
            [undefined, false].includes(isSuspended) && [undefined, "vendor"].includes(userRole);
          assert.equal(policy.hasConsistentVendorClaims(claims), expected);
          assert.equal(server.hasConsistentVendorClaims(claims), expected);
        }
      }
    }
  }
  for (const suspended of [true, "false", null]) assert.equal(server.hasConsistentVendorClaims({role: "vendor", suspended}), false);
});

test("canonical metadata, navigation and admission enforce each owning capability including composed reads", () => {
  const allowed = access.resolveVendorAccessContext(session({role: "vendor", licenseLayer: "L0"}));
  assert.equal(allowed.canAccessVendorPortal, true);
  assert.equal(routes.getVisibleVendorRoutes(allowed).length, 9);
  for (const entry of ledger.VENDOR_ROUTE_LEDGER) {
    const route = routes.matchVendorRoute(entry.path.replace(":instituteId", "test_institute"));
    assert.equal(route.definition.capability, entry.capability);
    assert.deepEqual(route.definition.readCapabilities, entry.readCapabilities);
    assert.deepEqual(route.definition.allowedRoles, policy.CAPABILITY_MATRIX[entry.capability].allowedRoles);
    assert.equal(routes.evaluateVendorRoutePermissions(route, allowed).allowed, true);
    const blocked = {...allowed, canUseCapability: cap => cap !== entry.capability};
    assert.equal(routes.evaluateVendorRoutePermissions(route, blocked).allowed, false);
    assert.equal(routes.getVisibleVendorRoutes(blocked).some(item => item.path === entry.path), false);
  }
  const overview = routes.matchVendorRoute("/vendor/overview");
  assert.equal(routes.evaluateVendorRoutePermissions(overview, {...allowed, canUseCapability: cap => cap !== "vendor.audit.read"}).allowed, false);
  assert.equal(allowed.canUseCapability("admin.students.manage"), false);
});

test("browser authority fails closed for token contradictions, suspension, wrong roles and revoked sessions", () => {
  for (const claims of [{role: "admin", isVendor: true}, {role: "vendor", isVendor: false}, {role: "vendor", userRole: "admin"},
    {role: "vendor", isVendor: "true"}, {role: "vendor", isSuspended: true}, {role: "vendor", suspended: true}]) {
    const context = access.resolveVendorAccessContext(session(claims));
    assert.equal(context.canAccessVendorPortal, false);
    assert.deepEqual(routes.getVisibleVendorRoutes(context), []);
    for (const route of routes.VENDOR_ROUTE_DEFINITIONS) assert.equal(routes.evaluateVendorRoutePermissions({definition: route, params: {}}, context).allowed, false);
  }
  for (const overrides of [{status: "unauthenticated"}, {authorityIssue: "session_revoked"}]) {
    assert.equal(access.resolveVendorAccessContext({...session({role: "vendor"}), ...overrides}).canAccessVendorPortal, false);
  }
  // An institute-bound signal must not revoke a global Vendor's unrelated domain authority.
  assert.equal(access.resolveVendorAccessContext({...session({role: "vendor"}), authorityIssue: "institute_suspended"}).canAccessVendorPortal, true);
});

test("all live domain boundaries call one fresh identity guard before domain services and preserve revocation verification", async () => {
  for (const [file, capability] of [
    ["vendorInstitutes", "capability"], ["vendorCommercial", '"vendor.licenses.manage"'], ["vendorSupport", '"vendor.support.manage"'],
    ["vendorCalibrationBoundary", "VENDOR_CALIBRATION_CAPABILITY"], ["vendorIntelligenceReadBoundary", "VENDOR_INTELLIGENCE_CAPABILITY"], ["vendorAuditHealthBoundary", "capability"],
  ]) {
    const source = await read(`functions/src/api/${file}.ts`);
    assert.ok(source.includes(`assertCurrentVendorIdentity(request, dependencies, ${capability})`), file);
    assert.match(source, /allowedRoles: VENDOR_CAPABILITY_ROLES\[/u);
    assert.doesNotMatch(source, /claims\.role !== "vendor" && claims\.isVendor !== true/u);
  }
  const guard = await read("functions/src/middleware/currentVendor.ts");
  assert.ok(guard.indexOf("dependencies.getUser(identity.uid)") < guard.indexOf("return {user, actorId: identity.uid}"));
  assert.match(guard, /user\.disabled \|\| !hasConsistentVendorClaims/u);
  assert.match(guard, /auth\/user-not-found/u);
  const app = await read("apps/vendor/src/App.tsx");
  assert.match(app, /evaluateVendorRoutePermissions\(route, accessContext\)/u);
  assert.match(app, /getVisibleVendorRoutes\(accessContext\)/u);
  for (const [file, capability] of [["institutes/VendorInstituteAuthorityPage", "vendor.institutes.manage_lifecycle"], ["licensing/VendorCommercialAuthorityPage", "vendor.licenses.manage"], ["calibration/VendorCalibrationWorkspace", "vendor.calibration.manage"]]) {
    const source = await read(`apps/vendor/src/features/${file}.tsx`);
    assert.ok(source.includes(`useVendorCapability("${capability}")`));
    assert.match(source, /if \(!canManage/u);
    assert.match(source, /disabled=\{[^}]*!canManage/u);
  }
  assert.match(await read("apps/vendor/src/features/calibration/VendorCalibrationPublish.tsx"), /resolveVendorAccessContext\(session\)\.canUseCapability\("vendor.calibration.manage"\)/u);
});
