import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../.github/workflows/frontend-ci-cd.yml", import.meta.url),
);

function readEventPaths(source, eventName) {
  const lines = source.split(/\r?\n/u);
  const eventStart = lines.findIndex((line) => line === `  ${eventName}:`);
  assert.notEqual(eventStart, -1, `${eventName} trigger must exist`);

  const pathsStart = lines.findIndex((line, index) => index > eventStart && line === "    paths:");
  assert.notEqual(pathsStart, -1, `${eventName} paths must exist`);

  const paths = [];
  for (let index = pathsStart + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  \S/u.test(line)) {
      break;
    }

    const match = line.match(/^      - "([^"]+)"$/u);
    if (match) {
      paths.push(match[1]);
    }
  }

  return paths;
}

function matchesPathFilter(path, filter) {
  const doubleStarMarker = "__DOUBLE_STAR__";
  const escaped = filter
    .replaceAll("**", doubleStarMarker)
    .replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll(doubleStarMarker, ".*");
  return new RegExp(`^${escaped}$`, "u").test(path);
}

test("push and pull-request triggers cover backend, rules, indexes, contracts, and gateway", async () => {
  const source = await readFile(workflowPath, "utf8");
  const pullRequestPaths = readEventPaths(source, "pull_request");
  const pushPaths = readEventPaths(source, "push");

  assert.deepEqual(pushPaths, pullRequestPaths);
  assert.equal(new Set(pushPaths).size, pushPaths.length, "trigger paths must be unique");

  const representatives = [
    "functions/src/index.ts",
    "functions/src/api/apiGateway.ts",
    "functions/src/api/apiGatewayHandlers.ts",
    "functions/src/apiRouteManifest.ts",
    "shared/contracts/apiDtos.d.ts",
    "tests/api-dto-contract.test.mjs",
    "tests/api-envelope-contract.test.mjs",
    "tests/backend-ci-validation.test.mjs",
    "tests/staging-deployment-pipeline.test.mjs",
    "tests/staging-smoke.test.mjs",
    "tests/production-promotion-separation.test.mjs",
    "tests/frontend-api-routing.test.mjs",
    "tests/portal-response-adapters.test.mjs",
    "docs/api_contract.md",
    "firestore.rules",
    "firestore.indexes.json",
    "storage.rules",
    "firebase.json",
    "package.json",
  ];

  for (const path of representatives) {
    assert.ok(
      pushPaths.some((filter) => matchesPathFilter(path, filter)),
      `${path} must trigger backend CI on push and pull request`,
    );
  }
});
