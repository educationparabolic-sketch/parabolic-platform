import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

const apiClient = getPortalApiClient("admin");

interface DifficultyBandMetric {
  difficulty: "Easy" | "Medium" | "Hard";
  questionCount: number;
  sharePercent: number;
  marksPercent: number;
  overstayPercent: number;
  guessRatePercent: number;
}

interface ChapterCoverageRecord {
  chapter: string;
  subject: string;
  questionCount: number;
  easyPercent: number;
  mediumPercent: number;
  hardPercent: number;
  marksPercent: number;
  riskImpactScore: number;
  disciplineStressIndex: number;
}

interface QuestionDistributionSnapshot {
  analyticsQuestionCount: number;
  computedAt: string;
  examType: string;
  totalQuestions: number;
  missingDifficultyWarnings: number;
  imbalanceWarnings: number;
  difficulties: DifficultyBandMetric[];
  chapters: ChapterCoverageRecord[];
}

type ExamDistributionFilter = "all" | "JEEMains" | "NEET" | "Other";

const FALLBACK_DISTRIBUTION_SNAPSHOT: QuestionDistributionSnapshot = {
  analyticsQuestionCount: 1186,
  chapters: [
    {
      chapter: "Kinematics",
      disciplineStressIndex: 38,
      easyPercent: 36,
      hardPercent: 20,
      marksPercent: 12,
      mediumPercent: 44,
      questionCount: 144,
      riskImpactScore: 42,
      subject: "Physics",
    },
    {
      chapter: "Quadratic Equations",
      disciplineStressIndex: 35,
      easyPercent: 41,
      hardPercent: 20,
      marksPercent: 11,
      mediumPercent: 39,
      questionCount: 138,
      riskImpactScore: 33,
      subject: "Mathematics",
    },
    {
      chapter: "Organic Chemistry",
      disciplineStressIndex: 43,
      easyPercent: 29,
      hardPercent: 26,
      marksPercent: 10,
      mediumPercent: 45,
      questionCount: 129,
      riskImpactScore: 48,
      subject: "Chemistry",
    },
    {
      chapter: "Thermodynamics",
      disciplineStressIndex: 54,
      easyPercent: 22,
      hardPercent: 32,
      marksPercent: 10,
      mediumPercent: 46,
      questionCount: 121,
      riskImpactScore: 58,
      subject: "Chemistry",
    },
    {
      chapter: "Electrostatics",
      disciplineStressIndex: 61,
      easyPercent: 18,
      hardPercent: 41,
      marksPercent: 9,
      mediumPercent: 41,
      questionCount: 107,
      riskImpactScore: 64,
      subject: "Physics",
    },
    {
      chapter: "Definite Integration",
      disciplineStressIndex: 49,
      easyPercent: 21,
      hardPercent: 31,
      marksPercent: 8,
      mediumPercent: 48,
      questionCount: 96,
      riskImpactScore: 55,
      subject: "Mathematics",
    },
  ],
  computedAt: "2026-05-14T00:00:00.000Z",
  difficulties: [
    {
      difficulty: "Easy",
      guessRatePercent: 18,
      marksPercent: 31,
      overstayPercent: 11,
      questionCount: 424,
      sharePercent: 34,
    },
    {
      difficulty: "Medium",
      guessRatePercent: 12,
      marksPercent: 45,
      overstayPercent: 22,
      questionCount: 537,
      sharePercent: 43,
    },
    {
      difficulty: "Hard",
      guessRatePercent: 9,
      marksPercent: 24,
      overstayPercent: 37,
      questionCount: 287,
      sharePercent: 23,
    },
  ],
  examType: "JEEMains",
  imbalanceWarnings: 2,
  missingDifficultyWarnings: 3,
  totalQuestions: 1248,
};

