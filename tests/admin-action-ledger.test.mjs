import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const adminSourceDirectory = join(rootDirectory, "apps/admin/src");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath, resolveModule = () => ({})) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = {exports: {}};
  const evaluate = new Function("exports", "module", "require", transpiled);
  evaluate(loadedModule.exports, loadedModule, resolveModule);
  return loadedModule.exports;
}

const ledgerPath = join(adminSourceDirectory, "portals/adminActionLedger.ts");
const routesPath = join(adminSourceDirectory, "portals/adminRoutes.ts");
const accessPath = join(adminSourceDirectory, "portals/adminAccess.ts");
const appPath = join(adminSourceDirectory, "App.tsx");
const capabilityPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");

const [ledgerSource, routesSource, accessSource, appSource, capabilitySource] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routesPath, "utf8"),
  readFile(accessPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(capabilityPath, "utf8"),
]);
const ledger = loadTypeScriptModule(ledgerSource, ledgerPath);
const capabilityModule = loadTypeScriptModule(capabilitySource, capabilityPath);
const portalRoutingModule = {LICENSE_LAYER_ORDER: {L0: 0, L1: 1, L2: 2, L3: 3}};
const accessModule = loadTypeScriptModule(accessSource, accessPath, (specifier) => {
  if (specifier.endsWith("shared/contracts/capabilityPolicy")) return capabilityModule;
  if (specifier.endsWith("shared/types/portalRouting")) return portalRoutingModule;
  if (specifier.endsWith("shared/services/globalPortalState")) {
    return {resolveGlobalPortalState: () => { throw new Error("Session resolution is not used here"); }};
  }
  throw new Error(`Unexpected Admin access dependency: ${specifier}`);
});
const routesModule = loadTypeScriptModule(routesSource, routesPath, (specifier) => {
  if (specifier.endsWith("shared/contracts/capabilityPolicy")) return capabilityModule;
  if (specifier.endsWith("./adminAccess")) return accessModule;
  throw new Error(`Unexpected Admin route dependency: ${specifier}`);
});

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const EXPECTED_CANONICAL_ROUTE_PATHS = [
  "/admin/overview",
  "/admin/students",
  "/admin/students/list",
  "/admin/students/bulk-upload",
  "/admin/students/batches",
  "/admin/students/archive",
  "/admin/students/:studentId",
  "/admin/question-bank",
  "/admin/question-bank/upload-package",
  "/admin/question-bank/library",
  "/admin/question-bank/library/:questionId",
  "/admin/question-bank/distribution",
  "/admin/question-bank/archive",
  "/admin/question-bank/tags",
  "/admin/question-bank/validation-logs",
  "/admin/tests",
  "/admin/tests/create",
  "/admin/tests/library",
  "/admin/tests/analytics",
  "/admin/tests/distribution",
  "/admin/tests/settings",
  "/admin/tests/:testId",
  "/admin/tests/analytics/:testId",
  "/admin/assignments",
  "/admin/assignments/create",
  "/admin/assignments/list",
  "/admin/assignments/live",
  "/admin/assignments/live/:runId",
  "/admin/assignments/details/:runId",
  "/admin/assignments/history",
  "/admin/analytics",
  "/admin/analytics/templates",
  "/admin/analytics/batches",
  "/admin/insights",
  "/admin/insights/risk",
  "/admin/insights/interventions",
  "/admin/governance",
  "/admin/governance/stability",
  "/admin/governance/integrity",
  "/admin/governance/override-audit",
  "/admin/governance/batch-risk",
  "/admin/governance/trends",
  "/admin/governance/reports",
  "/admin/settings",
  "/admin/settings/profile",
  "/admin/settings/academic-year",
  "/admin/settings/access",
  "/admin/settings/audit-history",
  "/admin/settings/execution-policy",
  "/admin/settings/data",
  "/admin/settings/system",
  "/admin/help",
  "/admin/licensing",
  "/admin/licensing/current",
  "/admin/licensing/usage",
  "/admin/licensing/plans",
  "/admin/licensing/history",
];

const EXPECTED_COMPATIBILITY_ROUTE_PATHS = [
  "students/lifecycle",
  "assignments/bulk",
  "analytics/overview",
  "analytics/run/:runId",
  "analytics/student/:studentId",
  "analytics/template/:testId",
  "analytics/trends",
  "analytics/risk-insights",
  "analytics/batch",
  "insights/student/:studentId",
  "insights/patterns",
  "insights/execution",
  "insights/monthly-summary",
  "licensing/features",
  "licensing/eligibility",
  "licensing/upgrade-preview",
  "settings/users",
  "settings/security",
];

