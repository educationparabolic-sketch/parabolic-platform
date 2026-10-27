import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createConnection} from 'node:net';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadBackendInventory} from './backend-test-inventory.mjs';
import {backendEnvironment, executeBackendCommand, assertBackendResult} from './backend-test-process.mjs';
import {ARTIFACT_ROOTS, artifactHashes, withRestoredArtifacts} from './run-security-matrix.mjs';
import {sourceHashes} from './run-frontend-acceptance.mjs';

export const BACKEND_CONTRACTS = [
  'tests/backend-full-command.test.mjs', 'tests/backend-ci-validation.test.mjs',
  'tests/backend-ci-trigger-coverage.test.mjs', 'tests/backend-ci-emulator-harness.test.mjs',
  'tests/backend-ci-emulator-aggregate.test.mjs', 'tests/vendor-intelligence-rollup-contract.test.mjs',
  'tests/staging-deployment-pipeline.test.mjs', 'tests/staging-smoke.test.mjs',
  'tests/production-promotion-separation.test.mjs', 'tests/frontend-ci-acceptance.test.mjs',
  'tests/ci-environment-injection.test.mjs',
];
export const BACKEND_STAGES = [
  {id: 'lint', command: 'npm', args: ['--prefix', 'functions', 'run', 'lint'], timeoutMs: 10 * 60_000},
  {id: 'build', command: 'npm', args: ['--prefix', 'functions', 'run', 'build'], timeoutMs: 10 * 60_000},
  {id: 'contracts', command: process.execPath, args: ['--test', '--test-concurrency=1', ...BACKEND_CONTRACTS], timeoutMs: 10 * 60_000},
  {id: 'unit', command: 'npm', args: ['--prefix', 'functions', 'run', 'test:ci:non-emulator'], timeoutMs: 15 * 60_000},
  {id: 'emulators', command: 'npm', args: ['run', 'test:emulators:ci'], timeoutMs: 60 * 60_000},
  {id: 'failure-cleanup', command: 'npm', args: ['run', 'test:emulators:failure-cleanup'], timeoutMs: 5 * 60_000},
];
const ports = [4400, 4500, 5000, 5001, 8080, 9099, 9150, 9199, 9299, 9499];
export async function backendListenersReleased() {
  const open = await Promise.all(ports.map(port => new Promise(done => {
    const socket = createConnection({host: '127.0.0.1', port}); socket.setTimeout(300);
    const finish = value => {socket.destroy(); done(value);};
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false));
  })));
  assert.deepEqual(ports.filter((_, index) => open[index]), [], 'Backend emulator listeners are occupied');
}

export async function validateBackendScripts(root) {
  const scripts = JSON.parse(await readFile(join(root, 'package.json'))).scripts;
  const functions = JSON.parse(await readFile(join(root, 'functions/package.json'))).scripts;
  assert.equal(scripts['test:backend'], 'node scripts/run-backend-tests.mjs');
  assert.equal(scripts['test:emulators:ci'], 'node scripts/run-emulator-integration-suite.mjs');
  assert.equal(scripts['test:emulators:failure-cleanup'], 'node scripts/run-emulator-integration-suite.mjs --failure-cleanup-probe');
  assert.equal(functions['test:ci:non-emulator'], 'node scripts/run-non-emulator-tests.mjs');
}

export async function runBackendTests(root, {execute = executeBackendCommand,
  inventory = loadBackendInventory, snapshot = sourceHashes, listeners = backendListenersReleased} = {}) {
  assert.notEqual(process.platform, 'win32', 'Use WSL/Linux for bounded Firebase process groups');
  const parent = join(root, 'test-results/backend'), out = join(parent, 'run'), lock = join(parent, 'lock');
  await mkdir(parent, {recursive: true});
  await mkdir(lock); // Fail promptly rather than running two destructive demo lifecycles together.
  const controller = new AbortController(), interrupt = () => controller.abort();
  const receipt = {result: 'RUNNING', project: 'demo-parabolic-test',
    executionKind: execute === executeBackendCommand ? 'real' : 'controlled-orchestration',
    publicQualified: false, restored: false, sourceUnchanged: false, startedAt: new Date().toISOString(), stages: []};
  let initial, before;
  const save = () => writeFile(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
  try {
    await writeFile(join(lock, 'owner.json'), JSON.stringify({pid: process.pid, startedAt: receipt.startedAt}));
    if (existsSync(out)) await rename(out, `${out}-previous-${Date.now()}-${process.pid}`);
    await mkdir(out, {recursive: true}); await save();
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    await validateBackendScripts(root);
    const selected = await inventory(root);
    await writeFile(join(out, 'inventory.json'), JSON.stringify(selected, null, 2));
    before = snapshot(root); initial = await artifactHashes(root);
    await writeFile(join(out, 'source-candidate.json'), JSON.stringify(before, null, 2));
    await writeFile(join(out, 'initial-artifacts.json'), JSON.stringify(initial, null, 2));
    await listeners();
    await withRestoredArtifacts(root, async () => {
      for (const stage of BACKEND_STAGES) {
        assert.equal(controller.signal.aborted, false, 'Backend run interrupted');
        assert.deepEqual(snapshot(root), before, 'Backend source changed during verification');
        const directory = join(out, stage.id); await mkdir(directory, {recursive: true});
        const entry = {id: stage.id, command: [stage.command, ...stage.args], result: 'RUNNING', startedAt: new Date().toISOString()};
        receipt.stages.push(entry); await save(); console.log(`[backend] START ${stage.id}`);
        const result = await execute({root, ...stage,
          env: {...backendEnvironment(), BACKEND_TEST_STAGE_DIRECTORY: directory},
          log: join(directory, 'output.log'), signal: controller.signal});
        Object.assign(entry, {exitCode: result.code, signal: result.signal,
          timedOut: Boolean(result.timedOut), aborted: Boolean(result.aborted), descendants: Boolean(result.descendants), completedAt: new Date().toISOString(),
          result: result.code === 0 && !result.timedOut && !result.aborted && !result.descendants ? 'PASS' : 'FAIL'});
        await save(); assertBackendResult(result, stage.id);
        assert.deepEqual(snapshot(root), before, 'Backend source changed during verification');
        if (['emulators', 'failure-cleanup'].includes(stage.id)) {await listeners(); entry.listenersReleased = true;}
        await save(); console.log(`[backend] PASS ${stage.id}`);
      }
    }, ARTIFACT_ROOTS);
    receipt.restored = true; assert.equal(controller.signal.aborted, false, "Backend run interrupted");
    assert.deepEqual(snapshot(root), before);
    receipt.sourceUnchanged = true; receipt.result = 'PASS';
  } catch (error) {
    receipt.result = 'FAIL'; receipt.failure = error.message;
    if (initial) receipt.restored = JSON.stringify(await artifactHashes(root)) === JSON.stringify(initial);
    if (before) receipt.sourceUnchanged = JSON.stringify(snapshot(root)) === JSON.stringify(before);
    throw error;
  } finally {
    receipt.completedAt = new Date().toISOString();
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    try {if (existsSync(out)) await save();} finally {await rm(lock, {recursive: true, force: true});}
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'The full backend command cannot omit stages');
  await runBackendTests(resolve(import.meta.dirname, '..'));
  console.log('[backend] PASS; unit/emulator owners complete, source unchanged, artifacts restored; local qualification only.');
}
