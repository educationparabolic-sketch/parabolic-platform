import type {
  AdminQuestionLibraryResult,
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

export function adaptStudentSummaryResult(
  value: unknown,
  resource: StudentSummaryResource,
): unknown {
  const route = `GET /student/${resource}`;
  const allowsArray = resource === "tests" || resource === "solutions";

  if (allowsArray && Array.isArray(value)) {
    return value;
  }

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
