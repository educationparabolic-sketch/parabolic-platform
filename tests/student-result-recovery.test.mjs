import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
function compile(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, {exports, Error, require: name => {assert.ok(name in imports, name); return imports[name];}, ...globals});
  return exports;
}
const recovery = compile("../apps/student/src/services/studentResultRecovery.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const readiness = state => ({state, sessionId: state === "unknown" ? null : "session", retryAfterSeconds: state === "processing" ? 2 : 0});
test("processing and unknown retain permitted basic scores while suppressing stale reflective data", () => {
  for (const state of ["processing", "unknown"]) {
    const data = {resultReadiness: readiness(state), licenseLayer: "L2", avgRawScorePercent: 73,
      disciplineIndex: 91, timeline: [{rawScorePercent: 73, guessRatePercent: 87}], snapshots: [{guessDetectionPercent: 87}]};
    const result = recovery.withholdUnconfirmedMetrics(data);
    assert.equal(result.avgRawScorePercent, 73); assert.equal(result.licenseLayer, "L2");
    assert.equal(result.disciplineIndex, null); assert.equal(result.timeline[0].guessRatePercent, null);
    assert.deepEqual(plain(result.snapshots), []); assert.equal(data.disciplineIndex, 91);
    assert.deepEqual(plain(result.resultReadiness), readiness(state));
  }
  const available = {resultReadiness: readiness("available"), disciplineIndex: null};
  assert.equal(recovery.withholdUnconfirmedMetrics(available), available);
  const history = {scope: {kind: "history"}, rawScorePercent: 73};
  assert.equal(recovery.withholdUnconfirmedMetrics(history), history);
});
function mounted(load) {
  let now = 0, token = "scope";
  const budget = {current: null};
  const effects = [], states = [], timers = [], listeners = new Map();
  const document = {visibilityState: "visible", addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name)};
  const component = compile("../apps/student/src/services/StudentSummaryRead.tsx", {
    react: {useRef: () => budget, useEffect: fn => effects.push(fn), useState: initial => [initial, value => states.push(value)]},
    "react/jsx-runtime": {jsx: () => null, jsxs: () => null},
    "./studentResultRecovery": recovery,
    "../../../../shared/services/authProvider": {useAuthProvider: () => ({session: {status: "authenticated", idToken: token, user: {uid: "student"}}})},
  }, {document, window: {addEventListener: () => {}, removeEventListener: () => {}}, performance: {now: () => now}, setTimeout: (fn, delay) => {assert.equal(delay, 2000); timers.push(() => {now += delay; fn();}); return timers.length;}, clearTimeout: () => {}});
  component.default({load, label: "dashboard", children: () => null});
  let dispose = effects[0]();
  return {states, timers, dispose: () => dispose?.(), refreshToken: () => {
    dispose?.(); token += "-refreshed";
    component.default({load, label: "dashboard", children: () => null});
    dispose = effects.at(-1)();
  }, visibility: value => {document.visibilityState = value; listeners.get("visibilitychange")?.();}};
}
const settle = async () => {for (let i = 0; i < 6; i++) await Promise.resolve();};
test("visible polling stops at six reads and never invents analytics failure", async () => {
  let calls = 0;
  const view = mounted(async () => {calls++; return {resultReadiness: readiness("processing")};});
  await settle();
  while (view.timers.length) {view.timers.shift()(); await settle();}
  assert.equal(calls, 6); assert.equal(view.states.length, 6);
  view.visibility("hidden"); view.visibility("visible"); await settle(); assert.equal(calls, 6);
  assert.equal(view.states.at(-1).data.resultReadiness.state, "processing"); view.dispose();
});
test("hidden documents stop dispatch; available markers stop timers; disposed reads cannot return old scope", async () => {
  let calls = 0;
  const view = mounted(async () => ({resultReadiness: readiness(++calls === 1 ? "processing" : "available")}));
  await settle(); view.visibility("hidden"); view.timers.shift()(); await settle(); assert.equal(calls, 1);
  view.visibility("visible"); await settle(); if (view.timers.length) {view.timers.shift()(); await settle();} assert.equal(calls, 2); assert.equal(view.timers.length, 0); view.dispose();
  let resolve;
  const late = mounted(() => new Promise(done => {resolve = done;}));
  late.dispose(); resolve({resultReadiness: readiness("available")}); await settle(); assert.equal(late.states.length, 0);
});
test("summary read errors expose unavailable and stop automatic polling", async () => {
  const view = mounted(async () => {throw new Error("read unavailable");}); await settle();
  assert.equal(view.states[0].error, "read unavailable"); assert.equal(view.timers.length, 0); view.dispose();
});

test("same-user SDK token refresh cannot reset the six-read budget or its retry minimum", async () => {
  let calls = 0;
  const view = mounted(async () => {calls++; return {resultReadiness: readiness("processing")};});
  await settle(); view.refreshToken(); await settle(); assert.equal(calls, 1);
  while (view.timers.length) {view.timers.shift()(); await settle();}
  assert.equal(calls, 6);
  view.refreshToken(); await settle(); assert.equal(calls, 6);
  assert.equal(view.states.at(-1).exhausted, true); view.dispose();
});

test("history and solution readers retain ordinary foreground refresh without result polling", async () => {
  let calls = 0;
  const view = mounted(async () => {calls++; return {scope: {kind: "history"}, page: {items: []}};});
  await settle();
  for (let i = 0; i < 8; i++) {view.visibility("hidden"); view.visibility("visible"); await settle();}
  assert.equal(calls, 9); assert.equal(view.timers.length, 0); view.dispose();
});
