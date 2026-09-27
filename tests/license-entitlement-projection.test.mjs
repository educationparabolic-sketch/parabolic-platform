import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = join(rootDirectory, "shared/services/globalPortalState.tsx");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadModule(source) {
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loaded = { exports: {} };
  const evaluate = new Function("exports", "module", "require", output);
  evaluate(loaded.exports, loaded, (specifier) => {
    if (specifier === "react") {
      return { createContext: () => null, useContext: () => null, useMemo: (factory) => factory() };
    }
    if (specifier === "react/jsx-runtime") {
      return { jsx: () => null };
    }
    if (specifier.endsWith("authProvider")) {
      return { useAuthProvider: () => ({ session: {} }) };
    }
    if (specifier.endsWith("frontendEnvironment")) {
      return { getFrontendEnvironment: () => "development" };
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  return loaded.exports;
}

function token(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.`;
}

const source = await readFile(sourcePath, "utf8");
const { resolveGlobalPortalState } = loadModule(source);
const now = new Date("2026-09-26T00:00:00.000Z");
const baseClaims = {
  expiryDate: "2099-09-26T00:00:00.000Z",
  featureFlags: {
    adaptivePhase: true,
    controlledMode: true,
    governanceAccess: true,
    hardMode: true,
    riskOverview: true,
  },
  gracePeriodEndsAt: null,
  licenseLayer: "L3",
  licenseState: "active",
  licenseVersion: "license-projection-v3",
  role: "director",
};

function resolve(claims) {
  return resolveGlobalPortalState({
    now,
    portal: "admin",
    session: { idToken: token(claims), status: "authenticated" },
  });
}

test("complete active claims retain their layer and feature authority", () => {
  const state = resolve(baseClaims);

  assert.equal(state.license.currentLayer, "L3");
  assert.equal(state.license.status, "active");
  assert.equal(state.license.licenseVersion, "license-projection-v3");
  assert.equal(state.permissions.canAccessGovernanceDashboard, true);
});

test("missing claim version fails closed", () => {
  const state = resolve({ ...baseClaims, licenseVersion: undefined });

  assert.equal(state.license.currentLayer, null);
  assert.equal(state.license.status, null);
  assert.equal(state.permissions.canAccessGovernanceDashboard, false);
});

test("elapsed expiry and grace reduce browser authority to L0", () => {
  const expired = resolve({ ...baseClaims, expiryDate: "2026-09-25T23:59:59.000Z" });
  const grace = resolve({
    ...baseClaims,
    gracePeriodEndsAt: "2026-10-03T00:00:00.000Z",
    licenseState: "grace",
  });
  const elapsedGrace = resolve({
    ...baseClaims,
    gracePeriodEndsAt: "2026-09-25T23:59:59.000Z",
    licenseState: "grace",
  });

  assert.deepEqual(
    [expired.license.status, expired.license.currentLayer],
    ["expired", "L0"],
  );
  assert.deepEqual(
    [grace.license.status, grace.license.currentLayer],
    ["grace", "L0"],
  );
  assert.deepEqual(
    [elapsedGrace.license.status, elapsedGrace.license.currentLayer],
    ["expired", "L0"],
  );
  for (const state of [expired, grace, elapsedGrace]) {
    assert.equal(state.permissions.canUseControlledMode, false);
    assert.equal(state.permissions.canAccessGovernanceDashboard, false);
  }
});