const EXPECTED_ROUTE_WILDCARDS = [
  "students/*",
  "question-bank/*",
  "tests/*",
  "assignments/*",
  "analytics/*",
  "governance/*",
  "insights/*",
  "licensing/*",
  "settings/*",
  "*",
];

const EXPECTED_ACTION_IDS = [
  "students.profile.update",
  "students.batch.assign",
  "students.lifecycle.change",
  "students.photo.review",
  "students.onboarding.resend",
  "students.bulk.commit",
  "students.data.export",
  "students.soft_delete",
  "questions.package.ingest",
  "questions.package.rollback",
  "questions.metadata.update",
  "questions.structure.update",
  "questions.version.create",
  "questions.lifecycle.deprecate",
  "questions.tags.mutate",
  "templates.save",
  "templates.publish",
  "templates.archive",
  "templates.custom_strategy.request",
  "assignments.create",
  "assignments.derive",
  "assignments.archive",
  "assignments.live.manage",
  "assignments.session.override",
  "governance.report.generate",
  "governance.report.download",
  "interventions.recommend",
  "interventions.outcome.update",
  "settings.profile.update",
  "settings.year.lock",
  "settings.year.archive",
  "settings.staff.invite",
  "settings.staff.update",
  "settings.staff.remove",
  "settings.staff.password_reset",
  "settings.session_policy.update",
  "licensing.upgrade.request",
  "support.ticket.create",
  "support.ticket.reply",
  "support.ticket.lifecycle",
  "support.attachment.download",
  "admin.local.controls",
  "admin.fixture.sample_downloads",
];

const PROOF_OWNER_CONTRACTS = {
  "admin-summary-contracts": {
    files: ["tests/e2e/admin-summary-contract.spec.mjs"],
    authorityAnchor: "seeded Overview and Analytics values render",
    failureAnchor: "Authoritative data is unavailable",
  },
  "admin-student-mutations": {
    files: ["tests/admin-student-mutation-contract.test.mjs", "tests/e2e/admin-student-mutations.spec.mjs"],
    authorityAnchor: "survive browser reload",
    failureAnchor: "Student profile update failed",
  },
  "question-bank-lifecycle": {
    files: ["tests/admin-question-bank-contract.test.mjs"],
    authorityAnchor: "live Question Bank consumers use strict APIs and reconcile mutations",
    failureAnchor: "authoritative recovery boundaries",
  },
  "admin-template-lifecycle": {
    files: ["tests/admin-template-authority.test.mjs", "tests/e2e/admin-template-lifecycle.spec.mjs"],
    authorityAnchor: "authoritative template lifecycle",
    failureAnchor: "reload reconciliation rejects a missing created ID",
  },
  "admin-assignment-lifecycle": {
    files: [
      "tests/admin-assignment-authority.test.mjs",
      "tests/admin-assignment-operations-ui-contract.test.mjs",
      "tests/e2e/admin-assignment-lifecycle.spec.mjs",
    ],
    authorityAnchor: "create/replay reconciliation returns only the persisted authority",
    failureAnchor: "illegalTermination",
  },
  "admin-governance-interventions": {
    files: [
      "tests/admin-governance-interventions-contract.test.mjs",
      "tests/e2e/admin-governance-interventions.spec.mjs",
    ],
    authorityAnchor: "persist through no-mock Admin UI",
    failureAnchor: "Source metrics timestamp unavailable.",
  },
  "admin-settings": {
    files: ["tests/admin-settings-contract.test.mjs", "tests/e2e/admin-settings.spec.mjs"],
    authorityAnchor: "settings persist and reconcile through the no-mock Admin workspace",
    failureAnchor: "Settings revision conflict",
  },
  "admin-support": {
    files: ["tests/admin-support-contract.test.mjs", "tests/e2e/admin-support.spec.mjs"],
    authorityAnchor: "support persists through real Auth, Functions, Firestore, Storage, and a fresh Admin browser",
    failureAnchor: "permanent support proof spans security, failures",
  },
  "admin-licensing": {
    files: ["tests/admin-licensing-contract.test.mjs", "tests/e2e/admin-licensing.spec.mjs"],
    authorityAnchor: "licensing authority persists through the no-mock Admin workspace",
    failureAnchor: "Authoritative license/current is unavailable.",
  },
  "BWM-033-action-truthfulness": {
    files: ["tests/admin-template-authority.test.mjs"],
    authorityAnchor: "custom-strategy requests are truthfully unavailable without fabricated submission",
    failureAnchor: "No request is created or sent from this workspace",
  },
  "admin-action-ledger": {
    files: ["tests/admin-action-ledger.test.mjs"],
    authorityAnchor: "every Admin business action has complete authority",
    failureAnchor: "must classify its error state",
  },
  "frontend-production-fallbacks": {
    files: ["tests/frontend-production-fallbacks.test.mjs"],
    authorityAnchor: "portal catches do not substitute fixtures or fabricated successes in live mode",
    failureAnchor: "throw error",
  },
};

