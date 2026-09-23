import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("canonical interventions are advisory, atomic, and replayable", async () => {
  const [service, auditTypes] = await Promise.all([
    read("functions/src/services/interventionRecommendations.ts"),
    read("functions/src/types/audit.ts"),
  ]);

  assert.match(service, /recommendationType === "remedial_test"/u);
  assert.match(service, /recommendationType === "student_message"/u);
  assert.match(service, /advisoryOnly: true/u);
  assert.match(service, /sourceMetricsUpdatedAt/u);
  assert.match(service, /Idempotency key has already been used/u);
  assert.match(service, /transaction\.create\(\s*references\.action/u);
  assert.match(service, /transaction\.create\(references\.command/u);
  assert.match(service, /transaction\.create\(\s*references\.audit/u);
  assert.match(service, /expectedRevision/u);
  assert.match(service, /revision: current\.revision \+ 1/u);
  assert.match(service, /operation: "outcome"/u);
  assert.match(service, /result: updated/u);
  assert.match(auditTypes, /CREATE_INTERVENTION_RECOMMENDATION/u);
  assert.match(auditTypes, /interventionRecommendation/u);
  assert.doesNotMatch(service, /ASSIGN_REMEDIAL_TEST|SEND_INTERVENTION_ALERT/u);
});

test("intervention timelines filter before their bounded cursor window", async () => {
  const [service, indexes] = await Promise.all([
    read("functions/src/services/interventionRecommendations.ts"),
    read("firestore.indexes.json"),
  ]);

  assert.match(service, /\.where\("schemaVersion", "==", SCHEMA_VERSION\)/u);
  assert.match(service, /\.where\("studentId", "==", request\.studentId\)/u);
  assert.match(service, /\.orderBy\("createdAt", "desc"\)/u);
  assert.match(service, /\.limit\(request\.limit \+ 1\)/u);
  assert.match(service, /query\.startAfter/u);
  assert.match(service, /fingerprint/u);
  assert.match(indexes, /"collectionGroup": "actions"/u);
  assert.match(indexes, /"fieldPath": "studentId"/u);
  assert.match(indexes, /"fieldPath": "createdAt"/u);
});

test("canonical intervention transport is registered", async () => {
  const manifest = await import("../functions/lib/apiRouteManifest.js");
  const routes = manifest.API_ROUTE_MANIFEST.filter((route) =>
    ["ADM-53", "ADM-54", "ADM-55"].includes(route.id),
  );

  assert.equal(routes.length, 3);
  routes.forEach((route) => {
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.match(route.functionExport, /^adminIntervention/u);
  });
});
