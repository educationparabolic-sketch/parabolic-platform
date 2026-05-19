import {Timestamp} from "firebase-admin/firestore";
import {adminLicensingService} from "./adminLicensing";
import {adminSettingsService} from "./adminSettings";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminOverviewAttentionStudent,
  AdminOverviewDistributionBin,
  AdminOverviewLicenseLayer,
  AdminOverviewSnapshot,
  AdminOverviewSubmissionSummary,
  AdminOverviewValidatedRequest,
  AdminOverviewValidationError,
} from "../types/adminOverview";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const GOVERNANCE_SNAPSHOTS_COLLECTION = "governanceSnapshots";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const RUNS_COLLECTION = "runs";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

type StudentRiskBucket = "low" | "medium" | "high" | "critical";

interface OverviewStudentSummary {
  studentId: string;
  studentName: string;
  batchId: string;
  batchName: string;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  guessRatePercent: number;
  riskBucket: StudentRiskBucket;
  lastActivityAt: string;
  lastAssessmentLabel: string;
}

interface OverviewRunSummary {
  runId: string;
  runName: string;
  batchId: string;
  batchName: string;
  mode: string;
  participants: number;
  completionRatePercent: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  timeMisallocationPercent: number;
  disciplineIndexAverage: number;
  guessRatePercent: number;
  controlledCompliancePercent: number;
  minTimeViolationPercent: number;
  pacingGuardrailViolationPercent: number;
  startedAt: string;
  scheduledFor: string;
  status: string;
}

interface OverviewGovernanceSummary {
  stabilityIndex: number;
  executionIntegrityScore: number;
  phaseCompliancePercent: number;
  overrideFrequency: number;
  rushPatternPercent: number;
  skipBurstPercent: number;
  wrongStreakPercent: number;
  disciplineTrend: number;
  generatedAt: string;
  month: string;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminOverviewValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value.trim() : new Date(parsed).toISOString();
  }

  return null;
}

function compareIsoDescending(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function toLicenseLayer(value: unknown): AdminOverviewLicenseLayer {
  if (value === "L1" || value === "L2" || value === "L3") {
    return value;
  }

  return "L0";
}

function toStudentRiskBucket(value: unknown, disciplineIndex: number): StudentRiskBucket {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "critical") {
      return "critical";
    }
    if (normalized === "high" || normalized === "volatile") {
      return "high";
    }
    if (
      normalized === "medium" ||
      normalized === "driftprone" ||
      normalized === "drift_prone" ||
      normalized === "overextended" ||
      normalized === "impulsive"
    ) {
      return "medium";
    }
    if (normalized === "low" || normalized === "stable") {
      return "low";
    }
  }

  if (disciplineIndex < 45) {
    return "critical";
  }
  if (disciplineIndex < 60) {
    return "high";
  }
  if (disciplineIndex < 75) {
    return "medium";
  }

  return "low";
}

function toRiskLabel(bucket: StudentRiskBucket): string {
  switch (bucket) {
  case "critical":
    return "Critical";
  case "high":
    return "High";
  case "medium":
    return "Medium";
  case "low":
  default:
    return "Low";
  }
}

function riskWeight(bucket: StudentRiskBucket): number {
  switch (bucket) {
  case "critical":
    return 4;
  case "high":
    return 3;
  case "medium":
    return 2;
  case "low":
  default:
    return 1;
  }
}

function toExecutionBadge(value: number): "Stable" | "Moderate" | "HighVariance" {
  if (value >= 75) {
    return "Stable";
  }
  if (value >= 60) {
    return "Moderate";
  }
  return "HighVariance";
}

function toDirection(value: number): "Up" | "Down" | "Stable" {
  if (value >= 2) {
    return "Up";
  }
  if (value <= -2) {
    return "Down";
  }
  return "Stable";
}

