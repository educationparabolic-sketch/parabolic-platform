import type {
  RunAnalyticsRecord,
  StudentYearMetricRecord,
  TemplateAnalyticsRecord,
  TemplateAnalyticsRunRecord,
} from "./analyticsDataset";

export const ANALYTICS_LAYER_OPTIONS = ["L0", "L1", "L2"] as const;
export const RUN_SOURCE_OPTIONS = ["Test", "Assignment"] as const;

export type AnalyticsLayer = (typeof ANALYTICS_LAYER_OPTIONS)[number];
export type RunSource = (typeof RUN_SOURCE_OPTIONS)[number];

export interface DerivedRunRecord extends RunAnalyticsRecord {
  subject: string;
  program: string;
  runSource: RunSource;
  templateName: string;
  templateId: string;
  templateType: string;
  difficultyBand: string;
  participationRatePercent: number;
  avgDurationUsedPercent: number;
  dominantBehaviorTag: string;
  riskMixLabel: string;
  stabilityFlag: string;
  controlledModeDelta: number;
}

export interface DerivedTemplateRecord extends TemplateAnalyticsRecord {
  subject: string;
  templateType: string;
  program: string;
  difficultyBand: string;
  avgParticipationPercent: number;
  avgCompletionPercent: number;
  dominantBehaviorTag: string;
  riskMixLabel: string;
  stabilityFlag: string;
  avgControlledModeDelta: number;
}

export interface DerivedBatchRecord {
  batchId: string;
  batchName: string;
  academicYear: string;
  studentCount: number;
  activeStudentCount: number;
  lastActivityAt: string;
  program: string;
  subjects: string[];
  runCount: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgParticipationPercent: number;
  avgCompletionPercent: number;
  avgPhaseAdherencePercent: number;
  avgEasyNeglectPercent: number;
  avgHardBiasPercent: number;
  avgDisciplineIndex: number;
  avgGuessRatePercent: number;
  avgControlledModeDelta: number;
  highRiskRunCount: number;
  dominantBehaviorTag: string;
  riskMixLabel: string;
  stabilityFlag: string;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxNumber(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values);
}

function toTemplateSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "template";
}

export function normalizeTemplateName(runName: string): string {
  return runName.split("/")[0]?.trim() || runName.trim();
}

export function inferSubject(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("physics") || normalized.includes("mechanics") || normalized.includes("optics")) {
    return "Physics";
  }
  if (normalized.includes("chemistry") || normalized.includes("organic")) {
    return "Chemistry";
  }
  if (normalized.includes("biology") || normalized.includes("botany") || normalized.includes("zoology")) {
    return "Biology";
  }
  if (normalized.includes("math")) {
    return "Mathematics";
  }
  return "General";
}

export function inferProgram(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("neet")) {
    return "NEET";
  }
  if (normalized.includes("jee")) {
    return "JEE";
  }
  if (normalized.includes("foundation")) {
    return "Foundation";
  }
  return "General";
}

export function inferTemplateType(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("mock")) {
    return "Mock Test";
  }
  if (normalized.includes("revision")) {
    return "Revision Set";
  }
  if (normalized.includes("drill")) {
    return "Drill Set";
  }
  if (normalized.includes("weekly")) {
    return "Weekly Test";
  }
  if (normalized.includes("calibration")) {
    return "Calibration Test";
  }
  return "General";
}

export function inferRunSource(label: string): RunSource {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("assignment") ||
    normalized.includes("homework") ||
    normalized.includes("worksheet") ||
    normalized.includes("practice")
  ) {
    return "Assignment";
  }

  return "Test";
}

export function inferDifficultyBand(avgRawScorePercent: number): string {
  if (avgRawScorePercent < 60) {
    return "Hard";
  }
  if (avgRawScorePercent < 75) {
    return "Balanced";
  }
  return "Accessible";
}

