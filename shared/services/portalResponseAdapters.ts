import type {
  AdminQuestionLibraryResult,
  AdminRunCreateResult,
  AdminRunDetailResult,
  AdminRunListResult,
  AdminRunRecord,
  AdminTestPhaseConfigSnapshot,
  AdminTestTemplateCreateResult,
  AdminTestTemplateLifecycleResult,
  AdminTestTemplateListResult,
  AdminTestTemplateRecord,
  AdminTestTemplateUpdateResult,
  AdminTestTimingProfile,
  AdminTestTimingWindow,
  DeployCalibrationVersionResult,
  QuestionAssetUploadResult,
  QuestionBulkUploadResult,
  StudentDashboardRecentResult,
  StudentDashboardResult,
  StudentDashboardTrendPoint,
  StudentDashboardUpcomingTest,
  StudentControlledModeComparison,
  StudentInsightPattern,
  StudentInsightsResult,
  StudentInsightSnapshot,
  StudentPerformancePoint,
  StudentPerformanceResult,
  StudentSolutionItem,
  StudentSolutionsResult,
  StudentTestRecord,
  StudentTestsResult,
  StudentTopicPerformanceEntry,
  StudentTopicWeaknessInsight,
} from "../contracts/apiDtos";

type StudentSummaryResource =
  | "dashboard"
  | "tests"
  | "performance"
  | "insights"
  | "solutions";

type ExamSubmissionRiskState =
  | "Stable"
  | "Drift-Prone"
  | "Impulsive"
  | "Overextended"
  | "Volatile";

type ExamSessionStatus =
  | "created"
  | "started"
  | "active"
  | "submitted"
  | "expired"
  | "terminated";

export interface ExamSubmitAdapterResult {
  accuracyPercent: number;
  alreadySubmitted?: boolean;
  disciplineIndex: number;
  operationalDataAccessPolicy: Record<string, unknown>;
  rawScorePercent: number;
  riskState: ExamSubmissionRiskState;
  status?: ExamSessionStatus;
  submittedAt?: string;
}

export class PortalResponseValidationError extends Error {
  public readonly route: string;

  constructor(
    route: string,
    message: string,
  ) {
    super(`${route} ${message}`);
    this.name = "PortalResponseValidationError";
    this.route = route;
  }
}

function fail(route: string, field: string, expectation: string): never {
  throw new PortalResponseValidationError(
    route,
    `returned invalid field "${field}"; expected ${expectation}.`,
  );
}

function readRecord(
  value: unknown,
  route: string,
  field = "data",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(route, field, "an object");
  }

  return value as Record<string, unknown>;
}

function readBoolean(
  value: unknown,
  route: string,
  field: string,
): boolean {
  if (typeof value !== "boolean") {
    return fail(route, field, "a boolean");
  }

  return value;
}

function readNumber(
  value: unknown,
  route: string,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(route, field, "a finite number");
  }

  return value;
}

function readPositiveInteger(
  value: unknown,
  route: string,
  field: string,
): number {
  const parsed = readNumber(value, route, field);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fail(route, field, "a positive integer");
  }

  return parsed;
}

function readNonNegativeInteger(
  value: unknown,
  route: string,
  field: string,
): number {
  const parsed = readNumber(value, route, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fail(route, field, "a non-negative integer");
  }

  return parsed;
}

function readString(
  value: unknown,
  route: string,
  field: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(route, field, "a non-empty string");
  }

  return value;
}

function readStringAllowEmpty(
  value: unknown,
  route: string,
  field: string,
): string {
  if (typeof value !== "string") {
    return fail(route, field, "a string");
  }

  return value;
}

function readNullableString(
  value: unknown,
  route: string,
  field: string,
): string | null {
  if (value === null) {
    return null;
  }

  return readString(value, route, field);
}

function readNullableNumber(
  value: unknown,
  route: string,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }

  return readNumber(value, route, field);
}

function readStringArray(
  value: unknown,
  route: string,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return fail(route, field, "an array of strings");
  }

  return value;
}

function readArray(
  value: unknown,
  route: string,
  field: string,
): unknown[] {
  if (!Array.isArray(value)) {
    return fail(route, field, "an array");
  }

  return value;
}

function readNumberArray(
  value: unknown,
  route: string,
  field: string,
): number[] {
  return readArray(value, route, field).map((entry, index) =>
    readNumber(entry, route, `${field}[${index}]`));
}

function readEnum<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  route: string,
  field: string,
): TValue {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    return fail(route, field, allowed.map((entry) => `"${entry}"`).join(", "));
  }

  return value as TValue;
}

const RAW_SESSION_FIELDS = new Set([
  "answers",
  "answerEvents",
  "questionEvents",
  "rawAnswers",
  "rawAttempts",
  "sessionEvents",
  "sessionSnapshot",
]);

