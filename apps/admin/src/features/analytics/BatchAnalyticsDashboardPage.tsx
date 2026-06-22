import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AnalyticsWorkspaceNav from "./AnalyticsWorkspaceNav";
import {
  ANALYTICS_LAYER_OPTIONS,
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
  layer: AnalyticsLayer;
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
      helper: "Batches in selected comparison scope",
    },
    {
      label: "Total Students in Scope",
      value: String(rows.reduce((sum, row) => sum + row.studentCount, 0)),
      helper: "Student cohorts represented",
    },
    {
      label: "Avg Raw Score Percentage",
      value: formatPercent(average(rows.map((row) => row.avgRawScorePercent))),
      helper: "Cross-batch score average",
    },
    {
      label: "Avg Accuracy Percentage",
      value: formatPercent(average(rows.map((row) => row.avgAccuracyPercent))),
      helper: "Cross-batch accuracy average",
    },
    {
      label: "Avg Participation Rate",
      value: formatPercent(average(rows.map((row) => row.avgParticipationPercent))),
      helper: "Cross-batch participation average",
    },
  ];

  if (layer === "L1" || layer === "L2") {
    cards.push(
      {
        label: "Avg Phase Adherence",
        value: formatPercent(average(rows.map((row) => row.avgPhaseAdherencePercent))),
        helper: "L1 cohort discipline average",
      },
      {
        label: "Avg Easy Neglect",
        value: formatPercent(average(rows.map((row) => row.avgEasyNeglectPercent))),
        helper: "L1 cohort neglect signal",
      },
      {
        label: "Avg Hard Bias",
        value: formatPercent(average(rows.map((row) => row.avgHardBiasPercent))),
        helper: "L1 cohort hard-bias signal",
      },
    );
  }

  if (layer === "L2") {
    cards.push(
      {
        label: "Avg Discipline Index",
        value: formatPercent(average(rows.map((row) => row.avgDisciplineIndex))),
        helper: "L2 execution quality",
      },
      {
        label: "Avg Guess Rate",
        value: formatPercent(average(rows.map((row) => row.avgGuessRatePercent))),
        helper: "L2 guess pressure",
      },
      {
        label: "Avg Controlled Mode Delta",
        value: formatPercent(average(rows.map((row) => row.avgControlledModeDelta))),
        helper: "L2 controlled-mode delta",
      },
      {
        label: "High-Risk Batch Count",
        value: String(rows.filter((row) => row.highRiskRunCount > 0).length),
        helper: "Batches with risk-heavy run clusters",
      },
      {
        label: "Unstable Batch Count",
        value: String(rows.filter((row) => row.stabilityFlag === "Unstable").length),
        helper: "Batches with unstable execution",
      },
    );
  }

  return cards;
}

function buildColumns(layer: AnalyticsLayer): UiTableColumn<DerivedBatchRecord>[] {
  const columns: UiTableColumn<DerivedBatchRecord>[] = [
    {
      id: "batch",
      header: "Batch Name",
      render: (row) => (
        <div className="admin-analytics-run-cell">
          <strong>{row.batchName}</strong>
          <small>{row.program} · {row.subjects.join(", ") || "General"}</small>
        </div>
      ),
    },
    {
      id: "year",
      header: "Academic Year",
      render: (row) => row.academicYear,
    },
    {
      id: "students",
      header: "Student Count",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          <strong>{row.studentCount}</strong>
          <small>Active {row.activeStudentCount}</small>
        </div>
      ),
    },
    {
      id: "activity",
      header: "Last Activity Window",
      render: (row) => formatIsoDate(row.lastActivityAt),
    },
    {
      id: "l0",
      header: "L0 Summary",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          <strong>{formatPercent(row.avgRawScorePercent)} / {formatPercent(row.avgAccuracyPercent)}</strong>
          <small>Participation {formatPercent(row.avgParticipationPercent)} · Completion {formatPercent(row.avgCompletionPercent)}</small>
        </div>
      ),
    },
  ];

  if (layer === "L1" || layer === "L2") {
    columns.push({
      id: "l1",
      header: "L1 Signals",
      render: (row) => (
        <div className="admin-analytics-discipline-cell">
          <strong>{formatPercent(row.avgPhaseAdherencePercent)}</strong>
          <small>Neglect {formatPercent(row.avgEasyNeglectPercent)} · Bias {formatPercent(row.avgHardBiasPercent)} · {row.dominantBehaviorTag}</small>
        </div>
      ),
    });
  }

  if (layer === "L2") {
    columns.push({
      id: "l2",
      header: "L2 Signals",
      render: (row) => (
        <div className="admin-analytics-discipline-cell">
          <strong>{formatPercent(row.avgDisciplineIndex)} · {row.stabilityFlag}</strong>
          <small>Guess {formatPercent(row.avgGuessRatePercent)} · {row.riskMixLabel} · Delta {formatPercent(row.avgControlledModeDelta)}</small>
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
    layer: isL2OrAbove ? "L2" : (isL1OrAbove ? "L1" : "L0"),
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
  const kpis = useMemo(() => buildKpis(rows, filters.layer), [filters.layer, rows]);
  const columns = useMemo(() => buildColumns(filters.layer), [filters.layer]);

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

    if (filters.layer === "L1" || filters.layer === "L2") {
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

    if (filters.layer === "L2") {
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
  }, [filters.layer, rows]);

  const note = isLoading ?
    "Loading cross-batch analytics from GET /admin/analytics..." :
    `${inlineMessage ?? "Cross-batch analytics ready."} This page compares institute cohorts only and routes one-batch deep work into Students or Insights pages.`;

  return (
    <section className="admin-content-card" aria-labelledby="admin-cross-batch-title">
      <AnalyticsWorkspaceNav />
      <div className="admin-analytics-run-detail-header">
        <div>
          <p className="admin-content-eyebrow">Analytics / Cross-Batch Analytics</p>
          <h2 id="admin-cross-batch-title">Cross-Batch Analytics</h2>
          <p>
            Compare cohorts institute-wide across performance, behavior, and execution quality without replacing the canonical batch workspace inside Students.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">Layer visibility {filters.layer}</div>
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
        <label htmlFor="cross-batch-layer">
          Layer Visibility
          <select id="cross-batch-layer" value={filters.layer} onChange={(event) => setFilters((current) => ({ ...current, layer: event.target.value as AnalyticsLayer }))}>
            {ANALYTICS_LAYER_OPTIONS.filter((layer) => (layer === "L2" ? isL2OrAbove : (layer === "L1" ? isL1OrAbove : true))).map((layer) => (
              <option key={layer} value={layer}>{layer}</option>
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
          caption="Cross-batch comparison table"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.batchId}
        />
      </section>
    </section>
  );
}

export default BatchAnalyticsDashboardPage;