export function riskMixLabel(riskDistribution: Record<"low" | "medium" | "high" | "critical", number>): string {
  const highPressure = riskDistribution.high + riskDistribution.critical;
  if (highPressure >= 20) {
    return "High-heavy";
  }
  if (riskDistribution.medium >= riskDistribution.low) {
    return "Medium-led";
  }
  return "Low-led";
}

export function dominantBehaviorTag(run: Pick<
  RunAnalyticsRecord,
  "easyNeglectPercent" | "hardBiasPercent" | "behaviorDistribution"
>): string {
  const candidates = [
    { label: "Easy neglect", value: run.easyNeglectPercent },
    { label: "Hard bias", value: run.hardBiasPercent },
    { label: "Rushed", value: run.behaviorDistribution.rushedPercent },
    { label: "Overextended", value: run.behaviorDistribution.overextendedPercent },
    { label: "Drift-prone", value: run.behaviorDistribution.driftPronePercent },
  ];

  return candidates.sort((left, right) => right.value - left.value)[0]?.label ?? "Balanced";
}

export function stabilityFlag(run: Pick<RunAnalyticsRecord, "rawScoreStdDeviation" | "disciplineIndexAverage" | "guessRatePercent">): string {
  if (run.rawScoreStdDeviation <= 10 && run.disciplineIndexAverage >= 72 && run.guessRatePercent <= 14) {
    return "Stable";
  }
  if (run.rawScoreStdDeviation <= 14 && run.disciplineIndexAverage >= 60 && run.guessRatePercent <= 22) {
    return "Watch";
  }
  return "Unstable";
}

export function avgDurationUsedPercent(run: Pick<
  RunAnalyticsRecord,
  "followedPhaseSplitPercent" | "timeMisallocationPercent" | "minTimeViolationPercent" | "maxTimeViolationPercent"
>): number {
  const estimate =
    run.followedPhaseSplitPercent -
    (run.timeMisallocationPercent * 0.35) -
    (run.minTimeViolationPercent * 0.2) -
    (run.maxTimeViolationPercent * 0.6);

  return Math.max(0, Math.min(100, Math.round(estimate)));
}

export function controlledModeDelta(run: Pick<RunAnalyticsRecord, "controlledCompliancePercent" | "avgRawScorePercent">): number {
  if (run.controlledCompliancePercent <= 0) {
    return 0;
  }

  return Math.round(run.controlledCompliancePercent - run.avgRawScorePercent);
}

export function deriveRunRecords(runs: RunAnalyticsRecord[]): DerivedRunRecord[] {
  const maxParticipants = Math.max(1, maxNumber(runs.map((run) => run.participants)));

  return runs.map((run) => {
    const templateName = normalizeTemplateName(run.runName);
    return {
      ...run,
      subject: inferSubject(run.runName),
      program: inferProgram(run.runName),
      runSource: inferRunSource(run.runName),
      templateName,
      templateId: `tmpl-${toTemplateSlug(templateName)}`,
      templateType: inferTemplateType(templateName),
      difficultyBand: inferDifficultyBand(run.avgRawScorePercent),
      participationRatePercent: Math.round((run.participants / maxParticipants) * 100),
      avgDurationUsedPercent: avgDurationUsedPercent(run),
      dominantBehaviorTag: dominantBehaviorTag(run),
      riskMixLabel: riskMixLabel(run.riskDistribution),
      stabilityFlag: stabilityFlag(run),
      controlledModeDelta: controlledModeDelta(run),
    };
  });
}

function buildTemplateRunRecord(run: DerivedRunRecord): TemplateAnalyticsRunRecord {
  return {
    runId: run.runId,
    runName: run.runName,
    completedOn: run.startedAt,
    mode: run.mode,
    avgRawScorePercent: run.avgRawScorePercent,
    avgAccuracyPercent: run.avgAccuracyPercent,
    phaseAdherencePercent: run.avgPhaseAdherencePercent,
    stabilityIndex: Math.max(0, Math.min(100, Math.round(run.disciplineIndexAverage - run.guessRatePercent * 0.6))),
    riskShiftPercent: Math.max(0, Math.min(100, run.riskDistribution.high + run.riskDistribution.critical + Math.round(run.guessRatePercent * 0.3))),
    disciplineStressScore: Math.max(0, Math.min(100, Math.round(100 - run.disciplineIndexAverage + run.timeMisallocationPercent * 0.3))),
  };
}

