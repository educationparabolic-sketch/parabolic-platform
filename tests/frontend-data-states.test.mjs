import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const servicePath = join(rootDirectory, "shared/services/frontendDataState.ts");
const componentPath = join(rootDirectory, "shared/ui/components/UiDataStateBoundary.tsx");
const apiClientPath = join(rootDirectory, "shared/services/apiClient.ts");
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

test("frontend data-state lifecycle classifies loading, empty, permission, validation, and unavailable", async () => {
  const source = await readFile(servicePath, "utf8");
  const dataState = loadTypeScriptModule(source, servicePath);

  dataState.resetFrontendDataState();
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "loading");
  dataState.releaseFrontendDataStateIfIdle();
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "ready");

  const emptyRequest = dataState.beginFrontendDataRequest("GET", "/student/dashboard");
  dataState.completeFrontendDataRequest(emptyRequest, []);
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "empty");

  const firstParallelRequest = dataState.beginFrontendDataRequest("GET", "/admin/tests");
  const secondParallelRequest = dataState.beginFrontendDataRequest("GET", "/admin/students");
  dataState.completeFrontendDataRequest(firstParallelRequest, []);
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "loading");
  dataState.completeFrontendDataRequest(secondParallelRequest, [{ id: "student-001" }]);
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "ready");

  const permissionRequest = dataState.beginFrontendDataRequest("GET", "/admin/settings");
  dataState.failFrontendDataRequest(permissionRequest, {
    code: "FORBIDDEN",
    message: "Access denied.",
    status: 403,
  });
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "permission");

  const validationRequest = dataState.beginFrontendDataRequest("GET", "/admin/analytics");
  dataState.failFrontendDataRequest(validationRequest, {
    code: "INVALID_RESPONSE",
    message: "Response validation failed.",
    status: 200,
  });
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "validation");

  const unavailableRequest = dataState.beginFrontendDataRequest("GET", "/vendor/calibration");
  dataState.failFrontendDataRequest(unavailableRequest, new Error("Network failed."));
  assert.equal(dataState.getFrontendDataStateSnapshot().kind, "unavailable");
});

test("shared client and every portal route boundary use the data-state contract", async () => {
  const [componentSource, apiClientSource, ...appSources] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(apiClientPath, "utf8"),
    ...["admin", "student", "exam", "vendor"].map((portal) =>
      readFile(join(rootDirectory, `apps/${portal}/src/App.tsx`), "utf8"),
    ),
  ]);

  for (const state of ["loading", "empty", "unavailable", "permission", "validation"]) {
    assert.match(componentSource, new RegExp(`${state}:`, "u"));
  }
  assert.match(componentSource, /\bRetry\b/u);
  assert.match(componentSource, /data-ui-data-state-content/u);
  assert.match(componentSource, /display: "none"/u);
  assert.match(apiClientSource, /beginFrontendDataRequest\(method, requestPath\)/u);
  assert.match(apiClientSource, /completeFrontendDataRequest\(dataRequestId, data\)/u);
  assert.match(apiClientSource, /failFrontendDataRequest\(dataRequestId, error\)/u);
  assert.ok(
    apiClientSource.indexOf("options.responseAdapter(unwrapped)") <
      apiClientSource.indexOf("completeFrontendDataRequest(dataRequestId, data)"),
    "response validation must complete before a request can publish ready data",
  );

  for (const source of appSources) {
    assert.match(source, /<UiDataStateBoundary label=/u);
  }
});
