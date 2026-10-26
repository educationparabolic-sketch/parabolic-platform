import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {root, ts} from './helpers/vendor-action-inventory.mjs';
import {selectSuites} from '../scripts/frontend-test-ownership.mjs';

// Named critical obligations, not a percentage/code-coverage claim. Actual
// behavior runs in the owning suites; this gate prevents quietly dropping it.
const obligations = [
  [
    "student",
    "student-boundary-behavior",
    [
      "summary API validates entitlement before suppressing unconfirmed reflective metrics and retains basic zero scores",
      "summary route-resource mismatches reject before dispatch and history keeps exact year and cursor authority",
      "solution reads bind selected test and run and retain signed bytes, null answers and opaque cursors",
      "locked solution states and empty pages stay explicit while denials and entitlement leakage never become fixtures",
      "summary-only policy rejects nested normalized raw-session aliases without rejecting nullable summary values",
      "profile preferences require exact versioned applied or replayed receipts and preserve command bytes",
      "photo enrollment and withdrawal receipts bind the prior pointer and never assert physical deletion",
      "profile reads validate ownership-shaped data and private media/lifecycle pointers with no implicit retry",
      "legacy storage purging removes only retired Student keys without reading images or accepting hostile storage"
    ]
  ],
  [
    "student",
    "student-mounted-behavior",
    [
      "mounted summary renders pending, failure and explicit retry without showing stale results",
      "mounted polling preserves token-refresh budget and minimum wait while manual refresh starts a visible fresh cycle",
      "mounted account changes fence old success and rejection and unauthenticated state hides settled content",
      "hidden mounted readers defer dispatch and available results stop pending polls and clear listeners"
    ]
  ],
  [
    "student",
    "student-profile-provider-behavior",
    [
      "profile provider rejects wrong-owner reads and aborts stale requests when restriction hides the profile",
      "uncertain profile commands suppress duplicates and replay the identical intent before authoritative reload",
      "rejected profile commands clear pending intent and failed authoritative reload cannot restore prior media",
      "restricted privacy withdrawal retains only known pointer and distinguishes revoked access from confirmed deletion"
    ]
  ],
  [
    "student",
    "student-result-recovery",
    [
      "processing and unknown retain permitted basic scores while suppressing stale reflective data",
      "visible polling stops at six reads and never invents analytics failure",
      "hidden documents stop dispatch; available markers stop timers; disposed reads cannot return old scope",
      "summary read errors expose unavailable and stop automatic polling",
      "same-user SDK token refresh cannot reset the six-read budget or its retry minimum",
      "history and solution readers retain ordinary foreground refresh without result polling"
    ]
  ],
  [
    "student",
    "student-summary-v2-adapters",
    [
      "v2 adapters retain real zero, recursive nulls and empty lists across the layer/feature matrix",
      "malformed, legacy, hidden fields, contradictory grants and missing nullable keys fail visibly",
      "closed history and cursor pages preserve authoritative scope, including an empty advancing page",
      "released solutions preserve signed URL bytes and nullable assets/answers without CDN reconstruction"
    ]
  ]
];

function titles(source) {
  const ast = ts.createSourceFile('proof.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), found = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'test' && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); return found;
}
function requireTitles(source, required) {
  const found = titles(source);
  for (const title of required) assert.equal(found.filter(value => value === title).length, 1, `Missing/duplicate executable obligation: ${title}`);
}
test('Student critical behavioral obligations remain uniquely declared and selected by their owners', async () => {
  const manifest = JSON.parse(await readFile(`${root}/scripts/frontend-test-manifest.json`, 'utf8'));
  assert.ok(manifest.suites.find(row => row.file === 'tests/student-summary-v2-adapters.test.mjs')
    .prerequisites.includes('functions-build'), 'Compiled summary-adapter dependency must be built on a clean checkout');
  for (const [owner, suite, required] of obligations) {
    const file = `tests/${suite}.test.mjs`;
    assert.ok(selectSuites(manifest, owner).some(row => row.file === file && row.proof.includes('behavior')), file);
    requireTitles(await readFile(`${root}/${file}`, 'utf8'), required);
  }
});
test('removed, duplicated, skipped, TODO, focused and lookalike string declarations cannot satisfy critical proof ownership', () => {
  for (const source of ['', 'test.skip("proof", () => {});', 'test.todo("proof");', 'test.only("proof", () => {});',
    'const text = "proof";', 'test("proof", () => {}); test("proof", () => {});']) assert.throws(() => requireTitles(source, ['proof']));
  requireTitles('test("proof", () => {});', ['proof']);
});
