import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UiChartContainer, type UiChartPoint } from "../../../../../shared/ui/components";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  fetchDashboardDataset,
  type RunAnalyticsRecord,
} from "../analytics/analyticsDataset";
import {
  DIFFICULTY_LEVELS,
  QUESTION_BANK,
  type DifficultyLevel,
  type QuestionBankRecord,
} from "./testTemplateFixtures";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

interface TemplateAnalyticsRunRow {
  runId: string;
  runName: string;
  completedOn: string;
  mode: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherenceVariance: number;
  riskShiftPercent: number;
  stabilityVariance: number;
  disciplineStressScore: number;
  controlledModeDelta: number;
}

interface TemplateAnalyticsDetailRecord {
  id: string;
  templateName: string;
  examType: string;
  status: string;
  runCount: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherenceVariance: number;
  riskShiftAveragePercent: number;
  stabilityVariance: number;
  disciplineStressScore: number;
  controlledVsUncontrolledDelta: number;
  effectivenessRating: number;
  runs: TemplateAnalyticsRunRow[];
}

interface TimingWindow {
  minSeconds: number;
  maxSeconds: number;
}

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

interface TestTemplateDetailRecord {
  id: string;
  templateName: string;
  examType: string;
  selectionMethod: string;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  allowedModes: string[];
  timingProfile: Record<keyof DifficultyDistribution, TimingWindow>;
  status: string;
  updatedAt: string;
  canonicalId: string;
}

interface DifficultyReviewRow {
  count: number;
  difficulty: DifficultyLevel;
  maxSeconds: number;
  minSeconds: number;
  percent: number;
}

interface ChapterCoverageRow {
  chapter: string;
  count: number;
  percent: number;
  subjects: string;
}

interface MarksDistributionRow {
  marks: string;
  count: number;
  percent: number;
}

interface SectionBalanceRow {
  count: number;
  percent: number;
  section: string;
}

const TEMPLATE_ANALYTICS_DETAILS: TemplateAnalyticsDetailRecord[] = [
  {
    id: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    status: "draft",
    runCount: 3,
    avgRawScorePercent: 66,
    avgAccuracyPercent: 74,
    phaseAdherenceVariance: 7,
    riskShiftAveragePercent: 14,
    effectivenessRating: 73,
    runs: [
      {
        runId: "run-2026-0410-001",
        runName: "Alpha Mock",
        completedOn: "2026-04-10T06:30:00.000Z",
        avgRawScorePercent: 68,
        avgAccuracyPercent: 76,
        phaseAdherenceVariance: 6,
        riskShiftPercent: 12,
        mode: "Controlled",
        stabilityVariance: 14,
        disciplineStressScore: 16,
        controlledModeDelta: 8,
      },
      {
        runId: "run-2026-0407-002",
        runName: "Beta Mock",
        completedOn: "2026-04-07T06:30:00.000Z",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 72,
        phaseAdherenceVariance: 8,
        riskShiftPercent: 16,
        mode: "Diagnostic",
        stabilityVariance: 18,
        disciplineStressScore: 21,
        controlledModeDelta: 0,
      },
      {
        runId: "run-2026-0404-001",
        runName: "Gamma Mock",
        completedOn: "2026-04-04T06:30:00.000Z",
        avgRawScorePercent: 66,
        avgAccuracyPercent: 73,
        phaseAdherenceVariance: 7,
        riskShiftPercent: 14,
        mode: "Operational",
        stabilityVariance: 17,
        disciplineStressScore: 19,
        controlledModeDelta: 0,
      },
    ],
    stabilityVariance: 16,
    disciplineStressScore: 19,
    controlledVsUncontrolledDelta: 5,
  },
  {
    id: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    status: "assigned",
    runCount: 4,
    avgRawScorePercent: 61,
    avgAccuracyPercent: 70,
    phaseAdherenceVariance: 9,
    riskShiftAveragePercent: 19,
    effectivenessRating: 66,
    runs: [
      {
        runId: "run-2026-0409-003",
        runName: "Biology Focus / Beta",
        completedOn: "2026-04-09T05:00:00.000Z",
        avgRawScorePercent: 62,
        avgAccuracyPercent: 71,
        phaseAdherenceVariance: 8,
        riskShiftPercent: 18,
        mode: "Diagnostic",
        stabilityVariance: 19,
        disciplineStressScore: 24,
        controlledModeDelta: 0,
      },
      {
        runId: "run-2026-0406-002",
        runName: "Biology Focus / Alpha",
        completedOn: "2026-04-06T05:00:00.000Z",
        avgRawScorePercent: 58,
        avgAccuracyPercent: 68,
        phaseAdherenceVariance: 10,
        riskShiftPercent: 22,
        mode: "Operational",
        stabilityVariance: 23,
        disciplineStressScore: 29,
        controlledModeDelta: 0,
      },
      {
        runId: "run-2026-0402-001",
        runName: "Revision Camp",
        completedOn: "2026-04-02T05:00:00.000Z",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 73,
        phaseAdherenceVariance: 7,
        riskShiftPercent: 15,
        mode: "Controlled",
        stabilityVariance: 16,
        disciplineStressScore: 18,
        controlledModeDelta: 7,
      },
      {
        runId: "run-2026-0329-001",
        runName: "Deep Drill",
        completedOn: "2026-03-29T05:00:00.000Z",
        avgRawScorePercent: 60,
        avgAccuracyPercent: 69,
        phaseAdherenceVariance: 9,
        riskShiftPercent: 20,
        mode: "Controlled",
        stabilityVariance: 20,
        disciplineStressScore: 26,
        controlledModeDelta: 6,
      },
    ],
    stabilityVariance: 20,
    disciplineStressScore: 24,
    controlledVsUncontrolledDelta: 6,
  },
];

