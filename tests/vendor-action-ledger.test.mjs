import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {declaredVocabulary, inventorySources, mountedRoutes, root, sourceControls, ts} from "./helpers/vendor-action-inventory.mjs";

const read = file => readFile(join(root, file), "utf8");
function loadModule(source, file, resolve = () => { throw new Error("Unexpected ledger dependency"); }) {
  const compiled = ts.transpileModule(source, {fileName: file, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports: {}};
  new Function("exports", "module", "require", compiled)(module.exports, module, resolve);
  return module.exports;
}
const [ledgerSource, controlsSource, routeSource, matrixSource, packageSource, navigationSource, sources] = await Promise.all([
  read("apps/vendor/src/portals/vendorActionLedger.ts"),
  read("apps/vendor/src/portals/vendorControlLedger.ts"),
  read("apps/admin/src/portals/vendorRoutes.ts"),
  read("shared/contracts/capabilityPolicy.ts"),
  read("package.json"),
  read("shared/ui/portalConsistency.ts"),
  inventorySources(),
]);
const ledger = loadModule(ledgerSource, "vendorActionLedger.ts");
const {VENDOR_CONTROL_LEDGER: controls, VENDOR_ACTION_VOCABULARY: vocabulary} = loadModule(controlsSource, "vendorControlLedger.ts");
const matrix = loadModule(matrixSource, "capabilityPolicy.ts").CAPABILITY_MATRIX;
const routes = loadModule(routeSource, "vendorRoutes.ts", name => {
  assert.ok(name.endsWith("shared/contracts/capabilityPolicy"));
  return {CAPABILITY_MATRIX: matrix};
});
const actions = new Map(ledger.VENDOR_ACTION_LEDGER.map(action => [action.id, action]));
const sorted = values => [...values].sort();
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label);
const FIELD_TAGS = new Set(["input", "select", "textarea"]);
const EXPECTED_ROUTES = ["/vendor/overview", "/vendor/institutes", "/vendor/institutes/:instituteId", "/vendor/licensing", "/vendor/calibration", "/vendor/calibration/simulate", "/vendor/calibration/history", "/vendor/intelligence", "/vendor/system-health", "/vendor/audit"];

// Independent intent ownership: a source binding cannot silently reclassify a mutation as local UI.
const BUSINESS_BINDINGS = {
  "features/institutes/VendorInstituteAuthorityPage.tsx": {
    updateProfile: "institutes.profile", transitionLifecycle: "institutes.lifecycle", administratorCommand: "institutes.administrator",
    createOnboarding: "onboarding.create", runOnboardingCommand: "onboarding.command", provisionInstitute: "onboarding.provision",
  },
  "features/licensing/VendorCommercialAuthorityPage.tsx": {
    decideRequest: "commercial.decision", publishPlan: "commercial.catalog_publish", retirePlan: "commercial.catalog_retire",
    commandSubscription: "commercial.subscription", commandInvoice: "commercial.invoice", communicateInvoice: "commercial.communication",
    recordOfflinePayment: "commercial.offline_record", reviewOfflinePayment: "commercial.offline_review", retryEvent: "commercial.event_retry",
  },
  "features/shared/VendorCommandRecoveryPanel.tsx": {
    '"vendor.institutes.manage_lifecycle"': "institutes.recovery", '"vendor.licenses.manage"': "commercial.recovery",
  },
  "features/calibration/VendorCalibrationPublish.tsx": {
    'create("rollout")': "calibration.publish", 'create("rollback")': "calibration.rollback",
    "run(command, true)": "calibration.status", "run(command)": "calibration.replay", "sessionStorage.removeItem": "calibration.reset",
  },
};

function assertControlCoverage(sourceFiles, groups = controls) {
  unique(groups.map(group => group.sourceFile), "control source groups must be unique");
  const discovered = Object.entries(sourceFiles).map(([file, source]) => ({file, controls: sourceControls(source, file)})).filter(row => row.controls.length);
  assert.deepEqual(sorted(discovered.map(row => row.file)), sorted(groups.map(group => group.sourceFile)), "every source with interactive controls must be classified");
  for (const row of discovered) {
    const bindings = groups.find(group => group.sourceFile === row.file).controls;
    const descriptor = c => JSON.stringify([c.owner, c.tag, c.label.slice(0, 90), c.fingerprint]);
    assert.deepEqual(sorted(row.controls.map(descriptor)), sorted(bindings.map(descriptor)), `${row.file}: added, removed or changed control intent requires review`);
    for (const c of row.controls) {
      const binding = bindings.find(b => b.fingerprint === c.fingerprint);
      const action = actions.get(binding.actionId);
      assert.ok(action, `${row.file}:${c.line} unknown action ${binding.actionId}`);
      assert.ok(action.sourceFiles.includes(row.file), `${action.id} does not own ${row.file}`);
      if (!FIELD_TAGS.has(c.tag)) {
        const intent = c.attrs.join(" ") + " " + c.formIntent;
        for (const [handler, expected] of Object.entries(BUSINESS_BINDINGS[row.file] ?? {})) {
          if (intent.includes(handler)) assert.equal(action.id, expected, `${handler} must retain its business action classification`);
        }
      }
    }
  }
}

