import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {loadBackendInventory} from '../scripts/backend-test-inventory.mjs';
import {backendEnvironment, assertBackendEmulators, executeBackendCommand, executeBackendSuite} from '../scripts/backend-test-process.mjs';
import {BACKEND_STAGES, BACKEND_CONTRACTS, runBackendTests} from '../scripts/run-backend-tests.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(join(root, path), 'utf8');
const temporary = () => mkdtemp(join(tmpdir(), 'backend-command-proof-'));
const yaml = createRequire(new URL('../functions/package.json', import.meta.url))('js-yaml');

function assertMandatoryBackendStep(source) {
  const backend = yaml.load(source).jobs['backend-ci'];
  assert.equal(backend.if, undefined); assert.equal(backend['continue-on-error'], undefined);
  const steps = backend.steps.filter(step => step.run === 'npm run test:backend');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].if, undefined); assert.equal(steps[0]['continue-on-error'], undefined);
}

test('the complete backend command is mandatory in CI and retains every owning stage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const workflow = await read('.github/workflows/frontend-ci-cd.yml');
  assert.equal(pkg.scripts['test:backend'], 'node scripts/run-backend-tests.mjs');
  assert.deepEqual(BACKEND_STAGES.map(s => s.id), ['lint', 'build', 'contracts', 'unit', 'emulators', 'failure-cleanup']);
  for (const stage of BACKEND_STAGES) assert.ok(stage.timeoutMs > 0 && stage.timeoutMs <= 60 * 60_000);
  assert.deepEqual(BACKEND_STAGES.find(s => s.id === 'unit').args, ['--prefix', 'functions', 'run', 'test:ci:non-emulator']);
  assert.deepEqual(BACKEND_STAGES.find(s => s.id === 'emulators').args, ['run', 'test:emulators:ci']);
  assert.deepEqual(BACKEND_STAGES.find(s => s.id === 'failure-cleanup').args, ['run', 'test:emulators:failure-cleanup']);
  assert.ok(BACKEND_CONTRACTS.includes('tests/backend-full-command.test.mjs'));
  assert.match(workflow, /- name: Run complete backend verification\n        run: npm run test:backend/u);
  assert.match(workflow, /name: Retain complete backend receipts and logs\n        if: always\(\)/u);
  assert.match(workflow, /path: test-results\/backend\//u);
  assert.match(workflow, /needs: \[frontend-ci, backend-ci\]/u);
  assertMandatoryBackendStep(workflow);
  for (const replacement of [
    'run: echo omitted',
    'run: npm run test:backend\n        if: false',
    'run: npm run test:backend\n        continue-on-error: true',
    'run: npm run test:backend -- --skip-unit',
  ]) assert.throws(() => assertMandatoryBackendStep(workflow.replace('run: npm run test:backend', replacement)));
});

