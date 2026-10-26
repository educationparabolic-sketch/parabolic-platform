import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {root, ts} from './helpers/vendor-action-inventory.mjs';
import {groups, suites} from './helpers/vendor-regression-coverage.mjs';
import {loadProduction} from './helpers/frontend-production-modules.mjs';
import {selectSuites} from '../scripts/frontend-test-ownership.mjs';

// Named critical obligations, not a percentage/code-coverage claim. Actual
// behavior runs in the owning suites; this gate prevents quietly dropping it.
const obligations = [
  [
    "vendor",
    "vendor-boundary-behavior",
    [
      "Vendor institute and commercial reads execute canonical HTTP adapters and preserve exact cursors, zero and null authority",
      "real Vendor recovery blocks storage-failed dispatch and retains old-owner uncertain intent after a late account change",
      "actual institute command retains exact HTTP intent after committed receipt and failed reload until explicit recovery succeeds",
      "actual commercial provider retry keeps the original event intent separate from unrelated work and honors reviewed recovery",
      "canonical validation denial clears first-attempt Vendor recovery while malformed success retains uncertain intent",
      "all five intelligence HTTP adapters retain explicit empty and unsupported data and reject private or contradictory payloads",
      "audit HTTP validates query before dispatch and preserves sparse advancement while rejecting filter and cursor drift",
      "health HTTP retains zero queues and unavailable sources without fabricating operational posture",
      "calibration HTTP preserves version authority and rejects malformed pages, selected versions and unsafe simulation before dispatch"
    ]
  ],
  [
    "vendor",
    "vendor-mounted-behavior",
    [
      "mounted intelligence cannot publish a partial five-source snapshot and explicit retry requires a fresh consistent selection",
      "mounted intelligence hides superseded query results immediately and rejects mismatched snapshot metadata without fixtures",
      "mounted health fences old UID and token reads, sanitizes failure and retries only current server authority",
      "mounted recovery review retains incomplete provider work and reloads only after exact captured retry is resolved"
    ]
  ],
  [
    "vendor",
    "vendor-command-recovery",
    [
      "uncertain completion freezes complete tenant-qualified intent and survives reload without automatic replay",
      "synchronous exclusion spans both dispatch and post-commit reload"
    ]
  ],
  [
    "vendor",
    "vendor-authority-regressions",
    [
      "directory distinguishes loading, verified empty and failure; superseded filters cannot restore old rows",
      "detail aborts superseded targets and ignores late success, late rejection and unmounted completions"
    ]
  ],
  [
    "vendor",
    "vendor-calibration-operation-transport",
    [
      "command/read dispatch derives scope and validates exact receipt and pending uncertainty",
      "exact operation intent rejects legacy/defaulted/extra/query/body/path shapes before service calls"
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
test('Vendor critical behavioral obligations remain uniquely declared and selected by their owners', async () => {
  const manifest = JSON.parse(await readFile(`${root}/scripts/frontend-test-manifest.json`, 'utf8'));
  const selected = [...selectSuites(manifest, 'vendor'), ...selectSuites(manifest, 'shared')];
  assert.equal(loadProduction('apps/vendor/src/portals/vendorActionLedger.ts').VENDOR_ACTION_LEDGER.length, 55);
  assert.equal(groups.length, 8); assert.equal(suites.length, 14);
  for (const suite of suites) assert.ok(selected.some(row => row.file === `tests/${suite}.test.mjs`), `Missing legacy Vendor regression owner: ${suite}`);
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
