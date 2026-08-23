import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const authorityPath = join(
  rootDirectory,
  "apps/admin/src/features/tests/testTemplateAuthority.ts",
);
const pagePath = join(
  rootDirectory,
  "apps/admin/src/features/tests/TestTemplateManagementPage.tsx",
);
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

const [authoritySource, pageSource] = await Promise.all([
  readFile(authorityPath, "utf8"),
  readFile(pagePath, "utf8"),
]);
const {
  reconcileCreatedTemplate,
  reconcileLifecycleTemplate,
  reconcileUpdatedTemplate,
} = loadTypeScriptModule(authoritySource, authorityPath);

const createAuthority = {
  canonicalId: "canonical-template-001",
  id: "backend-template-001",
  version: 1,
};

test("create/reload reconciliation returns the exact reloaded authoritative record", () => {
  const reloadedTemplate = {
    ...createAuthority,
    templateName: "JEE authoritative template",
  };

  assert.equal(
    reconcileCreatedTemplate(createAuthority, [reloadedTemplate]),
    reloadedTemplate,
  );
});

test("create/reload reconciliation rejects a missing created ID", () => {
  assert.throws(
    () => reconcileCreatedTemplate(createAuthority, []),
    /did not return newly created template backend-template-001/,
  );
});

test("create/reload reconciliation rejects canonical identity drift", () => {
  assert.throws(
    () => reconcileCreatedTemplate(createAuthority, [{
      ...createAuthority,
      canonicalId: "different-canonical-id",
    }]),
    /different canonical ID/,
  );
});

test("create/reload reconciliation rejects version drift", () => {
  assert.throws(
    () => reconcileCreatedTemplate(createAuthority, [{
      ...createAuthority,
      version: 2,
    }]),
    /returned version 2.*create returned version 1/,
  );
});

test("update/reload reconciliation requires one exact version increment", () => {
  const updatedAuthority = {...createAuthority, version: 2};
  const reloadedTemplate = {
    ...updatedAuthority,
    templateName: "Updated authoritative template",
  };

  assert.equal(
    reconcileUpdatedTemplate(updatedAuthority, [reloadedTemplate], 1),
    reloadedTemplate,
  );
  assert.throws(
    () => reconcileUpdatedTemplate(updatedAuthority, [reloadedTemplate], 2),
    /returned version 2; expected 3/,
  );
});

test("lifecycle/reload reconciliation requires unchanged version and target status", () => {
  const publishedAuthority = {
    ...createAuthority,
    status: "ready",
  };
  const reloadedTemplate = {
    ...publishedAuthority,
    templateName: "Published authoritative template",
  };

  assert.equal(
    reconcileLifecycleTemplate(
      publishedAuthority,
      [reloadedTemplate],
      1,
      "ready",
    ),
    reloadedTemplate,
  );
  assert.throws(
    () => reconcileLifecycleTemplate(
      {...publishedAuthority, version: 2},
      [reloadedTemplate],
      1,
      "ready",
    ),
    /expected unchanged version 1/,
  );
  assert.throws(
    () => reconcileLifecycleTemplate(
      {...publishedAuthority, status: "archived"},
      [reloadedTemplate],
      1,
      "ready",
    ),
    /expected ready/,
  );
});

test("Admin create uses server identity and reload state without frontend ID generation", () => {
  assert.doesNotMatch(pageSource, /tmpl-\$\{/);
  assert.match(pageSource, /const createResult = await submitTemplateToApi/);
  assert.match(pageSource, /const reloadedTemplates = await fetchTemplatesFromApi\(\)/);
  assert.match(pageSource, /reconcileCreatedTemplate\(\s*createResult\.template,\s*reloadedTemplates/);
  assert.match(pageSource, /setTemplates\(reloadedTemplates\)/);
});

test("Admin edit sends expected version and reconciles the update reload", () => {
  assert.match(pageSource, /apiClient\.patch<AdminTestTemplateUpdateResult/);
  assert.match(pageSource, /`\/admin\/tests\/\$\{encodeURIComponent\(testId\)\}`/);
  assert.match(pageSource, /expectedVersion = nextRecord\.version/);
  assert.match(pageSource, /const updateResult = await updateTemplateInApi/);
  assert.match(pageSource, /reconcileUpdatedTemplate\(\s*updateResult\.template,\s*reloadedTemplates,\s*expectedVersion/);
});

test("Admin lifecycle uses distinct static routes and authoritative reloads", () => {
  assert.match(pageSource, /`\/admin\/tests\/\$\{encodeURIComponent\(testId\)\}\/publish`/);
  assert.match(pageSource, /`\/admin\/tests\/\$\{encodeURIComponent\(testId\)\}\/archive`/);
  assert.match(pageSource, /adaptAdminTestTemplatePublishResult/);
  assert.match(pageSource, /adaptAdminTestTemplateArchiveResult/);
  assert.match(pageSource, /const publishResult = await publishTemplateInApi/);
  assert.match(pageSource, /const archiveResult = await archiveTemplateInApi/);
  assert.match(pageSource, /reconcileLifecycleTemplate\(/);
  assert.doesNotMatch(pageSource, /updateTemplateLifecycle/);
  assert.doesNotMatch(pageSource, />\s*Deprecate\s*</);
});