function assertSummaryOnly(
  value: unknown,
  route: string,
  field = "data",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSummaryOnly(entry, route, `${field}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (RAW_SESSION_FIELDS.has(key)) {
      fail(route, `${field}.${key}`, "summary-only data");
    }
    assertSummaryOnly(entry, route, `${field}.${key}`);
  }
}

function validateNumberFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  route: string,
  prefix: string,
): void {
  fields.forEach((field) =>
    readNumber(record[field], route, `${prefix}.${field}`));
}

function validateStringFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  route: string,
  prefix: string,
): void {
  fields.forEach((field) =>
    readString(record[field], route, `${prefix}.${field}`));
}

function validateDistributionBins(
  value: unknown,
  route: string,
  field: string,
): void {
  readArray(value, route, field).forEach((entry, index) => {
    const prefix = `${field}[${index}]`;
    const record = readRecord(entry, route, prefix);
    readString(record.label, route, `${prefix}.label`);
    readNumber(record.value, route, `${prefix}.value`);
  });
}

export function adaptAdminOverviewResult<TSnapshot>(value: unknown): TSnapshot {
  const route = "GET /admin/overview";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  validateStringFields(data, ["academicYear", "computedAt"], route, "data");

  const guarantees = readRecord(data.performanceGuarantees, route, "performanceGuarantees");
  validateStringFields(
    guarantees,
    ["aggregationPolicy", "payloadShape", "riskDistributionCacheCadence"],
    route,
    "performanceGuarantees",
  );
  validateNumberFields(
    guarantees,
    ["maxSummaryDocumentsPerLoad", "targetLoadTimeMs"],
    route,
    "performanceGuarantees",
  );
  readStringArray(guarantees.sourceCollections, route, "performanceGuarantees.sourceCollections");

  const operational = readRecord(data.operationalSnapshot, route, "operationalSnapshot");
  validateNumberFields(
    operational,
    [
      "activeConcurrentSessions",
      "activeStudents",
      "billingCount",
      "lastTestCompletionRatePercent",
      "testsConducted",
      "testsScheduled",
    ],
    route,
    "operationalSnapshot",
  );

  const activity = readRecord(data.currentActivity, route, "currentActivity");
  validateNumberFields(
    activity,
    [
      "activeTestSessions",
      "controlledModeCompliancePercentage",
      "liveBehaviorAlertCount",
      "liveRiskCount",
      "minTimeViolationsLive",
      "pacingDriftPercentage",
      "skipBurstPercentage",
      "studentsCurrentlyInTest",
    ],
    route,
    "currentActivity",
  );
  readString(activity.upcomingTestLabel, route, "currentActivity.upcomingTestLabel");
  readArray(activity.lastFiveSubmissions, route, "currentActivity.lastFiveSubmissions")
    .forEach((entry, index) => {
      const prefix = `currentActivity.lastFiveSubmissions[${index}]`;
      const record = readRecord(entry, route, prefix);
      validateStringFields(
        record,
        ["assessmentLabel", "studentName", "submittedAt"],
        route,
        prefix,
      );
    });

  const performance = readRecord(data.performanceSummary, route, "performanceSummary");
  validateNumberFields(
    performance,
    [
      "avgAccuracyPercentage",
      "avgDisciplineIndex",
      "avgPhaseAdherencePercentage",
      "avgRawScorePercentage",
      "controlledModeImprovementDelta",
      "easyNeglectPercentage",
      "hardBiasPercentage",
      "participationRate",
      "timeMisallocationPercentage",
    ],
    route,
    "performanceSummary",
  );
  validateStringFields(
    performance,
    ["highestPerformingBatch", "lowestPerformingBatch", "riskDistribution"],
    route,
    "performanceSummary",
  );
  readEnum(
    performance.executionStabilityBadge,
    ["Stable", "Moderate", "HighVariance"] as const,
    route,
    "performanceSummary.executionStabilityBadge",
  );
  validateDistributionBins(
    performance.distributionHistogram,
    route,
    "performanceSummary.distributionHistogram",
  );
  validateDistributionBins(
    performance.accuracyDistributionHistogram,
    route,
    "performanceSummary.accuracyDistributionHistogram",
  );

  const execution = readRecord(data.executionSummary, route, "executionSummary");
  validateNumberFields(
    execution,
    [
      "disciplineRegressionAlerts",
      "highRiskStudentCount",
      "percentageStudentsWithRepeatedPattern",
      "phaseCompliancePercentage",
    ],
    route,
    "executionSummary",
  );
  validateStringFields(
    execution,
    [
      "controlledModeImpactCard",
      "mostCommonDiagnosticSignal",
      "riskClusterBreakdown",
      "topicWithHighestWeaknessCluster",
    ],
    route,
    "executionSummary",
  );

  const risk = readRecord(data.riskSnapshot, route, "riskSnapshot");
  validateNumberFields(
    risk,
    ["guessClusterPercentage", "overstayRatePercentage"],
    route,
    "riskSnapshot",
  );
  validateStringFields(
    risk,
    ["disciplineIndex7DayTrend", "riskDistributionPie"],
    route,
    "riskSnapshot",
  );
  readArray(risk.topFiveStudentsRequiringAttention, route, "riskSnapshot.topFiveStudentsRequiringAttention")
    .forEach((entry, index) => {
      const prefix = `riskSnapshot.topFiveStudentsRequiringAttention[${index}]`;
      validateStringFields(
        readRecord(entry, route, prefix),
        ["riskState", "studentName"],
        route,
        prefix,
      );
    });

  const governance = readRecord(data.governanceSnapshot, route, "governanceSnapshot");
  validateNumberFields(
    governance,
    ["institutionalStabilityIndex", "monthOverMonthStabilityChange"],
    route,
    "governanceSnapshot",
  );
  validateStringFields(
    governance,
    ["miniTrendSparkline", "overrideFrequencyTrend"],
    route,
    "governanceSnapshot",
  );
  readEnum(
    governance.disciplineTrajectoryIndicator,
    ["Up", "Down", "Stable"] as const,
    route,
    "governanceSnapshot.disciplineTrajectoryIndicator",
  );

  const system = readRecord(data.systemHealthAndLicensing, route, "systemHealthAndLicensing");
  validateNumberFields(
    system,
    [
      "activeStudentCount",
      "eligibilityL1Percentage",
      "eligibilityL2Percentage",
      "peakConcurrencyThisMonth",
    ],
    route,
    "systemHealthAndLicensing",
  );
  validateStringFields(
    system,
    [
      "academicYearLockStatus",
      "lastArchiveDate",
      "storageUsageSummary",
      "upgradeAwarenessCard",
    ],
    route,
    "systemHealthAndLicensing",
  );
  readEnum(
    system.currentLayerBadge,
    ["L0", "L1", "L2", "L3"] as const,
    route,
    "systemHealthAndLicensing.currentLayerBadge",
  );

  return value as TSnapshot;
}

function validateRiskDistribution(
  value: unknown,
  route: string,
  field: string,
): void {
  const record = readRecord(value, route, field);
  validateNumberFields(record, ["critical", "high", "low", "medium"], route, field);
}

function validateRiskSignals(
  value: unknown,
  route: string,
  field: string,
): void {
  validateNumberFields(
    readRecord(value, route, field),
    [
      "percentEasyNeglect",
      "percentHardBias",
      "percentLatePhaseDrop",
      "percentPacingDrift",
      "percentRushedPattern",
      "percentTopicAvoidance",
    ],
    route,
    field,
  );
}

function validateYearBehaviorSummary(
  value: unknown,
  route: string,
  field: string,
): void {
  const record = readRecord(value, route, field);
  validateStringFields(record, ["academicYear", "computedAt"], route, field);
  validateNumberFields(
    record,
    [
      "avgDisciplineIndex",
      "consecutiveWrongClusterPercent",
      "controlledModeUsagePercent",
      "executionStabilityIndex",
      "guessProbabilityClusterPercent",
    ],
    route,
    field,
  );
  validateRiskSignals(record.riskSignals, route, `${field}.riskSignals`);
  validateNumberFields(
    readRecord(record.riskStateDistribution, route, `${field}.riskStateDistribution`),
    [
      "critical",
      "driftProne",
      "high",
      "impulsive",
      "low",
      "medium",
      "overextended",
      "stable",
      "volatile",
    ],
    route,
    `${field}.riskStateDistribution`,
  );
  readArray(record.batchDiagnosticHeatmap, route, `${field}.batchDiagnosticHeatmap`)
    .forEach((entry, index) => {
      const prefix = `${field}.batchDiagnosticHeatmap[${index}]`;
      const batch = readRecord(entry, route, prefix);
      validateStringFields(batch, ["batchId", "batchName"], route, prefix);
      validateRiskSignals(batch, route, prefix);
    });
}

export function adaptAdminAnalyticsResult<TSnapshot>(value: unknown): TSnapshot {
  const route = "GET /admin/analytics";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);

  readArray(data.runAnalytics, route, "runAnalytics").forEach((entry, index) => {
    const prefix = `runAnalytics[${index}]`;
    const record = readRecord(entry, route, prefix);
    validateStringFields(
      record,
      ["academicYear", "batchId", "batchName", "mode", "runId", "runName", "startedAt"],
      route,
      prefix,
    );
    validateNumberFields(
      record,
      [
        "avgAccuracyPercent",
        "avgPhaseAdherencePercent",
        "avgRawScorePercent",
        "completionRatePercent",
        "controlledCompliancePercent",
        "disciplineIndexAverage",
        "easyNeglectPercent",
        "followedPhaseSplitPercent",
        "guessRatePercent",
        "hardBiasPercent",
        "maxTimeViolationPercent",
        "medianRawScorePercent",
        "minTimeViolationPercent",
        "pacingGuardrailViolationPercent",
        "participants",
        "rawScoreStdDeviation",
        "structuralOverridePercent",
        "timeMisallocationPercent",
      ],
      route,
      prefix,
    );
    [
      "accuracyHistogram",
      "disciplineIndexDistribution",
      "rawScoreHistogram",
      "sectionAccuracyPercentages",
      "topicHeatmap",
    ].forEach((field) =>
      readNumberArray(record[field], route, `${prefix}.${field}`));
    validateRiskDistribution(record.riskDistribution, route, `${prefix}.riskDistribution`);
    validateNumberFields(
      readRecord(record.behaviorDistribution, route, `${prefix}.behaviorDistribution`),
      ["driftPronePercent", "overextendedPercent", "rushedPercent"],
      route,
      `${prefix}.behaviorDistribution`,
    );
  });

  readArray(data.studentYearMetrics, route, "studentYearMetrics")
    .forEach((entry, index) => {
      const prefix = `studentYearMetrics[${index}]`;
      const record = readRecord(entry, route, prefix);
      validateStringFields(
        record,
        ["batchId", "batchName", "studentId", "studentName"],
        route,
        prefix,
      );
      validateNumberFields(
        record,
        [
          "avgAccuracyPercent",
          "avgRawScorePercent",
          "disciplineIndex",
          "guessRatePercent",
          "testsAttempted",
        ],
        route,
        prefix,
      );
      readEnum(
        record.disciplineIndexTrend,
        ["down", "stable", "up"] as const,
        route,
        `${prefix}.disciplineIndexTrend`,
      );
      readEnum(
        record.rollingRiskCluster,
        ["critical", "high", "low", "medium"] as const,
        route,
        `${prefix}.rollingRiskCluster`,
      );
    });

  readArray(data.monthlySummary, route, "monthlySummary").forEach((entry, index) => {
    const prefix = `monthlySummary[${index}]`;
    const record = readRecord(entry, route, prefix);
    validateStringFields(record, ["monthId", "monthLabel"], route, prefix);
    validateNumberFields(
      record,
      [
        "avgAccuracyPercent",
        "avgRawScorePercent",
        "controlledModeEffectivenessPercent",
        "disciplineIndexPercent",
        "easyNeglectPercent",
        "participationRatePercent",
        "phaseAdherencePercent",
        "stabilityTrajectoryPercent",
        "topicWeaknessPercent",
      ],
      route,
      prefix,
    );
    validateRiskDistribution(record.riskDistributionTrend, route, `${prefix}.riskDistributionTrend`);
  });

  readArray(data.templateAnalytics, route, "templateAnalytics")
    .forEach((entry, index) => {
      const prefix = `templateAnalytics[${index}]`;
      const record = readRecord(entry, route, prefix);
      validateStringFields(
        record,
        ["academicYear", "examType", "templateId", "templateName"],
        route,
        prefix,
      );
      validateNumberFields(
        record,
        [
          "avgAccuracyPercent",
          "avgDisciplineIndex",
          "avgDisciplineStressScore",
          "avgRawScorePercent",
          "avgRiskShiftPercent",
          "phaseAdherenceVariance",
          "rawVariance",
          "templateEffectivenessRating",
          "totalRuns",
        ],
        route,
        prefix,
      );
      readArray(record.runs, route, `${prefix}.runs`).forEach((runEntry, runIndex) => {
        const runPrefix = `${prefix}.runs[${runIndex}]`;
        const run = readRecord(runEntry, route, runPrefix);
        validateStringFields(
          run,
          ["completedOn", "mode", "runId", "runName"],
          route,
          runPrefix,
        );
        validateNumberFields(
          run,
          [
            "avgAccuracyPercent",
            "avgRawScorePercent",
            "disciplineStressScore",
            "phaseAdherencePercent",
            "riskShiftPercent",
            "stabilityIndex",
          ],
          route,
          runPrefix,
        );
      });
    });

  validateYearBehaviorSummary(data.yearBehaviorSummary, route, "yearBehaviorSummary");
  readArray(data.yearSummarySnapshots, route, "yearSummarySnapshots")
    .forEach((entry, index) =>
      validateYearBehaviorSummary(entry, route, `yearSummarySnapshots[${index}]`));

  return value as TSnapshot;
}

export function adaptAdminQuestionBulkResult(
  value: unknown,
): QuestionBulkUploadResult {
  const route = "POST /admin/questions/bulk";
  const data = readRecord(value, route);

  if (!Array.isArray(data.rows)) {
    return fail(route, "rows", "an array");
  }

  const rows = data.rows.map((value, index) => {
    const field = `rows[${index}]`;
    const row = readRecord(value, route, field);
    const action = row.action;
    if (action !== "create" && action !== "update" && action !== "none") {
      return fail(route, `${field}.action`, '"create", "update", or "none"');
    }
    const validatedAction: "create" | "update" | "none" = action;

    return {
      action: validatedAction,
      errors: readStringArray(row.errors, route, `${field}.errors`),
      questionId: readNullableString(row.questionId, route, `${field}.questionId`),
      rowNumber: readNumber(row.rowNumber, route, `${field}.rowNumber`),
      uniqueKey: readNullableString(row.uniqueKey, route, `${field}.uniqueKey`),
      version: readPositiveInteger(row.version, route, `${field}.version`),
      warnings: readStringArray(row.warnings, route, `${field}.warnings`),
    };
  });
  const summary = readRecord(data.summary, route, "summary");

  return {
    commitRequested: readBoolean(data.commitRequested, route, "commitRequested"),
    committed: readBoolean(data.committed, route, "committed"),
    rows,
    summary: {
      created: readNumber(summary.created, route, "summary.created"),
      invalid: readNumber(summary.invalid, route, "summary.invalid"),
      received: readNumber(summary.received, route, "summary.received"),
      updated: readNumber(summary.updated, route, "summary.updated"),
      valid: readNumber(summary.valid, route, "summary.valid"),
      warnings: readNumber(summary.warnings, route, "summary.warnings"),
    },
    uploadLogId: readNullableString(data.uploadLogId, route, "uploadLogId"),
    uploadLogPath: readNullableString(data.uploadLogPath, route, "uploadLogPath"),
  };
}

function adaptAdminTestTimingWindow(
  value: unknown,
  route: string,
  field: string,
): AdminTestTimingWindow {
  const window = readRecord(value, route, field);
  const minSeconds = readPositiveInteger(
    window.minSeconds,
    route,
    `${field}.minSeconds`,
  );
  const recommendedSeconds = readPositiveInteger(
    window.recommendedSeconds,
    route,
    `${field}.recommendedSeconds`,
  );
  const maxSeconds = readPositiveInteger(
    window.maxSeconds,
    route,
    `${field}.maxSeconds`,
  );

  if (minSeconds > recommendedSeconds || recommendedSeconds > maxSeconds) {
    return fail(
      route,
      field,
      "minSeconds <= recommendedSeconds <= maxSeconds",
    );
  }

  return {maxSeconds, minSeconds, recommendedSeconds};
}

function adaptAdminTestTimingProfile(
  value: unknown,
  route: string,
  field: string,
): AdminTestTimingProfile {
  const profile = readRecord(value, route, field);
  return {
    easy: adaptAdminTestTimingWindow(profile.easy, route, `${field}.easy`),
    hard: adaptAdminTestTimingWindow(profile.hard, route, `${field}.hard`),
    medium: adaptAdminTestTimingWindow(profile.medium, route, `${field}.medium`),
  };
}

function adaptAdminTestPhaseConfigSnapshot(
  value: unknown,
  route: string,
  field: string,
): AdminTestPhaseConfigSnapshot {
  const snapshot = readRecord(value, route, field);
  const weights = readRecord(
    snapshot.difficultyWeights,
    route,
    `${field}.difficultyWeights`,
  );

  return {
    difficultyWeights: {
      easy: readNumber(weights.easy, route, `${field}.difficultyWeights.easy`),
      hard: readNumber(weights.hard, route, `${field}.difficultyWeights.hard`),
      medium: readNumber(
        weights.medium,
        route,
        `${field}.difficultyWeights.medium`,
      ),
    },
    phaseSplit: readArray(snapshot.phaseSplit, route, `${field}.phaseSplit`)
      .map((entry, index) => {
        const rowField = `${field}.phaseSplit[${index}]`;
        const row = readRecord(entry, route, rowField);
        return {
          difficulty: readEnum(
            row.difficulty,
            ["easy", "medium", "hard"] as const,
            route,
            `${rowField}.difficulty`,
          ),
          focus: readString(row.focus, route, `${rowField}.focus`),
          load: readNumber(row.load, route, `${rowField}.load`),
          minutes: readNumber(row.minutes, route, `${rowField}.minutes`),
          percent: readNumber(row.percent, route, `${rowField}.percent`),
          phase: readString(row.phase, route, `${rowField}.phase`),
          questionCount: readNumber(
            row.questionCount,
            route,
            `${rowField}.questionCount`,
          ),
          weight: readNumber(row.weight, route, `${rowField}.weight`),
        };
      }),
    totalLoad: readNumber(snapshot.totalLoad, route, `${field}.totalLoad`),
  };
}

function adaptAdminTestTemplateRecord(
  value: unknown,
  route: string,
  field: string,
): AdminTestTemplateRecord {
  const record = readRecord(value, route, field);
  const difficulty = readRecord(
    record.difficultyDistribution,
    route,
    `${field}.difficultyDistribution`,
  );
  const examSnapshot = readRecord(
    record.examSnapshot,
    route,
    `${field}.examSnapshot`,
  );

  return {
    canonicalId: readString(record.canonicalId, route, `${field}.canonicalId`),
    difficultyDistribution: {
      easy: readNumber(
        difficulty.easy,
        route,
        `${field}.difficultyDistribution.easy`,
      ),
      hard: readNumber(
        difficulty.hard,
        route,
        `${field}.difficultyDistribution.hard`,
      ),
      medium: readNumber(
        difficulty.medium,
        route,
        `${field}.difficultyDistribution.medium`,
      ),
    },
    examSnapshot: {
      defaultDurationMinutes: readPositiveInteger(
        examSnapshot.defaultDurationMinutes,
        route,
        `${field}.examSnapshot.defaultDurationMinutes`,
      ),
      difficultyTimingMapping: adaptAdminTestTimingProfile(
        examSnapshot.difficultyTimingMapping,
        route,
        `${field}.examSnapshot.difficultyTimingMapping`,
      ),
      markingScheme: readString(
        examSnapshot.markingScheme,
        route,
        `${field}.examSnapshot.markingScheme`,
      ),
      sectionStructure: readStringArray(
        examSnapshot.sectionStructure,
        route,
        `${field}.examSnapshot.sectionStructure`,
      ),
    },
    examType: readString(record.examType, route, `${field}.examType`),
    id: readString(record.id, route, `${field}.id`),
    phaseConfigSnapshot: adaptAdminTestPhaseConfigSnapshot(
      record.phaseConfigSnapshot,
      route,
      `${field}.phaseConfigSnapshot`,
    ),
    selectedQuestionIds: readStringArray(
      record.selectedQuestionIds,
      route,
      `${field}.selectedQuestionIds`,
    ),
    selectionMethod: readEnum(
      record.selectionMethod,
      [
        "manual",
        "shuffle_slice",
        "offset_limit",
        "round_robin",
        "upload_set",
      ] as const,
      route,
      `${field}.selectionMethod`,
    ),
    status: readEnum(
      record.status,
      ["draft", "ready", "assigned", "archived", "deprecated"] as const,
      route,
      `${field}.status`,
    ),
    templateName: readString(
      record.templateName,
      route,
      `${field}.templateName`,
    ),
    timingProfile: adaptAdminTestTimingProfile(
      record.timingProfile,
      route,
      `${field}.timingProfile`,
    ),
    totalDurationMinutes: readPositiveInteger(
      record.totalDurationMinutes,
      route,
      `${field}.totalDurationMinutes`,
    ),
    totalRuns: readNumber(record.totalRuns, route, `${field}.totalRuns`),
    updatedAt: readString(record.updatedAt, route, `${field}.updatedAt`),
    version: readPositiveInteger(record.version, route, `${field}.version`),
  };
}

export function adaptAdminTestTemplateListResult(
  value: unknown,
): AdminTestTemplateListResult {
  const route = "GET /admin/tests";
  return readArray(value, route, "data").map((entry, index) =>
    adaptAdminTestTemplateRecord(entry, route, `data[${index}]`));
}

export function adaptAdminTestTemplateCreateResult(
  value: unknown,
): AdminTestTemplateCreateResult {
  const route = "POST /admin/tests";
  const data = readRecord(value, route);
  return {
    template: adaptAdminTestTemplateRecord(
      data.template,
      route,
      "template",
    ),
  };
}

export function adaptAdminTestTemplateUpdateResult(
  value: unknown,
): AdminTestTemplateUpdateResult {
  const route = "PATCH /admin/tests/{testId}";
  const data = readRecord(value, route);
  return {
    template: adaptAdminTestTemplateRecord(
      data.template,
      route,
      "template",
    ),
  };
}

function adaptAdminTestTemplateLifecycleResult(
  value: unknown,
  route: string,
): AdminTestTemplateLifecycleResult {
  const data = readRecord(value, route);
  return {
    auditId: readString(data.auditId, route, "auditId"),
    auditPath: readString(data.auditPath, route, "auditPath"),
    template: adaptAdminTestTemplateRecord(
      data.template,
      route,
      "template",
    ),
  };
}

export function adaptAdminTestTemplatePublishResult(
  value: unknown,
): AdminTestTemplateLifecycleResult {
  return adaptAdminTestTemplateLifecycleResult(
    value,
    "POST /admin/tests/{testId}/publish",
  );
}

export function adaptAdminTestTemplateArchiveResult(
  value: unknown,
): AdminTestTemplateLifecycleResult {
  return adaptAdminTestTemplateLifecycleResult(
    value,
    "POST /admin/tests/{testId}/archive",
  );
}

function adaptAdminRunRecord(
  value: unknown,
  route: string,
  field = "run",
): AdminRunRecord {
  const record = readRecord(value, route, field);
  const proctoring = readRecord(
    record.proctoringPolicy,
    route,
    `${field}.proctoringPolicy`,
  );
  const recipients = readArray(
    record.recipientStudentIds,
    route,
    `${field}.recipientStudentIds`,
  ).map((recipient, index) => readString(
    recipient,
    route,
    `${field}.recipientStudentIds[${index}]`,
  ));
  const recipientCount = readPositiveInteger(
    record.recipientCount,
    route,
    `${field}.recipientCount`,
  );
  if (recipientCount !== recipients.length) {
    return fail(
      route,
      `${field}.recipientCount`,
      "the exact recipientStudentIds length",
    );
  }

  return {
    academicYear: readString(record.academicYear, route, `${field}.academicYear`),
    attemptLimit: readPositiveInteger(record.attemptLimit, route, `${field}.attemptLimit`),
    canonicalId: readString(record.canonicalId, route, `${field}.canonicalId`),
    createdAt: readString(record.createdAt, route, `${field}.createdAt`),
    endWindow: readString(record.endWindow, route, `${field}.endWindow`),
    gracePeriodMinutes: readNonNegativeInteger(
      record.gracePeriodMinutes,
      route,
      `${field}.gracePeriodMinutes`,
    ),
    id: readString(record.id, route, `${field}.id`),
    mode: readEnum(
      record.mode,
      ["Operational", "Diagnostic", "Controlled", "Hard"] as const,
      route,
      `${field}.mode`,
    ),
    proctoringPolicy: {
      browserIntegrityGuardEnabled: readBoolean(
        proctoring.browserIntegrityGuardEnabled,
        route,
        `${field}.proctoringPolicy.browserIntegrityGuardEnabled`,
      ),
      faceIdentityGazeGuardEnabled: readBoolean(
        proctoring.faceIdentityGazeGuardEnabled,
        route,
        `${field}.proctoringPolicy.faceIdentityGazeGuardEnabled`,
      ),
    },
    recipientCount,
    recipientStudentIds: recipients,
    runPath: readString(record.runPath, route, `${field}.runPath`),
    shuffleQuestionOrder: readBoolean(
      record.shuffleQuestionOrder,
      route,
      `${field}.shuffleQuestionOrder`,
    ),
    startWindow: readString(record.startWindow, route, `${field}.startWindow`),
    status: readEnum(
      record.status,
      ["scheduled", "active", "completed", "stopped", "cancelled"] as const,
      route,
      `${field}.status`,
    ),
    templateVersion: readPositiveInteger(
      record.templateVersion,
      route,
      `${field}.templateVersion`,
    ),
    testId: readString(record.testId, route, `${field}.testId`),
    timezone: readString(record.timezone, route, `${field}.timezone`),
  };
}

export function adaptAdminRunCreateResult(
  value: unknown,
): AdminRunCreateResult {
  const route = "POST /admin/runs";
  const data = readRecord(value, route);
  const result: AdminRunCreateResult = {
    disposition: readEnum(
      data.disposition,
      ["created", "replayed"] as const,
      route,
      "disposition",
    ),
    run: adaptAdminRunRecord(data.run, route),
  };
  if (result.run.status !== "scheduled") {
    return fail(route, "run.status", '"scheduled"');
  }

  return result;
}

export function adaptAdminRunListResult(
  value: unknown,
): AdminRunListResult {
  const route = "GET /admin/runs";
  const data = readRecord(value, route);
  const nextCursor = data.nextCursor === null ?
    null :
    readString(data.nextCursor, route, "nextCursor");
  return {
    nextCursor,
    runs: readArray(data.runs, route, "runs").map((run, index) =>
      adaptAdminRunRecord(run, route, `runs[${index}]`)),
  };
}

export function adaptAdminRunDetailResult(
  value: unknown,
): AdminRunDetailResult {
  const route = "GET /admin/runs/{runId}";
  const data = readRecord(value, route);
  return {
    run: adaptAdminRunRecord(data.run, route),
  };
}

function readSafeQuestionAssetReference(
  record: Record<string, unknown>,
  route: string,
  fieldPrefix: string,
  fileKey: string,
  previewKey: string,
): {cdnPath: string; previewSignedUrl: string} {
  const fileField = `${fieldPrefix}.${fileKey}`;
  const previewField = `${fieldPrefix}.${previewKey}`;
  const cdnPath = readStringAllowEmpty(record[fileKey], route, fileField);
  const previewSignedUrl = readStringAllowEmpty(
    record[previewKey],
    route,
    previewField,
  );

  if (!cdnPath && !previewSignedUrl) {
    return {cdnPath, previewSignedUrl};
  }

  if (!cdnPath || cdnPath.includes("://") || cdnPath.startsWith("/")) {
    return fail(route, fileField, "a relative managed CDN path");
  }

  let previewUrl: URL;
  try {
    previewUrl = new URL(previewSignedUrl);
  } catch {
    return fail(route, previewField, "an HTTPS signed CDN URL");
  }

  if (
    previewUrl.protocol !== "https:" ||
    previewUrl.hostname.endsWith("storage.googleapis.com") ||
    previewUrl.hostname.endsWith("firebasestorage.googleapis.com") ||
    !previewUrl.searchParams.get("Expires") ||
    !previewUrl.searchParams.get("KeyName") ||
    !previewUrl.searchParams.get("Signature")
  ) {
    return fail(route, previewField, "an HTTPS signed CDN URL");
  }

  return {cdnPath, previewSignedUrl};
}

export function adaptAdminQuestionLibraryResult(
  value: unknown,
): AdminQuestionLibraryResult {
  const route = "GET /admin/questions/library";
  const data = readRecord(value, route);
  const questions = readArray(data.questions, route, "questions")
    .map((value, index) => {
      const field = `questions[${index}]`;
      const record = readRecord(value, route, field);
      const questionImage = readSafeQuestionAssetReference(
        record,
        route,
        field,
        "questionImageFile",
        "questionImagePreviewUrl",
      );
      const solutionImage = readSafeQuestionAssetReference(
        record,
        route,
        field,
        "solutionImageFile",
        "solutionImagePreviewUrl",
      );

      return {
        academicYear: readString(record.academicYear, route, `${field}.academicYear`),
        additionalTag: readString(record.additionalTag, route, `${field}.additionalTag`),
        chapter: readString(record.chapter, route, `${field}.chapter`),
        correctAnswer: readString(record.correctAnswer, route, `${field}.correctAnswer`),
        difficulty: readEnum(
          record.difficulty,
          ["easy", "medium", "hard"] as const,
          route,
          `${field}.difficulty`,
        ),
        examType: readString(record.examType, route, `${field}.examType`),
        id: readString(record.id, route, `${field}.id`),
        internalNotes: readStringAllowEmpty(record.internalNotes, route, `${field}.internalNotes`),
        lastUsedDate: readNullableString(record.lastUsedDate, route, `${field}.lastUsedDate`),
        marks: readNumber(record.marks, route, `${field}.marks`),
        negativeMarks: readNumber(record.negativeMarks, route, `${field}.negativeMarks`),
        primaryTag: readString(record.primaryTag, route, `${field}.primaryTag`),
        prompt: readString(record.prompt, route, `${field}.prompt`),
        questionImageFile: questionImage.cdnPath,
        questionImagePreviewUrl: questionImage.previewSignedUrl,
        questionType: readString(record.questionType, route, `${field}.questionType`),
        secondaryTag: readString(record.secondaryTag, route, `${field}.secondaryTag`),
        simulationLink: readStringAllowEmpty(record.simulationLink, route, `${field}.simulationLink`),
        solutionImageFile: solutionImage.cdnPath,
        solutionImagePreviewUrl: solutionImage.previewSignedUrl,
        status: readEnum(
          record.status,
          ["active", "used", "archived", "deprecated"] as const,
          route,
          `${field}.status`,
        ),
        subject: readString(record.subject, route, `${field}.subject`),
        thermalState: readEnum(
          record.thermalState,
          ["hot", "warm", "cold"] as const,
          route,
          `${field}.thermalState`,
        ),
        topic: readStringAllowEmpty(record.topic, route, `${field}.topic`),
        tutorialVideoLink: readStringAllowEmpty(
          record.tutorialVideoLink,
          route,
          `${field}.tutorialVideoLink`,
        ),
        uniqueKey: readString(record.uniqueKey, route, `${field}.uniqueKey`),
        usedCount: readNumber(record.usedCount, route, `${field}.usedCount`),
        version: readPositiveInteger(record.version, route, `${field}.version`),
      };
    });

  return {questions};
}

export function adaptAdminQuestionAssetUploadResult(
  value: unknown,
): QuestionAssetUploadResult {
  const route = "POST /admin/questions/assets";
  const data = readRecord(value, route);
  const assetKind = readEnum(
    data.assetKind,
    ["questionImage", "solutionImage", "solutionPdf"] as const,
    route,
    "assetKind",
  );
  const uploaded = readBoolean(data.uploaded, route, "uploaded");
  if (!uploaded) {
    return fail(route, "uploaded", "true");
  }

  return {
    assetKind,
    cdnPath: readString(data.cdnPath, route, "cdnPath"),
    contentType: readString(data.contentType, route, "contentType"),
    previewSignedUrl: readString(
      data.previewSignedUrl,
      route,
      "previewSignedUrl",
    ),
    questionId: readString(data.questionId, route, "questionId"),
    uploaded: true,
    version: readPositiveInteger(data.version, route, "version"),
  };
}

function adaptStudentDashboardUpcomingTest(
  value: unknown,
  index: number,
): StudentDashboardUpcomingTest {
  const route = "GET /student/dashboard";
  const field = `upcomingTests[${index}]`;
  const record = readRecord(value, route, field);
  return {
    durationMinutes: readNonNegativeInteger(
      record.durationMinutes,
      route,
      `${field}.durationMinutes`,
    ),
    endAt: readString(record.endAt, route, `${field}.endAt`),
    mode: readEnum(
      record.mode,
      ["Operational", "Diagnostic", "Controlled", "Hard"] as const,
      route,
      `${field}.mode`,
    ),
    runId: readString(record.runId, route, `${field}.runId`),
    startAt: readString(record.startAt, route, `${field}.startAt`),
    testName: readString(record.testName, route, `${field}.testName`),
  };
}

function adaptStudentDashboardRecentResult(
  value: unknown,
  index: number,
): StudentDashboardRecentResult {
  const route = "GET /student/dashboard";
  const field = `recentResults[${index}]`;
  const record = readRecord(value, route, field);
  return {
    accuracyPercent: readNumber(
      record.accuracyPercent,
      route,
      `${field}.accuracyPercent`,
    ),
    completedAt: readString(
      record.completedAt,
      route,
      `${field}.completedAt`,
    ),
    rawScorePercent: readNumber(
      record.rawScorePercent,
      route,
      `${field}.rawScorePercent`,
    ),
    runId: readString(record.runId, route, `${field}.runId`),
    testName: readString(record.testName, route, `${field}.testName`),
  };
}

function adaptStudentDashboardTrendPoint(
  value: unknown,
  index: number,
): StudentDashboardTrendPoint {
  const route = "GET /student/dashboard";
  const field = `phaseComplianceMiniTrend[${index}]`;
  const record = readRecord(value, route, field);
  return {
    label: readString(record.label, route, `${field}.label`),
    value: readNumber(record.value, route, `${field}.value`),
  };
}

export function adaptStudentDashboardResult(
  value: unknown,
): StudentDashboardResult {
  const route = "GET /student/dashboard";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  return {
    avgAccuracyPercent: readNumber(
      data.avgAccuracyPercent,
      route,
      "avgAccuracyPercent",
    ),
    avgRawScorePercent: readNumber(
      data.avgRawScorePercent,
      route,
      "avgRawScorePercent",
    ),
    batchRank: readNullableNumber(data.batchRank, route, "batchRank"),
    behaviorSummaryTag: readString(
      data.behaviorSummaryTag,
      route,
      "behaviorSummaryTag",
    ),
    controlledModeImprovementDeltaPercent: readNumber(
      data.controlledModeImprovementDeltaPercent,
      route,
      "controlledModeImprovementDeltaPercent",
    ),
    disciplineIndex: readNumber(
      data.disciplineIndex,
      route,
      "disciplineIndex",
    ),
    easyNeglectPercent: readNumber(
      data.easyNeglectPercent,
      route,
      "easyNeglectPercent",
    ),
    executionStabilityFlag: readString(
      data.executionStabilityFlag,
      route,
      "executionStabilityFlag",
    ),
    guessProbabilityPercent: readNumber(
      data.guessProbabilityPercent,
      route,
      "guessProbabilityPercent",
    ),
    hardBiasPercent: readNumber(
      data.hardBiasPercent,
      route,
      "hardBiasPercent",
    ),
    licenseLayer: readEnum(
      data.licenseLayer,
      ["L0", "L1", "L2", "L3"] as const,
      route,
      "licenseLayer",
    ),
    phaseAdherencePercent: readNumber(
      data.phaseAdherencePercent,
      route,
      "phaseAdherencePercent",
    ),
    phaseComplianceMiniTrend: readArray(
      data.phaseComplianceMiniTrend,
      route,
      "phaseComplianceMiniTrend",
    ).map(adaptStudentDashboardTrendPoint),
    recentResults: readArray(
      data.recentResults,
      route,
      "recentResults",
    ).map(adaptStudentDashboardRecentResult),
    riskState: readEnum(
      data.riskState,
      ["low", "medium", "high", "critical"] as const,
      route,
      "riskState",
    ),
    testsAttempted: readNonNegativeInteger(
      data.testsAttempted,
      route,
      "testsAttempted",
    ),
    timeMisallocationPercent: readNumber(
      data.timeMisallocationPercent,
      route,
      "timeMisallocationPercent",
    ),
    upcomingTests: readArray(
      data.upcomingTests,
      route,
      "upcomingTests",
    ).map(adaptStudentDashboardUpcomingTest),
  };
}

function adaptStudentTestRecord(
  value: unknown,
  index: number,
): StudentTestRecord {
  const route = "GET /student/tests";
  const field = `tests[${index}]`;
  const record = readRecord(value, route, field);
  return {
    academicYear: readString(
      record.academicYear,
      route,
      `${field}.academicYear`,
    ),
    accuracyPercent: readNullableNumber(
      record.accuracyPercent,
      route,
      `${field}.accuracyPercent`,
    ),
    archivedSummary: readNullableString(
      record.archivedSummary,
      route,
      `${field}.archivedSummary`,
    ),
    attemptedQuestions: readNullableNumber(
      record.attemptedQuestions,
      route,
      `${field}.attemptedQuestions`,
    ),
    attemptStatusLabel: readNullableString(
      record.attemptStatusLabel,
      route,
      `${field}.attemptStatusLabel`,
    ),
    completedAt: readNullableString(
      record.completedAt,
      route,
      `${field}.completedAt`,
    ),
    currentAcademicYear: readBoolean(
      record.currentAcademicYear,
      route,
      `${field}.currentAcademicYear`,
    ),
    durationMinutes: readNonNegativeInteger(
      record.durationMinutes,
      route,
      `${field}.durationMinutes`,
    ),
    endWindow: readString(record.endWindow, route, `${field}.endWindow`),
    flaggedQuestions: readNullableNumber(
      record.flaggedQuestions,
      route,
      `${field}.flaggedQuestions`,
    ),
    mode: readEnum(
      record.mode,
      ["Operational", "Diagnostic", "Controlled", "Hard"] as const,
      route,
      `${field}.mode`,
    ),
    rankInBatch: readNullableNumber(
      record.rankInBatch,
      route,
      `${field}.rankInBatch`,
    ),
    rawScorePercent: readNullableNumber(
      record.rawScorePercent,
      route,
      `${field}.rawScorePercent`,
    ),
    runId: readString(record.runId, route, `${field}.runId`),
    sessionId: readNullableString(
      record.sessionId,
      route,
      `${field}.sessionId`,
    ),
    sessionLink: readNullableString(
      record.sessionLink,
      route,
      `${field}.sessionLink`,
    ),
    startWindow: readString(
      record.startWindow,
      route,
      `${field}.startWindow`,
    ),
    status: readEnum(
      record.status,
      ["scheduled", "active", "completed", "archived"] as const,
      route,
      `${field}.status`,
    ),
    summaryPdfUrl: readNullableString(
      record.summaryPdfUrl,
      route,
      `${field}.summaryPdfUrl`,
    ),
    testId: readString(record.testId, route, `${field}.testId`),
    testName: readString(record.testName, route, `${field}.testName`),
    timeUsedMinutes: readNullableNumber(
      record.timeUsedMinutes,
      route,
      `${field}.timeUsedMinutes`,
    ),
    totalQuestions: readNullableNumber(
      record.totalQuestions,
      route,
      `${field}.totalQuestions`,
    ),
  };
}

export function adaptStudentTestsResult(value: unknown): StudentTestsResult {
  const route = "GET /student/tests";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  const tests = readArray(data.tests, route, "tests")
    .map(adaptStudentTestRecord);
  const pageSize = readPositiveInteger(data.pageSize, route, "pageSize");
  if (tests.length > pageSize) {
    return fail(route, "tests", "no more than pageSize records");
  }

  return {
    hasMore: readBoolean(data.hasMore, route, "hasMore"),
    page: readPositiveInteger(data.page, route, "page"),
    pageSize,
    tests,
    total: readNonNegativeInteger(data.total, route, "total"),
  };
}

function adaptStudentPerformancePoint(
  value: unknown,
  index: number,
): StudentPerformancePoint {
  const route = "GET /student/performance";
  const field = `timeline[${index}]`;
  const record = readRecord(value, route, field);
  return {
    accuracyPercent: readNumber(
      record.accuracyPercent,
      route,
      `${field}.accuracyPercent`,
    ),
    completedAt: readString(record.completedAt, route, `${field}.completedAt`),
    disciplineIndex: readNumber(
      record.disciplineIndex,
      route,
      `${field}.disciplineIndex`,
    ),
    guessRatePercent: readNumber(
      record.guessRatePercent,
      route,
      `${field}.guessRatePercent`,
    ),
    maxTimeViolationPercent: readNumber(
      record.maxTimeViolationPercent,
      route,
      `${field}.maxTimeViolationPercent`,
    ),
    minTimeViolationPercent: readNumber(
      record.minTimeViolationPercent,
      route,
      `${field}.minTimeViolationPercent`,
    ),
    overstayFrequencyPercent: readNumber(
      record.overstayFrequencyPercent,
      route,
      `${field}.overstayFrequencyPercent`,
    ),
    phaseAdherencePercent: readNumber(
      record.phaseAdherencePercent,
      route,
      `${field}.phaseAdherencePercent`,
    ),
    rankInBatch: readNullableNumber(
      record.rankInBatch,
      route,
      `${field}.rankInBatch`,
    ),
    rawScorePercent: readNumber(
      record.rawScorePercent,
      route,
      `${field}.rawScorePercent`,
    ),
    riskState: readEnum(
      record.riskState,
      ["Stable", "Improving", "Building Discipline"] as const,
      route,
      `${field}.riskState`,
    ),
    runId: readString(record.runId, route, `${field}.runId`),
    runLabel: readString(record.runLabel, route, `${field}.runLabel`),
    timeAllocationBalancePercent: readNumber(
      record.timeAllocationBalancePercent,
      route,
      `${field}.timeAllocationBalancePercent`,
    ),
    timeSpentMinutes: readNonNegativeInteger(
      record.timeSpentMinutes,
      route,
      `${field}.timeSpentMinutes`,
    ),
  };
}

function adaptStudentTopicPerformance(
  value: unknown,
  index: number,
): StudentTopicPerformanceEntry {
  const route = "GET /student/performance";
  const field = `topicPerformanceBreakdown[${index}]`;
  const record = readRecord(value, route, field);
  return {
    accuracyPercent: readNumber(
      record.accuracyPercent,
      route,
      `${field}.accuracyPercent`,
    ),
    rawScorePercent: readNumber(
      record.rawScorePercent,
      route,
      `${field}.rawScorePercent`,
    ),
    topic: readString(record.topic, route, `${field}.topic`),
  };
}

function adaptStudentControlledComparison(
  value: unknown,
): StudentControlledModeComparison {
  const route = "GET /student/performance";
  const field = "controlledModeComparison";
  const record = readRecord(value, route, field);
  return {
    baselineLabel: readString(
      record.baselineLabel,
      route,
      `${field}.baselineLabel`,
    ),
    currentLabel: readString(
      record.currentLabel,
      route,
      `${field}.currentLabel`,
    ),
    disciplineIndexDeltaPercent: readNumber(
      record.disciplineIndexDeltaPercent,
      route,
      `${field}.disciplineIndexDeltaPercent`,
    ),
    guessRateDeltaPercent: readNumber(
      record.guessRateDeltaPercent,
      route,
      `${field}.guessRateDeltaPercent`,
    ),
    maxTimeViolationDeltaPercent: readNumber(
      record.maxTimeViolationDeltaPercent,
      route,
      `${field}.maxTimeViolationDeltaPercent`,
    ),
    minTimeViolationDeltaPercent: readNumber(
      record.minTimeViolationDeltaPercent,
      route,
      `${field}.minTimeViolationDeltaPercent`,
    ),
    phaseAdherenceDeltaPercent: readNumber(
      record.phaseAdherenceDeltaPercent,
      route,
      `${field}.phaseAdherenceDeltaPercent`,
    ),
  };
}

export function adaptStudentPerformanceResult(
  value: unknown,
): StudentPerformanceResult {
  const route = "GET /student/performance";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  return {
    controlledModeComparison: adaptStudentControlledComparison(
      data.controlledModeComparison,
    ),
    controlledModeImprovementPercent: readNumber(
      data.controlledModeImprovementPercent,
      route,
      "controlledModeImprovementPercent",
    ),
    disciplineIndex: readNumber(data.disciplineIndex, route, "disciplineIndex"),
    easyNeglectFrequencyPercent: readNumber(
      data.easyNeglectFrequencyPercent,
      route,
      "easyNeglectFrequencyPercent",
    ),
    guessProbabilityCluster: readEnum(
      data.guessProbabilityCluster,
      ["Low", "Medium", "High"] as const,
      route,
      "guessProbabilityCluster",
    ),
    guessProbabilityPercent: readNumber(
      data.guessProbabilityPercent,
      route,
      "guessProbabilityPercent",
    ),
    hardBiasFrequencyPercent: readNumber(
      data.hardBiasFrequencyPercent,
      route,
      "hardBiasFrequencyPercent",
    ),
    licenseLayer: readEnum(
      data.licenseLayer,
      ["L0", "L1", "L2", "L3"] as const,
      route,
      "licenseLayer",
    ),
    overstayFrequencyPercent: readNumber(
      data.overstayFrequencyPercent,
      route,
      "overstayFrequencyPercent",
    ),
    phaseCompliancePercent: readNumber(
      data.phaseCompliancePercent,
      route,
      "phaseCompliancePercent",
    ),
    timeAllocationBalancePercent: readNumber(
      data.timeAllocationBalancePercent,
      route,
      "timeAllocationBalancePercent",
    ),
    timeline: readArray(data.timeline, route, "timeline")
      .map(adaptStudentPerformancePoint),
    topicPerformanceBreakdown: readArray(
      data.topicPerformanceBreakdown,
      route,
      "topicPerformanceBreakdown",
    ).map(adaptStudentTopicPerformance),
  };
}

const STUDENT_INSIGHT_PATTERNS = [
  "Easy Neglect",
  "Guess Detection",
  "Late-Phase Drop",
  "Rushed Pattern",
  "Skip Burst",
  "No Pattern Yet",
] as const satisfies readonly StudentInsightPattern[];

function adaptStudentInsightSnapshot(
  value: unknown,
  index: number,
): StudentInsightSnapshot {
  const route = "GET /student/insights";
  const field = `snapshots[${index}]`;
  const record = readRecord(value, route, field);
  return {
    accuracyPercent: readNumber(
      record.accuracyPercent,
      route,
      `${field}.accuracyPercent`,
    ),
    dominantPattern: readEnum(
      record.dominantPattern,
      STUDENT_INSIGHT_PATTERNS,
      route,
      `${field}.dominantPattern`,
    ),
    easyNeglectFrequencyPercent: readNumber(
      record.easyNeglectFrequencyPercent,
      route,
      `${field}.easyNeglectFrequencyPercent`,
    ),
    generatedAt: readString(record.generatedAt, route, `${field}.generatedAt`),
    guessDetectionPercent: readNumber(
      record.guessDetectionPercent,
      route,
      `${field}.guessDetectionPercent`,
    ),
    latePhaseDropPercent: readNumber(
      record.latePhaseDropPercent,
      route,
      `${field}.latePhaseDropPercent`,
    ),
    rawScorePercent: readNumber(
      record.rawScorePercent,
      route,
      `${field}.rawScorePercent`,
    ),
    rushedPatternFrequencyPercent: readNumber(
      record.rushedPatternFrequencyPercent,
      route,
      `${field}.rushedPatternFrequencyPercent`,
    ),
    skipBurstFrequencyPercent: readNumber(
      record.skipBurstFrequencyPercent,
      route,
      `${field}.skipBurstFrequencyPercent`,
    ),
    snapshotId: readString(record.snapshotId, route, `${field}.snapshotId`),
  };
}

function adaptStudentTopicWeakness(
  value: unknown,
  index: number,
): StudentTopicWeaknessInsight {
  const route = "GET /student/insights";
  const field = `topicWeaknessSummary[${index}]`;
  const record = readRecord(value, route, field);
  return {
    feedback: readString(record.feedback, route, `${field}.feedback`),
    simulationLink: readNullableString(
      record.simulationLink,
      route,
      `${field}.simulationLink`,
    ),
    topic: readString(record.topic, route, `${field}.topic`),
    tutorialVideoLink: readNullableString(
      record.tutorialVideoLink,
      route,
      `${field}.tutorialVideoLink`,
    ),
    weaknessPercent: readNumber(
      record.weaknessPercent,
      route,
      `${field}.weaknessPercent`,
    ),
  };
}

export function adaptStudentInsightsResult(
  value: unknown,
): StudentInsightsResult {
  const route = "GET /student/insights";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  const suggestions = readArray(
    data.disciplineImprovementSuggestions,
    route,
    "disciplineImprovementSuggestions",
  ).map((entry, index) => readString(
    entry,
    route,
    `disciplineImprovementSuggestions[${index}]`,
  ));
  if (data.currentYearSolutionAccessOnly !== true) {
    return fail(route, "currentYearSolutionAccessOnly", "true");
  }
  return {
    archivedSummaryOnlyCount: readNonNegativeInteger(
      data.archivedSummaryOnlyCount,
      route,
      "archivedSummaryOnlyCount",
    ),
    currentYearSolutionAccessOnly: true,
    disciplineImprovementSuggestions: suggestions,
    guessDetectionAlertPercent: readNumber(
      data.guessDetectionAlertPercent,
      route,
      "guessDetectionAlertPercent",
    ),
    latePhaseDropIndicatorPercent: readNumber(
      data.latePhaseDropIndicatorPercent,
      route,
      "latePhaseDropIndicatorPercent",
    ),
    licenseLayer: readEnum(
      data.licenseLayer,
      ["L1", "L2", "L3"] as const,
      route,
      "licenseLayer",
    ),
    mostFrequentBehaviorPattern: readEnum(
      data.mostFrequentBehaviorPattern,
      STUDENT_INSIGHT_PATTERNS,
      route,
      "mostFrequentBehaviorPattern",
    ),
    phaseAdherenceFeedback: readString(
      data.phaseAdherenceFeedback,
      route,
      "phaseAdherenceFeedback",
    ),
    rushedPatternFrequencyPercent: readNumber(
      data.rushedPatternFrequencyPercent,
      route,
      "rushedPatternFrequencyPercent",
    ),
    skipBurstIndicatorPercent: readNumber(
      data.skipBurstIndicatorPercent,
      route,
      "skipBurstIndicatorPercent",
    ),
    snapshots: readArray(data.snapshots, route, "snapshots")
      .map(adaptStudentInsightSnapshot),
    topicWeaknessSummary: readArray(
      data.topicWeaknessSummary,
      route,
      "topicWeaknessSummary",
    ).map(adaptStudentTopicWeakness),
  };
}

function adaptStudentSolutionItem(
  value: unknown,
  index: number,
): StudentSolutionItem {
  const route = "GET /student/tests/{testId}/solutions";
  const field = `items[${index}]`;
  const record = readRecord(value, route, field);
  return {
    correctAnswer: readString(record.correctAnswer, route, `${field}.correctAnswer`),
    questionId: readString(record.questionId, route, `${field}.questionId`),
    questionImageUrl: readStringAllowEmpty(
      record.questionImageUrl,
      route,
      `${field}.questionImageUrl`,
    ),
    simulationLink: readNullableString(
      record.simulationLink,
      route,
      `${field}.simulationLink`,
    ),
    solutionImageUrl: readStringAllowEmpty(
      record.solutionImageUrl,
      route,
      `${field}.solutionImageUrl`,
    ),
    studentAnswer: readString(record.studentAnswer, route, `${field}.studentAnswer`),
    tutorialVideoLink: readNullableString(
      record.tutorialVideoLink,
      route,
      `${field}.tutorialVideoLink`,
    ),
  };
}

export function adaptStudentSolutionsResult(
  value: unknown,
): StudentSolutionsResult {
  const route = "GET /student/tests/{testId}/solutions";
  const data = readRecord(value, route);
  assertSummaryOnly(data, route);
  const items = readArray(data.items, route, "items")
    .map(adaptStudentSolutionItem);
  const pageSize = readPositiveInteger(data.pageSize, route, "pageSize");
  if (items.length > pageSize) {
    return fail(route, "items", "no more than pageSize records");
  }
  return {
    hasMore: readBoolean(data.hasMore, route, "hasMore"),
    items,
    page: readPositiveInteger(data.page, route, "page"),
    pageSize,
    releasedAt: readString(data.releasedAt, route, "releasedAt"),
    runId: readString(data.runId, route, "runId"),
    testId: readString(data.testId, route, "testId"),
    total: readNonNegativeInteger(data.total, route, "total"),
  };
}

export function adaptStudentSummaryResult(
  value: unknown,
  resource: StudentSummaryResource,
): unknown {
  if (resource === "dashboard") {
    return adaptStudentDashboardResult(value);
  }

  if (resource === "tests") {
    return adaptStudentTestsResult(value);
  }

  if (resource === "performance") {
    return adaptStudentPerformanceResult(value);
  }

  if (resource === "insights") {
    return adaptStudentInsightsResult(value);
  }

  if (resource === "solutions") {
    return adaptStudentSolutionsResult(value);
  }

  const route = `GET /student/${resource}`;
  const data = readRecord(value, route);
  if (Object.keys(data).length === 0) {
    return fail(route, "data", "a non-empty summary object");
  }

  return value;
}

export function adaptExamSubmitResult(value: unknown): ExamSubmitAdapterResult {
  const route = "POST /exam/session/{sessionId}/submit";
  const data = readRecord(value, route);
  const riskState = data.riskState;
  if (
    riskState !== "Stable" &&
    riskState !== "Drift-Prone" &&
    riskState !== "Impulsive" &&
    riskState !== "Overextended" &&
    riskState !== "Volatile"
  ) {
    return fail(route, "riskState", "a supported submission risk state");
  }

  const status = data.status;
  if (
    status !== undefined &&
    status !== "created" &&
    status !== "started" &&
    status !== "active" &&
    status !== "submitted" &&
    status !== "expired" &&
    status !== "terminated"
  ) {
    return fail(route, "status", "a supported session status");
  }

  const submittedAt = data.submittedAt;
  if (submittedAt !== undefined && typeof submittedAt !== "string") {
    return fail(route, "submittedAt", "a string when present");
  }

  const alreadySubmitted = data.alreadySubmitted;
  if (alreadySubmitted !== undefined && typeof alreadySubmitted !== "boolean") {
    return fail(route, "alreadySubmitted", "a boolean when present");
  }

  return {
    accuracyPercent: readNumber(data.accuracyPercent, route, "accuracyPercent"),
    disciplineIndex: readNumber(data.disciplineIndex, route, "disciplineIndex"),
    operationalDataAccessPolicy: readRecord(
      data.operationalDataAccessPolicy,
      route,
      "operationalDataAccessPolicy",
    ),
    rawScorePercent: readNumber(data.rawScorePercent, route, "rawScorePercent"),
    riskState,
    ...(alreadySubmitted === undefined ? {} : {alreadySubmitted}),
    ...(status === undefined ? {} : {status}),
    ...(submittedAt === undefined ? {} : {submittedAt}),
  };
}

export function adaptVendorCalibrationPushResult(
  value: unknown,
): DeployCalibrationVersionResult {
  const route = "POST /vendor/calibration/push";
  const data = readRecord(value, route);

  if (!Array.isArray(data.deployedInstitutes)) {
    return fail(route, "deployedInstitutes", "an array");
  }

  const deployedInstitutes = data.deployedInstitutes.map((value, index) => {
    const field = `deployedInstitutes[${index}]`;
    const record = readRecord(value, route, field);
    return {
      calibrationPath: readString(record.calibrationPath, route, `${field}.calibrationPath`),
      calibrationHistoryPath: readString(
        record.calibrationHistoryPath,
        route,
        `${field}.calibrationHistoryPath`,
      ),
      instituteId: readString(record.instituteId, route, `${field}.instituteId`),
      licensePath: readString(record.licensePath, route, `${field}.licensePath`),
      compatibilityLicensePath: readString(
        record.compatibilityLicensePath,
        route,
        `${field}.compatibilityLicensePath`,
      ),
    };
  });

  return {
    calibrationSourcePath: readString(
      data.calibrationSourcePath,
      route,
      "calibrationSourcePath",
    ),
    deployedInstituteCount: readNumber(
      data.deployedInstituteCount,
      route,
      "deployedInstituteCount",
    ),
    deployedInstitutes,
    deploymentLogId: readString(data.deploymentLogId, route, "deploymentLogId"),
    vendorCalibrationLogPath: readString(
      data.vendorCalibrationLogPath,
      route,
      "vendorCalibrationLogPath",
    ),
    versionId: readString(data.versionId, route, "versionId"),
  };
}
