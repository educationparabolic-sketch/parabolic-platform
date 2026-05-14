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
  computedAt: string;
  examType: string;
  totalQuestions: number;
  missingDifficultyWarnings: number;
  imbalanceWarnings: number;
  difficulties: DifficultyBandMetric[];
  chapters: ChapterCoverageRecord[];
}

const FALLBACK_DISTRIBUTION_SNAPSHOT: QuestionDistributionSnapshot = {
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

async function fetchDistributionSnapshotFromApi(): Promise<QuestionDistributionSnapshot> {
  const payload = await apiClient.get<unknown>("/admin/questions/distribution", {
    query: {
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
  const [snapshot, setSnapshot] = useState<QuestionDistributionSnapshot>(FALLBACK_DISTRIBUTION_SNAPSHOT);
  const [inlineMessage, setInlineMessage] = useState(
    "Question distribution now has a dedicated mounted workspace with precomputed difficulty, chapter, and marks summaries.",
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadDistributionSnapshot(): Promise<void> {
      if (!shouldUseLiveApi()) {
        if (!isActive) {
          return;
        }

        setSnapshot(FALLBACK_DISTRIBUTION_SNAPSHOT);
        setInlineMessage("Local mode detected. Loaded deterministic question distribution fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextSnapshot = await fetchDistributionSnapshotFromApi();
        if (!isActive) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage("Live mode enabled: question distribution hydrated from GET /admin/questions/distribution.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question distribution summary.";
        setSnapshot(FALLBACK_DISTRIBUTION_SNAPSHOT);
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
  }, []);

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
  const highestRiskChapter = snapshot.chapters.reduce<ChapterCoverageRecord | null>((highest, chapter) => {
    if (!highest || chapter.riskImpactScore > highest.riskImpactScore) {
      return chapter;
    }

    return highest;
  }, null);
  const difficultyMixLabel = snapshot.difficulties.map((entry) => Math.round(entry.sharePercent)).join(" / ");

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-distribution-title">
      <p className="admin-content-eyebrow">Question Bank Distribution</p>
      <h2 id="admin-question-bank-distribution-title">Dedicated Distribution Overview Workspace</h2>
      <p className="admin-content-copy">
        This route keeps <code>/admin/question-bank/distribution</code> focused on precomputed
        <code> questionAnalytics</code> style summaries for difficulty balance, chapter coverage, and marks mix instead
        of leaving those analytics merged into upload or library workflows.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-analytics-inline-note">{inlineMessage}</p>
      {isLoading ? <p className="admin-analytics-inline-note">Loading question distribution from GET /admin/questions/distribution...</p> : null}

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{snapshot.examType} Distribution Summary</h3>
          <p>
            Snapshot updated {formatIsoDate(snapshot.computedAt)} · {snapshot.totalQuestions} tracked questions
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">questionAnalytics summary</div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Total Questions</p>
          <h3>{snapshot.totalQuestions}</h3>
          <small>distribution-ready inventory</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Easy / Medium / Hard</p>
          <h3>{difficultyMixLabel}</h3>
          <small>global difficulty share</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Missing Difficulty Warnings</p>
          <h3>{snapshot.missingDifficultyWarnings}</h3>
          <small>content hygiene follow-up</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Imbalance Warnings</p>
          <h3>{snapshot.imbalanceWarnings}</h3>
          <small>chapter or marks skew detected</small>
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
        {isL2OrAbove ? (
          <>
            <UiChartContainer
              title="Overstay Frequency"
              subtitle="Overstay rate by difficulty"
              data={overstayChart}
              maxValue={100}
            />
            <UiChartContainer
              title="Guess Rate"
              subtitle="Guess rate by difficulty"
              data={guessRateChart}
              maxValue={100}
            />
          </>
        ) : null}
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>L0 Distribution View</h4>
          <p>
            {snapshot.examType} currently spans {snapshot.totalQuestions} retained questions with
            {" "}{snapshot.missingDifficultyWarnings} difficulty hygiene follow-ups still visible in the summary layer.
          </p>
          <small>Global balance without raw-session reads</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Chapter Coverage</h4>
          <p>
            {topCoverageChapter ?
              `${topCoverageChapter.chapter} carries the widest retained coverage, while marks share and difficulty mix stay visible for rapid review.` :
              "No retained chapter coverage records are available yet."}
          </p>
          <small>Useful for pre-import and template-balance review</small>
        </article>
        {isL2OrAbove ? (
          <article className="admin-risk-summary-card">
            <h4>L2 Risk Impact</h4>
            <p>
              {highestRiskChapter ?
                `${highestRiskChapter.chapter} currently carries the sharpest risk-impact footprint in the live summary.` :
                "Risk-impact analytics will appear once questionAnalytics records are available."}
            </p>
            <small>Advanced chapter stress metrics unlock at L2+</small>
          </article>
        ) : (
          <article className="admin-risk-summary-card">
            <h4>L2 Locked</h4>
            <p>Overstay frequency, guess rate, risk impact, and discipline stress unlock at <strong>L2</strong>.</p>
            <small>Current layer: {accessContext.licenseLayer ?? "L0"}</small>
          </article>
        )}
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-distribution-chapters-title">
        <h3 id="admin-question-bank-distribution-chapters-title">Chapter Coverage Heatmap Table</h3>
        <UiTable
          caption="Question bank chapter coverage and balance"
          columns={chapterColumns}
          rows={snapshot.chapters}
          rowKey={(row) => `${row.subject}-${row.chapter}`}
          emptyStateText="No chapter distribution records are available."
        />
      </section>

      {isL2OrAbove ? (
        <div className="admin-analytics-chart-grid">
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
      ) : null}
    </section>
  );
}

export default AdminQuestionBankDistributionPage;