function formatRiskDistribution(
  counts: Record<StudentRiskBucket, number>,
  total: number,
): string {
  if (total <= 0) {
    return "Low 0% · Medium 0% · High/Critical 0%";
  }

  const low = clampPercent((counts.low / total) * 100);
  const medium = clampPercent((counts.medium / total) * 100);
  const highCritical = clampPercent(((counts.high + counts.critical) / total) * 100);

  return `Low ${low}% · Medium ${medium}% · High/Critical ${highCritical}%`;
}

function formatRiskPie(
  counts: Record<StudentRiskBucket, number>,
  total: number,
): string {
  if (total <= 0) {
    return "Low 0% · Medium 0% · High 0% · Critical 0%";
  }

  const low = clampPercent((counts.low / total) * 100);
  const medium = clampPercent((counts.medium / total) * 100);
  const high = clampPercent((counts.high / total) * 100);
  const critical = clampPercent((counts.critical / total) * 100);

  return `Low ${low}% · Medium ${medium}% · High ${high}% · Critical ${critical}%`;
}

function buildHistogram(runs: OverviewRunSummary[]): AdminOverviewDistributionBin[] {
  const bins: Array<{label: string; min: number; max: number | null}> = [
    {label: "<40", min: 0, max: 39.999},
    {label: "40-55", min: 40, max: 55.999},
    {label: "56-70", min: 56, max: 70.999},
    {label: "71-85", min: 71, max: 85.999},
    {label: "86+", min: 86, max: null},
  ];

  return bins.map((bin) => ({
    label: bin.label,
    value: runs.filter((run) =>
      bin.max === null ?
        run.avgRawScorePercent >= bin.min :
        run.avgRawScorePercent >= bin.min &&
          run.avgRawScorePercent <= bin.max,
    ).length,
  }));
}

function buildSparkline(values: number[]): string {
  if (values.length === 0) {
    return "▁";
  }

  const glyphs = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"];
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return glyphs[Math.min(glyphs.length - 1, Math.max(0, Math.round(max / 15)))]
      .repeat(Math.min(values.length, 7));
  }

  return values.slice(-7).map((value) => {
    const normalized = (value - min) / (max - min);
    const index = Math.max(
      0,
      Math.min(glyphs.length - 1, Math.round(normalized * (glyphs.length - 1))),
    );
    return glyphs[index];
  }).join("");
}

function resolveCurrentYearId(
  academicYears: Array<{status: string; yearId: string}>,
): string {
  const active =
    academicYears.find((year) =>
      year.status === "Active" ||
      year.status === "Started" ||
      year.status === "Scheduled",
    ) ?? academicYears[0];

  return active?.yearId ?? "unknown";
}

function resolveLastArchiveDate(
  academicYears: Array<{archivedAt?: string | null}>,
): string {
  const archivedDates = academicYears
    .map((year) => year.archivedAt)
    .filter((value): value is string => typeof value === "string")
    .sort(compareIsoDescending);

  return archivedDates[0] ?? "Not archived yet";
}

function formatUpgradeAwareness(
  currentLayer: AdminOverviewLicenseLayer,
  eligibilityL1: number,
  eligibilityL2: number,
): string {
  if (currentLayer === "L0" && eligibilityL1 < 100) {
    return `L1 readiness at ${eligibilityL1}%.`;
  }

  if ((currentLayer === "L0" || currentLayer === "L1") && eligibilityL2 < 100) {
    return `L2 readiness at ${eligibilityL2}%.`;
  }

  if (currentLayer === "L2") {
    return "L3 governance unlock remains vendor-evaluated.";
  }

  return "Current layer eligibility is fully unlocked.";
}

function buildMostCommonDiagnosticSignal(
  governance: OverviewGovernanceSummary | null,
  runs: OverviewRunSummary[],
): string {
  const candidates = [
    {
      label: "Late-phase drift",
      value: average(runs.map((run) => run.pacingGuardrailViolationPercent)),
    },
    {
      label: "Easy neglect",
      value: average(runs.map((run) => run.easyNeglectPercent)),
    },
    {
      label: "Hard bias",
      value: average(runs.map((run) => run.hardBiasPercent)),
    },
    {
      label: "Skip bursts",
      value: governance?.skipBurstPercent ?? 0,
    },
  ].sort((left, right) => right.value - left.value);

  return candidates[0]?.label ?? "No dominant diagnostic signal yet";
}

