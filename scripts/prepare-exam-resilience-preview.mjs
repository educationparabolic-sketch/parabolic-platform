import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {scanReleaseArtifacts} from "./frontend-cicd/scan-release-artifacts.mjs";

// Local preparation only: no cloud SDK, account access, install or deployment.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
const reviewOnly = args[0] === "--review";
if (reviewOnly) args.shift();
else assert.equal(process.env.BWM046_APPROVED_STAGING, "parabolic-dev");
assert.equal(args.length, 4, "Supply explicit --portal-origin and --exam-origin.");
const values = new Map();
for (let i = 0; i < args.length; i += 2) {
  assert.ok(["--portal-origin", "--exam-origin"].includes(args[i]) && !values.has(args[i]));
  values.set(args[i], args[i + 1]);
}
function origin(key, site) {
  const value = values.get(key), url = new URL(value);
  assert.equal(url.origin, value); assert.equal(url.protocol, "https:"); assert.equal(url.port, "");
  if (reviewOnly) assert.equal(url.hostname, `${site}.web.app`);
  else assert.match(url.hostname, new RegExp(`^${site}--bwm046-resilience-[0-9]{8}-[a-z0-9-]+\\.web\\.app$`));
  return value;
}
const portalOrigin = origin("--portal-origin", "parabolic-dev");
const examOrigin = origin("--exam-origin", "parabolic-dev-40ec9");
const mapping = JSON.parse(readFileSync(".firebaserc", "utf8"));
assert.deepEqual(mapping.targets["parabolic-dev"].hosting.portal, ["parabolic-dev"]);
assert.deepEqual(mapping.targets["parabolic-dev"].hosting.exam, ["parabolic-dev-40ec9"]);
const publicConfig = Object.fromEntries([...readFileSync("apps/student/.env.local", "utf8")
  .matchAll(/^(VITE_FIREBASE_[A-Z0-9_]+)=(.*)$/gm)]
  .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, "")]));
assert.equal(publicConfig.VITE_FIREBASE_PROJECT_ID, "parabolic-dev");
assert.equal(publicConfig.VITE_FIREBASE_AUTH_DOMAIN, "parabolic-dev.firebaseapp.com");
assert.match(publicConfig.VITE_FIREBASE_API_KEY, /^AIza[A-Za-z0-9_-]{20,}$/);
const git = spawnSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}); assert.equal(git.status, 0);
const builtAt = new Date().toISOString(), commit = git.stdout.trim();
const releaseId = `bwm046-${reviewOnly ? "review" : "candidate"}-${builtAt.replace(/\D/g, "").slice(0, 14)}`;
const out = resolve("test-results/bwm046-public"), snapshot = resolve(out, releaseId);
mkdirSync(snapshot, {recursive: true});
const env = {...process.env, ...publicConfig, NODE_ENV: "production", VITE_DATA_MODE: "live",
  VITE_API_BASE_URL: "", VITE_EXAM_DEV_MOCK_ENTRY: "false", VITE_FIREBASE_AUTH_EMULATOR_URL: "",
  VITE_PORTAL_BASE_URL: portalOrigin, VITE_EXAM_BASE_URL: examOrigin,
  VITE_VENDOR_BASE_URL: "https://parabolic-dev-vendor.web.app", VITE_RELEASE_ID: releaseId,
  VITE_RELEASE_COMMIT_SHA: commit, VITE_RELEASE_BUILT_AT: builtAt};
