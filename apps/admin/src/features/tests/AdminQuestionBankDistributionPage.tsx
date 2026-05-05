import { useMemo } from "react";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

interface DifficultyBandMetric {
  difficulty: "Easy" | "Medium" | "Hard";
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
  academicYear: string;
  examType: string;
  totalQuestions: number;
  missingDifficultyWarnings: number;
  imbalanceWarnings: number;
  difficulties: DifficultyBandMetric[];
  chapters: ChapterCoverageRecord[];
}

const DISTRIBUTION_SNAPSHOT: QuestionDistributionSnapshot = {
  academicYear: "2026",
  examType: "JEEMains",
  totalQuestions: 1248,
  missingDifficultyWarnings: 3,
  imbalanceWarnings: 2,
  difficulties: [
    {
      difficulty: "Easy",
      sharePercent: 34,
      marksPercent: 31,
      overstayPercent: 11,
      guessRatePercent: 18,
    },
    {
      difficulty: "Medium",
      sharePercent: 43,
      marksPercent: 45,
      overstayPercent: 22,
      guessRatePercent: 12,
    },
    {
      difficulty: "Hard",
      sharePercent: 23,
      marksPercent: 24,
      overstayPercent: 37,
      guessRatePercent: 9,
    },
  ],
  chapters: [
    {
      chapter: "Kinematics",
      subject: "Physics",
      questionCount: 144,
      easyPercent: 36,
      mediumPercent: 44,
      hardPercent: 20,
      marksPercent: 12,
      riskImpactScore: 42,
      disciplineStressIndex: 38,
    },
    {
      chapter: "Thermodynamics",
      subject: "Chemistry",
      questionCount: 121,
      easyPercent: 22,
      mediumPercent: 46,
      hardPercent: 32,
      marksPercent: 10,
      riskImpactScore: 58,
      disciplineStressIndex: 54,
    },
    {
      chapter: "Quadratic Equations",
      subject: "Mathematics",
      questionCount: 138,
      easyPercent: 41,
      mediumPercent: 39,
      hardPercent: 20,
      marksPercent: 11,
      riskImpactScore: 33,
      disciplineStressIndex: 35,
    },
    {
      chapter: "Electrostatics",
      subject: "Physics",
      questionCount: 107,
      easyPercent: 18,
      mediumPercent: 41,
      hardPercent: 41,
      marksPercent: 9,
      riskImpactScore: 64,
      disciplineStressIndex: 61,
    },
    {
      chapter: "Organic Chemistry",
      subject: "Chemistry",
      questionCount: 129,
      easyPercent: 29,
      mediumPercent: 45,
      hardPercent: 26,
      marksPercent: 10,
      riskImpactScore: 48,
      disciplineStressIndex: 43,
    },
    {
      chapter: "Definite Integration",
      subject: "Mathematics",
      questionCount: 96,
      easyPercent: 21,
      mediumPercent: 48,
      hardPercent: 31,
      marksPercent: 8,
      riskImpactScore: 55,
      disciplineStressIndex: 49,
    },
  ],
};

function formatPercent(value: number): string {
  return `${value}%`;
}

function AdminQuestionBankDistributionPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const difficultyDistributionChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.sharePercent,
      })),
    [],
  );

  const marksDistributionChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.marksPercent,
      })),
    [],
  );

  const overstayChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.overstayPercent,
      })),
    [],
  );

  const guessRateChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.difficulties.map((entry) => ({
        label: entry.difficulty,
        value: entry.guessRatePercent,
      })),
    [],
  );

  const riskImpactChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.chapters.map((entry) => ({
        label: entry.chapter,
        value: entry.riskImpactScore,
      })),
    [],
  );

  const disciplineStressChart = useMemo<UiChartPoint[]>(
    () =>
      DISTRIBUTION_SNAPSHOT.chapters.map((entry) => ({
        label: entry.chapter,
        value: entry.disciplineStressIndex,
      })),
    [],
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

      <p className="admin-analytics-inline-note">
        Summary-safe distribution fixtures are loaded for this dedicated workspace. Advanced risk-impact analytics unlock at <strong>L2</strong>.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{DISTRIBUTION_SNAPSHOT.examType} Distribution Summary</h3>
          <p>
            {DISTRIBUTION_SNAPSHOT.academicYear} academic year · {DISTRIBUTION_SNAPSHOT.totalQuestions} tracked questions
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">questionAnalytics summary</div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Total Questions</p>
          <h3>{DISTRIBUTION_SNAPSHOT.totalQuestions}</h3>
          <small>distribution-ready inventory</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Easy / Medium / Hard</p>
          <h3>34 / 43 / 23</h3>
          <small>global difficulty share</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Missing Difficulty Warnings</p>
          <h3>{DISTRIBUTION_SNAPSHOT.missingDifficultyWarnings}</h3>
          <small>content hygiene follow-up</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Imbalance Warnings</p>
          <h3>{DISTRIBUTION_SNAPSHOT.imbalanceWarnings}</h3>
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
            The current bank leans medium-heavy, with marks share closely mirroring question mix while still surfacing
            three missing-difficulty warnings for cleanup.
          </p>
          <small>Global balance without raw-session reads</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Chapter Coverage</h4>
          <p>
            Kinematics and Quadratic Equations are broad-coverage chapters, while Electrostatics carries the sharpest
            hard-question concentration.
          </p>
          <small>Useful for pre-import and template-balance review</small>
        </article>
        {isL2OrAbove ? (
          <article className="admin-risk-summary-card">
            <h4>L2 Risk Impact</h4>
            <p>
              Electrostatics and Thermodynamics show the highest risk-impact and discipline-stress scores, making them
              the first candidates for structural review.
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
          rows={DISTRIBUTION_SNAPSHOT.chapters}
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