function normalizeStudentSummary(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  fallbackAssessmentLabel: string,
): OverviewStudentSummary {
  const data = document.data();
  const disciplineIndex = toNumberOrZero(data.disciplineIndex);
  const lastActivityAt =
    toIsoString(data.lastSubmissionAt) ??
    toIsoString(data.lastCompletedAt) ??
    toIsoString(data.lastActive) ??
    toIsoString(data.updatedAt) ??
    new Date(0).toISOString();

  return {
    avgAccuracyPercent: toNumberOrZero(data.avgAccuracyPercent),
    avgRawScorePercent: toNumberOrZero(data.avgRawScorePercent),
    batchId: toNonEmptyString(data.batchId ?? data.batch, "unassigned"),
    batchName: toNonEmptyString(data.batchName ?? data.batch ?? data.batchId, "Unassigned Batch"),
    disciplineIndex,
    guessRatePercent: toNumberOrZero(data.guessRatePercent ?? data.avgGuessRatePercent),
    lastActivityAt,
    lastAssessmentLabel: toNonEmptyString(
      data.lastAssessmentLabel ??
        data.lastCompletedTestName ??
        data.lastRunName,
      fallbackAssessmentLabel,
    ),
    riskBucket: toStudentRiskBucket(
      data.rollingRiskCluster ?? data.riskState,
      disciplineIndex,
    ),
    studentId: toNonEmptyString(data.studentId, document.id),
    studentName: toNonEmptyString(data.studentName ?? data.fullName ?? data.name, document.id),
    testsAttempted: toNumberOrZero(data.testsAttempted),
  };
}

function normalizeRunSummary(
  document: FirebaseFirestore.QueryDocumentSnapshot,
): OverviewRunSummary {
  const data = document.data();
  const startedAt =
    toIsoString(data.startedAt) ??
    toIsoString(data.startTime) ??
    toIsoString(data.createdAt) ??
    new Date(0).toISOString();
  const scheduledFor =
    toIsoString(data.scheduledFor) ??
    toIsoString(data.scheduledAt) ??
    toIsoString(data.startTime) ??
    startedAt;

  return {
    avgAccuracyPercent: toNumberOrZero(data.avgAccuracyPercent),
    avgPhaseAdherencePercent: toNumberOrZero(data.avgPhaseAdherencePercent),
    avgRawScorePercent: toNumberOrZero(data.avgRawScorePercent),
    batchId: toNonEmptyString(data.batchId ?? data.batch, "unassigned"),
    batchName: toNonEmptyString(data.batchName ?? data.batch ?? data.batchId, "Unassigned Batch"),
    completionRatePercent: toNumberOrZero(data.completionRatePercent ?? data.completionRate),
    controlledCompliancePercent: toNumberOrZero(data.controlledCompliancePercent),
    disciplineIndexAverage: toNumberOrZero(data.disciplineIndexAverage ?? data.avgDisciplineIndex),
    easyNeglectPercent: toNumberOrZero(data.easyNeglectPercent),
    guessRatePercent: toNumberOrZero(data.guessRatePercent ?? data.guessRateClusterPercent),
    hardBiasPercent: toNumberOrZero(data.hardBiasPercent),
    minTimeViolationPercent: toNumberOrZero(data.minTimeViolationPercent),
    mode: toNonEmptyString(data.mode, "Operational"),
    pacingGuardrailViolationPercent: toNumberOrZero(data.pacingGuardrailViolationPercent),
    participants: toNumberOrZero(data.totalParticipants ?? data.participants),
    runId: toNonEmptyString(data.runId, document.id),
    runName: toNonEmptyString(data.runName ?? data.testName ?? data.name, document.id),
    scheduledFor,
    startedAt,
    status: toNonEmptyString(data.status, "completed").toLowerCase(),
    timeMisallocationPercent: toNumberOrZero(data.timeMisallocationPercent),
  };
}

