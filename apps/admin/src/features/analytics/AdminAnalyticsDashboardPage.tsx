import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_DATASET,
  RISK_CLUSTERS,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type RiskCluster,
  type RunAnalyticsRecord,
  type StudentAnalyticsRecord,
  type StudentYearMetricRecord,
} from "./analyticsDataset";

interface DashboardKpi {
  label: string;
  value: string;
  helper: string;
}

interface RunAnalyticsFilters {
  academicYear: string;
  mode: string;
  batchId: string;
  dateRangeStart: string;
  dateRangeEnd: string;
}

interface StudentAnalyticsFilters {
  studentId: string;
  academicYear: string;
  lastNTests: string;
}

type AnalyticsSubpage = "overview" | "run" | "student";

function buildScoreDistribution(runAnalytics: RunAnalyticsRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };

  for (const run of runAnalytics) {
    const value = run.avgRawScorePercent;
    if (value < 40) {
      buckets["0-39"] += 1;
    } else if (value < 60) {
      buckets["40-59"] += 1;
    } else if (value < 80) {
      buckets["60-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

function buildAccuracyMetrics(studentMetrics: StudentYearMetricRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-49": 0,
    "50-64": 0,
    "65-79": 0,
    "80-100": 0,
  };

  for (const metric of studentMetrics) {
    const value = metric.avgAccuracyPercent;
    if (value < 50) {
      buckets["0-49"] += 1;
    } else if (value < 65) {
      buckets["50-64"] += 1;
    } else if (value < 80) {
      buckets["65-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

function buildRiskClusterVisualization(
  runAnalytics: RunAnalyticsRecord[],
  studentMetrics: StudentYearMetricRecord[],
): UiChartPoint[] {
  const clusterCounts: Record<RiskCluster, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const run of runAnalytics) {
    for (const cluster of RISK_CLUSTERS) {
      clusterCounts[cluster] += run.riskDistribution[cluster];
    }
  }

  for (const metric of studentMetrics) {
    clusterCounts[metric.rollingRiskCluster] += 1;
  }

  return RISK_CLUSTERS.map((cluster) => ({
    label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
    value: clusterCounts[cluster],
  }));
}

function buildDisciplineIndexStatistics(studentMetrics: StudentYearMetricRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };

  for (const metric of studentMetrics) {
    const value = metric.disciplineIndex;
    if (value < 40) {
      buckets["0-39"] += 1;
    } else if (value < 60) {
      buckets["40-59"] += 1;
    } else if (value < 80) {
      buckets["60-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

function resolveAnalyticsSubpage(pathname: string): AnalyticsSubpage {
  if (pathname.includes("/analytics/student/")) {
    return "student";
  }

  if (pathname.includes("/analytics/run/")) {
    return "run";
  }

  return "overview";
}

function toDistributionChart(labels: string[], values: number[]): UiChartPoint[] {
  return labels.map((label, index) => ({
    label,
    value: values[index] ?? 0,
  }));
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function AdminAnalyticsDashboardPage() {
  const location = useLocation();
  const params = useParams<{ runId?: string; studentId?: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [runFilters, setRunFilters] = useState<RunAnalyticsFilters>({
    academicYear: "all",
    mode: "all",
    batchId: "all",
    dateRangeStart: "",
    dateRangeEnd: "",
  });
  const [studentFilters, setStudentFilters] = useState<StudentAnalyticsFilters>({
    studentId: "all",
    academicYear: "all",
    lastNTests: "5",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic runAnalytics and studentYearMetrics fixtures for Build 120.",
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
        setInlineMessage("Live mode enabled: dashboard hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load analytics data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 120 fixtures.`);
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

  const currentSubpage = useMemo(() => resolveAnalyticsSubpage(location.pathname), [location.pathname]);

  const dashboardKpis = useMemo<DashboardKpi[]>(() => {
    const totalRuns = dataset.runAnalytics.length;
    const totalStudents = dataset.studentYearMetrics.length;
    const sumRaw = dataset.runAnalytics.reduce((sum, run) => sum + run.avgRawScorePercent, 0);
    const sumAccuracy = dataset.runAnalytics.reduce((sum, run) => sum + run.avgAccuracyPercent, 0);
    const sumCompletion = dataset.runAnalytics.reduce((sum, run) => sum + run.completionRatePercent, 0);
    const sumDiscipline = dataset.studentYearMetrics.reduce((sum, metric) => sum + metric.disciplineIndex, 0);

    return [
      {
        label: "Avg Raw Score",
        value: formatPercent(totalRuns > 0 ? sumRaw / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Avg Accuracy",
        value: formatPercent(totalRuns > 0 ? sumAccuracy / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Completion Rate",
        value: formatPercent(totalRuns > 0 ? sumCompletion / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Avg Discipline Index",
        value: formatPercent(totalStudents > 0 ? sumDiscipline / totalStudents : 0),
        helper: "studentYearMetrics summary",
      },
    ];
  }, [dataset.runAnalytics, dataset.studentYearMetrics]);

  const scoreDistributionChart = useMemo(
    () => buildScoreDistribution(dataset.runAnalytics),
    [dataset.runAnalytics],
  );
  const accuracyMetricsChart = useMemo(
    () => buildAccuracyMetrics(dataset.studentYearMetrics),
    [dataset.studentYearMetrics],
  );
  const riskClusterChart = useMemo(
    () => buildRiskClusterVisualization(dataset.runAnalytics, dataset.studentYearMetrics),
    [dataset.runAnalytics, dataset.studentYearMetrics],
  );
  const disciplineIndexChart = useMemo(
    () => buildDisciplineIndexStatistics(dataset.studentYearMetrics),
    [dataset.studentYearMetrics],
  );

  const runSummaryColumns = useMemo<UiTableColumn<RunAnalyticsRecord>[]>(
    () => [
      {
        id: "runName",
        header: "Run",
        render: (run) => (
          <div className="admin-analytics-run-cell">
            <strong>{run.runName}</strong>
            <small>{run.runId}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (run) => (
          <div className="admin-analytics-mode-cell">
            <strong>{run.mode}</strong>
            <small>{run.participants} participants</small>
          </div>
        ),
      },
      {
        id: "scores",
        header: "Scores",
        render: (run) => (
          <div className="admin-analytics-score-cell">
            <strong>{formatPercent(run.avgRawScorePercent)}</strong>
            <small>Accuracy {formatPercent(run.avgAccuracyPercent)}</small>
          </div>
        ),
      },
      {
        id: "discipline",
        header: "Discipline",
        render: (run) => (
          <div className="admin-analytics-discipline-cell">
            <strong>{formatPercent(run.disciplineIndexAverage)}</strong>
            <small>Completion {formatPercent(run.completionRatePercent)}</small>
          </div>
        ),
      },
      {
        id: "startedAt",
        header: "Run Date",
        render: (run) => formatIsoDate(run.startedAt),
      },
      {
        id: "detail",
        header: "Detail",
        render: (run) => <NavLink className="admin-primary-link" to={`/admin/analytics/run/${run.runId}`}>Open Run</NavLink>,
      },
    ],
    [],
  );

  const runRows = useMemo(
    () => [...dataset.runAnalytics].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
    [dataset.runAnalytics],
  );

  const runRowsForDetail = useMemo(() => {
    const parsedStart = runFilters.dateRangeStart ? Date.parse(runFilters.dateRangeStart) : null;
    const parsedEnd = runFilters.dateRangeEnd ? Date.parse(runFilters.dateRangeEnd) : null;

    return runRows.filter((run) => {
      if (runFilters.academicYear !== "all" && run.academicYear !== runFilters.academicYear) {
        return false;
      }

      if (runFilters.mode !== "all" && run.mode !== runFilters.mode) {
        return false;
      }

      if (runFilters.batchId !== "all" && run.batchId !== runFilters.batchId) {
        return false;
      }

      const startedAtMillis = Date.parse(run.startedAt);
      if (parsedStart !== null && startedAtMillis < parsedStart) {
        return false;
      }

      if (parsedEnd !== null && startedAtMillis > parsedEnd) {
        return false;
      }

      return true;
    });
  }, [runFilters, runRows]);

  const selectedRun = useMemo(() => {
    if (params.runId) {
      return runRowsForDetail.find((run) => run.runId === params.runId) ?? null;
    }

    return runRowsForDetail[0] ?? null;
  }, [params.runId, runRowsForDetail]);

  const selectedRunRawHistogram = useMemo(
    () => selectedRun ? toDistributionChart(["0-39", "40-59", "60-79", "80-100"], selectedRun.rawScoreHistogram) : [],
    [selectedRun],
  );
  const selectedRunAccuracyHistogram = useMemo(
    () => selectedRun ? toDistributionChart(["0-49", "50-64", "65-79", "80-100"], selectedRun.accuracyHistogram) : [],
    [selectedRun],
  );
  const selectedRunSectionAccuracy = useMemo(
    () => selectedRun ? toDistributionChart(["Physics", "Chemistry", "Mathematics"], selectedRun.sectionAccuracyPercentages) : [],
    [selectedRun],
  );
  const selectedRunTopicHeatmap = useMemo(
    () => selectedRun ? toDistributionChart(["Algebra", "Mechanics", "Organic", "Modern", "Coordination"], selectedRun.topicHeatmap) : [],
    [selectedRun],
  );
  const selectedRunBehaviorDistribution = useMemo(
    () => selectedRun ? [
      { label: "Rushed", value: selectedRun.behaviorDistribution.rushedPercent },
      { label: "Overextended", value: selectedRun.behaviorDistribution.overextendedPercent },
      { label: "Drift-Prone", value: selectedRun.behaviorDistribution.driftPronePercent },
    ] : [],
    [selectedRun],
  );
  const selectedRunRiskDistribution = useMemo(
    () => selectedRun ? RISK_CLUSTERS.map((cluster) => ({
      label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
      value: selectedRun.riskDistribution[cluster],
    })) : [],
    [selectedRun],
  );
  const selectedRunDisciplineDistribution = useMemo(
    () => selectedRun ? toDistributionChart(["0-39", "40-59", "60-79", "80-100"], selectedRun.disciplineIndexDistribution) : [],
    [selectedRun],
  );
  const filteredStudentAnalytics = useMemo(() => {
    return dataset.studentAnalytics.filter((student) => {
      if (studentFilters.academicYear !== "all" && student.academicYear !== studentFilters.academicYear) {
        return false;
      }

      if (studentFilters.studentId !== "all" && student.studentId !== studentFilters.studentId) {
        return false;
      }

      return true;
    });
  }, [dataset.studentAnalytics, studentFilters]);
  const selectedStudent = useMemo(() => {
    if (params.studentId) {
      return filteredStudentAnalytics.find((student) => student.studentId === params.studentId) ?? null;
    }

    return filteredStudentAnalytics[0] ?? null;
  }, [filteredStudentAnalytics, params.studentId]);
  const visibleStudentRuns = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    const limit = Number(studentFilters.lastNTests);
    return selectedStudent.runSummaries.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5);
  }, [selectedStudent, studentFilters.lastNTests]);
  const studentRawTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.rawScorePercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentAccuracyTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.accuracyPercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentPhaseTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.phaseAdherencePercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentEasyNeglectTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.easyNeglectPercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentHardBiasTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.hardBiasPercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentRiskTimeline = useMemo(
    () => visibleStudentRuns.map((run) => ({
      label: formatIsoDate(run.completedOn),
      value:
        run.riskState === "low" ? 25 :
          run.riskState === "medium" ? 50 :
            run.riskState === "high" ? 75 :
              100,
    })).reverse(),
    [visibleStudentRuns],
  );
  const studentDisciplineTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.disciplineIndex })).reverse(),
    [visibleStudentRuns],
  );
  const studentGuessTrend = useMemo(
    () => visibleStudentRuns.map((run) => ({ label: formatIsoDate(run.completedOn), value: run.guessRatePercent })).reverse(),
    [visibleStudentRuns],
  );
  const studentStabilityScore = useMemo(() => {
    const rawValues = visibleStudentRuns.map((run) => run.rawScorePercent);
    return Math.max(0, 100 - Math.round(calculateStandardDeviation(rawValues)));
  }, [visibleStudentRuns]);
  const studentInsightSummary = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    const rushedCount = visibleStudentRuns.filter((run) => run.phaseAdherencePercent < 70).length;
    const firstHardBias = visibleStudentRuns[0]?.hardBiasPercent ?? 0;
    const lastHardBias = visibleStudentRuns[visibleStudentRuns.length - 1]?.hardBiasPercent ?? 0;

    return [
      `Rushed in ${rushedCount}/${Math.max(1, visibleStudentRuns.length)} recent tests`,
      firstHardBias < lastHardBias ? "Hard Bias decreasing" : "Hard Bias needs attention",
      `${selectedStudent.topicWeaknessSummary}`,
    ];
  }, [selectedStudent, visibleStudentRuns]);

  return (
    <section className="admin-content-card" aria-labelledby="admin-analytics-title">
      <p className="admin-content-eyebrow">Admin Analytics Dashboard</p>
      <h2 id="admin-analytics-title">
        {currentSubpage === "run" ? "By Run Analytics Workspace" :
          currentSubpage === "student" ? "By Student Analytics Workspace" :
            "Performance, Risk, and Discipline Overview"}
      </h2>
      <p className="admin-content-copy">
        {currentSubpage === "run" ?
          <>Dedicated run analytics view sourced from <code>runAnalytics</code> summaries only. Session scans are never used.</> :
          currentSubpage === "student" ?
            <>Dedicated student analytics view sourced from <code>studentYearMetrics</code> plus summary-safe <code>studentRunSummary</code> trend records. Raw session scans are never used.</> :
            <>Summary dashboard for measurable outcomes using <code>runAnalytics</code> and<code> studentYearMetrics</code> only. Raw session scans are not used.</>}
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics/overview">Overview</NavLink>{" "}
        <NavLink className="admin-primary-link" to={selectedRun ? `/admin/analytics/run/${selectedRun.runId}` : "/admin/analytics/run/run-2026-0410-001"}>
          By Run
        </NavLink>
        {" "}
        <NavLink
          className="admin-primary-link"
          to={selectedStudent ? `/admin/analytics/student/${selectedStudent.studentId}` : "/admin/analytics/student/STU-001"}
        >
          By Student
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ?
          "Loading analytics dashboard..." :
          inlineMessage ?? (currentSubpage === "run" ? "Run analytics workspace ready." : "Analytics dashboard ready.")}
      </p>

      {currentSubpage === "overview" ? (
        <>
          <div className="admin-analytics-kpi-grid">
            {dashboardKpis.map((kpi) => (
              <article key={kpi.label} className="admin-analytics-kpi-card">
                <p>{kpi.label}</p>
                <h3>{kpi.value}</h3>
                <small>{kpi.helper}</small>
              </article>
            ))}
          </div>

          <div className="admin-analytics-chart-grid">
            <UiChartContainer
              title="Score Distribution"
              subtitle="Run-level average raw score percentages"
              data={scoreDistributionChart}
            />
            <UiChartContainer
              title="Accuracy Metrics"
              subtitle="Student-level accuracy percentage bands"
              data={accuracyMetricsChart}
            />
            <UiChartContainer
              title="Risk Cluster Visualization"
              subtitle="Aggregated run + student risk clusters"
              data={riskClusterChart}
            />
            <UiChartContainer
              title="Discipline Index Statistics"
              subtitle="Student discipline index spread"
              data={disciplineIndexChart}
            />
          </div>

          <div className="admin-analytics-run-summary">
            <h3>Run Performance Summaries</h3>
            <UiTable
              caption="Recent assignment runs and normalized performance summaries"
              columns={runSummaryColumns}
              rows={runRows}
              rowKey={(row) => row.runId}
            />
          </div>
        </>
      ) : currentSubpage === "run" ? (
        <>
          <div className="admin-analytics-filter-grid">
            <label>
              AcademicYear
              <select
                value={runFilters.academicYear}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, academicYear: event.target.value }));
                }}
              >
                <option value="all">All</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </label>
            <label>
              Mode
              <select
                value={runFilters.mode}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, mode: event.target.value }));
                }}
              >
                <option value="all">All</option>
                {Array.from(new Set(dataset.runAnalytics.map((run) => run.mode))).map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <label>
              Batch
              <select
                value={runFilters.batchId}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, batchId: event.target.value }));
                }}
              >
                <option value="all">All</option>
                {Array.from(new Set(dataset.runAnalytics.map((run) => `${run.batchId}::${run.batchName}`))).map((batchKey) => {
                  const [batchId, batchName] = batchKey.split("::");
                  return <option key={batchKey} value={batchId}>{batchName}</option>;
                })}
              </select>
            </label>
            <label>
              DateRange Start
              <input
                type="date"
                value={runFilters.dateRangeStart}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, dateRangeStart: event.target.value }));
                }}
              />
            </label>
            <label>
              DateRange End
              <input
                type="date"
                value={runFilters.dateRangeEnd}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, dateRangeEnd: event.target.value }));
                }}
              />
            </label>
          </div>

          <div className="admin-analytics-run-summary">
            <h3>Run Selection</h3>
            <UiTable
              caption="Filtered runAnalytics summary documents"
              columns={runSummaryColumns}
              rows={runRowsForDetail}
              rowKey={(row) => row.runId}
              emptyStateText="No runs matched the current filters."
            />
          </div>

          {selectedRun ? (
            <>
              <div className="admin-analytics-run-detail-header">
                <div>
                  <h3>{selectedRun.runName}</h3>
                  <p>
                    {selectedRun.runId} · {selectedRun.batchName} · {selectedRun.mode} · {formatIsoDate(selectedRun.startedAt)}
                  </p>
                </div>
                <div className="admin-analytics-run-source-chip">
                  Source: runAnalytics/{selectedRun.runId}
                </div>
              </div>

              <div className="admin-analytics-kpi-grid">
                <article className="admin-analytics-kpi-card">
                  <p>Avg Raw Score</p>
                  <h3>{formatPercent(selectedRun.avgRawScorePercent)}</h3>
                  <small>L0 run summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Avg Accuracy</p>
                  <h3>{formatPercent(selectedRun.avgAccuracyPercent)}</h3>
                  <small>L0 run summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Median Raw</p>
                  <h3>{formatPercent(selectedRun.medianRawScorePercent)}</h3>
                  <small>L0 run summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Std Deviation</p>
                  <h3>{formatPercent(selectedRun.rawScoreStdDeviation)}</h3>
                  <small>L0 run summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Completion</p>
                  <h3>{formatPercent(selectedRun.completionRatePercent)}</h3>
                  <small>L0 run summary</small>
                </article>
              </div>

              <div className="admin-analytics-chart-grid">
                <UiChartContainer title="Raw % Histogram" subtitle="Run-level raw score distribution" data={selectedRunRawHistogram} />
                <UiChartContainer title="Accuracy % Histogram" subtitle="Run-level accuracy distribution" data={selectedRunAccuracyHistogram} />
                <UiChartContainer title="Section-wise Accuracy" subtitle="Normalized section summary" data={selectedRunSectionAccuracy} />
              </div>

              {isL1OrAbove ? (
                <>
                  <div className="admin-analytics-kpi-grid">
                    <article className="admin-analytics-kpi-card">
                      <p>Avg Phase Adherence</p>
                      <h3>{formatPercent(selectedRun.avgPhaseAdherencePercent)}</h3>
                      <small>L1 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Easy Neglect</p>
                      <h3>{formatPercent(selectedRun.easyNeglectPercent)}</h3>
                      <small>L1 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Hard Bias</p>
                      <h3>{formatPercent(selectedRun.hardBiasPercent)}</h3>
                      <small>L1 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Time Misallocation</p>
                      <h3>{formatPercent(selectedRun.timeMisallocationPercent)}</h3>
                      <small>L1 runAnalytics</small>
                    </article>
                  </div>

                  <div className="admin-analytics-chart-grid">
                    <UiChartContainer title="Topic Heatmap" subtitle="Per-topic diagnostic strength from run summary" data={selectedRunTopicHeatmap} />
                    <UiChartContainer title="Behavior Distribution" subtitle="Rushed, overextended, and drift-prone patterns" data={selectedRunBehaviorDistribution} />
                  </div>
                </>
              ) : null}

              {isL2OrAbove ? (
                <>
                  <div className="admin-analytics-kpi-grid">
                    <article className="admin-analytics-kpi-card">
                      <p>Guess Rate</p>
                      <h3>{formatPercent(selectedRun.guessRatePercent)}</h3>
                      <small>L2 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Controlled Compliance</p>
                      <h3>{formatPercent(selectedRun.controlledCompliancePercent)}</h3>
                      <small>L2 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>MinTime Violations</p>
                      <h3>{formatPercent(selectedRun.minTimeViolationPercent)}</h3>
                      <small>L2 runAnalytics</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>MaxTime Violations</p>
                      <h3>{formatPercent(selectedRun.maxTimeViolationPercent)}</h3>
                      <small>L2 runAnalytics</small>
                    </article>
                  </div>

                  <div className="admin-analytics-chart-grid">
                    <UiChartContainer title="Risk Cluster Distribution" subtitle="Run-level risk composition" data={selectedRunRiskDistribution} variant="pie" />
                    <UiChartContainer title="Discipline Index Distribution" subtitle="Run-level discipline spread" data={selectedRunDisciplineDistribution} />
                  </div>

                  <div className="admin-analytics-compliance-panel">
                    <article className="admin-analytics-kpi-card">
                      <p>Followed Phase Split</p>
                      <h3>{formatPercent(selectedRun.followedPhaseSplitPercent)}</h3>
                      <small>Execution compliance panel</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Pacing Guardrail Violations</p>
                      <h3>{formatPercent(selectedRun.pacingGuardrailViolationPercent)}</h3>
                      <small>Execution compliance panel</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Structural Override</p>
                      <h3>{formatPercent(selectedRun.structuralOverridePercent)}</h3>
                      <small>Execution compliance panel</small>
                    </article>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="admin-analytics-inline-note">Select a run from the filtered summary table to open its dedicated analytics workspace.</p>
          )}
        </>
      ) : (
        <>
          <div className="admin-analytics-filter-grid">
            <label>
              Student
              <select
                value={studentFilters.studentId}
                onChange={(event) => {
                  setStudentFilters((current) => ({ ...current, studentId: event.target.value }));
                }}
              >
                <option value="all">All</option>
                {dataset.studentAnalytics.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentName} ({student.studentId})
                  </option>
                ))}
              </select>
            </label>
            <label>
              AcademicYear
              <select
                value={studentFilters.academicYear}
                onChange={(event) => {
                  setStudentFilters((current) => ({ ...current, academicYear: event.target.value }));
                }}
              >
                <option value="all">All</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </label>
            <label>
              Last N Tests
              <select
                value={studentFilters.lastNTests}
                onChange={(event) => {
                  setStudentFilters((current) => ({ ...current, lastNTests: event.target.value }));
                }}
              >
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="8">8</option>
              </select>
            </label>
          </div>

          <div className="admin-analytics-run-summary">
            <h3>Student Selection</h3>
            <UiTable
              caption="Filtered studentYearMetrics summary documents"
              columns={[
                {
                  id: "student",
                  header: "Student",
                  render: (student: StudentAnalyticsRecord) => (
                    <div className="admin-analytics-run-cell">
                      <strong>{student.studentName}</strong>
                      <small>{student.studentId}</small>
                    </div>
                  ),
                },
                {
                  id: "batch",
                  header: "Batch",
                  render: (student: StudentAnalyticsRecord) => student.batchName,
                },
                {
                  id: "scores",
                  header: "Scores",
                  render: (student: StudentAnalyticsRecord) => (
                    <div className="admin-analytics-score-cell">
                      <strong>{formatPercent(student.avgRawScorePercent)}</strong>
                      <small>Accuracy {formatPercent(student.avgAccuracyPercent)}</small>
                    </div>
                  ),
                },
                {
                  id: "open",
                  header: "Open",
                  render: (student: StudentAnalyticsRecord) => (
                    <NavLink className="admin-primary-link" to={`/admin/analytics/student/${student.studentId}`}>
                      Open Student
                    </NavLink>
                  ),
                },
              ]}
              rows={filteredStudentAnalytics}
              rowKey={(student) => student.studentId}
              emptyStateText="No students matched the current filters."
            />
          </div>

          {selectedStudent ? (
            <>
              <div className="admin-analytics-run-detail-header">
                <div>
                  <h3>{selectedStudent.studentName}</h3>
                  <p>
                    {selectedStudent.studentId} · {selectedStudent.batchName} · Academic Year {selectedStudent.academicYear}
                  </p>
                </div>
                <div className="admin-analytics-run-source-chip">
                  Sources: studentYearMetrics/{selectedStudent.studentId} + studentRunSummary/{selectedStudent.studentId}/*
                </div>
              </div>

              <div className="admin-analytics-kpi-grid">
                <article className="admin-analytics-kpi-card">
                  <p>Avg Raw Score</p>
                  <h3>{formatPercent(selectedStudent.avgRawScorePercent)}</h3>
                  <small>L0 student summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Avg Accuracy</p>
                  <h3>{formatPercent(selectedStudent.avgAccuracyPercent)}</h3>
                  <small>L0 student summary</small>
                </article>
                <article className="admin-analytics-kpi-card">
                  <p>Rank in Batch</p>
                  <h3>{selectedStudent.rankInBatch === null ? "N/A" : `#${selectedStudent.rankInBatch}`}</h3>
                  <small>L0 student summary</small>
                </article>
              </div>

              <div className="admin-analytics-chart-grid">
                <UiChartContainer title="Raw % Trend" subtitle="Recent test raw score trend" data={studentRawTrend} variant="line" maxValue={100} />
                <UiChartContainer title="Accuracy % Trend" subtitle="Recent test accuracy trend" data={studentAccuracyTrend} variant="line" maxValue={100} />
              </div>

              <UiTable
                caption="Student test history summary"
                columns={[
                  { id: "run", header: "Run", render: (run: StudentAnalyticsRecord["runSummaries"][number]) => run.runName },
                  { id: "completedOn", header: "Completed On", render: (run: StudentAnalyticsRecord["runSummaries"][number]) => formatIsoDate(run.completedOn) },
                  { id: "raw", header: "Raw %", render: (run: StudentAnalyticsRecord["runSummaries"][number]) => formatPercent(run.rawScorePercent) },
                  { id: "accuracy", header: "Accuracy %", render: (run: StudentAnalyticsRecord["runSummaries"][number]) => formatPercent(run.accuracyPercent) },
                ]}
                rows={visibleStudentRuns}
                rowKey={(run) => run.runId}
                emptyStateText="No test history is available for this student."
              />

              {isL1OrAbove ? (
                <>
                  <div className="admin-analytics-kpi-grid">
                    <article className="admin-analytics-kpi-card">
                      <p>Phase Adherence</p>
                      <h3>{formatPercent(selectedStudent.phaseAdherencePercent)}</h3>
                      <small>L1 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Easy Neglect</p>
                      <h3>{formatPercent(selectedStudent.easyNeglectPercent)}</h3>
                      <small>L1 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Hard Bias</p>
                      <h3>{formatPercent(selectedStudent.hardBiasPercent)}</h3>
                      <small>L1 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Time Misallocation</p>
                      <h3>{formatPercent(selectedStudent.timeMisallocationPercent)}</h3>
                      <small>L1 student summary</small>
                    </article>
                  </div>

                  <div className="admin-analytics-chart-grid">
                    <UiChartContainer title="Phase Adherence Trend" subtitle="Recent phase discipline overlay" data={studentPhaseTrend} variant="line" maxValue={100} />
                    <UiChartContainer title="Easy Neglect Trend" subtitle="Recent neglect overlay" data={studentEasyNeglectTrend} variant="line" maxValue={100} />
                    <UiChartContainer title="Hard Bias Trend" subtitle="Recent hard-bias overlay" data={studentHardBiasTrend} variant="line" maxValue={100} />
                    <UiChartContainer title="Topic Weakness Radar" subtitle="Recent topic weakness profile" data={selectedStudent.topicWeaknessRadar} />
                  </div>

                  <div className="admin-analytics-insight-list">
                    {studentInsightSummary.map((insight) => (
                      <article key={insight} className="admin-analytics-kpi-card">
                        <p>Insight</p>
                        <h3>{insight}</h3>
                        <small>L1 interpretation</small>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {isL2OrAbove ? (
                <>
                  <div className="admin-analytics-kpi-grid">
                    <article className="admin-analytics-kpi-card">
                      <p>Overstay %</p>
                      <h3>{formatPercent(selectedStudent.overstayPercent)}</h3>
                      <small>L2 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Controlled Mode Delta</p>
                      <h3>{formatPercent(selectedStudent.controlledModeDelta)}</h3>
                      <small>L2 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Override Count</p>
                      <h3>{String(selectedStudent.overrideCount)}</h3>
                      <small>L2 student summary</small>
                    </article>
                    <article className="admin-analytics-kpi-card">
                      <p>Execution Stability</p>
                      <h3>{String(studentStabilityScore)}</h3>
                      <small>100 - stdDeviation(raw % last N runs)</small>
                    </article>
                  </div>

                  <div className="admin-analytics-chart-grid">
                    <UiChartContainer title="Risk Timeline" subtitle="Per-run rolling risk state" data={studentRiskTimeline} variant="line" maxValue={100} />
                    <UiChartContainer title="Discipline Index Trend" subtitle="Per-run discipline trajectory" data={studentDisciplineTrend} variant="line" maxValue={100} />
                    <UiChartContainer title="Guess Rate Trend" subtitle="Per-run guess rate trajectory" data={studentGuessTrend} variant="line" maxValue={100} />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="admin-analytics-inline-note">Select a student from the filtered summary table to open the dedicated student analytics workspace.</p>
          )}
        </>
      )}
    </section>
  );
}

export default AdminAnalyticsDashboardPage;
