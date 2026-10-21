import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const functionsRequire = createRequire(new URL("../functions/package.json", import.meta.url));
const path = new URL("../shared/services/studentSummaryResponseAdapters.ts", import.meta.url);
const source = ts.transpileModule(readFileSync(path, "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const mod = {exports: {}};
new Function("exports", "module", "require", source)(mod.exports, mod, (id) => {
  if (id === "./examRecoveryValidation") return functionsRequire("./lib/services/examRecoveryValidation.js");
  return functionsRequire(id);
});
const adapt = mod.exports.adaptStudentSummaryResult;
function loadTs(relativePath, dependencies = {}) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const output = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const loaded = {exports: {}};
  new Function("exports", "module", "require", output)(loaded.exports, loaded, (id) => {
    if (id in dependencies) return dependencies[id];
    return functionsRequire(id);
  });
  return loaded.exports;
}
const summaryTypes = loadTs("../functions/src/types/studentSummary.ts");
const {dashboardProjection, performanceProjection, performancePoint, insightProjection} =
  loadTs("../functions/src/services/studentSummaryProjection.ts", {"../types/studentSummary": summaryTypes});
const access = (layer = "L1", overrides = {}) => ({policyVersion: "student-entitlements-v1", licenseLayer: layer,
  metrics: {basic: true, execution: layer !== "L0", insights: layer !== "L0", advanced: ["L2", "L3"].includes(layer),
    controlledComparison: false, hardTiming: false, ...overrides}});
const current = (a) => ({contractVersion: 2, scope: {kind: "current", yearId: "opaque-year", tier: "HOT_WARM"}, access: a});
function dashboard(a) { return {...current(a), ...dashboardProjection({avgRawScorePercent: 73}, a), upcomingTests: [], recentResults: []}; }
function performance(a) { return {...current(a), ...performanceProjection({}, a, [performancePoint({runId: "r", runLabel: "Own",
  submittedAt: "2026-10-17T10:00:00Z", rawScorePercent: 0, accuracyPercent: 0, timeSpentMinutes: 0}, a, 0)])}; }

test("v2 adapters retain real zero, recursive nulls and empty lists across the layer/feature matrix", () => {
  for (const layer of ["L0", "L1", "L2", "L3"]) for (const controlledComparison of [false, true]) for (const hardTiming of [false, true]) {
    const a = access(layer, {controlledComparison: ["L2", "L3"].includes(layer) && controlledComparison,
      hardTiming: ["L2", "L3"].includes(layer) && hardTiming});
    const d = dashboard(a); const p = performance(a);
    assert.deepEqual(adapt(d, "dashboard"), d);
    const parsed = adapt(p, "performance");
    assert.equal(parsed.timeline[0].rawScorePercent, 0);
    assert.equal(parsed.timeline[0].guessRatePercent, a.metrics.advanced ? 0 : null);
    assert.equal(parsed.timeline[0].maxTimeViolationPercent, a.metrics.hardTiming ? 0 : null);
    assert.deepEqual(parsed, p);
    if (a.metrics.insights) {
      const data = {...current(a), ...insightProjection({}, a, [{id: "own", data: () => ({sourceSubmittedAt: "2026-10-17T10:00:00Z",
        dominantPattern: "guess_detection", metrics: {guessDetectionPercent: 87}})}])};
      assert.deepEqual(adapt(data, "insights"), data);
      assert.equal(data.snapshots[0].guessDetectionPercent, a.metrics.advanced ? 87 : null);
    }
  }
});
test("malformed, legacy, hidden fields, contradictory grants and missing nullable keys fail visibly", () => {
  const a = access(); const d = dashboard(a);
  for (const value of [{...d, contractVersion: 1}, {...d, disciplineIndex: 0}, {...d, avgRawScorePercent: "73"},
    {...d, sessionLogs: []}, {...d, licenseLayer: "L3"}, {...d, scope: {...d.scope, yearId: undefined}},
    {...d, access: access("L0", {advanced: true})}, {...d, access: access("L1", {execution: false, insights: false})}]) assert.throws(() => adapt(value, "dashboard"), /could not be validated/);
  const missing = structuredClone(d); delete missing.disciplineIndex;
  assert.throws(() => adapt(missing, "dashboard"));
  const p = performance(a); p.timeline[0].guessRatePercent = 0;
  assert.throws(() => adapt(p, "performance"));
  const hardOff = performance(access("L2", {controlledComparison: true}));
  hardOff.controlledModeComparison.maxTimeViolationDeltaPercent = 0;
  assert.throws(() => adapt(hardOff, "performance"));
});
test("closed history and cursor pages preserve authoritative scope, including an empty advancing page", () => {
  const data = {contractVersion: 2, scope: {kind: "history", yearId: null, tier: "COLD_SUMMARY"},
    access: access("L0"), page: {items: [], hasMore: true, nextCursor: "opaque-position"}};
  assert.deepEqual(adapt(data, "tests"), data);
  const row = {academicYear: "old", currentAcademicYear: false, runId: "run", testId: "test", testName: "Old",
    completedAt: "2026-01-01T00:00:00Z", rawScorePercent: 0, accuracyPercent: 0};
  data.page.items = [row];
  assert.equal(Object.keys(adapt(data, "tests").page.items[0]).length, 8);
  for (const bad of [{...row, sessionId: "hidden"}, {...row, currentAcademicYear: true}, {...row, academicYear: undefined}]) {
    assert.throws(() => adapt({...data, page: {...data.page, items: [bad]}}, "tests"));
  }
  assert.throws(() => adapt({...data, page: {...data.page, nextCursor: null}}, "tests"));
  assert.throws(() => adapt({...data, scope: {...data.scope, yearId: "different"}}, "tests"));
  assert.throws(() => adapt({...data, access: access("L2")}, "tests"));
});
test("released solutions preserve signed URL bytes and nullable assets/answers without CDN reconstruction", () => {
  const signed = "https://cdn.example.test/a.png?Signature=a%2Fb%2Bz&Expires=1999999999&KeyName=one";
  const item = {questionId: "q", questionVersion: 2, questionRevision: 3, questionImageUrl: signed,
    solutionImageUrl: null, assetsExpireAt: "2030-01-01T00:00:00Z", correctAnswer: "A", studentAnswer: null,
    tutorialVideoLink: null, simulationLink: null};
  const data = {...current(access("L2")), testId: "test", runId: "run", releasedAt: "2026-10-17T10:00:00Z",
    page: {items: [item], nextCursor: null, hasMore: false}};
  assert.equal(adapt(data, "solutions").page.items[0].questionImageUrl, signed);
  assert.equal(adapt(data, "solutions").page.items[0].studentAnswer, null);
  for (const bad of [{...item, questionImageUrl: "javascript:alert(1)"}, {...item, assetsExpireAt: null},
    {...item, questionVersion: 0}, {...item, answerMap: {}}]) {
    assert.throws(() => adapt({...data, page: {...data.page, items: [bad]}}, "solutions"));
  }
});
