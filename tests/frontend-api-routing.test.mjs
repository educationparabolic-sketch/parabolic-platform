import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const appSourceRoots = ["admin", "student", "exam", "vendor"].map((portal) =>
  path.join(repositoryRoot, "apps", portal, "src"),
);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
    } else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test("portal API clients default to the same-origin /api/v1 gateway", async () => {
  const apiClientSource = await readFile(
    path.join(repositoryRoot, "shared/services/apiClient.ts"),
    "utf8",
  );
  const portalIntegrationSource = await readFile(
    path.join(repositoryRoot, "shared/services/portalIntegration.ts"),
    "utf8",
  );

  assert.match(
    apiClientSource,
    /export const SAME_ORIGIN_API_BASE_URL = "\/api\/v1";/,
  );
  assert.match(
    apiClientSource,
    /if \(!envBaseUrl \|\| envBaseUrl\.trim\(\)\.length === 0\) \{\s*return SAME_ORIGIN_API_BASE_URL;\s*\}/,
  );
  assert.doesNotMatch(portalIntegrationSource, /baseUrl\s*:/);

  const appSourceFiles = (await Promise.all(appSourceRoots.map(listSourceFiles))).flat();
  const directTransportCallers = [];
  const portalClientKeys = new Set();

  for (const sourceFile of appSourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    if (/\bfetch\s*\(|\baxios\s*\(|\bXMLHttpRequest\b|\bhttpsCallable\s*\(/.test(source)) {
      directTransportCallers.push(path.relative(repositoryRoot, sourceFile));
    }

    for (const match of source.matchAll(/getPortalApiClient\("(admin|student|exam|vendor)"\)/g)) {
      portalClientKeys.add(match[1]);
    }
  }

  assert.deepEqual(directTransportCallers, []);
  assert.deepEqual([...portalClientKeys].sort(), ["admin", "exam", "student", "vendor"]);
});
