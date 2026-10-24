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
  ["fixture-payload", 'const marker="PARABOLIC_FIXTURE_PAYLOAD:question-bank";'],
  ["local-auth-fallback", 'const fallbackPassword="demo-password";'],
  ["local-auth-fallback", 'const vendorFallbackPassword="Parabolic#Test115";'],
  ["local-auth-fallback", 'const fallbackIssuer="local-auth-fallback";'],
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

for (const [name, source] of [
  ["chunk.MAP", "{}"], ["renamed.bin", '{"version":3,"sourcesContent":["private source"]}'],
  ["escaped.png", '{"version":3,"sources\\u0043ontent":["private source"]}'],
  ["renamed.mjs", 'export default {version:3,sourcesContent:["private source"]};'],
  ["no-source.dat", '{"version":3,"sources":["private.ts"],"mappings":"AAAA"}'],
  ["index.js", "//# sourceMappingURL=chunk.js.map"],
  ["index.css", "/*# sourceMappingURL=data:application/json;base64,e30= */"],
]) test(`rejects public source map in ${name}`, async () => {
  await withArtifact({[name]: source}, async rootDirectory => {
    await assert.rejects(scanReleaseArtifacts({artifactRoots: ["dist"], rootDirectory}), /public-source-map/u);
  });
});
test("rejects symlinks at root, parent and file boundaries", async () => {
  const {symlink} = await import("node:fs/promises");
  await withArtifact({"app.js": "export const safe = true;"}, async rootDirectory => {
    await symlink(join(rootDirectory, "dist"), join(rootDirectory, "alias"));
    await assert.rejects(scanReleaseArtifacts({artifactRoots: ["alias"], rootDirectory}), /not a directory/u);
    await symlink(rootDirectory, join(rootDirectory, "parent-alias"));
    await assert.rejects(scanReleaseArtifacts({artifactRoots: ["parent-alias/dist"], rootDirectory}), /not a directory/u);
    await symlink(join(rootDirectory, "dist/app.js"), join(rootDirectory, "dist/alias.js"));
    await assert.rejects(scanReleaseArtifacts({artifactRoots: ["dist"], rootDirectory}), /symbolic link/u);
  });
});
