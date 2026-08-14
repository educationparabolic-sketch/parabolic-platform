import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath, dependencies = {}) {
  const loadedModule = { exports: {} };
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const evaluate = new Function("exports", "module", "require", output);
  evaluate(loadedModule.exports, loadedModule, (specifier) => dependencies[specifier] ?? {});
  return loadedModule.exports;
}

test("legacy browser-token migration is delete-only and clears host plus parent-domain copies", async () => {
  const sourcePath = join(rootDirectory, "shared/services/legacyBrowserTokenStorage.ts");
  const environmentPath = join(rootDirectory, "shared/services/browserRuntimeEnvironment.ts");
  const [source, environmentSource] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(environmentPath, "utf8"),
  ]);
  const environmentModule = loadTypeScriptModule(environmentSource, environmentPath);
  const { clearLegacyBrowserTokenCopies } = loadTypeScriptModule(source, sourcePath, {
    "./browserRuntimeEnvironment": environmentModule,
  });
  const removedStorageKeys = [];
  const cookieAssignments = [];
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  globalThis.window = {
    location: { hostname: "admin.example.test" },
    localStorage: {
      removeItem(key) {
        removedStorageKeys.push(key);
      },
    },
  };
  globalThis.document = {
    set cookie(value) {
      cookieAssignments.push(value);
    },
  };

  try {
    clearLegacyBrowserTokenCopies();
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }

  assert.deepEqual(removedStorageKeys, [
    "parabolic.crossPortalAuthSession.v1",
    "parabolic.localAuthToken",
  ]);
  assert.equal(cookieAssignments.length, 2);
  assert.match(cookieAssignments[0], /^parabolic_cross_portal_auth_v1=;/u);
  assert.match(cookieAssignments[0], /Max-Age=0/u);
  assert.doesNotMatch(cookieAssignments[0], /Domain=/u);
  assert.match(cookieAssignments[1], /Domain=\.example\.test/u);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\(/u);
  assert.doesNotMatch(source, /document\.cookie\s*=\s*[^\n]*(?:idToken|token)/iu);
});

test("shared authentication has no application-owned bearer-token persistence or restore path", async () => {
  const authProviderPath = join(rootDirectory, "shared/services/authProvider.tsx");
  const apiClientPath = join(rootDirectory, "shared/services/apiClient.ts");
  const retiredBridgePath = join(rootDirectory, "shared/services/crossPortalAuthSession.ts");
  const [authProviderSource, apiClientSource] = await Promise.all([
    readFile(authProviderPath, "utf8"),
    readFile(apiClientPath, "utf8"),
  ]);

  assert.doesNotMatch(authProviderSource, /localStorage\.(?:setItem|getItem)\(/u);
  assert.doesNotMatch(authProviderSource, /document\.cookie/u);
  assert.doesNotMatch(authProviderSource, /persistCrossPortalAuthSession|readCrossPortalAuthSession/u);
  assert.match(authProviderSource, /clearLegacyBrowserTokenCopies\(\)/u);
  assert.doesNotMatch(apiClientSource, /crossPortalAuthSession|readCrossPortalIdToken/u);
  assert.match(apiClientSource, /if \(!currentUser\) \{\s*return null;/u);
  await assert.rejects(access(retiredBridgePath, constants.F_OK), { code: "ENOENT" });

  for (const portal of ["admin", "student", "exam", "vendor"]) {
    const mainSource = await readFile(join(rootDirectory, `apps/${portal}/src/main.tsx`), "utf8");
    assert.match(mainSource, /<AuthProvider portalKey=/u, `${portal} must use the shared provider`);
  }
});
