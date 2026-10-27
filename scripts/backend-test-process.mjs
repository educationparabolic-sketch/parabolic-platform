import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync, closeSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEMO_PROJECT = 'demo-parabolic-test';
const reporter = fileURLToPath(new URL('./frontend-test-reporter.mjs', import.meta.url));

export function assertBackendEmulators(environment, fullServices = false) {
  for (const key of ['PROJECT_ID', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) assert.equal(environment[key], DEMO_PROJECT);
  for (const [key, host] of Object.entries({FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    FIREBASE_EMULATOR_HUB: '127.0.0.1:4400'})) assert.equal(environment[key], host, `Unsafe emulator host: ${key}`);
  if (fullServices) assert.equal(environment.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5001');
}

export function backendEnvironment(input = process.env) {
  const environment = {...input};
  for (const key of Object.keys(environment)) {
    if (/^(VITE_|PARABOLIC_|APP_CHECK_|FIREBASE_|GCLOUD_|GOOGLE_CLOUD_|PROJECT_ID$|CDN_|APP_BASE_URL$|EXAM_BASE_URL$|VENDOR_BASE_URL$|QUESTION_ASSETS_BUCKET$|REPORTS_BUCKET$|IDENTITY_PHOTOS_BUCKET$|VENDOR_AUDIT_CURSOR_KEY$|STRIPE_|AI_API_KEY|EMAIL_PROVIDER_KEY|RELEASE_)/u.test(key) || /EMULATOR_(HOST|HUB)$/u.test(key)) delete environment[key];
  }
  delete environment.GOOGLE_APPLICATION_CREDENTIALS;
  delete environment.NODE_TEST_CONTEXT;
  return {...environment, CI: 'true', DEBUG: '', NODE_ENV: 'test',
    PROJECT_ID: DEMO_PROJECT, GCLOUD_PROJECT: DEMO_PROJECT, GOOGLE_CLOUD_PROJECT: DEMO_PROJECT,
    APP_CHECK_MODE: 'pending_provisioning', APP_CHECK_ALLOWED_APP_IDS: '1:123:web:approved',
    NO_GCE_CHECK: 'true', METADATA_SERVER_DETECTION: 'none'};
}

function groupSignal(pid, signal) {
  try {process.kill(process.platform === 'win32' ? pid : -pid, signal); return true;}
  catch (error) {if (error.code !== 'ESRCH') throw error; return false;}
}

// Each child owns a process group. SIGINT permits Firebase cleanup; SIGKILL bounds
// an ignored interrupt, including descendants which outlive their direct parent.
export async function executeBackendCommand({root, command, args = [], env = process.env,
  log, signal, timeoutMs = 15 * 60_000, graceMs = 15_000}) {
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0);
  assert.ok(Number.isFinite(graceMs) && graceMs > 0);
  if (signal?.aborted) return {code: null, signal: null, aborted: true, timedOut: false};
  const environment = {...env}; delete environment.NODE_TEST_CONTEXT;
  const fd = log ? openSync(log, 'w') : undefined;
  let child, timeout, escalation, stopped = false, timedOut = false, aborted = false;
  const stop = (reason) => {
    if (stopped) return;
    stopped = true; timedOut = reason === 'timeout'; aborted = reason === 'abort';
    groupSignal(child.pid, 'SIGINT');
    escalation = setTimeout(() => groupSignal(child.pid, 'SIGKILL'), graceMs);
  };
  const abort = () => stop('abort');
  try {
    return await new Promise((resolveResult, reject) => {
      child = spawn(command, args, {cwd: root, env: environment,
        detached: process.platform !== 'win32', stdio: ['ignore', fd ?? 'inherit', fd ?? 'inherit']});
      child.once('error', reject);
      timeout = setTimeout(() => stop('timeout'), timeoutMs);
      signal?.addEventListener('abort', abort, {once: true});
      child.once('close', async (code, childSignal) => {
        try {
          clearTimeout(timeout);
          const remaining = process.platform !== 'win32' && groupSignal(child.pid, 0);
          if (remaining) {
            groupSignal(child.pid, 'SIGINT');
            await new Promise(done => setTimeout(done, graceMs));
            groupSignal(child.pid, 'SIGKILL');
          }
          resolveResult({code, signal: childSignal, timedOut, aborted, descendants: Boolean(remaining)});
        } catch (error) {reject(error);}
      });
    });
  } finally {
    clearTimeout(timeout); clearTimeout(escalation);
    signal?.removeEventListener('abort', abort);
    if (fd !== undefined) closeSync(fd);
  }
}

export function assertBackendResult(result, label) {
  assert.equal(result.code, 0, `${label} exited ${result.code} (signal ${result.signal ?? 'none'})`);
  assert.ok(!result.timedOut && !result.aborted && !result.descendants, `${label} did not finish cleanly`);
}

export function assertBackendReceipt(receipt) {
  assert.equal(receipt.completed, true, 'Suite did not complete');
  assert.ok(Number.isSafeInteger(receipt.passed) && receipt.passed > 0, 'Suite executed no passing tests');
  for (const name of ['failed', 'skipped', 'todo']) assert.equal(receipt[name], 0, `Suite reported ${name}`);
}

export async function executeBackendSuite(root, file, environment, {signal, timeoutMs = 180_000} = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'parabolic-backend-suite-'));
  const receiptPath = join(temporary, 'receipt.json');
  try {
    const result = await executeBackendCommand({root, command: process.execPath,
      args: [`--test-reporter=${reporter}`, resolve(root, file)],
      env: {...environment, FRONTEND_TEST_RECEIPT: receiptPath}, signal, timeoutMs});
    assertBackendResult(result, file);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    assertBackendReceipt(receipt);
    return receipt;
  } finally {await rm(temporary, {recursive: true, force: true});}
}
