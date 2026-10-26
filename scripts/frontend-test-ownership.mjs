import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

export const scopes = ['admin', 'student', 'exam', 'vendor', 'shared', 'infrastructure'];
export const kinds = ['node', 'browser-local', 'browser-public', 'emulator-integration', 'historical-ui'];
const prerequisites = ['node', 'functions-deps', 'functions-build', 'root-deps', 'shared-deps',
  'admin-deps', 'student-deps', 'exam-deps', 'vendor-deps', 'bwm004-package',
  'local-browser', 'local-emulators', 'public-preview', 'historical-ui'];

export function validatePortalCommands(packages) {
  for (const portal of scopes.slice(0, 4)) {
    assert.equal(packages[portal]?.scripts?.test, `node ../../scripts/run-frontend-tests.mjs --scope ${portal}`, `Missing or drifted ${portal} test command`);
  }
}

export async function discoverOwnedFiles(root) {
  const files = [];
  async function visit(directory, recursive, predicate) {
    for (const entry of await readdir(resolve(root, directory), {withFileTypes: true})) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory() && recursive) await visit(file, true, predicate);
      else if (predicate(entry.name)) {
        assert.ok(entry.isFile(), `Test must be a regular file: ${file}`);
        files.push(file);
      }
    }
  }
  await visit('tests', false, name => name.endsWith('.test.mjs'));
  await visit('tests/e2e', false, name => name.endsWith('.spec.mjs'));
  await visit('tests/security', false, name => name.endsWith('.emulator.cjs'));
  for (const portal of scopes.slice(0, 4)) {
    await visit(`apps/${portal}/artifacts`, true, name => /^verify-.*\.mjs$/u.test(name));
  }
  return files.sort();
}

export function validateManifest(manifest, discovered, scripts) {
  assert.equal(manifest.version, 1, 'Unknown frontend manifest version');
  assert.deepEqual(Object.keys(manifest.prerequisites).sort(), [...prerequisites].sort(), 'Unknown or missing prerequisite profile');
  assert.ok(manifest.suites?.length > 0, 'Empty ownership manifest');
  const seen = new Set();
  for (const suite of manifest.suites) {
    assert.deepEqual(Object.keys(suite).sort(), ['file', 'kind', 'owners', 'prerequisites', 'proof', 'workflow']);
    assert.ok(typeof suite.file === 'string' && !suite.file.includes('..') && !suite.file.startsWith('/'), 'Invalid test path');
    assert.ok(!seen.has(suite.file), `Duplicate test ownership: ${suite.file}`);
    seen.add(suite.file);
    assert.ok(kinds.includes(suite.kind), `Unknown execution kind: ${suite.file}`);
    assert.ok(suite.owners.length > 0 && new Set(suite.owners).size === suite.owners.length, `Empty/duplicate owners: ${suite.file}`);
    for (const owner of suite.owners) assert.ok(scopes.includes(owner), `Unknown owner: ${owner}`);
    assert.ok(suite.proof.length > 0 && new Set(suite.proof).size === suite.proof.length, `Empty/duplicate proof: ${suite.file}`);
    for (const proof of suite.proof) assert.ok(['behavior', 'contract', 'browser', 'visual'].includes(proof), `Unknown proof: ${proof}`);
    assert.ok(suite.prerequisites.length > 0 && new Set(suite.prerequisites).size === suite.prerequisites.length, `Empty/duplicate prerequisites: ${suite.file}`);
    for (const prerequisite of suite.prerequisites) assert.ok(Object.hasOwn(manifest.prerequisites, prerequisite), `Unknown prerequisite: ${prerequisite}`);
    if (suite.kind === 'node') {
      assert.equal(suite.workflow, null, 'Node suites execute through the frontend runner');
      assert.ok(suite.proof.every(proof => ['behavior', 'contract'].includes(proof)), 'Node proof cannot claim browser execution');
      assert.ok(!suite.prerequisites.some(key => ['local-browser', 'public-preview', 'historical-ui', 'local-emulators'].includes(key)), 'Node selection cannot require remote/browser/emulator access');
    } else if (suite.kind === 'historical-ui') {
      assert.equal(suite.workflow, null);
      assert.deepEqual(suite.proof, ['visual']);
    } else {
      assert.deepEqual(Object.keys(suite.workflow).sort(), ['args', 'script']);
      assert.ok(Object.hasOwn(scripts, suite.workflow.script), `Missing workflow: ${suite.file}`);
      assert.ok(Array.isArray(suite.workflow.args) && suite.workflow.args.every(arg => typeof arg === 'string'));
      assert.ok(suite.prerequisites.includes(suite.kind === 'browser-public' ? 'public-preview' : suite.kind === 'browser-local' ? 'local-browser' : 'local-emulators'));
    }
  }
  assert.deepEqual([...seen].sort(), [...discovered].sort(), 'Unclassified, missing or stale test file');
  for (const scope of scopes) selectSuites(manifest, scope);
}

export function selectSuites(manifest, scope) {
  assert.ok(scope === 'all' || scopes.includes(scope), `Unknown frontend scope: ${scope}`);
  const selected = manifest.suites.filter(suite => suite.kind === 'node' && (scope === 'all' || suite.owners.includes(scope)));
  assert.ok(selected.length > 0, `Empty frontend scope: ${scope}`);
  assert.equal(new Set(selected.map(suite => suite.file)).size, selected.length, 'Duplicate test selection');
  return selected;
}

export async function loadOwnership(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'scripts/frontend-test-manifest.json'), 'utf8'));
  const {scripts} = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  validateManifest(manifest, await discoverOwnedFiles(root), scripts);
  const packages = {};
  for (const portal of scopes.slice(0, 4)) packages[portal] = JSON.parse(await readFile(resolve(root, `apps/${portal}/package.json`), 'utf8'));
  validatePortalCommands(packages);
  return manifest;
}
