import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function transpileTypeScript(source, sourcePath) {
  return typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
}

function loadTypeScriptModule(source, sourcePath, resolveModule = () => ({})) {
  const loadedModule = { exports: {} };
  const evaluate = new Function("exports", "module", "require", transpileTypeScript(source, sourcePath));
  evaluate(loadedModule.exports, loadedModule, resolveModule);
  return loadedModule.exports;
}

const teacherAdminCapabilities = [
  "admin.students.read",
  "admin.question_bank.read",
  "admin.question_bank.manage",
  "admin.tests.read",
  "admin.tests.manage",
  "admin.assignments.read",
  "admin.assignments.manage",
  "admin.interventions.manage",
];

const teacherAdminDirectorCapabilities = [
  "admin.overview.read",
  "admin.analytics.read",
  "admin.analytics.advanced",
  "admin.insights.read",
  "admin.support.manage",
];

const handlerCapabilityMap = new Map([
  ["adminOverview.ts", "ADMIN_TEACHER_DIRECTOR_ROLES"],
  ["adminAnalytics.ts", "ADMIN_TEACHER_DIRECTOR_ROLES"],
  ["adminStudents.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionAssets.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionDistribution.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionLibrary.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionTags.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionUploadLogs.ts", "ADMIN_TEACHER_ROLES"],
  ["adminQuestionsBulk.ts", "ADMIN_TEACHER_ROLES"],
  ["adminTests.ts", "ADMIN_TEACHER_ROLES"],
  ["adminRuns.ts", "ADMIN_TEACHER_ROLES"],
  ["adminInterventions.ts", "ADMIN_TEACHER_ROLES"],
]);

