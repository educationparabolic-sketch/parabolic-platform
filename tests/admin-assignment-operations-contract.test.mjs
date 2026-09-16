import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sharedContractPath = path.join(
  repositoryRoot,
  "shared/contracts/apiDtos.d.ts",
);
const backendTypePath = path.join(
  repositoryRoot,
  "functions/src/types/adminAssignmentOperations.ts",
);
const servicePath = path.join(
  repositoryRoot,
  "functions/src/services/adminAssignmentOperations.ts",
);
const readModelsPath = path.join(
  repositoryRoot,
  "functions/src/services/adminAssignmentReadModels.ts",
);
const indexesPath = path.join(repositoryRoot, "firestore.indexes.json");
const assignmentCreationPath = path.join(
  repositoryRoot,
  "functions/src/services/assignmentCreation.ts",
);
const sessionPath = path.join(
  repositoryRoot,
  "functions/src/services/session.ts",
);
const submissionPath = path.join(
  repositoryRoot,
  "functions/src/services/submission.ts",
);

const plannedRoutes = [
  ["ADM-41", "GET", "/admin/live-runs"],
  ["ADM-42", "GET", "/admin/live-runs/{runId}"],
  ["ADM-43", "GET", "/admin/run-history"],
  ["ADM-44", "POST", "/admin/runs/{runId}/duplicate"],
  ["ADM-45", "POST", "/admin/runs/{runId}/reassign"],
  ["ADM-46", "POST", "/admin/runs/{runId}/lifecycle"],
  ["ADM-47", "POST", "/admin/runs/{runId}/notifications/resend"],
  [
    "ADM-48",
    "POST",
    "/admin/runs/{runId}/sessions/{sessionId}/overrides",
  ],
];

function interfaceBody(source, name) {
  const match = source.match(
    new RegExp(`export interface ${name}[^\\{]*\\{([\\s\\S]*?)\\n\\}`),
  );
  assert.ok(match, `${name} must be declared`);
  return match[1];
}

test("BWM-028 routes are unique and registered to the secured handler", async () => {
  const {API_ROUTE_MANIFEST} = await import(
    "../functions/lib/apiRouteManifest.js"
  );
  const selected = API_ROUTE_MANIFEST.filter((route) =>
    plannedRoutes.some(([id]) => id === route.id),
  );

  assert.deepEqual(
    selected.map((route) => [
      route.id,
      route.method,
      route.currentFrontendPath,
    ]),
    plannedRoutes,
  );
  assert.equal(
    new Set(selected.map((route) => `${route.method} ${route.canonicalPath}`))
      .size,
    plannedRoutes.length,
  );
  selected.forEach((route) => {
    assert.equal(route.declaration, "frontend");
    assert.equal(route.status, "implemented");
    assert.equal(route.functionExport, "adminAssignmentOperations");
  });
});

test("public assignment commands carry concurrency but no actor authority", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const requestNames = [
    "AdminRunDuplicateRequest",
    "AdminRunNotificationResendRequest",
    "AdminRunSessionOverrideRequest",
  ];

  for (const name of requestNames) {
    const body = interfaceBody(source, name);
    assert.match(body, /idempotencyKey: string;/, name);
    assert.doesNotMatch(body, /\b(?:actorId|actorRole|instituteId)\b/);
  }
  assert.match(
    source,
    /interface AdminRunReassignRequest\s+extends AdminRunDuplicateRequest/,
  );
  assert.doesNotMatch(
    interfaceBody(source, "AdminRunReassignRequest"),
    /\b(?:actorId|actorRole|instituteId)\b/,
  );
  assert.match(
    interfaceBody(source, "AdminRunDuplicateRequest"),
    /expectedSourceRevision: number;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunNotificationResendRequest"),
    /expectedRevision: number;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunSessionOverrideRequest"),
    /expectedRunRevision: number;[\s\S]*expectedSessionRevision: number;/,
  );

  const lifecycleBase = interfaceBody(source, "AdminRunLifecycleCommandBase");
  assert.match(lifecycleBase, /expectedRevision: number;/);
  assert.match(lifecycleBase, /idempotencyKey: string;/);
  assert.doesNotMatch(lifecycleBase, /\b(?:actorId|actorRole|instituteId)\b/);
  const lifecycle = source.match(
    /export type AdminRunLifecycleRequest =([\s\S]*?)\n\nexport interface AdminRunLifecycleResult/,
  );
  assert.ok(lifecycle);
  assert.match(lifecycle[1], /AdminRunLifecycleCommandBase/);
  assert.match(lifecycle[1], /action: "extend";/);
  assert.match(lifecycle[1], /action: "cancel" \| "terminate" \| "archive";/);
});