const FALLBACK_DISTRIBUTION_SNAPSHOTS: Record<ExamDistributionFilter, QuestionDistributionSnapshot> = {
  all: {
    ...FALLBACK_DISTRIBUTION_SNAPSHOT,
    analyticsQuestionCount: 1824,
    chapters: [
      {
        chapter: "Kinematics",
        disciplineStressIndex: 36,
        easyPercent: 39,
        hardPercent: 17,
        marksPercent: 10,
        mediumPercent: 44,
        questionCount: 188,
        riskImpactScore: 40,
        subject: "Physics",
      },
      {
        chapter: "Organic Chemistry",
        disciplineStressIndex: 41,
        easyPercent: 31,
        hardPercent: 24,
        marksPercent: 9,
        mediumPercent: 45,
        questionCount: 171,
        riskImpactScore: 46,
        subject: "Chemistry",
      },
      {
        chapter: "Quadratic Equations",
        disciplineStressIndex: 33,
        easyPercent: 42,
        hardPercent: 18,
        marksPercent: 9,
        mediumPercent: 40,
        questionCount: 166,
        riskImpactScore: 31,
        subject: "Mathematics",
      },
      {
        chapter: "Thermodynamics",
        disciplineStressIndex: 49,
        easyPercent: 25,
        hardPercent: 29,
        marksPercent: 8,
        mediumPercent: 46,
        questionCount: 154,
        riskImpactScore: 55,
        subject: "Chemistry",
      },
      {
        chapter: "Electrostatics",
        disciplineStressIndex: 57,
        easyPercent: 19,
        hardPercent: 38,
        marksPercent: 8,
        mediumPercent: 43,
        questionCount: 137,
        riskImpactScore: 61,
        subject: "Physics",
      },
      {
        chapter: "Cell Biology",
        disciplineStressIndex: 29,
        easyPercent: 47,
        hardPercent: 14,
        marksPercent: 7,
        mediumPercent: 39,
        questionCount: 132,
        riskImpactScore: 26,
        subject: "Biology",
      },
    ],
    computedAt: "2026-06-09T00:00:00.000Z",
    difficulties: [
      { difficulty: "Easy", guessRatePercent: 16, marksPercent: 34, overstayPercent: 10, questionCount: 690, sharePercent: 36 },
      { difficulty: "Medium", guessRatePercent: 11, marksPercent: 43, overstayPercent: 20, questionCount: 805, sharePercent: 42 },
      { difficulty: "Hard", guessRatePercent: 8, marksPercent: 23, overstayPercent: 34, questionCount: 425, sharePercent: 22 },
    ],
    examType: "Mixed",
    imbalanceWarnings: 3,
    missingDifficultyWarnings: 4,
    totalQuestions: 1920,
  },
  JEEMains: FALLBACK_DISTRIBUTION_SNAPSHOT,
  NEET: {
    ...FALLBACK_DISTRIBUTION_SNAPSHOT,
    analyticsQuestionCount: 964,
    chapters: [
      {
        chapter: "Human Physiology",
        disciplineStressIndex: 27,
        easyPercent: 46,
        hardPercent: 13,
        marksPercent: 14,
        mediumPercent: 41,
        questionCount: 142,
        riskImpactScore: 24,
        subject: "Biology",
      },
      {
        chapter: "Thermodynamics",
        disciplineStressIndex: 39,
        easyPercent: 29,
        hardPercent: 23,
        marksPercent: 12,
        mediumPercent: 48,
        questionCount: 124,
        riskImpactScore: 42,
        subject: "Chemistry",
      },
      {
        chapter: "Kinematics",
        disciplineStressIndex: 34,
        easyPercent: 37,
        hardPercent: 18,
        marksPercent: 11,
        mediumPercent: 45,
        questionCount: 118,
        riskImpactScore: 36,
        subject: "Physics",
      },
      {
        chapter: "Cell Biology",
        disciplineStressIndex: 25,
        easyPercent: 52,
        hardPercent: 11,
        marksPercent: 10,
        mediumPercent: 37,
        questionCount: 110,
        riskImpactScore: 21,
        subject: "Biology",
      },
      {
        chapter: "Chemical Bonding",
        disciplineStressIndex: 32,
        easyPercent: 33,
        hardPercent: 19,
        marksPercent: 9,
        mediumPercent: 48,
        questionCount: 96,
        riskImpactScore: 35,
        subject: "Chemistry",
      },
      {
        chapter: "Current Electricity",
        disciplineStressIndex: 37,
        easyPercent: 31,
        hardPercent: 24,
        marksPercent: 8,
        mediumPercent: 45,
        questionCount: 88,
        riskImpactScore: 40,
        subject: "Physics",
      },
    ],
    computedAt: "2026-06-09T00:00:00.000Z",
    difficulties: [
      { difficulty: "Easy", guessRatePercent: 14, marksPercent: 38, overstayPercent: 9, questionCount: 382, sharePercent: 41 },
      { difficulty: "Medium", guessRatePercent: 10, marksPercent: 41, overstayPercent: 17, questionCount: 365, sharePercent: 39 },
      { difficulty: "Hard", guessRatePercent: 7, marksPercent: 21, overstayPercent: 29, questionCount: 181, sharePercent: 20 },
    ],
    examType: "NEET",
    imbalanceWarnings: 2,
    missingDifficultyWarnings: 2,
    totalQuestions: 928,
  },
  Other: {
    ...FALLBACK_DISTRIBUTION_SNAPSHOT,
    analyticsQuestionCount: 186,
    chapters: [
      {
        chapter: "Number Systems",
        disciplineStressIndex: 19,
        easyPercent: 54,
        hardPercent: 9,
        marksPercent: 18,
        mediumPercent: 37,
        questionCount: 44,
        riskImpactScore: 18,
        subject: "Mathematics",
      },
      {
        chapter: "Basic Mechanics",
        disciplineStressIndex: 23,
        easyPercent: 49,
        hardPercent: 11,
        marksPercent: 15,
        mediumPercent: 40,
        questionCount: 38,
        riskImpactScore: 21,
        subject: "Physics",
      },
      {
        chapter: "General Chemistry",
        disciplineStressIndex: 27,
        easyPercent: 41,
        hardPercent: 16,
        marksPercent: 14,
        mediumPercent: 43,
        questionCount: 34,
        riskImpactScore: 28,
        subject: "Chemistry",
      },
      {
        chapter: "Reading Comprehension",
        disciplineStressIndex: 15,
        easyPercent: 58,
        hardPercent: 7,
        marksPercent: 12,
        mediumPercent: 35,
        questionCount: 29,
        riskImpactScore: 14,
        subject: "English",
      },
      {
        chapter: "Data Interpretation",
        disciplineStressIndex: 21,
        easyPercent: 45,
        hardPercent: 14,
        marksPercent: 11,
        mediumPercent: 41,
        questionCount: 27,
        riskImpactScore: 20,
        subject: "Aptitude",
      },
    ],
    computedAt: "2026-06-09T00:00:00.000Z",
    difficulties: [
      { difficulty: "Easy", guessRatePercent: 12, marksPercent: 42, overstayPercent: 8, questionCount: 88, sharePercent: 46 },
      { difficulty: "Medium", guessRatePercent: 9, marksPercent: 38, overstayPercent: 15, questionCount: 72, sharePercent: 38 },
      { difficulty: "Hard", guessRatePercent: 6, marksPercent: 20, overstayPercent: 24, questionCount: 32, sharePercent: 16 },
    ],
    examType: "Other",
    imbalanceWarnings: 1,
    missingDifficultyWarnings: 1,
    totalQuestions: 192,
  },
};

