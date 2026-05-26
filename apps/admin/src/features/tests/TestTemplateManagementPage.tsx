import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  DIFFICULTY_LEVELS,
  EXAM_TYPES,
  QUESTION_BANK,
  SELECTION_METHODS,
  deriveCanonicalTemplateId,
  type DifficultyLevel,
  type ExamType,
  type QuestionBankRecord,
  type SelectionMethod,
} from "./testTemplateFixtures";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";
type TemplateThermalState = "hot" | "warm" | "cold";
type TestSubpage = "create" | "library" | "analytics" | "distribution" | "settings";

interface TimingWindow {
  minSeconds: number;
  maxSeconds: number;
}

interface TimingProfile {
  easy: TimingWindow;
  medium: TimingWindow;
  hard: TimingWindow;
}

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

interface TemplateDraft {
  templateName: string;
  examType: ExamType;
  selectionMethod: SelectionMethod;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  timingProfile: TimingProfile;
}

interface ExamTypeSnapshot {
  defaultDurationMinutes: number;
  difficultyTimingMapping: TimingProfile;
  markingScheme: string;
  sectionStructure: string[];
}

interface PhaseSplitRow {
  difficulty: DifficultyLevel;
  focus: string;
  load: number;
  minutes: number;
  phase: string;
  percent: number;
  questionCount: number;
  weight: number;
}

interface PhaseConfigSnapshot {
  difficultyWeights: Record<DifficultyLevel, number>;
  phaseSplit: PhaseSplitRow[];
  totalLoad: number;
}

interface DistributionDifficultyRow {
  count: number;
  difficulty: DifficultyLevel;
  maxSeconds: number;
  minSeconds: number;
  percent: number;
}

interface TimingProfileTableRow {
  difficulty: DifficultyLevel;
  defaultWindow: string;
  maxSeconds: number;
  minSeconds: number;
  questionCount: number;
  snapshotRule: string;
  window: string;
}

interface TemplateLifecyclePolicyRow {
  tier: "HOT" | "WARM" | "COLD";
  trigger: string;
  metadataTreatment: string;
  mediaTreatment: string;
  operatorRule: string;
}

