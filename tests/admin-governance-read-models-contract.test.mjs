import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("snapshot access is cursor-bounded and rejects fabricated fields", async () => {
  const source = await read("functions/src/services/governanceSnapshotAccess.ts");

  assert.match(source, /const DEFAULT_LIMIT = 12;/);
  assert.match(source, /const MAX_LIMIT = 36;/);
  assert.match(source, /orderBy\("month", "desc"\)/);
  assert.match(source, /\.limit\(input\.limit \+ 1\)/);
  assert.match(
    source,
    /query\.startAfter\(decodedCursor\.documentId\.replace\("_", "-"\)\)/,
  );
  assert.doesNotMatch(source, /\.slice\(-input\.limit\)/);
  assert.doesNotMatch(source, /Number\(snapshot\.[^)]+ \?\? 0\)/);
  assert.match(source, /snapshot\.immutable !== true/);
  assert.match(source, /snapshot\.schemaVersion !== 1/);
});

test("report preview binds snapshot versions and fails closed on event overflow", async () => {
  const [source, types] = await Promise.all([
    read("functions/src/services/governanceReporting.ts"),
    read("functions/src/types/governanceReporting.ts"),
  ]);

  assert.match(source, /const MAX_EVENT_DOCUMENTS = 1000;/);
  assert.match(source, /\.limit\(MAX_EVENT_DOCUMENTS \+ 1\)/g);
  assert.match(source, /overrideEvents\.length \+ auditEvents\.length > MAX_EVENT_DOCUMENTS/);
  assert.match(source, /calibrationVersion = snapshot\.calibrationVersionUsed/);
  assert.match(source, /riskModelVersion: snapshot\.riskModelVersionUsed/);
  assert.match(source, /templateVersionRange: snapshot\.templateVersionRangeUsed/);
  assert.match(source, /eventCutoffAt: snapshot\.generatedAt/);
  assert.match(source, /const directRunId = document\.get\("runId"\)/);
  assert.doesNotMatch(source, /storageBucketArchitecture|readCalibrationVersion/);
  assert.doesNotMatch(`${source}\n${types}`, /\b(?:bucketName|gsUri|objectPath)\b/);
});

test("live governance UI accepts only stored snapshot fields", async () => {
  const [dataset, page] = await Promise.all([
    read("apps/admin/src/features/analytics/governanceDataset.ts"),
    read("apps/admin/src/features/analytics/GovernanceMonitoringDashboardPage.tsx"),
  ]);

  assert.match(dataset, /AdminGovernanceSnapshotRecord/);
  assert.match(dataset, /EMPTY_LIVE_GOVERNANCE_DATASET/);
  assert.match(dataset, /limit: 36/);
  assert.match(dataset, /\.map\(normalizeGovernanceSnapshot\)/);
  assert.doesNotMatch(dataset, /toNumberOrZero|normalizeDifficultyStability/);
  assert.doesNotMatch(
    dataset,
    /FALLBACK_GOVERNANCE_DATASET\.(?:templateStabilityComparisons|batchRiskSummaries)/,
  );
  assert.doesNotMatch(page, /FALLBACK_GOVERNANCE_INSTITUTE_ID|FALLBACK_GOVERNANCE_YEAR_ID/);
  assert.match(page, /Verified institute authority is unavailable/);
  assert.match(page, /Values absent from the stored snapshot/);
  assert.match(page, /generateGovernanceReport/);
  assert.match(page, /authorizeGovernanceReportDownload/);
  assert.match(page, /Generate PDF/);
  assert.match(page, /Download PDF/);
});
