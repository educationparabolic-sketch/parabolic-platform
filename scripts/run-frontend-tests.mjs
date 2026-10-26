import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadOwnership, selectSuites} from './frontend-test-ownership.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const reporter = fileURLToPath(new URL('./frontend-test-reporter.mjs', import.meta.url));
export function parseArguments(args) {
  assert.ok(args.length === 1 || args.length === 2 || args.length === 3, 'Expected --check or --scope <name> [--list]');
  if (args.length === 1 && args[0] === '--check') return {check: true};
  assert.equal(args[0], '--scope', 'Expected explicit --scope');
  assert.ok(args[1] && (args.length === 2 || args[2] === '--list'), 'Unknown, missing or duplicate runner argument');
  return {scope: args[1], list: args.length === 3};
}

export function assertReceipt(receipt) {
  assert.equal(receipt.completed, true, 'Test did not complete');
  for (const field of ['passed', 'failed', 'skipped', 'todo']) assert.ok(Number.isSafeInteger(receipt[field]) && receipt[field] >= 0, 'Invalid test receipt');
  assert.ok(receipt.passed > 0, 'Test file executed no passing tests');
  for (const field of ['failed', 'skipped', 'todo']) assert.equal(receipt[field], 0, `Test reported ${field}`);
}

export async function executeNodeSuite(directory, file) {
  const temporary = await mkdtemp(join(tmpdir(), 'parabolic-frontend-test-'));
  const receiptPath = join(temporary, 'receipt.json');
  const environment = {...process.env, CI: 'true', NODE_ENV: 'test', PROJECT_ID: 'demo-parabolic-test',
    GCLOUD_PROJECT: 'demo-parabolic-test', GOOGLE_CLOUD_PROJECT: 'demo-parabolic-test',
    NO_GCE_CHECK: 'true', METADATA_SERVER_DETECTION: 'none', FRONTEND_TEST_RECEIPT: receiptPath};
  delete environment.NODE_TEST_CONTEXT;
  // Node-only suites must not accidentally inherit a live emulator namespace.
  for (const key of Object.keys(environment)) if (/EMULATOR_(?:HOST|HUB)$/u.test(key)) delete environment[key];
  try {
    const result = spawnSync(process.execPath, [`--test-reporter=${reporter}`, file], {
      cwd: directory, env: environment, stdio: 'inherit', timeout: 300_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${file} failed (signal ${result.signal ?? 'none'})`);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    assertReceipt(receipt);
    return receipt;
  } finally {await rm(temporary, {recursive: true, force: true});}
}

export async function runSelection(selected, prepare, execute) {
  assert.ok(selected.length > 0, 'Empty frontend selection');
  assert.equal(new Set(selected.map(suite => suite.file)).size, selected.length, 'Duplicate frontend selection');
  assert.ok(selected.every(suite => suite.kind === 'node'), 'Frontend command executes Node suites only');
  await prepare([...new Set(selected.flatMap(suite => suite.prerequisites))]);
  const results = [];
  for (const suite of selected) results.push(await execute(suite.file));
  return results;
}

async function prepare(prerequisites) {
  const checks = {
    'functions-deps': 'functions/node_modules/typescript/package.json',
    'root-deps': 'node_modules/playwright/package.json',
    'shared-deps': 'shared/node_modules/firebase/package.json',
    ...Object.fromEntries(['admin', 'student', 'exam', 'vendor'].map(portal => [`${portal}-deps`, `apps/${portal}/node_modules/vite/package.json`])),
  };
  for (const key of prerequisites) if (checks[key]) {
    try {await access(resolve(root, checks[key]));}
    catch {throw new Error(`Missing ${key}; follow docs/FRONTEND_TESTS.md clean-checkout setup.`);}
  }
  function run(command, args) {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', env});
    assert.ifError(result.error); assert.equal(result.status, 0, `Prerequisite failed: ${args.join(' ')}`);
  }
  if (prerequisites.includes('functions-build')) run('npm', ['--prefix', 'functions', 'run', 'build']);
  if (prerequisites.includes('bwm004-package')) run(process.execPath, ['scripts/prepare-bwm-004-staging-verification.mjs']);
}

export async function main(args) {
  const options = parseArguments(args);
  const manifest = await loadOwnership(root);
  if (options.check) {console.log(`[frontend-tests] Ownership PASS: ${manifest.suites.length} files`); return;}
  const selected = selectSuites(manifest, options.scope);
  if (options.list) {console.log(JSON.stringify(selected, null, 2)); return;}
  console.log(`[frontend-tests] ${options.scope}: ${selected.length} Node suites; shared and infrastructure have separate commands`);
  const receipts = await runSelection(selected, prepare, file => executeNodeSuite(root, file));
  console.log(`[frontend-tests] PASS ${selected.length} files; ${receipts.reduce((sum, receipt) => sum + receipt.passed, 0)} passing test events; zero skips/TODOs`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {console.error(error); process.exitCode = 1;});
}
