import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { LICENSE_LAYER_ORDER, type LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
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
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

function effectiveLayer(layer: LicenseLayer | null): LicenseLayer {
  return layer ?? "L0";
}

function hasLayer(current: LicenseLayer, required: LicenseLayer): boolean {
  return LICENSE_LAYER_ORDER[current] >= LICENSE_LAYER_ORDER[required];
}

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";
type TemplateThermalState = "hot" | "warm" | "cold";
type TestSubpage = "create" | "library" | "analytics";

interface TimingWindow {
  minSeconds: number;
  maxSeconds: number;
  recommendedSeconds: number;
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
  examType: string;
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

interface PhaseStrategyPercentages {
  acquisition: number;
  recovery: number;
  verification: number;
}

interface ExamStrategyPreset {
  description: string;
  id: string;
  label: string;
  phaseStrategy: PhaseStrategyPercentages;
  targetExam: string;
  timingProfile: TimingProfile;
}

interface CustomStrategyRequestDraft {
  reason: string;
  strategyName: string;
  targetExam: string;
}

interface UploadedSetOption {
  id: string;
  label: string;
  questionCount: number;
  examType: string;
  academicYear: string;
}

interface QuestionUploadLogRecord {
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
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
  examType: string;
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

interface TemplateLibraryFilters {
  examType: string;
  query: string;
  selectionMethod: "all" | SelectionMethod;
  status: "all" | TemplateStatus;
  thermalState: "all" | TemplateThermalState;
  visibility: "active" | "all" | "archived" | "deprecated";
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

const INITIAL_TEMPLATE_LIBRARY_FILTERS: TemplateLibraryFilters = {
  examType: "all",
  query: "",
  selectionMethod: "all",
  status: "all",
  thermalState: "all",
  visibility: "active",
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

function buildRoundRobinQuestions(questions: QuestionBankRecord[]): QuestionBankRecord[] {
  const buckets = new Map<string, QuestionBankRecord[]>();

  for (const question of [...questions].sort(compareQuestionsBySegmentOrder)) {
    const bucketKey = question.subject;
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(question);
    buckets.set(bucketKey, bucket);
  }

  const bucketKeys = [...buckets.keys()].sort((left, right) => left.localeCompare(right));
  const result: QuestionBankRecord[] = [];
  let addedInPass = true;
  let index = 0;

  while (addedInPass) {
    addedInPass = false;
    for (const bucketKey of bucketKeys) {
      const bucket = buckets.get(bucketKey) ?? [];
      if (index < bucket.length) {
        result.push(bucket[index]);
        addedInPass = true;
      }
    }
    index += 1;
  }

  return result;
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
      easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
      medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
      hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
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
      easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
      medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
      hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
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
      easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
      medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
      hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
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
      easy: { minSeconds: 25, recommendedSeconds: 40, maxSeconds: 55 },
      medium: { minSeconds: 55, recommendedSeconds: 95, maxSeconds: 135 },
      hard: { minSeconds: 135, recommendedSeconds: 170, maxSeconds: 210 },
    },
    lastUsedAt: "2025-10-22T08:20:00.000Z",
    status: "deprecated",
    thermalState: "warm",
    totalRuns: 3,
    updatedAt: "2025-11-05T09:00:00.000Z",
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
    easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
    medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
    hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
  },
};

const EXAM_TYPE_SNAPSHOTS: Record<ExamType, ExamTypeSnapshot> = {
  JEEMains: {
    defaultDurationMinutes: 180,
    difficultyTimingMapping: {
      easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
      medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
      hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
    },
    markingScheme: "Fixed JEE snapshot: +4 correct, -1 incorrect, 0 unanswered. Manual marks entry is locked.",
    sectionStructure: ["Physics", "Chemistry", "Mathematics"],
  },
  NEET: {
    defaultDurationMinutes: 200,
    difficultyTimingMapping: {
      easy: { minSeconds: 25, recommendedSeconds: 40, maxSeconds: 55 },
      medium: { minSeconds: 55, recommendedSeconds: 95, maxSeconds: 135 },
      hard: { minSeconds: 135, recommendedSeconds: 170, maxSeconds: 210 },
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

const EXAM_STRATEGY_PRESETS: ExamStrategyPreset[] = [
  {
    description: "Default JEE Main distribution for standard multi-phase timed exams.",
    id: "jee_main_standard",
    label: "JEE Main Standard",
    phaseStrategy: { acquisition: 50, verification: 30, recovery: 20 },
    targetExam: "JEE Main",
    timingProfile: {
      easy: { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 },
      medium: { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 },
      hard: { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 },
    },
  },
  {
    description: "Default NEET timing tuned for medical entrance question cadence.",
    id: "neet_standard",
    label: "NEET Standard",
    phaseStrategy: { acquisition: 52, verification: 28, recovery: 20 },
    targetExam: "NEET",
    timingProfile: {
      easy: { minSeconds: 25, recommendedSeconds: 40, maxSeconds: 55 },
      medium: { minSeconds: 55, recommendedSeconds: 95, maxSeconds: 135 },
      hard: { minSeconds: 135, recommendedSeconds: 170, maxSeconds: 210 },
    },
  },
  {
    description: "Broad CUET timing baseline for high-volume objective sections.",
    id: "cuet_standard",
    label: "CUET Standard",
    phaseStrategy: { acquisition: 45, verification: 35, recovery: 20 },
    targetExam: "CUET",
    timingProfile: {
      easy: { minSeconds: 20, recommendedSeconds: 35, maxSeconds: 50 },
      medium: { minSeconds: 45, recommendedSeconds: 75, maxSeconds: 105 },
      hard: { minSeconds: 90, recommendedSeconds: 135, maxSeconds: 180 },
    },
  },
];

const FALLBACK_QUESTION_UPLOAD_LOGS: QuestionUploadLogRecord[] = [
  {
    id: "upl-2026-0412-001",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-12T08:30:00.000Z",
    totalRows: 124,
  },
  {
    id: "upl-2026-0411-002",
    uploadedBy: "content.ops@parabolic.local",
    timestamp: "2026-04-11T11:15:00.000Z",
    totalRows: 86,
  },
  {
    id: "upl-2026-0409-004",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-09T05:40:00.000Z",
    totalRows: 52,
  },
];

const INITIAL_CUSTOM_STRATEGY_REQUEST: CustomStrategyRequestDraft = {
  reason: "",
  strategyName: "",
  targetExam: "",
};

function getDefaultStrategyIdForExamType(examType: string): string {
  return examType === "NEET" ? "neet_standard" : "jee_main_standard";
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function cloneTimingProfile(value: TimingProfile): TimingProfile {
  return {
    easy: { ...value.easy },
    hard: { ...value.hard },
    medium: { ...value.medium },
  };
}

function getExamTypeSnapshot(examType: string): ExamTypeSnapshot {
  const snapshot = EXAM_TYPE_SNAPSHOTS[examType as keyof typeof EXAM_TYPE_SNAPSHOTS];
  if (!snapshot) {
    return {
      defaultDurationMinutes: 180,
      difficultyTimingMapping: cloneTimingProfile(EXAM_TYPE_SNAPSHOTS.JEEMains.difficultyTimingMapping),
      markingScheme: `Custom ${examType || "exam"} snapshot: marking and timing can be adjusted at strategy level.`,
      sectionStructure: ["General"],
    };
  }
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

function getAcademicYearStart(referenceDate: Date): Date {
  const year = referenceDate.getMonth() >= 3 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
  return new Date(year, 3, 1);
}

function toValidDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deriveTemplateThermalState(template: Pick<TestTemplateRecord, "lastUsedAt" | "status" | "totalRuns">): TemplateThermalState {
  if (template.status === "archived") {
    return "cold";
  }

  const now = new Date();
  const academicYearStart = getAcademicYearStart(now);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const lastUsedDate = toValidDate(template.lastUsedAt);

  if (lastUsedDate && lastUsedDate >= academicYearStart) {
    return "hot";
  }

  if (template.status === "assigned" && template.totalRuns > 0) {
    return "hot";
  }

  if (lastUsedDate && lastUsedDate < twoYearsAgo) {
    return "cold";
  }

  return "warm";
}

function normalizeSelectionMethod(value: unknown, fallback: SelectionMethod): SelectionMethod {
  if (typeof value !== "string") {
    return fallback;
  }

  return SELECTION_METHODS.includes(value as SelectionMethod) ? (value as SelectionMethod) : fallback;
}

function normalizeExamType(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeTimingWindow(value: unknown, fallback: TimingWindow): TimingWindow {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;
  const minSeconds = Math.max(1, toNumberOrZero(source.minSeconds ?? source.min ?? fallback.minSeconds));
  const maxSeconds = Math.max(1, toNumberOrZero(source.maxSeconds ?? source.max ?? fallback.maxSeconds));
  const recommendedSeconds = Math.max(
    minSeconds,
    Math.min(
      maxSeconds,
      toNumberOrZero(
        source.recommendedSeconds ??
        source.recommended ??
        fallback.recommendedSeconds ??
        Math.round((minSeconds + maxSeconds) / 2),
      ),
    ),
  );

  return {
    minSeconds,
    maxSeconds,
    recommendedSeconds,
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
    uploadId: toNonEmptyString(record.uploadId ?? record.upload_id, fallback?.uploadId ?? ""),
    uploadLabel: toNonEmptyString(record.uploadLabel ?? record.upload_label, fallback?.uploadLabel ?? ""),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    tutorialVideoLink: toNonEmptyString(record.tutorialVideoLink, fallback?.tutorialVideoLink ?? ""),
    internalNotes: toNonEmptyString(record.internalNotes, fallback?.internalNotes ?? ""),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

function normalizeQuestionUploadLogRecord(value: unknown, index: number): QuestionUploadLogRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_QUESTION_UPLOAD_LOGS[index] ?? FALLBACK_QUESTION_UPLOAD_LOGS[0];

  return {
    id: toNonEmptyString(record.id, fallback?.id ?? `upl-${index + 1}`),
    uploadedBy: toNonEmptyString(record.uploadedBy, fallback?.uploadedBy ?? "unknown"),
    timestamp: toNonEmptyString(record.timestamp, fallback?.timestamp ?? new Date(0).toISOString()),
    totalRows: Math.max(0, toNumberOrZero(record.totalRows ?? fallback?.totalRows ?? 0)),
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
        1,
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
    totalDurationMinutes: Math.max(1, toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes)),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: Math.max(0, toNumberOrZero(difficultySource.easy)),
      medium: Math.max(0, toNumberOrZero(difficultySource.medium)),
      hard: Math.max(0, toNumberOrZero(difficultySource.hard)),
    },
    timingProfile: {
      easy: normalizeTimingWindow(timingProfileSource.easy, fallback?.timingProfile.easy ?? { minSeconds: 30, recommendedSeconds: 45, maxSeconds: 60 }),
      medium: normalizeTimingWindow(timingProfileSource.medium, fallback?.timingProfile.medium ?? { minSeconds: 60, recommendedSeconds: 105, maxSeconds: 150 }),
      hard: normalizeTimingWindow(timingProfileSource.hard, fallback?.timingProfile.hard ?? { minSeconds: 150, recommendedSeconds: 180, maxSeconds: 210 }),
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

function formatDifficultyLabel(value: DifficultyLevel): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatTemplateStatusLabel(value: TemplateStatus): string {
  switch (value) {
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
  }
}

function formatThermalStateLabel(value: TemplateThermalState): string {
  switch (value) {
    case "hot":
      return "Recently Used";
    case "warm":
      return "Available";
    case "cold":
      return "Old / Archived";
  }
}

function formatSelectionMethodLabel(value: SelectionMethod): string {
  switch (value) {
    case "manual":
      return "Pick Questions Manually";
    case "shuffle_slice":
      return "Auto-select: Shuffle and Pick";
    case "offset_limit":
      return "Auto-select: Ordered Range";
    case "round_robin":
      return "Auto-select: Balanced Rotation";
    case "upload_set":
      return "Select from Uploaded Set";
  }
}

function formatTimingWindow(value: TimingWindow): string {
  return `${value.minSeconds}s / ${value.recommendedSeconds}s / ${value.maxSeconds}s`;
}

function formatOptionalIsoDate(value: string | null): string {
  return value ? formatIsoDate(value) : "Never used";
}

function resolveTestSubpage(pathname: string): TestSubpage {
  if (pathname.includes("/tests/create")) {
    return "create";
  }
  if (pathname.includes("/tests/analytics")) {
    return "analytics";
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

  if (draft.totalDurationMinutes <= 0) {
    return "Total duration must be greater than zero.";
  }

  if (distributionTotal !== draft.selectedQuestionIds.length) {
    return "Difficulty distribution must equal selected question count.";
  }

  for (const difficulty of DIFFICULTY_LEVELS) {
    const window = draft.timingProfile[difficulty];
    if (window.minSeconds <= 0 || window.recommendedSeconds <= 0 || window.maxSeconds <= 0) {
      return "Timing profile values must be positive.";
    }

    if (window.minSeconds > window.maxSeconds) {
      return "Timing profile min seconds cannot exceed max seconds.";
    }

    if (window.recommendedSeconds < window.minSeconds || window.recommendedSeconds > window.maxSeconds) {
      return "Timing profile recommended seconds must stay between min and max.";
    }
  }

  return null;
}

async function submitTemplateToApi(payload: TemplateSubmitPayload): Promise<void> {
  await apiClient.post<unknown, TemplateSubmitPayload>("/admin/tests", { body: payload });
}

async function fetchQuestionUploadLogsFromApi(): Promise<QuestionUploadLogRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/upload-logs");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/upload-logs returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      logs?: unknown;
    };
  };
  const logs = Array.isArray(response.data?.logs) ? response.data.logs : [];
  return logs
    .map((entry, index) => normalizeQuestionUploadLogRecord(entry, index))
    .filter((entry): entry is QuestionUploadLogRecord => Boolean(entry));
}

function TestTemplateManagementPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const currentLayer = effectiveLayer(accessContext.licenseLayer);
  const hasL1Controls = hasLayer(currentLayer, "L1");
  const hasL2Controls = hasLayer(currentLayer, "L2");
  const location = useLocation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TestTemplateRecord[]>(FALLBACK_TEMPLATES);
  const [questionPool, setQuestionPool] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [questionUploadLogs, setQuestionUploadLogs] = useState<QuestionUploadLogRecord[]>(FALLBACK_QUESTION_UPLOAD_LOGS);
  const [draft, setDraft] = useState<TemplateDraft>(INITIAL_DRAFT);
  const [duplicateTemplate, setDuplicateTemplate] = useState<TestTemplateRecord | null>(null);
  const [pendingDuplicateRecord, setPendingDuplicateRecord] = useState<TestTemplateRecord | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [targetQuestionCount, setTargetQuestionCount] = useState(0);
  const [offsetStart, setOffsetStart] = useState(0);
  const [selectedUploadedSetId, setSelectedUploadedSetId] = useState("");
  const [questionQuery, setQuestionQuery] = useState("");
  const [questionPoolFilters, setQuestionPoolFilters] = useState<QuestionPoolFilters>(EMPTY_QUESTION_POOL_FILTERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [createFlowStep, setCreateFlowStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(getDefaultStrategyIdForExamType(INITIAL_DRAFT.examType));
  const [difficultyTimingMode, setDifficultyTimingMode] = useState<"default" | "custom">("default");
  const [phaseStrategyMode, setPhaseStrategyMode] = useState<"default" | "custom">("default");
  const [customPhaseStrategy, setCustomPhaseStrategy] = useState<PhaseStrategyPercentages>({
    acquisition: 50,
    recovery: 20,
    verification: 30,
  });
  const [isCustomStrategyRequestOpen, setIsCustomStrategyRequestOpen] = useState(false);
  const [customStrategyRequest, setCustomStrategyRequest] = useState<CustomStrategyRequestDraft>(
    INITIAL_CUSTOM_STRATEGY_REQUEST,
  );
  const [strategyRequestMessage, setStrategyRequestMessage] = useState<string | null>(null);
  const [questionPreviewId, setQuestionPreviewId] = useState<string | null>(null);
  const [questionPreviewImageFailed, setQuestionPreviewImageFailed] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string>(
    shouldUseLiveApi() ?
      "Live mode enabled: template create/publish sends POST /admin/tests." :
      "Local mode detected: using deterministic question bank and template fixtures for Build 118.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishTargetId, setPublishTargetId] = useState<string | null>(null);
  const [templateLibraryFilters, setTemplateLibraryFilters] = useState<TemplateLibraryFilters>(
    INITIAL_TEMPLATE_LIBRARY_FILTERS,
  );

  useEffect(() => {
    if (!hasL2Controls && createFlowStep === 4) {
      setCreateFlowStep(5);
    }
  }, [createFlowStep, hasL2Controls]);

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

  useEffect(() => {
    let isMounted = true;

    async function loadQuestionUploadLogs() {
      if (!shouldUseLiveApi()) {
        setQuestionUploadLogs(FALLBACK_QUESTION_UPLOAD_LOGS);
        return;
      }

      try {
        const nextLogs = await fetchQuestionUploadLogsFromApi();
        if (!isMounted) {
          return;
        }

        setQuestionUploadLogs(nextLogs.length > 0 ? nextLogs : FALLBACK_QUESTION_UPLOAD_LOGS);
      } catch {
        if (!isMounted) {
          return;
        }

        setQuestionUploadLogs(FALLBACK_QUESTION_UPLOAD_LOGS);
      }
    }

    void loadQuestionUploadLogs();

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
  const availableExamTypes = useMemo(() => {
    const dynamicExamTypes = questionPool
      .map((question) => question.examType.trim())
      .filter((examType) => examType.length > 0);
    return Array.from(new Set([...EXAM_TYPES, ...dynamicExamTypes, draft.examType]))
      .filter((examType) => examType.trim().length > 0)
      .sort((left, right) => left.localeCompare(right));
  }, [draft.examType, questionPool]);
  const uploadedSetOptions = useMemo(() => {
    return questionUploadLogs
      .map((log) => {
        const questionsForUpload = questionPool.filter((question) => question.uploadId?.trim() === log.id);
        if (questionsForUpload.length === 0) {
          return null;
        }

        const sampleQuestion = questionsForUpload[0];
        return {
          id: log.id,
          label: `${log.id} · ${formatIsoDate(log.timestamp)}`,
          questionCount: questionsForUpload.length,
          examType: sampleQuestion.examType,
          academicYear: sampleQuestion.academicYear,
        };
      })
      .filter((entry): entry is UploadedSetOption => Boolean(entry))
      .sort((left, right) => right.id.localeCompare(left.id));
  }, [questionPool, questionUploadLogs]);
  const uploadedSetQuestions = useMemo(() => {
    if (selectedUploadedSetId.trim().length === 0) {
      return [];
    }

    return questionPool.filter((question) => question.uploadId?.trim() === selectedUploadedSetId);
  }, [questionPool, selectedUploadedSetId]);

  const visibleQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase();

    const filteredQuestions = questionPool.filter((question) => {
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
    if (draft.selectionMethod === "upload_set" && selectedUploadedSetId.trim().length > 0) {
      const uploadedSetIds = new Set(uploadedSetQuestions.map((question) => question.id));
      return filteredQuestions.filter((question) => uploadedSetIds.has(question.id));
    }

    return filteredQuestions;
  }, [draft.selectionMethod, questionPool, questionPoolFilters, questionQuery, selectedUploadedSetId, uploadedSetQuestions]);

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
  const activeStrategy = useMemo(
    () => EXAM_STRATEGY_PRESETS.find((strategy) => strategy.id === selectedStrategyId) ?? EXAM_STRATEGY_PRESETS[0],
    [selectedStrategyId],
  );
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

    if (draft.selectionMethod === "round_robin") {
      return buildRoundRobinQuestions(visibleQuestions).slice(0, targetQuestionCount);
    }

    if (draft.selectionMethod === "upload_set") {
      return [...uploadedSetQuestions].sort(compareQuestionsBySegmentOrder).slice(0, targetQuestionCount);
    }

    return [];
  }, [draft.examType, draft.selectionMethod, draft.templateName, offsetStart, targetQuestionCount, uploadedSetQuestions, visibleQuestions]);
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

  useEffect(() => {
    setDraft((current) => {
      const nextDistribution = selectedDifficultyCount;
      return current.difficultyDistribution.easy === nextDistribution.easy &&
          current.difficultyDistribution.medium === nextDistribution.medium &&
          current.difficultyDistribution.hard === nextDistribution.hard ?
        current :
        {
          ...current,
          difficultyDistribution: nextDistribution,
        };
    });
  }, [selectedDifficultyCount]);

  useEffect(() => {
    setSelectedStrategyId(getDefaultStrategyIdForExamType(draft.examType));
  }, [draft.examType]);

  useEffect(() => {
    if (difficultyTimingMode !== "default") {
      return;
    }

    setDraft((current) => {
      const nextTimingProfile = cloneTimingProfile(activeStrategy.timingProfile);
      return JSON.stringify(current.timingProfile) === JSON.stringify(nextTimingProfile) ?
        current :
        {
          ...current,
          timingProfile: nextTimingProfile,
        };
    });
  }, [activeStrategy, difficultyTimingMode]);

  const templatesWithDerivedThermalState = useMemo(
    () => templates.map((template) => ({ ...template, thermalState: deriveTemplateThermalState(template) })),
    [templates],
  );
  const templateLibraryExamTypes = useMemo(
    () => ["all", ...new Set(templatesWithDerivedThermalState.map((template) => template.examType).filter((examType) => examType.trim().length > 0))],
    [templatesWithDerivedThermalState],
  );
  const filteredLibraryTemplates = useMemo(() => {
    const query = templateLibraryFilters.query.trim().toLowerCase();

    return templatesWithDerivedThermalState.filter((template) => {
      const visibilityMatches =
        (
          templateLibraryFilters.visibility === "all" ||
          (templateLibraryFilters.visibility === "active" && template.status !== "archived" && template.status !== "deprecated") ||
          (templateLibraryFilters.visibility === "archived" && template.status === "archived") ||
          (templateLibraryFilters.visibility === "deprecated" && template.status === "deprecated")
        );
      const examMatches =
        templateLibraryFilters.examType === "all" || template.examType === templateLibraryFilters.examType;
      const selectionMatches =
        templateLibraryFilters.selectionMethod === "all" || template.selectionMethod === templateLibraryFilters.selectionMethod;
      const statusMatches =
        templateLibraryFilters.status === "all" || template.status === templateLibraryFilters.status;
      const thermalMatches =
        templateLibraryFilters.thermalState === "all" || template.thermalState === templateLibraryFilters.thermalState;
      const queryMatches =
        query.length === 0 ||
        template.id.toLowerCase().includes(query) ||
        template.templateName.toLowerCase().includes(query) ||
        template.examType.toLowerCase().includes(query) ||
        template.canonicalId.toLowerCase().includes(query);

      return visibilityMatches && examMatches && selectionMatches && statusMatches && thermalMatches && queryMatches;
    });
  }, [templateLibraryFilters, templatesWithDerivedThermalState]);
  const previewQuestion = questionPreviewId ? questionPoolById.get(questionPreviewId) ?? null : null;
  const activePhaseStrategy =
    phaseStrategyMode === "default" ? activeStrategy.phaseStrategy : customPhaseStrategy;
  const phaseStrategyTotal =
    customPhaseStrategy.acquisition + customPhaseStrategy.verification + customPhaseStrategy.recovery;
  const timingValidationError = DIFFICULTY_LEVELS.reduce<string | null>((error, difficulty) => {
    if (error) {
      return error;
    }

    const window = draft.timingProfile[difficulty];
    if (window.minSeconds > window.maxSeconds) {
      return `${formatDifficultyLabel(difficulty)} min cannot exceed max.`;
    }
    if (window.recommendedSeconds < window.minSeconds || window.recommendedSeconds > window.maxSeconds) {
      return `${formatDifficultyLabel(difficulty)} recommended must stay between min and max.`;
    }
    return null;
  }, null);
  const rawRecommendedMinutes = roundToTwo(
    (selectedDifficultyCount.easy * draft.timingProfile.easy.recommendedSeconds +
      selectedDifficultyCount.medium * draft.timingProfile.medium.recommendedSeconds +
      selectedDifficultyCount.hard * draft.timingProfile.hard.recommendedSeconds) /
      60,
  );
  const basePhaseTimings = {
    acquisition: roundToTwo(rawRecommendedMinutes * (activePhaseStrategy.acquisition / 100)),
    recovery: roundToTwo(rawRecommendedMinutes * (activePhaseStrategy.recovery / 100)),
    verification: roundToTwo(rawRecommendedMinutes * (activePhaseStrategy.verification / 100)),
  };
  const availableBufferMinutes = roundToTwo(draft.totalDurationMinutes - rawRecommendedMinutes);
  const recommendedMinimumDuration = Math.ceil(rawRecommendedMinutes);
  const additionalTimeRequired = roundToTwo(Math.max(0, rawRecommendedMinutes - draft.totalDurationMinutes));
  const validationPassed =
    selectedQuestionCount > 0 &&
    timingValidationError === null &&
    (phaseStrategyMode === "default" || phaseStrategyTotal === 100) &&
    availableBufferMinutes >= 0;
  const finalPhaseTimings = {
    acquisition: basePhaseTimings.acquisition,
    recovery: roundToTwo(basePhaseTimings.recovery + Math.max(0, availableBufferMinutes)),
    verification: basePhaseTimings.verification,
  };
  const selectionSnapshotReady =
    targetQuestionCount > 0 && selectedQuestionCount === targetQuestionCount;
  function updateTiming(
    difficulty: DifficultyLevel,
    field: "minSeconds" | "recommendedSeconds" | "maxSeconds",
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

  function updatePhaseStrategyField(
    field: keyof PhaseStrategyPercentages,
    rawValue: string,
  ) {
    const value = Number(rawValue);
    setCustomPhaseStrategy((current) => ({
      ...current,
      [field]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    }));
  }

  function submitCustomStrategyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStrategyRequestMessage(
      `Request submitted for ${customStrategyRequest.strategyName.trim() || "custom strategy"}. Vendor review is now required before it becomes selectable.`,
    );
    setIsCustomStrategyRequestOpen(false);
    setCustomStrategyRequest(INITIAL_CUSTOM_STRATEGY_REQUEST);
  }

  function toggleQuestionSelection(questionId: string) {
    if (draft.selectionMethod !== "manual" && draft.selectionMethod !== "upload_set") {
      setErrorMessage("Use auto-select for the current selection method, or switch to manual picking.");
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

  function applyStatisticalSelection() {
    if (
      draft.selectionMethod !== "shuffle_slice" &&
      draft.selectionMethod !== "offset_limit" &&
      draft.selectionMethod !== "round_robin"
    ) {
      setErrorMessage("Select shuffle_slice, offset_limit, or round_robin before applying statistical selection.");
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
      draft.selectionMethod === "offset_limit" ?
        `Applied offset_limit: sorted ${visibleQuestions.length} matched questions and selected ${targetQuestionCount} from offset ${offsetStart}.` :
        `Applied round_robin: alternated across matched subjects and selected ${targetQuestionCount} questions.`,
    );
  }

  function applyUploadedSetSelection() {
    if (draft.selectionMethod !== "upload_set") {
      setErrorMessage("Choose Select from Uploaded Set before applying an uploaded set.");
      return;
    }

    if (selectedUploadedSetId.trim().length === 0) {
      setErrorMessage("Choose an uploaded set before applying it.");
      return;
    }

    if (uploadedSetQuestions.length === 0) {
      setErrorMessage("The selected uploaded set does not contain any available questions.");
      return;
    }

    const orderedQuestions = [...uploadedSetQuestions].sort(compareQuestionsBySegmentOrder);
    const selectedQuestionIds = orderedQuestions.map((question) => question.id);
    const difficultyDistribution = orderedQuestions.reduce<DifficultyDistribution>(
      (accumulator, question) => {
        accumulator[question.difficulty] += 1;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );

    setTargetQuestionCount(selectedQuestionIds.length);
    setDraft((current) => ({
      ...current,
      selectedQuestionIds,
      difficultyDistribution,
    }));
    setInlineMessage(`Loaded ${selectedQuestionIds.length} question(s) from the selected uploaded set.`);
    setErrorMessage(null);
  }

  function resetEditor() {
    setDraft(INITIAL_DRAFT);
    setTargetQuestionCount(0);
    setOffsetStart(0);
    setSelectedUploadedSetId("");
    setEditingTemplateId(null);
    setCreateFlowStep(1);
    setSelectedStrategyId(getDefaultStrategyIdForExamType(INITIAL_DRAFT.examType));
    setDifficultyTimingMode("default");
    setPhaseStrategyMode("default");
    setCustomPhaseStrategy({ acquisition: 50, recovery: 20, verification: 30 });
    setIsCustomStrategyRequestOpen(false);
    setCustomStrategyRequest(INITIAL_CUSTOM_STRATEGY_REQUEST);
    setStrategyRequestMessage(null);
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
    setSelectedUploadedSetId("");
    setEditingTemplateId(target.id);
    setCreateFlowStep(1);
    setSelectedStrategyId(getDefaultStrategyIdForExamType(target.examType));
    setDifficultyTimingMode("custom");
    setPhaseStrategyMode("default");
    setErrorMessage(null);
    navigate("/admin/tests/create");
  }

  async function saveDraftTemplateFromCurrentState() {
    setErrorMessage(null);

    const selectionSourceQuestions =
      draft.selectionMethod === "upload_set" ? uploadedSetQuestions : visibleQuestions;
    const selectedFromMatchedCount = draft.selectedQuestionIds.filter((questionId) =>
      selectionSourceQuestions.some((question) => question.id === questionId),
    ).length;
    if (selectedFromMatchedCount !== draft.selectedQuestionIds.length) {
      setErrorMessage("All selected questions must come from the current matched pool before saving.");
      return;
    }

    if (
      draft.selectionMethod === "shuffle_slice" ||
      draft.selectionMethod === "offset_limit" ||
      draft.selectionMethod === "round_robin" ||
      draft.selectionMethod === "upload_set"
    ) {
      const previewQuestionIds = statisticalSelectionPreview.map((question) => question.id);
      const selectionStillMatchesMethod =
        previewQuestionIds.length === draft.selectedQuestionIds.length &&
        previewQuestionIds.every((questionId, index) => questionId === draft.selectedQuestionIds[index]);
      if (!selectionStillMatchesMethod) {
        setErrorMessage("Apply the current statistical selection preview before saving this template.");
        return;
      }
    }

    const validationError = validateDraft(draft, targetQuestionCount, selectionSourceQuestions.length);
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
      setInlineMessage("Test marked ready. It can now be used in assignment workflows.");
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
    navigate(`/admin/tests/analytics/${duplicateTemplate.id}`);
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
        <div className="admin-question-library-main-cell">
          <strong>{template.templateName}</strong>
          <small>{template.id} · {template.examType}</small>
          <small>Canonical: {template.canonicalId.slice(0, 16)}...</small>
        </div>
      ),
    },
    {
      id: "setup",
      header: "Setup",
      render: (template) => (
        <div className="admin-question-library-compact-cell">
          <strong>{formatSelectionMethodLabel(template.selectionMethod)}</strong>
          <small>{template.selectedQuestionIds.length} questions</small>
          <small>
            Easy {template.difficultyDistribution.easy} · Medium {template.difficultyDistribution.medium} · Hard{" "}
            {template.difficultyDistribution.hard}
          </small>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "Lifecycle",
      render: (template) => (
        <div className="admin-question-library-compact-cell">
          <span className={`admin-tests-status admin-tests-status-${template.status}`}>{formatTemplateStatusLabel(template.status)}</span>
          <small>{template.totalRuns} runs · {formatThermalStateLabel(template.thermalState)}</small>
          <small>Last used: {formatOptionalIsoDate(template.lastUsedAt)}</small>
          <small>Updated {formatIsoDate(template.updatedAt)}</small>
        </div>
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
          <div className="admin-question-library-actions">
            <button type="button" onClick={() => navigate(`/admin/tests/analytics/${template.id}`)}>
              Open Details
            </button>
            <button type="button" onClick={() => startEditingTemplate(template.id)} disabled={!editable}>
              Edit
            </button>
            <button type="button" onClick={() => setPublishTargetId(template.id)} disabled={!publishable}>
              Ready
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

  function renderCreateView() {
    const stepItems = [
      { step: 1 as const, label: "Basic Details", enabled: true },
      { step: 2 as const, label: "Choose Questions", enabled: draft.templateName.trim().length >= 3 && draft.examType.trim().length > 0 },
      { step: 3 as const, label: "Timing Strategy", enabled: selectionSnapshotReady },
      ...(hasL2Controls ?
        [{ step: 4 as const, label: "Phase Plan", enabled: selectionSnapshotReady && timingValidationError === null }] :
        []),
      {
        step: 5 as const,
        label: "Review Time",
        enabled:
          selectionSnapshotReady &&
          (!hasL1Controls || timingValidationError === null) &&
          (!hasL2Controls || phaseStrategyMode === "default" || phaseStrategyTotal === 100),
      },
    ];
    const currentStepIndex = stepItems.findIndex((item) => item.step === createFlowStep);
    const strategyContinueStep = hasL2Controls ? 4 : 5;
    const validationBackStep = hasL2Controls ? 4 : 3;

    return (
      <>
        <div className="admin-tests-create-hero">
          <nav className="admin-tests-stepper" aria-label="Create test steps">
            {stepItems.map((item, index) => (
              <button
                key={item.step}
                type="button"
                className={`admin-tests-stepper-item${createFlowStep === item.step ? " admin-tests-stepper-item-active" : ""}${currentStepIndex > index ? " admin-tests-stepper-item-complete" : ""}`}
                disabled={!item.enabled}
                onClick={() => setCreateFlowStep(item.step)}
              >
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
        </div>

        <div className="admin-tests-create-layout">
          <div className="admin-tests-create-main">
            {createFlowStep === 1 ? (
              <article className="admin-tests-step-card admin-tests-step-card-main">
                <div className="admin-tests-create-section-header">
                  <div>
                    <p className="admin-tests-section-kicker">Step 1</p>
                    <h3>Basic Test Details</h3>
                  </div>
                  <span className="admin-tests-create-chip">Start here</span>
                </div>
                <p className="admin-tests-form-footnote">
                  Give the test a clear name, choose the exam type, and decide how you want questions to be picked.
                </p>
                <div className="admin-tests-create-form-grid">
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
                        const examType = event.target.value;
                        const examSnapshot = getExamTypeSnapshot(examType);
                        setDraft((current) => ({
                          ...current,
                          examType,
                          timingProfile: cloneTimingProfile(examSnapshot.difficultyTimingMapping),
                          totalDurationMinutes: examSnapshot.defaultDurationMinutes,
                        }));
                      }}
                    >
                      {availableExamTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </UiFormField>
                  <UiFormField label="How Questions Should Be Picked" htmlFor="admin-tests-selection-method">
                    <select
                      id="admin-tests-selection-method"
                      value={draft.selectionMethod}
                      onChange={(event) => {
                        const nextSelectionMethod = event.target.value as SelectionMethod;
                        setSelectedUploadedSetId("");
                        setTargetQuestionCount(0);
                        setOffsetStart(0);
                        setDraft((current) => ({
                          ...current,
                          selectionMethod: nextSelectionMethod,
                          selectedQuestionIds: [],
                          difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
                        }));
                      }}
                    >
                      {SELECTION_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {formatSelectionMethodLabel(method)}
                        </option>
                      ))}
                    </select>
                  </UiFormField>
                </div>
                <div className="admin-tests-step-actions">
                  {editingTemplateId ? (
                    <button type="button" onClick={resetEditor} disabled={isSubmitting}>
                      Cancel Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCreateFlowStep(2)}
                    disabled={draft.templateName.trim().length < 3 || draft.examType.trim().length === 0}
                  >
                    Continue to Choose Questions
                  </button>
                </div>
              </article>
            ) : null}

            {createFlowStep === 2 ? (
              <article className="admin-tests-step-card admin-tests-step-card-main">
                <div className="admin-tests-create-section-header">
                  <div>
                    <p className="admin-tests-section-kicker">Step 2</p>
                    <h3>Choose Questions</h3>
                  </div>
                  <span className="admin-tests-create-chip">Pick your set</span>
                </div>
                <p className="admin-tests-form-footnote">
                  Filter the question bank, set how many questions you want, and then either pick them yourself or let
                  the system auto-select them for you.
                </p>
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
                    <select id="admin-tests-filter-subject" value={questionPoolFilters.subject} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, subject: event.target.value }))}>
                      <option value="all">All subjects</option>
                      {questionPoolFilterOptions.subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Chapter" htmlFor="admin-tests-filter-chapter">
                    <select id="admin-tests-filter-chapter" value={questionPoolFilters.chapter} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, chapter: event.target.value }))}>
                      <option value="all">All chapters</option>
                      {questionPoolFilterOptions.chapters.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Difficulty" htmlFor="admin-tests-filter-difficulty">
                    <select id="admin-tests-filter-difficulty" value={questionPoolFilters.difficulty} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, difficulty: event.target.value as QuestionPoolFilters["difficulty"] }))}>
                      <option value="all">All difficulties</option>
                      {DIFFICULTY_LEVELS.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Tags" htmlFor="admin-tests-filter-tag">
                    <select id="admin-tests-filter-tag" value={questionPoolFilters.tag} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, tag: event.target.value }))}>
                      <option value="all">All tags</option>
                      {questionPoolFilterOptions.tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Question Type" htmlFor="admin-tests-filter-question-type">
                    <select id="admin-tests-filter-question-type" value={questionPoolFilters.questionType} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, questionType: event.target.value }))}>
                      <option value="all">All types</option>
                      {questionPoolFilterOptions.questionTypes.map((questionType) => <option key={questionType} value={questionType}>{questionType}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Academic Year" htmlFor="admin-tests-filter-academic-year">
                    <select id="admin-tests-filter-academic-year" value={questionPoolFilters.academicYear} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, academicYear: event.target.value }))}>
                      <option value="all">All years</option>
                      {questionPoolFilterOptions.academicYears.map((academicYear) => <option key={academicYear} value={academicYear}>{academicYear}</option>)}
                    </select>
                  </UiFormField>
                  <UiFormField label="Used / Unused" htmlFor="admin-tests-filter-usage">
                    <select id="admin-tests-filter-usage" value={questionPoolFilters.usageState} onChange={(event) => setQuestionPoolFilters((current) => ({ ...current, usageState: event.target.value as QuestionPoolFilters["usageState"] }))}>
                      <option value="all">All usage states</option>
                      <option value="unused">Unused only</option>
                      <option value="used">Used only</option>
                    </select>
                  </UiFormField>
                  <button type="button" className="admin-tests-filter-reset" onClick={() => { setQuestionQuery(""); setQuestionPoolFilters(EMPTY_QUESTION_POOL_FILTERS); }}>
                    Reset Filters
                  </button>
                </div>
                <div className="admin-tests-selection-target">
                  <UiFormField label={draft.selectionMethod === "upload_set" ? "How Many Questions Do You Want From This Upload?" : "How Many Questions Do You Want?"} htmlFor="admin-tests-target-question-count">
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
                    <span>matching</span>
                    <strong>{targetQuestionCount}</strong>
                    <span>target</span>
                    <strong>{selectedQuestionCount}</strong>
                    <span>selected</span>
                  </div>
                </div>
                {draft.selectionMethod === "upload_set" ? (
                  <div className="admin-tests-statistical-selection">
                    <UiFormField label="Choose Uploaded Set" htmlFor="admin-tests-uploaded-set">
                      <select
                        id="admin-tests-uploaded-set"
                        value={selectedUploadedSetId}
                        onChange={(event) => {
                          const nextUploadedSetId = event.target.value;
                          const matchedOption = uploadedSetOptions.find((option) => option.id === nextUploadedSetId);
                          setSelectedUploadedSetId(event.target.value);
                          setDraft((current) => ({
                            ...current,
                            selectedQuestionIds: [],
                            difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
                          }));
                          setTargetQuestionCount(matchedOption?.questionCount ?? 0);
                          setErrorMessage(null);
                        }}
                      >
                        <option value="">Choose an upload ID</option>
                        {uploadedSetOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} · {option.questionCount} questions
                          </option>
                        ))}
                      </select>
                    </UiFormField>
                    <div className="admin-tests-statistical-preview">
                      <strong>Select from Upload History</strong>
                      <span>
                        {selectedUploadedSetId ?
                          `You can either select all questions from this upload ID or hand-pick questions from the filtered list below.` :
                          "Choose an upload ID from Question Bank Upload History to start from that uploaded question set."}
                      </span>
                      <small>
                        {selectedUploadedSetId ?
                          `${uploadedSetQuestions.length} question(s) available for this upload ID.` :
                          "Upload IDs are generated in Question Bank Upload History."}
                      </small>
                    </div>
                    <button type="button" onClick={applyUploadedSetSelection} disabled={selectedUploadedSetId.trim().length === 0}>
                      Select All Questions From This Upload
                    </button>
                  </div>
                ) : null}
                {draft.selectionMethod === "shuffle_slice" || draft.selectionMethod === "offset_limit" || draft.selectionMethod === "round_robin" ? (
                  <div className="admin-tests-statistical-selection">
                    {draft.selectionMethod === "offset_limit" ? (
                      <UiFormField label="Start From Position" htmlFor="admin-tests-offset-start">
                        <input id="admin-tests-offset-start" type="number" min={0} max={maxOffsetStart} value={offsetStart} onChange={(event) => {
                          const rawValue = Number(event.target.value);
                          const nextValue = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
                          setOffsetStart(Math.min(nextValue, maxOffsetStart));
                          setErrorMessage(null);
                        }} />
                      </UiFormField>
                    ) : null}
                    <div className="admin-tests-statistical-preview">
                      <strong>{draft.selectionMethod === "shuffle_slice" ? "Auto-pick after shuffling" : draft.selectionMethod === "offset_limit" ? "Auto-pick from an ordered range" : "Auto-pick with balanced rotation"}</strong>
                      <span>{draft.selectionMethod === "shuffle_slice" ? `The system will shuffle the matching questions and pick the first ${targetQuestionCount}.` : draft.selectionMethod === "offset_limit" ? `The system will sort the matching questions and pick ${targetQuestionCount} questions starting from position ${offsetStart}.` : `The system will rotate across matching subjects until ${targetQuestionCount} questions are selected.`}</span>
                      <small>Preview: {statisticalSelectionPreview.length > 0 ? statisticalSelectionPreview.map((question) => question.id).join(", ") : "Set the target count to preview the selected question IDs."}</small>
                    </div>
                    <button type="button" onClick={applyStatisticalSelection}>Auto-select Questions</button>
                  </div>
                ) : null}
                <div className="admin-tests-question-table-shell" role="group" aria-label="Template question selection">
                  <table className="admin-tests-question-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>ID</th>
                        <th>Subject</th>
                        <th>Chapter</th>
                        <th>Difficulty</th>
                        <th>Type</th>
                        <th>Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleQuestions.map((question) => {
                        const checked = draft.selectedQuestionIds.includes(question.id);
                        const limitReached = !checked && targetQuestionCount > 0 && selectedQuestionCount >= targetQuestionCount;
                        return (
                          <tr key={question.id}>
                            <td><input type="checkbox" checked={checked} disabled={(draft.selectionMethod !== "manual" && draft.selectionMethod !== "upload_set") || targetQuestionCount <= 0 || limitReached} onChange={() => toggleQuestionSelection(question.id)} /></td>
                            <td>
                              <button type="button" className="admin-tests-question-preview-link" onClick={() => { setQuestionPreviewId(question.id); setQuestionPreviewImageFailed(false); }}>
                                {question.id}
                              </button>
                            </td>
                            <td>{question.subject}</td>
                            <td>{question.chapter}</td>
                            <td className={`admin-tests-question-difficulty admin-tests-question-difficulty-${question.difficulty}`}>{formatDifficultyLabel(question.difficulty)}</td>
                            <td>{question.questionType}</td>
                            <td>{question.academicYear}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <article className="admin-tests-phase-preview">
                  <h3>Question Distribution Summary</h3>
                  <div className="admin-tests-summary-list">
                    <div><span>Easy Questions</span><strong>{selectedDifficultyCount.easy}</strong></div>
                    <div><span>Medium Questions</span><strong>{selectedDifficultyCount.medium}</strong></div>
                    <div><span>Hard Questions</span><strong>{selectedDifficultyCount.hard}</strong></div>
                    <div><span>Total Questions</span><strong>{selectedQuestionCount}</strong></div>
                  </div>
                </article>
                <div className="admin-tests-step-actions">
                  <button type="button" onClick={() => setCreateFlowStep(1)}>Back</button>
                  <button type="button" onClick={() => setCreateFlowStep(3)} disabled={!selectionSnapshotReady}>Continue to Timing Strategy</button>
                </div>
              </article>
            ) : null}

            {createFlowStep === 3 ? (
              <article className="admin-tests-step-card admin-tests-step-card-main">
                <div className="admin-tests-create-section-header">
                  <div>
                    <p className="admin-tests-section-kicker">Step 3</p>
                    <h3>Timing Strategy</h3>
                  </div>
                  <span className="admin-tests-create-chip">{hasL2Controls ? "Controlled" : hasL1Controls ? "Diagnostic" : "Operational"}</span>
                </div>
                <p className="admin-tests-form-footnote">
                  Choose the timing style for this test. At higher layers you can fine-tune timings to better match how
                  you want students to pace themselves.
                </p>
                {hasL1Controls ? (
                  <UiFormField label="Recommended Strategy" htmlFor="admin-tests-strategy-select">
                    <select id="admin-tests-strategy-select" value={selectedStrategyId} onChange={(event) => setSelectedStrategyId(event.target.value)}>
                      {EXAM_STRATEGY_PRESETS.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}
                    </select>
                  </UiFormField>
                ) : (
                  <article className="admin-tests-strategy-option admin-tests-strategy-option-active">
                    <strong>Automatically Applied</strong>
                    <span>{activeStrategy.label}</span>
                    <small>This strategy already includes timing rules, phase planning, and validation guidance in read-only mode.</small>
                  </article>
                )}
                {hasL2Controls ? (
                  <>
                    <div className="admin-tests-strategy-options">
                      <h4>Available Strategies</h4>
                      {EXAM_STRATEGY_PRESETS.map((strategy) => (
                        <div key={strategy.id} className={`admin-tests-strategy-option${strategy.id === selectedStrategyId ? " admin-tests-strategy-option-active" : ""}`}>
                          <strong>{strategy.label}</strong>
                          <span>{strategy.targetExam}</span>
                          <small>{strategy.description}</small>
                        </div>
                      ))}
                    </div>
                    <div className="admin-tests-strategy-request">
                      <h4>Need a Custom Strategy?</h4>
                      <button type="button" onClick={() => { setIsCustomStrategyRequestOpen((current) => !current); setStrategyRequestMessage(null); }}>
                        Request Custom Strategy
                      </button>
                      {strategyRequestMessage ? <p className="admin-tests-form-footnote">{strategyRequestMessage}</p> : null}
                    </div>
                    {isCustomStrategyRequestOpen ? (
                      <form className="admin-tests-inline-form" onSubmit={submitCustomStrategyRequest}>
                        <UiFormField label="Strategy Name" htmlFor="admin-tests-custom-strategy-name">
                          <input id="admin-tests-custom-strategy-name" type="text" value={customStrategyRequest.strategyName} onChange={(event) => setCustomStrategyRequest((current) => ({ ...current, strategyName: event.target.value }))} required />
                        </UiFormField>
                        <UiFormField label="Target Exam" htmlFor="admin-tests-custom-strategy-exam">
                          <input id="admin-tests-custom-strategy-exam" type="text" value={customStrategyRequest.targetExam} onChange={(event) => setCustomStrategyRequest((current) => ({ ...current, targetExam: event.target.value }))} required />
                        </UiFormField>
                        <UiFormField label="Reason" htmlFor="admin-tests-custom-strategy-reason">
                          <textarea id="admin-tests-custom-strategy-reason" value={customStrategyRequest.reason} onChange={(event) => setCustomStrategyRequest((current) => ({ ...current, reason: event.target.value }))} rows={3} required />
                        </UiFormField>
                        <button type="submit">Submit Request</button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                {hasL1Controls ? (
                  <div className="admin-tests-strategy-config">
                    <h4>{hasL2Controls ? "Difficulty Timing Configuration (seconds)" : "Preview + Difficulty Timing Configuration (seconds)"}</h4>
                    {!hasL2Controls ? (
                      <div className="admin-tests-summary-list">
                        {DIFFICULTY_LEVELS.map((difficulty) => (
                          <div key={difficulty}>
                            <span>{formatDifficultyLabel(difficulty)}</span>
                            <strong>{formatTimingWindow(activeStrategy.timingProfile[difficulty])}</strong>
                          </div>
                        ))}
                        <div>
                          <span>Phase Strategy</span>
                          <strong>{activeStrategy.phaseStrategy.acquisition}% / {activeStrategy.phaseStrategy.verification}% / {activeStrategy.phaseStrategy.recovery}%</strong>
                        </div>
                      </div>
                    ) : null}
                    <label className="admin-tests-radio-row"><input type="radio" name="difficultyTimingMode" checked={difficultyTimingMode === "default"} onChange={() => setDifficultyTimingMode("default")} /><span>Use Recommended Timing</span></label>
                    <label className="admin-tests-radio-row"><input type="radio" name="difficultyTimingMode" checked={difficultyTimingMode === "custom"} onChange={() => setDifficultyTimingMode("custom")} /><span>Adjust Timing Manually</span></label>
                    <div className="admin-tests-timing-header"><span>Difficulty</span><span>Min (sec)</span><span>Rec (sec)</span><span>Max (sec)</span></div>
                    {DIFFICULTY_LEVELS.map((difficulty) => (
                      <div key={difficulty} className="admin-tests-timing-grid-row">
                        <strong>{formatDifficultyLabel(difficulty)}</strong>
                        <input type="number" min={1} value={draft.timingProfile[difficulty].minSeconds} onChange={(event) => updateTiming(difficulty, "minSeconds", event.target.value)} disabled={difficultyTimingMode === "default"} />
                        <input type="number" min={1} value={draft.timingProfile[difficulty].recommendedSeconds} onChange={(event) => updateTiming(difficulty, "recommendedSeconds", event.target.value)} disabled={difficultyTimingMode === "default"} />
                        <input type="number" min={1} value={draft.timingProfile[difficulty].maxSeconds} onChange={(event) => updateTiming(difficulty, "maxSeconds", event.target.value)} disabled={difficultyTimingMode === "default"} />
                      </div>
                    ))}
                    {timingValidationError ? <p className="admin-tests-inline-error">{timingValidationError}</p> : null}
                  </div>
                ) : null}
                <div className="admin-tests-step-actions">
                  <button type="button" onClick={() => setCreateFlowStep(2)}>Back</button>
                  <button type="button" onClick={() => setCreateFlowStep(strategyContinueStep)} disabled={hasL1Controls && timingValidationError !== null}>
                    {hasL2Controls ? "Continue to Phase Plan" : "Continue to Review Time"}
                  </button>
                </div>
              </article>
            ) : null}

            {hasL2Controls && createFlowStep === 4 ? (
              <article className="admin-tests-step-card admin-tests-step-card-main">
                <div className="admin-tests-create-section-header">
                  <div>
                    <p className="admin-tests-section-kicker">Step 4</p>
                    <h3>Phase Plan</h3>
                  </div>
                </div>
                <p className="admin-tests-form-footnote">
                  Split the total working time across the three phases. Keep the total at 100% so the pacing plan stays balanced.
                </p>
                <label className="admin-tests-radio-row"><input type="radio" name="phaseStrategyMode" checked={phaseStrategyMode === "default"} onChange={() => setPhaseStrategyMode("default")} /><span>Use Recommended Phase Split</span></label>
                <label className="admin-tests-radio-row"><input type="radio" name="phaseStrategyMode" checked={phaseStrategyMode === "custom"} onChange={() => setPhaseStrategyMode("custom")} /><span>Adjust Phase Split Manually</span></label>
                <div className="admin-tests-phase-percent-list">
                  <UiFormField label="P1 Acquisition (%)" htmlFor="admin-tests-phase-acquisition"><input id="admin-tests-phase-acquisition" type="number" min={0} max={100} value={activePhaseStrategy.acquisition} disabled={phaseStrategyMode === "default"} onChange={(event) => updatePhaseStrategyField("acquisition", event.target.value)} /></UiFormField>
                  <UiFormField label="P2 Verification (%)" htmlFor="admin-tests-phase-verification"><input id="admin-tests-phase-verification" type="number" min={0} max={100} value={activePhaseStrategy.verification} disabled={phaseStrategyMode === "default"} onChange={(event) => updatePhaseStrategyField("verification", event.target.value)} /></UiFormField>
                  <UiFormField label="P3 Recovery (%)" htmlFor="admin-tests-phase-recovery"><input id="admin-tests-phase-recovery" type="number" min={0} max={100} value={activePhaseStrategy.recovery} disabled={phaseStrategyMode === "default"} onChange={(event) => updatePhaseStrategyField("recovery", event.target.value)} /></UiFormField>
                </div>
                <div className="admin-tests-phase-validation">
                  <strong>Validation</strong>
                  <span>P1 + P2 + P3 = {phaseStrategyMode === "default" ? 100 : phaseStrategyTotal}%</span>
                </div>
                {phaseStrategyMode === "custom" && phaseStrategyTotal !== 100 ? <p className="admin-tests-inline-error">Phase percentages must add up to 100%.</p> : null}
                <div className="admin-tests-step-actions">
                  <button type="button" onClick={() => setCreateFlowStep(3)}>Back</button>
                  <button type="button" onClick={() => setCreateFlowStep(5)} disabled={phaseStrategyMode === "custom" && phaseStrategyTotal !== 100}>Continue to Review Time</button>
                </div>
              </article>
            ) : null}

            {createFlowStep === 5 ? (
              <article className="admin-tests-step-card admin-tests-step-card-main">
                <div className="admin-tests-create-section-header">
                  <div>
                    <p className="admin-tests-section-kicker">Step {hasL2Controls ? "5" : "4"}</p>
                    <h3>{hasL2Controls ? "Set Test Time and Review" : "Set Test Time"}</h3>
                  </div>
                  <span className="admin-tests-create-chip">Final check</span>
                </div>
                <p className="admin-tests-form-footnote">
                  Set the total duration for the test. If the chosen time is too short, we will suggest the minimum
                  duration needed for the selected question set.
                </p>
                <UiFormField label="Total Test Duration (minutes)" htmlFor="admin-tests-duration-l2">
                  <input
                    id="admin-tests-duration-l2"
                    type="number"
                    min={1}
                    step={5}
                    value={draft.totalDurationMinutes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        totalDurationMinutes: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </UiFormField>
                <div className="admin-tests-validation-engine">
                  <h4>{hasL2Controls ? "Timing Check Result" : "Duration Check"}</h4>
                  {validationPassed ? <div className="admin-tests-validation-state admin-tests-validation-state-valid"><strong>Validation Passed</strong></div> : <div className="admin-tests-validation-state admin-tests-validation-state-invalid"><strong>Test Duration Too Short</strong></div>}
                  <div className="admin-tests-summary-list">
                    {hasL2Controls ? (
                      <>
                        <div><span>Raw Recommended Time</span><strong>{rawRecommendedMinutes} Minutes</strong></div>
                        <div><span>Configured Duration</span><strong>{draft.totalDurationMinutes} Minutes</strong></div>
                        {validationPassed ? (
                          <>
                            <div><span>Available Buffer</span><strong>{availableBufferMinutes} Minutes</strong></div>
                            <div><span>Buffer Allocation</span><strong>Phase 3</strong></div>
                            <div><span>P1 Acquisition</span><strong>{basePhaseTimings.acquisition} Minutes</strong></div>
                            <div><span>P2 Verification</span><strong>{basePhaseTimings.verification} Minutes</strong></div>
                            <div><span>P3 Recovery</span><strong>{basePhaseTimings.recovery} Minutes</strong></div>
                            <div><span>Phase 3 Buffer Added</span><strong>{availableBufferMinutes} Minutes</strong></div>
                            <div><span>Final P3 Time</span><strong>{finalPhaseTimings.recovery} Minutes</strong></div>
                          </>
                        ) : (
                          <>
                            <div><span>Additional Time Required</span><strong>{additionalTimeRequired} Minutes</strong></div>
                            <div><span>Recommended Minimum Duration</span><strong>{recommendedMinimumDuration} Minutes</strong></div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {hasL1Controls ? <div><span>Status</span><strong>{validationPassed ? "Configured duration is sufficient." : "Configured duration is insufficient."}</strong></div> : null}
                        <div><span>Configured Duration</span><strong>{draft.totalDurationMinutes} Minutes</strong></div>
                        {!validationPassed ? <div><span>Recommended Minimum Duration</span><strong>{recommendedMinimumDuration} Minutes</strong></div> : null}
                      </>
                    )}
                  </div>
                  {!validationPassed ? (
                    <div className="admin-tests-validation-actions">
                      <button type="button" onClick={() => setDraft((current) => ({ ...current, totalDurationMinutes: recommendedMinimumDuration }))}>
                        Use Recommended Time
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="admin-tests-step-actions">
                  <button type="button" onClick={() => setCreateFlowStep(validationBackStep)}>Back</button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveDraftTemplateFromCurrentState();
                    }}
                    disabled={isSubmitting || !validationPassed}
                  >
                    {isSubmitting ? "Saving..." : editingTemplateId ? "Save Test Changes" : "Create Test"}
                  </button>
                </div>
              </article>
            ) : null}
          </div>

          <aside className="admin-tests-create-side">
            <article className="admin-tests-step-card admin-tests-create-summary">
              <div className="admin-tests-create-section-header">
                <div>
                  <p className="admin-tests-section-kicker">Quick Summary</p>
                  <h3>Your Test So Far</h3>
                </div>
                <span className="admin-tests-create-chip">Step {currentStepIndex + 1}</span>
              </div>
              <div className="admin-tests-summary-list">
                <div><span>Current Step</span><strong>{stepItems.find((item) => item.step === createFlowStep)?.label}</strong></div>
                <div><span>Template</span><strong>{draft.templateName.trim() || "Untitled"}</strong></div>
                <div><span>Exam Type</span><strong>{draft.examType}</strong></div>
                <div><span>Question Picking</span><strong>{formatSelectionMethodLabel(draft.selectionMethod)}</strong></div>
                {createFlowStep >= 2 ? <div><span>Selected Questions</span><strong>{selectedQuestionCount}</strong></div> : null}
                {createFlowStep >= 2 ? <div><span>Difficulty Split</span><strong>{selectedDifficultyCount.easy} / {selectedDifficultyCount.medium} / {selectedDifficultyCount.hard}</strong></div> : null}
                {createFlowStep >= 3 ? <div><span>Strategy</span><strong>{activeStrategy.label}</strong></div> : null}
                {hasL2Controls && createFlowStep >= 4 ? <div><span>Phase Strategy</span><strong>{activePhaseStrategy.acquisition}% / {activePhaseStrategy.verification}% / {activePhaseStrategy.recovery}%</strong></div> : null}
                {createFlowStep >= 5 ? <div><span>Duration</span><strong>{draft.totalDurationMinutes} Minutes</strong></div> : null}
                {createFlowStep >= 5 ? <div><span>Validation</span><strong>{validationPassed ? "Passed" : "Pending"}</strong></div> : null}
              </div>
            </article>
          </aside>
        </div>
      </>
    );
  }

  function renderLibraryView() {
    return (
      <>
        <article className="admin-tests-summary-card admin-tests-detail-card">
          <h3>Find A Test Quickly</h3>
          <p>Use the main filters for day-to-day work. Open archived or retired tests only when you need older records.</p>
          <div className="admin-tests-filter-grid admin-tests-library-filter-grid">
            <UiFormField label="Search" htmlFor="admin-tests-library-filter-search">
              <input
                id="admin-tests-library-filter-search"
                type="search"
                value={templateLibraryFilters.query}
                onChange={(event) => setTemplateLibraryFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="template name, id, canonical id"
              />
            </UiFormField>
            <UiFormField label="Exam Type" htmlFor="admin-tests-library-filter-exam-type">
              <select
                id="admin-tests-library-filter-exam-type"
                value={templateLibraryFilters.examType}
                onChange={(event) => setTemplateLibraryFilters((current) => ({ ...current, examType: event.target.value }))}
              >
                {templateLibraryExamTypes.map((examType) => (
                  <option key={examType} value={examType}>
                    {examType}
                  </option>
                ))}
              </select>
            </UiFormField>
            <UiFormField label="Selection" htmlFor="admin-tests-library-filter-selection">
              <select
                id="admin-tests-library-filter-selection"
                value={templateLibraryFilters.selectionMethod}
                onChange={(event) => setTemplateLibraryFilters((current) => ({
                  ...current,
                  selectionMethod: event.target.value as TemplateLibraryFilters["selectionMethod"],
                }))}
              >
                <option value="all">all</option>
                {SELECTION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {formatSelectionMethodLabel(method)}
                  </option>
                ))}
              </select>
            </UiFormField>
            <UiFormField label="Visibility" htmlFor="admin-tests-library-filter-visibility">
              <select
                id="admin-tests-library-filter-visibility"
                value={templateLibraryFilters.visibility}
                onChange={(event) => setTemplateLibraryFilters((current) => ({
                  ...current,
                  visibility: event.target.value as TemplateLibraryFilters["visibility"],
                }))}
              >
                <option value="active">active only</option>
                <option value="all">all tests</option>
                <option value="archived">archived only</option>
                <option value="deprecated">retired only</option>
              </select>
            </UiFormField>
          </div>
          <details className="admin-tests-library-advanced-filters">
            <summary>More filters</summary>
            <div className="admin-tests-filter-grid admin-tests-library-filter-grid">
              <UiFormField label="Status" htmlFor="admin-tests-library-filter-status">
                <select
                  id="admin-tests-library-filter-status"
                  value={templateLibraryFilters.status}
                  onChange={(event) => setTemplateLibraryFilters((current) => ({
                    ...current,
                    status: event.target.value as TemplateLibraryFilters["status"],
                  }))}
                >
                  <option value="all">all</option>
                  <option value="draft">draft</option>
                  <option value="ready">ready</option>
                  <option value="assigned">used in assignments</option>
                  <option value="archived">archived</option>
                  <option value="deprecated">retired</option>
                </select>
              </UiFormField>
              <UiFormField label="HOT / WARM / COLD" htmlFor="admin-tests-library-filter-thermal">
                <select
                  id="admin-tests-library-filter-thermal"
                  value={templateLibraryFilters.thermalState}
                  onChange={(event) => setTemplateLibraryFilters((current) => ({
                    ...current,
                    thermalState: event.target.value as TemplateLibraryFilters["thermalState"],
                  }))}
                >
                  <option value="all">all</option>
                  <option value="hot">recently used</option>
                  <option value="warm">available</option>
                  <option value="cold">old / archived</option>
                </select>
              </UiFormField>
            </div>
          </details>
          <div className="admin-tests-library-filter-actions">
            <button
              type="button"
              onClick={() => {
                setTemplateLibraryFilters(INITIAL_TEMPLATE_LIBRARY_FILTERS);
                setInlineMessage("Filters cleared. Showing active tests again.");
                setErrorMessage(null);
              }}
            >
              Clear Filters
            </button>
          </div>
        </article>

        <div className="admin-question-library-table-shell">
          <div className="admin-question-library-table-header">
            <div>
              <p>Test Library</p>
              <h3>{filteredLibraryTemplates.length} tests found</h3>
            </div>
            <small>
              Open details, edit draft work, mark a test ready for assignment, or manage older tests from the row actions.
            </small>
          </div>
          <UiTable
            caption="Saved tests"
            columns={templateColumns}
            rows={filteredLibraryTemplates}
            rowKey={(row) => row.id}
            emptyStateText="No tests match these filters."
          />
        </div>
      </>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-tests-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-tests-title">Teacher Test Workspace</h2>
      <p className="admin-content-copy">
        Create tests, find saved tests quickly, and open each test’s details and analytics from one workspace.
      </p>

      <TestsWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {isLoadingTemplates ? <p className="admin-tests-inline-note">Loading template library from GET /admin/tests...</p> : null}
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      {currentSubpage === "create" ? renderCreateView() : null}
      {currentSubpage === "library" ? renderLibraryView() : null}
      {currentSubpage === "analytics" ? renderLibraryView() : null}

      <UiModal
        isOpen={Boolean(previewQuestion)}
        title={previewQuestion ? `Question Preview · ${previewQuestion.id}` : "Question Preview"}
        description={previewQuestion ? `${previewQuestion.subject} · ${previewQuestion.chapter} · ${formatDifficultyLabel(previewQuestion.difficulty)}` : undefined}
        onClose={() => {
          setQuestionPreviewId(null);
          setQuestionPreviewImageFailed(false);
        }}
      >
        {previewQuestion ? (
          <div className="admin-question-library-image-preview">
            {!questionPreviewImageFailed && previewQuestion.questionImageFile ? (
              <img
                src={previewQuestion.questionImageFile}
                alt={`Question prompt preview for ${previewQuestion.id}`}
                onError={() => setQuestionPreviewImageFailed(true)}
              />
            ) : null}
            {previewQuestion.questionImageFile && !questionPreviewImageFailed ? null : (
              <p>
                No question image is currently attached for <strong>{previewQuestion.id}</strong>. This record can still be
                selected, but the uploaded question image file is not available in the current dataset.
              </p>
            )}
            <p>{previewQuestion.prompt}</p>
          </div>
        ) : null}
      </UiModal>

      <UiModal
        isOpen={Boolean(publishTargetId)}
        title="Mark Test Ready"
        description="This moves the test from draft to ready so it can be used in assignment workflows."
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
            Confirm Mark Ready
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
