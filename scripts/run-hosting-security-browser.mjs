import assert from "node:assert/strict";
import {createServer} from "node:https";
import {createHmac, randomBytes} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
const probe = ts.transpileModule(readFileSync("shared/services/managedAssetPolicy.ts", "utf8"), {
  compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}}).outputText;
writeFileSync(".firebase/hosting/portal/admin/assets/security-policy-probe.js", probe + "\nwindow.__assetPolicy = {managedSignedAssetUrl};\n");
const directory = mkdtempSync(join(tmpdir(), "bwm047-local-tls-"));
const secret = randomBytes(32), path = "/published/tenant/questions/q/v1/question-r2.png";
const expires = "9999999999", signature = createHmac("sha256", secret).update(path + expires).digest("base64url");
const signed = `https://cdn.security.test.invalid${path}?Expires=${expires}&KeyName=synthetic&Signature=${signature}`;
let allowed = 0, denied = 0, server;
try {
  const cert = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"),
    "-out", join(directory, "cert.pem"), "-subj", "/CN=cdn.security.test.invalid", "-days", "1"], {stdio: "ignore"});
  assert.equal(cert.status, 0, "Local synthetic TLS certificate generation failed");
  server = createServer({key: readFileSync(join(directory, "key.pem")), cert: readFileSync(join(directory, "cert.pem"))}, (request, response) => {
    const url = new URL(request.url, "https://cdn.security.test.invalid");
    if (url.pathname !== path || url.searchParams.get("Expires") !== expires || url.searchParams.get("Signature") !== signature) {
      denied++; response.writeHead(403); response.end(); return;
    }
    allowed++; response.writeHead(200, {"content-type": "image/png", "cache-control": "private, max-age=0, no-store"});
    response.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII=", "base64"));
  });
  await new Promise((resolve, reject) => {server.once("error", reject); server.listen(9443, "127.0.0.1", resolve);});
  const result = await new Promise((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "playwright", "test", "tests/e2e/hosting-security-policy.spec.mjs", "--project=chromium"], {
      env: {...process.env, PARABOLIC_SECURITY_SIGNED_ASSET: signed}, stdio: "inherit"});
    child.once("error", reject); child.once("exit", resolve);
  });
  assert.equal(result, 0, "Hosting/browser policy verification failed");
  assert.ok(allowed > 0); assert.equal(denied, 0);
  writeFileSync(join(process.env.SECURITY_EVIDENCE_DIRECTORY ?? "test-results/bwm047-headers", "signed-asset-receipt.json"), JSON.stringify({allowed, denied,
    syntheticTLS: true, localDnsMapping: true, realProviderQualified: false}, null, 2));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  rmSync(directory, {recursive: true, force: true});
  rmSync(".firebase/hosting/portal/admin/assets/security-policy-probe.js", {force: true});
}
