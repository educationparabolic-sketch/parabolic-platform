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
  "functions/src/types/adminQuestionBank.ts",
);
const packageParserPath = path.join(
  repositoryRoot,
  "functions/src/services/questionPackageParser.ts",
);
const packageServicePath = path.join(
  repositoryRoot,
  "functions/src/services/adminQuestionPackages.ts",
);
const frontendDirectory = path.join(
  repositoryRoot,
  "apps/admin/src/features/tests",
);

const plannedRoutes = [
  ["ADM-30", "GET", "/admin/questions/library/{questionId}"],
  ["ADM-31", "PATCH", "/admin/questions/{questionId}/metadata"],
  ["ADM-32", "PATCH", "/admin/questions/{questionId}/structure"],
  ["ADM-33", "POST", "/admin/questions/{questionId}/versions"],
  ["ADM-34", "POST", "/admin/questions/{questionId}/lifecycle"],
  ["ADM-35", "GET", "/admin/questions/tags"],
  ["ADM-36", "POST", "/admin/questions/tags"],
  ["ADM-37", "POST", "/admin/questions/packages/validate"],
  ["ADM-38", "POST", "/admin/questions/packages/{packageId}/commit"],
  [
    "ADM-39",
    "POST",
    "/admin/questions/upload-logs/{uploadLogId}/rollback",
  ],
  ["ADM-40", "GET", "/admin/questions/upload-logs/{uploadLogId}"],
];

const mutationRequestNames = [
  "AdminQuestionMetadataUpdateRequest",
  "AdminQuestionStructureUpdateRequest",
  "AdminQuestionVersionCreateRequest",
  "AdminQuestionLifecycleRequest",
  "AdminQuestionPackageValidateRequest",
  "AdminQuestionPackageCommitRequest",
  "AdminQuestionPackageRollbackRequest",
];

function interfaceBody(source, name) {
  const match = source.match(
    new RegExp(`export interface ${name}[^\\{]*\\{([\\s\\S]*?)\\n\\}`),
  );
  assert.ok(match, `${name} must be declared`);
  return match[1];
}

test("BWM-027 routes are unique and fully routed", async () => {
  const {API_ROUTE_MANIFEST} = await import(
    "../functions/lib/apiRouteManifest.js"
  );
  const selected = API_ROUTE_MANIFEST.filter((route) =>
    plannedRoutes.some(([id]) => id === route.id),
  );

  assert.equal(selected.length, plannedRoutes.length);
  assert.deepEqual(
    selected.map((route) => [
      route.id,
      route.method,
      route.currentFrontendPath,
    ]),
    plannedRoutes,
  );
  for (const route of selected) {
    assert.equal(route.canonicalPath, `/api/v1${route.currentFrontendPath}`);
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.equal(typeof route.functionExport, "string");
  }

  assert.equal(
    new Set(selected.map((route) => `${route.method} ${route.canonicalPath}`))
      .size,
    plannedRoutes.length,
  );
});

test("Question Bank public mutation contracts carry no browser authority", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const questionContractSource = source.slice(
    source.indexOf("export type AdminQuestionMutationDisposition"),
    source.indexOf("export interface QuestionBulkUploadQuestionInput"),
  );

  for (const requestName of mutationRequestNames) {
    const body = interfaceBody(source, requestName);
    assert.match(body, /idempotencyKey: string;/, requestName);
    assert.doesNotMatch(body, /\b(?:actorId|actorRole|instituteId)\b/);
  }

  for (const requestName of [
    "AdminQuestionMetadataUpdateRequest",
    "AdminQuestionStructureUpdateRequest",
    "AdminQuestionVersionCreateRequest",
    "AdminQuestionLifecycleRequest",
  ]) {
    assert.match(
      interfaceBody(source, requestName),
      /expectedRevision: number;/,
      requestName,
    );
  }

  assert.match(source, /expectedDictionaryRevision: number;/);
  assert.match(source, /expectedPackageRevision: number;/g);
  assert.match(
    source,
    /extension: Extract<QuestionAssetExtension, "png" \| "webp">;/,
  );
  assert.doesNotMatch(
    questionContractSource,
    /\b(?:actorId|actorRole|instituteId)\b/,
  );
  assert.doesNotMatch(
    questionContractSource,
    /\b(?:bucketName|objectPath)\b/,
  );
});

