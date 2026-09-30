import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";

interface FirestoreIndexField {
  arrayConfig?: string;
  fieldPath: string;
  order?: string;
}

interface FirestoreIndexDefinition {
  collectionGroup: string;
  fields: FirestoreIndexField[];
  queryScope: string;
}

interface FirestoreIndexesManifest {
  indexes: FirestoreIndexDefinition[];
}

const manifestPath = path.resolve(__dirname, "../../../firestore.indexes.json");

const readManifest = (): FirestoreIndexesManifest =>
  JSON.parse(readFileSync(manifestPath, "utf8")) as FirestoreIndexesManifest;

const hasIndex = (
  indexes: FirestoreIndexDefinition[],
  collectionGroup: string,
  fields: FirestoreIndexField[],
  queryScope = "COLLECTION",
): boolean =>
  indexes.some((indexDefinition) =>
    indexDefinition.collectionGroup === collectionGroup &&
    indexDefinition.queryScope === queryScope &&
    JSON.stringify(indexDefinition.fields) === JSON.stringify(fields),
  );

test(
  "firestore index manifest includes build-57 student query composites",
  () => {
    const manifest = readManifest();

    assert.equal(
      hasIndex(manifest.indexes, "students", [
        {fieldPath: "batchId", order: "ASCENDING"},
        {fieldPath: "status", order: "ASCENDING"},
        {fieldPath: "name", order: "ASCENDING"},
      ]),
      true,
    );

    assert.equal(
      hasIndex(manifest.indexes, "students", [
        {fieldPath: "status", order: "ASCENDING"},
        {fieldPath: "lastActiveAt", order: "DESCENDING"},
      ]),
      true,
    );

    assert.equal(
      hasIndex(manifest.indexes, "studentYearMetrics", [
        {fieldPath: "riskState", order: "ASCENDING"},
        {fieldPath: "disciplineIndex", order: "DESCENDING"},
        {fieldPath: "studentId", order: "DESCENDING"},
      ]),
      true,
    );

    assert.equal(
      hasIndex(manifest.indexes, "studentYearMetrics", [
        {fieldPath: "avgRawScorePercent", order: "DESCENDING"},
        {fieldPath: "studentId", order: "DESCENDING"},
      ]),
      true,
    );
  },
);

test(
  "firestore index manifest includes build-58 question-bank composites",
  () => {
    const manifest = readManifest();

    assert.equal(
      hasIndex(manifest.indexes, "questionBank", [
        {fieldPath: "subject", order: "ASCENDING"},
        {fieldPath: "chapter", order: "ASCENDING"},
        {fieldPath: "difficulty", order: "ASCENDING"},
      ]),
      true,
    );

    assert.equal(
      hasIndex(manifest.indexes, "questionBank", [
        {fieldPath: "difficulty", order: "ASCENDING"},
        {fieldPath: "lastUsedAt", order: "DESCENDING"},
      ]),
      true,
    );

    assert.equal(
      hasIndex(manifest.indexes, "questionBank", [
        {fieldPath: "status", order: "ASCENDING"},
        {fieldPath: "subject", order: "ASCENDING"},
        {fieldPath: "createdAt", order: "DESCENDING"},
      ]),
      true,
    );
  },
);

test("firestore index manifest includes intervention timeline composites", () => {
  const manifest = readManifest();

  assert.equal(
    hasIndex(manifest.indexes, "actions", [
      {fieldPath: "schemaVersion", order: "ASCENDING"},
      {fieldPath: "createdAt", order: "DESCENDING"},
      {fieldPath: "__name__", order: "DESCENDING"},
    ]),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "actions", [
      {fieldPath: "schemaVersion", order: "ASCENDING"},
      {fieldPath: "studentId", order: "ASCENDING"},
      {fieldPath: "createdAt", order: "DESCENDING"},
      {fieldPath: "__name__", order: "DESCENDING"},
    ]),
    true,
  );
});

test(
  "firestore index manifest includes assignment history filters",
  () => {
    const manifest = readManifest();

    assert.equal(
      hasIndex(manifest.indexes, "runs", [
        {fieldPath: "status", order: "ASCENDING"},
        {fieldPath: "mode", order: "ASCENDING"},
        {fieldPath: "createdAt", order: "DESCENDING"},
        {fieldPath: "__name__", order: "DESCENDING"},
      ]),
      true,
    );
  },
);

test("firestore index manifest includes support pagination", () => {
  const manifest = readManifest();

  assert.equal(
    hasIndex(manifest.indexes, "supportTickets", [
      {fieldPath: "filterKeys", arrayConfig: "CONTAINS"},
      {fieldPath: "updatedAt", order: "DESCENDING"},
      {fieldPath: "__name__", order: "DESCENDING"},
    ]),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "messages", [
      {fieldPath: "createdAt", order: "ASCENDING"},
      {fieldPath: "__name__", order: "ASCENDING"},
    ]),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "supportTickets", [
      {fieldPath: "vendorFilterKeys", arrayConfig: "CONTAINS"},
      {fieldPath: "updatedAt", order: "DESCENDING"},
      {fieldPath: "ticketId", order: "DESCENDING"},
    ], "COLLECTION_GROUP"),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "emailQueue", [
      {fieldPath: "source", order: "ASCENDING"},
      {fieldPath: "nextAttemptAt", order: "ASCENDING"},
    ]),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "supportAttachments", [
      {fieldPath: "state", order: "ASCENDING"},
      {fieldPath: "cleanupAfter", order: "ASCENDING"},
    ], "COLLECTION_GROUP"),
    true,
  );
  assert.equal(
    hasIndex(manifest.indexes, "supportAttachments", [
      {fieldPath: "state", order: "ASCENDING"},
      {fieldPath: "deleteAfter", order: "ASCENDING"},
    ], "COLLECTION_GROUP"),
    true,
  );
});
