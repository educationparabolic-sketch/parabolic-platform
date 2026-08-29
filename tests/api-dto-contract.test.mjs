import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const sharedContractPath = join(rootDirectory, "shared/contracts/apiDtos.d.ts");

const dtoFamilies = [
  {
    backend: "functions/src/types/adminStudentOnboardingResend.ts",
    frontend: [
      "apps/admin/src/features/students/StudentManagementPage.tsx",
      "apps/admin/src/features/students/StudentProfilePage.tsx",
    ],
    names: [
      "AdminStudentOnboardingResendRequest",
      "AdminStudentOnboardingResendResult",
    ],
  },
  {
    backend: "functions/src/types/studentBulkIngestion.ts",
    frontend: ["apps/admin/src/features/students/StudentManagementPage.tsx"],
    names: [
      "StudentBulkIngestionStudentInput",
      "StudentBulkIngestionRequest",
      "StudentBulkIngestionRowAction",
      "StudentBulkIngestionRowResult",
      "StudentBulkIngestionSummary",
      "StudentBulkIngestionResult",
    ],
  },
  {
    backend: "functions/src/types/interventionTools.ts",
    frontend: ["apps/admin/src/features/insights/interventionDataset.ts"],
    names: [
      "InterventionActionType",
      "InterventionOutcomeStatus",
      "AdminInterventionRequest",
      "InterventionActionRecord",
      "AdminInterventionResult",
    ],
  },
  {
    backend: "functions/src/types/questionBulkUpload.ts",
    frontend: [
      "apps/admin/src/features/tests/QuestionBankManagementPage.tsx",
    ],
    names: [
      "QuestionBulkUploadQuestionInput",
      "QuestionBulkUploadRequest",
      "QuestionBulkUploadRowAction",
      "QuestionBulkUploadRowResult",
      "QuestionBulkUploadSummary",
      "QuestionBulkUploadResult",
    ],
  },
  {
    backend: "functions/src/types/questionAssetUpload.ts",
    frontend: [
      "apps/admin/src/features/tests/QuestionBankManagementPage.tsx",
    ],
    names: [
      "QuestionAssetExtension",
      "QuestionAssetKind",
      "QuestionAssetUploadRequest",
      "QuestionAssetUploadResult",
    ],
  },
  {
    backend: "functions/src/types/adminQuestionLibrary.ts",
    frontend: [
      "apps/admin/src/features/tests/AdminQuestionBankLibraryPage.tsx",
    ],
    names: [
      "AdminQuestionLibraryRecord",
      "AdminQuestionLibraryResult",
    ],
  },
  {
    backend: "functions/src/types/adminTests.ts",
    frontend: [
      "apps/admin/src/features/tests/TestTemplateManagementPage.tsx",
    ],
    names: [
      "AdminTestTemplateStatus",
      "AdminTestSelectionMethod",
      "AdminTestDifficultyDistribution",
      "AdminTestTimingWindow",
      "AdminTestTimingProfile",
      "AdminTestExamSnapshot",
      "AdminTestPhaseSplitRow",
      "AdminTestPhaseConfigSnapshot",
      "AdminTestTemplateRecord",
      "AdminTestTemplateCreateRequest",
      "AdminTestTemplateListResult",
      "AdminTestTemplateCreateResult",
      "AdminTestTemplateUpdateRequest",
      "AdminTestTemplateUpdateResult",
      "AdminTestTemplateLifecycleRequest",
      "AdminTestTemplateLifecycleResult",
    ],
  },
  {
    backend: "functions/src/types/adminRuns.ts",
    frontend: [
      "apps/admin/src/features/assignments/AssignmentManagementPage.tsx",
    ],
    names: [
      "AdminRunMode",
      "AdminRunProctoringPolicy",
      "AdminRunCreateRequest",
      "AdminRunRecord",
      "AdminRunCreateResult",
    ],
  },
  {
    backend: "functions/src/types/adminRuns.ts",
    frontend: [
      "apps/admin/src/features/assignments/assignmentRunsApi.ts",
    ],
    names: [
      "AdminRunStatus",
      "AdminRunListResult",
      "AdminRunDetailResult",
    ],
  },
  {
    backend: "functions/src/types/studentSummary.ts",
    frontend: [
      "apps/student/src/features/dashboard/studentDashboardDataset.ts",
      "apps/student/src/features/my-tests/studentMyTestsDataset.ts",
    ],
    names: [
      "StudentLicenseLayer",
      "StudentRiskState",
      "StudentDashboardTrendPoint",
      "StudentDashboardUpcomingTest",
      "StudentDashboardRecentResult",
      "StudentDashboardResult",
      "StudentTestStatus",
      "StudentTestRecord",
      "StudentTestsResult",
    ],
  },
  {
    backend: "functions/src/types/sessionStart.ts",
    frontend: [
      "apps/student/src/features/my-tests/studentMyTestsDataset.ts",
    ],
    names: [
      "StudentExamLaunchIntent",
      "StudentExamLaunchDisposition",
      "StudentExamSessionStatus",
      "StudentExamLaunchRequest",
      "StudentExamLaunchResult",
    ],
  },
  {
    backend: "functions/src/types/calibrationDeployment.ts",
    frontend: [
      "apps/vendor/src/features/calibration/vendorCalibrationDataset.ts",
    ],
    names: [
      "VendorCalibrationPushRequest",
      "DeployedInstituteCalibrationResult",
      "DeployCalibrationVersionResult",
    ],
  },
];

