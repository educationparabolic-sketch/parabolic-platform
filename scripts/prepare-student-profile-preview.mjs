import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const publicConfig = Object.fromEntries([...readFileSync("apps/student/.env.local", "utf8").matchAll(/^([A-Z][A-Z0-9_]+)=(.*)$/gm)]
  .filter(([, key]) => key.startsWith("VITE_FIREBASE_"))
  .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, "")]));
assert.equal(publicConfig.VITE_FIREBASE_PROJECT_ID, "parabolic-dev");
assert.equal(publicConfig.VITE_FIREBASE_AUTH_DOMAIN, "parabolic-dev.firebaseapp.com");
assert.equal(publicConfig.VITE_FIREBASE_APP_ID, "1:599057612276:web:961d3b3452dbaac8608da1");
assert.match(publicConfig.VITE_FIREBASE_API_KEY, /^AIza[A-Za-z0-9_-]{20,}$/);
const mapping = JSON.parse(readFileSync(".firebaserc", "utf8"));
assert.deepEqual(mapping.targets["parabolic-dev"].hosting.portal, ["parabolic-dev"]);
const commit = spawnSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"});
assert.equal(commit.status, 0);
const builtAt = new Date().toISOString();
const releaseId = `bwm042-preview-${builtAt.replace(/\D/g, "").slice(0, 14)}`;
const environment = {...process.env, ...publicConfig, NODE_ENV: "production",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "", VITE_API_BASE_URL: "", VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false", VITE_PORTAL_BASE_URL: "https://parabolic-dev.web.app",
  VITE_EXAM_BASE_URL: "https://parabolic-dev-40ec9.web.app", VITE_VENDOR_BASE_URL: "https://parabolic-dev-vendor.web.app",
  VITE_RELEASE_ID: releaseId, VITE_RELEASE_COMMIT_SHA: commit.stdout.trim(), VITE_RELEASE_BUILT_AT: builtAt};
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {cwd: root, env: {...environment, ...extra}, stdio: "inherit"});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}
for (const portal of ["admin", "student"]) run("npm", ["--prefix", `apps/${portal}`, "run", "build"], {VITE_BASE_PATH: `/${portal}/`});
run(process.execPath, ["scripts/frontend-cicd/prepare-portal-hosting.mjs"]);
function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
const artifact = ".firebase/hosting/portal";
const manifest = files(artifact).sort().map((path) => {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  assert.doesNotMatch(text, /demo-parabolic-test|demo-api-key|http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
  return {path: path.slice(artifact.length + 1), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length};
});
mkdirSync("test-results/bwm042-preview", {recursive: true});
writeFileSync("test-results/bwm042-preview/artifact-manifest.json", JSON.stringify({project: "parabolic-dev", target: "portal", releaseId, commit: commit.stdout.trim(), dirtyWorkspace: true, builtAt, files: manifest}, null, 2) + "\n");
console.log(`Prepared ${releaseId}: parabolic-dev / portal, production compilation, live API mode, ${manifest.length} hashed files. No deployment performed.`);
assert.equal(resolve(artifact), resolve(root, ".firebase/hosting/portal"));