function run(executable, commandArgs, extra = {}) {
  const result = spawnSync(executable, commandArgs, {env: {...env, ...extra}, stdio: "inherit"});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} failed`);
}
for (const app of ["admin", "student", "exam"]) run("npm", ["--prefix", `apps/${app}`, "run", "build"],
  {VITE_BASE_PATH: app === "exam" ? "/" : `/${app}/`});
run(process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
const artifactScan = await scanReleaseArtifacts({artifactRoots: [".firebase/hosting/portal", "apps/exam/dist"]});
cpSync(".firebase/hosting/portal", resolve(snapshot, "portal"), {recursive: true});
cpSync("apps/exam/dist", resolve(snapshot, "exam"), {recursive: true});
function filesBelow(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(item => item.isDirectory()
    ? filesBelow(`${directory}/${item.name}`) : [`${directory}/${item.name}`]);
}
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const files = ["portal", "exam"].flatMap(app => filesBelow(`${snapshot}/${app}`)).sort().map(path => {
  const bytes = readFileSync(path);
  assert.doesNotMatch(bytes.toString("utf8"), /demo-parabolic-test|demo-api-key/);
  return {path: path.slice(snapshot.length + 1), bytes: bytes.length, sha256: digest(path)};
});
const source = resolve(snapshot, "functions-source"); mkdirSync(source, {recursive: true});
const backendFiles = [...filesBelow("functions/lib").filter(path => !path.startsWith("functions/lib/tests/")),
  "functions/package.json", "functions/package-lock.json"];
const backendHashes = {};
for (const path of backendFiles) {
  const relative = path.slice("functions/".length), target = resolve(source, relative);
  mkdirSync(resolve(target, ".."), {recursive: true}); cpSync(path, target);
  backendHashes[relative] = digest(target);
}
const exports = ["apiV1", "examStart", "examSessionEntry", "examSessionActivate", "examSessionAnswers",
  "examSessionSubmit", "studentDashboard", "studentPerformance", "studentInsights"];
writeFileSync(resolve(out, "backend-review-candidate.json"), JSON.stringify({project: "parabolic-dev",
  releaseId, commit, builtAt, dirtyWorkspace: true, source, files: backendHashes, exports, deploymentAuthorized: false,
  backendCompatibilityVerified: false, limitation: "Env-less local snapshot; fresh candidate-specific approval, runtime/source rollback preflight and compatibility qualification required before upload."}, null, 2));
writeFileSync(resolve(out, "preview-candidate.json"), JSON.stringify({project: "parabolic-dev", releaseId,
  commit, builtAt, dirtyWorkspace: true, portalOrigin, examOrigin, snapshot, files, artifactScan,
  reviewOnly, previewOrigins: !reviewOnly, deploymentAuthorized: !reviewOnly,
  backendCompatibilityVerified: false, targets: {portal: "parabolic-dev", exam: "parabolic-dev-40ec9"},
  limitation: reviewOnly ? "Review only; never upload these canonical-origin artifacts. Rebuild for actual provider preview origins after approval."
    : "Backend compatibility and exact upload bytes still require qualification before public acceptance."}, null, 2));
const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting;
writeFileSync(resolve(out, "firebase.preview.json"), JSON.stringify({hosting: ["portal", "exam"].map(target => {
  const definition = hosting.find(item => item.target === target); assert.ok(definition);
  return {...definition, public: `${releaseId}/${target}`};
})}, null, 2));
writeFileSync(resolve(out, "firebase.backend.json"), JSON.stringify({functions: [{
  source: `${releaseId}/functions-source`, codebase: "default", disallowLegacyRuntimeConfig: true,
  ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"]}]}, null, 2));
writeFileSync(resolve(out, ".firebaserc"), JSON.stringify({targets: {"parabolic-dev": mapping.targets["parabolic-dev"]}}, null, 2));
for (const target of ["portal", "exam"]) {
  mkdirSync(resolve(out, "bootstrap", target), {recursive: true});
  writeFileSync(resolve(out, "bootstrap", target, "index.html"), "<!doctype html><title>Preview qualification pending</title><p>Preview qualification pending.</p>\n");
}
writeFileSync(resolve(out, "firebase.bootstrap.json"), JSON.stringify({hosting: ["portal", "exam"].map(target => ({
  target, public: `bootstrap/${target}`, headers: [{source: "**", headers: [{key: "Cache-Control", value: "no-store"}]}],
}))}, null, 2));
console.log(`Prepared ${releaseId}: ${files.length} frontend and ${backendFiles.length} env-less backend files. No cloud action.`);
