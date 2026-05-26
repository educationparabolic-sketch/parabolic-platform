import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  DEFAULT_STUDENT_INTELLIGENCE_ID,
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
  entityType: "Batch" | "Student";
  monthLabel: string;
  generatedAt: string;
  cachePath: string;
  generationMode: "End-of-month schedule" | "Manual refresh";
  status: "Cached" | "Refresh requested";
  tokenBudget: string;
  advisorySummary: string;
}

interface MonthlySummaryLifecycleStep {
  title: string;
  detail: string;
}

interface MonthlySummaryPolicyCard {
  title: string;
  value: string;
  helper: string;
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
    entityType: "Batch",
    monthLabel,
    generatedAt: dataset.yearBehaviorSummary.computedAt,
    cachePath: `aiMonthlySummary/${dataset.yearBehaviorSummary.academicYear}/batch-cohort`,
    generationMode: "End-of-month schedule",
    status: "Cached",
    tokenBudget: "Under 250 words",
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
      entityType: "Student",
      monthLabel,
      generatedAt: dataset.yearBehaviorSummary.computedAt,
      cachePath: `aiMonthlySummary/${dataset.yearBehaviorSummary.academicYear}/${student.studentId}`,
      generationMode: "Manual refresh",
      status: "Cached",
      tokenBudget: "Under 250 words",
      advisorySummary: buildStudentAdvisorySummary(student),
    }));

  return [cohortSummary, ...studentSummaries];
}

function buildStructuredSummaryPreview(dataset: DashboardDataset) {
  const latestMonthlySummary = dataset.monthlySummary[dataset.monthlySummary.length - 1] ?? null;

  return {
    avgRawPercent: latestMonthlySummary?.avgRawScorePercent ?? 0,
    avgAccuracyPercent: latestMonthlySummary?.avgAccuracyPercent ?? 0,
    phaseAdherence: latestMonthlySummary?.phaseAdherencePercent ?? 0,
    easyNeglectPercent: latestMonthlySummary?.easyNeglectPercent ?? 0,
    riskDistribution: dataset.yearBehaviorSummary.riskStateDistribution,
    disciplineIndex: dataset.yearBehaviorSummary.avgDisciplineIndex,
    controlledDelta: latestMonthlySummary?.controlledModeEffectivenessPercent ?? 0,
    trendDirection:
      (latestMonthlySummary?.stabilityTrajectoryPercent ?? 0) >= dataset.yearBehaviorSummary.executionStabilityIndex
        ? "improving"
        : "watch",
  };
}

const monthlySummaryLifecycleSteps: MonthlySummaryLifecycleStep[] = [
  {
    title: "1. Prepare summary JSON",
    detail: "Use monthlySummary, yearBehaviorSummary, and studentYearMetrics fields only. Raw sessions never enter the prompt.",
  },
  {
    title: "2. Generate on schedule or request",
    detail: "Run at month end, or when an operator explicitly uses Generate Summary / Manual Refresh.",
  },
  {
    title: "3. Cache advisory output",
    detail: "Store the response under aiMonthlySummary/{academicYear}/{entityId}; dashboard loads read the cache only.",
  },
  {
    title: "4. Review before action",
    detail: "Keep the tone constructive and route any intervention or assignment decision through existing faculty workflows.",
  },
];

const monthlySummaryPolicyCards: MonthlySummaryPolicyCard[] = [
  {
    title: "Prompt",
    value: "Fixed system prompt",
    helper: "Constructive academic summary, positive reinforcement, no negative emotional language.",
  },
  {
    title: "Temperature",
    value: "0.3",
    helper: "Low variance generation for repeatable advisory language.",
  },
  {
    title: "Max Output",
    value: "<= 250 words",
    helper: "Capped response length keeps cost and review time predictable.",
  },
  {
    title: "Regeneration",
    value: "Manual only",
    helper: "No LLM call occurs on dashboard load or routine cache reads.",
  },
];

function AdminMonthlySummaryPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [selectedMonthlySummaryId, setSelectedMonthlySummaryId] = useState<string>("cohort");
  const [refreshRequestedSummaryId, setRefreshRequestedSummaryId] = useState<string | null>(null);

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
  const studentRouteTarget = useMemo(
    () => dataset.studentYearMetrics[0]?.studentId ?? DEFAULT_STUDENT_INTELLIGENCE_ID,
    [dataset.studentYearMetrics],
  );
  const selectedMonthlySummary = useMemo(
    () => monthlySummaryRows.find((summary) => summary.id === selectedMonthlySummaryId) ?? monthlySummaryRows[0] ?? null,
    [monthlySummaryRows, selectedMonthlySummaryId],
  );
  const structuredSummaryPreview = useMemo(() => buildStructuredSummaryPreview(dataset), [dataset]);
  const lifecycleRegister = useMemo(
    () =>
      monthlySummaryRows.map((summary) => ({
        ...summary,
        status: refreshRequestedSummaryId === summary.id ? "Refresh requested" : summary.status,
        generationMode: refreshRequestedSummaryId === summary.id ? "Manual refresh" : summary.generationMode,
      })),
    [monthlySummaryRows, refreshRequestedSummaryId],
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

      <InsightsWorkspaceNav studentRouteTarget={studentRouteTarget} />

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
          <p>Generation Trigger</p>
          <h3>Monthly</h3>
          <small>End of month, or manual request only</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Latest Snapshot</p>
          <h3>{formatIsoDate(dataset.yearBehaviorSummary.computedAt)}</h3>
          <small>Summary generation month anchor</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Source Boundary</p>
          <h3>Small JSON</h3>
          <small>No raw sessions or question logs are sent</small>
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
          <small>Cache: {selectedMonthlySummary.cachePath}</small>
          <div className="admin-risk-summary-row">
            <button
              type="button"
              className="admin-risk-summary-button"
              onClick={() => {
                setRefreshRequestedSummaryId(selectedMonthlySummary.id);
                setInlineMessage(
                  `Manual refresh queued for ${selectedMonthlySummary.entityLabel}. The next backend worker should regenerate and replace the cached aiMonthlySummary record.`,
                );
              }}
            >
              Manual Refresh
            </button>
            <button
              type="button"
              className="admin-risk-summary-button"
              onClick={() => {
                setRefreshRequestedSummaryId(selectedMonthlySummary.id);
                setInlineMessage(
                  `Generate Summary requested for ${selectedMonthlySummary.entityLabel}. This is an explicit operator action, not a dashboard-load regeneration.`,
                );
              }}
            >
              Generate Summary
            </button>
          </div>
        </article>
      ) : null}

      <div className="admin-risk-table-section">
        <h3>Generation Workflow</h3>
        <div className="admin-risk-signal-grid">
          {monthlySummaryLifecycleSteps.map((step) => (
            <article key={step.title} className="admin-risk-signal-card">
              <p>{step.title}</p>
              <small>{step.detail}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Cost Control Contract</h3>
        <div className="admin-analytics-kpi-grid">
          {monthlySummaryPolicyCards.map((card) => (
            <article key={card.title} className="admin-analytics-kpi-card">
              <p>{card.title}</p>
              <h3>{card.value}</h3>
              <small>{card.helper}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Structured JSON Input Preview</h3>
        <article className="admin-risk-summary-card">
          <p>
            The prompt receives this compact monthly object rather than raw attempts, session event streams, or
            per-question logs.
          </p>
          <pre>{JSON.stringify(structuredSummaryPreview, null, 2)}</pre>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Cache Register</h3>
        <div className="admin-risk-heatmap-shell">
          <table className="admin-risk-heatmap-table">
            <caption>AI monthly summary generation and cache lifecycle</caption>
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Type</th>
                <th scope="col">Month</th>
                <th scope="col">Trigger</th>
                <th scope="col">Status</th>
                <th scope="col">Cache Path</th>
                <th scope="col">Output Cap</th>
              </tr>
            </thead>
            <tbody>
              {lifecycleRegister.map((summary) => (
                <tr key={summary.id}>
                  <td>{summary.entityLabel}</td>
                  <td>{summary.entityType}</td>
                  <td>{summary.monthLabel}</td>
                  <td>{summary.generationMode}</td>
                  <td>{summary.status}</td>
                  <td>
                    <code>{summary.cachePath}</code>
                  </td>
                  <td>{summary.tokenBudget}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AdminMonthlySummaryPage;
