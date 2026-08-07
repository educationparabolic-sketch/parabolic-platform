import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_ARTIFACT_ROOTS,
  parseArtifactScanArguments,
  ReleaseArtifactScanError,
  scanReleaseArtifacts,
} from "../scripts/frontend-cicd/scan-release-artifacts.mjs";

async function withArtifact(files, callback) {
  const directory = await mkdtemp(join(tmpdir(), "parabolic-artifact-scan-"));
  const artifactRoot = join(directory, "dist");
  await mkdir(artifactRoot);
  try {
    for (const [name, source] of Object.entries(files)) {
      await writeFile(join(artifactRoot, name), source, "utf8");
    }
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts a release bundle without prohibited artifact values", async () => {
  await withArtifact(
    {
      "index.html": '<input type="password" value=""><script src="/assets/app.js"></script>',
      "app.js":
        'const environment={api:"https://portal.example.com"}; const password=user.password;',
    },
    async (rootDirectory) => {
      const result = await scanReleaseArtifacts({ artifactRoots: ["dist"], rootDirectory });
      assert.equal(result.filesScanned, 2);
      assert.equal(result.rootsScanned, 1);
    },
  );
});

const prohibitedArtifacts = [
  ["loopback-localhost-root", 'const api="http://localhost";'],
  ["loopback-localhost", 'const api="http://localhost:5001/api";'],
  ["loopback-127.0.0.1", 'const api="http://127.0.0.1:5001/api";'],
  ["dev-mock-token", 'const token="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYifQ.signature";'],
  ["dev-mock-token", 'const mockToken="developer-token-value";'],
  ["fixture-mode", "const settings={fixtureMode:true};"],
  ["fixture-mode", 'const settings={"mode":"fixture"};'],
  ["prefilled-password-object", 'const credentials={password:"do-not-ship"};'],
  ["prefilled-password-object", 'const credentials={"password":"do-not-ship"};'],
  ["prefilled-password-assignment", 'password="do-not-ship";'],
  ["prefilled-password-input", '<input value="do-not-ship" type="password">'],
  ["prefilled-password-query", 'const url="/login?password=do-not-ship";'],
];

for (const [policy, source] of prohibitedArtifacts) {
  test(`rejects ${policy} without echoing the prohibited value`, async () => {
    await withArtifact({ "app.js": source }, async (rootDirectory) => {
      await assert.rejects(
        () => scanReleaseArtifacts({ artifactRoots: ["dist"], rootDirectory }),
        (error) => {
          assert.ok(error instanceof ReleaseArtifactScanError);
          assert.match(error.message, new RegExp(`violates ${policy.replaceAll(".", "\\.")}`, "u"));
          assert.doesNotMatch(error.message, /do-not-ship|developer-token-value|eyJhbGci/iu);
          return true;
        },
      );
    });
  });
}

test("fails closed when a release root is missing or empty", async () => {
  await withArtifact({}, async (rootDirectory) => {
    await assert.rejects(
      () => scanReleaseArtifacts({ artifactRoots: ["dist", "missing"], rootDirectory }),
      (error) => {
        assert.ok(error instanceof ReleaseArtifactScanError);
        assert.match(error.message, /dist contains no scannable release files/u);
        assert.match(error.message, /missing is missing/u);
        return true;
      },
    );
  });
});

test("parses default and explicit release roots and rejects malformed CLI input", () => {
  assert.deepEqual(parseArtifactScanArguments(["--scan"]), DEFAULT_ARTIFACT_ROOTS);
  assert.deepEqual(parseArtifactScanArguments(["--scan", "--root", "dist-a", "--root", "dist-b"]), [
    "dist-a",
    "dist-b",
  ]);
  assert.throws(() => parseArtifactScanArguments([]), /scan mode is required/u);
  assert.throws(() => parseArtifactScanArguments(["--scan", "--root"]), /artifact roots must use/u);
});
