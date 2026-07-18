import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

const packages = [
  { name: "Admin", path: "apps/admin" },
  { name: "Student", path: "apps/student" },
  { name: "Exam", path: "apps/exam" },
  { name: "Vendor", path: "apps/vendor" },
  { name: "Functions", path: "functions" },
];

const checks = [
  ...packages.map((packageDefinition) => ({
    ...packageDefinition,
    script: "lint",
  })),
  ...packages.map((packageDefinition) => ({
    ...packageDefinition,
    script: "build",
  })),
];

for (const check of checks) {
  const label = `${check.name} ${check.script}`;
  console.log(`\n[workspace-verify] Running ${label}`);

  const result = spawnSync(npmExecutable, ["run", check.script], {
    cwd: resolve(repositoryRoot, check.path),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[workspace-verify] Unable to start ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[workspace-verify] FAILED ${label} with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }

  console.log(`[workspace-verify] Passed ${label}`);
}

console.log(`\n[workspace-verify] PASS: ${checks.length} lint/build checks completed.`);