interface TemplateLifecycleRow {
  id: string;
  templateName: string;
  status: TemplateStatus;
  thermalState: TemplateThermalState;
  totalRuns: number;
  lastUsed: string;
  trigger: string;
  metadataTreatment: string;
  mediaTreatment: string;
  operatorAction: string;
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

interface TestTemplateRecord extends TemplateDraft {
  id: string;
  canonicalId: string;
  examSnapshot?: ExamTypeSnapshot;
  lastUsedAt: string | null;
  phaseConfigSnapshot?: PhaseConfigSnapshot;
  status: TemplateStatus;
  thermalState: TemplateThermalState;
  totalRuns: number;
  updatedAt: string;
}

interface TemplateSubmitPayload {
  templateName: string;
  canonicalId: string;
  examType: ExamType;
  selectionMethod: SelectionMethod;
  totalDurationMinutes: number;
  questionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  timingProfile: TimingProfile;
  examSnapshot: ExamTypeSnapshot;
  phaseConfigSnapshot: PhaseConfigSnapshot;
  publish: boolean;
}

interface QuestionPoolLoadState {
  questions: QuestionBankRecord[];
  source: "local" | "live";
}

interface QuestionPoolFilters {
  academicYear: string;
  chapter: string;
  difficulty: "all" | DifficultyLevel;
  questionType: string;
  subject: string;
  tag: string;
  usageState: "all" | "used" | "unused";
}

const EMPTY_QUESTION_POOL_FILTERS: QuestionPoolFilters = {
  academicYear: "all",
  chapter: "all",
  difficulty: "all",
  questionType: "all",
  subject: "all",
  tag: "all",
  usageState: "all",
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareQuestionsBySegmentOrder(left: QuestionBankRecord, right: QuestionBankRecord): number {
  return (
    left.difficulty.localeCompare(right.difficulty) ||
    left.subject.localeCompare(right.subject) ||
    left.chapter.localeCompare(right.chapter) ||
    left.id.localeCompare(right.id)
  );
}

function buildShuffleSliceQuestions(questions: QuestionBankRecord[], seed: string): QuestionBankRecord[] {
  return [...questions].sort((left, right) => {
    const leftHash = hashString(`${seed}:${left.id}`);
    const rightHash = hashString(`${seed}:${right.id}`);
    return leftHash - rightHash || left.id.localeCompare(right.id);
  });
}

const FALLBACK_TEMPLATES: TestTemplateRecord[] = [
  {
    id: "tmpl-001",
    canonicalId: "14a94be7286349e2624b0ef42f9eaa9f4c89eb2d270218071b060962fce6057f",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    selectionMethod: "manual",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-104", "q-105", "q-107", "q-108"],
    difficultyDistribution: { easy: 3, medium: 3, hard: 0 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    lastUsedAt: null,
    status: "draft",
    thermalState: "warm",
    totalRuns: 0,
    updatedAt: "2026-04-10T08:30:00.000Z",
  },
  {
    id: "tmpl-002",
    canonicalId: "da6cf95d845169f18f6f0f260fa8535f89b7afe29158416f1572a5f9f29407f5",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    selectionMethod: "round_robin",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-101", "q-103", "q-104", "q-106", "q-108", "q-109"],
    difficultyDistribution: { easy: 2, medium: 2, hard: 2 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    lastUsedAt: "2026-05-11T07:30:00.000Z",
    status: "assigned",
    thermalState: "hot",
    totalRuns: 8,
    updatedAt: "2026-04-08T11:45:00.000Z",
  },
  {
    id: "tmpl-003",
    canonicalId: "9e4ca01810f01dd3d0a4eb27bfcfb4c47d88d2165479d83694789f403853a721",
    templateName: "Archived JEE Sprint - 2024",
    examType: "JEEMains",
    selectionMethod: "offset_limit",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-103", "q-107"],
    difficultyDistribution: { easy: 2, medium: 1, hard: 1 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    lastUsedAt: "2024-03-15T08:00:00.000Z",
    status: "archived",
    thermalState: "cold",
    totalRuns: 14,
    updatedAt: "2024-12-20T10:15:00.000Z",
  },
  {
    id: "tmpl-004",
    canonicalId: "50cd2769995141f7111099e41df32750f52fa28f68efbef429ddef99114ba016",
    templateName: "Deprecated NEET Mixed Drill",
    examType: "NEET",
    selectionMethod: "shuffle_slice",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-104", "q-105", "q-106", "q-108"],
    difficultyDistribution: { easy: 1, medium: 2, hard: 1 },
    timingProfile: {
      easy: { minSeconds: 25, maxSeconds: 55 },
      medium: { minSeconds: 55, maxSeconds: 135 },
      hard: { minSeconds: 135, maxSeconds: 210 },
    },
    lastUsedAt: "2025-10-22T08:20:00.000Z",
    status: "deprecated",
    thermalState: "warm",
    totalRuns: 3,
    updatedAt: "2025-11-05T09:00:00.000Z",
  },
];

const TEMPLATE_LIFECYCLE_POLICY_ROWS: TemplateLifecyclePolicyRow[] = [
  {
    tier: "HOT",
    trigger: "Template used in the current academic year.",
    metadataTreatment: "Frozen question IDs, canonical ID, timing, phase, and marking snapshots stay operational.",
    mediaTreatment: "Referenced question media remains in active question-bank storage.",
    operatorRule: "Keep assignable unless explicitly deprecated; structural edits remain locked after assignment.",
  },
  {
    tier: "WARM",
    trigger: "Template unused but recent.",
    metadataTreatment: "Metadata remains retained and visible for reuse, audit, and lifecycle actions.",
    mediaTreatment: "Referenced media remains available without session-derived recomputation.",
    operatorRule: "Review for reuse, archive, or deprecate without rebuilding canonical identity on read.",
  },
  {
    tier: "COLD",
    trigger: "Template unused for more than 2 years.",
    metadataTreatment: "Metadata is retained permanently for historical runs and governance audit.",
    mediaTreatment: "Referenced images may move to archive storage through the question/template lifecycle policy.",
    operatorRule: "Never delete templates with historical runs; keep lookup and audit lineage intact.",
  },
];

const INITIAL_DRAFT: TemplateDraft = {
  templateName: "",
  examType: "JEEMains",
  selectionMethod: "manual",
  totalDurationMinutes: 180,
  selectedQuestionIds: [],
  difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
  timingProfile: {
    easy: { minSeconds: 30, maxSeconds: 60 },
    medium: { minSeconds: 60, maxSeconds: 150 },
    hard: { minSeconds: 150, maxSeconds: 210 },
  },
};

const EXAM_TYPE_SNAPSHOTS: Record<ExamType, ExamTypeSnapshot> = {
  JEEMains: {
    defaultDurationMinutes: 180,
    difficultyTimingMapping: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    markingScheme: "Fixed JEE snapshot: +4 correct, -1 incorrect, 0 unanswered. Manual marks entry is locked.",
    sectionStructure: ["Physics", "Chemistry", "Mathematics"],
  },
  NEET: {
    defaultDurationMinutes: 200,
    difficultyTimingMapping: {
      easy: { minSeconds: 25, maxSeconds: 55 },
      medium: { minSeconds: 55, maxSeconds: 135 },
      hard: { minSeconds: 135, maxSeconds: 210 },
    },
    markingScheme: "Fixed NEET snapshot: +4 correct, -1 incorrect, 0 unanswered. Manual marks entry is locked.",
    sectionStructure: ["Physics", "Chemistry", "Botany", "Zoology"],
  },
};

const DIFFICULTY_PHASE_WEIGHTS: Record<DifficultyLevel, number> = {
  easy: 1,
  medium: 2.3,
  hard: 4,
};

const DIFFICULTY_PHASE_LABELS: Record<DifficultyLevel, { phase: string; focus: string }> = {
  easy: {
    phase: "Foundation",
    focus: "Warm-up and confidence-building questions",
  },
  medium: {
    phase: "Diagnostic Core",
    focus: "Main concept discrimination and pacing signal",
  },
  hard: {
    phase: "Challenge Control",
    focus: "High-load controlled/hard-mode readiness",
  },
};

function cloneTimingProfile(value: TimingProfile): TimingProfile {
  return {
    easy: { ...value.easy },
    hard: { ...value.hard },
    medium: { ...value.medium },
  };
}

function getExamTypeSnapshot(examType: ExamType): ExamTypeSnapshot {
  const snapshot = EXAM_TYPE_SNAPSHOTS[examType];
  return {
    ...snapshot,
    difficultyTimingMapping: cloneTimingProfile(snapshot.difficultyTimingMapping),
    sectionStructure: [...snapshot.sectionStructure],
  };
}

function buildPhaseConfigSnapshot(
  difficultyDistribution: DifficultyDistribution,
  totalDurationMinutes: number,
): PhaseConfigSnapshot {
  const totalLoad = DIFFICULTY_LEVELS.reduce(
    (total, difficulty) =>
      total + difficultyDistribution[difficulty] * DIFFICULTY_PHASE_WEIGHTS[difficulty],
    0,
  );
  const phaseSplit = DIFFICULTY_LEVELS.map((difficulty) => {
    const questionCount = difficultyDistribution[difficulty];
    const weight = DIFFICULTY_PHASE_WEIGHTS[difficulty];
    const load = questionCount * weight;
    const percent = totalLoad > 0 ? Math.round((load / totalLoad) * 100) : 0;
    const minutes = totalLoad > 0 ? Math.round((load / totalLoad) * totalDurationMinutes) : 0;
    const labels = DIFFICULTY_PHASE_LABELS[difficulty];

    return {
      difficulty,
      focus: labels.focus,
      load: Number(load.toFixed(1)),
      minutes,
      phase: labels.phase,
      percent,
      questionCount,
      weight,
    };
  });

  return {
    difficultyWeights: { ...DIFFICULTY_PHASE_WEIGHTS },
    phaseSplit,
    totalLoad: Number(totalLoad.toFixed(1)),
  };
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

function toOptionalDateString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toTemplateStatus(value: unknown): TemplateStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "draft" || normalized === "ready" || normalized === "assigned" || normalized === "archived" || normalized === "deprecated") {
    return normalized;
  }
  return "draft";
}

function toTemplateThermalState(value: unknown, fallback: TemplateThermalState): TemplateThermalState {
  return value === "hot" || value === "warm" || value === "cold" ? value : fallback;
}

function normalizeSelectionMethod(value: unknown, fallback: SelectionMethod): SelectionMethod {
  if (typeof value !== "string") {
    return fallback;
  }

  return SELECTION_METHODS.includes(value as SelectionMethod) ? (value as SelectionMethod) : fallback;
}

function normalizeExamType(value: unknown, fallback: ExamType): ExamType {
  if (typeof value !== "string") {
    return fallback;
  }

  return EXAM_TYPES.includes(value as ExamType) ? (value as ExamType) : fallback;
}

function normalizeTimingWindow(value: unknown, fallback: TimingWindow): TimingWindow {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;
  return {
    minSeconds: Math.max(1, toNumberOrZero(source.minSeconds ?? source.min ?? fallback.minSeconds)),
    maxSeconds: Math.max(1, toNumberOrZero(source.maxSeconds ?? source.max ?? fallback.maxSeconds)),
  };
}

function normalizeDifficulty(
  value: unknown,
  fallback: DifficultyLevel,
): DifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
}

function normalizeThermalState(
  value: unknown,
  fallback: QuestionBankRecord["thermalState"],
): QuestionBankRecord["thermalState"] {
  return value === "hot" || value === "warm" || value === "cold" ? value : fallback;
}

function normalizeQuestionStatus(
  value: unknown,
  fallback: QuestionBankRecord["status"],
): QuestionBankRecord["status"] {
  return value === "active" || value === "used" || value === "archived" || value === "deprecated" ? value : fallback;
}

function normalizeQuestionRecord(
  value: unknown,
  index: number,
): QuestionBankRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = QUESTION_BANK[index] ?? QUESTION_BANK[0];

  return {
    academicYear: toNonEmptyString(record.academicYear, fallback?.academicYear ?? "unassigned"),
    additionalTag: toNonEmptyString(record.additionalTag, fallback?.additionalTag ?? "none"),
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    difficulty: normalizeDifficulty(record.difficulty, fallback?.difficulty ?? "medium"),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    id: toNonEmptyString(record.id, fallback?.id ?? `q-${index + 1}`),
    lastUsedDate: toOptionalDateString(record.lastUsedDate, fallback?.lastUsedDate ?? null),
    marks: Math.max(0, toNumberOrZero(record.marks ?? fallback?.marks ?? 0)),
    negativeMarks: Math.max(0, toNumberOrZero(record.negativeMarks ?? fallback?.negativeMarks ?? 0)),
    primaryTag: toNonEmptyString(record.primaryTag, fallback?.primaryTag ?? "untagged"),
    prompt: toNonEmptyString(record.prompt, fallback?.prompt ?? ""),
    questionType: toNonEmptyString(record.questionType, fallback?.questionType ?? "Question"),
    secondaryTag: toNonEmptyString(record.secondaryTag, fallback?.secondaryTag ?? "none"),
    simulationLink: toNonEmptyString(record.simulationLink, fallback?.simulationLink ?? ""),
    solutionImageFile: toNonEmptyString(record.solutionImageFile, fallback?.solutionImageFile ?? ""),
    status: normalizeQuestionStatus(record.status, fallback?.status ?? "active"),
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
    thermalState: normalizeThermalState(record.thermalState, fallback?.thermalState ?? "warm"),
    topic: toNonEmptyString(record.topic, fallback?.topic ?? ""),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    tutorialVideoLink: toNonEmptyString(record.tutorialVideoLink, fallback?.tutorialVideoLink ?? ""),
    internalNotes: toNonEmptyString(record.internalNotes, fallback?.internalNotes ?? ""),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

function normalizeTemplateRecord(value: unknown, index: number): TestTemplateRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_TEMPLATES[index] ?? FALLBACK_TEMPLATES[0];
  const difficultySource =
    record.difficultyDistribution && typeof record.difficultyDistribution === "object" ?
      (record.difficultyDistribution as Record<string, unknown>) :
      {};
  const timingProfileSource =
    record.timingProfile && typeof record.timingProfile === "object" ?
      (record.timingProfile as Record<string, unknown>) :
      {};
  const examType = normalizeExamType(record.examType, fallback?.examType ?? "JEEMains");
  const fallbackExamSnapshot = getExamTypeSnapshot(examType);
  const examSnapshotSource =
    record.examSnapshot && typeof record.examSnapshot === "object" ?
      (record.examSnapshot as Record<string, unknown>) :
      {};
  const difficultyTimingSource =
    examSnapshotSource.difficultyTimingMapping && typeof examSnapshotSource.difficultyTimingMapping === "object" ?
      (examSnapshotSource.difficultyTimingMapping as Record<string, unknown>) :
      fallbackExamSnapshot.difficultyTimingMapping;
  const questionIdsSource = record.selectedQuestionIds ?? record.questionIds;
  const selectedQuestionIds = Array.isArray(questionIdsSource) ?
    questionIdsSource.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) :
    fallback?.selectedQuestionIds ?? [];
  const sectionStructure = Array.isArray(examSnapshotSource.sectionStructure) ?
    examSnapshotSource.sectionStructure.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) :
    fallbackExamSnapshot.sectionStructure;
  const status = toTemplateStatus(record.status);

  return {
    id: toNonEmptyString(record.id, `tmpl-${index + 1}`),
    canonicalId: toNonEmptyString(record.canonicalId, fallback?.canonicalId ?? `canonical-${index + 1}`),
    templateName: toNonEmptyString(record.templateName, fallback?.templateName ?? `Template ${index + 1}`),
    examType,
    examSnapshot: {
      defaultDurationMinutes: Math.max(
        30,
        toNumberOrZero(examSnapshotSource.defaultDurationMinutes ?? fallbackExamSnapshot.defaultDurationMinutes),
      ),
      difficultyTimingMapping: {
        easy: normalizeTimingWindow(difficultyTimingSource.easy, fallbackExamSnapshot.difficultyTimingMapping.easy),
        medium: normalizeTimingWindow(difficultyTimingSource.medium, fallbackExamSnapshot.difficultyTimingMapping.medium),
        hard: normalizeTimingWindow(difficultyTimingSource.hard, fallbackExamSnapshot.difficultyTimingMapping.hard),
      },
      markingScheme: toNonEmptyString(examSnapshotSource.markingScheme, fallbackExamSnapshot.markingScheme),
      sectionStructure,
    },
    selectionMethod: normalizeSelectionMethod(record.selectionMethod, fallback?.selectionMethod ?? "manual"),
    totalDurationMinutes: Math.max(30, toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes)),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: Math.max(0, toNumberOrZero(difficultySource.easy)),
      medium: Math.max(0, toNumberOrZero(difficultySource.medium)),
      hard: Math.max(0, toNumberOrZero(difficultySource.hard)),
    },
    timingProfile: {
      easy: normalizeTimingWindow(timingProfileSource.easy, fallback?.timingProfile.easy ?? { minSeconds: 30, maxSeconds: 60 }),
      medium: normalizeTimingWindow(timingProfileSource.medium, fallback?.timingProfile.medium ?? { minSeconds: 60, maxSeconds: 150 }),
      hard: normalizeTimingWindow(timingProfileSource.hard, fallback?.timingProfile.hard ?? { minSeconds: 150, maxSeconds: 210 }),
    },
    lastUsedAt: toOptionalDateString(record.lastUsedAt ?? record.lastUsed, fallback?.lastUsedAt ?? null),
    status,
    thermalState: toTemplateThermalState(
      record.thermalState,
      fallback?.thermalState ?? (status === "assigned" ? "hot" : status === "archived" ? "cold" : "warm"),
    ),
    totalRuns: Math.max(0, toNumberOrZero(record.totalRuns ?? record.runCount ?? fallback?.totalRuns ?? 0)),
    updatedAt: toNonEmptyString(record.updatedAt, fallback?.updatedAt ?? new Date(0).toISOString()),
  };
}

async function fetchTemplatesFromApi(): Promise<TestTemplateRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/tests");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/tests returned an invalid payload.");
  }

  const templates = payload
    .map((entry, index) => normalizeTemplateRecord(entry, index))
    .filter((entry): entry is TestTemplateRecord => Boolean(entry));

  if (templates.length === 0) {
    throw new Error("GET /admin/tests did not include any templates.");
  }

  return templates;
}

async function fetchQuestionPoolFromApi(): Promise<QuestionPoolLoadState> {
  const payload = await apiClient.get<unknown>("/admin/questions/library", {
    query: {
      limit: "250",
    },
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/library returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      questions?: unknown;
    };
  };
  const questions = Array.isArray(response.data?.questions) ? response.data?.questions : [];
  const normalizedQuestions = questions
    .map((entry, index) => normalizeQuestionRecord(entry, index))
    .filter((entry): entry is QuestionBankRecord => Boolean(entry));

  return {
    questions: normalizedQuestions.length > 0 ? normalizedQuestions : QUESTION_BANK,
    source: normalizedQuestions.length > 0 ? "live" : "local",
  };
}

function isTemplateEditable(status: TemplateStatus): boolean {
  return status === "draft" || status === "ready";
}