test('all 188 Functions files have exactly one execution owner and inventory drift fails closed', async () => {
  const inventory = await loadBackendInventory(root);
  assert.equal(inventory.suites.length, 188);
  assert.equal(new Set(inventory.suites.map(r => r.file)).size, 188);
  assert.deepEqual(['unit', 'sdk-emulator', 'http-emulator'].map(k => inventory.suites.filter(r => r.kind === k).length), [69, 99, 20]);
  const directory = await temporary();
  try {
    for (const row of inventory.suites) {
      const path = join(directory, row.file); await mkdir(resolve(path, '..'), {recursive: true});
      await writeFile(path, row.kind === 'sdk-emulator' ? '// FIRESTORE_EMULATOR_HOST\n' : '// source inventory fixture\n');
    }
    assert.equal((await loadBackendInventory(directory)).suites.length, 188);
    const unit = inventory.suites.find(r => r.kind === 'unit');
    await writeFile(join(directory, 'functions/src/tests/unowned.test.ts'), '// unreviewed unit\n');
    await assert.rejects(loadBackendInventory(directory), /Source unit inventory changed/u);
    await rm(join(directory, 'functions/src/tests/unowned.test.ts'));
    await mkdir(join(directory, 'functions/src/tests/nested'));
    await writeFile(join(directory, 'functions/src/tests/nested/unowned.test.ts'), '// nested unreviewed unit\n');
    await assert.rejects(loadBackendInventory(directory), /Source unit inventory changed/u);
    await rm(join(directory, 'functions/src/tests/nested'), {recursive: true});
    await rm(join(directory, unit.file));
    await assert.rejects(loadBackendInventory(directory), /inventory changed/u);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('demo environment and destructive reset guards reject ambient credentials, remote hosts and wrong projects', () => {
  const input = {GCLOUD_PROJECT: 'remote-project', FIREBASE_AUTH_EMULATOR_HOST: 'remote.invalid:9099',
    FIREBASE_EMULATOR_HUB: 'remote.invalid:4400', GOOGLE_APPLICATION_CREDENTIALS: '/private/key.json',
    FIREBASE_TOKEN: 'private-token', VITE_FIREBASE_PROJECT_ID: 'remote-project', NODE_TEST_CONTEXT: 'child-v8'};
  const environment = backendEnvironment(input);
  for (const key of ['GCLOUD_PROJECT', 'PROJECT_ID', 'GOOGLE_CLOUD_PROJECT']) assert.equal(environment[key], 'demo-parabolic-test');
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'VITE_FIREBASE_PROJECT_ID', 'NODE_TEST_CONTEXT']) assert.equal(environment[key], undefined);
  assert.equal(input.GCLOUD_PROJECT, 'remote-project');
  const valid = {...environment, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', FIREBASE_EMULATOR_HUB: '127.0.0.1:4400', FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001'};
  assert.doesNotThrow(() => assertBackendEmulators(valid, true));
  for (const key of ['PROJECT_ID', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'FUNCTIONS_EMULATOR_HOST']) {
    assert.throws(() => assertBackendEmulators({...valid, [key]: 'remote.invalid'}, true));
  }
});

test('actual per-file completion rejects empty, skipped, TODO and early-zero-exit children', async () => {
  const directory = await temporary();
  try {
    const fixtures = {valid: 'import test from "node:test";test("actual case",()=>{});',
      empty: 'import "node:test";', skipped: 'import test from "node:test";test.skip("skipped",()=>{});',
      todo: 'import test from "node:test";test.todo("todo",()=>{});', early: 'process.exit(0);'};
    for (const [name, source] of Object.entries(fixtures)) {
      await writeFile(join(directory, `${name}.mjs`), source);
      const operation = executeBackendSuite(directory, `${name}.mjs`, backendEnvironment(), {timeoutMs: 5000});
      if (name === 'valid') assert.equal((await operation).passed, 1);
      else await assert.rejects(operation);
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('real child failures propagate and timeout kills an uncooperative process group', async () => {
  const directory = await temporary();
  try {
    const failure = await executeBackendCommand({root: directory, command: process.execPath,
      args: ['-e', 'console.log("retained failure");process.exit(7)'], log: join(directory, 'failure.log')});
    assert.equal(failure.code, 7); assert.match(await readFile(join(directory, 'failure.log'), 'utf8'), /retained failure/u);
    const marker = join(directory, 'grandchild-survived');
    const grandchild = `process.on('SIGINT',()=>{});setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),1800);`;
    const parent = `process.on('SIGINT',()=>{});require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
    const timed = await executeBackendCommand({root: directory, command: process.execPath, args: ['-e', parent],
      timeoutMs: 600, graceMs: 100, log: join(directory, 'timeout.log')});
    assert.equal(timed.timedOut, true);
    await new Promise(done => setTimeout(done, 1900));
    await assert.rejects(access(marker));
    const controller = new AbortController();
    const operation = executeBackendCommand({root: directory, command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'], signal: controller.signal, timeoutMs: 3000, graceMs: 100});
    setTimeout(() => controller.abort(), 200);
    assert.equal((await operation).aborted, true);
  } finally {await rm(directory, {recursive: true, force: true});}
});

async function fixture() {
  const directory = await temporary();
  await mkdir(join(directory, 'functions'), {recursive: true});
  await writeFile(join(directory, 'package.json'), await read('package.json'));
  await writeFile(join(directory, 'functions/package.json'), await read('functions/package.json'));
  await mkdir(join(directory, 'apps/admin/dist'), {recursive: true});
  await writeFile(join(directory, 'apps/admin/dist/original'), 'original');
  return directory;
}
for (const failure of [false, true]) test(`controlled ${failure ? 'failure' : 'success'} proves fixed dispatch, receipts and original/absent artifact restoration`, async () => {
  const directory = await fixture(), dispatched = [];
  try {
    const operation = runBackendTests(directory, {inventory: async () => ({suites: []}), snapshot: () => ({fixture: 'stable'}),
      listeners: async () => {}, execute: async ({id, env}) => {
        dispatched.push(id); assert.equal(env.GCLOUD_PROJECT, 'demo-parabolic-test');
        await writeFile(join(directory, 'apps/admin/dist/original'), 'temporary');
        await mkdir(join(directory, '.firebase/hosting/portal'), {recursive: true});
        await writeFile(join(directory, '.firebase/hosting/portal/index.html'), 'temporary');
        return {code: failure ? 7 : 0, signal: null};
      }});
    if (failure) await assert.rejects(operation, /lint exited 7/u); else await operation;
    assert.deepEqual(dispatched, failure ? ['lint'] : BACKEND_STAGES.map(s => s.id));
    assert.equal(await readFile(join(directory, 'apps/admin/dist/original'), 'utf8'), 'original');
    await assert.rejects(access(join(directory, '.firebase/hosting/portal')));
    const receipt = JSON.parse(await readFile(join(directory, 'test-results/backend/run/receipt.json')));
    assert.equal(receipt.result, failure ? 'FAIL' : 'PASS'); assert.equal(receipt.restored, true);
    assert.equal(receipt.executionKind, 'controlled-orchestration');
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('source drift and an occupied run lock fail before further backend dispatch', async () => {
  const directory = await fixture(); let changed = false;
  try {
    await assert.rejects(runBackendTests(directory, {inventory: async () => ({suites: []}),
      snapshot: () => ({fixture: changed ? 'changed' : 'original'}), listeners: async () => {},
      execute: async () => {changed = true; return {code: 0, signal: null};}}), /source changed/u);
    const receipt = JSON.parse(await readFile(join(directory, 'test-results/backend/run/receipt.json')));
    assert.equal(receipt.result, 'FAIL'); assert.equal(receipt.restored, true); assert.equal(receipt.stages.length, 1);
    await mkdir(join(directory, 'test-results/backend/lock'));
    await assert.rejects(runBackendTests(directory), /EEXIST/u);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('setup failures and unverified exit 23 cannot masquerade as deliberate cleanup proof', async () => {
  const directory = await temporary();
  try {
    const firebase = join(directory, 'firebase');
    for (const code of [0, 1, 23]) {
      await writeFile(firebase, `#!/usr/bin/env node\nif(process.argv.includes('--version'))console.log('15.9.0');else process.exit(${code});\n`, {mode: 0o755});
      const result = await executeBackendCommand({root, command: process.execPath,
        args: ['scripts/run-emulator-integration-suite.mjs', '--failure-cleanup-probe'],
        env: {...backendEnvironment(), PATH: `${directory}:${process.env.PATH}`},
        log: join(directory, `setup-${code}.log`), timeoutMs: 15_000});
      assert.notEqual(result.code, 0);
      assert.match(await readFile(join(directory, `setup-${code}.log`), 'utf8'), code === 23 ? /ENOENT/u : /Only the verified deliberate exit 23/u);
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});
