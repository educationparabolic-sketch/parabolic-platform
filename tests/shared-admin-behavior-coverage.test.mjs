import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {root, ts} from './helpers/vendor-action-inventory.mjs';
import {selectSuites} from '../scripts/frontend-test-ownership.mjs';

// Named critical obligations, not a percentage/code-coverage claim. Actual
// behavior runs in the owning suites; this gate prevents quietly dropping it.
const obligations = [
  ['shared', 'browser-authority-convergence', [
    'institute view-scope reads stay nullable and never guess authentication authority',
  ]],
  ['shared', 'api-client-behavior', [
    'client serializes exact paths, zero/false queries, methods, bodies and verified headers',
    'validated data becomes ready only after decoding and the production response adapter completes',
    'HTML, malformed JSON, legacy envelopes, empty 204 and adapter drift fail without retry or ready data',
    'canonical errors preserve request identity and typed details and classify permission versus validation',
    'GET retry honors server minimum, caps exponential delay and never changes the original query',
    'unsafe mutations do not retry transport or service failure; explicit retry retains exact intent',
    'network exhaustion is bounded and never records success or replaces failure with a fixture',
    'empty and locally handled failures retain explicit ownership through the real request lifecycle',
  ]],
  ['shared', 'frontend-data-state-behavior', [
    'a reset fences late success and failure from an earlier view without consuming current requests',
    'parallel completion cannot clear an authoritative failure and a fresh request can recover',
    'mixed empty and nonempty requests publish only after all settle, with subscription cleanup',
    'the mounted boundary hides non-ready children, distinguishes errors and retries by a full reload',
  ]],
  ['admin', 'admin-boundary-behavior', [
    'Admin overview fetch validates before normalization and preserves real zero counts and empty summary arrays',
    'Admin analytics fetch keeps authoritative empty/year summaries and rejects missing summaries or raw response leakage',
    'licensing adapters preserve null authority and zero prices and reject malformed nested snapshots and absent open requests',
    'licensing mutation needs matching receipt and authoritative request reload before success',
    'fixture mode cannot dispatch licensing reads or mutations as live authority',
    'settings mutation requires command, revision, immutable audit and reloaded profile agreement',
    'support reconciliation requires matching revision, status and a confirmed command message',
  ]],
  ['admin', 'admin-mounted-behavior', [
    'mounted support distinguishes pending, failed and verified empty reads and retries the real adapter',
    'mounted support ignores late success and rejection after a different ticket owns the conversation',
    'mounted licensing withholds success during reload, retains exact failed intent and confirms only the replayed reload',
    'mounted settings preserves edited intent across same-authority JWT refresh and reloads changed authority',
  ]],
  ['admin', 'admin-template-authority', [
    'create/reload reconciliation rejects a missing created ID',
    'update/reload reconciliation requires one exact version increment',
    'lifecycle/reload reconciliation requires unchanged version and target status',
  ]],
  ['admin', 'admin-assignment-authority', [
    'create/replay reconciliation returns only the persisted authority',
    'create/replay reconciliation rejects non-replay and field drift',
  ]],
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
test('shared and Admin critical behavioral obligations remain uniquely declared and selected by their owners', async () => {
  const manifest = JSON.parse(await readFile(`${root}/scripts/frontend-test-manifest.json`, 'utf8'));
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
