import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {discoverOwnedFiles, loadOwnership, selectSuites, validateManifest, validatePortalCommands, scopes} from '../scripts/frontend-test-ownership.mjs';
import {assertReceipt, executeNodeSuite, parseArguments, runSelection} from '../scripts/run-frontend-tests.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../scripts/frontend-test-manifest.json', import.meta.url), 'utf8'));
const {scripts} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('every scoped test has unique explicit ownership, execution kind and prerequisites; portal commands resolve from either cwd', async () => {
  const discovered = await discoverOwnedFiles(root);
  await loadOwnership(root);
  assert.deepEqual(manifest.suites.map(row => row.file).sort(), discovered);
  for (const scope of scopes) {
    const selected = selectSuites(manifest, scope);
    assert.ok(selected.length && selected.every(row => row.kind === 'node'));
    assert.ok(selected.some(row => row.proof.includes('behavior') || scope === 'infrastructure'));
  }
  const all = selectSuites(manifest, 'all');
  assert.equal(all.length, manifest.suites.filter(row => row.kind === 'node').length);
  assert.ok(manifest.suites.some(row => row.kind === 'browser-public'));
  assert.ok(manifest.suites.some(row => row.kind === 'historical-ui'));
  assert.ok(manifest.suites.some(row => row.kind === 'emulator-integration'));
  assert.ok(manifest.suites.find(row => row.file === 'tests/portal-response-adapters.test.mjs').prerequisites.includes('functions-build'));
});

test('ownership rejects new, deleted, duplicate and unclassified files, unknown kinds/scopes/prerequisites and missing workflows', async () => {
  const discovered = await discoverOwnedFiles(root);
  const check = value => validateManifest(value, discovered, scripts);
  for (const mutate of [m => m.suites.pop(), m => m.suites.push(m.suites[0]),
    m => m.suites[0].file = 'tests/unknown.test.mjs', m => m.suites[0].owners = [],
    m => m.suites[0].owners = ['unknown'], m => m.suites[0].owners.push(m.suites[0].owners[0]),
    m => m.suites[0].kind = 'unknown', m => m.suites[0].prerequisites = ['unknown'],
    m => m.suites[0].proof = ['browser'],
    m => m.suites.find(row => row.kind === 'browser-local').workflow.script = 'missing',
    m => m.suites = m.suites.filter(row => !row.owners.includes('student'))]) {
    const changed = structuredClone(manifest); mutate(changed); assert.throws(() => check(changed));
  }
  assert.throws(() => validateManifest(manifest, [...discovered, 'tests/new.test.mjs'], scripts));
  assert.throws(() => validateManifest(manifest, discovered.slice(1), scripts));
  const packages = Object.fromEntries(scopes.slice(0, 4).map(portal => [portal, {scripts: {test: `node ../../scripts/run-frontend-tests.mjs --scope ${portal}`}}]));
  validatePortalCommands(packages);
  for (const portal of scopes.slice(0, 4)) {
    const missing = structuredClone(packages); delete missing[portal].scripts.test;
    assert.throws(() => validatePortalCommands(missing));
    missing[portal].scripts.test = 'echo no tests'; assert.throws(() => validatePortalCommands(missing));
  }
  assert.throws(() => selectSuites(manifest, 'missing'));
  const empty = structuredClone(manifest); empty.suites = empty.suites.filter(row => row.kind !== 'node');
  assert.throws(() => selectSuites(empty, 'admin'));
  const missingPortal = await mkdtemp(join(tmpdir(), 'frontend-owner-missing-'));
  try {await assert.rejects(loadOwnership(missingPortal));} finally {await rm(missingPortal, {recursive: true, force: true});}
});

test('CLI rejects ambiguous arguments before running anything and explicit list excludes public, historical and integration files', () => {
  for (const args of [[], ['--scope'], ['--scope', 'admin', '--scope', 'vendor'], ['--scope', 'admin', '--skip'], ['--check', '--list']]) {
    assert.throws(() => parseArguments(args));
  }
  for (const args of [['--scope', 'unknown'], ['--scope', 'admin', '--scope', 'vendor']]) {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['scripts/run-frontend-tests.mjs', ...args], {cwd: root, env, encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout, /Running|PASS|Build Functions/u);
  }
  for (const scope of scopes.slice(0, 4)) {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['../../scripts/run-frontend-tests.mjs', '--scope', scope, '--list'], {
      cwd: join(root, 'apps', scope), env, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).map(row => row.file), selectSuites(manifest, scope).map(row => row.file));
  }
});

test('real child execution rejects failures, empty files, skipped and TODO tests and premature successful exits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-runner-probe-'));
  try {
    const tests = {
      'pass.mjs': "import test from 'node:test'; test('actual passing behavior', () => {});",
      'fail.mjs': "import test from 'node:test'; test('intentional failure', () => {throw Error('expected probe');});",
      'skip.mjs': "import test from 'node:test'; test.skip('intentional skip', () => {});",
      'todo.mjs': "import test from 'node:test'; test.todo('intentional TODO');",
      'empty.mjs': "console.log('not a test');",
      'exit.mjs': "process.exit(0);",
    };
    for (const [file, source] of Object.entries(tests)) await writeFile(join(directory, file), source);
    assertReceipt(await executeNodeSuite(directory, 'pass.mjs'));
    for (const file of ['fail.mjs', 'skip.mjs', 'todo.mjs', 'empty.mjs', 'exit.mjs']) await assert.rejects(executeNodeSuite(directory, file), file);
    await assert.rejects(executeNodeSuite(directory, 'missing.mjs'));
    const plan = file => ({file, kind: 'node', prerequisites: ['node']});
    await writeFile(join(directory, 'later.mjs'), "import {writeFileSync} from 'node:fs'; writeFileSync('later-ran', 'bad');");
    let prepared = false;
    await assert.rejects(runSelection([plan('fail.mjs'), plan('later.mjs')], async prerequisites => {
      assert.deepEqual(prerequisites, ['node']); prepared = true;
    }, file => executeNodeSuite(directory, file)));
    assert.ok(prepared);
    await assert.rejects(access(join(directory, 'later-ran')));
    let dispatched = false;
    await assert.rejects(runSelection([plan('pass.mjs')], async () => {throw Error('prerequisite failed');}, async () => {dispatched = true;}));
    assert.equal(dispatched, false);
    await assert.rejects(runSelection([], async () => {}, async () => {}));
    await assert.rejects(runSelection([plan('pass.mjs'), plan('pass.mjs')], async () => {}, async () => {}));
  } finally {await rm(directory, {recursive: true, force: true});}
});