function assertRouteCoverage(source, definitions = ledger.VENDOR_ROUTE_LEDGER) {
  unique(definitions.map(route => route.path), "canonical route ledger paths");
  assert.deepEqual(sorted(definitions.map(route => route.path)), sorted(routes.VENDOR_ROUTE_DEFINITIONS.map(route => route.path)), "canonical route/ledger parity");
  const mounted = mountedRoutes(source);
  assert.equal(mounted.length, definitions.length + ledger.VENDOR_SHELL_ROUTE_LEDGER.length);
  const expected = [
    ...definitions.map(route => ({path: route.path.slice("/vendor/".length), occurrence: 0, mount: route.mount})),
    ...ledger.VENDOR_SHELL_ROUTE_LEDGER,
  ];
  const key = row => `${row.path}:${row.occurrence}`;
  unique(expected.map(key), "mounted route keys");
  assert.deepEqual(sorted(mounted.map(key)), sorted(expected.map(key)), "every mounted route and shell occurrence must be classified");
  for (const actual of mounted) {
    const entry = expected.find(row => key(row) === key(actual));
    assert.ok(actual.element.includes(entry.mount), `${actual.path} lost classified mount ${entry.mount}`);
    const expectedComponents = actual.path === "$basePath" && actual.occurrence === 1 ? ["VendorProtectedRoute", "VendorLayout"]
      : definitions.some(route => route.mount === entry.mount && route.disposition === "workspace") ? ["VendorRouteBoundary", entry.mount] : [entry.mount];
    assert.deepEqual(actual.components, expectedComponents, `${actual.path} must not mount unclassified components`);
    if (entry.target) assert.ok(actual.element.includes(entry.target.slice(1)), `${actual.path} lost its redirect target`);
  }
}

function assertVocabulary(sourceFiles) {
  assert.equal(vocabulary.length, 6);
  unique(vocabulary.map(row => row.nodeName), "dynamic vocabulary owners");
  for (const row of vocabulary) {
    assert.ok(actions.get(row.actionId)?.sourceFiles.includes(row.sourceFile));
    assert.deepEqual(declaredVocabulary(sourceFiles[row.sourceFile], row.sourceFile, row.nodeName), row.values, `${row.nodeName} has unclassified action/filter vocabulary`);
  }
}

test("every canonical Vendor route and all seventeen router registrations have explicit ownership", () => {
  assert.deepEqual(sorted(ledger.VENDOR_ROUTE_LEDGER.map(route => route.path)), sorted(EXPECTED_ROUTES));
  assertRouteCoverage(sources["App.tsx"]);
  assert.deepEqual(ledger.VENDOR_ROUTE_LEDGER.filter(route => route.disposition === "compatibility_unavailable").map(route => route.path), ["/vendor/calibration/simulate", "/vendor/calibration/history"]);
  for (const route of ledger.VENDOR_ROUTE_LEDGER) {
    assert.ok(matrix[route.capability], route.path);
    assert.deepEqual(matrix[route.capability].allowedRoles, ["vendor"]);
    for (const capability of route.readCapabilities) assert.ok(matrix[capability], capability);
    assert.ok(route.authority.trim() && route.proofOwner.trim() && route.mount.trim());
    assert.ok(ledger.VENDOR_PROOF_OWNERS[route.proofOwner]);
  }
  // Seven navigation destinations remain canonical; detail/compatibility URLs are also inventoried.
  const navigation = loadModule(navigationSource, "portalConsistency.ts").VENDOR_PRIMARY_NAVIGATION;
  assert.equal(navigation.length, 7);
  for (const item of navigation) assert.ok(EXPECTED_ROUTES.includes(item.path), item.path);
});

