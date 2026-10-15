import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(label, command, args) {
  console.log(`[vendor-acceptance] START ${label}`);
  const child = spawnSync(command, args, {cwd: root, env: process.env, stdio: "inherit"});
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Vendor acceptance ${label} failed (${child.status ?? child.signal}).`);
  console.log(`[vendor-acceptance] PASS ${label}`);
}
if (!process.argv.includes("--skip-functions-build")) run("functions-build", "npm", ["--prefix", "functions", "run", "build"]);
// API direct-export probes warm many emulator workers. Fully stop that demo
// session before browser fan-out so those workers and fixture state cannot leak.
run("api-authority", "node", ["scripts/run-vendor-audit-health-api-emulator.mjs", "--capability-alignment", "--skip-functions-build"]);
run("browser-matrix", "node", ["scripts/run-vendor-audit-health-smoke-e2e.mjs", "--acceptance-matrix", "--skip-functions-build"]);
console.log("[vendor-acceptance] PASS API authority and 9/9 browser stages");