function declarationPattern(name) {
  return new RegExp(`export\\s+(?:interface|type)\\s+${name}\\b`);
}

function localDeclarationPattern(name) {
  return new RegExp(`(?:interface|type)\\s+${name}\\b`);
}

test("aligned frontend and Functions DTOs have one shared source", async () => {
  const sharedSource = await readFile(sharedContractPath, "utf8");

  assert.doesNotMatch(
    sharedSource,
    /^\s*import\b/m,
    "shared transport declarations must remain portable across portal and Functions builds",
  );

  for (const family of dtoFamilies) {
    const backendPath = join(rootDirectory, family.backend);
    const frontendPaths = family.frontend.map((path) => join(rootDirectory, path));
    const [backendSource, ...frontendSources] = await Promise.all([
      readFile(backendPath, "utf8"),
      ...frontendPaths.map((path) => readFile(path, "utf8")),
    ]);

    assert.match(backendSource, /shared\/contracts\/apiDtos/);
    for (const frontendSource of frontendSources) {
      assert.match(frontendSource, /shared\/contracts\/apiDtos/);
    }

    for (const name of family.names) {
      assert.match(
        sharedSource,
        declarationPattern(name),
        `${name} must be declared by the shared API DTO contract`,
      );
      assert.doesNotMatch(
        backendSource,
        localDeclarationPattern(name),
        `${family.backend} must not redeclare ${name}`,
      );
      for (const [index, frontendSource] of frontendSources.entries()) {
        assert.doesNotMatch(
          frontendSource,
          localDeclarationPattern(name),
          `${family.frontend[index]} must not redeclare ${name}`,
        );
      }
    }
  }
});

test("portal requests use shared request DTO generics", async () => {
  const studentManagement = await readFile(
    join(
      rootDirectory,
      "apps/admin/src/features/students/StudentManagementPage.tsx",
    ),
    "utf8",
  );
  const studentProfile = await readFile(
    join(
      rootDirectory,
      "apps/admin/src/features/students/StudentProfilePage.tsx",
    ),
    "utf8",
  );
  const interventions = await readFile(
    join(
      rootDirectory,
      "apps/admin/src/features/insights/interventionDataset.ts",
    ),
    "utf8",
  );
  const questions = await readFile(
    join(
      rootDirectory,
      "apps/admin/src/features/tests/QuestionBankManagementPage.tsx",
    ),
    "utf8",
  );

  assert.match(studentManagement, /AdminStudentOnboardingResendRequest>/);
  assert.match(studentManagement, /StudentBulkIngestionRequest>/);
  assert.match(studentProfile, /AdminStudentOnboardingResendRequest>/);
  assert.match(interventions, /AdminInterventionRequest>/g);
  assert.match(questions, /QuestionBulkUploadRequest>/);

  const calibration = await readFile(
    join(
      rootDirectory,
      "apps/vendor/src/features/calibration/vendorCalibrationDataset.ts",
    ),
    "utf8",
  );
  assert.match(calibration, /VendorCalibrationPushRequest/);
});