const TEMPLATE_DETAILS: TestTemplateDetailRecord[] = [
  {
    id: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    selectionMethod: "manual",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-104", "q-105", "q-107", "q-108"],
    difficultyDistribution: { easy: 3, medium: 3, hard: 0 },
    allowedModes: ["Operational", "Diagnostic", "Controlled"],
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "draft",
    updatedAt: "2026-04-10T08:30:00.000Z",
    canonicalId: "14a94be7286349e2624b0ef42f9eaa9f4c89eb2d270218071b060962fce6057f",
  },
  {
    id: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    selectionMethod: "round_robin",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-101", "q-103", "q-104", "q-106", "q-108", "q-109"],
    difficultyDistribution: { easy: 2, medium: 2, hard: 2 },
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "assigned",
    updatedAt: "2026-04-08T11:45:00.000Z",
    canonicalId: "da6cf95d845169f18f6f0f260fa8535f89b7afe29158416f1572a5f9f29407f5",
  },
];

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatTemplateStatusLabel(value: string): string {
  switch (value.toLowerCase()) {
    case "draft":
      return "Draft";
    case "ready":
      return "Ready";
    case "assigned":
      return "Used in Assignments";
    case "archived":
      return "Archived";
    case "deprecated":
      return "Retired";
    default:
      return value;
  }
}

function formatSelectionMethodLabel(value: string): string {
  switch (value.toLowerCase()) {
    case "manual":
      return "Manual";
    case "round_robin":
      return "Round Robin";
    case "statistical":
      return "Statistical";
    case "upload_id":
      return "Upload ID";
    default:
      return value.replace(/_/g, " ");
  }
}

function normalizeTimingWindow(value: unknown, fallback: TimingWindow): TimingWindow {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;
  return {
    minSeconds: toNumberOrZero(source.minSeconds ?? source.min ?? fallback.minSeconds),
    maxSeconds: toNumberOrZero(source.maxSeconds ?? source.max ?? fallback.maxSeconds),
  };
}

function normalizeTemplateDetailRecord(value: unknown, index: number): TestTemplateDetailRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = TEMPLATE_DETAILS[index] ?? TEMPLATE_DETAILS[0];
  const timingProfileSource =
    record.timingProfile && typeof record.timingProfile === "object" ?
      (record.timingProfile as Record<string, unknown>) :
      {};
  const distributionSource =
    record.difficultyDistribution && typeof record.difficultyDistribution === "object" ?
      (record.difficultyDistribution as Record<string, unknown>) :
      {};
  const questionIdsSource = record.selectedQuestionIds ?? record.questionIds;
  const allowedModes = Array.isArray(record.allowedModes) ?
    record.allowedModes.filter((value): value is string => typeof value === "string" && value.trim().length > 0) :
    fallback?.allowedModes ?? [];
  const selectedQuestionIds = Array.isArray(questionIdsSource) ?
    questionIdsSource.filter((value): value is string => typeof value === "string" && value.trim().length > 0) :
    fallback?.selectedQuestionIds ?? [];

  return {
    id: toNonEmptyString(record.id, `template-${index + 1}`),
    templateName: toNonEmptyString(record.templateName, fallback?.templateName ?? `Template ${index + 1}`),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    selectionMethod: toNonEmptyString(record.selectionMethod, fallback?.selectionMethod ?? "manual"),
    totalDurationMinutes: toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: toNumberOrZero(distributionSource.easy),
      medium: toNumberOrZero(distributionSource.medium),
      hard: toNumberOrZero(distributionSource.hard),
    },
    allowedModes,
    timingProfile: {
      easy: normalizeTimingWindow(timingProfileSource.easy, fallback?.timingProfile.easy ?? { minSeconds: 30, maxSeconds: 60 }),
      medium: normalizeTimingWindow(timingProfileSource.medium, fallback?.timingProfile.medium ?? { minSeconds: 60, maxSeconds: 150 }),
      hard: normalizeTimingWindow(timingProfileSource.hard, fallback?.timingProfile.hard ?? { minSeconds: 150, maxSeconds: 210 }),
    },
    status: toNonEmptyString(record.status, fallback?.status ?? "draft"),
    updatedAt: toNonEmptyString(record.updatedAt, fallback?.updatedAt ?? new Date(0).toISOString()),
    canonicalId: toNonEmptyString(record.canonicalId, fallback?.canonicalId ?? `canonical-${index + 1}`),
  };
}

