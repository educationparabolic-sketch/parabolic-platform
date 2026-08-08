import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const appsDirectory = join(rootDirectory, "apps");
const vendorCalibrationPath = join(
  rootDirectory,
  "apps/vendor/src/features/calibration/vendorCalibrationDataset.ts",
);
const supportDatasetPath = join(rootDirectory, "apps/admin/src/features/support/supportDataset.ts");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

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

function collectCatchBlocks(source, sourcePath) {
  const sourceFile = typescript.createSourceFile(
    sourcePath,
    source,
    typescript.ScriptTarget.Latest,
    true,
  );
  const catches = [];

  function visit(node) {
    if (typescript.isCatchClause(node)) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      catches.push({
        line: location.line + 1,
        source: node.getText(sourceFile),
      });
    }

    if (
      typescript.isCallExpression(node) &&
      typescript.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "catch"
    ) {
      const callback = node.arguments[0];
      if (callback) {
        const location = sourceFile.getLineAndCharacterOfPosition(callback.getStart(sourceFile));
        catches.push({
          line: location.line + 1,
          source: callback.getText(sourceFile),
        });
      }
    }

    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
  return catches;
}

test("portal catches do not substitute fixtures or fabricated successes in live mode", async () => {
  const files = await listPortalSourceFiles(appsDirectory);
  const forbiddenCatchPatterns = [
    /\bset[A-Za-z0-9_]*\([\s\S]*?\b(?:FALLBACK_[A-Z0-9_]*|[A-Z0-9_]*_FIXTURES|QUESTION_BANK|TEMPLATE_DETAILS|LIVE_RUNS|LIVE_MONITOR_ROWS)\b/u,
    /\breturn\s+(?:FALLBACK_[A-Z0-9_]*|[A-Z0-9_]*_FIXTURES|QUESTION_BANK|TEMPLATE_DETAILS|LIVE_RUNS|LIVE_MONITOR_ROWS)\b/u,
    /Falling back to deterministic|Showing (?:a )?practice|Showing the sample/u,
    /engineSource:\s*"local-fallback"/u,
    /computeLocalSimulation\(/u,
  ];

  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const catchBlock of collectCatchBlocks(source, path)) {
      const usesFixtureFallback = forbiddenCatchPatterns.some((pattern) =>
        pattern.test(catchBlock.source),
      );
      const isExplicitFixtureOnly =
        /if\s*\(\s*!shouldUseFixtureData\(\)\s*\)\s*\{\s*throw\s+/u.test(catchBlock.source);

      assert.ok(
        !usesFixtureFallback || isExplicitFixtureOnly,
        `${relative(rootDirectory, path)}:${catchBlock.line} has an unguarded catch fallback`,
      );
    }
  }
});

test("local support and Vendor calibration fallbacks are explicit fixture-mode only", async () => {
  const [supportSource, vendorSource] = await Promise.all([
    readFile(supportDatasetPath, "utf8"),
    readFile(vendorCalibrationPath, "utf8"),
  ]);

  assert.match(
    supportSource,
    /const fallbackTickets = shouldUseFixtureData\(\) \? FALLBACK_TICKETS : \[\]/u,
  );
  assert.equal(
    vendorSource.match(/if \(!shouldUseFixtureData\(\)\) \{\s*throw error;\s*\}/gu)?.length,
    2,
  );
  const vendorFallbackCatches = collectCatchBlocks(vendorSource, vendorCalibrationPath).filter(
    (catchBlock) =>
      /computeLocalSimulation\(|engineSource:\s*"local-fallback"/u.test(catchBlock.source),
  );
  assert.equal(vendorFallbackCatches.length, 2);
  for (const catchBlock of vendorFallbackCatches) {
    assert.match(
      catchBlock.source,
      /if\s*\(\s*!shouldUseFixtureData\(\)\s*\)\s*\{\s*throw error;\s*\}/u,
    );
  }
});