test("all fifty-five Vendor action families name capabilities, persistence, failures, sources and proof", () => {
  assert.equal(ledger.VENDOR_ACTION_LEDGER.length, 55);
  unique(ledger.VENDOR_ACTION_LEDGER.map(action => action.id), "action IDs");
  const routeSet = new Set([...EXPECTED_ROUTES, "/vendor/*"]);
  const findingSet = new Set(ledger.VENDOR_FINDINGS.map(finding => finding.id));
  for (const action of actions.values()) {
    assert.ok(matrix[action.capability], action.id);
    assert.ok(["auth", "read", "mutation", "navigation", "local_ui", "external"].includes(action.kind));
    assert.ok(["backend_backed", "truthful_local", "fixture_only", "unavailable", "unresolved"].includes(action.disposition));
    for (const field of ["label", "authority", "persistence", "errorState", "proofOwner"]) assert.ok(action[field].trim(), `${action.id} ${field}`);
    assert.ok(action.routes.length && action.sourceFiles.length && action.sourceAnchors.length);
    for (const route of action.routes) assert.ok(routeSet.has(route), route);
    for (const finding of action.findings) assert.ok(findingSet.has(finding), finding);
    for (const anchor of action.sourceAnchors) assert.ok(action.sourceFiles.some(file => sources[file]?.includes(anchor)), `${action.id} lost ${anchor}`);
    assert.ok(ledger.VENDOR_PROOF_OWNERS[action.proofOwner], action.id);
    if (action.kind === "mutation") {
      assert.equal(action.disposition, "backend_backed");
      assert.match(action.authority, /VEN-\d+/u);
      assert.match(action.persistence, /server|durable|audit|receipt|operation|replay/iu);
    }
    if (action.disposition === "unresolved") assert.ok(action.findings.length, action.id);
  }
  assert.doesNotMatch(ledgerSource + controlsSource, /\bas any\b|@ts-ignore|@ts-expect-error/u);
});

test("every interactive Vendor source control binds to a classified live or fixture action", () => {
  assertControlCoverage(sources);
  assertVocabulary(sources);
  const bindings = controls.flatMap(group => group.controls);
  assert.equal(controls.length, 20);
  assert.equal(bindings.length, 319);
  assert.equal(bindings.filter(binding => actions.get(binding.actionId).disposition === "fixture_only").length, 151);
  assert.equal(bindings.filter(binding => actions.get(binding.actionId).disposition !== "fixture_only").length, 168);
  const used = new Set(bindings.map(binding => binding.actionId));
  assert.deepEqual(sorted([...actions.keys()].filter(id => !used.has(id))), [], "every current action has explicit reviewed controls");
});

test("drift gate rejects new, removed, renamed and reassigned actions, controls and routes", () => {
  const app = sources["App.tsx"];
  assert.throws(() => assertControlCoverage({...sources, "App.tsx": app + '\nfunction NewMutation() { return <button onClick={() => saveNewThing()}>Save new thing</button>; }'}), /changed control intent|must be classified/u);
  assert.throws(() => assertControlCoverage({...sources, "NewButton.tsx": 'export default function NewButton() { return <UiButton onClick={() => save()}>Save</UiButton>; }'}), /must be classified/u);
  const file = "features/licensing/VendorCommercialAuthorityPage.tsx";
  assert.throws(() => assertControlCoverage({...sources, [file]: sources[file].replace("onSubmit={decideRequest}", "onSubmit={saveUnclassifiedDecision}")}), /changed control intent/u);
  const removed = controls.map(group => group.sourceFile === file ? {...group, controls: group.controls.slice(1)} : group);
  assert.throws(() => assertControlCoverage(sources, removed), /changed control intent/u);
  const reassigned = controls.map(group => ({...group, controls: group.controls.map(c => c.actionId === "commercial.decision" ? {...c, actionId: "commercial.local"} : c)}));
  assert.throws(() => assertControlCoverage(sources, reassigned), /business action classification/u);
  const unknown = controls.map(group => ({...group, controls: group.controls.map(c => c.actionId === "commercial.decision" ? {...c, actionId: "new.unclassified"} : c)}));
  assert.throws(() => assertControlCoverage(sources, unknown), /unknown action/u);
  assert.throws(() => assertRouteCoverage(app.replace('path="licensing"', 'path="new-business-route"')), /must be classified/u);
  assert.throws(() => assertRouteCoverage(app.replace("<VendorLicensingPage />", "<UnclassifiedPage />")), /lost classified mount/u);
  assert.throws(() => assertRouteCoverage(app.replace("<VendorLicensingPage />", "<><VendorLicensingPage /><HiddenBusinessPage /></>")), /unclassified components/u);
  assert.throws(() => assertRouteCoverage(app, ledger.VENDOR_ROUTE_LEDGER.slice(1)), /parity/u);
  assert.throws(() => assertControlCoverage({...sources, [file]: sources[file].replace('<option value="approve">Approve request</option>', '<option value="approve">Approve request</option><option value="activate_directly">Activate directly</option>')}), /changed control intent/u);
  const institutes = "features/institutes/VendorInstituteAuthorityPage.tsx";
  assert.throws(() => assertVocabulary({...sources, [institutes]: sources[institutes].replace('return ["suspend", "archive"]', 'return ["suspend", "archive", "new_business_action"]')}), /unclassified action\/filter vocabulary/u);
});