test("Admin teacher route and handler role sets match the canonical capability matrix", async () => {
  const matrixPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
  const backendPolicyPath = join(rootDirectory, "functions/src/policy/adminRolePolicy.ts");
  const adminRoutesPath = join(rootDirectory, "apps/admin/src/portals/adminRoutes.ts");
  const adminAccessPath = join(rootDirectory, "apps/admin/src/portals/adminAccess.ts");
  const [matrixSource, backendPolicySource, adminRoutesSource, adminAccessSource] = await Promise.all([
    readFile(matrixPath, "utf8"),
    readFile(backendPolicyPath, "utf8"),
    readFile(adminRoutesPath, "utf8"),
    readFile(adminAccessPath, "utf8"),
  ]);
  const matrixModule = loadTypeScriptModule(matrixSource, matrixPath);
  const backendPolicy = loadTypeScriptModule(backendPolicySource, backendPolicyPath);
  const portalRoutingModule = { LICENSE_LAYER_ORDER: { L0: 0, L1: 1, L2: 2, L3: 3 } };
  const adminAccessModule = loadTypeScriptModule(adminAccessSource, adminAccessPath, (specifier) => {
    if (specifier.endsWith("shared/contracts/capabilityPolicy")) return matrixModule;
    if (specifier.endsWith("shared/types/portalRouting")) return portalRoutingModule;
    if (specifier.endsWith("shared/services/globalPortalState")) {
      return { resolveGlobalPortalState: () => { throw new Error("Session resolution is not used here"); } };
    }
    throw new Error(`Unexpected Admin access dependency: ${specifier}`);
  });

  for (const capability of teacherAdminCapabilities) {
    assert.deepEqual(
      backendPolicy.ADMIN_TEACHER_ROLES,
      matrixModule.CAPABILITY_MATRIX[capability].allowedRoles,
      `${capability} must use the shared teacher/admin role set`,
    );
  }
  for (const capability of teacherAdminDirectorCapabilities) {
    assert.deepEqual(
      backendPolicy.ADMIN_TEACHER_DIRECTOR_ROLES,
      matrixModule.CAPABILITY_MATRIX[capability].allowedRoles,
      `${capability} must use the shared teacher/admin/director role set`,
    );
  }

  const adminRoutesModule = loadTypeScriptModule(adminRoutesSource, adminRoutesPath, (specifier) => {
    if (specifier.endsWith("shared/contracts/capabilityPolicy")) {
      return matrixModule;
    }
    if (specifier.endsWith("./adminAccess")) {
      return adminAccessModule;
    }
    throw new Error(`Unexpected Admin route dependency: ${specifier}`);
  });
  const teacherRoutes = adminRoutesModule.ADMIN_ROUTE_DEFINITIONS.filter((route) =>
    route.allowedRoles.includes("teacher"),
  );
  const teacherPrimaryPaths = teacherRoutes
    .filter((route) => !route.path.slice("/admin/".length).includes("/"))
    .map((route) => route.path)
    .sort();

  assert.deepEqual(teacherPrimaryPaths, [
    "/admin/analytics",
    "/admin/assignments",
    "/admin/help",
    "/admin/insights",
    "/admin/overview",
    "/admin/question-bank",
    "/admin/students",
    "/admin/tests",
  ]);
  assert.ok(teacherRoutes.length > teacherPrimaryPaths.length);
  assert.equal(
    adminRoutesModule.ADMIN_ROUTE_DEFINITIONS.some(
      (route) =>
        route.allowedRoles.includes("teacher") &&
        ["/admin/governance", "/admin/licensing", "/admin/settings"].some((prefix) =>
          route.path.startsWith(prefix),
        ),
    ),
    false,
  );
  assert.doesNotMatch(adminRoutesSource, /allowedRoles:\s*\[[^\]]*"teacher"/u);

  const noFeatures = {
    adaptivePhase: false,
    controlledMode: false,
    governanceAccess: false,
    hardMode: false,
    riskOverview: false,
  };
  const allFeatures = Object.fromEntries(
    Object.keys(noFeatures).map((featureName) => [featureName, true]),
  );

  const settingsRoute = adminRoutesModule.matchAdminRoute("/admin/settings/profile");
  assert.deepEqual(
    adminRoutesModule.evaluateAdminRoutePermissions(settingsRoute, "director", "L2", noFeatures),
    {allowed: false, redirectTo: "/unauthorized", reason: "license_restricted"},
  );
  assert.deepEqual(
    adminRoutesModule.evaluateAdminRoutePermissions(settingsRoute, "director", "L3", noFeatures),
    {allowed: true, redirectTo: null, reason: null},
  );
  assert.deepEqual(
    adminRoutesModule.evaluateAdminRoutePermissions(settingsRoute, "admin", "L0", noFeatures),
    {allowed: true, redirectTo: null, reason: null},
  );

  const insightsRoute = adminRoutesModule.matchAdminRoute("/admin/insights/risk");
  assert.deepEqual(
    adminRoutesModule.evaluateAdminRoutePermissions(insightsRoute, "teacher", "L1", noFeatures),
    {allowed: false, redirectTo: "/admin/overview", reason: "license_restricted"},
  );
  assert.deepEqual(
    adminRoutesModule.evaluateAdminRoutePermissions(insightsRoute, "teacher", "L1", allFeatures),
    {allowed: true, redirectTo: null, reason: null},
  );
  assert.equal(
    adminRoutesModule.getVisibleAdminRoutes("director", "L3", noFeatures)
      .some((route) => route.path === "/admin/governance"),
    false,
  );
  assert.equal(
    adminRoutesModule.getVisibleAdminRoutes("director", "L3", allFeatures)
      .some((route) => route.path === "/admin/governance"),
    true,
  );
});

test("every affected Admin handler consumes the drift-checked backend role policy", async () => {
  for (const [fileName, policyName] of handlerCapabilityMap) {
    const source = await readFile(join(rootDirectory, "functions/src/api", fileName), "utf8");
    assert.match(
      source,
      new RegExp(`allowedRoles:\\s*${policyName}\\b`, "u"),
      `${fileName} must use ${policyName}`,
    );
    assert.match(source, new RegExp(`import \\{${policyName}\\}`, "u"));
    assert.doesNotMatch(source, /allowedRoles:\s*\[[^\]]+\]/u);
  }
});
