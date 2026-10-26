import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {REQUIRED_STAGES, executeStage, runAcceptance, validateAcceptancePlan} from '../scripts/run-frontend-acceptance.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const yaml = require('js-yaml');
const manifest = JSON.parse(await readFile(join(root, 'scripts/frontend-test-manifest.json')));
const plan = JSON.parse(await readFile(join(root, 'scripts/frontend-acceptance-plan.json')));
const scripts = JSON.parse(await readFile(join(root, 'package.json'))).scripts;

function checkWorkflow(source) {
  const workflow = yaml.load(source), front = workflow.jobs['frontend-ci'], backend = workflow.jobs['backend-ci'];
  for (const job of [front, backend]) {assert.equal(job.if, undefined); assert.equal(job['continue-on-error'], undefined);}
  const steps = front.steps.filter(step => /Run frontend automated tests/.test(step.name)); assert.equal(steps.length, 1);
  const step = steps[0]; assert.equal(step.if, undefined); assert.equal(step['continue-on-error'], undefined);
  assert.match(step.run, /set -euo pipefail/); assert.doesNotMatch(step.run, /--if-present|\|\|\s*true/);
  assert.match(step.run, /for app in admin student exam vendor/); assert.match(step.run, /npm --prefix "apps\/\$\{app\}" test/);
  for (const command of ['test:frontend:ownership', 'test:frontend:shared', 'test:frontend:infrastructure']) assert.ok(step.run.includes(`npm run ${command}`));
  assert.ok(front.steps.some(s => s.run?.includes('npm ci\n')));
  const critical = backend.steps.filter(s => s.run === 'npm run test:frontend:acceptance'); assert.equal(critical.length, 1);
  assert.equal(critical[0].if, undefined); assert.equal(critical[0]['continue-on-error'], undefined);
  assert.ok(backend.steps.some(s => s.run === 'npm run test:security-matrix'));
  assert.ok(backend.steps.some(s => s.run?.includes('sudo apt-get install --no-install-recommends -y xvfb xauth')), 'Native visibility browser prerequisite is required');
  assert.deepEqual(workflow.jobs['staging-deploy'].needs, ['frontend-ci', 'backend-ci']);
  for (const event of ['push', 'pull_request']) {
    const paths = workflow.on[event].paths;
    for (const value of ['scripts/*.mjs', 'scripts/*.json', 'tests/**', 'apps/**', 'shared/**', 'functions/**', 'package.json', 'package-lock.json', 'firebase*.json', 'docs/FRONTEND_TESTS.md']) assert.ok(paths.includes(value), `${event} omits ${value}`);
  }
}
test('required CI executes every portal, ownership and shared/infrastructure gate and gates deploy on real critical browser acceptance', async () => {
  checkWorkflow(await readFile(join(root, '.github/workflows/frontend-ci-cd.yml'), 'utf8'));
  validateAcceptancePlan(plan, manifest, scripts);
});
test('missing optional bypassed workflows, ownership triggers and critical browser dispositions reject the candidate', async () => {
  const source = await readFile(join(root, '.github/workflows/frontend-ci-cd.yml'), 'utf8');
  for (const mutate of [s => s.replace('npm --prefix "apps/${app}" test', 'npm --prefix "apps/${app}" test --if-present'),
    s => s.replace('npm run test:frontend:ownership', 'echo skipped'), s => s.replace('npm run test:frontend:acceptance', 'echo skipped'),
    s => s.replaceAll('      - "scripts/*.json"\n', ''), s => s.replace('sudo apt-get install --no-install-recommends -y xvfb xauth', 'echo omitted display'),
    s => s.replace('run: npm run test:frontend:acceptance', 'if: false\n        run: npm run test:frontend:acceptance')]) assert.throws(() => checkWorkflow(mutate(source)));
  for (const mutate of [p => p.stages.pop(), p => p.stages.push(p.stages[0]), p => p.project = 'remote-project', p => p.browsers.pop(),
    p => {p.browsers.find(row => row.file.endsWith('/golden-path.spec.mjs')).disposition = 'focused-owner';}]) {
    const changed = structuredClone(plan); mutate(changed); assert.throws(() => validateAcceptancePlan(changed, manifest, scripts));
  }
  const missing = {...scripts}; delete missing['test:golden-path:e2e']; assert.throws(() => validateAcceptancePlan(plan, manifest, missing));
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-acceptance-test-'));
  for (const path of ['scripts', 'tests/e2e', 'tests/security', ...['admin', 'student', 'exam', 'vendor'].map(p => `apps/${p}/artifacts`)]) await mkdir(join(directory, path), {recursive: true});
  await writeFile(join(directory, '.gitignore'), 'dist/\n.firebase/\ntest-results/\n');
  assert.equal(spawnSync('git', ['init', '-q'], {cwd: directory}).status, 0);
  const scopes = ['admin', 'student', 'exam', 'vendor', 'shared', 'infrastructure'];
  const rows = [{file: 'tests/proof.test.mjs', kind: 'node', owners: scopes, proof: ['behavior'], prerequisites: ['node'], workflow: null}];
  await writeFile(join(directory, 'tests/proof.test.mjs'), '// fixture inventory only\n');
  const critical = ['golden-path', 'admin-acceptance-matrix', 'student-profile-ui', 'student-solutions', 'student-summary-contract', 'exam-launch-auth', 'vendor-acceptance-shells'];
  for (const name of critical) {
    const file = `tests/e2e/${name}.spec.mjs`; await writeFile(join(directory, file), '// fixture inventory only\n');
    rows.push({file, kind: 'browser-local', owners: ['shared'], proof: ['browser'], prerequisites: ['local-browser'], workflow: {script: 'test:golden-path:e2e', args: []}});
  }
  await writeFile(join(directory, 'scripts/frontend-test-manifest.json'), JSON.stringify({...manifest, suites: rows}));
  await writeFile(join(directory, 'scripts/frontend-acceptance-plan.json'), JSON.stringify({...plan, browsers: plan.browsers.filter(row => critical.some(name => row.file === `tests/e2e/${name}.spec.mjs`))}));
  await writeFile(join(directory, 'package.json'), JSON.stringify({scripts: Object.fromEntries(REQUIRED_STAGES.map(([, name, command]) => [name, command]))}));
  for (const portal of scopes.slice(0, 4)) await writeFile(join(directory, `apps/${portal}/package.json`), JSON.stringify({scripts: {test: `node ../../scripts/run-frontend-tests.mjs --scope ${portal}`}}));
  await mkdir(join(directory, 'apps/admin/dist'), {recursive: true}); await writeFile(join(directory, 'apps/admin/dist/original'), 'original bytes');
  return directory;
}
for (const fail of [false, true]) test(`acceptance ${fail ? 'failure' : 'success'} retains receipts, stops failed children and restores present and absent artifacts`, async () => {
  const directory = await fixture(), dispatched = [];
  try {
    const operation = runAcceptance(directory, async (_root, stage, out, env) => {
      dispatched.push(stage.id); assert.equal(env.PROJECT_ID, 'demo-parabolic-test'); assert.equal(env.FIREBASE_TOKEN, undefined);
      await writeFile(join(directory, 'apps/admin/dist/original'), 'changed');
      await mkdir(join(directory, '.firebase/hosting/golden-path'), {recursive: true}); await writeFile(join(directory, '.firebase/hosting/golden-path/index.html'), 'temporary');
      await writeFile(join(out, 'output.log'), 'controlled child proof, not browser acceptance'); return {code: fail ? 7 : 0, signal: null};
    });
    if (fail) await assert.rejects(operation, /golden-path failed/); else await operation;
    assert.equal(await readFile(join(directory, 'apps/admin/dist/original'), 'utf8'), 'original bytes');
    await assert.rejects(readFile(join(directory, '.firebase/hosting/golden-path/index.html')));
    const receipt = JSON.parse(await readFile(join(directory, 'test-results/bwm048-acceptance/run/receipt.json')));
    assert.equal(receipt.result, fail ? 'FAIL' : 'PASS'); assert.equal(receipt.restored, true);
    assert.equal(dispatched.length, fail ? 1 : REQUIRED_STAGES.length); assert.equal(receipt.stages[0].exitCode, fail ? 7 : 0);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('real child failure retains its nonzero exit and output instead of qualifying browser acceptance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-failed-child-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({scripts: {fail: 'node -e "console.log(\'intentional failure probe\');process.exit(7)"'}}));
    const result = await executeStage(directory, {script: 'fail'}, directory, {...process.env});
    assert.equal(result.code, 7); assert.match(await readFile(join(directory, 'output.log'), 'utf8'), /intentional failure probe/);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('existing route and DTO contract owners reject an actually removed route or declaration through isolated child probes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-contract-probe-'));
  try {
    const probes = [
      ['route', 'functions/tests/apiRouteManifest.test.js', `
        const Module = require('node:module'), load = Module._load;
        Module._load = function(name, parent, main) {
          const value = load.apply(this, arguments);
          if (name === '../lib/apiRouteManifest.js' && parent.filename.endsWith('/apiRouteManifest.test.js'))
            return {...value, API_ROUTE_MANIFEST: value.API_ROUTE_MANIFEST.filter(row => row.id !== 'STU-01')};
          return value;
        };`],
      ['declaration', 'tests/api-dto-contract.test.mjs', `
        const fs = require('node:fs/promises'), read = fs.readFile;
        fs.readFile = async function(path, ...args) {
          if (String(path).endsWith('/shared/contracts/apiDtos.d.ts')) return '';
          return read.call(this, path, ...args);
        };
        require('node:module').syncBuiltinESMExports();`],
    ];
    for (const [label, file, source] of probes) {
      const preload = join(directory, `${label}.cjs`); await writeFile(preload, source);
      const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ['--require', preload, file], {cwd: root, env, encoding: 'utf8', timeout: 120000});
      assert.ifError(result.error); assert.equal(result.status, 1, `${label} drift must fail its existing owner`);
      assert.match(result.stdout, /not ok|# fail [1-9]/); assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
    }
  } finally {await rm(directory, {recursive: true, force: true});}
});