test("all seven inspection findings retain qualified resolution provenance", () => {
  assert.deepEqual(ledger.VENDOR_FINDINGS.map(finding => finding.id), Array.from({length: 7}, (_, i) => `F-041-0${i + 1}`));
  assert.deepEqual(ledger.VENDOR_FINDINGS.filter(finding => finding.status === "resolved").map(finding => finding.id), Array.from({length: 7}, (_, i) => `F-041-0${i + 1}`));
  assert.equal(ledger.VENDOR_FINDINGS.filter(finding => finding.status === "open").length, 0);
  assert.deepEqual(ledger.VENDOR_ACTION_LEDGER.filter(action => action.disposition === "unresolved"), [], "local acceptance cannot retain an unresolved production action");
  for (const finding of ledger.VENDOR_FINDINGS) {
    assert.ok([3, 4].includes(finding.ownerSubstep));
    assert.ok(finding.summary.trim());
    assert.ok([...actions.values()].some(action => action.findings.includes(finding.id)));
  }
  assert.equal(actions.get("shell.notifications").disposition, "truthful_local");
  assert.equal(actions.get("compatibility.calibration").disposition, "truthful_local");
  assert.ok(actions.get("institutes.profile").findings.includes("F-041-03"));
  assert.ok(actions.get("commercial.decision").findings.includes("F-041-05"));
  assert.match(actions.get("institutes.lifecycle").persistence, /reservation is not completion/u);
  assert.match(actions.get("commercial.offline_record").persistence, /never browser paid state/u);
  assert.match(actions.get("commercial.external").persistence, /no paid\/download-completion claim/u);
  assert.match(actions.get("calibration.publish").errorState, /unknown\/pending\/not_applied/u);
});

test("proof owners resolve to existing executable contracts and no-mock slice browsers", async () => {
  const referenced = new Set([...ledger.VENDOR_ROUTE_LEDGER, ...actions.values()].map(row => row.proofOwner));
  assert.deepEqual(sorted(referenced), sorted(Object.keys(ledger.VENDOR_PROOF_OWNERS)));
  for (const [owner, paths] of Object.entries(ledger.VENDOR_PROOF_OWNERS)) {
    for (const path of paths) {
      const source = await read(path);
      assert.match(source, /test\(/u, `${owner} executable proof ${path}`);
      if (path.includes("/e2e/")) {
        assert.doesNotMatch(source, /route\.fulfill/u, `${owner} cannot fabricate successful API authority`);
        assert.match(source, /expect\(/u, path);
      }
    }
  }
  assert.equal(JSON.parse(packageSource).scripts["test:vendor-action-ledger"], "node --test tests/vendor-action-ledger.test.mjs");
});

test("fixture-only bindings retain explicit selectors and supported live mounts", () => {
  const gates = [
    ["features/institutes/VendorInstituteManagementPage.tsx", "VendorInstituteAuthorityPage"],
    ["features/licensing/VendorLicensingPage.tsx", "VendorCommercialAuthorityPage"],
    ["features/overview/VendorOverviewPage.tsx", "VendorOverviewAuthorityPage"],
    ["features/intelligence/VendorIntelligenceDashboardPage.tsx", "VendorIntelligenceAuthorityPage"],
    ["features/audit/VendorUnifiedAuditWorkspace.tsx", "VendorAuditAuthorityPage"],
    ["features/system-health/VendorSystemHealthDashboardPage.tsx", "VendorSystemHealthAuthorityPage"],
  ];
  for (const [file, live] of gates) {
    assert.match(sources[file], /import\.meta\.env\.DEV\s*\?\s*lazy/u);
    assert.match(sources[file], /FixturePage && shouldUseFixtureData\(\)/u);
    assert.ok(sources[file].includes(`<${live} />`));
  }
  assert.doesNotMatch(sources["App.tsx"], /<FixtureVendor|<VendorInstituteOnboardingWorkspace/u);
  const provider = sources["features/institutes/VendorLicenseRequestsContext.tsx"];
  assert.match(provider, /import\.meta\.env\.DEV \? lazy/u);
  const fixture = sources["features/institutes/FixtureVendorLicenseRequestsProvider.tsx"];
  assert.match(fixture, /fixtureMode \? INITIAL_LICENSE_REQUESTS : \[\]/u);
  assert.ok((fixture.match(/if \(!fixtureMode\) return;/gu) ?? []).length >= 6);
});