const EXAM_FILTER_OPTIONS: Array<{ value: ExamDistributionFilter; label: string }> = [
  { value: "all", label: "All Questions" },
  { value: "JEEMains", label: "JEE Mains" },
  { value: "NEET", label: "NEET" },
  { value: "Other", label: "Other Exams" },
];

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
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

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatDistributionScopeLabel(filter: ExamDistributionFilter): string {
  if (filter === "all") {
    return "All available questions";
  }

  const option = EXAM_FILTER_OPTIONS.find((entry) => entry.value === filter);
  return `${option?.label ?? filter} questions`;
}

function normalizeDifficultyMetric(value: unknown, index: number): DifficultyBandMetric | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback =
    FALLBACK_DISTRIBUTION_SNAPSHOT.difficulties[index] ??
    FALLBACK_DISTRIBUTION_SNAPSHOT.difficulties[0];
  const difficulty = record.difficulty;

  return {
    difficulty:
      difficulty === "Easy" || difficulty === "Medium" || difficulty === "Hard" ?
        difficulty :
        fallback?.difficulty ?? "Easy",
    guessRatePercent: Math.max(0, toNumberOrZero(record.guessRatePercent ?? fallback?.guessRatePercent ?? 0)),
    marksPercent: Math.max(0, toNumberOrZero(record.marksPercent ?? fallback?.marksPercent ?? 0)),
    overstayPercent: Math.max(0, toNumberOrZero(record.overstayPercent ?? fallback?.overstayPercent ?? 0)),
    questionCount: Math.max(0, toNumberOrZero(record.questionCount ?? fallback?.questionCount ?? 0)),
    sharePercent: Math.max(0, toNumberOrZero(record.sharePercent ?? fallback?.sharePercent ?? 0)),
  };
}

