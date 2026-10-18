import type {
  StudentDashboardResultV2, StudentPerformanceResultV2, StudentInsightsResultV2,
  StudentTestsResultV2, StudentSolutionsResultV2, StudentReadAccess,
} from "../contracts/studentEntitlements";

type Check = (value: unknown, path: string) => void;
const invalid = (path: string): never => { throw new Error(`Student response could not be validated: ${path}.`); };
const number: Check = (v, p) => { if (typeof v !== "number" || !Number.isFinite(v)) invalid(p); };
const integer: Check = (v, p) => { number(v, p); if (!Number.isSafeInteger(v) || Number(v) < 0) invalid(p); };
const positive: Check = (v, p) => { integer(v, p); if (v === 0) invalid(p); };
const string: Check = (v, p) => { if (typeof v !== "string" || !v.trim()) invalid(p); };
const boolean: Check = (v, p) => { if (typeof v !== "boolean") invalid(p); };
const literal = (...values: unknown[]): Check => (v, p) => { if (!values.includes(v)) invalid(p); };
const nullable = (check: Check): Check => (v, p) => { if (v !== null) check(v, p); };
const date: Check = (v, p) => { string(v, p); if (!Number.isFinite(Date.parse(String(v)))) invalid(p); };
const identifier: Check = (v, p) => { string(v, p); if (typeof v !== "string" || v !== v.trim() || v.length > 128 || v.includes("/") || v === "." || v === "..") invalid(p); };
const cursor: Check = (v, p) => { string(v, p); if (String(v).length > 4096) invalid(p); };
const array = (check: Check, max = 200): Check => (v, p) => {
  if (!Array.isArray(v) || v.length > max) return invalid(p);
  v.forEach((item, i) => check(item, `${p}[${i}]`));
};
const object = (shape: Record<string, Check>): Check => (v, p) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid(p);
  const data = v as Record<string, unknown>;
  if (Object.keys(data).some((key) => !Object.prototype.hasOwnProperty.call(shape, key))) invalid(p);
  for (const [key, check] of Object.entries(shape)) check(data[key], `${p}.${key}`);
};
const layer = literal("L0", "L1", "L2", "L3");
const mode = literal("Operational", "Diagnostic", "Controlled", "Hard");
const pattern = literal("Easy Neglect", "Guess Detection", "Late-Phase Drop", "Rushed Pattern", "Skip Burst", "No Pattern Yet");
const metrics = object({basic: literal(true), execution: boolean, insights: boolean,
  advanced: boolean, controlledComparison: boolean, hardTiming: boolean});
const access = object({policyVersion: literal("student-entitlements-v1"), licenseLayer: layer, metrics});
const scope = object({kind: literal("current"), yearId: identifier, tier: literal("HOT_WARM")});
const current = {contractVersion: literal(2), scope, access};
const gate = (allowed: boolean, check: Check): Check => allowed ? nullable(check) : literal(null);
const list = (allowed: boolean, check: Check): Check => array(check, allowed ? 200 : 0);
const fields = (keys: string[], check: Check) => Object.fromEntries(keys.map((key) => [key, check]));
const basics = {runId: identifier, testName: string, completedAt: date, rawScorePercent: number, accuracyPercent: number};
const topic = object({topic: string, rawScorePercent: number, accuracyPercent: number});
const signedUrl: Check = (v, p) => {
  string(v, p);
  try { const url = new URL(String(v));
    if (url.protocol !== "https:" || url.username || url.password || url.hash) invalid(p);
  } catch { invalid(p); }
};

export interface StudentSummaryResults {
  dashboard: StudentDashboardResultV2;
  performance: StudentPerformanceResultV2;
  insights: StudentInsightsResultV2;
  tests: StudentTestsResultV2;
  solutions: StudentSolutionsResultV2;
}

