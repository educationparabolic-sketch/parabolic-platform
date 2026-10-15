import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {root, ts} from "./helpers/vendor-action-inventory.mjs";
import {groups, suites, obligations} from "./helpers/vendor-regression-coverage.mjs";
const read = path => readFile(`${root}/${path}`, "utf8");
const source = await read("apps/vendor/src/portals/vendorActionLedger.ts"), module = {exports: {}};
new Function("exports", ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(module.exports);
const ledger = module.exports;
function coverage(actions, partitions, scheduled) {
  const ids = partitions.flatMap(group => group.actions);
  assert.equal(new Set(ids).size, ids.length, "duplicate coverage assignment");
  assert.deepEqual([...ids].sort(), actions.map(action => action.id).sort(), "missing or unknown action proof");
  for (const group of partitions) {
    assert.ok(group.suites.length);
    for (const suite of group.suites) assert.ok(scheduled.includes(suite), `unscheduled proof: ${suite}`);
  }
}
function testTitles(source) {
  const ast = ts.createSourceFile("proof.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), titles = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "test") {
      // The first argument may be a conditional title in a parameterized test.
      function literals(n) { if (ts.isStringLiteral(n)) titles.add(n.text); else ts.forEachChild(n, literals); }
      if (node.arguments[0]) literals(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); return titles;
}
test("every Vendor action has a scheduled regression partition with no missing or duplicate family", async () => {
  coverage(ledger.VENDOR_ACTION_LEDGER, groups, suites);
  const command = JSON.parse(await read("package.json")).scripts["test:vendor-acceptance-regressions"];
  assert.ok(command.startsWith("node --test --test-concurrency=2 "));
  assert.deepEqual(command.split(" ").slice(3).sort(), [...suites, "vendor-acceptance-coverage"].map(s => `tests/${s}.test.mjs`).sort());
  assert.equal(ledger.VENDOR_ACTION_LEDGER.length, 55);
  for (const [suite, required] of Object.entries(obligations)) {
    assert.ok(suites.includes(suite)); const titles = testTitles(await read(`tests/${suite}.test.mjs`));
    for (const title of required) assert.ok(titles.has(title), `missing permanent regression: ${suite}: ${title}`);
  }
});
test("coverage gate rejects unclassified actions, deleted assignments and omitted critical proofs", () => {
  assert.throws(() => coverage([...ledger.VENDOR_ACTION_LEDGER, {id: "new.unreviewed"}], groups, suites));
  assert.throws(() => coverage(ledger.VENDOR_ACTION_LEDGER, groups.slice(1), suites));
  assert.throws(() => coverage(ledger.VENDOR_ACTION_LEDGER, [...groups, groups[0]], suites));
  assert.throws(() => coverage(ledger.VENDOR_ACTION_LEDGER, groups, suites.filter(s => s !== "vendor-command-recovery")));
  assert.ok(!testTitles('test.skip("removed", () => {});').has("removed"));
});

test("mounted workspace keys invalidate authority on token, path and query changes", async () => {
  const source = await read("apps/vendor/src/App.tsx"), ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Map();
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && ["Outlet", "VendorCommandRecoveryPanel"].includes(node.tagName.getText(ast))) {
      const attribute = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "key");
      assert.ok(attribute && ts.isJsxExpression(attribute.initializer));
      keys.set(node.tagName.getText(ast), attribute.initializer.expression.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(keys.size, 2);
  const scope = {exports: {}};
  new Function("exports", ts.transpileModule(await read("apps/vendor/src/features/shared/vendorWorkspaceScope.ts"), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(scope.exports);
  const expression = new Function("session", "location", "vendorWorkspaceSearchScope", `return (${keys.get("Outlet")});`);
  const key = (session, location) => expression(session, location, scope.exports.vendorWorkspaceSearchScope);
  const session = {status: "authenticated", idToken: "token_a"}, location = {pathname: "/vendor/calibration", search: ""};
  const initial = key(session, location);
  for (const [nextSession, nextLocation] of [[{...session, idToken: "token_b"}, location],
    [{status: "unauthenticated", idToken: null}, location], [session, {...location, pathname: "/vendor/intelligence"}],
    [session, {...location, search: "?institute=tenant_b"}]]) assert.notEqual(key(nextSession, nextLocation), initial);
  const audit = {...location, pathname: "/vendor/audit", search: "?limit=2"};
  assert.equal(key(session, audit), key(session, {...audit, search: "?limit=2&cursor=next_page"}));
  assert.notEqual(key(session, audit), key(session, {...audit, search: "?limit=2&instituteId=tenant_b&cursor=next_page"}));
  assert.notEqual(key(session, audit), key({...session, idToken: "token_b"}, audit));
  assert.notEqual(key(session, {...location, pathname: "/vendor/calibration", search: "?cursor=a"}), key(session, {...location, pathname: "/vendor/calibration", search: "?cursor=b"}));
  const recoveryKey = new Function("session", `return (${keys.get("VendorCommandRecoveryPanel")});`);
  assert.notEqual(recoveryKey(session), recoveryKey({...session, idToken: "token_b"}));
});