function normalizeChapterCoverageRecord(value: unknown, index: number): ChapterCoverageRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback =
    FALLBACK_DISTRIBUTION_SNAPSHOT.chapters[index] ??
    FALLBACK_DISTRIBUTION_SNAPSHOT.chapters[0];

  return {
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    disciplineStressIndex: Math.max(
      0,
      toNumberOrZero(record.disciplineStressIndex ?? fallback?.disciplineStressIndex ?? 0),
    ),
    easyPercent: Math.max(0, toNumberOrZero(record.easyPercent ?? fallback?.easyPercent ?? 0)),
    hardPercent: Math.max(0, toNumberOrZero(record.hardPercent ?? fallback?.hardPercent ?? 0)),
    marksPercent: Math.max(0, toNumberOrZero(record.marksPercent ?? fallback?.marksPercent ?? 0)),
    mediumPercent: Math.max(0, toNumberOrZero(record.mediumPercent ?? fallback?.mediumPercent ?? 0)),
    questionCount: Math.max(0, toNumberOrZero(record.questionCount ?? fallback?.questionCount ?? 0)),
    riskImpactScore: Math.max(0, toNumberOrZero(record.riskImpactScore ?? fallback?.riskImpactScore ?? 0)),
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
  };
}

function normalizeDistributionSnapshot(payload: unknown): QuestionDistributionSnapshot {
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/distribution returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      summary?: unknown;
    };
  };
  const summary = response.data?.summary;
  if (!summary || typeof summary !== "object") {
    throw new Error("GET /admin/questions/distribution did not include a summary payload.");
  }

  const record = summary as Record<string, unknown>;
  const difficultiesSource = Array.isArray(record.difficulties) ? record.difficulties : [];
  const chaptersSource = Array.isArray(record.chapters) ? record.chapters : [];
  const difficulties = difficultiesSource
    .map((entry, index) => normalizeDifficultyMetric(entry, index))
    .filter((entry): entry is DifficultyBandMetric => Boolean(entry));
  const chapters = chaptersSource
    .map((entry, index) => normalizeChapterCoverageRecord(entry, index))
    .filter((entry): entry is ChapterCoverageRecord => Boolean(entry));

  return {
    chapters: chapters.length > 0 ? chapters : FALLBACK_DISTRIBUTION_SNAPSHOT.chapters,
    analyticsQuestionCount: Math.max(
      0,
      toNumberOrZero(record.analyticsQuestionCount ?? FALLBACK_DISTRIBUTION_SNAPSHOT.analyticsQuestionCount),
    ),
    computedAt: toNonEmptyString(record.computedAt, FALLBACK_DISTRIBUTION_SNAPSHOT.computedAt),
    difficulties: difficulties.length > 0 ? difficulties : FALLBACK_DISTRIBUTION_SNAPSHOT.difficulties,
    examType: toNonEmptyString(record.examType, FALLBACK_DISTRIBUTION_SNAPSHOT.examType),
    imbalanceWarnings: Math.max(
      0,
      toNumberOrZero(record.imbalanceWarnings ?? FALLBACK_DISTRIBUTION_SNAPSHOT.imbalanceWarnings),
    ),
    missingDifficultyWarnings: Math.max(
      0,
      toNumberOrZero(
        record.missingDifficultyWarnings ?? FALLBACK_DISTRIBUTION_SNAPSHOT.missingDifficultyWarnings,
      ),
    ),
    totalQuestions: Math.max(0, toNumberOrZero(record.totalQuestions ?? FALLBACK_DISTRIBUTION_SNAPSHOT.totalQuestions)),
  };
}

