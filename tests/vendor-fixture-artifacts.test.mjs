import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, readdir, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {root} from "./helpers/vendor-action-inventory.mjs";
async function artifacts(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await artifacts(path));
    else if (/\.(?:js|html|css|json|map)$/u.test(path)) files.push([path, await readFile(path, "utf8")]);
  }
  return files;
}
test("production Vendor artifacts exclude fixture authority even when fixture mode is requested", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vendor-regression-artifacts-"));
  try {
    for (const dataMode of ["live", "fixture"]) {
      const out = join(directory, dataMode), env = {...process.env, NODE_ENV: "production", VITE_DATA_MODE: dataMode, VITE_API_BASE_URL: ""};
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync("node_modules/.bin/vite", ["build", "--mode", "production", "--outDir", out, "--emptyOutDir"],
        {cwd: join(root, "apps/vendor"), env, encoding: "utf8", timeout: 120000});
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const files = await artifacts(out), bytes = files.map(([, source]) => source).join("\n");
      assert.doesNotMatch(files.map(([path]) => path).join("\n"), /FixtureVendor|vendorLicenseRequestsStore|vendorDataset|vendorOperationsData/u);
      for (const marker of ["Riverdale Test Hub", "Delta Coaching Network", "Zenith Integrated Prep", "Meridian Public School"]) {
        assert.ok(!bytes.includes(marker), `fixture payload shipped in ${dataMode}: ${marker}`);
      }
      assert.match(bytes, /Notification authority unavailable/u);
      assert.match(bytes, /Captured Vendor command recovery/u);
      assert.match(bytes, /Loading commercial authority/u);
    }
  } finally { await rm(directory, {recursive: true, force: true}); }
});
