import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const projectId = "demo-parabolic-test";
// Keep browser build bytes isolated from concurrent workspace production builds.
const artifactParent = join(repositoryRoot, ".firebase");
mkdirSync(artifactParent, { recursive: true });
const artifactRoot = mkdtempSync(join(artifactParent, "vendor-intelligence-smoke-"));
const hostingRoot = join(artifactRoot, "vendor");
// Firebase requires rules/source paths inside the config's project directory.
// The root configuration is untouched; Hosting bytes are disposable.
const configPath = join(repositoryRoot, `.firebase-intelligence-smoke-${basename(artifactRoot)}.json`);
const config = JSON.parse(readFileSync(join(repositoryRoot, "firebase.json"), "utf8"));
config.hosting = config.hosting.filter((entry) => entry.target === "vendor").map((entry) => ({ ...entry, public: relative(repositoryRoot, hostingRoot) }));
writeFileSync(configPath, JSON.stringify(config), { flag: "wx" });
const environment = {
  ...process.env,
  CI: "true",
  DEBUG: "",
  FUNCTIONS_DISCOVERY_TIMEOUT: "60",
  NODE_ENV: "test",
  PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  PARABOLIC_E2E_BASE_URL: "http://127.0.0.1:5000",
  VITE_API_BASE_URL: "",
  VITE_BASE_PATH: "/",
  VITE_DATA_MODE: "live",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm037intelligence",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
};

function run(command, args) {
  console.log(`[vendor-intelligence-smoke] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: command === "npm" && args.includes("apps/vendor")
      ? { ...environment, NODE_ENV: "production" } : environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status ?? 1}`);
}

try {
  run("npm", ["--prefix", "apps/vendor", "run", "build", "--", "--outDir", hostingRoot]);
  if (readdirSync(join(hostingRoot, "assets")).some((name) => /FixtureVendor(Intelligence|Overview)|vendorIntelligenceDataset/u.test(name))) {
    throw new Error("Production intelligence build contains a fixture showcase chunk.");
  }
  if (!process.argv.includes("--skip-functions-build")) {
    run("npm", ["--prefix", "functions", "run", "build"]);
  }
  run("firebase", ["--version"]);
  run("firebase", [
  "emulators:exec",
  "--config",
  configPath,
  "--project",
  projectId,
  "--only",
  "auth,firestore,functions:apiV1,hosting:vendor",
  process.argv.includes("--acceptance")
    ? "npm run test:e2e:vendor-intelligence-acceptance"
    : "npm run test:e2e:vendor-intelligence-smoke",
  ]);
} finally {
  rmSync(configPath, { force: true });
  rmSync(artifactRoot, { recursive: true, force: true });
}