const ACTION_CAPABILITIES_BY_ROUTE_CAPABILITY = {
  "admin.students.read": new Set(["admin.students.manage"]),
  "admin.question_bank.read": new Set(["admin.question_bank.manage"]),
  "admin.tests.read": new Set(["admin.tests.manage"]),
  "admin.assignments.read": new Set(["admin.assignments.read", "admin.assignments.manage"]),
  "admin.interventions.read": new Set(["admin.interventions.manage"]),
  "admin.governance.read": new Set(["admin.governance.export"]),
  "admin.settings.read": new Set(["admin.settings.manage"]),
  "admin.support.manage": new Set(["admin.support.manage"]),
  "admin.license.read": new Set(["admin.license.upgrade_request"]),
};

function fixturePath(path) {
  return path.replace(/:[^/]+/gu, "fixture-id");
}

test("every canonical and mounted Admin route has one executable ledger classification", () => {
  const canonicalPaths = routesModule.ADMIN_ROUTE_DEFINITIONS.map((route) => route.path);
  const ledgerPaths = ledger.ADMIN_ROUTE_LEDGER.map((route) => route.path);
  unique(canonicalPaths, "canonical Admin route paths");
  unique(ledgerPaths, "Admin route ledger paths");
  assert.deepEqual(sorted(canonicalPaths), sorted(EXPECTED_CANONICAL_ROUTE_PATHS));
  assert.deepEqual(sorted(ledgerPaths), sorted(EXPECTED_CANONICAL_ROUTE_PATHS));
  assert.deepEqual(sorted(ledgerPaths), sorted(canonicalPaths));

  for (const route of ledger.ADMIN_ROUTE_LEDGER) {
    assert.ok(capabilityModule.CAPABILITY_MATRIX[route.capability], `${route.path} capability must exist`);
    assert.ok(["workspace", "redirect", "unavailable"].includes(route.disposition));
    assert.ok(route.authority.trim().length > 0, `${route.path} must name its authority`);
    assert.ok(route.proofOwner.trim().length > 0, `${route.path} must name its proof owner`);
    assert.equal(
      routesModule.matchAdminRoute(route.path.replace(/:[^/]+/gu, "fixture-id"))?.definition.capability,
      route.capability,
      `${route.path} must register the same capability enforced by its ledger entry`,
    );
  }

  const compatibilityPaths = ledger.ADMIN_COMPATIBILITY_ROUTE_LEDGER.map((route) => route.path);
  unique(compatibilityPaths, "Admin compatibility route paths");
  assert.deepEqual(sorted(compatibilityPaths), sorted(EXPECTED_COMPATIBILITY_ROUTE_PATHS));
  assert.deepEqual([...ledger.ADMIN_ROUTE_WILDCARDS], EXPECTED_ROUTE_WILDCARDS);
  for (const route of ledger.ADMIN_COMPATIBILITY_ROUTE_LEDGER) {
    assert.ok(capabilityModule.CAPABILITY_MATRIX[route.capability], `${route.path} capability must exist`);
    assert.match(route.target, /^\/admin\//u);
    assert.equal(
      routesModule.matchAdminRoute(fixturePath(route.target))?.definition.capability,
      route.capability,
      `${route.path} must enforce its target route capability`,
    );
    assert.equal(
      ledger.matchAdminCompatibilityRoute(`/admin/${fixturePath(route.path)}`)?.path,
      route.path,
      `${route.path} must remain executable through the compatibility matcher`,
    );
  }

  const mountedRelativePaths = [...appSource.matchAll(/\bpath="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith("/"));
  const duplicatedMountedPaths = mountedRelativePaths.filter(
    (path, index) => mountedRelativePaths.indexOf(path) !== index,
  );
  assert.deepEqual(duplicatedMountedPaths, ["*"], "only the nested and root not-found routes may share a path");
  const uniqueMountedRelativePaths = [...new Set(mountedRelativePaths)];
  const classifiedMountedPaths = new Set([
    ...ledger.ADMIN_ROUTE_LEDGER.map((route) => route.path.slice("/admin/".length)),
    ...compatibilityPaths,
    ...ledger.ADMIN_ROUTE_WILDCARDS,
  ]);
  assert.deepEqual(
    uniqueMountedRelativePaths.filter((path) => !classifiedMountedPaths.has(path)),
    [],
    "every mounted relative Admin route must be canonical, compatibility-only, or a fail-closed wildcard",
  );
  assert.deepEqual(
    compatibilityPaths.filter((path) => !uniqueMountedRelativePaths.includes(path)),
    [],
    "every compatibility route classification must still be mounted",
  );
  assert.deepEqual(
    ledger.ADMIN_ROUTE_WILDCARDS.filter((path) => !uniqueMountedRelativePaths.includes(path)),
    [],
    "every wildcard classification must still be mounted",
  );
});

test("every Admin business action has complete authority, persistence, error, and source evidence", async () => {
  const ids = ledger.ADMIN_ACTION_LEDGER.map((entry) => entry.id);
  unique(ids, "Admin action IDs");
  assert.deepEqual(sorted(ids), sorted(EXPECTED_ACTION_IDS));

  const routePaths = new Set(ledger.ADMIN_ROUTE_LEDGER.map((route) => route.path));
  const allowedWildcardRoutes = new Set(["/admin/*"]);
  for (const entry of ledger.ADMIN_ACTION_LEDGER) {
    assert.ok(capabilityModule.CAPABILITY_MATRIX[entry.capability], `${entry.id} capability must exist`);
    assert.ok(["mutation", "download", "local_ui"].includes(entry.kind), `${entry.id} kind must be classified`);
    assert.ok(
      ["authoritative", "truthful_local", "truthfully_unavailable", "fixture_only", "local_only_defect"].includes(entry.disposition),
      `${entry.id} disposition must be classified`,
    );
    assert.ok(entry.label.trim().length > 0, `${entry.id} must have a human label`);
    assert.ok(entry.authority.trim().length > 0, `${entry.id} must name its authority`);
    assert.ok(entry.persistence.trim().length > 0, `${entry.id} must classify persistence`);
    assert.ok(entry.errorState.trim().length > 0, `${entry.id} must classify its error state`);
    assert.ok(entry.proofOwner.trim().length > 0, `${entry.id} must name its proof owner`);
    assert.ok(entry.routes.length > 0, `${entry.id} must name at least one route`);
    assert.ok(entry.sourceFiles.length > 0, `${entry.id} must name source files`);
    assert.ok(entry.sourceAnchors.length > 0, `${entry.id} must name source anchors`);

    for (const route of entry.routes) {
      assert.ok(routePaths.has(route) || allowedWildcardRoutes.has(route), `${entry.id} has unknown route ${route}`);
      if (route !== "/admin/*") {
        const routeCapability = routesModule.matchAdminRoute(fixturePath(route))?.definition.capability;
        const allowedCapabilities = ACTION_CAPABILITIES_BY_ROUTE_CAPABILITY[routeCapability];
        assert.ok(
          allowedCapabilities?.has(entry.capability),
          `${entry.id} capability ${entry.capability} must belong to ${routeCapability}`,
        );
      }
    }
    if (entry.disposition === "authoritative") {
      assert.notEqual(entry.authority, "none", `${entry.id} cannot claim authority without a backend boundary`);
      assert.notEqual(entry.persistence, "none", `${entry.id} cannot claim authority without persistence semantics`);
      assert.match(entry.errorState, /remain visible/u, `${entry.id} must retain a visible live failure state`);
      if (entry.kind === "mutation") {
        assert.match(
          entry.persistence,
          /reload|reconciliation|authority|audit/u,
          `${entry.id} must name authoritative mutation reconciliation or durable ownership`,
        );
      }
      if (entry.kind === "download") {
        assert.match(
          entry.persistence,
          /authorization|artifact/u,
          `${entry.id} must name bounded download authority`,
        );
      }
    }

    const source = (
      await Promise.all(entry.sourceFiles.map((file) => readFile(join(adminSourceDirectory, file), "utf8")))
    ).join("\n");
    for (const anchor of entry.sourceAnchors) {
      assert.ok(source.includes(anchor), `${entry.id} lost source anchor: ${anchor}`);
    }
  }

  const unresolved = ledger.ADMIN_ACTION_LEDGER.filter((entry) => entry.disposition === "local_only_defect");
  assert.deepEqual(unresolved, []);
  const customStrategy = ledger.ADMIN_ACTION_LEDGER.find(
    (entry) => entry.id === "templates.custom_strategy.request",
  );
  assert.equal(customStrategy?.disposition, "truthfully_unavailable");
  assert.doesNotMatch(ledgerSource, /disposition: "local_only_defect"/u);
  assert.match(ledgerSource, /BWM-033-action-truthfulness/u);
});

test("every Admin workspace and action proof owner resolves to permanent authority and failure contracts", async () => {
  const proofOwners = new Set([
    ...ledger.ADMIN_ROUTE_LEDGER.map((entry) => entry.proofOwner),
    ...ledger.ADMIN_ACTION_LEDGER.map((entry) => entry.proofOwner),
  ]);
  assert.deepEqual(sorted(proofOwners), sorted(Object.keys(PROOF_OWNER_CONTRACTS)));

  for (const proofOwner of proofOwners) {
    const proof = PROOF_OWNER_CONTRACTS[proofOwner];
    const proofSource = (
      await Promise.all(proof.files.map((path) => readFile(join(rootDirectory, path), "utf8")))
    ).join("\n");
    assert.ok(proofSource.includes(proof.authorityAnchor), `${proofOwner} lost authority/reconciliation proof`);
    assert.ok(proofSource.includes(proof.failureAnchor), `${proofOwner} lost live failure/unavailable proof`);
  }
});

test("unavailable, fixture-only, and local controls cannot claim production mutation success", async () => {
  const unavailable = ledger.ADMIN_ACTION_LEDGER.filter(
    (entry) => entry.disposition === "truthfully_unavailable",
  );
  assert.deepEqual(unavailable.map((entry) => entry.id), ["templates.custom_strategy.request"]);
  assert.match(unavailable[0].authority, /disabled UI/u);
  assert.match(unavailable[0].persistence, /none by design/u);
  const unavailableSource = await readFile(
    join(adminSourceDirectory, unavailable[0].sourceFiles[0]),
    "utf8",
  );
  assert.match(
    unavailableSource,
    /<button type="button" disabled aria-describedby="admin-tests-custom-strategy-unavailable">/u,
  );
  assert.doesNotMatch(unavailableSource, /submitCustomStrategyRequest|Vendor review is now required/u);

  const fixtureOnly = ledger.ADMIN_ACTION_LEDGER.filter((entry) => entry.disposition === "fixture_only");
  assert.deepEqual(fixtureOnly.map((entry) => entry.id), ["admin.fixture.sample_downloads"]);
  assert.match(fixtureOnly[0].authority, /explicit fixture branch only/u);
  assert.match(fixtureOnly[0].errorState, /live branch returns before/u);

  const truthfulLocal = ledger.ADMIN_ACTION_LEDGER.filter((entry) => entry.disposition === "truthful_local");
  assert.deepEqual(truthfulLocal.map((entry) => entry.id), ["admin.local.controls"]);
  assert.equal(truthfulLocal[0].persistence, "none claimed");
  assert.deepEqual(
    ledger.ADMIN_ACTION_LEDGER.filter((entry) => entry.disposition === "local_only_defect"),
    [],
  );
});

test("route and action additions cannot bypass the executable inventories", () => {
  assert.match(ledgerSource, /ADMIN_ROUTE_LEDGER/u);
  assert.match(ledgerSource, /ADMIN_COMPATIBILITY_ROUTE_LEDGER/u);
  assert.match(ledgerSource, /ADMIN_ROUTE_WILDCARDS/u);
  assert.match(ledgerSource, /ADMIN_ACTION_LEDGER/u);
  assert.doesNotMatch(ledgerSource, /\bas any\b|@ts-ignore|@ts-expect-error/u);
  assert.doesNotMatch(ledgerSource, /fixture-backed success|silently ignore/u);
});
