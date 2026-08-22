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
const { buildSuccessResponse: buildAdminOverviewSuccessResponse } = require(
  join(rootDirectory, "functions/lib/api/adminOverview.js"),
);
const { buildSuccessResponse: buildAdminAnalyticsSuccessResponse } = require(
  join(rootDirectory, "functions/lib/api/adminAnalytics.js"),
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

test("Admin summary adapters accept real handler envelopes and reject field or data-tier drift", () => {
  const overviewData = {
    academicYear: "2026",
    computedAt: "2026-08-22T10:00:00.000Z",
    performanceGuarantees: {
      aggregationPolicy: "Summary-only read",
      maxSummaryDocumentsPerLoad: 8,
      payloadShape: "Small summary documents only",
      riskDistributionCacheCadence: "Daily",
      sourceCollections: ["runAnalytics", "studentYearMetrics"],
      targetLoadTimeMs: 300,
    },
    operationalSnapshot: {
      activeConcurrentSessions: 3,
      activeStudents: 137,
      billingCount: 137,
      lastTestCompletionRatePercent: 94,
      testsConducted: 12,
      testsScheduled: 2,
    },
    currentActivity: {
      activeTestSessions: 1,
      controlledModeCompliancePercentage: 86,
      lastFiveSubmissions: [{
        assessmentLabel: "Seeded Contract Run",
        studentName: "Seeded Student",
        submittedAt: "2026-08-22T09:00:00.000Z",
      }],
      liveBehaviorAlertCount: 2,
      liveRiskCount: 1,
      minTimeViolationsLive: 4,
      pacingDriftPercentage: 9,
      skipBurstPercentage: 5,
      studentsCurrentlyInTest: 31,
      upcomingTestLabel: "Seeded Contract Run - 2026-08-23 09:00",
    },
    performanceSummary: {
      accuracyDistributionHistogram: [{ label: "75-84", value: 1 }],
      avgAccuracyPercentage: 77,
      avgDisciplineIndex: 81,
      avgPhaseAdherencePercentage: 82,
      avgRawScorePercentage: 63,
      controlledModeImprovementDelta: 18,
      distributionHistogram: [{ label: "56-70", value: 1 }],
      easyNeglectPercentage: 7,
      executionStabilityBadge: "Stable",
      hardBiasPercentage: 6,
      highestPerformingBatch: "Seed Batch",
      lowestPerformingBatch: "Seed Batch",
      participationRate: 94,
      riskDistribution: "Low 0% · Medium 0% · High/Critical 100%",
      timeMisallocationPercentage: 8,
    },
    executionSummary: {
      controlledModeImpactCard: "Controlled mode improved discipline by +18% this month.",
      disciplineRegressionAlerts: 0,
      highRiskStudentCount: 1,
      mostCommonDiagnosticSignal: "Pacing drift",
      percentageStudentsWithRepeatedPattern: 100,
      phaseCompliancePercentage: 82,
      riskClusterBreakdown: "Low 0% · Medium 0% · High 100% · Critical 0%",
      topicWithHighestWeaknessCluster: "Seed Batch requires topic reinforcement.",
    },
    riskSnapshot: {
      disciplineIndex7DayTrend: "Upward",
      guessClusterPercentage: 13,
      overstayRatePercentage: 6,
      riskDistributionPie: "Low 0% · Medium 0% · High 100% · Critical 0%",
      topFiveStudentsRequiringAttention: [{
        riskState: "High",
        studentName: "Seeded Student",
      }],
    },
    governanceSnapshot: {
      disciplineTrajectoryIndicator: "Up",
      institutionalStabilityIndex: 88,
      miniTrendSparkline: "▆",
      monthOverMonthStabilityChange: 0,
      overrideFrequencyTrend: "Stable",
    },
    systemHealthAndLicensing: {
      academicYearLockStatus: "Unlocked",
      activeStudentCount: 137,
      currentLayerBadge: "L3",
      eligibilityL1Percentage: 100,
      eligibilityL2Percentage: 100,
      lastArchiveDate: "No archive recorded",
      peakConcurrencyThisMonth: 31,
      storageUsageSummary: "HOT Unknown; archive Unknown",
      upgradeAwarenessCard: "Full governance layer active.",
    },
  };
  const analyticsData = {
    monthlySummary: [],
    runAnalytics: [{
      academicYear: "2026",
      accuracyHistogram: [0, 0, 1, 0],
      avgAccuracyPercent: 77,
      avgPhaseAdherencePercent: 82,
      avgRawScorePercent: 63,
      batchId: "batch-seed",
      batchName: "Seed Batch",
      behaviorDistribution: {
        driftPronePercent: 9,
        overextendedPercent: 4,
        rushedPercent: 5,
      },
      completionRatePercent: 94,
      controlledCompliancePercent: 86,
      disciplineIndexAverage: 81,
      disciplineIndexDistribution: [0, 0, 0, 1],
      easyNeglectPercent: 7,
      followedPhaseSplitPercent: 82,
      guessRatePercent: 13,
      hardBiasPercent: 6,
      maxTimeViolationPercent: 2,
      medianRawScorePercent: 62,
      minTimeViolationPercent: 4,
      mode: "Controlled",
      pacingGuardrailViolationPercent: 9,
      participants: 31,
      rawScoreHistogram: [0, 0, 1, 0],
      rawScoreStdDeviation: 5,
      riskDistribution: { critical: 0, high: 1, low: 0, medium: 0 },
      runId: "run-seed",
      runName: "Seeded Contract Run",
      sectionAccuracyPercentages: [77],
      startedAt: "2026-08-22T09:00:00.000Z",
      structuralOverridePercent: 3,
      timeMisallocationPercent: 8,
      topicHeatmap: [77, 63, 82],
    }],
    studentYearMetrics: [{
      avgAccuracyPercent: 79,
      avgRawScorePercent: 65,
      batchId: "batch-seed",
      batchName: "Seed Batch",
      disciplineIndex: 81,
      disciplineIndexTrend: "up",
      guessRatePercent: 13,
      rollingRiskCluster: "high",
      studentId: "student-seed",
      studentName: "Seeded Student",
      testsAttempted: 4,
    }],
    templateAnalytics: [],
    yearBehaviorSummary: {
      academicYear: "2026",
      avgDisciplineIndex: 81,
      batchDiagnosticHeatmap: [],
      computedAt: "2026-08-22T09:00:00.000Z",
      consecutiveWrongClusterPercent: 100,
      controlledModeUsagePercent: 100,
      executionStabilityIndex: 46,
      guessProbabilityClusterPercent: 13,
      riskSignals: {
        percentEasyNeglect: 15,
        percentHardBias: 27,
        percentLatePhaseDrop: 14,
        percentPacingDrift: 20,
        percentRushedPattern: 19,
        percentTopicAvoidance: 100,
      },
      riskStateDistribution: {
        critical: 0,
        driftProne: 0,
        high: 1,
        impulsive: 0,
        low: 0,
        medium: 0,
        overextended: 57,
        stable: 0,
        volatile: 0,
      },
    },
    yearSummarySnapshots: [],
  };

  const overviewEnvelope = buildAdminOverviewSuccessResponse(
    overviewData,
    "req-overview-contract",
    "2026-08-22T10:00:00.000Z",
  );
  const analyticsEnvelope = buildAdminAnalyticsSuccessResponse(
    analyticsData,
    "req-analytics-contract",
    "2026-08-22T10:00:00.000Z",
  );

  assert.deepEqual(
    adapters.adaptAdminOverviewResult(unwrapApiSuccessData(overviewEnvelope)),
    overviewEnvelope.data,
  );
  assert.deepEqual(
    adapters.adaptAdminAnalyticsResult(unwrapApiSuccessData(analyticsEnvelope)),
    analyticsEnvelope.data,
  );
  assert.throws(
    () => adapters.adaptAdminOverviewResult({
      ...overviewData,
      performanceSummary: {
        ...overviewData.performanceSummary,
        accuracyDistributionHistogram: undefined,
      },
    }),
    { name: "PortalResponseValidationError", route: "GET /admin/overview" },
  );
  assert.throws(
    () => adapters.adaptAdminAnalyticsResult({
      ...analyticsData,
      runAnalytics: [{ ...analyticsData.runAnalytics[0], rawAnswers: [] }],
    }),
    { name: "PortalResponseValidationError", route: "GET /admin/analytics" },
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
      join(rootDirectory, "apps/admin/src/features/overview/adminOverviewDataset.ts"),
      "utf8",
    ),
    readFile(
      join(rootDirectory, "apps/admin/src/features/analytics/analyticsDataset.ts"),
      "utf8",
    ),
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
    "adaptAdminOverviewResult",
    "adaptAdminAnalyticsResult",
    "adaptAdminQuestionBulkResult",
    "adaptStudentSummaryResult",
    "adaptExamSubmitResult",
    "adaptVendorCalibrationPushResult",
  ].entries()) {
    assert.match(sources[index], new RegExp(`${adapterName}(?:<[^>]+>)?\\(`));
  }
});
