import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("rollout declarations accept bounded intent and reject legacy/unsafe shapes", () => {
  const file = `${root}tests/__rollout_contract_probe.ts`;
  const source = `
    import type {VendorCalibrationRolloutRequest, VendorCalibrationRollbackRequest,
      VendorCalibrationOperationResult, VendorCalibrationPointer}
      from "../shared/contracts/vendorCalibrationRollout";
    const apply: VendorCalibrationRolloutRequest = {idempotencyKey: "uuid",
      versionId: "v2", targets: [{instituteId: "i1", expectedCalibrationVersion: null}]};
    const inverse: VendorCalibrationRollbackRequest = {idempotencyKey: "new-uuid", expectedOperationRevision: 2};
    const absent: VendorCalibrationPointer = {present: false};
    const explicitNull: VendorCalibrationPointer = {present: true, value: null};
    // @ts-expect-error legacy body cannot be mistaken for safe rollout
    const legacy: VendorCalibrationRolloutRequest = {versionId: "v2", targetInstitutes: ["i1"]};
    // @ts-expect-error optimistic precondition required even for first apply
    const noPrecondition: VendorCalibrationRolloutRequest = {idempotencyKey: "uuid", versionId: "v2", targets: [{instituteId: "i1"}]};
    // @ts-expect-error revision required for inverse
    const noRevision: VendorCalibrationRollbackRequest = {idempotencyKey: "uuid"};
    // @ts-expect-error absence is not a synthesized null field
    const fabricated: VendorCalibrationPointer = {present: false, value: null};
    // @ts-expect-error no scheduling mode
    const schedule: VendorCalibrationRolloutRequest = {...apply, activationDate: "tomorrow"};
    declare const result: VendorCalibrationOperationResult;
    if (result.state === "pending") {
      const receipt: null = result.receipt;
      // @ts-expect-error uncertainty cannot expose completed receipt
      const date: string = result.receipt.completedAt;
    }
    if (result.state === "not_applied") {
      const failed: "not_applied" = result.receipt.state;
      const inverseId: null = result.rollbackOperationId;
    }
    if (result.state === "rolled_back") {
      const originalReceipt: "applied" = result.receipt.state;
      const inverseId: string = result.rollbackOperationId;
    }
  `;
  const options = {strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022};
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) => name === file ?
    ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
});

test("recovery routes implement exact secured paths without enabling mounted publishing", () => {
  const output = ts.transpileModule(read("functions/src/apiRouteManifest.ts"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const module = {exports: {}};
  new Function("exports", "module", output)(module.exports, module);
  const routes = module.exports.API_ROUTE_MANIFEST.filter((route) => ["VEN-38", "VEN-39"].includes(route.id));
  assert.deepEqual(routes.map(({id, method, canonicalPath, status, functionExport, declaration}) =>
    [id, method, canonicalPath, status, functionExport, declaration]), [
    ["VEN-38", "GET", "/api/v1/vendor/calibration/operations/{operationId}", "implemented", "vendorCalibrationOperations", "planned"],
    ["VEN-39", "POST", "/api/v1/vendor/calibration/operations/{operationId}/rollback", "implemented", "vendorCalibrationOperations", "planned"],
  ]);
  const contract = read("shared/contracts/vendorCalibrationRollout.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);
  for (const requirement of ["SHA-256", "JSON.stringify", "expectedCalibrationVersion",
    "sourceFingerprint", "vendorCalibrationRollouts/{operationId}", "maximumInstitutes: 20",
    "same fingerprint", "no target mutation", "BWM-040", "BWM-053", "field deletion",
    "Lost commit response", "both", "publishingRequiresQualifiedFrozenConsumer: true"]) {
    assert.ok(contract.toLowerCase().includes(requirement.toLowerCase()), requirement);
  }
});
