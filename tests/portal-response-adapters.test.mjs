import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const adapterPath = join(
  rootDirectory,
  "shared/services/portalResponseAdapters.ts",
);
const envelopePath = join(rootDirectory, "shared/types/apiResponse.ts");
const studentPolicyPath = join(
  rootDirectory,
  "apps/student/src/services/studentSummaryDataPolicy.ts",
);
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));
const { buildSuccessResponse: buildAdminQuestionBulkSuccessResponse } = require(
  join(rootDirectory, "functions/lib/api/adminQuestionsBulk.js"),
);
const { buildSubmissionSuccessResponse } = require(
  join(rootDirectory, "functions/lib/api/examSessionSubmit.js"),
);
const { buildSuccessResponse: buildVendorCalibrationPushSuccessResponse } = require(
  join(rootDirectory, "functions/lib/api/vendorCalibrationPush.js"),
);

function loadTypeScriptModule(source, sourcePath) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const evaluate = new Function("exports", "module", transpiled);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

const [adapterSource, envelopeSource, studentPolicySource] = await Promise.all([
  readFile(adapterPath, "utf8"),
  readFile(envelopePath, "utf8"),
  readFile(studentPolicyPath, "utf8"),
]);
const adapters = loadTypeScriptModule(adapterSource, adapterPath);
const { unwrapApiSuccessData } = loadTypeScriptModule(envelopeSource, envelopePath);
const { assertStudentSummaryPayload } = loadTypeScriptModule(
  studentPolicySource,
  studentPolicyPath,
);

function successEnvelope(data, requestId) {
  return {
    code: "OK",
    data,
    message: "Request completed.",
    requestId,
    success: true,
    timestamp: "2026-08-08T15:30:00.000Z",
  };
}

test("Admin adapter accepts backend question-bulk data and rejects defaultable drift", () => {
  const backendData = {
    commitRequested: true,
    committed: true,
    rows: [
      {
        action: "create",
        errors: [],
        questionId: "question-001",
        rowNumber: 1,
        uniqueKey: "jee-physics-001",
        warnings: [],
      },
    ],
    summary: {
      created: 1,
      invalid: 0,
      received: 1,
      updated: 0,
      valid: 1,
      warnings: 0,
    },
    uploadLogId: "upload-001",
    uploadLogPath: "questionUploadLogs/upload-001",
  };

  const unwrapped = unwrapApiSuccessData(
    buildAdminQuestionBulkSuccessResponse(
      backendData,
      "req-admin-001",
      "2026-08-08T15:30:00.000Z",
    ),
  );
  assert.deepEqual(adapters.adaptAdminQuestionBulkResult(unwrapped), backendData);

  assert.throws(
    () => adapters.adaptAdminQuestionBulkResult({ committed: true }),
    {
      name: "PortalResponseValidationError",
      route: "POST /admin/questions/bulk",
    },
  );
});

test("Student adapter accepts summary data and rejects empty or raw-session payloads", () => {
  const expectedSummary = {
    avgAccuracyPercent: 81,
    avgRawScorePercent: 74,
    licenseLayer: "L1",
    recentResults: [],
    upcomingTests: [],
  };
  const unwrapped = unwrapApiSuccessData(
    successEnvelope(expectedSummary, "req-student-001"),
  );

  assert.equal(
    adapters.adaptStudentSummaryResult(unwrapped, "dashboard"),
    expectedSummary,
  );
  assert.doesNotThrow(() =>
    assertStudentSummaryPayload(unwrapped, "dashboard"));
  assert.throws(
    () => adapters.adaptStudentSummaryResult({}, "dashboard"),
    { name: "PortalResponseValidationError" },
  );
  assert.throws(
    () => assertStudentSummaryPayload(
      { student: { rawAnswers: [{ questionId: "q-1" }] } },
      "dashboard",
    ),
    /blocked raw-session field/,
  );
});

test("Exam adapter accepts the real submission result and rejects envelope/data drift", () => {
  const backendEnvelope = buildSubmissionSuccessResponse(
    {
      accuracyPercent: 81,
      disciplineIndex: 86,
      rawScorePercent: 74,
      riskState: "Stable",
      sessionPath: "institutes/inst-001/years/2026/sessions/session-001",
    },
    "req-exam-001",
    "2026-08-08T15:30:00.000Z",
  );
  const backendData = backendEnvelope.data;
  const unwrapped = unwrapApiSuccessData(backendEnvelope);

  assert.deepEqual(adapters.adaptExamSubmitResult(unwrapped), backendData);
  assert.throws(
    () => adapters.adaptExamSubmitResult({ data: backendData }),
    {
      name: "PortalResponseValidationError",
      route: "POST /exam/session/{sessionId}/submit",
    },
  );
});

test("Vendor adapter accepts calibration deployment data and rejects the legacy subset", () => {
  const backendData = {
    calibrationSourcePath: "calibrationVersions/cal-v2",
    deployedInstituteCount: 1,
    deployedInstitutes: [
      {
        calibrationHistoryPath: "institutes/inst-001/calibrationHistory/cal-v2",
        calibrationPath: "institutes/inst-001/config/calibration",
        compatibilityLicensePath: "institutes/inst-001/license/current",
        instituteId: "inst-001",
        licensePath: "institutes/inst-001/licenses/current",
      },
    ],
    deploymentLogId: "deployment-001",
    vendorCalibrationLogPath: "auditLogs/deployment-001",
    versionId: "cal-v2",
  };
  const unwrapped = unwrapApiSuccessData(
    buildVendorCalibrationPushSuccessResponse(
      backendData,
      "req-vendor-001",
      "2026-08-08T15:30:00.000Z",
    ),
  );

  assert.deepEqual(
    adapters.adaptVendorCalibrationPushResult(unwrapped),
    backendData,
  );
  assert.throws(
    () => adapters.adaptVendorCalibrationPushResult({
      deployedInstituteCount: 1,
      deploymentLogId: "deployment-001",
      vendorCalibrationLogPath: "auditLogs/deployment-001",
      versionId: "cal-v2",
    }),
    {
      name: "PortalResponseValidationError",
      route: "POST /vendor/calibration/push",
    },
  );
});

test("representative production callers invoke their portal adapters", async () => {
  assert.doesNotMatch(
    adapterSource,
    /FALLBACK|local-fallback|unknown\.local|new Date\(0\)/i,
    "portal response adapters must reject drift instead of synthesizing fixture-like values",
  );

  const sources = await Promise.all([
    readFile(
      join(
        rootDirectory,
        "apps/admin/src/features/tests/QuestionBankManagementPage.tsx",
      ),
      "utf8",
    ),
    readFile(
      join(rootDirectory, "apps/student/src/services/studentSummaryApi.ts"),
      "utf8",
    ),
    readFile(
      join(rootDirectory, "apps/exam/src/ExamRuntimeApp.tsx"),
      "utf8",
    ),
    readFile(
      join(
        rootDirectory,
        "apps/vendor/src/features/calibration/vendorCalibrationDataset.ts",
      ),
      "utf8",
    ),
  ]);

  for (const [index, adapterName] of [
    "adaptAdminQuestionBulkResult",
    "adaptStudentSummaryResult",
    "adaptExamSubmitResult",
    "adaptVendorCalibrationPushResult",
  ].entries()) {
    assert.match(sources[index], new RegExp(`${adapterName}\\(`));
  }
});
