import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const listPagePath = new URL(
  "../apps/admin/src/features/assignments/AssignmentManagementPage.tsx",
  import.meta.url,
);
const detailPagePath = new URL(
  "../apps/admin/src/features/assignments/AdminAssignmentDetailPage.tsx",
  import.meta.url,
);
const apiPath = new URL(
  "../apps/admin/src/features/assignments/assignmentRunsApi.ts",
  import.meta.url,
);

test("Admin assignment list consumes strict authoritative run summaries", async () => {
  const [listSource, apiSource] = await Promise.all([
    readFile(listPagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(apiSource, /apiClient\.get<AdminRunListResult>\("\/admin\/runs"/u);
  assert.match(apiSource, /responseAdapter: \(value\) => adaptAdminRunListResult\(value\)/u);
  assert.match(listSource, /const result = await fetchAdminRuns\(\{/u);
  assert.match(listSource, /setAuthoritativeRuns\(result\.runs\)/u);
  assert.match(listSource, /caption="Authoritative Run Status Table"/u);
  assert.match(listSource, /rows=\{filteredAuthoritativeRuns\}/u);
  assert.match(listSource, /rowKey=\{\(row\) => row\.id\}/u);
  assert.doesNotMatch(listSource, /fetchDashboardDataset/u);
  assert.doesNotMatch(listSource, /GET \/admin\/analytics/u);
  assert.doesNotMatch(listSource, /buildRunRecordFromAnalytics/u);
});

test("Admin assignment detail consumes ADM-23 without analytics or fixture substitution", async () => {
  const [detailSource, apiSource] = await Promise.all([
    readFile(detailPagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(apiSource, /apiClient\.get<AdminRunDetailResult>/u);
  assert.match(apiSource, /`\/admin\/runs\/\$\{encodeURIComponent\(runId\)\}`/u);
  assert.match(apiSource, /responseAdapter: \(value\) => adaptAdminRunDetailResult\(value\)/u);
  assert.match(detailSource, /const result = await fetchAdminRunDetail\(runId\)/u);
  assert.match(detailSource, /setAuthoritativeRun\(result\.run\)/u);
  assert.match(detailSource, /Authoritative Assignment Detail/u);
  assert.match(detailSource, /No analytics or fixture record has been substituted/u);
  assert.match(detailSource, /authoritativeRun\.recipientStudentIds\.map/u);
  assert.doesNotMatch(detailSource, /fetchDashboardDataset/u);
  assert.doesNotMatch(detailSource, /GET \/admin\/analytics/u);
  assert.doesNotMatch(detailSource, /buildDetailRecord/u);
});