async function fetchDistributionSnapshotFromApi(examFilter: ExamDistributionFilter): Promise<QuestionDistributionSnapshot> {
  const payload = await apiClient.get<unknown>("/admin/questions/distribution", {
    query: {
      ...(examFilter !== "all" ? { examType: examFilter } : {}),
      limit: "6",
    },
  });
  return normalizeDistributionSnapshot(payload);
}

function AdminQuestionBankDistributionPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [examFilter, setExamFilter] = useState<ExamDistributionFilter>("all");
  const [snapshot, setSnapshot] = useState<QuestionDistributionSnapshot>(FALLBACK_DISTRIBUTION_SNAPSHOTS.all);
  const [inlineMessage, setInlineMessage] = useState(
    "Choose an exam scope to review question distribution for all questions or for a specific exam bank.",
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadDistributionSnapshot(): Promise<void> {
      if (!shouldUseLiveApi()) {
        if (!isActive) {
          return;
        }

        setSnapshot(FALLBACK_DISTRIBUTION_SNAPSHOTS[examFilter]);
        setInlineMessage("Local mode detected. Showing a deterministic question-distribution view for the selected exam scope.");
        setIsLoading(false);
        return;
      }

      try {
        const nextSnapshot = await fetchDistributionSnapshotFromApi(examFilter);
        if (!isActive) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage("Live mode enabled. The distribution overview now updates to match the selected exam scope.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question distribution summary.";
        setSnapshot(FALLBACK_DISTRIBUTION_SNAPSHOTS[examFilter]);
        setInlineMessage(`${reason} Falling back to deterministic question distribution fixtures.`);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDistributionSnapshot();

    return () => {
      isActive = false;
    };
  }, [examFilter]);

  const difficultyDistributionChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.sharePercent,
      })),
    [snapshot.difficulties],
  );

  const marksDistributionChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.marksPercent,
      })),
    [snapshot.difficulties],
  );

  const overstayChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.overstayPercent,
      })),
    [snapshot.difficulties],
  );

  const guessRateChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.guessRatePercent,
      })),
    [snapshot.difficulties],
  );

  const riskImpactChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.chapters.map((entry) => ({
        label: entry.chapter,
        value: entry.riskImpactScore,
      })),
    [snapshot.chapters],
  );

  const disciplineStressChart = useMemo<UiChartPoint[]>(
    () =>
      snapshot.chapters.map((entry) => ({
        label: entry.chapter,
        value: entry.disciplineStressIndex,
      })),
    [snapshot.chapters],
  );

  const chapterColumns = useMemo<UiTableColumn<ChapterCoverageRecord>[]>(
    () => {
      const base: UiTableColumn<ChapterCoverageRecord>[] = [
        {
          id: "chapter",
          header: "Chapter",
          render: (chapter) => (
            <div className="admin-analytics-run-cell">
              <strong>{chapter.chapter}</strong>
              <small>{chapter.subject}</small>
            </div>
          ),
        },
        { id: "coverage", header: "Questions", render: (chapter) => chapter.questionCount },
        {
          id: "difficultyMix",
          header: "Easy / Medium / Hard",
          render: (chapter) =>
            `${formatPercent(chapter.easyPercent)} / ${formatPercent(chapter.mediumPercent)} / ${formatPercent(chapter.hardPercent)}`,
        },
        {
          id: "marksShare",
          header: "Marks Share",
          render: (chapter) => formatPercent(chapter.marksPercent),
        },
      ];

      if (!isL2OrAbove) {
        return base;
      }

      return [
        ...base,
        {
          id: "riskImpact",
          header: "Risk Impact",
          render: (chapter) => chapter.riskImpactScore,
        },
        {
          id: "disciplineStress",
          header: "Discipline Stress",
          render: (chapter) => chapter.disciplineStressIndex,
        },
      ];
    },
    [isL2OrAbove],
  );

  const topCoverageChapter = snapshot.chapters[0] ?? null;
  const analyticsCoveragePercent =
    snapshot.totalQuestions > 0 ? Math.round((snapshot.analyticsQuestionCount / snapshot.totalQuestions) * 100) : 0;
  const highestRiskChapter = snapshot.chapters.reduce<ChapterCoverageRecord | null>((highest, chapter) => {
    if (!highest || chapter.riskImpactScore > highest.riskImpactScore) {
      return chapter;
    }

    return highest;
  }, null);
  const difficultyMixLabel = snapshot.difficulties.map((entry) => Math.round(entry.sharePercent)).join(" / ");
  const distributionScopeLabel = formatDistributionScopeLabel(examFilter);

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-distribution-title">
      <p className="admin-content-eyebrow">Question Bank Distribution</p>
      <h2 id="admin-question-bank-distribution-title">Question Bank Distribution Overview</h2>
      <p className="admin-content-copy">
        Review how questions are spread across difficulty, marks, and chapters, and see which areas may need content
        review at L0, L1, and L2.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-analytics-inline-note">{inlineMessage}</p>
      {isLoading ? <p className="admin-analytics-inline-note">Loading question distribution from GET /admin/questions/distribution...</p> : null}

      <div
        className="admin-analytics-filter-grid admin-question-distribution-filter-grid"
        role="group"
        aria-label="Question distribution filters"
      >
        <label>
          Exam Scope
          <select value={examFilter} onChange={(event) => setExamFilter(event.target.value as ExamDistributionFilter)}>
            {EXAM_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Question Bank Distribution Summary</h3>
          <p>
            Snapshot updated {formatIsoDate(snapshot.computedAt)} · {snapshot.totalQuestions} tracked questions
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">Scope: {distributionScopeLabel}</div>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-distribution-l0-title">
        <div className="admin-question-distribution-layer-header">
          <div>
            <p className="admin-content-eyebrow">L0 Content Balance</p>
            <h3 id="admin-question-bank-distribution-l0-title">Foundation Distribution View</h3>
          </div>
          <small>Use L0 to review overall content balance before looking at diagnostic or advanced signals.</small>
        </div>

        <div className="admin-analytics-kpi-grid">
          <article className="admin-analytics-kpi-card">
            <p>Total Questions</p>
            <h3>{snapshot.totalQuestions}</h3>
            <small>tracked in this overview</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Difficulty Balance</p>
            <h3>{difficultyMixLabel}</h3>
            <small>easy / medium / hard share</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Missing Difficulty</p>
            <h3>{snapshot.missingDifficultyWarnings}</h3>
            <small>questions still needing difficulty cleanup</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Imbalance Warnings</p>
            <h3>{snapshot.imbalanceWarnings}</h3>
            <small>chapter or marks skew detected</small>
          </article>
        </div>

        <div className="admin-analytics-compliance-panel">
          <article className="admin-risk-summary-card">
            <h4>L0 Overview</h4>
            <p>
              This current snapshot covers {distributionScopeLabel.toLowerCase()} with overall difficulty balance and
              marks share ready for quick review.
            </p>
            <small>Start here before reviewing deeper diagnostic layers.</small>
          </article>
          <article className="admin-risk-summary-card">
            <h4>Chapter Coverage</h4>
            <p>
              {topCoverageChapter ?
                `${topCoverageChapter.chapter} currently carries the widest retained chapter coverage.` :
                "No retained chapter coverage records are available yet."}
            </p>
            <small>Useful for overall library balance and chapter spread review.</small>
          </article>
          <article className="admin-risk-summary-card">
            <h4>Analytics Coverage</h4>
            <p>
              {analyticsCoveragePercent}% of tracked questions currently have summary-backed analytics coverage in this
              overview layer.
            </p>
            <small>{snapshot.analyticsQuestionCount} of {snapshot.totalQuestions} questions are covered in the current summary set.</small>
          </article>
        </div>

        <div className="admin-analytics-chart-grid">
          <UiChartContainer
            title="Difficulty Distribution"
            subtitle="Global easy, medium, and hard coverage"
            data={difficultyDistributionChart}
            maxValue={100}
          />
          <UiChartContainer
            title="Marks Distribution"
            subtitle="Marks share by difficulty band"
            data={marksDistributionChart}
            maxValue={100}
          />
        </div>

        <UiTable
          caption="Question bank chapter coverage and balance"
          columns={chapterColumns.slice(0, 4)}
          rows={snapshot.chapters}
          rowKey={(row) => `${row.subject}-${row.chapter}`}
          emptyStateText="No chapter distribution records are available."
        />
      </section>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-distribution-l1-title">
        <div className="admin-question-distribution-layer-header">
          <div>
            <p className="admin-content-eyebrow">L1 Diagnostic Patterns</p>
            <h3 id="admin-question-bank-distribution-l1-title">Content Diagnostic Review</h3>
          </div>
          <small>Use L1 to see where question-bank structure may be creating strain before it becomes a deeper risk signal.</small>
        </div>

        <div className="admin-analytics-compliance-panel">
          <article className="admin-risk-summary-card">
            <h4>Overstay Pattern</h4>
            <p>
              Harder bands are more likely to generate overstay, which helps identify whether the question bank is
              placing too much time pressure in certain difficulty ranges.
            </p>
            <small>L1 focuses on content-quality strain rather than full risk interpretation.</small>
          </article>
          <article className="admin-risk-summary-card">
            <h4>Coverage Gaps</h4>
            <p>
              Missing difficulty warnings and imbalance warnings should be treated as question-bank cleanup signals,
              especially before new template creation.
            </p>
            <small>Use these warnings to review chapter spread and content placement.</small>
          </article>
        </div>

        <div className="admin-analytics-chart-grid">
          <UiChartContainer
            title="Overstay Frequency"
            subtitle="Overstay rate by difficulty band"
            data={overstayChart}
            maxValue={100}
          />
        </div>
      </section>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-distribution-l2-title">
        <div className="admin-question-distribution-layer-header">
          <div>
            <p className="admin-content-eyebrow">L2 Advanced Impact</p>
            <h3 id="admin-question-bank-distribution-l2-title">Execution And Risk Review</h3>
          </div>
          <small>Use L2 to review guess-heavy usage, chapter risk contribution, and discipline-sensitive chapter load.</small>
        </div>

        {isL2OrAbove ? (
          <>
            <div className="admin-analytics-compliance-panel">
              <article className="admin-risk-summary-card">
                <h4>Guess Pressure</h4>
                <p>
                  Guess rate by difficulty helps show where the question bank may be producing weaker confidence and more
                  non-committed attempts.
                </p>
                <small>L2 advanced usage signal</small>
              </article>
              <article className="admin-risk-summary-card">
                <h4>Risk Impact</h4>
                <p>
                  {highestRiskChapter ?
                    `${highestRiskChapter.chapter} currently carries the sharpest risk-impact footprint in the summary.` :
                    "Risk-impact analytics will appear once summary records are available."}
                </p>
                <small>L2 chapter-level impact view</small>
              </article>
              <article className="admin-risk-summary-card">
                <h4>Discipline Stress</h4>
                <p>Discipline stress highlights which chapters are contributing most to downstream execution strain.</p>
                <small>L2 advanced chapter stress metric</small>
              </article>
            </div>

            <div className="admin-analytics-chart-grid">
              <UiChartContainer
                title="Guess Rate"
                subtitle="Guess rate by difficulty"
                data={guessRateChart}
                maxValue={100}
              />
              <UiChartContainer
                title="Risk Impact Per Chapter"
                subtitle="Precomputed chapter-level risk contribution"
                data={riskImpactChart}
                maxValue={100}
                variant="line"
              />
              <UiChartContainer
                title="Discipline Stress"
                subtitle="Precomputed chapter-level discipline load"
                data={disciplineStressChart}
                maxValue={100}
                variant="line"
              />
            </div>

            <UiTable
              caption="Advanced chapter-level impact view"
              columns={chapterColumns}
              rows={snapshot.chapters}
              rowKey={(row) => `${row.subject}-${row.chapter}`}
              emptyStateText="No chapter distribution records are available."
            />
          </>
        ) : (
          <div className="admin-analytics-compliance-panel">
            <article className="admin-risk-summary-card">
              <h4>L2 Locked</h4>
              <p>Guess rate, risk impact, and discipline stress unlock at <strong>L2</strong>.</p>
              <small>Current layer: {accessContext.licenseLayer ?? "L0"}</small>
            </article>
          </div>
        )}
      </section>
    </section>
  );
}

export default AdminQuestionBankDistributionPage;
