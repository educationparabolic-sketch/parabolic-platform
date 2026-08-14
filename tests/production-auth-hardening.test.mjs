import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

async function readRepositoryFile(path) {
  return readFile(join(rootDirectory, path), "utf8");
}

function loadTypeScriptModule(source, sourcePath) {
  const loadedModule = { exports: {} };
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const evaluate = new Function("exports", "module", output);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

test("all rendered login forms start without local credentials", async () => {
  for (const portal of ["admin", "student", "vendor"]) {
    const source = await readRepositoryFile(`apps/${portal}/src/App.tsx`);
    assert.match(source, /const \[email, setEmail\] = useState\(""\);/u);
    assert.match(source, /const \[password, setPassword\] = useState\(""\);/u);
    assert.doesNotMatch(source, /demo-password|Parabolic#Test115|@parabolic\.local/u);
  }
});

test("synthetic authentication requires both development mode and exact loopback", async () => {
  const [providerSource, environmentSource, runnerSource, browserSpecSource] = await Promise.all([
    readRepositoryFile("shared/services/authProvider.tsx"),
    readRepositoryFile("shared/services/browserRuntimeEnvironment.ts"),
    readRepositoryFile("scripts/run-browser-token-storage-e2e.mjs"),
    readRepositoryFile("tests/e2e/browser-token-storage.spec.mjs"),
  ]);
  const environmentPath = join(
    rootDirectory,
    "shared/services/browserRuntimeEnvironment.ts",
  );
  const { isLoopbackHostname } = loadTypeScriptModule(environmentSource, environmentPath);

  assert.match(providerSource, /import\.meta\.env\.MODE === "development"/u);
  assert.match(providerSource, /isLoopbackHostname\(window\.location\.hostname\)/u);
  assert.match(providerSource, /: \(\) => null;/u);
  assert.doesNotMatch(providerSource, /function isLocalAuthFallbackEnabled/u);

  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("LOCALHOST"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("127.0.0.2"), false);
  assert.equal(isLoopbackHostname("localhost.example.test"), false);
  assert.equal(isLoopbackHostname("portal.example.test"), false);

  assert.equal(runnerSource.split('"--mode",\n  "development"').length - 1, 2);
  assert.match(browserSpecSource, /getByLabel\("Password"\)\.fill\("demo-password"\)/u);
});