export function deriveTemplateRecords(runs: DerivedRunRecord[]): DerivedTemplateRecord[] {
  const groups = new Map<string, DerivedRunRecord[]>();

  for (const run of runs) {
    const existing = groups.get(run.templateName) ?? [];
    existing.push(run);
    groups.set(run.templateName, existing);
  }

  return [...groups.entries()]
    .map(([templateName, templateRuns]) => {
      const orderedRuns = [...templateRuns].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      const runRecords = orderedRuns.map(buildTemplateRunRecord);
      const avgRawScorePercent = Math.round(average(orderedRuns.map((run) => run.avgRawScorePercent)));
      const avgAccuracyPercent = Math.round(average(orderedRuns.map((run) => run.avgAccuracyPercent)));
      const avgDisciplineIndex = Math.round(average(orderedRuns.map((run) => run.disciplineIndexAverage)));
      const avgRiskShiftPercent = Math.round(average(runRecords.map((run) => run.riskShiftPercent)));
      const avgDisciplineStressScore = Math.round(average(runRecords.map((run) => run.disciplineStressScore)));
      const rawVariance = Math.round(average(orderedRuns.map((run) => Math.abs(run.avgRawScorePercent - avgRawScorePercent))));
      const phaseAdherenceVariance = Math.round(
        average(orderedRuns.map((run) => Math.abs(run.avgPhaseAdherencePercent - average(orderedRuns.map((item) => item.avgPhaseAdherencePercent))))),
      );

      return {
        templateId: orderedRuns[0]?.templateId ?? `tmpl-${toTemplateSlug(templateName)}`,
        templateName,
        academicYear: orderedRuns[0]?.academicYear ?? "2026",
        examType: orderedRuns[0]?.program ?? "General",
        totalRuns: orderedRuns.length,
        avgRawScorePercent,
        avgAccuracyPercent,
        rawVariance,
        phaseAdherenceVariance,
        avgRiskShiftPercent,
        avgDisciplineStressScore,
        avgDisciplineIndex,
        templateEffectivenessRating: Math.round(
          (avgRawScorePercent * 0.45) +
          (avgAccuracyPercent * 0.2) +
          (avgDisciplineIndex * 0.2) +
          ((100 - avgRiskShiftPercent) * 0.15),
        ),
        runs: runRecords,
        subject: orderedRuns[0]?.subject ?? "General",
        templateType: orderedRuns[0]?.templateType ?? "General",
        program: orderedRuns[0]?.program ?? "General",
        difficultyBand: inferDifficultyBand(avgRawScorePercent),
        avgParticipationPercent: Math.round(average(orderedRuns.map((run) => run.participationRatePercent))),
        avgCompletionPercent: Math.round(average(orderedRuns.map((run) => run.completionRatePercent))),
        dominantBehaviorTag: dominantBehaviorTag(orderedRuns[0] ?? templateRuns[0]),
        riskMixLabel: riskMixLabel(orderedRuns.reduce<Record<"low" | "medium" | "high" | "critical", number>>(
          (distribution, run) => ({
            low: distribution.low + run.riskDistribution.low,
            medium: distribution.medium + run.riskDistribution.medium,
            high: distribution.high + run.riskDistribution.high,
            critical: distribution.critical + run.riskDistribution.critical,
          }),
          { low: 0, medium: 0, high: 0, critical: 0 },
        )),
        stabilityFlag: orderedRuns.some((run) => run.stabilityFlag === "Unstable") ?
          "Unstable" :
          (orderedRuns.some((run) => run.stabilityFlag === "Watch") ? "Watch" : "Stable"),
        avgControlledModeDelta: Math.round(average(orderedRuns.map((run) => run.controlledModeDelta))),
      };
    })
    .sort((left, right) => right.totalRuns - left.totalRuns || left.templateName.localeCompare(right.templateName));
}

