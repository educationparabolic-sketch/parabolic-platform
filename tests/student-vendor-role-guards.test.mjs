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
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
}

function loadTypeScriptModule(source, sourcePath, resolveModule = () => ({})) {
  const loadedModule = { exports: {} };
  const evaluate = new Function(
    "exports",
    "module",
    "require",
    transpileTypeScript(source, sourcePath),
  );
  evaluate(loadedModule.exports, loadedModule, resolveModule);
  return loadedModule.exports;
}

function fakeSession(role) {
  return {
    error: null,
    idToken: role,
    lastTokenRefreshAt: null,
    status: "authenticated",
    user: null,
  };
}

test("Student and Vendor portal role checks derive from the canonical capability matrix", async () => {
  const matrixPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
  const studentAccessPath = join(rootDirectory, "apps/student/src/portals/studentAccess.ts");
  const vendorAccessPath = join(rootDirectory, "apps/vendor/src/portals/vendorAccess.ts");
  const vendorRoutesPath = join(rootDirectory, "apps/admin/src/portals/vendorRoutes.ts");
  const [matrixSource, studentAccessSource, vendorAccessSource, vendorRoutesSource] =
    await Promise.all([
      readFile(matrixPath, "utf8"),
      readFile(studentAccessPath, "utf8"),
      readFile(vendorAccessPath, "utf8"),
      readFile(vendorRoutesPath, "utf8"),
    ]);
  const matrixModule = loadTypeScriptModule(matrixSource, matrixPath);
  const roleStateModule = {
    resolveGlobalPortalState: ({ session }) => ({ role: session.idToken }),
  };
  const resolveAccessDependency = (specifier) => {
    if (specifier.endsWith("shared/contracts/capabilityPolicy")) {
      return matrixModule;
    }
    if (specifier.endsWith("shared/services/globalPortalState")) {
      return roleStateModule;
    }
    throw new Error(`Unexpected portal access dependency: ${specifier}`);
  };
  const studentAccess = loadTypeScriptModule(
    studentAccessSource,
    studentAccessPath,
    resolveAccessDependency,
  );
  const vendorAccess = loadTypeScriptModule(
    vendorAccessSource,
    vendorAccessPath,
    resolveAccessDependency,
  );
  const allRoles = ["student", "teacher", "admin", "director", "vendor", null];

  for (const role of allRoles) {
    assert.equal(
      studentAccess.resolveStudentAccessContext(fakeSession(role)).canAccessStudentPortal,
      matrixModule.CAPABILITY_MATRIX["portal.student.access"].allowedRoles.includes(role),
      `Student portal admission must match the matrix for ${String(role)}`,
    );
    assert.equal(
      vendorAccess.resolveVendorAccessContext(fakeSession(role)).canAccessVendorPortal,
      matrixModule.CAPABILITY_MATRIX["portal.vendor.access"].allowedRoles.includes(role),
      `Vendor portal admission must match the matrix for ${String(role)}`,
    );
  }

  const vendorRoutes = loadTypeScriptModule(vendorRoutesSource, vendorRoutesPath, (specifier) => {
    if (specifier.endsWith("shared/contracts/capabilityPolicy")) {
      return matrixModule;
    }
    throw new Error(`Unexpected Vendor route dependency: ${specifier}`);
  });
  for (const route of vendorRoutes.VENDOR_ROUTE_DEFINITIONS) {
    assert.deepEqual(
      route.allowedRoles,
      matrixModule.CAPABILITY_MATRIX["portal.vendor.access"].allowedRoles,
      `${route.path} must use the canonical Vendor portal role set`,
    );
  }

  assert.doesNotMatch(studentAccessSource, /role\s*===\s*["']student["']/u);
  assert.doesNotMatch(vendorAccessSource, /role\s*===\s*["']vendor["']/u);
  assert.doesNotMatch(vendorRoutesSource, /allowedRoles:\s*\[[^\]]*["']vendor["']/u);
});

test("protected routes deny authenticated wrong-role sessions and server role middleware remains active", async () => {
  const studentAppPath = join(rootDirectory, "apps/student/src/App.tsx");
  const vendorAppPath = join(rootDirectory, "apps/vendor/src/App.tsx");
  const [studentAppSource, vendorAppSource] = await Promise.all([
    readFile(studentAppPath, "utf8"),
    readFile(vendorAppPath, "utf8"),
  ]);
  const studentGuard = studentAppSource.match(
    /function StudentProtectedRoute[\s\S]+?function StudentUnauthorizedPage/u,
  )?.[0];
  const vendorGuard = vendorAppSource.match(
    /function VendorProtectedRoute[\s\S]+?function VendorLayout/u,
  )?.[0];

  assert.ok(studentGuard, "Student protected route guard must remain discoverable");
  assert.match(studentGuard, /resolveStudentAccessContext\(session\)/u);
  assert.match(studentGuard, /!accessContext\.canAccessStudentPortal/u);
  assert.match(studentGuard, /to="\/unauthorized"/u);
  assert.match(studentAppSource, /path="\/unauthorized" element=\{<StudentUnauthorizedPage \/>\}/u);

  assert.ok(vendorGuard, "Vendor protected route guard must remain discoverable");
  assert.match(vendorGuard, /resolveVendorAccessContext\(session\)/u);
  assert.match(vendorGuard, /!accessContext\.canAccessVendorPortal/u);
  assert.match(vendorGuard, /to="\/unauthorized"/u);
  assert.doesNotMatch(vendorAppSource, /function VendorRoleGuard/u);

  const studentHandlerFiles = ["examStart.ts", "examSessionAnswers.ts", "examSessionSubmit.ts"];
  const apiDirectory = join(rootDirectory, "functions/src/api");
  for (const fileName of studentHandlerFiles) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    assert.match(source, /createAuthenticationMiddleware\(/u);
    assert.match(source, /allowedRoles:\s*\["student"\]/u);
  }

  const vendorHandlerFiles = [
    "vendorCalibrationPush.ts",
    "vendorCalibrationSimulation.ts",
    "vendorChurnTracking.ts",
    "vendorIntelligenceInitialize.ts",
    "vendorLayerDistribution.ts",
    "vendorLicenseUpdate.ts",
    "vendorRevenueAnalytics.ts",
    "vendorRevenueForecasting.ts",
    "vendorSimulationEnvironment.ts",
    "vendorSimulationLoad.ts",
    "vendorSimulationSessions.ts",
    "vendorSimulationStudents.ts",
    "vendorSimulationValidation.ts",
  ];
  for (const fileName of vendorHandlerFiles) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    assert.match(source, /createAuthenticationMiddleware\(/u);
    assert.match(source, /allowedRoles:\s*\["vendor"\]/u);
  }
});
