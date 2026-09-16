import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const apiPath = new URL(
  "../apps/admin/src/features/assignments/assignmentOperationsApi.ts",
  import.meta.url,
);
const liveListPath = new URL(
  "../apps/admin/src/features/assignments/AdminAssignmentsLivePage.tsx",
  import.meta.url,
);
const liveDetailPath = new URL(
  "../apps/admin/src/features/assignments/AdminAssignmentLiveRunPage.tsx",
  import.meta.url,
);
const historyPath = new URL(
  "../apps/admin/src/features/assignments/AdminAssignmentsHistoryPage.tsx",
  import.meta.url,
);
const appPath = new URL("../apps/admin/src/App.tsx", import.meta.url);

test("assignment operation callers strictly adapt every response family", async () => {
  const source = await readFile(apiPath, "utf8");
  assert.match(source, /PortalResponseValidationError/u);
  assert.match(source, /function adaptVersionedRun/u);
  assert.match(source, /function adaptSummary/u);
  assert.match(source, /function adaptLiveStudent/u);
  assert.match(source, /function adaptHistoryAnalytics/u);
  assert.match(source, /recipientStudentIds\.length !== recipientCount/u);
  assert.match(source, /counts that sum to totalRecipients/u);
  assert.match(source, /matching nullable session identity and revision/u);
  assert.match(source, /run\.status !== "active" && run\.status !== "collecting"/u);
  assert.match(source, /\["completed", "archived", "cancelled", "terminated"\]/u);
  assert.equal((source.match(/responseAdapter:/gu) ?? []).length, 8);
  assert.doesNotMatch(source, /as unknown as AdminRun/u);
});

test("mounted live and history pages reconcile real commands and expose no unsupported controls", async () => {
  const [app, liveList, liveDetail, history] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(liveListPath, "utf8"),
    readFile(liveDetailPath, "utf8"),
    readFile(historyPath, "utf8"),
  ]);
  assert.match(app, /path="assignments\/live"/u);
  assert.match(app, /path="assignments\/live\/:runId"/u);
  assert.match(app, /path="assignments\/history"/u);
  assert.match(liveList, /fetchAdminLiveRuns/u);
  assert.match(liveDetail, /fetchAdminLiveRun/u);
  assert.match(liveDetail, /updateAdminRunLifecycle/u);
  assert.match(liveDetail, /resendAdminRunNotifications/u);
  assert.match(liveDetail, /applyAdminSessionOverride/u);
  assert.match(liveDetail, /Retrying this action will reuse its idempotency key/u);
  assert.match(liveDetail, /Face\/camera overrides are intentionally unavailable/u);
  assert.doesNotMatch(liveDetail, /Override Face|face_override/u);
  assert.match(history, /fetchAdminRunHistory/u);
  assert.match(history, /duplicateAdminRun/u);
  assert.match(history, /reassignAdminRun/u);
  assert.match(history, /fetchAdminRunDetail/u);
  assert.doesNotMatch(`${liveList}\n${liveDetail}\n${history}`, /fetchDashboardDataset/u);
});