async function fetchTemplateDetails(): Promise<TestTemplateDetailRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/tests");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/tests returned an invalid payload.");
  }

  const templates = payload
    .map((entry, index) => normalizeTemplateDetailRecord(entry, index))
    .filter((entry): entry is TestTemplateDetailRecord => Boolean(entry));

  if (templates.length === 0) {
    throw new Error("GET /admin/tests did not include any templates.");
  }

  return templates;
}

function normalizeDifficulty(
  value: unknown,
  fallback: DifficultyLevel,
): DifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
}

function normalizeQuestionRecord(value: unknown, index: number): QuestionBankRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = QUESTION_BANK[index] ?? QUESTION_BANK[0];

  return {
    academicYear: toNonEmptyString(record.academicYear, fallback?.academicYear ?? "unassigned"),
    additionalTag: toNonEmptyString(record.additionalTag, fallback?.additionalTag ?? "none"),
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    correctAnswer: toNonEmptyString(record.correctAnswer, fallback?.correctAnswer ?? ""),
    difficulty: normalizeDifficulty(record.difficulty, fallback?.difficulty ?? "medium"),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    id: toNonEmptyString(record.id, fallback?.id ?? `q-${index + 1}`),
    internalNotes: toNonEmptyString(record.internalNotes, fallback?.internalNotes ?? ""),
    lastUsedDate: toNonEmptyString(record.lastUsedDate, fallback?.lastUsedDate ?? ""),
    marks: Math.max(0, toNumberOrZero(record.marks ?? fallback?.marks ?? 0)),
    negativeMarks: Math.max(0, toNumberOrZero(record.negativeMarks ?? fallback?.negativeMarks ?? 0)),
    primaryTag: toNonEmptyString(record.primaryTag, fallback?.primaryTag ?? "untagged"),
    prompt: toNonEmptyString(record.prompt, fallback?.prompt ?? ""),
    questionImageFile: toNonEmptyString(record.questionImageFile, fallback?.questionImageFile ?? ""),
    questionType: toNonEmptyString(record.questionType, fallback?.questionType ?? "Question"),
    secondaryTag: toNonEmptyString(record.secondaryTag, fallback?.secondaryTag ?? "none"),
    simulationLink: toNonEmptyString(record.simulationLink, fallback?.simulationLink ?? ""),
    solutionImageFile: toNonEmptyString(record.solutionImageFile, fallback?.solutionImageFile ?? ""),
    status: fallback?.status ?? "active",
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
    thermalState: fallback?.thermalState ?? "warm",
    topic: toNonEmptyString(record.topic, fallback?.topic ?? ""),
    tutorialVideoLink: toNonEmptyString(record.tutorialVideoLink, fallback?.tutorialVideoLink ?? ""),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    uploadId: toNonEmptyString(record.uploadId ?? record.upload_id, fallback?.uploadId ?? ""),
    uploadLabel: toNonEmptyString(record.uploadLabel ?? record.upload_label, fallback?.uploadLabel ?? ""),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

async function fetchQuestionPool(): Promise<QuestionBankRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/library");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/questions/library returned an invalid payload.");
  }

  const questions = payload
    .map((entry, index) => normalizeQuestionRecord(entry, index))
    .filter((entry): entry is QuestionBankRecord => Boolean(entry));

  if (questions.length === 0) {
    throw new Error("GET /admin/questions/library did not include any questions.");
  }

  return questions;
}

function toChartPoints(
  runs: TemplateAnalyticsRunRow[],
  selector: (run: TemplateAnalyticsRunRow) => number,
): UiChartPoint[] {
  return runs.map((run) => ({
    label: formatIsoDate(run.completedOn),
    value: selector(run),
  }));
}

function normalizeTemplateName(runName: string): string {
  return runName.split("/")[0]?.trim() || runName.trim();
}

function inferExamType(templateName: string): string {
  const normalized = templateName.toLowerCase();
  if (normalized.includes("neet")) {
    return "NEET";
  }
  if (normalized.includes("jee")) {
    return "JEEMains";
  }
  if (normalized.includes("foundation")) {
    return "Foundation";
  }
  return "General";
}

