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
  deriveRunRecords,
  deriveTemplateRecords,
  type DerivedTemplateRecord,
} from "./analyticsArchitecture";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
} from "./analyticsDataset";

interface CrossTemplateFilters {
  academicYear: string;
  dateStart: string;
  dateEnd: string;
  subject: string;
  batch: string;
  mode: string;
}

interface KpiCard {
  label: string;
  value: string;
  helper: string;
}

const TEMPLATE_ANALYTICS_MODE_OPTIONS = [
  {
    value: "Operational",
    label: "Operational",
  },
  {
    value: "Controlled",
    label: "Controlled",
  },
  {
    value: "Focused",
    label: "Focused",
  },
  {
    value: "Hard",
    label: "Hard",
  },
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

function toChartPoints(rows: DerivedTemplateRecord[], selector: (row: DerivedTemplateRecord) => number): UiChartPoint[] {
  return rows.map((row) => ({
    label: row.templateName,
    value: Math.round(selector(row)),
  }));
}

function buildKpis(rows: DerivedTemplateRecord[], layer: AnalyticsLayer): KpiCard[] {
  const cards: KpiCard[] = [
    {
      label: "Tests in View",
      value: String(rows.length),
      helper: "Tests included in this review",
    },
    {
      label: "Total Runs",
      value: String(rows.reduce((sum, row) => sum + row.totalRuns, 0)),
      helper: "Recent class runs behind this summary",
    },
    {
      label: "Avg Runs per Test",
      value: rows.length > 0 ? String(Math.round(rows.reduce((sum, row) => sum + row.totalRuns, 0) / rows.length)) : "0",
      helper: "Typical usage per test",
    },
    {
      label: "Avg Raw Score",
      value: formatPercent(average(rows.map((row) => row.avgRawScorePercent))),
      helper: "Average result across visible tests",
    },
    {
      label: "Avg Accuracy",
      value: formatPercent(average(rows.map((row) => row.avgAccuracyPercent))),
      helper: "Average accuracy across visible tests",
    },
  ];

  if (layer === "L1" || layer === "L2") {
    cards.push(
      {
        label: "Avg Phase Adherence",
        value: formatPercent(average(rows.map((row) => average(row.runs.map((run) => run.phaseAdherencePercent))))),
        helper: "Average pacing discipline across tests",
      },
      {
        label: "Avg Easy Neglect",
        value: formatPercent(average(rows.map((row) => row.avgRiskShiftPercent * 0.45))),
        helper: "Approximate easy-question neglect signal",
      },
      {
        label: "Avg Hard Bias",
        value: formatPercent(average(rows.map((row) => row.avgRiskShiftPercent * 0.35))),
        helper: "Approximate hard-question overfocus signal",
      },
    );
  }

  if (layer === "L2") {
    cards.push(
      {
        label: "Avg Discipline Index",
        value: formatPercent(average(rows.map((row) => row.avgDisciplineIndex))),
        helper: "Execution steadiness across tests",
      },
      {
        label: "Avg Guess Rate",
        value: formatPercent(average(rows.map((row) => row.avgRiskShiftPercent * 0.5))),
        helper: "Estimated guess-pressure signal",
      },
      {
        label: "Avg Controlled Mode Delta",
        value: formatPercent(average(rows.map((row) => row.avgControlledModeDelta))),
        helper: "Change seen in controlled delivery",
      },
      {
        label: "Tests Needing Review",
        value: String(rows.filter((row) => row.avgRiskShiftPercent >= 18).length),
        helper: "Tests showing stronger risk drift",
      },
      {
        label: "Unsteady Tests",
        value: String(rows.filter((row) => row.stabilityFlag === "Unstable").length),
        helper: "Tests with less consistent execution",
      },
    );
  }

  return cards;
}

function buildColumns(layer: AnalyticsLayer): UiTableColumn<DerivedTemplateRecord>[] {
  const columns: UiTableColumn<DerivedTemplateRecord>[] = [
    {
      id: "name",
      header: "Test",
      render: (row) => (
        <div className="admin-analytics-run-cell">
          <strong>{row.templateName}</strong>
          <small>{row.subject} · Last used {row.runs[0]?.completedOn.slice(0, 10) ?? "N/A"}</small>
        </div>
      ),
    },
    {
      id: "usage",
      header: "Usage",
      render: (row) => (
        <div className="admin-analytics-score-cell">
          {renderMetricLine("Runs", String(row.totalRuns))}
          {renderMetricLine("Batches", String(new Set(row.runs.map((run) => run.runName.split("/")[1]?.trim() || "Shared scope")).size))}
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
          {renderMetricLine("Phase Adherence", formatPercent(average(row.runs.map((run) => run.phaseAdherencePercent))))}
          {renderMetricLine("Main Pattern", row.dominantBehaviorTag)}
          {renderMetricLine("Phase Variance", formatPercent(row.phaseAdherenceVariance))}
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
          {renderMetricLine("Risk Mix", row.riskMixLabel)}
          {renderMetricLine("Risk Shift", formatPercent(row.avgRiskShiftPercent))}
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
        subject: row.subject,
        layer,
      });

      return (
        <div className="admin-analytics-drill-links">
          <NavLink className="admin-primary-link" to={`/admin/tests/library${scopeQuery}`}>
            Open Template Detail
          </NavLink>
          <NavLink className="admin-primary-link" to={`/admin/assignments/list${scopeQuery}`}>
            Open Assignments List
          </NavLink>
          <NavLink className="admin-primary-link" to={`/admin/students/batches${scopeQuery}`}>
            Open Batch Analysis
          </NavLink>
        </div>
      );
    },
  });

  return columns;
}

function AdminTemplateAnalyticsPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<CrossTemplateFilters>({
    academicYear: "all",
    dateStart: "",
    dateEnd: "",
    subject: "all",
    batch: "all",
    mode: "all",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic cross-template analytics fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: cross-template analytics hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load cross-template analytics data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic analytics fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  const runs = useMemo(() => deriveRunRecords(dataset.runAnalytics), [dataset.runAnalytics]);
  const yearOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.academicYear))], [runs]);
  const subjectOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.subject))], [runs]);
  const batchOptions = useMemo(() => ["all", ...new Set(runs.map((run) => run.batchName))], [runs]);

  const filteredRuns = useMemo(() => {
    return runs
      .filter((run) => (filters.academicYear === "all" || run.academicYear === filters.academicYear))
      .filter((run) => (filters.subject === "all" || run.subject === filters.subject))
      .filter((run) => (filters.batch === "all" || run.batchName === filters.batch))
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

  const rows = useMemo(() => deriveTemplateRecords(filteredRuns), [filteredRuns]);
  const effectiveLayer = useMemo<AnalyticsLayer>(
    () => (isL2OrAbove ? "L2" : (isL1OrAbove ? "L1" : "L0")),
    [isL1OrAbove, isL2OrAbove],
  );
  const kpis = useMemo(() => buildKpis(rows, effectiveLayer), [effectiveLayer, rows]);
  const columns = useMemo(() => buildColumns(effectiveLayer), [effectiveLayer]);

  const charts = useMemo(() => {
    const items = [
      {
        title: "Template vs Template Avg Raw Score",
        subtitle: "L0 template score comparison",
        data: toChartPoints(rows, (row) => row.avgRawScorePercent),
      },
      {
        title: "Template vs Template Avg Accuracy",
        subtitle: "L0 template accuracy comparison",
        data: toChartPoints(rows, (row) => row.avgAccuracyPercent),
      },
      {
        title: "Template Usage Frequency",
        subtitle: "L0 total run volume by template",
        data: toChartPoints(rows, (row) => row.totalRuns),
      },
      {
        title: "Top and Bottom Template Comparison",
        subtitle: "L0 effectiveness ranking snapshot",
        data: toChartPoints(rows, (row) => row.templateEffectivenessRating),
      },
    ];

    if (effectiveLayer === "L1" || effectiveLayer === "L2") {
      items.push(
        {
          title: "Phase Adherence by Template",
          subtitle: "L1 template discipline quality",
          data: toChartPoints(rows, (row) => average(row.runs.map((run) => run.phaseAdherencePercent))),
        },
        {
          title: "Easy Neglect by Template",
          subtitle: "L1 neglect proxy across templates",
          data: toChartPoints(rows, (row) => row.avgRiskShiftPercent * 0.45),
        },
        {
          title: "Hard Bias by Template",
          subtitle: "L1 hard-bias proxy across templates",
          data: toChartPoints(rows, (row) => row.avgRiskShiftPercent * 0.35),
        },
      );
    }

    if (effectiveLayer === "L2") {
      items.push(
        {
          title: "Discipline by Template",
          subtitle: "L2 execution discipline index",
          data: toChartPoints(rows, (row) => row.avgDisciplineIndex),
        },
        {
          title: "Guess Rate by Template",
          subtitle: "L2 guess-rate proxy across templates",
          data: toChartPoints(rows, (row) => row.avgRiskShiftPercent * 0.5),
        },
        {
          title: "Risk Distribution by Template",
          subtitle: "L2 risk shift concentration",
          data: toChartPoints(rows, (row) => row.avgRiskShiftPercent),
        },
        {
          title: "Stability Breakdown by Template",
          subtitle: "L2 stability flag proxy",
          data: toChartPoints(rows, (row) => row.stabilityFlag === "Stable" ? 88 : (row.stabilityFlag === "Watch" ? 62 : 34)),
        },
      );
    }

    return items;
  }, [effectiveLayer, rows]);

  const note = isLoading ?
    "Loading cross-template analytics from GET /admin/analytics..." :
    `${inlineMessage ?? "Cross-template analytics ready."} This page helps teachers compare tests quickly, then jump into the main Tests, Assignments, or Batch pages for follow-up work. ${effectiveLayer} details appear automatically from the institute license.`;

  return (
    <section className="admin-content-card" aria-labelledby="admin-cross-template-title">
      <AnalyticsWorkspaceNav />
      <div className="admin-analytics-run-detail-header">
        <div>
          <p className="admin-content-eyebrow">Analytics / Cross-Template Analytics</p>
          <h2 id="admin-cross-template-title">Cross-Template Analytics</h2>
          <p>
            Compare tests across recent use, class coverage, and outcome patterns without overloading the table with extra operational detail.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">License layer {effectiveLayer}</div>
      </div>

      <p className="admin-analytics-inline-note">{note}</p>

      <div className="admin-analytics-filter-grid">
        <label htmlFor="cross-template-year">
          Academic Year
          <select id="cross-template-year" value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
            {yearOptions.map((year) => <option key={year} value={year}>{year === "all" ? "All years" : year}</option>)}
          </select>
        </label>
        <label htmlFor="cross-template-start">
          Date Range Start
          <input id="cross-template-start" type="date" value={filters.dateStart} onChange={(event) => setFilters((current) => ({ ...current, dateStart: event.target.value }))} />
        </label>
        <label htmlFor="cross-template-end">
          Date Range End
          <input id="cross-template-end" type="date" value={filters.dateEnd} onChange={(event) => setFilters((current) => ({ ...current, dateEnd: event.target.value }))} />
        </label>
        <label htmlFor="cross-template-subject">
          Subject
          <select id="cross-template-subject" value={filters.subject} onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}>
            {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject === "all" ? "All subjects" : subject}</option>)}
          </select>
        </label>
        <label htmlFor="cross-template-batch">
          Batch
          <select id="cross-template-batch" value={filters.batch} onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}>
            {batchOptions.map((batch) => <option key={batch} value={batch}>{batch === "all" ? "All batches" : batch}</option>)}
          </select>
        </label>
        <label htmlFor="cross-template-mode">
          Mode
          <select id="cross-template-mode" value={filters.mode} onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}>
            <option value="all">All modes</option>
            {TEMPLATE_ANALYTICS_MODE_OPTIONS.map((mode) => (
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

      <section className="admin-analytics-run-summary" aria-labelledby="cross-template-table-title">
        <h3 id="cross-template-table-title">Comparison Table</h3>
        <UiTable
          caption="Lean teacher review table for comparing tests"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.templateId}
        />
      </section>
    </section>
  );
}

export default AdminTemplateAnalyticsPage;
