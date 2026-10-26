import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, openSync, readFileSync} from 'node:fs';
import {mkdir, rename, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadOwnership} from './frontend-test-ownership.mjs';
import {ARTIFACT_ROOTS, artifactHashes, withRestoredArtifacts} from './run-security-matrix.mjs';

export const ACCEPTANCE_ARTIFACTS = [...ARTIFACT_ROOTS, '.firebase/hosting/golden-path'];
export const REQUIRED_STAGES = [
  ['golden-path', 'test:golden-path:e2e', 'node scripts/run-golden-path-e2e.mjs'],
  ['admin', 'test:admin-acceptance:e2e', 'node scripts/run-admin-acceptance-e2e.mjs'],
  ['student-profile', 'test:student-profile-acceptance:e2e', 'node scripts/run-student-profile-ui-e2e.mjs --acceptance'],
  ['student-solutions', 'test:student-solutions:e2e', 'node scripts/run-student-solutions-e2e.mjs'],
  ['exam-resilience', 'test:exam-resilience:acceptance', 'node scripts/run-exam-resilience-acceptance.mjs'],
  ['exam-proctoring', 'test:exam-proctoring-acceptance:e2e', 'node scripts/run-exam-launch-auth-e2e.mjs --proctoring-acceptance'],
  ['vendor', 'test:vendor-acceptance:e2e', 'node scripts/run-vendor-acceptance-e2e.mjs'],
];
export function validateAcceptancePlan(plan, manifest, scripts) {
  assert.equal(plan.version, 1); assert.equal(plan.project, 'demo-parabolic-test');
  assert.deepEqual(plan.stages, REQUIRED_STAGES.map(([id, script]) => ({id, script})), 'Missing, duplicate or changed critical workflow');
  for (const [, script, command] of REQUIRED_STAGES) assert.equal(scripts[script], command, `Missing or changed owning workflow: ${script}`);
  const local = manifest.suites.filter(row => row.kind === 'browser-local').map(row => row.file).sort();
  assert.deepEqual(plan.browsers.map(row => row.file).sort(), local, 'Missing, duplicate or unclassified local browser disposition');
  for (const row of plan.browsers) {
    assert.ok(row.reason?.length > 20);
    assert.ok(['required', 'focused-owner'].includes(row.disposition));
    if (row.disposition === 'required') assert.ok(plan.stages.some(stage => stage.id === row.stage));
    else assert.equal(row.stage, null);
  }
  for (const file of ['golden-path', 'admin-acceptance-matrix', 'student-profile-ui', 'student-solutions', 'student-summary-contract', 'exam-launch-auth', 'vendor-acceptance-shells']) {
    assert.equal(plan.browsers.find(row => row.file === `tests/e2e/${file}.spec.mjs`)?.disposition, 'required', `Critical browser cannot be downgraded: ${file}`);
  }
}
export function sourceHashes(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0);
  return Object.fromEntries([...new Set(result.stdout.split('\0').filter(Boolean))].sort().map(file =>
    [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
}
export async function executeStage(root, stage, directory, environment, onChild = () => {}) {
  const log = openSync(join(directory, 'output.log'), 'w');
  try {
    return await new Promise((resolveResult, reject) => {
      const child = spawn('npm', ['run', stage.script], {cwd: root, env: environment, detached: true, stdio: ['ignore', log, log]});
      onChild(child);
      const deadline = setTimeout(() => {try {process.kill(-child.pid, 'SIGTERM');} catch (e) {if (e.code !== 'ESRCH') reject(e);}}, 90 * 60 * 1000);
      child.once('error', error => {clearTimeout(deadline); reject(error);});
      child.once('close', (code, signal) => {clearTimeout(deadline); resolveResult({code, signal});});
    });
  } finally {onChild(null); closeSync(log);}
}
export async function runAcceptance(root, execute = executeStage) {
  const manifest = await loadOwnership(root), scripts = JSON.parse(readFileSync(join(root, 'package.json'))).scripts;
  const plan = JSON.parse(readFileSync(join(root, 'scripts/frontend-acceptance-plan.json')));
  validateAcceptancePlan(plan, manifest, scripts);
  const out = join(root, 'test-results/bwm048-acceptance/run'); await mkdir(resolve(out, '..'), {recursive: true});
  try {await rename(out, `${out}-previous-${Date.now()}-${process.pid}`);} catch (error) {if (error.code !== 'ENOENT') throw error;}
  await mkdir(out, {recursive: true});
  const before = sourceHashes(root), initialArtifacts = await artifactHashes(root, ACCEPTANCE_ARTIFACTS);
  const receipt = {result: 'RUNNING', project: plan.project, publicQualified: false, restored: false, stages: []};
  const save = () => writeFile(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(join(out, 'source-candidate.json'), JSON.stringify(before, null, 2) + '\n'); await save();
  let active, interrupted = false;
  const interrupt = () => {interrupted = true; if (active) try {process.kill(-active.pid, 'SIGINT');} catch (error) {if (error.code !== 'ESRCH') throw error;}};
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const env = {...process.env, CI: 'true', DEBUG: '', NODE_ENV: 'test', PROJECT_ID: plan.project, GCLOUD_PROJECT: plan.project,
    GOOGLE_CLOUD_PROJECT: plan.project, NO_GCE_CHECK: 'true', METADATA_SERVER_DETECTION: 'none',
    APP_CHECK_MODE: 'pending_provisioning', VITE_APP_CHECK_MODE: 'pending_provisioning'};
  delete env.FIREBASE_TOKEN; delete env.GOOGLE_APPLICATION_CREDENTIALS;
  for (const key of Object.keys(env)) if (/EMULATOR_(?:HOST|HUB)$/u.test(key)) delete env[key];
  try {
    await withRestoredArtifacts(root, async () => {
      for (const stage of plan.stages) {
        assert.equal(interrupted, false, 'Acceptance interrupted'); assert.deepEqual(sourceHashes(root), before, 'Source candidate changed');
        const directory = join(out, stage.id); await mkdir(directory, {recursive: true});
        const entry = {id: stage.id, command: ['npm', 'run', stage.script], result: 'RUNNING', startedAt: new Date().toISOString()};
        receipt.stages.push(entry); await save();
        console.log(`[frontend-acceptance] ${stage.id}; project=${plan.project}; isolated local emulator owner`);
        const result = await execute(root, stage, directory, env, child => {active = child;});
        entry.exitCode = result.code; entry.signal = result.signal; entry.result = result.code === 0 && !interrupted ? 'PASS' : 'FAIL';
        entry.completedAt = new Date().toISOString(); await save();
        assert.equal(entry.result, 'PASS', `${stage.id} failed; inspect ${directory}/output.log`);
        await writeFile(join(directory, 'artifacts.json'), JSON.stringify(await artifactHashes(root, ACCEPTANCE_ARTIFACTS), null, 2) + '\n');
      }
    }, ACCEPTANCE_ARTIFACTS);
    assert.deepEqual(sourceHashes(root), before, 'Source candidate changed'); receipt.restored = true; receipt.result = 'PASS';
  } catch (error) {
    receipt.result = 'FAIL'; receipt.failure = error.message;
    receipt.restored = JSON.stringify(await artifactHashes(root, ACCEPTANCE_ARTIFACTS)) === JSON.stringify(initialArtifacts); throw error;
  } finally {process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); await save();}
  console.log(`[frontend-acceptance] PASS ${receipt.stages.length} stages; artifacts restored; public qualification remains open`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'The required aggregate cannot omit a workflow');
  await runAcceptance(resolve(import.meta.dirname, '..'));
}