function toTemplateId(templateName: string, index: number): string {
  const slug = templateName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? `tmpl-test-analytics-${slug}` : `tmpl-test-analytics-${index + 1}`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function toControlledVsUncontrolledDelta(runs: RunAnalyticsRecord[]): number {
  const controlledRuns = runs.filter((run) => run.mode.toLowerCase() === "controlled");
  const uncontrolledRuns = runs.filter((run) => run.mode.toLowerCase() !== "controlled");

  if (controlledRuns.length === 0 || uncontrolledRuns.length === 0) {
    return 0;
  }

  const controlledRawAverage = average(controlledRuns.map((run) => run.avgRawScorePercent));
  const uncontrolledRawAverage = average(uncontrolledRuns.map((run) => run.avgRawScorePercent));
  return Math.round(controlledRawAverage - uncontrolledRawAverage);
}

function buildRunRow(run: RunAnalyticsRecord): TemplateAnalyticsRunRow {
  const riskShiftPercent =
    run.riskDistribution.high + run.riskDistribution.critical + Math.round(run.guessRatePercent * 0.25);
  const phaseAdherenceVariance = Math.round(
    Math.abs(run.avgPhaseAdherencePercent - run.followedPhaseSplitPercent),
  );
  const disciplineStressScore = Math.round(
    average([
      run.guessRatePercent,
      run.timeMisallocationPercent,
      run.pacingGuardrailViolationPercent,
      run.minTimeViolationPercent,
      run.maxTimeViolationPercent,
    ]),
  );
  const stabilityVariance = Math.round(
    average([
      run.rawScoreStdDeviation,
      phaseAdherenceVariance,
      run.structuralOverridePercent,
    ]),
  );

  return {
    runId: run.runId,
    runName: run.runName,
    completedOn: run.startedAt,
    mode: run.mode,
    avgRawScorePercent: run.avgRawScorePercent,
    avgAccuracyPercent: run.avgAccuracyPercent,
    phaseAdherenceVariance,
    riskShiftPercent: Math.max(0, Math.min(100, riskShiftPercent)),
    stabilityVariance,
    disciplineStressScore,
    controlledModeDelta: run.mode.toLowerCase() === "controlled" ?
      Math.round(run.controlledCompliancePercent - run.pacingGuardrailViolationPercent) :
      0,
  };
}

function buildTemplateAnalyticsDetails(
  runs: RunAnalyticsRecord[],
  details: TestTemplateDetailRecord[],
): TemplateAnalyticsDetailRecord[] {
  const groupedRuns = new Map<string, RunAnalyticsRecord[]>();
  const detailsByName = new Map(details.map((detail) => [detail.templateName, detail]));

  for (const run of runs) {
    const templateName = normalizeTemplateName(run.runName);
    const existing = groupedRuns.get(templateName) ?? [];
    existing.push(run);
    groupedRuns.set(templateName, existing);
  }

  return [...groupedRuns.entries()]
    .map(([templateName, templateRuns], index) => {
      const detail = detailsByName.get(templateName);
      const sortedRuns = [...templateRuns].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      const runRows = sortedRuns.map(buildRunRow);
      const avgRawScorePercent = Math.round(average(runRows.map((run) => run.avgRawScorePercent)));
      const avgAccuracyPercent = Math.round(average(runRows.map((run) => run.avgAccuracyPercent)));
      const phaseAdherenceVariance = Math.round(variance(sortedRuns.map((run) => run.avgPhaseAdherencePercent)));
      const riskShiftAveragePercent = Math.round(average(runRows.map((run) => run.riskShiftPercent)));
      const stabilityVariance = Math.round(average(runRows.map((run) => run.stabilityVariance)));
      const disciplineStressScore = Math.round(average(runRows.map((run) => run.disciplineStressScore)));
      const controlledVsUncontrolledDelta = toControlledVsUncontrolledDelta(sortedRuns);
      const avgDisciplineIndex = Math.round(average(sortedRuns.map((run) => run.disciplineIndexAverage)));
      const effectivenessRating = Math.max(
        0,
        Math.min(
          100,
          Math.round((avgRawScorePercent * 0.4) + (avgDisciplineIndex * 0.3) + ((100 - riskShiftAveragePercent) * 0.3)),
        ),
      );

      return {
        id: detail?.id ?? toTemplateId(templateName, index),
        templateName,
        examType: detail?.examType ?? inferExamType(templateName),
        status: detail?.status ?? "ready",
        runCount: runRows.length,
        avgRawScorePercent,
        avgAccuracyPercent,
        phaseAdherenceVariance,
        riskShiftAveragePercent,
        stabilityVariance,
        disciplineStressScore,
        controlledVsUncontrolledDelta,
        effectivenessRating,
        runs: runRows,
      };
    })
    .sort((left, right) => right.runCount - left.runCount || left.templateName.localeCompare(right.templateName));
}

function AdminTestTemplateAnalyticsDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();
  const [templates, setTemplates] = useState<TemplateAnalyticsDetailRecord[]>(TEMPLATE_ANALYTICS_DETAILS);
  const [templateDetails, setTemplateDetails] = useState<TestTemplateDetailRecord[]>(TEMPLATE_DETAILS);
  const [questionPool, setQuestionPool] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTemplateAnalyticsDetail() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setTemplates(TEMPLATE_ANALYTICS_DETAILS);
        setTemplateDetails(TEMPLATE_DETAILS);
        setQuestionPool(QUESTION_BANK);
        setInlineMessage(
          "Local mode detected. Loaded deterministic template analytics detail fixtures for the dedicated tests workspace.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const [dataset, details, questions] = await Promise.all([
          fetchDashboardDataset(),
          fetchTemplateDetails(),
          fetchQuestionPool(),
        ]);
        if (!isMounted) {
          return;
        }

        const liveTemplates = buildTemplateAnalyticsDetails(dataset.runAnalytics, details);
        setTemplates(liveTemplates.length > 0 ? liveTemplates : TEMPLATE_ANALYTICS_DETAILS);
        setTemplateDetails(details.length > 0 ? details : TEMPLATE_DETAILS);
        setQuestionPool(questions.length > 0 ? questions : QUESTION_BANK);
        setInlineMessage("Live mode enabled: test template analytics detail hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load test template analytics detail.";
        setTemplates(TEMPLATE_ANALYTICS_DETAILS);
        setTemplateDetails(TEMPLATE_DETAILS);
        setQuestionPool(QUESTION_BANK);
        setInlineMessage(`${reason} Falling back to deterministic template analytics detail fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTemplateAnalyticsDetail();

    return () => {
      isMounted = false;
    };
  }, []);

  const template = useMemo(() => {
    return templates.find((entry) => entry.id === params.testId) ?? templates[0] ?? null;
  }, [params.testId, templates]);
  const templateDetail = useMemo(() => {
    const byId = templateDetails.find((entry) => entry.id === params.testId);
    if (byId) {
      return byId;
    }

    if (template) {
      return templateDetails.find((entry) => entry.templateName === template.templateName) ?? null;
    }

    return templateDetails[0] ?? null;
  }, [params.testId, template, templateDetails]);
  const effectiveTemplateDetail = templateDetail ?? TEMPLATE_DETAILS[0];

  const rawTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.avgRawScorePercent) : []),
    [template],
  );
  const accuracyTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.avgAccuracyPercent) : []),
    [template],
  );
  const riskShiftTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.riskShiftPercent) : []),
    [template],
  );
  const questionPoolById = useMemo(() => {
    const byId = new Map<string, QuestionBankRecord>();
    for (const question of questionPool) {
      byId.set(question.id, question);
    }
    return byId;
  }, [questionPool]);
  const selectedQuestions = useMemo(
    () =>
      effectiveTemplateDetail.selectedQuestionIds
        .map((questionId) => questionPoolById.get(questionId))
        .filter((question): question is QuestionBankRecord => Boolean(question)),
    [effectiveTemplateDetail.selectedQuestionIds, questionPoolById],
  );
  const selectedQuestionTotal = effectiveTemplateDetail.selectedQuestionIds.length;
  const difficultyReviewRows = useMemo(
    () =>
      DIFFICULTY_LEVELS.map((difficulty) => ({
        difficulty,
        count: effectiveTemplateDetail.difficultyDistribution[difficulty],
        percent:
          selectedQuestionTotal > 0 ?
            (effectiveTemplateDetail.difficultyDistribution[difficulty] / selectedQuestionTotal) * 100 :
            0,
        minSeconds: effectiveTemplateDetail.timingProfile[difficulty].minSeconds,
        maxSeconds: effectiveTemplateDetail.timingProfile[difficulty].maxSeconds,
      } satisfies DifficultyReviewRow)),
    [effectiveTemplateDetail, selectedQuestionTotal],
  );
  const chapterCoverageRows = useMemo(
    () =>
      selectedQuestions.reduce<ChapterCoverageRow[]>((rows, question) => {
        const existing = rows.find((row) => row.chapter === question.chapter);
        if (existing) {
          existing.count += 1;
          existing.percent = selectedQuestionTotal > 0 ? (existing.count / selectedQuestionTotal) * 100 : 0;
          existing.subjects = Array.from(new Set([...existing.subjects.split(", "), question.subject])).join(", ");
          return rows;
        }

        rows.push({
          chapter: question.chapter,
          count: 1,
          percent: selectedQuestionTotal > 0 ? (1 / selectedQuestionTotal) * 100 : 0,
          subjects: question.subject,
        });
        return rows;
      }, []),
    [selectedQuestionTotal, selectedQuestions],
  );
  const marksDistributionRows = useMemo(
    () =>
      selectedQuestions.reduce<MarksDistributionRow[]>((rows, question) => {
        const marks = `${question.marks} mark${question.marks === 1 ? "" : "s"}`;
        const existing = rows.find((row) => row.marks === marks);
        if (existing) {
          existing.count += 1;
          existing.percent = selectedQuestionTotal > 0 ? (existing.count / selectedQuestionTotal) * 100 : 0;
          return rows;
        }

        rows.push({
          marks,
          count: 1,
          percent: selectedQuestionTotal > 0 ? (1 / selectedQuestionTotal) * 100 : 0,
        });
        return rows;
      }, []),
    [selectedQuestionTotal, selectedQuestions],
  );
  const sectionBalanceRows = useMemo(() => {
    const sections = Array.from(new Set(selectedQuestions.map((question) => question.subject))).sort((left, right) =>
      left.localeCompare(right),
    );

    return sections.map((section) => {
      const count = selectedQuestions.filter((question) => question.subject === section).length;
      return {
        section,
        count,
        percent: selectedQuestionTotal > 0 ? (count / selectedQuestionTotal) * 100 : 0,
      } satisfies SectionBalanceRow;
    });
  }, [selectedQuestionTotal, selectedQuestions]);

  if (!template || !templateDetail) {
    return null;
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-test-template-analytics-detail-title">
      <p className="admin-content-eyebrow">Template Analytics Detail Workspace</p>
      <h2 id="admin-test-template-analytics-detail-title">Test Details And Analytics</h2>
      <p className="admin-content-copy">
        This page brings the test setup and the test’s performance view together in one place. Start with how the test
        is built, then move into results and deeper execution patterns.
      </p>

      <TestsWorkspaceNav />

      {inlineMessage ? <p className="admin-analytics-inline-note">{inlineMessage}</p> : null}

      <div className="admin-risk-summary-card">
        <h4>Page Guide</h4>
        <p>
          <strong>{templateDetail.templateName}</strong> · {templateDetail.examType} · {formatTemplateStatusLabel(templateDetail.status)}
        </p>
        <small>Read this page from top to bottom: L0 for test setup, L1 for results, and L2 for student behavior and risk.</small>
      </div>

      {isLoading ? <p className="admin-analytics-inline-note">Loading test template analytics detail...</p> : null}

      <section className="admin-analytics-run-summary" aria-labelledby="admin-test-template-layer-l0-title">
        <div className="admin-question-distribution-layer-header">
          <div>
            <p className="admin-content-eyebrow">L0 Structural Foundation</p>
            <h3 id="admin-test-template-layer-l0-title">Test Setup And Question Mix</h3>
          </div>
          <small>Use L0 to quickly confirm the structure, difficulty mix, and coverage before reviewing outcomes.</small>
        </div>

        <div className="admin-tests-l0-stat-strip">
          <article className="admin-tests-l0-stat-card">
            <span>Total Questions</span>
            <strong>{templateDetail.selectedQuestionIds.length}</strong>
          </article>
          <article className="admin-tests-l0-stat-card">
            <span>Selection</span>
            <strong>{formatSelectionMethodLabel(templateDetail.selectionMethod)}</strong>
          </article>
          <article className="admin-tests-l0-stat-card">
            <span>Duration</span>
            <strong>{templateDetail.totalDurationMinutes} min</strong>
          </article>
          <article className="admin-tests-l0-stat-card">
            <span>Status</span>
            <strong>{formatTemplateStatusLabel(templateDetail.status)}</strong>
          </article>
        </div>

        <div className="admin-tests-l0-layout">
          <article className="admin-tests-l0-card">
            <div className="admin-tests-l0-card-header">
              <div>
                <p className="admin-content-eyebrow">Blueprint</p>
                <h4>Teacher Setup Summary</h4>
              </div>
              <small>Core setup at a glance</small>
            </div>

            <dl className="admin-tests-l0-detail-list">
              <div>
                <dt>Exam Type</dt>
                <dd>{templateDetail.examType}</dd>
              </div>
              <div>
                <dt>Selection Method</dt>
                <dd>{formatSelectionMethodLabel(templateDetail.selectionMethod)}</dd>
              </div>
              <div>
                <dt>Allowed Modes</dt>
                <dd>{templateDetail.allowedModes.length}</dd>
              </div>
              <div>
                <dt>Last Updated</dt>
                <dd>{formatIsoDate(templateDetail.updatedAt)}</dd>
              </div>
            </dl>

            <p className="admin-tests-l0-record-id">
              Record ID: <code>{templateDetail.canonicalId.slice(0, 24)}...</code>
            </p>
          </article>

          <article className="admin-tests-l0-card">
            <div className="admin-tests-l0-card-header">
              <div>
                <p className="admin-content-eyebrow">Difficulty Blueprint</p>
                <h4>Difficulty, Share, And Timing</h4>
              </div>
              <small>All timing values are in seconds</small>
            </div>

            <div className="admin-tests-l0-mini-table" role="table" aria-label="Difficulty timing blueprint">
              <div className="admin-tests-l0-mini-table-head" role="row">
                <span role="columnheader">Level</span>
                <span role="columnheader">Count</span>
                <span role="columnheader">%</span>
                <span role="columnheader">Min</span>
                <span role="columnheader">Max</span>
              </div>
              {difficultyReviewRows.map((row) => (
                <div key={row.difficulty} className="admin-tests-l0-mini-table-row" role="row">
                  <span role="cell">{row.difficulty}</span>
                  <span role="cell">{row.count}</span>
                  <span role="cell">{Math.round(row.percent)}%</span>
                  <span role="cell">{row.minSeconds}s</span>
                  <span role="cell">{row.maxSeconds}s</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="admin-tests-l0-coverage-grid">
          <article className="admin-tests-l0-card">
            <div className="admin-tests-l0-card-header">
              <div>
                <p className="admin-content-eyebrow">Coverage</p>
                <h4>Chapter Coverage</h4>
              </div>
              <small>{chapterCoverageRows.length} chapters</small>
            </div>

            <div className="admin-tests-l0-list">
              {chapterCoverageRows.length > 0 ?
                chapterCoverageRows.map((row) => (
                  <div key={row.chapter} className="admin-tests-l0-list-row">
                    <div>
                      <strong>{row.chapter}</strong>
                      <small>{row.subjects}</small>
                    </div>
                    <span>{row.count} · {Math.round(row.percent)}%</span>
                  </div>
                )) :
                <p className="admin-analytics-inline-note">No chapter coverage is available for this test.</p>
              }
            </div>
          </article>

          <article className="admin-tests-l0-card">
            <div className="admin-tests-l0-card-header">
              <div>
                <p className="admin-content-eyebrow">Balance</p>
                <h4>Section Balance</h4>
              </div>
              <small>subject-wise split</small>
            </div>

            <div className="admin-tests-l0-list">
              {sectionBalanceRows.length > 0 ?
                sectionBalanceRows.map((row) => (
                  <div key={row.section} className="admin-tests-l0-list-row">
                    <div>
                      <strong>{row.section}</strong>
                    </div>
                    <span>{row.count} · {Math.round(row.percent)}%</span>
                  </div>
                )) :
                <p className="admin-analytics-inline-note">No section balance is available for this test.</p>
              }
            </div>
          </article>

          <article className="admin-tests-l0-card">
            <div className="admin-tests-l0-card-header">
              <div>
                <p className="admin-content-eyebrow">Marks</p>
                <h4>Marks Distribution</h4>
              </div>
              <small>question mark buckets</small>
            </div>

            <div className="admin-tests-l0-list">
              {marksDistributionRows.length > 0 ?
                marksDistributionRows.map((row) => (
                  <div key={row.marks} className="admin-tests-l0-list-row">
                    <div>
                      <strong>{row.marks}</strong>
                    </div>
                    <span>{row.count} · {Math.round(row.percent)}%</span>
                  </div>
                )) :
                <p className="admin-analytics-inline-note">No marks distribution is available for this test.</p>
              }
            </div>
          </article>
        </div>

        <div className="admin-tests-l0-note">
          Draft and ready tests can still be updated, but once the test is first used in assignment its structure is
          treated as fixed.
        </div>
      </section>

      <details className="admin-tests-layer-accordion">
        <summary className="admin-tests-layer-summary">
          <div>
            <p className="admin-content-eyebrow">L1 Outcome Quality</p>
            <h3 id="admin-test-template-layer-l1-title">How Students Performed</h3>
          </div>
          <small>Open to review overall results, average score, average accuracy, and effectiveness.</small>
        </summary>
        <div className="admin-tests-layer-body">
          <div className="admin-overview-layer-block">
            <div className="admin-overview-layer-block-header">
              <strong>What you can check here</strong>
              <span>Overall results</span>
            </div>
            <div className="admin-overview-layer-chip-row">
              <span>Run Count</span>
              <span>Avg Raw Score</span>
              <span>Avg Accuracy</span>
              <span>Effectiveness Rating</span>
              <span>Raw Trend</span>
              <span>Accuracy Trend</span>
            </div>
          </div>

          <div className="admin-analytics-kpi-grid">
            <article className="admin-analytics-kpi-card">
              <p>Run Count</p>
              <h3>{template.runCount}</h3>
              <small>times this test has been used</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Avg Raw Score</p>
              <h3>{template.avgRawScorePercent}%</h3>
              <small>average score across runs</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Avg Accuracy</p>
              <h3>{template.avgAccuracyPercent}%</h3>
              <small>average accuracy across runs</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Effectiveness Rating</p>
              <h3>{template.effectivenessRating}</h3>
              <small>overall quality score for this test</small>
            </article>
          </div>

          <div className="admin-analytics-compliance-panel">
            <article className="admin-risk-summary-card">
              <h4>What L1 Means</h4>
              <p>L1 helps teachers judge whether this test is too easy, too hard, or landing close to the intended level.</p>
              <small>This layer is about results, not pacing stress.</small>
            </article>
            <article className="admin-risk-summary-card">
              <h4>How To Read It</h4>
              <p>Average raw score and average accuracy together show whether the test is landing at the intended level.</p>
              <small>Use this layer first for everyday test review.</small>
            </article>
          </div>

          <div className="admin-analytics-chart-grid">
            <UiChartContainer
              title="Raw Score Trend"
              subtitle="Average raw score per run"
              data={rawTrend}
              maxValue={100}
              variant="line"
            />
            <UiChartContainer
              title="Accuracy Trend"
              subtitle="Average accuracy per run"
              data={accuracyTrend}
              maxValue={100}
              variant="line"
            />
          </div>
        </div>
      </details>

      <details className="admin-tests-layer-accordion">
        <summary className="admin-tests-layer-summary">
          <div>
            <p className="admin-content-eyebrow">L2 Execution And Risk</p>
            <h3 id="admin-test-template-layer-l2-title">Student Behavior And Risk</h3>
          </div>
          <small>Open to review pacing issues, risk movement, discipline stress, and deeper student behavior signals.</small>
        </summary>
        <div className="admin-tests-layer-body">
          <div className="admin-overview-layer-block">
            <div className="admin-overview-layer-block-header">
              <strong>What you can check here</strong>
              <span>Deeper student signals</span>
            </div>
            <div className="admin-overview-layer-chip-row">
              <span>Phase Variance</span>
              <span>Risk Shift</span>
              <span>Stability Variance</span>
              <span>Discipline Stress</span>
              <span>Controlled Delta</span>
              <span>Risk Trend</span>
            </div>
          </div>

          <div className="admin-analytics-kpi-grid">
            <article className="admin-analytics-kpi-card">
              <p>Phase Variance</p>
              <h3>{template.phaseAdherenceVariance}</h3>
              <small>variation in how students followed the test phases</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Risk Shift</p>
              <h3>{template.riskShiftAveragePercent}%</h3>
              <small>movement toward higher-risk behavior</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Stability Variance</p>
              <h3>{template.stabilityVariance}</h3>
              <small>how steady or uneven performance was across runs</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Discipline Stress</p>
              <h3>{template.disciplineStressScore}</h3>
              <small>stress from guessing, pacing, and timing mistakes</small>
            </article>
            <article className="admin-analytics-kpi-card">
              <p>Controlled Delta</p>
              <h3>{template.controlledVsUncontrolledDelta > 0 ? "+" : ""}{template.controlledVsUncontrolledDelta}</h3>
              <small>score change between controlled and normal runs</small>
            </article>
          </div>

          <div className="admin-analytics-chart-grid">
            <UiChartContainer
              title="Risk Shift Trend"
              subtitle="Template-level risk distribution movement"
              data={riskShiftTrend}
              maxValue={100}
              variant="line"
            />
          </div>

          <div className="admin-analytics-compliance-panel">
            <article className="admin-risk-summary-card">
              <h4>What L2 Means</h4>
              <p>L2 helps teachers spot hidden struggle patterns even when top-level results look acceptable.</p>
              <small>These are advanced summary signals, not student-by-student marks.</small>
            </article>
            <article className="admin-risk-summary-card">
              <h4>Risk Movement</h4>
              <p>{template.riskShiftAveragePercent}% high/critical movement across template usage.</p>
              <small>Shows whether risky behavior is growing or settling over time.</small>
            </article>
            <article className="admin-risk-summary-card">
              <h4>Data Source</h4>
              <p>This page reads saved run summaries rather than scanning every student session again.</p>
              <small>That keeps the page fast while still showing useful teaching signals.</small>
            </article>
          </div>
        </div>
      </details>

      <p className="admin-analytics-inline-link-row">
        <button
          type="button"
          className="admin-compact-button"
          onClick={() => {
            navigate("/admin/tests/library");
          }}
        >
          Return to Library
        </button>
      </p>
    </section>
  );
}

export default AdminTestTemplateAnalyticsDetailPage;
