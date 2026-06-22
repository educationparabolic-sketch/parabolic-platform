import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AnalyticsWorkspaceNav from "./AnalyticsWorkspaceNav";
import {
  type AnalyticsLayer,
  buildScopeQuery,
  deriveBatchRecords,
  deriveRunRecords,
  type DerivedBatchRecord,
} from "./analyticsArchitecture";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
} from "./analyticsDataset";

interface CrossBatchFilters {
  academicYear: string;
  dateStart: string;
  dateEnd: string;
  subject: string;
  program: string;
  mode: string;
}

interface KpiCard {
  label: string;
  value: string;
  helper: string;
}

const BATCH_ANALYTICS_MODE_OPTIONS = [
  { value: "Operational", label: "Operational" },
  { value: "Controlled", label: "Controlled" },
  { value: "Focused", label: "Focused" },
  { value: "Hard", label: "Hard" },
] as const;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderMetricLine(label: string, value: string) {
  return (
    <div className="admin-analytics-metric-line">
      <span className="admin-analytics-metric-label">{label}</span>
      <span className="admin-analytics-metric-value">{value}</span>
    </div>
  );
}

function toChartPoints(rows: DerivedBatchRecord[], selector: (row: DerivedBatchRecord) => number): UiChartPoint[] {
  return rows.map((row) => ({
    label: row.batchName,
    value: Math.round(selector(row)),
  }));
}

function buildKpis(rows: DerivedBatchRecord[], layer: AnalyticsLayer): KpiCard[] {
  const cards: KpiCard[] = [
    {
      label: "Total Batches",
      value: String(rows.length),
      helper: "Batches included in this review",
    },
    {
      label: "Students in View",
      value: String(rows.reduce((sum, row) => sum + row.studentCount, 0)),
      helper: "Learners represented across visible batches",
    },
    {
      label: "Avg Raw Score",
      value: formatPercent(average(rows.map((row) => row.avgRawScorePercent))),
      helper: "Average score across visible batches",
    },
    {
      label: "Avg Accuracy",
      value: formatPercent(average(rows.map((row) => row.avgAccuracyPercent))),
      helper: "Average accuracy across visible batches",
    },
    {
      label: "Avg Participation Rate",
      value: formatPercent(average(rows.map((row) => row.avgParticipationPercent))),
      helper: "Average participation across visible batches",
    },
  ];

  if (layer === "L1" || layer === "L2") {
    cards.push(
      {
        label: "Avg Phase Adherence",
        value: formatPercent(average(rows.map((row) => row.avgPhaseAdherencePercent))),
        helper: "Average pacing discipline across batches",
      },
      {
        label: "Avg Easy Neglect",
        value: formatPercent(average(rows.map((row) => row.avgEasyNeglectPercent))),
        helper: "Easy-question neglect signal",
      },
      {
        label: "Avg Hard Bias",
        value: formatPercent(average(rows.map((row) => row.avgHardBiasPercent))),
        helper: "Hard-question overfocus signal",
      },
    );
  }

  if (layer === "L2") {
    cards.push(
      {
        label: "Avg Discipline Index",
        value: formatPercent(average(rows.map((row) => row.avgDisciplineIndex))),
        helper: "Execution steadiness across batches",
      },
      {
        label: "Avg Guess Rate",
        value: formatPercent(average(rows.map((row) => row.avgGuessRatePercent))),
        helper: "Estimated guess-pressure signal",
      },
      {
        label: "Avg Controlled Mode Delta",
        value: formatPercent(average(rows.map((row) => row.avgControlledModeDelta))),
        helper: "Change seen in controlled delivery",
      },
      {
        label: "Batches Needing Review",
        value: String(rows.filter((row) => row.highRiskRunCount > 0).length),
        helper: "Batches showing stronger risk clusters",
      },
      {
        label: "Unsteady Batches",
        value: String(rows.filter((row) => row.stabilityFlag === "Unstable").length),
        helper: "Batches with less consistent execution",
      },
    );
  }

  return cards;
}