function isTemplatePublishable(status: TemplateStatus): boolean {
  return status === "draft";
}

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDifficultyLabel(value: DifficultyLevel): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatTimingWindow(value: TimingWindow): string {
  return `${value.minSeconds}s - ${value.maxSeconds}s`;
}

function formatOptionalIsoDate(value: string | null): string {
  return value ? formatIsoDate(value) : "Never used";
}

function getTemplateLifecyclePolicy(thermalState: TemplateThermalState): TemplateLifecyclePolicyRow {
  const tier = thermalState.toUpperCase() as TemplateLifecyclePolicyRow["tier"];
  return TEMPLATE_LIFECYCLE_POLICY_ROWS.find((row) => row.tier === tier) ?? TEMPLATE_LIFECYCLE_POLICY_ROWS[1];
}

function toTemplateLifecycleRow(template: TestTemplateRecord): TemplateLifecycleRow {
  const policy = getTemplateLifecyclePolicy(template.thermalState);
  return {
    id: template.id,
    lastUsed: formatOptionalIsoDate(template.lastUsedAt),
    mediaTreatment: policy.mediaTreatment,
    metadataTreatment: policy.metadataTreatment,
    operatorAction:
      template.totalRuns > 0 ?
        `${policy.operatorRule} Historical runs: ${template.totalRuns}.` :
        `${policy.operatorRule} No historical runs recorded.`,
    status: template.status,
    templateName: template.templateName,
    thermalState: template.thermalState,
    totalRuns: template.totalRuns,
    trigger: policy.trigger,
  };
}

function resolveTestSubpage(pathname: string): TestSubpage {
  if (pathname.includes("/tests/create")) {
    return "create";
  }
  if (pathname.includes("/tests/analytics")) {
    return "analytics";
  }
  if (pathname.includes("/tests/distribution")) {
    return "distribution";
  }
  if (pathname.includes("/tests/settings")) {
    return "settings";
  }

  return "library";
}

function buildPayload(draft: TemplateDraft, publish: boolean): TemplateSubmitPayload {
  const examSnapshot = getExamTypeSnapshot(draft.examType);
  return {
    templateName: draft.templateName.trim(),
    canonicalId: "",
    examType: draft.examType,
    examSnapshot: {
      ...examSnapshot,
      difficultyTimingMapping: cloneTimingProfile(draft.timingProfile),
    },
    selectionMethod: draft.selectionMethod,
    totalDurationMinutes: draft.totalDurationMinutes,
    questionIds: draft.selectedQuestionIds,
    difficultyDistribution: draft.difficultyDistribution,
    phaseConfigSnapshot: buildPhaseConfigSnapshot(draft.difficultyDistribution, draft.totalDurationMinutes),
    timingProfile: draft.timingProfile,
    publish,
  };
}

function validateDraft(
  draft: TemplateDraft,
  targetQuestionCount?: number,
  matchedQuestionCount?: number,
): string | null {
  if (draft.templateName.trim().length < 3) {
    return "Template name must contain at least 3 characters.";
  }

  if (targetQuestionCount !== undefined) {
    if (!Number.isInteger(targetQuestionCount) || targetQuestionCount <= 0) {
      return "Set the Y question target before saving.";
    }

    if (matchedQuestionCount !== undefined && targetQuestionCount > matchedQuestionCount) {
      return "Y question target must be less than or equal to the matched question count.";
    }
  }

  if (draft.selectedQuestionIds.length === 0) {
    return "Select at least one question before saving.";
  }

  if (targetQuestionCount !== undefined && draft.selectedQuestionIds.length !== targetQuestionCount) {
    return `Choose exactly ${targetQuestionCount} question(s) before saving.`;
  }

  const distributionTotal =
    draft.difficultyDistribution.easy +
    draft.difficultyDistribution.medium +
    draft.difficultyDistribution.hard;

  if (distributionTotal !== draft.selectedQuestionIds.length) {
    return "Difficulty distribution must equal selected question count.";
  }

  for (const difficulty of DIFFICULTY_LEVELS) {
    const window = draft.timingProfile[difficulty];
    if (window.minSeconds <= 0 || window.maxSeconds <= 0) {
      return "Timing profile values must be positive.";
    }

    if (window.minSeconds > window.maxSeconds) {
      return "Timing profile min seconds cannot exceed max seconds.";
    }
  }

  return null;
}

async function submitTemplateToApi(payload: TemplateSubmitPayload): Promise<void> {
  await apiClient.post<unknown, TemplateSubmitPayload>("/admin/tests", { body: payload });
}

function TestTemplateManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();
  const [templates, setTemplates] = useState<TestTemplateRecord[]>(FALLBACK_TEMPLATES);
  const [questionPool, setQuestionPool] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [draft, setDraft] = useState<TemplateDraft>(INITIAL_DRAFT);
  const [duplicateTemplate, setDuplicateTemplate] = useState<TestTemplateRecord | null>(null);
  const [pendingDuplicateRecord, setPendingDuplicateRecord] = useState<TestTemplateRecord | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [targetQuestionCount, setTargetQuestionCount] = useState(0);
  const [offsetStart, setOffsetStart] = useState(0);
  const [questionQuery, setQuestionQuery] = useState("");
  const [questionPoolFilters, setQuestionPoolFilters] = useState<QuestionPoolFilters>(EMPTY_QUESTION_POOL_FILTERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string>(
    shouldUseLiveApi() ?
      "Live mode enabled: template create/publish sends POST /admin/tests." :
      "Local mode detected: using deterministic question bank and template fixtures for Build 118.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishTargetId, setPublishTargetId] = useState<string | null>(null);
  const [inspectedTemplateId, setInspectedTemplateId] = useState<string>(FALLBACK_TEMPLATES[0]?.id ?? "");

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      setIsLoadingTemplates(true);

      if (!shouldUseLiveApi()) {
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage("Local mode detected: using deterministic question bank and template fixtures for Build 118.");
        setIsLoadingTemplates(false);
        return;
      }

      try {
        const liveTemplates = await fetchTemplatesFromApi();
        if (!isMounted) {
          return;
        }

        setTemplates(liveTemplates);
        setInlineMessage("Live mode enabled: template library hydrated from GET /admin/tests, and create/publish sends POST /admin/tests.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            `GET /admin/tests failed with ${error.code} (${error.status}).` :
            "Failed to load template library.";
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage(`${reason} Falling back to deterministic Build 118 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadQuestionPool() {
      if (!shouldUseLiveApi()) {
        setQuestionPool(QUESTION_BANK);
        return;
      }

      try {
        const nextQuestionPool = await fetchQuestionPoolFromApi();
        if (!isMounted) {
          return;
        }

        setQuestionPool(nextQuestionPool.questions);
        setInlineMessage((current) => {
          const suffix =
            nextQuestionPool.source === "live" ?
              " Question-pool selection now hydrates from GET /admin/questions/library." :
              " GET /admin/questions/library returned no persisted records yet, so question-pool selection stayed on deterministic fallback data.";
          return current.includes("Question-pool selection now hydrates from GET /admin/questions/library.")
            || current.includes("question-pool selection stayed on deterministic fallback data.")
            ? current
            : `${current}${suffix}`;
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setQuestionPool(QUESTION_BANK);
        const reason =
          error instanceof ApiClientError ?
            `GET /admin/questions/library failed with ${error.code} (${error.status}).` :
            "Failed to load the question pool.";
        setInlineMessage((current) =>
          current.includes("question-pool selection")
            ? current
            : `${current} ${reason} Question-pool selection fell back to deterministic fixtures.`,
        );
      }
    }

    void loadQuestionPool();

    return () => {
      isMounted = false;
    };
  }, []);

  const currentSubpage = useMemo(() => resolveTestSubpage(location.pathname), [location.pathname]);

  const questionPoolFilterOptions = useMemo(() => {
    const toSortedValues = (values: string[]) =>
      Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) =>
        left.localeCompare(right),
      );

    return {
      academicYears: toSortedValues(questionPool.map((question) => question.academicYear)),
      chapters: toSortedValues(questionPool.map((question) => question.chapter)),
      questionTypes: toSortedValues(questionPool.map((question) => question.questionType)),
      subjects: toSortedValues(questionPool.map((question) => question.subject)),
      tags: toSortedValues(
        questionPool.flatMap((question) => [
          question.primaryTag,
          question.secondaryTag,
          question.additionalTag,
        ]),
      ),
    };
  }, [questionPool]);

  const visibleQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase();

    return questionPool.filter((question) => {
      const tags = [question.primaryTag, question.secondaryTag, question.additionalTag];
      const matchesStructuredFilters =
        (questionPoolFilters.subject === "all" || question.subject === questionPoolFilters.subject) &&
        (questionPoolFilters.chapter === "all" || question.chapter === questionPoolFilters.chapter) &&
        (questionPoolFilters.difficulty === "all" || question.difficulty === questionPoolFilters.difficulty) &&
        (questionPoolFilters.tag === "all" || tags.includes(questionPoolFilters.tag)) &&
        (questionPoolFilters.questionType === "all" || question.questionType === questionPoolFilters.questionType) &&
        (questionPoolFilters.academicYear === "all" || question.academicYear === questionPoolFilters.academicYear) &&
        (
          questionPoolFilters.usageState === "all" ||
          (questionPoolFilters.usageState === "used" && question.usedCount > 0) ||
          (questionPoolFilters.usageState === "unused" && question.usedCount === 0)
        );

      if (!matchesStructuredFilters) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      return (
        question.id.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        question.questionType.toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query)) ||
        question.academicYear.toLowerCase().includes(query)
      );
    });
  }, [questionPool, questionPoolFilters, questionQuery]);

  const questionPoolById = useMemo(() => {
    const byId = new Map<string, QuestionBankRecord>();
    for (const question of QUESTION_BANK) {
      byId.set(question.id, question);
    }
    for (const question of questionPool) {
      byId.set(question.id, question);
    }
    return byId;
  }, [questionPool]);

  const selectedQuestionCount = draft.selectedQuestionIds.length;
  const statisticalSelectionPreview = useMemo(() => {
    if (targetQuestionCount <= 0) {
      return [];
    }

    if (draft.selectionMethod === "shuffle_slice") {
      return buildShuffleSliceQuestions(visibleQuestions, `${draft.templateName}:${draft.examType}`).slice(0, targetQuestionCount);
    }

    if (draft.selectionMethod === "offset_limit") {
      return [...visibleQuestions]
        .sort(compareQuestionsBySegmentOrder)
        .slice(offsetStart, offsetStart + targetQuestionCount);
    }

    return [];
  }, [draft.examType, draft.selectionMethod, draft.templateName, offsetStart, targetQuestionCount, visibleQuestions]);
  const maxOffsetStart = Math.max(0, visibleQuestions.length - Math.max(targetQuestionCount, 1));

  useEffect(() => {
    setOffsetStart((current) => Math.min(current, maxOffsetStart));
  }, [maxOffsetStart]);

  const selectedDifficultyCount = useMemo(() => {
    return draft.selectedQuestionIds.reduce<DifficultyDistribution>(
      (accumulator, question) => {
        const resolvedQuestion = questionPoolById.get(question);
        if (!resolvedQuestion) {
          return accumulator;
        }

        accumulator[resolvedQuestion.difficulty] += 1;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
  }, [draft.selectedQuestionIds, questionPoolById]);

  const activeLibraryTemplates = useMemo(
    () => templates.filter((template) => template.status !== "archived"),
    [templates],
  );
  const comparableTemplates = useMemo(
    () => activeLibraryTemplates.filter((template) => template.status !== "deprecated"),
    [activeLibraryTemplates],
  );
  const lifecycleRegisterTemplates = useMemo(
    () => templates.filter((template) => template.status === "archived" || template.status === "deprecated"),
    [templates],
  );
  const templateLifecycleRows = useMemo(
    () => templates.map(toTemplateLifecycleRow),
    [templates],
  );

  useEffect(() => {
    if (activeLibraryTemplates.length === 0) {
      setInspectedTemplateId("");
      return;
    }

    if (params.testId && activeLibraryTemplates.some((template) => template.id === params.testId)) {
      setInspectedTemplateId(params.testId);
      return;
    }

    setInspectedTemplateId((current) =>
      current && activeLibraryTemplates.some((template) => template.id === current) ?
        current :
        activeLibraryTemplates[0]?.id ?? "",
    );
  }, [activeLibraryTemplates, params.testId]);

  const inspectedTemplate = useMemo(() => {
    return activeLibraryTemplates.find((template) => template.id === inspectedTemplateId) ?? activeLibraryTemplates[0] ?? null;
  }, [activeLibraryTemplates, inspectedTemplateId]);
  const activeExamSnapshot = useMemo(() => getExamTypeSnapshot(draft.examType), [draft.examType]);
  const phaseConfigPreview = useMemo(
    () => buildPhaseConfigSnapshot(draft.difficultyDistribution, draft.totalDurationMinutes),
    [draft.difficultyDistribution, draft.totalDurationMinutes],
  );
  const draftTimingProfileRows = useMemo<TimingProfileTableRow[]>(
    () =>
      DIFFICULTY_LEVELS.map((difficulty) => ({
        defaultWindow: formatTimingWindow(activeExamSnapshot.difficultyTimingMapping[difficulty]),
        difficulty,
        maxSeconds: draft.timingProfile[difficulty].maxSeconds,
        minSeconds: draft.timingProfile[difficulty].minSeconds,
        questionCount: draft.difficultyDistribution[difficulty],
        snapshotRule: "Stored in timingProfile and locked after first assignment.",
        window: formatTimingWindow(draft.timingProfile[difficulty]),
      })),
    [activeExamSnapshot, draft.difficultyDistribution, draft.timingProfile],
  );

  function updateTiming(
    difficulty: DifficultyLevel,
    field: "minSeconds" | "maxSeconds",
    rawValue: string,
  ) {
    const value = Number(rawValue);
    setDraft((current) => ({
      ...current,
      timingProfile: {
        ...current.timingProfile,
        [difficulty]: {
          ...current.timingProfile[difficulty],
          [field]: Number.isFinite(value) ? Math.max(1, value) : 1,
        },
      },
    }));
  }

  function updateDistribution(difficulty: DifficultyLevel, rawValue: string) {
    const value = Number(rawValue);
    setDraft((current) => ({
      ...current,
      difficultyDistribution: {
        ...current.difficultyDistribution,
        [difficulty]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
      },
    }));
  }

  function toggleQuestionSelection(questionId: string) {
    if (draft.selectionMethod !== "manual") {
      setErrorMessage("Use Apply Statistical Selection to choose questions for the selected statistical method.");
      return;
    }

    setDraft((current) => {
      const isSelected = current.selectedQuestionIds.includes(questionId);

      if (!isSelected && targetQuestionCount <= 0) {
        setErrorMessage("Set the Y question target before selecting questions.");
        return current;
      }

      if (!isSelected && current.selectedQuestionIds.length >= targetQuestionCount) {
        setErrorMessage(`Y target reached. Increase the target or deselect a question before adding ${questionId}.`);
        return current;
      }

      const selectedQuestionIds =
        isSelected ?
          current.selectedQuestionIds.filter((id) => id !== questionId) :
          [...current.selectedQuestionIds, questionId];

      setErrorMessage(null);
      return {
        ...current,
        selectedQuestionIds,
      };
    });
  }

  function syncDistributionToSelectedPool() {
    setDraft((current) => ({
      ...current,
      difficultyDistribution: selectedDifficultyCount,
    }));
  }

  function applyStatisticalSelection() {
    if (draft.selectionMethod !== "shuffle_slice" && draft.selectionMethod !== "offset_limit") {
      setErrorMessage("Select shuffle_slice or offset_limit before applying statistical selection.");
      return;
    }

    if (targetQuestionCount <= 0) {
      setErrorMessage("Set the Y question target before applying statistical selection.");
      return;
    }

    if (targetQuestionCount > visibleQuestions.length) {
      setErrorMessage("Y question target must be less than or equal to the matched question count.");
      return;
    }

    if (statisticalSelectionPreview.length !== targetQuestionCount) {
      setErrorMessage("The current offset and filter combination does not provide enough matched questions.");
      return;
    }

    const selectedQuestionIds = statisticalSelectionPreview.map((question) => question.id);
    const difficultyDistribution = statisticalSelectionPreview.reduce<DifficultyDistribution>(
      (accumulator, question) => {
        accumulator[question.difficulty] += 1;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );

    setDraft((current) => ({
      ...current,
      selectedQuestionIds,
      difficultyDistribution,
    }));
    setErrorMessage(null);
    setInlineMessage(
      draft.selectionMethod === "shuffle_slice" ?
        `Applied shuffle_slice: shuffled ${visibleQuestions.length} matched questions and selected the first ${targetQuestionCount}.` :
        `Applied offset_limit: sorted ${visibleQuestions.length} matched questions and selected ${targetQuestionCount} from offset ${offsetStart}.`,
    );
  }

  function resetEditor() {
    setDraft(INITIAL_DRAFT);
    setTargetQuestionCount(0);
    setOffsetStart(0);
    setEditingTemplateId(null);
    setDuplicateTemplate(null);
    setPendingDuplicateRecord(null);
    setErrorMessage(null);
  }

  function startEditingTemplate(templateId: string) {
    const target = templates.find((template) => template.id === templateId);
    if (!target) {
      return;
    }

    if (!isTemplateEditable(target.status)) {
      setErrorMessage("Only draft and ready templates are editable. Assigned, archived, and deprecated templates are structurally locked.");
      return;
    }

    setDraft({
      templateName: target.templateName,
      examType: target.examType,
      selectionMethod: target.selectionMethod,
      totalDurationMinutes: target.totalDurationMinutes,
      selectedQuestionIds: target.selectedQuestionIds,
      difficultyDistribution: target.difficultyDistribution,
      timingProfile: target.timingProfile,
    });
    setTargetQuestionCount(target.selectedQuestionIds.length);
    setEditingTemplateId(target.id);
    setErrorMessage(null);
    setInspectedTemplateId(target.id);
    navigate("/admin/tests/create");
  }

  async function saveDraftTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const selectedFromMatchedCount = draft.selectedQuestionIds.filter((questionId) =>
      visibleQuestions.some((question) => question.id === questionId),
    ).length;
    if (selectedFromMatchedCount !== draft.selectedQuestionIds.length) {
      setErrorMessage("All selected questions must come from the current matched pool before saving.");
      return;
    }

    if (draft.selectionMethod === "shuffle_slice" || draft.selectionMethod === "offset_limit") {
      const previewQuestionIds = statisticalSelectionPreview.map((question) => question.id);
      const selectionStillMatchesMethod =
        previewQuestionIds.length === draft.selectedQuestionIds.length &&
        previewQuestionIds.every((questionId, index) => questionId === draft.selectedQuestionIds[index]);
      if (!selectionStillMatchesMethod) {
        setErrorMessage("Apply the current statistical selection preview before saving this template.");
        return;
      }
    }

    const validationError = validateDraft(draft, targetQuestionCount, visibleQuestions.length);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const now = new Date().toISOString();
    const canonicalId = await deriveCanonicalTemplateId(draft.selectedQuestionIds);
    const nextRecord: TestTemplateRecord = {
      id: editingTemplateId ?? `tmpl-${Date.now()}`,
      ...draft,
      canonicalId,
      lastUsedAt: editingTemplateId ?
        templates.find((template) => template.id === editingTemplateId)?.lastUsedAt ?? null :
        null,
      status: "draft",
      thermalState: editingTemplateId ?
        templates.find((template) => template.id === editingTemplateId)?.thermalState ?? "warm" :
        "warm",
      totalRuns: editingTemplateId ?
        templates.find((template) => template.id === editingTemplateId)?.totalRuns ?? 0 :
        0,
      updatedAt: now,
    };

    const duplicate = templates.find((template) => {
      return template.id !== nextRecord.id && template.canonicalId === canonicalId;
    });

    if (duplicate) {
      setDuplicateTemplate(duplicate);
      setPendingDuplicateRecord(nextRecord);
      return;
    }

    await persistDraftRecord(nextRecord);
  }

  async function persistDraftRecord(nextRecord: TestTemplateRecord) {
    setIsSubmitting(true);
    setErrorMessage(null);

    const payloadDraft: TemplateDraft = {
      templateName: nextRecord.templateName,
      examType: nextRecord.examType,
      selectionMethod: nextRecord.selectionMethod,
      totalDurationMinutes: nextRecord.totalDurationMinutes,
      selectedQuestionIds: nextRecord.selectedQuestionIds,
      difficultyDistribution: nextRecord.difficultyDistribution,
      timingProfile: nextRecord.timingProfile,
    };

    try {
      if (shouldUseLiveApi()) {
        await submitTemplateToApi({
          ...buildPayload(payloadDraft, false),
          canonicalId: nextRecord.canonicalId,
        });
      }

      setTemplates((current) => {
        const existingIndex = current.findIndex((item) => item.id === nextRecord.id);
        if (existingIndex === -1) {
          return [nextRecord, ...current];
        }

        return current.map((item) => (item.id === nextRecord.id ? nextRecord : item));
      });

      setInlineMessage(
        editingTemplateId ?
          "Draft template updated. Structural edits remain available until published or assigned." :
          "Draft template created successfully.",
      );
      resetEditor();
    } catch (error) {
      const reason =
        error instanceof ApiClientError ?
          `POST /admin/tests failed with ${error.code} (${error.status}).` :
          "POST /admin/tests failed unexpectedly.";
      setErrorMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function publishDraftTemplate(templateId: string) {
    const target = templates.find((template) => template.id === templateId);
    if (!target) {
      setPublishTargetId(null);
      return;
    }

    if (!isTemplatePublishable(target.status)) {
      setErrorMessage("Only draft templates can be published.");
      setPublishTargetId(null);
      return;
    }

    const validationError = validateDraft(target);
    if (validationError) {
      setErrorMessage(`Cannot publish template: ${validationError}`);
      setPublishTargetId(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (shouldUseLiveApi()) {
        const canonicalId = target.canonicalId || await deriveCanonicalTemplateId(target.selectedQuestionIds);
        await submitTemplateToApi({
          ...buildPayload(target, true),
          canonicalId,
        });
      }

      setTemplates((current) =>
        current.map((template) =>
          template.id === templateId ?
            {
              ...template,
              status: "ready",
              updatedAt: new Date().toISOString(),
            } :
            template,
        ),
      );
      setInlineMessage("Template published. Status moved from draft to ready.");
    } catch (error) {
      const reason =
        error instanceof ApiClientError ?
          `POST /admin/tests failed with ${error.code} (${error.status}) during publish.` :
          "Publish request failed unexpectedly.";
      setErrorMessage(reason);
    } finally {
      setPublishTargetId(null);
      setIsSubmitting(false);
    }
  }

  function proceedWithDuplicateSave() {
    if (!pendingDuplicateRecord) {
      setDuplicateTemplate(null);
      return;
    }

    setDuplicateTemplate(null);
    setPendingDuplicateRecord(null);
    setInlineMessage(
      `Duplicate template intentionally created from canonical ID ${pendingDuplicateRecord.canonicalId.slice(0, 16)}...`,
    );
    void persistDraftRecord(pendingDuplicateRecord);
  }

  function reuseExistingDuplicateTemplate() {
    if (!duplicateTemplate) {
      return;
    }

    setDuplicateTemplate(null);
    setPendingDuplicateRecord(null);
    setInspectedTemplateId(duplicateTemplate.id);
    navigate(`/admin/tests/${duplicateTemplate.id}`);
    setInlineMessage(
      `Duplicate template detected. Reusing existing template ${duplicateTemplate.templateName} (${duplicateTemplate.id}).`,
    );
    setErrorMessage(null);
  }

  function updateTemplateLifecycle(templateId: string, nextStatus: Extract<TemplateStatus, "archived" | "deprecated">) {
    const target = templates.find((template) => template.id === templateId);
    if (!target) {
      return;
    }

    if (target.status === "draft") {
      setErrorMessage("Draft templates should be edited or discarded before archive/deprecation review.");
      return;
    }

    if (target.status === "archived") {
      setInlineMessage(`${target.templateName} is already archived and hidden from the active library.`);
      return;
    }

    if (target.status === "deprecated" && nextStatus === "deprecated") {
      setInlineMessage(`${target.templateName} is already deprecated and excluded from future comparisons.`);
      return;
    }

    setTemplates((current) =>
      current.map((template) =>
        template.id === templateId ?
          {
            ...template,
            status: nextStatus,
            thermalState: nextStatus === "archived" ? "cold" : template.thermalState,
            updatedAt: new Date().toISOString(),
          } :
          template,
      ),
    );
    setInlineMessage(
      nextStatus === "archived" ?
        `${target.templateName} moved to archived/COLD state and is hidden from the active library table.` :
        `${target.templateName} moved to deprecated state and is excluded from future analytics comparisons while lifecycle metadata remains retained.`,
    );
    setErrorMessage(null);
  }

  const templateColumns: UiTableColumn<TestTemplateRecord>[] = [
    {
      id: "name",
      header: "Template",
      render: (template) => (
        <div className="admin-tests-template-cell">
          <strong>{template.templateName}</strong>
          <small>{template.examType}</small>
        </div>
      ),
    },
    {
      id: "selectionMethod",
      header: "Selection Method",
      render: (template) => template.selectionMethod,
    },
    {
      id: "questions",
      header: "Question Count",
      render: (template) => template.selectedQuestionIds.length,
    },
    {
      id: "distribution",
      header: "Difficulty Distribution",
      render: (template) =>
        `E:${template.difficultyDistribution.easy} M:${template.difficultyDistribution.medium} H:${template.difficultyDistribution.hard}`,
    },
    {
      id: "status",
      header: "Status",
      render: (template) => (
        <span className={`admin-tests-status admin-tests-status-${template.status}`}>{template.status}</span>
      ),
    },
    {
      id: "thermalState",
      header: "Lifecycle Tier",
      render: (template) => `${template.thermalState.toUpperCase()} / ${formatOptionalIsoDate(template.lastUsedAt)}`,
    },
    {
      id: "updatedAt",
      header: "Updated",
      render: (template) => formatIsoDate(template.updatedAt),
    },
    {
      id: "canonicalId",
      header: "Canonical ID",
      render: (template) => (
        <code className="admin-tests-canonical-id">{template.canonicalId.slice(0, 16)}...</code>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (template) => {
        const editable = isTemplateEditable(template.status);
        const publishable = isTemplatePublishable(template.status);
        const lifecycleLocked = template.status === "archived" || template.status === "deprecated";
        return (
          <div className="admin-tests-row-actions">
            <button type="button" onClick={() => navigate(`/admin/tests/${template.id}`)}>
              Open Detail
            </button>
            <button type="button" onClick={() => navigate(`/admin/tests/analytics/${template.id}`)}>
              Analytics
            </button>
            <button type="button" onClick={() => startEditingTemplate(template.id)} disabled={!editable}>
              Edit Template
            </button>
            <button type="button" onClick={() => setPublishTargetId(template.id)} disabled={!publishable}>
              Publish
            </button>
            <button
              type="button"
              onClick={() => updateTemplateLifecycle(template.id, "archived")}
              disabled={template.status === "draft" || lifecycleLocked}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => updateTemplateLifecycle(template.id, "deprecated")}
              disabled={template.status === "draft" || lifecycleLocked}
            >
              Deprecate
            </button>
          </div>
        );
      },
    },
  ];

  const analyticsColumns: UiTableColumn<TestTemplateRecord>[] = [
    {
      id: "template",
      header: "Template",
      render: (template) => template.templateName,
    },
    {
      id: "status",
      header: "Status",
      render: (template) => template.status,
    },
    {
      id: "questions",
      header: "Questions",
      render: (template) => template.selectedQuestionIds.length,
    },
    {
      id: "distribution",
      header: "Difficulty Mix",
      render: (template) =>
        `E:${template.difficultyDistribution.easy} M:${template.difficultyDistribution.medium} H:${template.difficultyDistribution.hard}`,
    },
    {
      id: "selectionMethod",
      header: "Selection",
      render: (template) => template.selectionMethod,
    },
  ];

  const selectedTemplateDifficultyRows =
    inspectedTemplate ?
      DIFFICULTY_LEVELS.map((difficulty) => ({
        difficulty,
        count: inspectedTemplate.difficultyDistribution[difficulty],
        percent:
          inspectedTemplate.selectedQuestionIds.length > 0 ?
            (inspectedTemplate.difficultyDistribution[difficulty] / inspectedTemplate.selectedQuestionIds.length) * 100 :
            0,
        minSeconds: inspectedTemplate.timingProfile[difficulty].minSeconds,
        maxSeconds: inspectedTemplate.timingProfile[difficulty].maxSeconds,
      } satisfies DistributionDifficultyRow)) :
      [];
  const selectedTemplateTimingRows =
    inspectedTemplate ?
      DIFFICULTY_LEVELS.map((difficulty) => {
        const templateExamSnapshot = inspectedTemplate.examSnapshot ?? getExamTypeSnapshot(inspectedTemplate.examType);
        return {
          defaultWindow: formatTimingWindow(templateExamSnapshot.difficultyTimingMapping[difficulty]),
          difficulty,
          maxSeconds: inspectedTemplate.timingProfile[difficulty].maxSeconds,
          minSeconds: inspectedTemplate.timingProfile[difficulty].minSeconds,
          questionCount: inspectedTemplate.difficultyDistribution[difficulty],
          snapshotRule:
            inspectedTemplate.status === "assigned" ?
              "Assigned template: timing profile is immutable." :
              "Draft/ready template: timing profile persists with the structural snapshot.",
          window: formatTimingWindow(inspectedTemplate.timingProfile[difficulty]),
        } satisfies TimingProfileTableRow;
      }) :
      [];
  const inspectedTemplateQuestions = inspectedTemplate ?
    inspectedTemplate.selectedQuestionIds
      .map((questionId) => questionPoolById.get(questionId))
      .filter((question): question is QuestionBankRecord => Boolean(question)) :
    [];
  const inspectedQuestionTotal = inspectedTemplate?.selectedQuestionIds.length ?? 0;
  const resolvedQuestionTotal = inspectedTemplateQuestions.length;
  const inspectedPhaseSnapshot = inspectedTemplate ?
    inspectedTemplate.phaseConfigSnapshot ?? buildPhaseConfigSnapshot(inspectedTemplate.difficultyDistribution, inspectedTemplate.totalDurationMinutes) :
    null;
  const chapterCoverageRows = inspectedTemplateQuestions.reduce<ChapterCoverageRow[]>((rows, question) => {
    const existing = rows.find((row) => row.chapter === question.chapter);
    if (existing) {
      existing.count += 1;
      existing.percent = inspectedQuestionTotal > 0 ? (existing.count / inspectedQuestionTotal) * 100 : 0;
      existing.subjects = Array.from(new Set([...existing.subjects.split(", "), question.subject])).join(", ");
      return rows;
    }

    rows.push({
      chapter: question.chapter,
      count: 1,
      percent: inspectedQuestionTotal > 0 ? (1 / inspectedQuestionTotal) * 100 : 0,
      subjects: question.subject,
    });
    return rows;
  }, []);
  const marksDistributionRows = inspectedTemplateQuestions.reduce<MarksDistributionRow[]>((rows, question) => {
    const marks = `${question.marks} mark${question.marks === 1 ? "" : "s"}`;
    const existing = rows.find((row) => row.marks === marks);
    if (existing) {
      existing.count += 1;
      existing.percent = inspectedQuestionTotal > 0 ? (existing.count / inspectedQuestionTotal) * 100 : 0;
      return rows;
    }

    rows.push({
      marks,
      count: 1,
      percent: inspectedQuestionTotal > 0 ? (1 / inspectedQuestionTotal) * 100 : 0,
    });
    return rows;
  }, []);
  const sectionBalanceRows =
    inspectedTemplate ?
      (inspectedTemplate.examSnapshot?.sectionStructure ?? getExamTypeSnapshot(inspectedTemplate.examType).sectionStructure).map((section) => {
        const count = inspectedTemplateQuestions.filter((question) => question.subject === section).length;
        return {
          section,
          count,
          percent: inspectedQuestionTotal > 0 ? (count / inspectedQuestionTotal) * 100 : 0,
        } satisfies SectionBalanceRow;
      }) :
      [];
  const estimatedStressIndex =
    inspectedTemplate && inspectedQuestionTotal > 0 && inspectedPhaseSnapshot ?
      Math.round((inspectedPhaseSnapshot.totalLoad / (inspectedQuestionTotal * DIFFICULTY_PHASE_WEIGHTS.hard)) * 100) :
      0;
  const hardQuestionPercent =
    inspectedTemplate && inspectedQuestionTotal > 0 ?
      (inspectedTemplate.difficultyDistribution.hard / inspectedQuestionTotal) * 100 :
      0;
  const mediumHardPercent =
    inspectedTemplate && inspectedQuestionTotal > 0 ?
      ((inspectedTemplate.difficultyDistribution.medium + inspectedTemplate.difficultyDistribution.hard) / inspectedQuestionTotal) * 100 :
      0;
  const riskPredictionLabel =
    estimatedStressIndex >= 65 || hardQuestionPercent >= 35 ?
      "High structural load: review timing and controlled-mode readiness." :
      estimatedStressIndex >= 45 || mediumHardPercent >= 60 ?
        "Moderate structural load: pacing discipline should be watched." :
        "Balanced structural load: standard operational execution is expected.";

  const totalQuestionCount = comparableTemplates.reduce((total, template) => total + template.selectedQuestionIds.length, 0);
  const readyOrAssignedCount = activeLibraryTemplates.filter((template) => template.status === "ready" || template.status === "assigned").length;
  const hotTemplateCount = templates.filter((template) => template.thermalState === "hot").length;
  const warmTemplateCount = templates.filter((template) => template.thermalState === "warm").length;
  const coldTemplateCount = templates.filter((template) => template.thermalState === "cold").length;

  function renderCreateView() {
    return (
      <>
        <div className="admin-tests-grid">
          <UiForm
            title={editingTemplateId ? "Edit Draft Template" : "Create Test Template"}
            description="Configure template metadata, duration, and selection method before saving as draft."
            submitLabel={isSubmitting ? "Saving..." : editingTemplateId ? "Save Draft Changes" : "Save Draft"}
            onSubmit={saveDraftTemplate}
            footer={
              editingTemplateId ?
                <button type="button" onClick={resetEditor} disabled={isSubmitting}>
                  Cancel Edit
                </button> :
                <span className="admin-tests-form-footnote">Drafts remain editable until published.</span>
            }
          >
            <UiFormField label="Template Name" htmlFor="admin-tests-template-name">
              <input
                id="admin-tests-template-name"
                type="text"
                value={draft.templateName}
                onChange={(event) => setDraft((current) => ({ ...current, templateName: event.target.value }))}
                placeholder="JEE Mains Mock - Set C"
                required
              />
            </UiFormField>
            <UiFormField label="Exam Type" htmlFor="admin-tests-exam-type">
              <select
                id="admin-tests-exam-type"
                value={draft.examType}
                onChange={(event) => {
                  const examType = event.target.value as ExamType;
                  const examSnapshot = getExamTypeSnapshot(examType);
                  setDraft((current) => ({
                    ...current,
                    examType,
                    timingProfile: cloneTimingProfile(examSnapshot.difficultyTimingMapping),
                    totalDurationMinutes: examSnapshot.defaultDurationMinutes,
                  }));
                }}
              >
                {EXAM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </UiFormField>
            <div className="admin-tests-exam-snapshot" aria-label="Exam type snapshot">
              <h3>{draft.examType} Snapshot</h3>
              <dl>
                <div>
                  <dt>Marking</dt>
                  <dd>{activeExamSnapshot.markingScheme}</dd>
                </div>
                <div>
                  <dt>Default Timing</dt>
                  <dd>{activeExamSnapshot.defaultDurationMinutes} minutes applied from exam type.</dd>
                </div>
                <div>
                  <dt>Sections</dt>
                  <dd>{activeExamSnapshot.sectionStructure.join(" / ")}</dd>
                </div>
                <div>
                  <dt>Difficulty Timing</dt>
                  <dd>
                    Easy {draft.timingProfile.easy.minSeconds}-{draft.timingProfile.easy.maxSeconds}s · Medium{" "}
                    {draft.timingProfile.medium.minSeconds}-{draft.timingProfile.medium.maxSeconds}s · Hard{" "}
                    {draft.timingProfile.hard.minSeconds}-{draft.timingProfile.hard.maxSeconds}s
                  </dd>
                </div>
              </dl>
            </div>
            <UiFormField label="Selection Method" htmlFor="admin-tests-selection-method">
              <select
                id="admin-tests-selection-method"
                value={draft.selectionMethod}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    selectionMethod: event.target.value as SelectionMethod,
                    selectedQuestionIds: [],
                    difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
                  }))
                }
              >
                {SELECTION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </UiFormField>
            <UiFormField label="Total Duration (minutes)" htmlFor="admin-tests-duration">
              <input
                id="admin-tests-duration"
                type="number"
                min={30}
                step={5}
                value={draft.totalDurationMinutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    totalDurationMinutes: Math.max(30, Number(event.target.value) || 30),
                  }))
                }
              />
            </UiFormField>
          </UiForm>

          <UiForm
            title="Question Selection"
            description="Apply filters to get X matched questions, set Y, then choose exactly Y questions."
            submitLabel="Sync Difficulty Distribution"
            onSubmit={(event) => {
              event.preventDefault();
              syncDistributionToSelectedPool();
            }}
            footer={
              <span className="admin-tests-form-footnote">
                X matched: {visibleQuestions.length} | Y target: {targetQuestionCount} | Selected:{" "}
                {selectedQuestionCount} | Easy: {selectedDifficultyCount.easy} | Medium: {selectedDifficultyCount.medium} | Hard:{" "}
                {selectedDifficultyCount.hard}
              </span>
            }
          >
            <UiFormField label="Search Question Pool" htmlFor="admin-tests-question-search">
              <input
                id="admin-tests-question-search"
                type="search"
                value={questionQuery}
                onChange={(event) => setQuestionQuery(event.target.value)}
                placeholder="Search by id, subject, chapter, or prompt"
              />
            </UiFormField>
            <div className="admin-tests-filter-grid">
              <UiFormField label="Subject" htmlFor="admin-tests-filter-subject">
                <select
                  id="admin-tests-filter-subject"
                  value={questionPoolFilters.subject}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({ ...current, subject: event.target.value }))
                  }
                >
                  <option value="all">All subjects</option>
                  {questionPoolFilterOptions.subjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Chapter" htmlFor="admin-tests-filter-chapter">
                <select
                  id="admin-tests-filter-chapter"
                  value={questionPoolFilters.chapter}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({ ...current, chapter: event.target.value }))
                  }
                >
                  <option value="all">All chapters</option>
                  {questionPoolFilterOptions.chapters.map((chapter) => (
                    <option key={chapter} value={chapter}>{chapter}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Difficulty" htmlFor="admin-tests-filter-difficulty">
                <select
                  id="admin-tests-filter-difficulty"
                  value={questionPoolFilters.difficulty}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({
                      ...current,
                      difficulty: event.target.value as QuestionPoolFilters["difficulty"],
                    }))
                  }
                >
                  <option value="all">All difficulties</option>
                  {DIFFICULTY_LEVELS.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>{difficulty}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Tags" htmlFor="admin-tests-filter-tag">
                <select
                  id="admin-tests-filter-tag"
                  value={questionPoolFilters.tag}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({ ...current, tag: event.target.value }))
                  }
                >
                  <option value="all">All tags</option>
                  {questionPoolFilterOptions.tags.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Question Type" htmlFor="admin-tests-filter-question-type">
                <select
                  id="admin-tests-filter-question-type"
                  value={questionPoolFilters.questionType}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({ ...current, questionType: event.target.value }))
                  }
                >
                  <option value="all">All types</option>
                  {questionPoolFilterOptions.questionTypes.map((questionType) => (
                    <option key={questionType} value={questionType}>{questionType}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Academic Year" htmlFor="admin-tests-filter-academic-year">
                <select
                  id="admin-tests-filter-academic-year"
                  value={questionPoolFilters.academicYear}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({ ...current, academicYear: event.target.value }))
                  }
                >
                  <option value="all">All years</option>
                  {questionPoolFilterOptions.academicYears.map((academicYear) => (
                    <option key={academicYear} value={academicYear}>{academicYear}</option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Used / Unused" htmlFor="admin-tests-filter-usage">
                <select
                  id="admin-tests-filter-usage"
                  value={questionPoolFilters.usageState}
                  onChange={(event) =>
                    setQuestionPoolFilters((current) => ({
                      ...current,
                      usageState: event.target.value as QuestionPoolFilters["usageState"],
                    }))
                  }
                >
                  <option value="all">All usage states</option>
                  <option value="unused">Unused only</option>
                  <option value="used">Used only</option>
                </select>
              </UiFormField>
              <button
                type="button"
                className="admin-tests-filter-reset"
                onClick={() => {
                  setQuestionQuery("");
                  setQuestionPoolFilters(EMPTY_QUESTION_POOL_FILTERS);
                }}
              >
                Reset Filters
              </button>
            </div>
            <div className="admin-tests-selection-target">
              <UiFormField label="Y questions to choose" htmlFor="admin-tests-target-question-count">
                <input
                  id="admin-tests-target-question-count"
                  type="number"
                  min={0}
                  max={visibleQuestions.length}
                  value={targetQuestionCount}
                  onChange={(event) => {
                    const rawValue = Number(event.target.value);
                    const nextValue = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
                    setTargetQuestionCount(Math.min(nextValue, visibleQuestions.length));
                    setOffsetStart((current) => Math.min(current, Math.max(0, visibleQuestions.length - Math.max(nextValue, 1))));
                    setErrorMessage(null);
                  }}
                />
              </UiFormField>
              <div className="admin-tests-selection-progress" aria-live="polite">
                <strong>{visibleQuestions.length}</strong>
                <span>X matched</span>
                <strong>{targetQuestionCount}</strong>
                <span>Y requested</span>
                <strong>{selectedQuestionCount}</strong>
                <span>chosen</span>
              </div>
            </div>
            <p className="admin-tests-form-footnote">
              {visibleQuestions.length} of {questionPool.length} questions matched. Choose exactly {targetQuestionCount} from this filtered pool before saving.
            </p>
            {draft.selectionMethod === "shuffle_slice" || draft.selectionMethod === "offset_limit" ? (
              <div className="admin-tests-statistical-selection">
                {draft.selectionMethod === "offset_limit" ? (
                  <UiFormField label="Offset N" htmlFor="admin-tests-offset-start">
                    <input
                      id="admin-tests-offset-start"
                      type="number"
                      min={0}
                      max={maxOffsetStart}
                      value={offsetStart}
                      onChange={(event) => {
                        const rawValue = Number(event.target.value);
                        const nextValue = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
                        setOffsetStart(Math.min(nextValue, maxOffsetStart));
                        setErrorMessage(null);
                      }}
                    />
                  </UiFormField>
                ) : null}
                <div className="admin-tests-statistical-preview">
                  <strong>
                    {draft.selectionMethod === "shuffle_slice" ? "Shuffle + Slice" : "Offset + Limit"}
                  </strong>
                  <span>
                    {draft.selectionMethod === "shuffle_slice" ?
                      `Shuffle X and take first ${targetQuestionCount}.` :
                      `Sort by difficulty, subject, chapter, id; take offset ${offsetStart} to ${offsetStart + targetQuestionCount}.`}
                  </span>
                  <small>
                    Preview:{" "}
                    {statisticalSelectionPreview.length > 0 ?
                      statisticalSelectionPreview.map((question) => question.id).join(", ") :
                      "Set Y to preview selected question IDs."}
                  </small>
                </div>
                <button type="button" onClick={applyStatisticalSelection}>
                  Apply Statistical Selection
                </button>
              </div>
            ) : null}
            <div className="admin-tests-question-list" role="group" aria-label="Template question selection">
              {visibleQuestions.map((question) => {
                const checked = draft.selectedQuestionIds.includes(question.id);
                const limitReached = !checked && targetQuestionCount > 0 && selectedQuestionCount >= targetQuestionCount;
                return (
                  <label key={question.id} className="admin-tests-question-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={draft.selectionMethod !== "manual" || targetQuestionCount <= 0 || limitReached}
                      onChange={() => toggleQuestionSelection(question.id)}
                    />
                    <span>
                      <strong>{question.id}</strong> {question.subject} / {question.chapter} / {question.difficulty}
                    </span>
                  </label>
                );
              })}
            </div>
          </UiForm>
        </div>

        <div className="admin-tests-config-grid">
          <UiForm
            title="Difficulty Distribution"
            description="Configure easy, medium, and hard counts."
            submitLabel="Apply Distribution"
            onSubmit={(event) => event.preventDefault()}
            footer={
              <span className="admin-tests-form-footnote">
                Total configured:{" "}
                {draft.difficultyDistribution.easy +
                  draft.difficultyDistribution.medium +
                  draft.difficultyDistribution.hard}
              </span>
            }
          >
            {DIFFICULTY_LEVELS.map((difficulty) => (
              <UiFormField
                key={difficulty}
                label={`${formatDifficultyLabel(difficulty)} count`}
                htmlFor={`admin-tests-distribution-${difficulty}`}
              >
                <input
                  id={`admin-tests-distribution-${difficulty}`}
                  type="number"
                  min={0}
                  value={draft.difficultyDistribution[difficulty]}
                  onChange={(event) => updateDistribution(difficulty, event.target.value)}
                />
              </UiFormField>
            ))}
          </UiForm>

          <UiForm
            title="Timing Profile"
            description="Set min/max time windows (seconds) for each difficulty."
            submitLabel="Keep Timing Profile"
            onSubmit={(event) => event.preventDefault()}
          >
            {DIFFICULTY_LEVELS.map((difficulty) => (
              <div key={difficulty} className="admin-tests-timing-row">
                <UiFormField
                  label={`${formatDifficultyLabel(difficulty)} min`}
                  htmlFor={`admin-tests-timing-min-${difficulty}`}
                >
                  <input
                    id={`admin-tests-timing-min-${difficulty}`}
                    type="number"
                    min={1}
                    value={draft.timingProfile[difficulty].minSeconds}
                    onChange={(event) => updateTiming(difficulty, "minSeconds", event.target.value)}
                  />
                </UiFormField>
                <UiFormField
                  label={`${formatDifficultyLabel(difficulty)} max`}
                  htmlFor={`admin-tests-timing-max-${difficulty}`}
                >
                  <input
                    id={`admin-tests-timing-max-${difficulty}`}
                    type="number"
                    min={1}
                    value={draft.timingProfile[difficulty].maxSeconds}
                    onChange={(event) => updateTiming(difficulty, "maxSeconds", event.target.value)}
                  />
                </UiFormField>
              </div>
            ))}
          </UiForm>

          <article className="admin-tests-phase-preview">
            <h3>L2 Timing Profile Snapshot</h3>
            <p>
              Timing windows are derived from the selected exam type, stored by difficulty in <code>timingProfile</code>,
              and never modified after first assignment.
            </p>
            <UiTable
              caption="Draft timing profile table by difficulty"
              columns={[
                { id: "difficulty", header: "Difficulty", render: (row) => formatDifficultyLabel(row.difficulty) },
                { id: "count", header: "Questions", render: (row) => row.questionCount },
                { id: "default", header: "Exam Default", render: (row) => row.defaultWindow },
                { id: "min", header: "MinTime", render: (row) => `${row.minSeconds}s` },
                { id: "max", header: "MaxTime", render: (row) => `${row.maxSeconds}s` },
                { id: "window", header: "Stored Window", render: (row) => row.window },
                { id: "snapshot", header: "Snapshot Rule", render: (row) => row.snapshotRule },
              ]}
              rows={draftTimingProfileRows}
              rowKey={(row) => row.difficulty}
              emptyStateText="No draft timing profile is available."
            />
          </article>

          <article className="admin-tests-phase-preview">
            <h3>L2 Phase Preview</h3>
            <p>
              Total load {phaseConfigPreview.totalLoad} from Easy x1, Medium x2.3, and Hard x4. This snapshot is
              stored with the template and locked after first assignment.
            </p>
            <div className="admin-tests-phase-grid">
              {phaseConfigPreview.phaseSplit.map((phase) => (
                <div key={phase.difficulty} className="admin-tests-phase-row">
                  <strong>{phase.phase}</strong>
                  <span>{phase.questionCount} questions · load {phase.load}</span>
                  <span>{phase.percent}% · {phase.minutes} min</span>
                  <small>{phase.focus}</small>
                </div>
              ))}
            </div>
          </article>
        </div>
      </>
    );
  }

  function renderLibraryView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Library Status</h3>
            <p>{activeLibraryTemplates.length} active-library templates across draft, ready, assigned, and deprecated states.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Editable Templates</h3>
            <p>{activeLibraryTemplates.filter((template) => isTemplateEditable(template.status)).length} draft/ready templates remain editable.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Structure Locked</h3>
            <p>{readyOrAssignedCount} templates are ready/assigned and treated as lifecycle-locked snapshots.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Hidden / Deprecated</h3>
            <p>
              {templates.filter((template) => template.status === "archived").length} archived hidden ·{" "}
              {templates.filter((template) => template.status === "deprecated").length} deprecated excluded from comparisons.
            </p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>HOT / WARM / COLD</h3>
            <p>{hotTemplateCount} HOT · {warmTemplateCount} WARM · {coldTemplateCount} COLD templates.</p>
          </article>
        </div>

        {inspectedTemplate ? (
          <article className="admin-tests-summary-card admin-tests-detail-card">
            <h3>Focused Template</h3>
            <p>
              <strong>{inspectedTemplate.templateName}</strong> · {inspectedTemplate.examType} ·{" "}
              {inspectedTemplate.selectedQuestionIds.length} questions
            </p>
            <div className="admin-tests-row-actions">
              <button type="button" onClick={() => navigate(`/admin/tests/analytics/${inspectedTemplate.id}`)}>
                Open Analytics
              </button>
              <button type="button" onClick={() => navigate("/admin/tests/distribution")}>
                Open Distribution Review
              </button>
              <button type="button" onClick={() => navigate("/admin/tests/settings")}>
                Open Template Settings
              </button>
            </div>
          </article>
        ) : null}

        <UiTable
          caption="Saved Test Templates"
          columns={templateColumns}
          rows={activeLibraryTemplates}
          rowKey={(row) => row.id}
          emptyStateText="No active-library templates are visible."
        />

        <UiTable
          caption="HOT/WARM/COLD template lifecycle policy"
          columns={[
            { id: "tier", header: "Tier", render: (row) => row.tier },
            { id: "trigger", header: "Trigger", render: (row) => row.trigger },
            { id: "metadata", header: "Metadata", render: (row) => row.metadataTreatment },
            { id: "media", header: "Media", render: (row) => row.mediaTreatment },
            { id: "operator", header: "Operator Rule", render: (row) => row.operatorRule },
          ]}
          rows={TEMPLATE_LIFECYCLE_POLICY_ROWS}
          rowKey={(row) => row.tier}
          emptyStateText="No lifecycle policy is configured."
        />

        <UiTable
          caption="Template HOT/WARM/COLD lifecycle register"
          columns={[
            { id: "template", header: "Template", render: (row) => row.templateName },
            { id: "state", header: "Lifecycle State", render: (row) => `${row.thermalState.toUpperCase()} / ${row.status}` },
            { id: "usage", header: "Usage", render: (row) => `${row.totalRuns} runs / ${row.lastUsed}` },
            { id: "trigger", header: "Trigger", render: (row) => row.trigger },
            { id: "retention", header: "Retention", render: (row) => row.metadataTreatment },
            { id: "media", header: "Media", render: (row) => row.mediaTreatment },
            { id: "operator", header: "Operator Action", render: (row) => row.operatorAction },
          ]}
          rows={templateLifecycleRows}
          rowKey={(row) => row.id}
          emptyStateText="No template lifecycle rows are currently available."
        />

        <UiTable
          caption="Archived and deprecated template register"
          columns={[
            { id: "template", header: "Template", render: (template) => template.templateName },
            { id: "status", header: "Status", render: (template) => template.status },
            { id: "visibility", header: "Library Behavior", render: (template) =>
              template.status === "archived" ?
                "Hidden from the active Test Library table." :
                "Visible in library, excluded from future comparisons." },
            { id: "updated", header: "Updated", render: (template) => formatIsoDate(template.updatedAt) },
          ]}
          rows={lifecycleRegisterTemplates}
          rowKey={(row) => row.id}
          emptyStateText="No archived or deprecated templates are currently recorded."
        />
      </>
    );
  }

  function renderAnalyticsView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Templates Tracked</h3>
            <p>{comparableTemplates.length} non-deprecated templates are available for structural analytics drill-in.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Question Coverage</h3>
            <p>{totalQuestionCount} frozen question slots are currently represented across library templates.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Focused Template</h3>
            <p>{inspectedTemplate ? inspectedTemplate.templateName : "No template selected for analytics."}</p>
          </article>
        </div>

        {inspectedTemplate ? (
          <article className="admin-tests-summary-card admin-tests-detail-card">
            <h3>Focused Analytics Snapshot</h3>
            <p>
              Selection: {inspectedTemplate.selectionMethod} · Status: {inspectedTemplate.status} · Last updated:{" "}
              {formatIsoDate(inspectedTemplate.updatedAt)}
            </p>
            <p className="admin-tests-form-footnote">
              This dedicated analytics route now separates template analysis from create/library flows. Deeper L1/L2
              metric depth remains tracked separately under `TST-015`.
            </p>
          </article>
        ) : null}

        <UiTable
          caption="Template analytics workspace"
          columns={analyticsColumns}
          rows={comparableTemplates}
          rowKey={(row) => row.id}
          emptyStateText="No non-deprecated templates are available for analytics."
        />
      </>
    );
  }

  function renderDistributionView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Difficulty %</h3>
            <p>
              {inspectedTemplate ?
                selectedTemplateDifficultyRows.map((row) => `${row.difficulty} ${formatPercent(row.percent)}`).join(" / ") :
                "No template selected."}
            </p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Chapter Coverage</h3>
            <p>{chapterCoverageRows.length} chapters represented in the frozen question set.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>L2 Stress Preview</h3>
            <p>{estimatedStressIndex}% estimated stress index from structural difficulty load.</p>
          </article>
        </div>

        <article className="admin-tests-summary-card admin-tests-detail-card">
          <h3>Distribution Review</h3>
          <p>
            {inspectedTemplate ?
              `${inspectedTemplate.templateName} keeps a frozen ${inspectedTemplate.selectedQuestionIds.length}-question structural snapshot. ${resolvedQuestionTotal} questions resolved against the current library metadata for chapter, marks, and section coverage.` :
              "No template selected for structural review."}
          </p>
          {inspectedTemplate ? (
            <UiFormField label="Template" htmlFor="admin-tests-distribution-template">
              <select
                id="admin-tests-distribution-template"
                value={inspectedTemplate.id}
                onChange={(event) => setInspectedTemplateId(event.target.value)}
              >
                {activeLibraryTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.templateName}
                  </option>
                ))}
              </select>
            </UiFormField>
          ) : null}
        </article>

        <UiTable
          caption="Difficulty percentage and timing review"
          columns={[
            { id: "difficulty", header: "Difficulty", render: (row) => formatDifficultyLabel(row.difficulty) },
            { id: "count", header: "Question Count", render: (row) => row.count },
            { id: "percent", header: "Difficulty %", render: (row) => formatPercent(row.percent) },
            { id: "min", header: "Min Seconds", render: (row) => row.minSeconds },
            { id: "max", header: "Max Seconds", render: (row) => row.maxSeconds },
          ]}
          rows={selectedTemplateDifficultyRows}
          rowKey={(row) => row.difficulty}
          emptyStateText="No template is currently available for distribution review."
        />

        <UiTable
          caption="Stored timing profile by difficulty"
          columns={[
            { id: "difficulty", header: "Difficulty", render: (row) => formatDifficultyLabel(row.difficulty) },
            { id: "count", header: "Questions", render: (row) => row.questionCount },
            { id: "default", header: "Exam Default", render: (row) => row.defaultWindow },
            { id: "min", header: "MinTime", render: (row) => `${row.minSeconds}s` },
            { id: "max", header: "MaxTime", render: (row) => `${row.maxSeconds}s` },
            { id: "window", header: "Stored Window", render: (row) => row.window },
            { id: "snapshot", header: "Snapshot Rule", render: (row) => row.snapshotRule },
          ]}
          rows={selectedTemplateTimingRows}
          rowKey={(row) => row.difficulty}
          emptyStateText="No stored timing profile is available for this template."
        />

        <div className="admin-tests-config-grid">
          <UiTable
            caption="Chapter coverage"
            columns={[
              { id: "chapter", header: "Chapter", render: (row) => row.chapter },
              { id: "subjects", header: "Subject(s)", render: (row) => row.subjects },
              { id: "count", header: "Question Count", render: (row) => row.count },
              { id: "percent", header: "Coverage %", render: (row) => formatPercent(row.percent) },
            ]}
            rows={chapterCoverageRows}
            rowKey={(row) => row.chapter}
            emptyStateText="No chapter metadata resolved for this template."
          />

          <UiTable
            caption="Marks distribution"
            columns={[
              { id: "marks", header: "Marks Bucket", render: (row) => row.marks },
              { id: "count", header: "Question Count", render: (row) => row.count },
              { id: "percent", header: "Distribution %", render: (row) => formatPercent(row.percent) },
            ]}
            rows={marksDistributionRows}
            rowKey={(row) => row.marks}
            emptyStateText="No marks metadata resolved for this template."
          />
        </div>

        <div className="admin-tests-config-grid">
          <UiTable
            caption="Section balance"
            columns={[
              { id: "section", header: "Section", render: (row) => row.section },
              { id: "count", header: "Question Count", render: (row) => row.count },
              { id: "percent", header: "Section %", render: (row) => formatPercent(row.percent) },
            ]}
            rows={sectionBalanceRows}
            rowKey={(row) => row.section}
            emptyStateText="No exam section snapshot is available for this template."
          />

          <article className="admin-tests-phase-preview">
            <h3>L2 Structural Preview</h3>
            <p>{riskPredictionLabel}</p>
            <div className="admin-tests-phase-grid">
              {inspectedPhaseSnapshot?.phaseSplit.map((phase) => (
                <div key={phase.difficulty} className="admin-tests-phase-row">
                  <strong>{phase.phase}</strong>
                  <span>{phase.questionCount} questions · load {phase.load}</span>
                  <span>{phase.percent}% · {phase.minutes} min</span>
                  <small>{phase.focus}</small>
                </div>
              ))}
            </div>
          </article>
        </div>
      </>
    );
  }

  function renderSettingsView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Lifecycle Rules</h3>
            <p>`draft` and `ready` remain editable. First assignment locks structure permanently.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Mode Ceiling</h3>
            <p>L0 allows Operational. L1 adds Diagnostic. L2+ adds Controlled and Hard capability.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Focused Status</h3>
            <p>{inspectedTemplate ? `${inspectedTemplate.templateName}: ${inspectedTemplate.status}` : "No template selected."}</p>
          </article>
        </div>

        <UiTable
          caption="Template settings and lock guidance"
          columns={[
            { id: "rule", header: "Rule", render: (row) => row.rule },
            { id: "value", header: "Value", render: (row) => row.value },
          ]}
          rows={[
            { rule: "Capability ceiling", value: "Configured at template creation and reused during assignment" },
            { rule: "Structural lock", value: "Applied after first assignment to preserve canonical identity" },
            { rule: "Timing profile", value: "Stored per difficulty and treated as immutable snapshot post-assignment" },
            { rule: "Duplicate handling", value: "Canonical ID comparison allows reuse or intentional duplication" },
          ]}
          rowKey={(row) => row.rule}
          emptyStateText="No template settings are currently available."
        />
      </>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-tests-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-tests-title">Test Template Management UI</h2>
      <p className="admin-content-copy">
        Create and manage template drafts through dedicated mounted subpages for authoring, library review, analytics,
        distribution review, and template settings.
      </p>

      <TestsWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {isLoadingTemplates ? <p className="admin-tests-inline-note">Loading template library from GET /admin/tests...</p> : null}
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      {currentSubpage === "create" ? renderCreateView() : null}
      {currentSubpage === "library" ? renderLibraryView() : null}
      {currentSubpage === "analytics" ? renderAnalyticsView() : null}
      {currentSubpage === "distribution" ? renderDistributionView() : null}
      {currentSubpage === "settings" ? renderSettingsView() : null}

      <UiModal
        isOpen={Boolean(publishTargetId)}
        title="Publish Template"
        description="Publishing moves draft to ready and locks editing as per template lifecycle."
        onClose={() => setPublishTargetId(null)}
      >
        <div className="admin-tests-publish-actions">
          <button
            type="button"
            onClick={() => {
              if (publishTargetId) {
                void publishDraftTemplate(publishTargetId);
              }
            }}
            disabled={isSubmitting}
          >
            Confirm Publish
          </button>
          <button type="button" onClick={() => setPublishTargetId(null)} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </UiModal>

      <UiModal
        isOpen={Boolean(duplicateTemplate)}
        title="Duplicate template detected"
        description="Canonical template ID already exists. Reuse existing template or create a duplicate intentionally."
        onClose={() => {
          setDuplicateTemplate(null);
          setPendingDuplicateRecord(null);
        }}
      >
        {duplicateTemplate ? (
          <div className="admin-tests-duplicate-review">
            <article>
              <h3>Existing Template</h3>
              <dl>
                <div>
                  <dt>Template</dt>
                  <dd>{duplicateTemplate.templateName}</dd>
                </div>
                <div>
                  <dt>ID</dt>
                  <dd>{duplicateTemplate.id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{duplicateTemplate.status}</dd>
                </div>
                <div>
                  <dt>Question Count</dt>
                  <dd>{duplicateTemplate.selectedQuestionIds.length}</dd>
                </div>
                <div>
                  <dt>Canonical ID</dt>
                  <dd>
                    <code>{duplicateTemplate.canonicalId}</code>
                  </dd>
                </div>
              </dl>
            </article>
            {pendingDuplicateRecord ? (
              <article>
                <h3>Pending Duplicate</h3>
                <dl>
                  <div>
                    <dt>Template</dt>
                    <dd>{pendingDuplicateRecord.templateName}</dd>
                  </div>
                  <div>
                    <dt>Selection</dt>
                    <dd>{pendingDuplicateRecord.selectionMethod}</dd>
                  </div>
                  <div>
                    <dt>Question Count</dt>
                    <dd>{pendingDuplicateRecord.selectedQuestionIds.length}</dd>
                  </div>
                  <div>
                    <dt>Decision Required</dt>
                    <dd>Reuse preserves the existing structural template. Continue creates a second template with the same canonical question set.</dd>
                  </div>
                </dl>
              </article>
            ) : null}
          </div>
        ) : null}
        <div className="admin-tests-publish-actions">
          <button type="button" onClick={reuseExistingDuplicateTemplate} disabled={isSubmitting}>
            Reuse Existing Template
          </button>
          <button type="button" onClick={proceedWithDuplicateSave} disabled={isSubmitting}>
            Continue and Create Duplicate Intentionally
          </button>
        </div>
      </UiModal>
    </section>
  );
}

export default TestTemplateManagementPage;