export function deriveBatchRecords(
  runs: DerivedRunRecord[],
  students: StudentYearMetricRecord[],
): DerivedBatchRecord[] {
  const groups = new Map<string, DerivedRunRecord[]>();

  for (const run of runs) {
    const key = run.batchId || run.batchName;
    const existing = groups.get(key) ?? [];
    existing.push(run);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([key, batchRuns]) => {
      const batchStudents = students.filter((student) => (student.batchId || student.batchName) === key);
      const subjects = [...new Set(batchRuns.map((run) => run.subject))].sort((left, right) => left.localeCompare(right));
      const lastActivityAt = [...batchRuns]
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0]?.startedAt ?? "";
      const highRiskRunCount = batchRuns.filter((run) => run.riskDistribution.high + run.riskDistribution.critical >= 18).length;
      const stabilityFlags = batchRuns.map((run) => run.stabilityFlag);

      return {
        batchId: batchRuns[0]?.batchId ?? key,
        batchName: batchRuns[0]?.batchName ?? key,
        academicYear: batchRuns[0]?.academicYear ?? "2026",
        studentCount: batchStudents.length,
        activeStudentCount: batchStudents.filter((student) => student.testsAttempted > 0).length,
        lastActivityAt,
        program: batchRuns[0]?.program ?? "General",
        subjects,
        runCount: batchRuns.length,
        avgRawScorePercent: Math.round(average(batchRuns.map((run) => run.avgRawScorePercent))),
        avgAccuracyPercent: Math.round(average(batchRuns.map((run) => run.avgAccuracyPercent))),
        avgParticipationPercent: Math.round(average(batchRuns.map((run) => run.participationRatePercent))),
        avgCompletionPercent: Math.round(average(batchRuns.map((run) => run.completionRatePercent))),
        avgPhaseAdherencePercent: Math.round(average(batchRuns.map((run) => run.avgPhaseAdherencePercent))),
        avgEasyNeglectPercent: Math.round(average(batchRuns.map((run) => run.easyNeglectPercent))),
        avgHardBiasPercent: Math.round(average(batchRuns.map((run) => run.hardBiasPercent))),
        avgDisciplineIndex: Math.round(
          batchStudents.length > 0 ?
            average(batchStudents.map((student) => student.disciplineIndex)) :
            average(batchRuns.map((run) => run.disciplineIndexAverage)),
        ),
        avgGuessRatePercent: Math.round(
          batchStudents.length > 0 ?
            average(batchStudents.map((student) => student.guessRatePercent)) :
            average(batchRuns.map((run) => run.guessRatePercent)),
        ),
        avgControlledModeDelta: Math.round(average(batchRuns.map((run) => run.controlledModeDelta))),
        highRiskRunCount,
        dominantBehaviorTag: dominantBehaviorTag(batchRuns[0] ?? runs[0]),
        riskMixLabel: riskMixLabel(batchRuns.reduce<Record<"low" | "medium" | "high" | "critical", number>>(
          (distribution, run) => ({
            low: distribution.low + run.riskDistribution.low,
            medium: distribution.medium + run.riskDistribution.medium,
            high: distribution.high + run.riskDistribution.high,
            critical: distribution.critical + run.riskDistribution.critical,
          }),
          { low: 0, medium: 0, high: 0, critical: 0 },
        )),
        stabilityFlag: stabilityFlags.includes("Unstable") ? "Unstable" : (stabilityFlags.includes("Watch") ? "Watch" : "Stable"),
      };
    })
    .sort((left, right) => left.batchName.localeCompare(right.batchName));
}

export function buildScopeQuery(scope: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(scope)) {
    if (value.trim().length > 0 && value !== "all") {
      search.set(key, value);
    }
  }

  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}