function buildColumns(layer: AnalyticsLayer): UiTableColumn<DerivedBatchRecord>[] {
  const columns: UiTableColumn<DerivedBatchRecord>[] = [
    {
      id: "batch",
      header: "Batch",
      render: (row) => (
        <div className="admin-analytics-run-cell">
          <strong>{row.batchName}</strong>
        </div>
      ),
    },
    {
      id: "students",
      header: "Class Size",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          {renderMetricLine("Students", String(row.studentCount))}
          {renderMetricLine("Active", String(row.activeStudentCount))}
        </div>
      ),
    },
    {
      id: "activity",
      header: "Recent Activity",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          {renderMetricLine("Last Run", formatIsoDate(row.lastActivityAt))}
          {renderMetricLine("Runs in Scope", String(row.runCount))}
        </div>
      ),
    },
    {
      id: "l0",
      header: "Score Snapshot",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          {renderMetricLine("Raw Score", formatPercent(row.avgRawScorePercent))}
          {renderMetricLine("Accuracy", formatPercent(row.avgAccuracyPercent))}
          {renderMetricLine("Participation", formatPercent(row.avgParticipationPercent))}
        </div>
      ),
    },
  ];

  if (layer === "L1" || layer === "L2") {
    columns.push({
      id: "l1",
      header: "Learning Signals",
      render: (row) => (
        <div className="admin-analytics-discipline-cell">
          {renderMetricLine("Phase Adherence", formatPercent(row.avgPhaseAdherencePercent))}
          {renderMetricLine("Main Pattern", row.dominantBehaviorTag)}
          {renderMetricLine("Easy Neglect", formatPercent(row.avgEasyNeglectPercent))}
          {renderMetricLine("Hard Bias", formatPercent(row.avgHardBiasPercent))}
        </div>
      ),
    });
  }

  if (layer === "L2") {
    columns.push({
      id: "l2",
      header: "Execution Signals",
      render: (row) => (
        <div className="admin-analytics-discipline-cell">
          {renderMetricLine("Discipline Index", formatPercent(row.avgDisciplineIndex))}
          {renderMetricLine("Stability", row.stabilityFlag)}
          {renderMetricLine("Guess Rate", formatPercent(row.avgGuessRatePercent))}
          {renderMetricLine("Risk Mix", row.riskMixLabel)}
          {renderMetricLine("Controlled Delta", formatPercent(row.avgControlledModeDelta))}
        </div>
      ),
    });
  }

  columns.push({
    id: "drill",
    header: "Drill Actions",
    render: (row) => {
      const scopeQuery = buildScopeQuery({
        academicYear: row.academicYear,
        batch: row.batchId,
        layer,
      });

      return (
        <div className="admin-analytics-drill-links">
          <NavLink className="admin-primary-link" to={`/admin/students/batches${scopeQuery}`}>
            Open Batch Analysis
          </NavLink>
          <NavLink className="admin-primary-link" to={`/admin/students/list${scopeQuery}`}>
            View Students in Batch
          </NavLink>
          <NavLink className="admin-primary-link" to={`/admin/assignments/list${scopeQuery}`}>
            Open Assignments List
          </NavLink>
          <NavLink className="admin-primary-link" to={`/admin/insights/risk${scopeQuery}`}>
            Open Risk Overview
          </NavLink>
        </div>
      );
    },
  });

  return columns;
}

function BatchAnalyticsDashboardPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<CrossBatchFilters>({
    academicYear: "all",
    dateStart: "",
    dateEnd: "",
    subject: "all",
    program: "all",
    mode: "all",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic cross-batch analytics fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: cross-batch analytics hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load cross-batch analytics data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic analytics fixtures.`);
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

  const runs = useMemo(() => deriveRunRecords(dataset.runAnalytics), [dataset.runAnalytics]);
  const yearOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.academicYear))], [runs]);
  const subjectOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.subject))], [runs]);
  const programOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.program))], [runs]);

  const filteredRuns = useMemo(() => {
    return runs
      .filter((run) => (filters.academicYear === "all" || run.academicYear === filters.academicYear))
      .filter((run) => (filters.subject === "all" || run.subject === filters.subject))
      .filter((run) => (filters.program === "all" || run.program === filters.program))
      .filter((run) => (filters.mode === "all" || run.mode === filters.mode))
      .filter((run) => {
        const parsed = Date.parse(run.startedAt);
        if (Number.isNaN(parsed)) {
          return false;
        }
        const start = filters.dateStart ? Date.parse(filters.dateStart) : null;
        const end = filters.dateEnd ? Date.parse(filters.dateEnd) : null;
        return (start === null || parsed >= start) && (end === null || parsed <= end);
      });
  }, [filters, runs]);

  const rows = useMemo(() => deriveBatchRecords(filteredRuns, dataset.studentYearMetrics), [dataset.studentYearMetrics, filteredRuns]);
  const effectiveLayer = useMemo<AnalyticsLayer>(
    () => (isL2OrAbove ? "L2" : (isL1OrAbove ? "L1" : "L0")),
    [isL1OrAbove, isL2OrAbove],
  );
  const kpis = useMemo(() => buildKpis(rows, effectiveLayer), [effectiveLayer, rows]);
  const columns = useMemo(() => buildColumns(effectiveLayer), [effectiveLayer]);

  const charts = useMemo(() => {
    const items = [
      {
        title: "Batch vs Batch Avg Raw Score",
        subtitle: "L0 raw score comparison across cohorts",
        data: toChartPoints(rows, (row) => row.avgRawScorePercent),
      },
      {
        title: "Batch vs Batch Avg Accuracy",
        subtitle: "L0 accuracy comparison across cohorts",
        data: toChartPoints(rows, (row) => row.avgAccuracyPercent),
      },
      {
        title: "Batch Participation Comparison",
        subtitle: "L0 participation comparison",
        data: toChartPoints(rows, (row) => row.avgParticipationPercent),
      },
      {
        title: "Top and Bottom Batch Comparison",
        subtitle: "L0 blended score comparison",
        data: toChartPoints(rows, (row) => (row.avgRawScorePercent + row.avgAccuracyPercent) / 2),
      },
    ];

    if (effectiveLayer === "L1" || effectiveLayer === "L2") {
      items.push(
        {
          title: "Phase Adherence by Batch",
          subtitle: "L1 cohort discipline quality",
          data: toChartPoints(rows, (row) => row.avgPhaseAdherencePercent),
        },
        {
          title: "Easy Neglect by Batch",
          subtitle: "L1 cohort neglect pressure",
          data: toChartPoints(rows, (row) => row.avgEasyNeglectPercent),
        },
        {
          title: "Hard Bias by Batch",
          subtitle: "L1 cohort hard-bias pressure",
          data: toChartPoints(rows, (row) => row.avgHardBiasPercent),
        },
      );
    }

    if (effectiveLayer === "L2") {
      items.push(
        {
          title: "Discipline by Batch",
          subtitle: "L2 batch execution discipline",
          data: toChartPoints(rows, (row) => row.avgDisciplineIndex),
        },
        {
          title: "Guess Rate by Batch",
          subtitle: "L2 guess pressure by cohort",
          data: toChartPoints(rows, (row) => row.avgGuessRatePercent),
        },
        {
          title: "Risk Distribution by Batch",
          subtitle: "L2 risk-heavy run count by batch",
          data: toChartPoints(rows, (row) => row.highRiskRunCount * 20),
        },
        {
          title: "Stability Breakdown by Batch",
          subtitle: "L2 stability flag proxy",
          data: toChartPoints(rows, (row) => row.stabilityFlag === "Stable" ? 88 : (row.stabilityFlag === "Watch" ? 62 : 34)),
        },
        {
          title: "Controlled Mode Delta by Batch",
          subtitle: "L2 controlled-mode shift by cohort",
          data: toChartPoints(rows, (row) => row.avgControlledModeDelta),
        },
      );
    }

    return items;
  }, [effectiveLayer, rows]);

  const note = isLoading ?
    "Loading cross-batch analytics from GET /admin/analytics..." :
    `${inlineMessage ?? "Cross-batch analytics ready."} This page helps teachers compare batches quickly, then move into Students, Assignments, or Insights for deeper follow-up. ${effectiveLayer} details appear automatically from the institute license.`;

  return (
    <section className="admin-content-card" aria-labelledby="admin-cross-batch-title">
      <AnalyticsWorkspaceNav />
      <div className="admin-analytics-run-detail-header">
        <div>
          <p className="admin-content-eyebrow">Analytics / Cross-Batch Analytics</p>
          <h2 id="admin-cross-batch-title">Cross-Batch Analytics</h2>
          <p>
            Compare batches side by side across outcomes, participation, and support signals in a simpler teacher-facing view.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">License layer {effectiveLayer}</div>
      </div>

      <p className="admin-analytics-inline-note">{note}</p>

      <div className="admin-analytics-filter-grid">
        <label htmlFor="cross-batch-year">
          Academic Year
          <select id="cross-batch-year" value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
            {yearOptions.map((year) => <option key={year} value={year}>{year === "all" ? "All years" : year}</option>)}
          </select>
        </label>
        <label htmlFor="cross-batch-start">
          Date Range Start
          <input id="cross-batch-start" type="date" value={filters.dateStart} onChange={(event) => setFilters((current) => ({ ...current, dateStart: event.target.value }))} />
        </label>
        <label htmlFor="cross-batch-end">
          Date Range End
          <input id="cross-batch-end" type="date" value={filters.dateEnd} onChange={(event) => setFilters((current) => ({ ...current, dateEnd: event.target.value }))} />
        </label>
        <label htmlFor="cross-batch-subject">
          Subject
          <select id="cross-batch-subject" value={filters.subject} onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}>
            {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject === "all" ? "All subjects" : subject}</option>)}
          </select>
        </label>
        <label htmlFor="cross-batch-program">
          Exam Type
          <select id="cross-batch-program" value={filters.program} onChange={(event) => setFilters((current) => ({ ...current, program: event.target.value }))}>
            {programOptions.map((program) => <option key={program} value={program}>{program === "all" ? "All Exams" : program}</option>)}
          </select>
        </label>
        <label htmlFor="cross-batch-mode">
          Mode
          <select id="cross-batch-mode" value={filters.mode} onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}>
            <option value="all">All modes</option>
            {BATCH_ANALYTICS_MODE_OPTIONS.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-analytics-kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="admin-analytics-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-analytics-chart-grid">
        {charts.map((chart) => (
          <UiChartContainer key={chart.title} title={chart.title} subtitle={chart.subtitle} data={chart.data} maxValue={100} />
        ))}
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="cross-batch-table-title">
        <h3 id="cross-batch-table-title">Comparison Table</h3>
        <UiTable
          caption="Lean teacher review table for comparing batches"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.batchId}
        />
      </section>
    </section>
  );
}

export default BatchAnalyticsDashboardPage;
