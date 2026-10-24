import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, mkdir, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import test from "node:test";
import {cdnReleaseOrigin, prepareSecurityHosting, IMMUTABLE} from "../scripts/frontend-cicd/prepare-security-hosting.mjs";
import {DEFAULT_ARTIFACT_ROOTS, parseArtifactScanArguments} from "../scripts/frontend-cicd/scan-release-artifacts.mjs";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
const loaded = {exports: {}};
new Function("exports", "module", ts.transpileModule(readFileSync("shared/services/managedAssetPolicy.ts", "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText)(loaded.exports, loaded);
const {managedSignedAssetUrl: asset, safeBusinessUrl} = loaded.exports;
const base = "https://cdn.example.invalid/published";
const path = "tenant/questions/q/v1/question-r2.webp";
const signed = `${base}/${path}?Expires=9999999999&KeyName=test&Signature=Abc%2Bdef%3D&extra=a%20b`;
test("managed URLs preserve exact signature bytes and bind the approved path", () => {
  assert.equal(asset(signed, base, path), signed);
  assert.equal(asset(signed, base, "tenant/questions/other/v1/question-r2.webp"), "");
  assert.equal(asset(signed, undefined), "");
  for (const value of [signed.replace("https:", "http:"), signed.replace("cdn.example.invalid", "cdn.example.invalid.evil"),
    signed.replace("cdn.example.invalid", "user@cdn.example.invalid"), signed.replace("/published/", "/published-other/"),
    signed.replace("/q/", "/q/../q/"), signed.replace("/q/", "/q/%2e%2e/q/"), signed.replace("cdn.example.invalid", "cdn.example.invalid:444"),
    signed.replace("question-r2.webp", "question-r2.svg"), signed.replace("?Expires", "#Expires"),
    signed + "&Signature=duplicate", signed.replace("https://", "//"), signed + "\n", "javascript:alert(1)",
    "data:image/svg+xml,test", "blob:https://cdn.example.invalid/opaque", `${base}/${path}`]) assert.equal(asset(value, base), "", value);
});
test("business links reject active schemes, credentials and hidden controls", () => {
  assert.equal(safeBusinessUrl("https://provider.invalid/action?opaque=a%2Bb"), "https://provider.invalid/action?opaque=a%2Bb");
  for (const url of ["javascript:alert(1)", "//evil.invalid", "http://evil.invalid", "https://user@evil.invalid", "https://evil.invalid/\n"]) assert.equal(safeBusinessUrl(url), "");
});
test("release origins fail closed on missing, mismatched, credentials, traversal, local and non-HTTPS bases", () => {
  assert.equal(cdnReleaseOrigin({VITE_CDN_BASE_URL: base, CDN_BASE_URL: base}), "https://cdn.example.invalid");
  for (const url of ["", "http://cdn.invalid", "https://localhost", "https://127.0.0.1", "https://cdn.invalid:444", "https://u@cdn.invalid", "https://cdn.invalid/a/../b", "https://cdn.invalid/?q=1", "https://cdn.invalid/?", "https://cdn.invalid/#", "https://[::ffff:127.0.0.1]", "https://0.0.0.0"]) {
    assert.throws(() => cdnReleaseOrigin({VITE_CDN_BASE_URL: url, CDN_BASE_URL: url}));
  }
  assert.throws(() => cdnReleaseOrigin({VITE_CDN_BASE_URL: base, CDN_BASE_URL: base + "/other"}));
});
test("all served roots are required; only real content-hashed generated assets become immutable", async () => {
  assert.ok(DEFAULT_ARTIFACT_ROOTS.includes(".firebase/hosting/portal"));
  assert.deepEqual(parseArtifactScanArguments(["--scan"]), DEFAULT_ARTIFACT_ROOTS);
  const rootDirectory = await mkdtemp(join(tmpdir(), "hosting-policy-"));
  try {
    for (const root of DEFAULT_ARTIFACT_ROOTS) {
      await mkdir(join(rootDirectory, root, "assets"), {recursive: true});
      await writeFile(join(rootDirectory, root, "index.html"), "<!doctype html><p>safe</p>");
      await writeFile(join(rootDirectory, root, "assets/app-AbcDef12.js"), "export const safe = true;");
      await writeFile(join(rootDirectory, root, "assets/unhashed.js"), "export const safe = true;");
    }
    const config = JSON.parse(readFileSync("firebase.json", "utf8"));
    const result = await prepareSecurityHosting({rootDirectory, config, environment: {VITE_CDN_BASE_URL: base, CDN_BASE_URL: base}});
    for (const target of result.hosting) {
      const immutable = target.headers.filter(row => row.headers.some(header => header.value === IMMUTABLE));
      assert.deepEqual(immutable.map(row => row.source), ["/assets/app-AbcDef12.js"]);
      const csp = target.headers[0].headers.find(header => header.key === "Content-Security-Policy").value;
      assert.ok(csp.includes("img-src 'self' data: blob: https://cdn.example.invalid;"));
      assert.doesNotMatch(csp, /https:\*|https:;|\*\.googleapis|blob:; worker/u);
    }
    await rm(join(rootDirectory, ".firebase/hosting/portal"), {recursive: true});
    await assert.rejects(prepareSecurityHosting({rootDirectory, config, environment: {VITE_CDN_BASE_URL: base, CDN_BASE_URL: base}}), /missing/u);
  } finally {await rm(rootDirectory, {recursive: true, force: true});}
});
test("all 64 outer HTTP exports set private headers before positive delegation and early rejection", async () => {
  const {guardHttpExport} = require("../functions/lib/api/httpExportGuard");
  const {API_ROUTE_MANIFEST, BACKEND_HTTP_EXPORT_MANIFEST} = require("../functions/lib/apiRouteManifest");
  const {createMockRequest, createMockResponse} = require("../functions/lib/tests/helpers/http");
  assert.equal(BACKEND_HTTP_EXPORT_MANIFEST.length, 64);
  for (const entry of BACKEND_HTTP_EXPORT_MANIFEST) {
    const route = API_ROUTE_MANIFEST.find(route => route.functionExport === entry.functionExport);
    for (const reject of [false, true]) {
      let invoked = false;
      const request = createMockRequest({path: reject ? "/unexpected" : route?.canonicalPath.replace(/\{[^}]+\}/gu, "resource") ?? "/",
        method: route?.method ?? "POST"});
      const response = createMockResponse();
      await guardHttpExport(entry.functionExport, () => {
        invoked = true;
        assert.equal(response.headers["cache-control"], "private, max-age=0, no-store");
        assert.equal(response.headers["x-content-type-options"], "nosniff");
      }, {admit: async () => {}, ingress: () => {}})(request, response);
      assert.equal(response.headers["cache-control"], "private, max-age=0, no-store", entry.functionExport);
      if (reject && !["gateway", "healthcheck", "webhook"].includes(entry.disposition)) assert.equal(invoked, false);
      if (!reject) assert.equal(invoked, true, entry.functionExport);
    }
  }
});

test("CLI cannot omit a built or served root using explicit overrides", () => {
  const {spawnSync} = require("node:child_process");
  const result = spawnSync(process.execPath, ["scripts/frontend-cicd/scan-release-artifacts.mjs", "--scan", "--root", "apps/admin/dist"], {encoding: "utf8"});
  assert.ifError(result.error);
  assert.equal(result.status, 2);
});
