import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const contractPath = join(rootDirectory, "shared/types/frontendEnvironment.ts");
const servicePath = join(rootDirectory, "shared/services/frontendEnvironment.ts");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const evaluate = new Function("exports", "module", transpiled);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

async function listPortalSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const repositoryPath = relative(rootDirectory, path).replaceAll("\\", "/");

    if (repositoryPath.includes("/dist/") || repositoryPath.includes("/node_modules/")) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await listPortalSourceFiles(path)));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

test("frontend data mode enables fixtures only through the explicit fixture value", async () => {
  const source = await readFile(contractPath, "utf8");
  const { resolveFrontendDataMode } = loadTypeScriptModule(source, contractPath);

  assert.equal(resolveFrontendDataMode("fixture"), "fixture");
  assert.equal(resolveFrontendDataMode(" FIXTURE "), "fixture");
  assert.equal(resolveFrontendDataMode("live"), "live");

  for (const invalidValue of [undefined, null, "", "mock", "test", true, 1]) {
    assert.equal(resolveFrontendDataMode(invalidValue), "live");
  }
});

test("portal fixture/live selection has no hostname gate", async () => {
  const portalFiles = await listPortalSourceFiles(join(rootDirectory, "apps"));

  for (const path of portalFiles) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /window\.location\.hostname/u,
      `${relative(rootDirectory, path)} must use the shared explicit data mode`,
    );
  }

  const serviceSource = await readFile(servicePath, "utf8");
  assert.match(serviceSource, /readEnvValue\("VITE_DATA_MODE"\)/u);
  assert.match(serviceSource, /dataMode === "live"/u);
  assert.match(serviceSource, /dataMode === "fixture"/u);
});
