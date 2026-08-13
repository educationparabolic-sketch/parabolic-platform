import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const apiDirectory = path.join(repositoryRoot, "functions", "src", "api");
const productionVerificationPattern =
  /getFirebaseAdminApp\(\)\.auth\(\)\.verifyIdToken\(idToken, true\)/gu;
const unreviewedVerificationPattern =
  /getFirebaseAdminApp\(\)\.auth\(\)\.verifyIdToken\(idToken\)/gu;

test("every production Firebase ID-token verifier checks revocation", async () => {
  const directoryEntries = await readdir(apiDirectory, {withFileTypes: true});
  const sourceFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(apiDirectory, entry.name))
    .sort();
  const verificationSites = [];
  const unreviewedSites = [];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    const productionMatches = source.match(productionVerificationPattern) ?? [];
    const unreviewedMatches = source.match(unreviewedVerificationPattern) ?? [];

    verificationSites.push(
      ...productionMatches.map(() => path.relative(repositoryRoot, sourceFile)),
    );
    unreviewedSites.push(
      ...unreviewedMatches.map(() => path.relative(repositoryRoot, sourceFile)),
    );
  }

  assert.deepEqual(unreviewedSites, []);
  assert.equal(
    verificationSites.length,
    38,
    `Expected 38 revocation-aware production verifiers, found ` +
      `${verificationSites.length}.`,
  );
});
