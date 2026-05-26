import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  DEFAULT_STUDENT_INTELLIGENCE_ID,
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
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

interface BehaviorCard {
  label: string;
  value: string;
  source: string;
  helper: string;
}

interface StudentOption {
  studentId: string;
  studentName: string;
}

interface RollingWindowContractRow {
  field: string;
  source: string;
  windowRule: string;
  visibility: string;
}

const rollingWindowContractRows: RollingWindowContractRow[] = [
  {
    field: "Rushed Pattern, Time Misallocation",
    source: "studentRollingWindow/{studentId}",
    windowRule: "Last 5 completed runs OR last 30 days",
    visibility: "L1 diagnostic",
  },
  {
    field: "Guess Rate Trend, Pacing Deviation",
    source: "studentRollingWindow/{studentId}.runSummaries",
    windowRule: "Same active rolling snapshot; no raw sessions",
    visibility: "L2 execution",
  },
  {
    field: "MinTime Violation, Overstay Frequency",
    source: "studentRollingWindow/{studentId}.runSummaries",
    windowRule: "Same active rolling snapshot; summary rows only",
    visibility: "L2 execution",
  },
  {
    field: "Rolling Risk State",
    source: "studentYearMetrics/{studentId}",
    windowRule: "Computed from the active rolling window",
    visibility: "L2 execution",
  },
];

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

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function StudentIntelligencePage() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const insightsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

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
        const nextDataset = shouldUseLiveApi() ? await fetchDashboardDataset() : FALLBACK_DATASET;
        const nextStudent =
          nextDataset.studentAnalytics.find((entry) => entry.studentId === studentId) ??
          nextDataset.studentYearMetrics.find((entry) => entry.studentId === studentId) ??
          null;
        const yearId =
          nextStudent && "academicYear" in nextStudent && typeof nextStudent.academicYear === "string" ?
            nextStudent.academicYear :
            nextDataset.yearBehaviorSummary.academicYear;
        const nextHistory = await listInterventionActions({
          instituteId: insightsInstituteId,
          studentId,
          yearId,
        });

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
  }, [insightsInstituteId, studentId]);

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

  const studentOptions = useMemo<StudentOption[]>(() => {
    const studentsById = new Map<string, StudentOption>();

    dataset.studentAnalytics.forEach((entry) => {
      studentsById.set(entry.studentId, {
        studentId: entry.studentId,
        studentName: entry.studentName,
      });
    });

    dataset.studentYearMetrics.forEach((entry) => {
      if (!studentsById.has(entry.studentId)) {
        studentsById.set(entry.studentId, {
          studentId: entry.studentId,
          studentName: entry.studentName,
        });
      }
    });

    return Array.from(studentsById.values()).sort((left, right) => left.studentName.localeCompare(right.studentName));
  }, [dataset.studentAnalytics, dataset.studentYearMetrics]);

  const selectedStudentValue = useMemo(
    () => (studentOptions.some((option) => option.studentId === studentId) ? studentId : ""),
    [studentId, studentOptions],
  );

  const behaviorCards = useMemo<BehaviorCard[]>(() => {
    if (!student) {
      return [];
    }

    return [
      {
        label: "Rushed Pattern",
        value: `${Math.max(0, Math.round(100 - student.phaseAdherencePercent))}%`,
        source: "studentRollingWindow.phaseAdherencePercent",
        helper: "Derived from rolling phase adherence over the recent summary window.",
      },
      {
        label: "Easy Neglect",
        value: formatPercent(student.easyNeglectPercent),
        source: "studentYearMetrics.easyNeglectPercent",
        helper: "Behavioral signal from studentYearMetrics snapshots.",
      },
      {
        label: "Hard Bias",
        value: formatPercent(student.hardBiasPercent),
        source: "studentYearMetrics.hardBiasPercent",
        helper: "Difficulty-order preference trend across recent runs.",
      },
      {
        label: "Topic Weakness",
        value: student.topicWeaknessSummary,
        source: "studentYearMetrics.topicWeaknessSummary",
        helper: "Summary-safe weakness interpretation without raw session scans.",
      },
      {
        label: "Time Misallocation",
        value: formatPercent(student.timeMisallocationPercent),
        source: "studentYearMetrics.timeMisallocationPercent",
        helper: "Rolling timing inefficiency from recent summary runs.",
      },
    ];
  }, [student]);

  const l1DiagnosticInsight = useMemo(() => {
    if (!student) {
      return "";
    }

    const hardBiasDelta = student.hardBiasPercent - student.easyNeglectPercent;
    const timingSignal = Math.max(0, Math.round(student.timeMisallocationPercent));
    const rushedSignal = Math.max(0, Math.round(100 - student.phaseAdherencePercent));

    if (Math.abs(hardBiasDelta) >= 8) {
      return `Hard-bias signal is ${formatSignedPercent(hardBiasDelta)} compared with easy-neglect signal in the rolling window.`;
    }

    if (timingSignal >= rushedSignal) {
      return `Time misallocation is the stronger diagnostic timing signal at ${formatPercent(timingSignal)} in the rolling window.`;
    }

    return `Rushed pattern is the stronger diagnostic timing signal at ${formatPercent(rushedSignal)} in the rolling window.`;
  }, [student]);

  const studentGuessTrend = useMemo(
    () => student?.runSummaries.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.guessRatePercent })).reverse() ?? [],
    [student],
  );

  const studentPacingTrend = useMemo(
    () => student?.runSummaries.map((run) => ({ label: formatIsoDate(run.completedOn), value: 100 - run.phaseAdherencePercent })).reverse() ?? [],
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
      {
        id: "minTimeViolation",
        header: "MinTime Violation",
        render: (run) => formatPercent(run.minTimeViolationPercent),
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

  function handleStudentChange(nextStudentId: string): void {
    if (!nextStudentId || nextStudentId === studentId) {
      return;
    }

    navigate(`/admin/insights/student/${nextStudentId}`);
  }

  if (!student || !studentSummary) {
    return (
      <section className="admin-content-card" aria-labelledby="admin-student-intelligence-title">
        <p className="admin-content-eyebrow">Student Intelligence</p>
        <h2 id="admin-student-intelligence-title">Student Intelligence Workspace</h2>
        <p className="admin-content-copy">
          No summary-safe intelligence record was found for <code>{studentId || "unknown-student"}</code>.
        </p>
        <div className="admin-student-intelligence-switcher">
          <label htmlFor="admin-student-intelligence-selector">
            <span>Student Selector</span>
            <select
              id="admin-student-intelligence-selector"
              value={selectedStudentValue}
              disabled={studentOptions.length === 0}
              onChange={(event) => {
                handleStudentChange(event.target.value);
              }}
            >
              <option value="">
                {studentOptions.length > 0 ? "Choose a student workspace" : "No students available"}
              </option>
              {studentOptions.map((option) => (
                <option key={option.studentId} value={option.studentId}>
                  {option.studentName} ({option.studentId})
                </option>
              ))}
            </select>
          </label>
          <p>Switch students without editing the route manually.</p>
        </div>
        <p className="admin-analytics-inline-note">
          {isLoading ? "Loading student intelligence..." : inlineMessage ?? "Student record unavailable."}
        </p>
      </section>
    );
  }

  const averageOverstayPercent = average(student.runSummaries.map((run) => run.overstayPercent));
  const averageMinTimeViolationPercent = average(student.runSummaries.map((run) => run.minTimeViolationPercent));
  const averageControlledDelta = average(student.runSummaries.map((run) => run.controlledModeDelta));
  const rollingWindowRunCount = student.runSummaries.length;
  const rollingWindowOldestRun = student.runSummaries[student.runSummaries.length - 1]?.completedOn ?? null;
  const rollingWindowNewestRun = student.runSummaries[0]?.completedOn ?? null;

  return (
    <section className="admin-content-card" aria-labelledby="admin-student-intelligence-title">
      <p className="admin-content-eyebrow">Student Intelligence</p>
      <h2 id="admin-student-intelligence-title">Dedicated Behavioral Intelligence Workspace</h2>
      <p className="admin-content-copy">
        Student intelligence is sourced from <code>studentYearMetrics/{student.studentId}</code> plus summary-safe
        rolling run summaries. Raw session documents are never queried on this route.
      </p>

      <InsightsWorkspaceNav activeStudentId={student.studentId || studentId || DEFAULT_STUDENT_INTELLIGENCE_ID} />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading student intelligence..." : inlineMessage ?? "Student intelligence workspace ready."}
      </p>

      <div className="admin-student-intelligence-switcher">
        <label htmlFor="admin-student-intelligence-selector">
          <span>Student Selector</span>
          <select
            id="admin-student-intelligence-selector"
            value={selectedStudentValue}
            disabled={studentOptions.length === 0}
            onChange={(event) => {
              handleStudentChange(event.target.value);
            }}
          >
            <option value="">
              {studentOptions.length > 0 ? "Choose a student workspace" : "No students available"}
            </option>
            {studentOptions.map((option) => (
              <option key={option.studentId} value={option.studentId}>
                {option.studentName} ({option.studentId})
              </option>
            ))}
          </select>
        </label>
        <p>Switch students without editing the route manually.</p>
      </div>

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
          <h3>{rollingWindowRunCount}</h3>
          <small>Active snapshot uses last 5 completed runs OR last 30 days</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Window Rule</p>
          <h3>5 runs / 30 days</h3>
          <small>Whichever defines the current studentRollingWindow summary</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Window Span</p>
          <h3>{rollingWindowNewestRun ? formatIsoDate(rollingWindowNewestRun) : "No runs"}</h3>
          <small>
            {rollingWindowOldestRun ?
              `Oldest included run: ${formatIsoDate(rollingWindowOldestRun)}` :
              "No summary run history included"}
          </small>
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
        {isL2OrAbove ? (
          <article className="admin-analytics-kpi-card">
            <p>Rolling Risk State</p>
            <h3>{riskClusterText(student.rollingRiskCluster)}</h3>
            <small>L2 execution intelligence</small>
          </article>
        ) : null}
      </div>

      <div className="admin-risk-signal-grid">
        {behaviorCards.map((card) => (
          <article key={card.label} className="admin-risk-signal-card">
            <p>{card.label}</p>
            <h4>{card.value}</h4>
            <small>{card.source}</small>
            <small>{card.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-risk-table-section">
        <h3>L1 Diagnostic View</h3>
        <p className="admin-risk-heatmap-copy">
          Rolling window means the active <code>studentRollingWindow/{student.studentId}</code> snapshot built from
          the last 5 completed runs OR the last 30 days, with no raw session query on page load. The L1 view keeps to
          behavior diagnostics only and does not assign a risk state.
        </p>
        <article className="admin-risk-summary-card">
          <p>{l1DiagnosticInsight}</p>
          <small>Diagnostic interpretation from studentYearMetrics and studentRollingWindow summaries.</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Rolling Window Source Contract</h3>
        <p className="admin-risk-heatmap-copy">
          All student intelligence panels use the same rolling-window boundary so diagnostic cards, trendlines, and
          intervention context do not mix different lookback periods.
        </p>
        <UiTable
          caption="Student intelligence rolling-window model"
          columns={[
            {
              id: "field",
              header: "Field",
              render: (row) => row.field,
            },
            {
              id: "source",
              header: "Source",
              render: (row) => <code>{row.source}</code>,
            },
            {
              id: "windowRule",
              header: "Window Rule",
              render: (row) => row.windowRule,
            },
            {
              id: "visibility",
              header: "Visibility",
              render: (row) => row.visibility,
            },
          ]}
          rows={rollingWindowContractRows}
          rowKey={(row) => row.field}
        />
      </div>

      {isL2OrAbove ? (
        <>
          <div className="admin-risk-table-section">
            <h3>Execution Trendlines</h3>
            <div className="admin-risk-chart-grid">
              <UiChartContainer
                title="Guess Rate Trend"
                subtitle="Rolling guess-rate by recent summary runs"
                data={studentGuessTrend}
              />
              <UiChartContainer
                title="Pacing Deviation Graph"
                subtitle="Deviation from expected phase compliance across the rolling intelligence window"
                data={studentPacingTrend}
              />
            </div>
          </div>
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
                <p>MinTime Violation</p>
                <h3>{formatPercent(averageMinTimeViolationPercent)}</h3>
                <small>Rolling early-exit pressure from studentRollingWindow run summaries</small>
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