function normalizeGovernanceSummary(
  document: FirebaseFirestore.QueryDocumentSnapshot,
): OverviewGovernanceSummary {
  const data = document.data();

  return {
    disciplineTrend: toNumberOrZero(data.disciplineTrend),
    executionIntegrityScore: toNumberOrZero(data.executionIntegrityScore),
    generatedAt:
      toIsoString(data.generatedAt) ??
      toIsoString(data.createdAt) ??
      new Date(0).toISOString(),
    month: toNonEmptyString(data.month, document.id.replace("_", "-")),
    overrideFrequency: toNumberOrZero(data.overrideFrequency),
    phaseCompliancePercent: toNumberOrZero(data.phaseCompliancePercent),
    rushPatternPercent: toNumberOrZero(data.rushPatternPercent),
    skipBurstPercent: toNumberOrZero(data.skipBurstPercent),
    stabilityIndex: toNumberOrZero(data.stabilityIndex),
    wrongStreakPercent: toNumberOrZero(data.wrongStreakPercent),
  };
}

export class AdminOverviewService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    instituteId?: unknown;
  }): AdminOverviewValidatedRequest {
    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    };
  }

  public async getOverviewSnapshot(
    request: AdminOverviewValidatedRequest,
  ): Promise<AdminOverviewSnapshot> {
    const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
      request.instituteId,
    );
    const licensingResult = await adminLicensingService.executeRequest({
      actionType: "GET_LICENSE_SNAPSHOT",
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
    });

    const instituteRoot = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const currentYearId = resolveCurrentYearId(settingsSnapshot.academicYears);
    const currentYearRef = instituteRoot
      .collection(ACADEMIC_YEARS_COLLECTION)
      .doc(currentYearId);

    const [
      currentYearDoc,
      runAnalyticsSnapshot,
      runsSnapshot,
      studentsSnapshot,
      studentMetricsSnapshot,
      governanceSnapshot,
    ] = await Promise.all([
      currentYearRef.get(),
      currentYearRef.collection(RUN_ANALYTICS_COLLECTION).get(),
      currentYearRef.collection(RUNS_COLLECTION).get(),
      instituteRoot.collection(STUDENTS_COLLECTION).get(),
      currentYearRef.collection(STUDENT_YEAR_METRICS_COLLECTION).get(),
      currentYearRef
        .collection(GOVERNANCE_SNAPSHOTS_COLLECTION)
        .orderBy("month", "desc")
        .limit(6)
        .get(),
    ]);

    const runAnalytics = runAnalyticsSnapshot.docs.map((document) =>
      normalizeRunSummary(document),
    );
    const runs = runsSnapshot.docs.map((document) => normalizeRunSummary(document));
    const combinedRuns = [...runAnalytics, ...runs]
      .sort((left, right) => compareIsoDescending(left.startedAt, right.startedAt));
    const latestRun = combinedRuns[0] ?? null;
    const students = studentMetricsSnapshot.docs.length > 0 ?
      studentMetricsSnapshot.docs.map((document) =>
        normalizeStudentSummary(document, latestRun?.runName ?? "Recent submission"),
      ) :
      studentsSnapshot.docs.map((document) =>
        normalizeStudentSummary(document, latestRun?.runName ?? "Recent submission"),
      );
    const governanceSnapshots = governanceSnapshot.docs.map((document) =>
      normalizeGovernanceSummary(document),
    );
    const latestGovernance = governanceSnapshots[0] ?? null;
    const previousGovernance = governanceSnapshots[1] ?? null;

    const now = new Date();
    const nextWeek = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    const monthPrefix = now.toISOString().slice(0, 7);

    const currentLayer = toLicenseLayer(
      licensingResult.snapshot.currentPlan.currentLayer,
    );
    const eligibilityL1Stage = licensingResult.snapshot.eligibilityProgress
      .find((entry) => entry.stage === "L1");
    const eligibilityL2Stage = licensingResult.snapshot.eligibilityProgress
      .find((entry) => entry.stage === "L2");
    const eligibilityL1Percentage = clampPercent(
      ((eligibilityL1Stage?.progressCurrent ?? 0) /
        Math.max(1, eligibilityL1Stage?.progressTarget ?? 1)) * 100,
    );
    const eligibilityL2Percentage = clampPercent(
      ((eligibilityL2Stage?.progressCurrent ?? 0) /
        Math.max(1, eligibilityL2Stage?.progressTarget ?? 1)) * 100,
    );

    const riskCounts: Record<StudentRiskBucket, number> = {
      critical: 0,
      high: 0,
      low: 0,
      medium: 0,
    };
    for (const student of students) {
      riskCounts[student.riskBucket] += 1;
    }

    const latestCompletedRun =
      [...combinedRuns]
        .filter((run) => run.completionRatePercent > 0)
        .sort((left, right) => compareIsoDescending(left.startedAt, right.startedAt))[0] ??
      latestRun;
    const scheduledRuns = combinedRuns.filter((run) => {
      const scheduledAt = Date.parse(run.scheduledFor);
      return !Number.isNaN(scheduledAt) &&
        scheduledAt >= now.getTime() &&
        scheduledAt <= nextWeek.getTime();
    });
    const activeRuns = combinedRuns.filter((run) =>
      run.status === "active" || run.status === "started",
    );
    const upcomingRun =
      [...scheduledRuns].sort((left, right) =>
        Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor),
      )[0] ?? null;
    const lastFiveSubmissions: AdminOverviewSubmissionSummary[] = [...students]
      .sort((left, right) => compareIsoDescending(left.lastActivityAt, right.lastActivityAt))
      .slice(0, 5)
      .map((student): AdminOverviewSubmissionSummary => ({
        assessmentLabel: student.lastAssessmentLabel,
        studentName: student.studentName,
        submittedAt: student.lastActivityAt,
      }));

    const batchAverages = new Map<string, {batchName: string; values: number[]}>();
    for (const run of combinedRuns) {
      const key = run.batchId;
      const current = batchAverages.get(key) ?? {
        batchName: run.batchName,
        values: [],
      };
      current.values.push(run.avgRawScorePercent);
      batchAverages.set(key, current);
    }

    const orderedBatches = [...batchAverages.values()]
      .map((entry) => ({
        batchName: entry.batchName,
        averageRaw: average(entry.values),
      }))
      .sort((left, right) => right.averageRaw - left.averageRaw);
    const highestPerformingBatch = orderedBatches[0]?.batchName ?? "No batch data";
    const lowestPerformingBatch =
      orderedBatches[orderedBatches.length - 1]?.batchName ?? highestPerformingBatch;

    const highAttentionStudents: AdminOverviewAttentionStudent[] = [...students]
      .sort((left, right) => {
        const riskDelta = riskWeight(right.riskBucket) - riskWeight(left.riskBucket);
        if (riskDelta !== 0) {
          return riskDelta;
        }

        return left.disciplineIndex - right.disciplineIndex;
      })
      .slice(0, 5)
      .map((student) => ({
        riskState: toRiskLabel(student.riskBucket),
        studentName: student.studentName,
      }));

    const currentYearData = currentYearDoc.data() ?? {};
    const currentYearStatus = toNonEmptyString(currentYearData.status, "Unknown");
    const academicYearLockStatus =
      currentYearData.locked === true || currentYearStatus.toLowerCase() === "archived" ?
        "Locked" :
        "Unlocked";
    const liveRiskCount = riskCounts.high + riskCounts.critical;
    const repeatedPatternCount = students.filter((student) =>
      student.riskBucket === "high" ||
        student.riskBucket === "critical" ||
        student.disciplineIndex < 70,
    ).length;
    const controlledRuns = combinedRuns.filter((run) =>
      run.mode.trim().toLowerCase() === "controlled",
    );
    const controlledModeDelta = controlledRuns.length > 0 ?
      average(controlledRuns.map((run) =>
        Math.max(0, run.disciplineIndexAverage - run.avgRawScorePercent),
      )) :
      0;
    const testsConducted = combinedRuns.filter((run) =>
      run.startedAt.startsWith(monthPrefix),
    ).length;
    const topWeakBatch = [...orderedBatches].sort((left, right) =>
      left.averageRaw - right.averageRaw,
    )[0];
    const mostCommonDiagnosticSignal = buildMostCommonDiagnosticSignal(
      latestGovernance,
      combinedRuns,
    );
    const storageSummary = settingsSnapshot.dataArchiveControls.storageSummary;
    const governanceValues = governanceSnapshots
      .map((snapshot) => snapshot.stabilityIndex)
      .reverse();

    return {
      academicYear: currentYearId,
      computedAt:
        latestGovernance?.generatedAt ??
        latestCompletedRun?.startedAt ??
        new Date().toISOString(),
      currentActivity: {
        activeTestSessions: activeRuns.length,
        controlledModeCompliancePercentage: clampPercent(
          average(activeRuns.map((run) => run.controlledCompliancePercent)),
        ),
        lastFiveSubmissions,
        liveBehaviorAlertCount: Math.max(
          0,
          Math.round(
            ((latestGovernance?.rushPatternPercent ?? 0) +
              (latestGovernance?.skipBurstPercent ?? 0)) / 10,
          ),
        ),
        liveRiskCount,
        minTimeViolationsLive: Math.max(
          0,
          Math.round(sum(activeRuns.map((run) => run.minTimeViolationPercent)) / 10),
        ),
        pacingDriftPercentage: clampPercent(
          average(activeRuns.map((run) => run.pacingGuardrailViolationPercent)),
        ),
        skipBurstPercentage: clampPercent(latestGovernance?.skipBurstPercent ?? 0),
        studentsCurrentlyInTest: sum(activeRuns.map((run) => run.participants)),
        upcomingTestLabel: upcomingRun ?
          `${upcomingRun.runName} - ${formatDateTime(upcomingRun.scheduledFor)}` :
          "No scheduled tests in the next 7 days",
      },
      executionSummary: {
        controlledModeImpactCard:
          controlledRuns.length > 0 ?
            `Controlled mode improved discipline by +${Math.round(controlledModeDelta)}% this month.` :
            "Controlled mode baseline is not available yet.",
        disciplineRegressionAlerts: students.filter((student) =>
          student.disciplineIndex < 60,
        ).length,
        highRiskStudentCount: liveRiskCount,
        mostCommonDiagnosticSignal,
        percentageStudentsWithRepeatedPattern: clampPercent(
          (repeatedPatternCount / Math.max(1, students.length)) * 100,
        ),
        phaseCompliancePercentage: clampPercent(
          latestGovernance?.phaseCompliancePercent ??
            average(combinedRuns.map((run) => run.avgPhaseAdherencePercent)),
        ),
        riskClusterBreakdown: formatRiskPie(riskCounts, students.length),
        topicWithHighestWeaknessCluster:
          topWeakBatch?.batchName ?
            `${topWeakBatch.batchName} requires topic reinforcement.` :
            "No weakness cluster available yet.",
      },
      governanceSnapshot: {
        disciplineTrajectoryIndicator: toDirection(
          latestGovernance?.disciplineTrend ?? 0,
        ),
        institutionalStabilityIndex: Math.round(
          latestGovernance?.stabilityIndex ??
            average(combinedRuns.map((run) => run.disciplineIndexAverage)),
        ),
        miniTrendSparkline: buildSparkline(governanceValues),
        monthOverMonthStabilityChange: Math.round(
          (latestGovernance?.stabilityIndex ?? 0) -
            (previousGovernance?.stabilityIndex ?? latestGovernance?.stabilityIndex ?? 0),
        ),
        overrideFrequencyTrend:
          latestGovernance && previousGovernance ?
            latestGovernance.overrideFrequency < previousGovernance.overrideFrequency ?
              "Declining" :
              latestGovernance.overrideFrequency > previousGovernance.overrideFrequency ?
                "Increasing" :
                "Stable" :
            "Stable",
      },
      operationalSnapshot: {
        activeConcurrentSessions: storageSummary.activeSessionCount,
        activeStudents: students.length,
        billingCount: licensingResult.snapshot.currentPlan.activeStudentCount,
        lastTestCompletionRatePercent: Math.round(
          latestCompletedRun?.completionRatePercent ?? 0,
        ),
        testsConducted,
        testsScheduled: scheduledRuns.length,
      },
      performanceSummary: {
        avgAccuracyPercentage: clampPercent(
          average(combinedRuns.map((run) => run.avgAccuracyPercent)),
        ),
        avgDisciplineIndex: clampPercent(
          average(students.map((student) => student.disciplineIndex)),
        ),
        avgPhaseAdherencePercentage: clampPercent(
          average(combinedRuns.map((run) => run.avgPhaseAdherencePercent)),
        ),
        avgRawScorePercentage: clampPercent(
          average(combinedRuns.map((run) => run.avgRawScorePercent)),
        ),
        controlledModeImprovementDelta: Math.round(controlledModeDelta),
        distributionHistogram: buildHistogram(combinedRuns),
        easyNeglectPercentage: clampPercent(
          average(combinedRuns.map((run) => run.easyNeglectPercent)),
        ),
        executionStabilityBadge: toExecutionBadge(
          latestGovernance?.stabilityIndex ??
            latestGovernance?.executionIntegrityScore ??
            average(students.map((student) => student.disciplineIndex)),
        ),
        hardBiasPercentage: clampPercent(
          average(combinedRuns.map((run) => run.hardBiasPercent)),
        ),
        highestPerformingBatch,
        lowestPerformingBatch,
        participationRate: clampPercent(
          average(combinedRuns.map((run) => run.completionRatePercent)),
        ),
        riskDistribution: formatRiskDistribution(riskCounts, students.length),
        timeMisallocationPercentage: clampPercent(
          average(combinedRuns.map((run) => run.timeMisallocationPercent)),
        ),
      },
      riskSnapshot: {
        disciplineIndex7DayTrend:
          toDirection(latestGovernance?.disciplineTrend ?? 0) === "Up" ?
            "Upward" :
            toDirection(latestGovernance?.disciplineTrend ?? 0) === "Down" ?
              "Downward" :
              "Stable",
        guessClusterPercentage: clampPercent(
          average(students.map((student) => student.guessRatePercent)),
        ),
        overstayRatePercentage: clampPercent(
          average(students.map((student) =>
            Math.max(0, (100 - student.disciplineIndex) * 0.3),
          )),
        ),
        riskDistributionPie: formatRiskPie(riskCounts, students.length),
        topFiveStudentsRequiringAttention: highAttentionStudents,
      },
      systemHealthAndLicensing: {
        academicYearLockStatus,
        activeStudentCount: licensingResult.snapshot.currentPlan.activeStudentCount,
        currentLayerBadge: currentLayer,
        eligibilityL1Percentage,
        eligibilityL2Percentage,
        lastArchiveDate: resolveLastArchiveDate(settingsSnapshot.academicYears),
        peakConcurrencyThisMonth:
          licensingResult.snapshot.usageAndBilling.peakConcurrency,
        storageUsageSummary:
          `HOT ${storageSummary.firestoreHotUsage}; archive ${storageSummary.bigQueryArchiveSize}`,
        upgradeAwarenessCard: formatUpgradeAwareness(
          currentLayer,
          eligibilityL1Percentage,
          eligibilityL2Percentage,
        ),
      },
    };
  }
}

export const adminOverviewService = new AdminOverviewService();
