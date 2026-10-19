import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {scanReleaseArtifacts} from "./frontend-cicd/scan-release-artifacts.mjs";

// Local preparation only. No provider SDK, cloud command, identity or deployment.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const allowed = new Set(["--portal-origin", "--exam-origin"]);
const args = process.argv.slice(2);
assert.equal(args.length, 4, "Supply explicit --portal-origin and --exam-origin.");
const values = new Map();
for (let i = 0; i < args.length; i += 2) {
  assert.ok(allowed.has(args[i]) && !values.has(args[i]), "Unknown/duplicate option.");
  values.set(args[i], args[i + 1]);
}
function origin(key, site) {
  const raw = values.get(key);
  const url = new URL(raw);
  assert.equal(raw, url.origin, "Origins must be canonical with no path/query/fragment.");
  assert.equal(url.protocol, "https:");
  assert.equal(url.port, "");
  assert.ok(url.hostname === `${site}.web.app` ||
    new RegExp(String.raw`^${site}--[a-z0-9-]+\.web\.app$`).test(url.hostname), "Wrong staging site.");
  return url.origin;
}
const portalOrigin = origin("--portal-origin", "parabolic-dev");
const examOrigin = origin("--exam-origin", "parabolic-dev-40ec9");
assert.notEqual(portalOrigin, examOrigin);
const mapping = JSON.parse(readFileSync(".firebaserc", "utf8"));
assert.deepEqual(mapping.targets["parabolic-dev"].hosting.portal, ["parabolic-dev"]);
assert.deepEqual(mapping.targets["parabolic-dev"].hosting.exam, ["parabolic-dev-40ec9"]);
const publicConfig = Object.fromEntries([...readFileSync("apps/student/.env.local", "utf8")
  .matchAll(/^(VITE_FIREBASE_[A-Z0-9_]+)=(.*)$/gm)]
  .map(([, k, v]) => [k, v.trim().replace(/^['"]|['"]$/g, "")]));
assert.equal(publicConfig.VITE_FIREBASE_PROJECT_ID, "parabolic-dev");
assert.equal(publicConfig.VITE_FIREBASE_AUTH_DOMAIN, "parabolic-dev.firebaseapp.com");
assert.match(publicConfig.VITE_FIREBASE_API_KEY, /^AIza[A-Za-z0-9_-]{20,}$/);
const commit = spawnSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"});
assert.equal(commit.status, 0);
const builtAt = new Date().toISOString();
const releaseId = `bwm044-candidate-${builtAt.replace(/\D/g, "").slice(0, 14)}`;
const environment = {...process.env, ...publicConfig, NODE_ENV: "production",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "", VITE_API_BASE_URL: "", VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false", VITE_PORTAL_BASE_URL: portalOrigin,
  VITE_EXAM_BASE_URL: examOrigin, VITE_VENDOR_BASE_URL: "https://parabolic-dev-vendor.web.app",
  VITE_RELEASE_ID: releaseId, VITE_RELEASE_COMMIT_SHA: commit.stdout.trim(), VITE_RELEASE_BUILT_AT: builtAt};
function run(command, commandArgs, extra = {}) {
  const result = spawnSync(command, commandArgs, {cwd: root, env: {...environment, ...extra}, stdio: "inherit"});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}
for (const app of ["admin", "student", "exam"]) {
  run("npm", ["--prefix", `apps/${app}`, "run", "build"], {VITE_BASE_PATH: app === "exam" ? "/" : `/${app}/`});
}
run(process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
const scan = await scanReleaseArtifacts({artifactRoots: [".firebase/hosting/portal", "apps/exam/dist"]});
const evidence = resolve("test-results/bwm044-closeout");
const snapshot = resolve(evidence, releaseId);
mkdirSync(snapshot, {recursive: true});
cpSync(".firebase/hosting/portal", resolve(snapshot, "portal"), {recursive: true});
cpSync("apps/exam/dist", resolve(snapshot, "exam"), {recursive: true});
function files(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(item => item.isDirectory() ? files(`${dir}/${item.name}`) : [`${dir}/${item.name}`]);
}
const manifest = files(snapshot).sort().map(path => {
  const bytes = readFileSync(path);
  assert.doesNotMatch(bytes.toString("utf8"), /demo-parabolic-test|demo-api-key/);
  return {path: path.slice(snapshot.length + 1), bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")};
});
const previewOrigins = new URL(portalOrigin).hostname.startsWith("parabolic-dev--") &&
  new URL(examOrigin).hostname.startsWith("parabolic-dev-40ec9--");
writeFileSync(resolve(evidence, "preview-candidate.json"), JSON.stringify({
  project: "parabolic-dev", targets: {portal: "parabolic-dev", exam: "parabolic-dev-40ec9"},
  releaseId, commit: commit.stdout.trim(), dirtyWorkspace: true, builtAt, portalOrigin, examOrigin,
  snapshot, artifactScan: scan, files: manifest,
  previewOrigins, deploymentAuthorized: false, backendCompatibilityVerified: false,
  limitation: "Candidate only. Provider-returned preview origins, current backend compatibility, approved identity and explicit cloud approval are required before any deployment.",
}, null, 2) + "\n");
console.log(`Prepared ${releaseId}: ${manifest.length} hashed files, Portal + Exam staging candidate. No cloud access or deployment.`);
