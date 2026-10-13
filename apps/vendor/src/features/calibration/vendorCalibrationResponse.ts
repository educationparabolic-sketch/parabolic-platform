import type { VendorCalibrationWeights, VendorCalibrationVersion, VendorCalibrationSimulationRequest,
  VendorCalibrationSimulationResult, VendorCalibrationVersionsResult } from "../../../../../shared/contracts/vendorCalibration";

export const riskStates = ["Stable", "Drift-Prone", "Impulsive", "Overextended", "Volatile"] as const;
export const weightKeys = ["guessWeight", "phaseWeight", "easyNeglectWeight", "hardBiasWeight", "wrongStreakWeight"] as const;
type Obj = Record<string, unknown>;
function fail(): never { throw new Error("Invalid Vendor calibration authority."); }
function obj(value: unknown, keys: readonly string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const item = value as Obj;
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))) return fail();
  return item;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return fail();
  return value;
}
function count(value: unknown, max = 5000): number {
  const n = number(value, 0, max); if (!Number.isSafeInteger(n)) return fail(); return n;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return fail(); return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return fail();
  return value;
}
const round = (n: number) => Math.round(n * 100) / 100;
function equal(a: unknown, b: unknown) { if (a !== b) fail(); }
export function parseCalibrationWeights(value: unknown): VendorCalibrationWeights {
  const item = obj(value, weightKeys);
  weightKeys.forEach(key => number(item[key], 0, 1));
  if (Math.abs(weightKeys.reduce((sum, key) => sum + (item[key] as number), 0) - 1) > .000001) fail();
  return item as unknown as VendorCalibrationWeights;
}
export function parseCalibrationRequest(value: unknown): VendorCalibrationSimulationRequest {
  const item = obj(value, ["academicYearId", "institutes", "weights"]);
  id(item.academicYearId);
  if (!Array.isArray(item.institutes) || item.institutes.length < 1 || item.institutes.length > 20) fail();
  const ids = (item.institutes as unknown[]).map(id);
  if (new Set(ids).size !== ids.length) fail();
  parseCalibrationWeights(item.weights);
  return item as unknown as VendorCalibrationSimulationRequest;
}
export function parseCalibrationVersion(value: unknown): VendorCalibrationVersion {
  const item = obj(value, ["schemaVersion", "versionId", "weights", "thresholds", "createdBy", "createdAt", "activationDate", "isActive", "sourcePath", "deploymentAvailability"]);
  equal(item.schemaVersion, 1); const versionId = id(item.versionId);
  parseCalibrationWeights(item.weights);
  const thresholds = obj(item.thresholds, ["guessFactorEasy", "guessFactorMedium", "guessFactorHard", "phaseDeviationThreshold"]);
  for (const key of ["guessFactorEasy", "guessFactorMedium", "guessFactorHard"]) if (number(thresholds[key], 0, 10) === 0) fail();
  number(thresholds.phaseDeviationThreshold, 0, 100); date(item.createdAt);
  if (typeof item.createdBy !== "string" || !item.createdBy.trim() || typeof item.isActive !== "boolean") fail();
  if (item.activationDate !== null) date(item.activationDate);
  if (item.isActive && (item.activationDate === null || Date.parse(item.activationDate as string) > Date.now())) fail();
  equal(item.sourcePath, `globalCalibration/${versionId}`);
  equal(item.deploymentAvailability, "immediate_selected_targets");
  return item as unknown as VendorCalibrationVersion;
}
export function parseCalibrationVersions(value: unknown): VendorCalibrationVersionsResult {
  const item = obj(value, ["items", "hasMore", "nextCursor"]);
  if (!Array.isArray(item.items) || item.items.length > 50 || typeof item.hasMore !== "boolean") fail();
  const versions = (item.items as unknown[]).map(parseCalibrationVersion);
  if (versions.some((version, i) => i > 0 && version.versionId <= versions[i - 1].versionId)) fail();
  if (item.hasMore) {
    if (!versions.length || typeof item.nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(item.nextCursor)) fail();
    try {
      const cursor = obj(JSON.parse(atob((item.nextCursor as string).replace(/-/g, "+").replace(/_/g, "/"))), ["schemaVersion", "query", "lastVersionId"]);
      equal(cursor.schemaVersion, 1); equal(cursor.query, "calibration_versions"); equal(cursor.lastVersionId, versions.at(-1)?.versionId);
      equal(btoa(JSON.stringify({ schemaVersion: 1, query: "calibration_versions", lastVersionId: cursor.lastVersionId })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), item.nextCursor);
    } catch { fail(); }
  } else equal(item.nextCursor, null);
  return item as unknown as VendorCalibrationVersionsResult;
}
export function parseCalibrationDetail(value: unknown, expected: string): VendorCalibrationVersion {
  const version = parseCalibrationVersion(obj(value, ["version"]).version);
  equal(version.versionId, expected); return version;
}
function distribution(value: unknown, total: number, delta = false) {
  const item = obj(value, riskStates); let sum = 0;
  for (const state of riskStates) {
    const entry = obj(item[state], ["count", "percent"]);
    const n = number(entry.count, delta ? -total : 0, total);
    if (!Number.isSafeInteger(n)) fail();
    equal(number(entry.percent, delta ? -100 : 0, 100), round(n / total * 100));
    sum += n;
  }
  equal(sum, delta ? 0 : total);
  return item;
}
export function parseCalibrationSimulation(value: unknown, request: VendorCalibrationSimulationRequest): VendorCalibrationSimulationResult {
  const item = obj(value, ["availability", "metadata", "proposedWeights", "before", "after", "delta", "institutes"]);
  const metadata = obj(item.metadata, ["schemaVersion", "model", "population", "academicYearId", "evaluatedAt", "sources", "unsupportedOutputs"]);
  equal(metadata.schemaVersion, 1); equal(metadata.model, "risk_projection_v1"); equal(metadata.population, "student_year_summaries");
  equal(metadata.academicYearId, request.academicYearId); date(metadata.evaluatedAt);
  const weights = parseCalibrationWeights(item.proposedWeights);
  weightKeys.forEach(key => equal(weights[key], request.weights[key]));
  const unsupported = obj(metadata.unsupportedOutputs, ["batchDelta", "clusterMovement", "disciplineDelta", "estimatedAlertDelta", "productionRiskOutcome", "stabilityImpact"]);
  Object.values(unsupported).forEach(value => equal(value, "unavailable"));
  if (!Array.isArray(metadata.sources) || metadata.sources.length !== request.institutes.length) fail();
  let total = 0;
  const sources = (metadata.sources as unknown[]).map((source, i) => {
    const s = obj(source, ["instituteId", "academicYearId", "calibrationVersion", "calibrationSourcePath", "summaryDocumentCount"]);
    equal(id(s.instituteId), request.institutes[i]); equal(s.academicYearId, request.academicYearId);
    const version = id(s.calibrationVersion); const path = s.calibrationSourcePath;
    if (path !== `globalCalibration/${version}` && path !== `institutes/${s.instituteId}/calibration/${version}`) fail();
    total += count(s.summaryDocumentCount, 1000); return s;
  });
  count(total);
  if (item.availability === "empty") {
    equal(total, 0); equal(item.before, null); equal(item.after, null); equal(item.delta, null);
    if (!Array.isArray(item.institutes) || item.institutes.length) fail();
  } else {
    equal(item.availability, "available"); if (!total || sources.some(s => s.summaryDocumentCount === 0)) fail();
    const summaries = [item.before, item.after].map(value => {
      const summary = obj(value, ["averageProjectedRiskScore", "instituteCount", "studentCount", "riskDistribution"]);
      number(summary.averageProjectedRiskScore, 0, 100); equal(summary.instituteCount, sources.length); equal(summary.studentCount, total);
      distribution(summary.riskDistribution, total); return summary;
    });
    const delta = obj(item.delta, ["averageProjectedRiskScore", "studentCount", "riskDistribution"]);
    equal(delta.studentCount, 0);
    equal(delta.averageProjectedRiskScore, round((summaries[1].averageProjectedRiskScore as number) - (summaries[0].averageProjectedRiskScore as number)));
    const deltas = obj(delta.riskDistribution, riskStates);
    for (const state of riskStates) {
      const before = (summaries[0].riskDistribution as Obj)[state] as Obj;
      const after = (summaries[1].riskDistribution as Obj)[state] as Obj;
      const entry = obj(deltas[state], ["count", "percent"]);
      equal(entry.count, (after.count as number) - (before.count as number));
      equal(entry.percent, round((after.percent as number) - (before.percent as number)));
    }
    if (!Array.isArray(item.institutes) || item.institutes.length !== sources.length) fail();
    const aggregateDeltas: Record<string, number> = Object.fromEntries(riskStates.map(state => [state, 0]));
    const weightedMeans = [0, 0];
    (item.institutes as unknown[]).forEach((projection, i) => {
      const p = obj(projection, ["instituteId", "academicYearId", "currentCalibrationVersion", "currentCalibrationSourcePath", "studentCount", "beforeAverageProjectedRiskScore", "projectedAverageRiskScore", "riskDistributionDelta"]);
      const s = sources[i]; equal(p.instituteId, s.instituteId); equal(p.academicYearId, s.academicYearId);
      equal(p.currentCalibrationVersion, s.calibrationVersion); equal(p.currentCalibrationSourcePath, s.calibrationSourcePath); equal(p.studentCount, s.summaryDocumentCount);
      number(p.beforeAverageProjectedRiskScore, 0, 100); number(p.projectedAverageRiskScore, 0, 100);
      weightedMeans[0] += (p.beforeAverageProjectedRiskScore as number) * (p.studentCount as number);
      weightedMeans[1] += (p.projectedAverageRiskScore as number) * (p.studentCount as number);
      const changes = obj(p.riskDistributionDelta, riskStates); let sum = 0;
      riskStates.forEach(state => { const n = number(changes[state], -(p.studentCount as number), p.studentCount as number); if (!Number.isSafeInteger(n)) fail(); sum += n; aggregateDeltas[state] += n; });
      equal(sum, 0);
    });
    riskStates.forEach(state => equal(aggregateDeltas[state], (deltas[state] as Obj).count));
    summaries.forEach((summary, i) => {
      if (Math.abs((summary.averageProjectedRiskScore as number) - weightedMeans[i] / total) > .0100001) fail();
    });
  }
  return item as unknown as VendorCalibrationSimulationResult;
}
