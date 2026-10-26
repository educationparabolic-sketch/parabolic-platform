import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-parabolic-test');
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const origin = 'https://golden-cdn.test.invalid';
assert.equal(process.env.CDN_BASE_URL, origin + '/question-assets');
const directory = mkdtempSync(join(tmpdir(), 'bwm048-golden-tls-'));
let server, allowed = 0, denied = 0;
try {
  const cert = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'),
    '-out', join(directory, 'cert.pem'), '-subj', '/CN=golden-cdn.test.invalid', '-days', '1'], {stdio: 'ignore'});
  assert.equal(cert.status, 0);
  server = createServer({key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem'))}, (request, response) => {
    const url = new URL(request.url, origin), signature = url.searchParams.get('Signature') ?? '';
    const unique = ['Expires', 'KeyName', 'Signature'].every(key => url.searchParams.getAll(key).length === 1);
    url.searchParams.delete('Signature');
    const expected = createHmac('sha1', Buffer.from(process.env.CDN_SIGNED_URL_KEY_VALUE, 'base64url'))
      .update(url.toString()).digest('base64url');
    const valid = unique && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
      url.searchParams.get('KeyName') === process.env.CDN_SIGNED_URL_KEY_NAME && Number(url.searchParams.get('Expires')) > Date.now() / 1000 &&
      /^\/question-assets\/inst_bwm_025_golden_path\/questions\/[A-Za-z0-9_-]+\/v[1-9]\d*\/(?:question|solution)-r[1-9]\d*\.(?:png|webp)$/u.test(url.pathname);
    if (!valid) {denied++; response.writeHead(403); response.end(); return;}
    try {
      // Bytes were downloaded from the actual committed Storage objects by the
      // browser owner. This local TLS edge never manufactures API responses/assets.
      const bytes = readFileSync(resolve('.firebase/hosting/golden-path', '.' + url.pathname));
      allowed++; response.writeHead(200, {'content-type': url.pathname.endsWith('.webp') ? 'image/webp' : 'image/png',
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'}); response.end(bytes);
    } catch {response.writeHead(404); response.end();}
  });
  await new Promise((done, reject) => {server.once('error', reject); server.listen(9443, '127.0.0.1', done);});
  const result = await new Promise((done, reject) => {
    const child = spawn('npx', ['--no-install', 'playwright', 'test', 'tests/e2e/golden-path.spec.mjs'], {env: process.env, stdio: 'inherit'});
    child.once('error', reject); child.once('exit', done);
  });
  assert.equal(result, 0, 'Golden-path browser failed');
  assert.ok(allowed > 0, 'Published image bytes were never served'); assert.equal(denied, 0);
} finally {
  if (server) await new Promise(done => server.close(done));
  mkdirSync('test-results/bwm048-golden-assets', {recursive: true});
  const receipt = JSON.stringify({allowed, denied, syntheticTLS: true, actualCommittedStorageBytes: true, realCdnQualified: false}, null, 2);
  writeFileSync('test-results/bwm048-golden-assets/receipt.json', receipt);
  if (existsSync('test-results/bwm048-acceptance/run/golden-path')) writeFileSync('test-results/bwm048-acceptance/run/golden-path/local-asset-receipt.json', receipt);
  rmSync(directory, {recursive: true, force: true});
}