test("Question Bank contracts encode authoritative recovery boundaries", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const backendSource = await readFile(backendTypePath, "utf8");

  assert.match(
    source,
    /AdminQuestionPackageState =[\s\S]*"failed_recoverable";/,
  );
  assert.match(
    source,
    /sourceStatus: "deprecated";[\s\S]*successorStatus: "active";/,
  );
  assert.match(
    interfaceBody(source, "AdminQuestionUploadLogDetailResult"),
    /rollbackEligible: boolean;[\s\S]*rows: AdminQuestionPackageRowResult\[\];/,
  );
  assert.match(
    interfaceBody(source, "AdminQuestionDetailResult"),
    /analytics: AdminQuestionAnalyticsRecord \| null;[\s\S]*templateUsage: AdminQuestionTemplateUsageRecord\[\];[\s\S]*versions: AdminQuestionVersionSummary\[\];/,
  );
  assert.match(backendSource, /shared\/contracts\/apiDtos/);
  assert.match(backendSource, /interface AdminQuestionBankRequestContext/);
  assert.match(backendSource, /instituteId: string;/);
});

test("Question packages retain bounded staged authority until cleanup", async () => {
  const parserSource = await readFile(packageParserPath, "utf8");
  const serviceSource = await readFile(packageServicePath, "utf8");

  assert.match(parserSource, /maxArchiveBytes: 12 \* 1024 \* 1024/);
  assert.match(parserSource, /maxRows: 100/);
  assert.match(parserSource, /maxTotalUncompressedBytes: 40 \* 1024 \* 1024/);
  assert.match(parserSource, /QuestionPackageLimitError/);
  assert.match(parserSource, /Nested folders are not allowed/);
  assert.match(parserSource, /content does not match its extension/);
  assert.match(parserSource, /QuestionText", 20_000/);

  assert.match(serviceSource, /const PACKAGE_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(serviceSource, /claimedQuestionIds/);
  assert.match(serviceSource, /question-packages/);
  assert.match(serviceSource, /preconditionOpts: \{ifGenerationMatch: 0\}/);
  assert.match(serviceSource, /phase: "firestore_applied"/);
  assert.match(serviceSource, /state: "failed_recoverable"/);
  assert.match(serviceSource, /actionType: "IMPORT_QUESTION_PACKAGE"/);
  assert.match(serviceSource, /transaction\.set\(questionReferences\[index\]/);
  assert.match(serviceSource, /transaction\.update\(references\.uploadLogReference/);
  assert.match(serviceSource, /transaction\.create\(references\.auditReference/);
  const packageData = serviceSource.match(
    /const packageData = \{([\s\S]*?)\n    \};\n    if \(validationResult/,
  );
  assert.ok(packageData, "durable package authority must be declared");
  assert.match(packageData[1], /idempotencyKeyHash:/);
  assert.doesNotMatch(packageData[1], /\bidempotencyKey:/);
});

test("live Question Bank consumers use strict APIs and reconcile mutations", async () => {
  const read = (fileName) => readFile(path.join(frontendDirectory, fileName), "utf8");
  const [api, library, archive, tags, logs, detail, distribution, packages] =
    await Promise.all([
      read("questionBankApi.ts"),
      read("AdminQuestionBankLibraryPage.tsx"),
      read("AdminQuestionBankArchiveVersionsPage.tsx"),
      read("AdminQuestionBankTagManagementPage.tsx"),
      read("AdminQuestionBankValidationLogsPage.tsx"),
      read("AdminQuestionBankQuestionDetailPage.tsx"),
      read("AdminQuestionBankDistributionPage.tsx"),
      read("QuestionBankManagementPage.tsx"),
    ]);

  for (const route of [
    "/admin/questions/library",
    "/admin/questions/tags",
    "/admin/questions/packages/validate",
    "/admin/questions/upload-logs/",
  ]) {
    assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(library, /await updateQuestionMetadata[\s\S]*await reloadLibrary/);
  assert.match(library, /await updateQuestionStructure[\s\S]*await reloadLibrary/);
  assert.match(library, /await createQuestionVersionWithApi[\s\S]*await reloadLibrary/);
  assert.match(library, /await updateQuestionLifecycle[\s\S]*await reloadLibrary/);
  assert.match(archive, /await createQuestionVersion[\s\S]*fetchArchiveLifecycleFromApi/);
  assert.match(tags, /await mutateQuestionTags[\s\S]*await reloadTags/);
  assert.match(logs, /await rollbackQuestionPackage[\s\S]*await reload\(\)/);
  assert.match(logs, /await getQuestionUploadLogDetail/);
  assert.match(detail, /getQuestionDetail\(questionId\)/);
  assert.match(distribution, /getQuestionDistribution\(/);
  assert.match(packages, /await validateQuestionPackageWithApi/);
  assert.match(packages, /await commitQuestionPackage/);
  assert.doesNotMatch(packages, /uploadQuestionAsset|commitQuestionsBulk/);
  assert.match(packages, /authoritative server validation is shown below/);
});
