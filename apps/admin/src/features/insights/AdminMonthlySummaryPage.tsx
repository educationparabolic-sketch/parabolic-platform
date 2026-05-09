import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  shouldUseLiveApi,
  type DashboardDataset,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

interface MonthlySummaryAccessRow {
  id: string;
  entityLabel: string;
  monthLabel: string;
  generatedAt: string;
  advisorySummary: string;
}

function buildStudentAdvisorySummary(student: StudentYearMetricRecord): string {
  if (student.guessRatePercent >= 30) {
    return "Guess-rate is elevated. Reinforce structured pacing and easy-to-hard sequencing.";
  }
  if (student.disciplineIndex <= 50) {
    return "Discipline consistency is below target. Recommend phased practice with monitored transitions.";
  }
  if (student.guessRatePercent <= 15 && student.disciplineIndex >= 70) {
    return "Execution behavior is stable. Continue current preparation pattern with periodic diagnostics.";
  }
  return "Behavior is mixed. Focus on reducing rushed attempts while preserving accuracy discipline.";
}

function buildMonthlySummaryRows(dataset: DashboardDataset): MonthlySummaryAccessRow[] {
  const monthLabel = formatIsoDate(dataset.yearBehaviorSummary.computedAt).slice(0, 7);
  const cohortSummary: MonthlySummaryAccessRow = {
    id: "cohort",
    entityLabel: "Batch Cohort",
    monthLabel,
    generatedAt: dataset.yearBehaviorSummary.computedAt,
    advisorySummary:
      "Cohort summary highlights pacing drift and guess clusters. Guidance remains advisory and should be reviewed by faculty.",
  };

  const studentSummaries = dataset.studentYearMetrics
    .slice()
    .sort((left, right) => right.guessRatePercent - left.guessRatePercent)
    .slice(0, 2)
    .map<MonthlySummaryAccessRow>((student) => ({
      id: student.studentId,
      entityLabel: student.studentName,
      monthLabel,
      generatedAt: dataset.yearBehaviorSummary.computedAt,
      advisorySummary: buildStudentAdvisorySummary(student),
    }));

  return [cohortSummary, ...studentSummaries];
}

function AdminMonthlySummaryPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [selectedMonthlySummaryId, setSelectedMonthlySummaryId] = useState<string>("cohort");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic summary fixtures for the dedicated AI monthly summary workspace.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: monthly summary access hydrated from summary-safe analytics payloads.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load monthly summary access.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 121 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const monthlySummaryRows = useMemo(() => buildMonthlySummaryRows(dataset), [dataset]);
  const selectedMonthlySummary = useMemo(
    () => monthlySummaryRows.find((summary) => summary.id === selectedMonthlySummaryId) ?? monthlySummaryRows[0] ?? null,
    [monthlySummaryRows, selectedMonthlySummaryId],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-monthly-summary-title">
      <p className="admin-content-eyebrow">Insights Workspace</p>
      <h2 id="admin-monthly-summary-title">Dedicated AI Monthly Summary Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates monthly summary access instead of leaving that drill-down embedded inside the
        shared risk-insights screen.
      </p>
      <p className="admin-content-copy">
        Summaries remain cached advisory outputs generated from structured, summary-safe metrics only. They are not
        regenerated on dashboard load.
      </p>

      <InsightsWorkspaceNav />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading AI monthly summaries..." : inlineMessage ?? "AI monthly summary workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Academic year: {dataset.yearBehaviorSummary.academicYear}.
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Cached Summaries</p>
          <h3>{monthlySummaryRows.length}</h3>
          <small>Monthly access points currently surfaced</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Latest Snapshot</p>
          <h3>{formatIsoDate(dataset.yearBehaviorSummary.computedAt)}</h3>
          <small>Summary generation month anchor</small>
        </article>
      </div>

      <div className="admin-risk-summary-row">
        {monthlySummaryRows.map((summary) => (
          <button
            key={summary.id}
            type="button"
            className={`admin-risk-summary-button ${selectedMonthlySummary?.id === summary.id ? "is-active" : ""}`}
            onClick={() => {
              setSelectedMonthlySummaryId(summary.id);
            }}
          >
            {summary.entityLabel} ({summary.monthLabel})
          </button>
        ))}
      </div>

      {selectedMonthlySummary ? (
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Selected Summary</p>
          <h4>{selectedMonthlySummary.entityLabel}</h4>
          <p>{selectedMonthlySummary.advisorySummary}</p>
          <small>Generated: {formatIsoDate(selectedMonthlySummary.generatedAt)}</small>
        </article>
      ) : null}
    </section>
  );
}

export default AdminMonthlySummaryPage;
