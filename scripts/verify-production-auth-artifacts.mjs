import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scanReleaseArtifacts } from "./frontend-cicd/scan-release-artifacts.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const projectId = "demo-parabolic-test";

const releaseBuildEnvironment = {
  VITE_ADMIN_SETTINGS_INSTITUTE_ID: "",
  VITE_API_BASE_URL: "",
  VITE_CDN_BASE_URL: "https://cdn.release.example.test",
  VITE_DATA_MODE: "live",
  VITE_EXAM_BASE_URL: "https://exam.release.example.test",
  VITE_EXAM_DEV_MOCK_ENTRY: "false",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_APP_ID: "1:123456789:web:bwm009release",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parabolic-test.invalid",
  VITE_FIREBASE_AUTH_EMULATOR_URL: "",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  VITE_PORTAL_BASE_URL: "https://portal.release.example.test",
  VITE_VENDOR_BASE_URL: "https://vendor.release.example.test",
};

function buildPortal(portal, basePath) {
  console.log(`\n[production-auth-artifacts] Build ${portal} production artifact`);
  const result = spawnSync(
    npmExecutable,
    ["--prefix", `apps/${portal}`, "run", "build"],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ...releaseBuildEnvironment,
        VITE_BASE_PATH: basePath,
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${portal} production build failed with exit code ${result.status ?? 1}`);
  }
}

for (const [portal, basePath] of [
  ["admin", "/admin/"],
  ["student", "/student/"],
  ["exam", "/"],
  ["vendor", "/"],
]) {
  buildPortal(portal, basePath);
}

const result = await scanReleaseArtifacts();
console.log(
  `\n[production-auth-artifacts] PASS: ${result.filesScanned} files across ` +
    `${result.rootsScanned} release roots contain no local credentials or fallback code.`,
);
