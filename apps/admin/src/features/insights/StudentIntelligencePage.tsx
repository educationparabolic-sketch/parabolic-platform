import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type StudentAnalyticsRecord,
} from "../analytics/analyticsDataset";
import {
  buildHighRiskCandidates,
  listInterventionActions,
  type HighRiskInterventionCandidate,
  type InterventionActionRecord,
} from "./interventionDataset";

const INTERVENTION_INSTITUTE_ID = "inst-build-124";
const INTERVENTION_YEAR_ID = "2026";

interface BehaviorCard {
  label: string;
  value: string;
  helper: string;
}

function riskClusterText(value: StudentAnalyticsRecord["rollingRiskCluster"]): string {
  if (value === "critical") {
    return "Critical";
  }
  if (value === "high") {
    return "High";
  }
  if (value === "medium") {
    return "Medium";
  }
  return "Low";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function StudentIntelligencePage() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [interventionHistory, setInterventionHistory] = useState<InterventionActionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const [nextDataset, nextHistory] = await Promise.all([
          shouldUseLiveApi() ? fetchDashboardDataset() : Promise.resolve(FALLBACK_DATASET),
          listInterventionActions({
            instituteId: INTERVENTION_INSTITUTE_ID,
            studentId,
            yearId: INTERVENTION_YEAR_ID,
          }),
        ]);

        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInterventionHistory(nextHistory);
        setInlineMessage(
          shouldUseLiveApi() ?
            "Live mode enabled: student intelligence hydrated from summary-safe analytics and intervention history APIs." :
            "Local mode detected. Loaded deterministic student intelligence and intervention history fixtures.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student intelligence.";
        setDataset(FALLBACK_DATASET);
        setInterventionHistory([]);
        setInlineMessage(`${reason} Falling back to deterministic student intelligence fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  const student = useMemo(
    () => dataset.studentAnalytics.find((entry) => entry.studentId === studentId) ?? null,
    [dataset.studentAnalytics, studentId],
  );

  const studentSummary = useMemo(
    () => dataset.studentYearMetrics.find((entry) => entry.studentId === studentId) ?? null,
    [dataset.studentYearMetrics, studentId],
  );

  const highRiskCandidate = useMemo<HighRiskInterventionCandidate | null>(
    () => buildHighRiskCandidates(dataset).find((entry) => entry.studentId === studentId) ?? null,
    [dataset, studentId],
  );

  const alternativeStudents = useMemo(
    () => dataset.studentAnalytics.slice(0, 6),
    [dataset.studentAnalytics],
  );

  const behaviorCards = useMemo<BehaviorCard[]>(() => {
    if (!student) {
      return [];
    }

    return [
      {
        label: "Rushed Pattern",
        value: `${Math.max(0, Math.round(100 - student.phaseAdherencePercent))}%`,
        helper: "Derived from rolling phase adherence over the recent summary window.",
      },
      {
        label: "Easy Neglect",
        value: formatPercent(student.easyNeglectPercent),
        helper: "Behavioral signal from studentYearMetrics snapshots.",
      },
      {
        label: "Hard Bias",
        value: formatPercent(student.hardBiasPercent),
        helper: "Difficulty-order preference trend across recent runs.",
      },
      {
        label: "Topic Weakness",
        value: student.topicWeaknessSummary,
        helper: "Summary-safe weakness interpretation without raw session scans.",
      },
      {
        label: "Time Misallocation",
        value: formatPercent(student.timeMisallocationPercent),
        helper: "Rolling timing inefficiency from recent summary runs.",
      },
    ];
  }, [student]);

  const studentGuessTrend = useMemo(
    () => student?.runSummaries.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.guessRatePercent })).reverse() ?? [],
    [student],
  );

  const studentPacingTrend = useMemo(
    () => student?.runSummaries.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.phaseAdherencePercent })).reverse() ?? [],
    [student],
  );

  const executionProfileSummary = useMemo(() => {
    if (!student) {
      return [];
    }

    const runCount = Math.max(1, student.runSummaries.length);
    const elevatedGuessRuns = student.runSummaries.filter((run) => run.guessRatePercent >= student.guessRatePercent).length;
    const overstayRuns = student.runSummaries.filter((run) => run.overstayPercent >= 15).length;

    return [
      `${student.studentName} performs ${formatPercent(Math.abs(student.controlledModeDelta))} ${student.controlledModeDelta >= 0 ? "better" : "worse"} under Controlled Mode.`,
      `Guess-rate was elevated in ${elevatedGuessRuns}/${runCount} recent runs.`,
      `Phase overstay repeated in ${overstayRuns}/${runCount} recent runs.`,
    ];
  }, [student]);

  const runHistoryColumns = useMemo<UiTableColumn<StudentAnalyticsRecord["runSummaries"][number]>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        render: (run) => (
          <div className="admin-analytics-run-cell">
            <strong>{run.runName}</strong>
            <small>{run.runId}</small>
          </div>
        ),
      },
      {
        id: "completedOn",
        header: "Completed",
        render: (run) => formatIsoDate(run.completedOn),
      },
      {
        id: "accuracy",
        header: "Accuracy",
        render: (run) => formatPercent(run.accuracyPercent),
      },
      {
        id: "phaseAdherence",
        header: "Phase Compliance",
        render: (run) => formatPercent(run.phaseAdherencePercent),
      },
      {
        id: "guessRate",
        header: "Guess Rate",
        render: (run) => formatPercent(run.guessRatePercent),
      },
    ],
    [],
  );

  const historyColumns = useMemo<UiTableColumn<InterventionActionRecord>[]>(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        render: (entry) => formatIsoDate(entry.timestamp),
      },
      {
        id: "actionType",
        header: "Action",
        render: (entry) => entry.actionType.replaceAll("_", " "),
      },
      {
        id: "status",
        header: "Outcome",
        render: (entry) => entry.outcomeStatus ?? entry.riskCluster ?? "-",
      },
      {
        id: "notes",
        header: "Details",
        render: (entry) => entry.outcomeNotes ?? entry.alertMessage ?? entry.remedialTestId ?? "Immutable audit record logged.",
      },
    ],
    [],
  );

  if (!student || !studentSummary) {
    return (
      <section className="admin-content-card" aria-labelledby="admin-student-intelligence-title">
        <p className="admin-content-eyebrow">Student Intelligence</p>
        <h2 id="admin-student-intelligence-title">Student Intelligence Workspace</h2>
        <p className="admin-content-copy">
          No summary-safe intelligence record was found for <code>{studentId || "unknown-student"}</code>.
        </p>
        <p className="admin-analytics-inline-note">
          {isLoading ? "Loading student intelligence..." : inlineMessage ?? "Student record unavailable."}
        </p>
        <div className="admin-risk-summary-row">
          {alternativeStudents.map((entry) => (
            <NavLink key={entry.studentId} className="admin-risk-summary-button" to={`/admin/insights/student/${entry.studentId}`}>
              {entry.studentName}
            </NavLink>
          ))}
        </div>
      </section>
    );
  }

  const averageOverstayPercent = average(student.runSummaries.map((run) => run.overstayPercent));
  const averageControlledDelta = average(student.runSummaries.map((run) => run.controlledModeDelta));

  return (
    <section className="admin-content-card" aria-labelledby="admin-student-intelligence-title">
      <p className="admin-content-eyebrow">Student Intelligence</p>
      <h2 id="admin-student-intelligence-title">Dedicated Behavioral Intelligence Workspace</h2>
      <p className="admin-content-copy">
        Student intelligence is sourced from <code>studentYearMetrics/{student.studentId}</code> plus summary-safe
        rolling run summaries. Raw session documents are never queried on this route.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/insights/risk">Risk Overview</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/insights/patterns">Pattern Alerts</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/insights/interventions">Intervention Engine</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/insights/execution">Execution Signals</NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading student intelligence..." : inlineMessage ?? "Student intelligence workspace ready."}
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{student.studentName}</h3>
          <p>
            {student.studentId} · {student.batchName} · Academic Year {student.academicYear}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/insights/student/{student.studentId}
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Runs In Window</p>
          <h3>{student.testsAttempted}</h3>
          <small>Last 5 runs or last 30 days snapshot</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Raw Score</p>
          <h3>{formatPercent(student.avgRawScorePercent)}</h3>
          <small>Summary-safe performance metric</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Accuracy</p>
          <h3>{formatPercent(student.avgAccuracyPercent)}</h3>
          <small>Summary-safe performance metric</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Rolling Risk State</p>
          <h3>{riskClusterText(student.rollingRiskCluster)}</h3>
          <small>Shown only as advisory intelligence</small>
        </article>
      </div>

      <div className="admin-risk-signal-grid">
        {behaviorCards.map((card) => (
          <article key={card.label} className="admin-risk-signal-card">
            <p>{card.label}</p>
            <h4>{card.value}</h4>
            <small>{card.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-risk-table-section">
        <h3>Recent Run Trendlines</h3>
        <div className="admin-risk-chart-grid">
          <UiChartContainer
            title="Guess Rate Trend"
            subtitle="Rolling guess-rate by recent summary runs"
            data={studentGuessTrend}
          />
          <UiChartContainer
            title="Pacing Deviation Graph"
            subtitle="Phase compliance trend across the rolling intelligence window"
            data={studentPacingTrend}
          />
        </div>
      </div>

      {isL2OrAbove ? (
        <>
          <div className="admin-risk-table-section">
            <h3>Execution Intelligence</h3>
            <div className="admin-analytics-compliance-panel">
              <article className="admin-analytics-kpi-card">
                <p>Discipline Index</p>
                <h3>{formatPercent(student.disciplineIndex)}</h3>
                <small>Rolling execution discipline</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Overstay Frequency</p>
                <h3>{formatPercent(student.overstayPercent)}</h3>
                <small>Execution overstay from summary-safe run history</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Controlled Mode Delta</p>
                <h3>{formatPercent(student.controlledModeDelta)}</h3>
                <small>Mode effectiveness delta</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Phase Compliance</p>
                <h3>{formatPercent(student.phaseAdherencePercent)}</h3>
                <small>Rolling phase adherence</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Avg Overstay</p>
                <h3>{formatPercent(averageOverstayPercent)}</h3>
                <small>Recent run average</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Avg Controlled Delta</p>
                <h3>{formatPercent(averageControlledDelta)}</h3>
                <small>Recent run average</small>
              </article>
            </div>
            <div className="admin-analytics-insight-list">
              {executionProfileSummary.map((summary) => (
                <article key={summary} className="admin-risk-summary-card">
                  <p>{summary}</p>
                </article>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="admin-risk-table-section">
        <h3>Rolling Run History</h3>
        <UiTable
          caption="Summary-safe run history for this student"
          columns={runHistoryColumns}
          rows={student.runSummaries}
          rowKey={(run) => run.runId}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>Intervention Context</h3>
        <p className="admin-risk-heatmap-copy">
          Intervention recommendations remain advisory and are never auto-applied from insights.
        </p>
        {highRiskCandidate ? (
          <div className="admin-analytics-insight-list">
            <article className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">Suggested Remedial</p>
              <h4>{highRiskCandidate.suggestedRemedialTestId}</h4>
              <p>{highRiskCandidate.suggestedAlertMessage}</p>
            </article>
            <article className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">Intervention Priority</p>
              <h4>{highRiskCandidate.interventionPriority}</h4>
              <p>Derived from rolling risk severity, guess rate, and discipline index.</p>
            </article>
          </div>
        ) : (
          <p className="admin-risk-heatmap-copy">
            This student is not currently in the high-risk intervention watchlist.
          </p>
        )}
        <UiTable
          caption="Immutable intervention audit history for this student"
          columns={historyColumns}
          rows={interventionHistory}
          rowKey={(entry) => entry.interventionId}
          emptyStateText="No intervention history recorded for this student."
        />
      </div>
    </section>
  );
}

export default StudentIntelligencePage;
