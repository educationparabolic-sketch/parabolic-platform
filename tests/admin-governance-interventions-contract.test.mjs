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
  "functions/src/types/adminGovernanceInterventions.ts",
);
const browserProofPath = path.join(
  repositoryRoot,
  "tests/e2e/admin-governance-interventions.spec.mjs",
);
const browserRunnerPath = path.join(
  repositoryRoot,
  "scripts/run-admin-governance-interventions-e2e.mjs",
);

const plannedRoutes = [
  ["ADM-49", "GET", "/admin/governance/snapshots"],
  ["ADM-50", "POST", "/admin/governance/reports"],
  ["ADM-51", "GET", "/admin/governance/reports"],
  ["ADM-52", "GET", "/admin/governance/reports/{reportId}/download"],
  ["ADM-53", "GET", "/admin/interventions"],
  ["ADM-54", "POST", "/admin/interventions/recommendations"],
  ["ADM-55", "PATCH", "/admin/interventions/{interventionId}/outcome"],
];

function interfaceBody(source, name) {
  const match = source.match(
    new RegExp(`export interface ${name}[^\\{]*\\{([\\s\\S]*?)\\n\\}`),
  );
  assert.ok(match, `${name} must be declared`);
  return match[1];
}

test("BWM-029 routes are unique planned and registered", async () => {
  const {API_ROUTE_MANIFEST} = await import(
    "../functions/lib/apiRouteManifest.js"
  );
  const selected = API_ROUTE_MANIFEST.filter((route) =>
    plannedRoutes.some(([id]) => id === route.id),
  );

  assert.deepEqual(
    selected.map((route) => [route.id, route.method, route.currentFrontendPath]),
    plannedRoutes,
  );
  assert.equal(
    new Set(selected.map((route) => `${route.method} ${route.canonicalPath}`))
      .size,
    plannedRoutes.length,
  );
  selected.forEach((route) => {
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.equal(typeof route.functionExport, "string");
  });
});

test("public requests keep actor and institute authority server-side", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const requestNames = [
    "AdminGovernanceSnapshotListQuery",
    "AdminGovernanceReportGenerateRequest",
    "AdminGovernanceReportListQuery",
    "AdminGovernanceReportDownloadQuery",
    "AdminInterventionRecommendationCreateRequest",
    "AdminInterventionTimelineQuery",
    "AdminInterventionOutcomeUpdateRequest",
  ];

  for (const name of requestNames) {
    const body = interfaceBody(source, name);
    assert.doesNotMatch(body, /\b(?:actorId|actorRole|instituteId)\b/, name);
  }
  assert.match(
    interfaceBody(source, "AdminGovernanceTargetQuery"),
    /targetInstituteId\?: string;/,
  );
  assert.match(
    source,
    /Vendor-only institute selector[\s\S]*never authorization input/,
  );
});

test("report contracts bind immutable sources and expose no storage internals", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const generation = interfaceBody(
    source,
    "AdminGovernanceReportGenerateRequest",
  );
  const report = interfaceBody(source, "AdminGovernanceReportRecord");
  const download = interfaceBody(
    source,
    "AdminGovernanceReportDownloadResult",
  );

  assert.match(generation, /idempotencyKey: string;/);
  assert.match(generation, /snapshotId: string;/);
  assert.match(report, /immutable: true;/);
  assert.match(report, /source: AdminGovernanceReportSourceAuthority;/);
  assert.match(report, /sha256: string;/);
  assert.match(download, /downloadUrl: string;/);
  assert.match(download, /expiresAt: string;/);
  assert.doesNotMatch(
    `${report}\n${download}`,
    /\b(?:bucketName|gsUri|objectPath|storagePath)\b/,
  );
});

test("intervention contracts are advisory bounded and revisioned", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const create = interfaceBody(
    source,
    "AdminInterventionRecommendationCreateRequest",
  );
  const record = interfaceBody(
    source,
    "AdminInterventionRecommendationRecord",
  );
  const timeline = interfaceBody(source, "AdminInterventionTimelineResult");
  const outcome = interfaceBody(
    source,
    "AdminInterventionOutcomeUpdateRequest",
  );

  assert.match(create, /idempotencyKey: string;/);
  assert.match(create, /sourceMetricsUpdatedAt: string;/);
  assert.match(record, /advisoryOnly: true;/);
  assert.match(record, /revision: number;/);
  assert.match(timeline, /nextCursor: string \| null;/);
  assert.match(outcome, /expectedRevision: number;/);
  assert.match(outcome, /idempotencyKey: string;/);
  assert.doesNotMatch(source, /AdminIntervention(?:Assign|Send)/);
});

test("backend-only validated requests supply identity authority", async () => {
  const source = await readFile(backendTypePath, "utf8");

  assert.match(source, /shared\/contracts\/apiDtos/);
  assert.match(source, /interface AdminGovernanceInterventionActorContext/);
  assert.match(source, /actorId: string;/);
  assert.match(source, /actorRole: string;/);
  assert.match(source, /instituteId: string;/);
  assert.match(
    source,
    /interface AdminGovernanceReportDownloadValidatedRequest/,
  );
  assert.match(source, /reportId: string;/);
  assert.match(
    source,
    /interface AdminInterventionOutcomeUpdateValidatedRequest/,
  );
  assert.match(source, /interventionId: string;/);
});

test("permanent proof uses real local services without network mocks", async () => {
  const [browser, runner, packageSource, reportSuite, interventionSuite] =
    await Promise.all([
      readFile(browserProofPath, "utf8"),
      readFile(browserRunnerPath, "utf8"),
      readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      readFile(path.join(
        repositoryRoot,
        "functions/src/tests/governanceReportArtifacts.test.ts",
      ), "utf8"),
      readFile(path.join(
        repositoryRoot,
        "functions/src/tests/interventionRecommendations.test.ts",
      ), "utf8"),
    ]);
  const scripts = JSON.parse(packageSource).scripts;

  assert.equal(
    scripts["test:admin-governance-interventions:e2e"],
    "node scripts/run-admin-governance-interventions-e2e.mjs",
  );
  assert.match(
    runner,
    /auth,firestore,functions,hosting:portal,storage/u,
  );
  assert.match(browser, /page\.waitForEvent\("download"\)/u);
  assert.match(browser, /%PDF-1\.4/u);
  assert.match(browser, /disposition\)\.toBe\("replayed"\)/u);
  assert.match(browser, /Director access is read-only\./u);
  assert.match(browser, /Source metrics timestamp unavailable\./u);
  assert.doesNotMatch(browser, /\.route\(|route\.fulfill|route\.abort/u);
  assert.match(reportSuite, /real PDF bytes, audit, replay, and bounded download/u);
  assert.match(reportSuite, /immutable: true/u);
  assert.match(interventionSuite, /advisory, atomic, replayable, and cursor bounded/u);
  assert.match(interventionSuite, /concurrentOutcomes/u);
});
