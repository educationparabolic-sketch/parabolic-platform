import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");
const require = createRequire(import.meta.url);
const ts = require(join(root, "functions/node_modules/typescript"));

test("calibration transport enforces current Vendor and safe disposable emulator guards", async () => {
  const boundary = await read("functions/src/api/vendorCalibrationBoundary.ts");
  const policyOutput = ts.transpileModule(await read("shared/contracts/capabilityPolicy.ts"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const policyModule = {exports: {}};
  new Function("exports", "module", policyOutput)(policyModule.exports, policyModule);
  assert.deepEqual(policyModule.exports.CAPABILITY_MATRIX["vendor.calibration.manage"], {
    allowedRoles: ["vendor"], minimumLicenseLayer: null, requiredFeatureFlags: [],
  });
  assert.match(boundary, /allowedRoles:\s*\["vendor"\]/u);
  for (const requirement of ["vendor.calibration.manage", "dependencies.getUser(identity.uid)",
    "user.disabled", "claims.isSuspended", 'claims.role !== "vendor"', "claims.isVendor === false",
    "assertExactCalibrationKeys", "MAX_CALIBRATION_INSTITUTES"]) assert.ok(boundary.includes(requirement), requirement);
  for (const file of ["vendorCalibrationPush", "vendorCalibrationSimulation", "vendorCalibrationVersions", "vendorCalibrationOperations"]) {
    const source = await read(`functions/src/api/${file}.ts`);
    assert.ok(source.includes("calibrationMiddlewares("));
    assert.ok(source.includes("verifyIdToken(token, true)"));
  }
  const reads = await read("functions/src/services/calibrationVersionReads.ts");
  for (const requirement of ["limit + 1", "limit > 50", "?? 25", "cursor.length > 512", "validateStoredCalibrationVersion",
    'value.query !== "calibration_versions"', "encodeCursor(id) !== cursor", "snapshot.docs.map"]) assert.ok(reads.includes(requirement), requirement);
  const rejected = spawnSync(process.execPath, ["functions/tests/vendorCalibrationApi.emulator.test.js"], {
    cwd: root, env: {...process.env, GCLOUD_PROJECT: "not-disposable"}, encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /demo-parabolic-test/);
});

test("calibration version reads are implemented bounded handlers", async () => {
  const source = await read("functions/src/apiRouteManifest.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const module = {exports: {}};
  new Function("exports", "module", output)(module.exports, module);
  const {API_ROUTE_MANIFEST, BACKEND_HTTP_EXPORT_MANIFEST} = module.exports;
  const routes = API_ROUTE_MANIFEST.filter(({id}) => ["VEN-36", "VEN-37"].includes(id));
  assert.deepEqual(routes.map(({id, canonicalPath, method, status, functionExport, declaration}) =>
    [id, canonicalPath, method, status, functionExport, declaration]), [
    ["VEN-36", "/api/v1/vendor/calibration/versions", "GET", "implemented", "vendorCalibrationVersions", "planned"],
    ["VEN-37", "/api/v1/vendor/calibration/versions/{versionId}", "GET", "implemented", "vendorCalibrationVersions", "planned"],
  ]);
  assert.equal(API_ROUTE_MANIFEST.length, 112);
  assert.equal(API_ROUTE_MANIFEST.filter(({status}) => status === "implemented").length, 107);
  assert.equal(API_ROUTE_MANIFEST.filter(({status}) => status === "incompatible").length, 0);
  assert.equal(API_ROUTE_MANIFEST.filter(({status}) => status === "missing").length, 0);
  assert.equal(BACKEND_HTTP_EXPORT_MANIFEST.length, 60);
  assert.equal(API_ROUTE_MANIFEST.find(({id}) => id === "VEN-01").status, "implemented");
});

test("declarations compile valid intent and reject strategy, taxonomy, flags and empty-result drift", () => {
  const file = join(root, "tests/__vendor_calibration_contract_probe.ts");
  const source = `
    import type {VendorCalibrationWeights, VendorCalibrationRiskState,
      VendorCalibrationSimulationRequest, VendorCalibrationSimulationResult,
      VendorCalibrationDeploymentRequest, VendorCalibrationThresholds}
      from "../shared/contracts/vendorCalibration";
    const weights: VendorCalibrationWeights = {guessWeight: .3, phaseWeight: .25,
      easyNeglectWeight: .15, hardBiasWeight: .15, wrongStreakWeight: .15};
    const thresholds: VendorCalibrationThresholds = {guessFactorEasy: 1.2,
      guessFactorMedium: 1.5, guessFactorHard: 1.8, phaseDeviationThreshold: 24};
    const request: VendorCalibrationSimulationRequest = {
      academicYearId: "2026", institutes: ["inst_a"], weights};
    const state: VendorCalibrationRiskState = "Drift-Prone";
    const push: VendorCalibrationDeploymentRequest = {versionId: "v1", targetInstitutes: ["inst_a"]};
    // @ts-expect-error three-bucket UI vocabulary is not a backend risk state
    const wrongState: VendorCalibrationRiskState = "low";
    // @ts-expect-error explicit population year is mandatory
    const noYear: VendorCalibrationSimulationRequest = {institutes: ["inst_a"], weights};
    // @ts-expect-error no implicit strategy/overstay mapping
    const wrongWeights: VendorCalibrationWeights = {guessWeight: .3, phaseWeight: .25, easyNeglectWeight: .15, hardBiasWeight: .15, overstayWeight: .15};
    // @ts-expect-error stage/schedule flags have no deployment semantics
    const scheduled: VendorCalibrationDeploymentRequest = {versionId: "v1", targetInstitutes: ["inst_a"], draftModeOnly: true};
    declare const result: VendorCalibrationSimulationResult;
    if (result.availability === "empty") {
      const empty: null = result.before;
      // @ts-expect-error empty authority cannot fabricate a metric
      const score: number = result.before.averageProjectedRiskScore;
    } else {
      const projected: number = result.before.averageProjectedRiskScore;
      const unsupported: "unavailable" = result.metadata.unsupportedOutputs.productionRiskOutcome;
    }
  `;
  const options = {strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022};
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === file ? ts.createSourceFile(file, source, languageVersion, true) :
      getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([file], options, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
});

test("closed numeric, source, population and compute validation requirements stay explicit", async () => {
  const contract = await read("shared/contracts/vendorCalibration.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);
  for (const requirement of [
    "unknown fields, coercion and fabricated", "Validate before rounding",
    "weightSumTolerance: 0.000001", "maximumInstitutes: 20",
    "maximumSummariesPerInstitute: 1000", "maximumSummariesTotal: 5000",
    "overflowProbeDocuments: 1", "activeGlobalProbeLimit: 2",
    "maximumVersionPageSize: 50", "maximumCursorLength: 512",
    "riskStateUpperBounds: [20, 40, 60, 80, 100]", "mixed empty/nonempty targets fail",
    "if both are present they must agree", "Never silently default",
    "A future active model fails", "not fall back silently",
    "No truncation, sampling or partial", "Do not average already rounded institute means",
    'model: "risk_projection_v1"', 'population: "student_year_summaries"',
  ]) assert.ok(contract.includes(requirement), requirement);
  const riskTypes = await read("functions/src/types/riskEngine.ts");
  for (const state of ["Stable", "Drift-Prone", "Impulsive", "Overextended", "Volatile"]) {
    assert.ok(riskTypes.includes(`"${state}"`));
    assert.ok(contract.includes(`"${state}"`));
  }
});

test("runtime storage and simulation adopt bounded stored-summary authority", async () => {
  const runtimeTypes = await read("functions/src/types/calibrationSimulation.ts");
  const calibrationTypes = await read("functions/src/types/calibrationVersion.ts");
  const contractRuntime = await read("functions/src/services/calibrationContract.ts");
  const simulation = await read("functions/src/services/calibrationSimulation.ts");
  const storage = await read("functions/src/services/calibrationVersionStorage.ts");
  const metricsProducer = await read("functions/src/services/studentMetricsEngine.ts");
  const patternProducer = await read("functions/src/services/patternEngine.ts");

  assert.ok(runtimeTypes.includes("VendorCalibrationSimulationRequest"));
  assert.ok(runtimeTypes.includes("VendorCalibrationSimulationResult"));
  assert.ok(calibrationTypes.includes("VendorCalibrationWeights"));
  assert.ok(calibrationTypes.includes("VendorCalibrationThresholds"));
  for (const requirement of [
    "MAX_CALIBRATION_INSTITUTES = 20",
    "MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE = 1000",
    "MAX_CALIBRATION_SUMMARIES_TOTAL = 5000",
    "CALIBRATION_WEIGHT_SUM_TOLERANCE = 0.000001",
  ]) assert.ok(contractRuntime.includes(requirement), requirement);
  assert.ok(simulation.includes(".limit(2)"));
  assert.ok(simulation.includes("MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE + 1"));
  assert.ok(simulation.includes("normalizedInput.academicYearId"));
  assert.ok(simulation.includes("mixes empty and non-empty"));
  assert.doesNotMatch(simulation, /\.listDocuments\(/u);
  assert.doesNotMatch(simulation, /collection\(["'](?:sessions|answers|questionAttempts)["']\)/u);
  assert.ok(storage.includes("schemaVersion: 1"));
  assert.ok(storage.includes('.where("isActive", "==", true)'));
  for (const field of [
    "avgPhaseAdherencePercent", "avgGuessRatePercent",
    "easyNeglectRatePercent", "hardBiasRatePercent",
  ]) assert.ok(metricsProducer.includes(field), field);
  assert.ok(patternProducer.includes("wrongStreakActive"));
});

test("contract aliases the sole deployment DTO and claims no unsupported activation or output", async () => {
  const contract = await read("shared/contracts/vendorCalibration.d.ts");
  assert.ok(contract.includes('import("./apiDtos.js").VendorCalibrationPushRequest'));
  assert.ok(contract.includes('import("./apiDtos.js").DeployCalibrationVersionResult'));
  for (const requirement of [
    'capability: "vendor.calibration.manage"', 'activationRecoveryOwner: "BWM-039"',
    'unifiedAuditOwner: "BWM-040"', 'remoteQualificationOwner: "BWM-053"',
    'deploymentAvailability: "immediate_selected_targets"',
    'forbiddenModes: ["dry_run_deployment", "draft", "scheduled", "rollback", "all_institutes"]',
    'forbiddenInputs: ["raw_sessions", "answers", "question_attempts"]',
    "Editing weights/targets/year, retry or failure clears prior UI authority",
    "Thresholds are read-only metadata", "No browser localStorage audit",
  ]) assert.ok(contract.includes(requirement), requirement);
});

test("binding docs distinguish implemented transport from pending frontend and rollout", async () => {
  for (const path of ["docs/api_contract.md", "docs/FRONTEND_API_CALL_INVENTORY.md", "docs/MODULE_REGISTRY.md"]) {
    const source = await read(path);
    for (const key of ["VEN-36", "VEN-37", "vendorCalibration.d.ts", "BWM-039"]) assert.ok(source.includes(key), `${path}: ${key}`);
  }
  const schema = await read("docs/firestore_schema.md");
  assert.ok(schema.includes("risk_projection_v1"));
  assert.ok(schema.includes("globalCalibration/{versionId}"));
  assert.ok(schema.includes("no new collection"));
});
