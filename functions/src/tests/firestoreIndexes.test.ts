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
): boolean =>
  indexes.some((indexDefinition) =>
    indexDefinition.collectionGroup === collectionGroup &&
    indexDefinition.queryScope === "COLLECTION" &&
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
