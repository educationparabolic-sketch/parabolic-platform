import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectedSourceSuites, selectedExternalSuites} from '../functions/scripts/run-non-emulator-tests.mjs';
import {firebaseIntegrationGroups} from './firebase-emulator-harness-config.mjs';

const markers = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'firebase emulators'];
const same = (actual, expected, label) => {
  assert.equal(new Set(expected).size, expected.length, `${label} contains duplicate owners`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} inventory changed`);
};

export async function loadBackendInventory(root) {
  const source = (await readdir(resolve(root, 'functions/src/tests'), {recursive: true})).filter(f => f.endsWith('.test.ts')).sort();
  const external = (await readdir(resolve(root, 'functions/tests'), {recursive: true})).filter(f => f.endsWith('.test.js')).sort();
  const rows = [];
  for (const name of source) {
    const text = await readFile(resolve(root, 'functions/src/tests', name), 'utf8');
    const emulator = markers.some(marker => text.includes(marker));
    rows.push({file: `functions/src/tests/${name}`, compiled: `functions/lib/tests/${name.replace(/\.ts$/u, '.js')}`,
      kind: emulator ? 'sdk-emulator' : 'unit'});
  }
  same(rows.filter(r => r.kind === 'unit').map(r => r.file.slice('functions/src/tests/'.length, -3)), selectedSourceSuites, 'Source unit');
  same(external.filter(f => !f.endsWith('.emulator.test.js')), selectedExternalSuites, 'External unit');
  const grouped = Object.values(firebaseIntegrationGroups).flat();
  same(external.filter(f => f.endsWith('.emulator.test.js')), grouped, 'HTTP emulator');
  for (const name of external) {
    const group = Object.entries(firebaseIntegrationGroups).find(([, files]) => files.includes(name))?.[0];
    rows.push({file: `functions/tests/${name}`, compiled: `functions/tests/${name}`,
      kind: group ? 'http-emulator' : 'unit', ...(group ? {group} : {})});
  }
  assert.equal(rows.filter(r => r.kind === 'sdk-emulator').length, 99, 'SDK emulator inventory changed');
  assert.equal(rows.filter(r => r.kind === 'http-emulator').length, 20, 'HTTP emulator inventory changed');
  assert.equal(rows.filter(r => r.kind === 'unit').length, 69, 'Unit inventory changed');
  assert.equal(new Set(rows.map(r => r.file)).size, rows.length, 'Duplicate backend suite');
  return {version: 1, project: 'demo-parabolic-test', suites: rows,
    supplemental: ['scripts/firebase-emulator-smoke.mjs', 'functions/tests/emulatorFailureCleanup.probe.js']};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--check'], 'Expected --check; no partial selection');
  const inventory = await loadBackendInventory(resolve(import.meta.dirname, '..'));
  console.log(`[backend-inventory] PASS ${inventory.suites.length} files: 69 unit, 99 SDK, 20 HTTP; no exclusions.`);
}
