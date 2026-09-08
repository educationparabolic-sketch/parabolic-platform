import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const sharedContractPath = new URL(
  "../shared/contracts/apiDtos.d.ts",
  import.meta.url,
);
const browserProofPath = new URL(
  "./e2e/admin-student-mutations.spec.mjs",
  import.meta.url,
);
const browserRunnerPath = new URL(
  "../scripts/run-admin-student-mutations-e2e.mjs",
  import.meta.url,
);

function interfaceFields(source, name) {
  const match = source.match(
    new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
  );
  assert.ok(match, `${name} must exist in the shared DTO contract`);

  return [...match[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)(?:\?)?:/gm)]
    .map((field) => field[1])
    .sort();
}

test("BWM-026 Admin Student route declarations are exact", () => {
  const {API_ROUTE_MANIFEST} = require(
    `${rootDirectory}/functions/lib/apiRouteManifest.js`,
  );
  const expectedRoutes = new Map([
    ["ADM-24", ["PATCH", "/api/v1/admin/students/{studentId}/profile"]],
    ["ADM-25", ["POST", "/api/v1/admin/students/batch-assignment"]],
    ["ADM-26", ["POST", "/api/v1/admin/students/{studentId}/lifecycle"]],
    ["ADM-27", ["POST", "/api/v1/admin/students/{studentId}/photo-review"]],
    ["ADM-28", ["POST", "/api/v1/admin/students/{studentId}/data-export"]],
    ["ADM-29", ["POST", "/api/v1/admin/students/{studentId}/soft-delete"]],
  ]);

  for (const [routeId, [method, canonicalPath]] of expectedRoutes) {
    const route = API_ROUTE_MANIFEST.find((entry) => entry.id === routeId);
    assert.ok(route, `${routeId} must exist`);
    assert.equal(route.canonicalPath, canonicalPath);
    assert.equal(route.currentFrontendPath, canonicalPath.slice(7));
    assert.equal(route.method, method);
    assert.equal(route.portal, "admin");
    assert.equal(route.declaration, "frontend");
    assert.equal(route.status, "implemented");
    assert.equal(
      route.functionExport,
      routeId === "ADM-28" ?
        "adminStudentDataExport" :
        routeId === "ADM-29" ?
          "adminStudentSoftDelete" : "adminStudentMutations",
    );
  }

  assert.equal(
    API_ROUTE_MANIFEST.filter((route) => expectedRoutes.has(route.id)).length,
    expectedRoutes.size,
  );
});

test("BWM-026 request DTOs exclude browser tenant authority", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const exactRequestFields = {
    AdminStudentOnboardingResendRequest: [
      "idempotencyKey",
      "studentId",
    ],
    AdminStudentBatchAssignmentRequest: [
      "idempotencyKey",
      "students",
      "targetBatch",
    ],
    AdminStudentDataExportRequest: [
      "idempotencyKey",
      "includeAiSummaries",
    ],
    AdminStudentLifecycleUpdateRequest: [
      "expectedVersion",
      "idempotencyKey",
      "reason",
      "status",
    ],
    AdminStudentPhotoReviewRequest: [
      "decision",
      "expectedPhotoCapturedAt",
      "expectedVersion",
      "idempotencyKey",
      "reason",
    ],
    AdminStudentProfileUpdateRequest: [
      "email",
      "expectedVersion",
      "fullName",
      "idempotencyKey",
    ],
    AdminStudentSoftDeleteRequest: [
      "expectedVersion",
      "idempotencyKey",
      "reason",
    ],
    StudentBulkIngestionRequest: [
      "commit",
      "csvContent",
      "deactivateMissing",
      "idempotencyKey",
      "students",
    ],
  };

  for (const [name, expectedFields] of Object.entries(exactRequestFields)) {
    assert.deepEqual(interfaceFields(source, name), [...expectedFields].sort());
  }

  const requestSource = Object.keys(exactRequestFields)
    .map((name) => {
      const match = source.match(
        new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
      );
      return match?.[1] ?? "";
    })
    .join("\n");
  assert.doesNotMatch(requestSource, /\binstituteId\??:/);
  assert.doesNotMatch(requestSource, /\bactor(?:Id|Role)\??:/);
});

test("BWM-026 resend and bulk results expose replay audit authority", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  assert.deepEqual(interfaceFields(source, "AdminStudentOnboardingResendResult"), [
    "auditId",
    "disposition",
    "jobId",
    "queuedAt",
    "recipientEmail",
    "status",
    "studentId",
  ]);
  assert.deepEqual(interfaceFields(source, "StudentBulkIngestionResult"), [
    "auditId",
    "commitRequested",
    "committed",
    "deactivateMissing",
    "disposition",
    "rows",
    "summary",
  ]);
  assert.doesNotMatch(source.match(
    /export interface AdminStudentOnboardingResendResult \{([\s\S]*?)\n\}/,
  )?.[1] ?? "", /jobPath/);
});

test("BWM-026 public export DTO omits storage internals", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  assert.deepEqual(interfaceFields(source, "AdminStudentDataExportResult"), [
    "auditId",
    "disposition",
    "downloadUrl",
    "expiresAt",
    "exportHash",
    "generatedAt",
    "records",
    "studentId",
  ]);

  const resultMatch = source.match(
    /export interface AdminStudentDataExportResult \{([\s\S]*?)\n\}/,
  );
  assert.ok(resultMatch);
  assert.doesNotMatch(resultMatch[1], /bucketName|objectPath|storage:/);
});

test("BWM-026 browser proof is permanently wired to local Firebase without response mocks", async () => {
  const [proof, runner] = await Promise.all([
    readFile(browserProofPath, "utf8"),
    readFile(browserRunnerPath, "utf8"),
  ]);

  assert.match(runner, /--only", "auth,firestore,functions,hosting:portal,storage"/);
  assert.match(runner, /test:e2e:admin-student-mutations/);
  assert.match(proof, /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(proof, /FIRESTORE_EMULATOR_HOST/);
  assert.match(proof, /FIREBASE_STORAGE_EMULATOR_HOST/);
  assert.match(proof, /waitForEvent\("download"\)/);
  assert.match(proof, /setOffline\(true\)/);
  assert.doesNotMatch(proof, /\.route\(|route\.fulfill|route\.abort/);
});