test("state and live/history DTOs encode the bounded authority", async () => {
  const source = await readFile(sharedContractPath, "utf8");

  assert.match(
    source,
    /AdminRunLifecycleStatus =[\s\S]*"collecting"[\s\S]*"archived"[\s\S]*"terminated";/,
  );
  const canonicalStatus = source.match(
    /export type AdminRunLifecycleStatus =([\s\S]*?);/,
  );
  assert.ok(canonicalStatus);
  assert.doesNotMatch(canonicalStatus[1], /"stopped"/);
  assert.match(source, /AdminRunStatus =[\s\S]*"stopped"[\s\S]*"cancelled";/);
  assert.match(
    interfaceBody(source, "AdminRunVersionedRecord"),
    /revision: number;[\s\S]*status: AdminRunLifecycleStatus;[\s\S]*updatedAt: string;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunLiveVersionedRecord"),
    /status: Extract<AdminRunLifecycleStatus, "active" \| "collecting">;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunHistoryVersionedRecord"),
    /status: AdminRunTerminalStatus;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunLiveListResult"),
    /nextCursor: string \| null;[\s\S]*serverTime: string;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunLiveDetailResult"),
    /nextCursor: string \| null;[\s\S]*students: AdminRunLiveStudentRecord\[\];/,
  );
  assert.match(
    interfaceBody(source, "AdminRunLiveStudentRecord"),
    /sessionRevision: number \| null;[\s\S]*timeRemainingSeconds: number;/,
  );
  assert.match(
    interfaceBody(source, "AdminRunHistoryResult"),
    /nextCursor: string \| null;[\s\S]*runs: AdminRunHistoryRecord\[\];/,
  );
  assert.match(
    source,
    /AdminRunCommandRecoveryState =[\s\S]*"failed_recoverable";/,
  );
  assert.match(
    interfaceBody(source, "AdminRunNotificationResendResult"),
    /recoveryState: AdminRunCommandRecoveryState;/,
  );
});

test("only minimum-time bypass and force-submit are public overrides", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const overrideType = source.match(
    /export type AdminRunSessionOverrideType =([\s\S]*?);/,
  );
  assert.ok(overrideType);
  assert.match(overrideType[1], /"minimum_time_bypass"/);
  assert.match(overrideType[1], /"force_submit"/);
  assert.doesNotMatch(overrideType[1], /face|mode|emergency/i);
});

test("backend context supplies identity authority separately", async () => {
  const source = await readFile(backendTypePath, "utf8");

  assert.match(source, /shared\/contracts\/apiDtos/);
  assert.match(source, /interface AdminAssignmentOperationContext/);
  assert.match(source, /actorId: string;/);
  assert.match(source, /actorRole: string;/);
  assert.match(source, /instituteId: string;/);
  assert.match(source, /interface AdminRunSessionOverrideValidatedRequest/);
  assert.match(source, /runId: string;[\s\S]*sessionId: string;/);
});

test("transactional command authority exists without promoting routes", async () => {
  const [service, assignmentCreation, session, submission] = await Promise.all([
    readFile(servicePath, "utf8"),
    readFile(assignmentCreationPath, "utf8"),
    readFile(sessionPath, "utf8"),
    readFile(submissionPath, "utf8"),
  ]);

  assert.match(service, /class AdminAssignmentOperationsService/);
  assert.match(service, /runTransaction/);
  assert.match(service, /transaction\.create\(auditReference/);
  assert.match(service, /duplicateRun/);
  assert.match(service, /reassignRun/);
  assert.match(service, /applyLifecycleCommand/);
  assert.match(service, /resendRunNotifications/);
  assert.match(service, /applySessionOverride/);
  assert.match(service, /terminateRun/);
  assert.match(service, /reconcileRunLifecycle/);
  assert.match(service, /MAX_RECIPIENTS = 100/);
  assert.match(service, /MAX_EXTENSION_MINUTES = 1440/);
  assert.match(service, /ASSIGNMENT_NOTIFICATION_TEMPLATE = "assignment_notification"/);
  assert.match(service, /transaction\.create\(overrideReference/);
  assert.match(service, /OPERATION_RECOVERY_COLLECTION/);
  assert.match(service, /recoveryState: "failed_recoverable"/);
  assert.doesNotMatch(service, /Run termination is unavailable/);
  assert.match(assignmentCreation, /revision: 1,/);
  assert.match(assignmentCreation, /updatedAt: createdAt,/);
  assert.match(session, /revision: 1,/);
  assert.match(submission, /submissionLockOwnerId/);
  assert.match(submission, /timingOverride === "minimum_time_bypass"/);
});

test("bounded assignment read models use projections and filter-bound cursors", async () => {
  const [readModels, rawIndexes] = await Promise.all([
    readFile(readModelsPath, "utf8"),
    readFile(indexesPath, "utf8"),
  ]);
  const indexes = JSON.parse(rawIndexes);

  assert.match(readModels, /class AdminAssignmentReadModelsService/);
  assert.match(readModels, /MAX_LIMIT = 50/);
  assert.match(readModels, /MAX_RECIPIENTS = 100/);
  assert.match(readModels, /where\("status", "in", \[\.\.\.LIVE_STATUSES\]\)/);
  assert.match(readModels, /\.limit\(MAX_RECIPIENTS \+ 1\)/);
  assert.match(readModels, /\.select\([\s\S]*"adaptivePhaseSnapshot"/);
  assert.doesNotMatch(readModels, /\.select\([\s\S]*"answerMap"/);
  assert.match(readModels, /cursor\.yearId !== yearId/);
  assert.match(readModels, /cursorRevision !== run\.revision/);
  assert.match(readModels, /advancedMetrics/);
  assert.match(readModels, /historyAnalytics/);
  assert.equal(indexes.indexes.some((index) =>
    index.collectionGroup === "runs" &&
    JSON.stringify(index.fields) === JSON.stringify([
      {fieldPath: "status", order: "ASCENDING"},
      {fieldPath: "mode", order: "ASCENDING"},
      {fieldPath: "createdAt", order: "DESCENDING"},
      {fieldPath: "__name__", order: "DESCENDING"},
    ]),
  ), true);
});