/** Closed v2 boundary: no numeric coercion, inferred years, raw fields or null-to-zero defaults. */
export function adaptStudentSummaryResult<K extends keyof StudentSummaryResults>(value: unknown, resource: K): StudentSummaryResults[K] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(resource);
  const data = value as Record<string, unknown>;
  access(data.access, `${resource}.access`);
  literal(2)(data.contractVersion, `${resource}.contractVersion`);
  const a = data.access as StudentReadAccess;
  const g = a.metrics;
  const order = ["L0", "L1", "L2", "L3"].indexOf(a.licenseLayer);
  if ((g.execution && order < 1) || (g.insights && !g.execution) || (g.advanced && order < 2) ||
      (g.controlledComparison && !g.advanced) || (g.hardTiming && !g.advanced)) invalid(`${resource}.access.metrics`);
  const historical = resource === "tests" && (data.scope as {kind?: string})?.kind === "history";
  if (!historical && (g.execution !== (order >= 1) || g.advanced !== (order >= 2))) invalid(`${resource}.access.metrics`);
  const shape: Record<string, Check> = {...current};
  if (resource === "dashboard" || resource === "performance" || resource === "insights") {
    shape.licenseLayer = literal(a.licenseLayer);
  }
  if (resource === "dashboard") Object.assign(shape, {
    avgRawScorePercent: number, avgAccuracyPercent: number, testsAttempted: integer, batchRank: nullable(positive),
    ...fields(["disciplineIndex", "guessProbabilityPercent"], gate(g.advanced, number)),
    riskState: gate(g.advanced, literal("low", "medium", "high", "critical")),
    executionStabilityFlag: gate(g.advanced, string),
    ...fields(["phaseAdherencePercent", "easyNeglectPercent", "hardBiasPercent", "timeMisallocationPercent"], gate(g.execution, number)),
    behaviorSummaryTag: gate(g.execution, string),
    controlledModeImprovementDeltaPercent: gate(g.controlledComparison, number),
    phaseComplianceMiniTrend: list(g.execution, object({label: string, value: number})),
    recentResults: array(object(basics)),
    upcomingTests: array(object({runId: identifier, testName: string, mode, startAt: date, endAt: date, durationMinutes: integer})),
  });
  if (resource === "performance") Object.assign(shape, {
    ...fields(["disciplineIndex", "overstayFrequencyPercent", "guessProbabilityPercent"], gate(g.advanced, number)),
    guessProbabilityCluster: gate(g.advanced, literal("Low", "Medium", "High")),
    ...fields(["phaseCompliancePercent", "easyNeglectFrequencyPercent", "hardBiasFrequencyPercent", "timeAllocationBalancePercent"], gate(g.execution, number)),
    controlledModeImprovementPercent: gate(g.controlledComparison, number),
    topicPerformanceBreakdown: list(g.execution, topic),
    controlledModeComparison: gate(g.controlledComparison, object({baselineLabel: string, currentLabel: string,
      ...fields(["phaseAdherenceDeltaPercent", "disciplineIndexDeltaPercent", "minTimeViolationDeltaPercent", "guessRateDeltaPercent"], number),
      maxTimeViolationDeltaPercent: gate(g.hardTiming, number)})),
    timeline: array(object({runId: identifier, runLabel: string, completedAt: date, rawScorePercent: number,
      accuracyPercent: number, timeSpentMinutes: integer, rankInBatch: nullable(positive),
      ...fields(["disciplineIndex", "guessRatePercent", "minTimeViolationPercent", "overstayFrequencyPercent"], gate(g.advanced, number)),
      ...fields(["phaseAdherencePercent", "timeAllocationBalancePercent"], gate(g.execution, number)),
      maxTimeViolationPercent: gate(g.hardTiming, number),
      riskState: gate(g.advanced, literal("Stable", "Improving", "Building Discipline"))})),
  });
  if (resource === "insights") {
    if (!g.insights) invalid("insights.access");
    Object.assign(shape, {mostFrequentBehaviorPattern: pattern, phaseAdherenceFeedback: string,
      archivedSummaryOnlyCount: integer, currentYearSolutionAccessOnly: literal(true),
      ...fields(["latePhaseDropIndicatorPercent", "rushedPatternFrequencyPercent", "skipBurstIndicatorPercent"], number),
      guessDetectionAlertPercent: gate(g.advanced, number), disciplineImprovementSuggestions: gate(g.advanced, array(string)),
      snapshots: array(object({snapshotId: identifier, generatedAt: date, rawScorePercent: number, accuracyPercent: number,
        ...fields(["easyNeglectFrequencyPercent", "latePhaseDropPercent", "rushedPatternFrequencyPercent", "skipBurstFrequencyPercent"], number),
        guessDetectionPercent: gate(g.advanced, number), dominantPattern: pattern})),
      topicWeaknessSummary: array(object({topic: string, weaknessPercent: number, feedback: string,
        tutorialVideoLink: literal(null), simulationLink: literal(null)})),
    });
  }
  const page = (item: Check, max: number): Check => (v, p) => {
    object({items: array(item, max), nextCursor: nullable(cursor), hasMore: boolean})(v, p);
    const record = v as {nextCursor: string | null; hasMore: boolean};
    if (record.hasMore !== (record.nextCursor !== null)) invalid(`${p}.nextCursor`);
  };
  if (resource === "tests") {
    const selected = data.scope as Record<string, unknown> | undefined;
    if (selected?.kind === "history") {
      shape.scope = object({kind: literal("history"), yearId: nullable(identifier), tier: literal("COLD_SUMMARY")});
      if (Object.entries(g).some(([key, grant]) => key !== "basic" && grant)) invalid("tests.history.access");
      shape.page = page((v, p) => {
        object({academicYear: identifier, currentAcademicYear: literal(false), ...basics, testId: identifier})(v, p);
        if (selected.yearId !== null && (v as {academicYear: string}).academicYear !== selected.yearId) invalid(p);
      }, 50);
    } else shape.page = page((v, p) => {
      const record = v as Record<string, unknown>;
      const availability: Check = (s, q) => {
        if ((s as {state?: string})?.state === "available") object({state: literal("available"), releasedAt: date})(s, q);
        else object({state: literal("locked"), reason: literal("not_completed", "not_released", "unavailable")})(s, q);
      };
      object({academicYear: identifier, currentAcademicYear: literal(true), runId: identifier, testId: identifier, testName: string,
        status: literal("scheduled", "active", "completed", "archived"), mode, startWindow: date, endWindow: date,
        durationMinutes: integer, ...fields(["rawScorePercent", "accuracyPercent", "timeUsedMinutes"], nullable(number)),
        rankInBatch: nullable(positive), completedAt: nullable(date), sessionId: nullable(identifier),
        sessionLink: literal(null), summaryPdfUrl: literal(null), archivedSummary: nullable(string), attemptStatusLabel: nullable(string),
        ...fields(["attemptedQuestions", "totalQuestions", "flaggedQuestions"], nullable(integer)), solutionAccess: availability})(v, p);
      if (record.academicYear !== selected?.yearId) invalid(`${p}.academicYear`);
      if ((record.solutionAccess as {state: string}).state === "available" && record.status !== "completed") invalid(`${p}.solutionAccess`);
    }, 50);
  }
  if (resource === "solutions") Object.assign(shape, {runId: identifier, testId: identifier, releasedAt: date,
    page: page((v, p) => {
      object({questionId: identifier, questionVersion: positive, questionRevision: positive,
        questionImageUrl: nullable(signedUrl), solutionImageUrl: nullable(signedUrl), assetsExpireAt: nullable(date),
        correctAnswer: string, studentAnswer: nullable(string), tutorialVideoLink: nullable(signedUrl), simulationLink: nullable(signedUrl)})(v, p);
      const item = v as Record<string, unknown>;
      if ((item.questionImageUrl !== null || item.solutionImageUrl !== null) && item.assetsExpireAt === null) invalid(`${p}.assetsExpireAt`);
    }, 20)});
  object(shape)(data, resource);
  // Validation above is exhaustive; preserve nulls, opaque cursors and signed URL bytes exactly.
  return structuredClone(data) as unknown as StudentSummaryResults[K];
}
