import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const matrixPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
const documentationPath = join(rootDirectory, "docs/CAPABILITY_POLICY.md");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const evaluate = new Function("exports", "module", transpiled);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

const roleNames = new Set(["student", "teacher", "admin", "director", "vendor"]);
const layerOrder = { L0: 0, L1: 1, L2: 2, L3: 3 };
const featureMinimumLayers = {
  riskOverview: "L1",
  controlledMode: "L2",
  adaptivePhase: "L2",
  governanceAccess: "L3",
  hardMode: "L2",
};

test("shared capability matrix is complete and internally safe", async () => {
  const source = await readFile(matrixPath, "utf8");
  assert.doesNotMatch(source, /^import(?!\s+type\b)/mu);

  const { CAPABILITY_MATRIX, LICENSE_FEATURE_FLAG_NAMES } = loadTypeScriptModule(
    source,
    matrixPath,
  );
  const entries = Object.entries(CAPABILITY_MATRIX);

  assert.equal(entries.length, 49);
  assert.deepEqual(new Set(LICENSE_FEATURE_FLAG_NAMES), new Set(Object.keys(featureMinimumLayers)));

  for (const [capability, policy] of entries) {
    assert.match(capability, /^(portal|admin|student|exam|vendor)\.[a-z0-9_.]+$/u);
    assert.ok(policy.allowedRoles.length > 0, `${capability} must grant at least one role`);
    assert.equal(new Set(policy.allowedRoles).size, policy.allowedRoles.length);

    for (const role of policy.allowedRoles) {
      assert.ok(roleNames.has(role), `${capability} contains unknown role ${role}`);
    }

    if (capability.startsWith("vendor.") || capability === "portal.vendor.access") {
      assert.deepEqual(policy.allowedRoles, ["vendor"]);
      assert.equal(policy.minimumLicenseLayer, null);
      assert.deepEqual(policy.requiredFeatureFlags, []);
    } else {
      assert.ok(policy.minimumLicenseLayer in layerOrder);
    }

    if (policy.allowedRoles.includes("director")) {
      const directorMinimum = policy.roleMinimumLicenseLayers?.director ?? policy.minimumLicenseLayer;
      assert.equal(directorMinimum, "L3", `${capability} must keep Director at L3`);
    }

    assert.equal(
      new Set(policy.requiredFeatureFlags).size,
      policy.requiredFeatureFlags.length,
    );
    for (const featureFlag of policy.requiredFeatureFlags) {
      const minimumLayer = featureMinimumLayers[featureFlag];
      assert.ok(minimumLayer, `${capability} contains unknown feature flag ${featureFlag}`);
      assert.ok(
        layerOrder[policy.minimumLicenseLayer] >= layerOrder[minimumLayer],
        `${capability} must meet the ${featureFlag} layer floor`,
      );
    }
  }

  assert.deepEqual(CAPABILITY_MATRIX["admin.governance.read"], {
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    requiredFeatureFlags: ["governanceAccess"],
  });
  assert.deepEqual(CAPABILITY_MATRIX["admin.interventions.manage"], {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L1",
    requiredFeatureFlags: ["riskOverview"],
  });
  assert.deepEqual(CAPABILITY_MATRIX["exam.mode.hard.execute"], {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["hardMode"],
  });
});

test("capability policy documentation accounts for every matrix entry", async () => {
  const [source, documentation] = await Promise.all([
    readFile(matrixPath, "utf8"),
    readFile(documentationPath, "utf8"),
  ]);
  const { CAPABILITY_MATRIX } = loadTypeScriptModule(source, matrixPath);
  const documentedCapabilities = new Set(
    [...documentation.matchAll(/^\| `((?:portal|admin|student|exam|vendor)\.[^`]+)` \|/gmu)].map(
      (match) => match[1],
    ),
  );

  assert.deepEqual(documentedCapabilities, new Set(Object.keys(CAPABILITY_MATRIX)));
  assert.match(documentation, /Missing roles, layers, or required flags fail closed\./u);
  assert.match(documentation, /Eligibility flags describe upgrade readiness and never grant/u);
  assert.match(
    documentation,
    /shared Functions authentication middleware rejects a verified token/u,
  );
});
