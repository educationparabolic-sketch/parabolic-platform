import { useEffect, useMemo, useState } from "react";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  fetchDashboardDataset,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type RunAnalyticsRecord,
} from "./analyticsDataset";
import AnalyticsWorkspaceNav from "./AnalyticsWorkspaceNav";

interface MonthlyTrendRecord {
  monthId: string;
  monthLabel: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  participationRatePercent: number;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  topicWeaknessPercent: number;
  disciplineIndexPercent: number;
  controlledModeEffectivenessPercent: number;
  stabilityTrajectoryPercent: number;
}

const MONTHLY_TREND_FIXTURES: MonthlyTrendRecord[] = [
  {
    monthId: "2026-01",
    monthLabel: "Jan 2026",
    avgRawScorePercent: 58,
    avgAccuracyPercent: 67,
    participationRatePercent: 88,
    phaseAdherencePercent: 71,
    easyNeglectPercent: 24,
    topicWeaknessPercent: 29,
    disciplineIndexPercent: 62,
    controlledModeEffectivenessPercent: 10,
    stabilityTrajectoryPercent: 61,
  },
  {
    monthId: "2026-02",
    monthLabel: "Feb 2026",
    avgRawScorePercent: 61,
    avgAccuracyPercent: 69,
    participationRatePercent: 90,
    phaseAdherencePercent: 74,
    easyNeglectPercent: 22,
    topicWeaknessPercent: 27,
    disciplineIndexPercent: 65,
    controlledModeEffectivenessPercent: 11,
    stabilityTrajectoryPercent: 64,
  },
  {
    monthId: "2026-03",
    monthLabel: "Mar 2026",
    avgRawScorePercent: 63,
    avgAccuracyPercent: 71,
    participationRatePercent: 91,
    phaseAdherencePercent: 76,
    easyNeglectPercent: 20,
    topicWeaknessPercent: 25,
    disciplineIndexPercent: 68,
    controlledModeEffectivenessPercent: 13,
    stabilityTrajectoryPercent: 68,
  },
  {
    monthId: "2026-04",
    monthLabel: "Apr 2026",
    avgRawScorePercent: 66,
    avgAccuracyPercent: 74,
    participationRatePercent: 93,
    phaseAdherencePercent: 79,
    easyNeglectPercent: 18,
    topicWeaknessPercent: 22,
    disciplineIndexPercent: 71,
    controlledModeEffectivenessPercent: 15,
    stabilityTrajectoryPercent: 72,
  },
  {
    monthId: "2026-05",
    monthLabel: "May 2026",
    avgRawScorePercent: 68,
    avgAccuracyPercent: 76,
    participationRatePercent: 95,
    phaseAdherencePercent: 82,
    easyNeglectPercent: 16,
    topicWeaknessPercent: 19,
    disciplineIndexPercent: 74,
    controlledModeEffectivenessPercent: 17,
    stabilityTrajectoryPercent: 76,
  },
];

function toChartPoints(
  rows: MonthlyTrendRecord[],
  selector: (row: MonthlyTrendRecord) => number,
): UiChartPoint[] {
  return rows.map((row) => ({
    label: row.monthLabel,
    value: selector(row),
  }));
}

function formatMonthLabel(monthId: string): string {
  const parsed = Date.parse(`${monthId}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return monthId;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function groupRunsByMonth(runs: RunAnalyticsRecord[]): Map<string, RunAnalyticsRecord[]> {
  const monthGroups = new Map<string, RunAnalyticsRecord[]>();

  for (const run of runs) {
    const parsed = Date.parse(run.startedAt);
    if (Number.isNaN(parsed)) {
      continue;
    }

    const monthId = new Date(parsed).toISOString().slice(0, 7);
    const existing = monthGroups.get(monthId) ?? [];
    existing.push(run);
    monthGroups.set(monthId, existing);
  }

  return monthGroups;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildMonthlyTrendRows(dataset: DashboardDataset): MonthlyTrendRecord[] {
  const monthGroups = groupRunsByMonth(dataset.runAnalytics);

  return [...monthGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthId, runs]) => ({
      monthId,
      monthLabel: formatMonthLabel(monthId),
      avgRawScorePercent: Math.round(average(runs.map((run) => run.avgRawScorePercent))),
      avgAccuracyPercent: Math.round(average(runs.map((run) => run.avgAccuracyPercent))),
      participationRatePercent: Math.round(average(runs.map((run) => run.completionRatePercent))),
      phaseAdherencePercent: Math.round(average(runs.map((run) => run.avgPhaseAdherencePercent))),
      easyNeglectPercent: Math.round(average(runs.map((run) => run.easyNeglectPercent))),
      topicWeaknessPercent: Math.round(average(runs.map((run) => run.timeMisallocationPercent))),
      disciplineIndexPercent: Math.round(average(runs.map((run) => run.disciplineIndexAverage))),
      controlledModeEffectivenessPercent: Math.round(average(runs.map((run) => run.controlledCompliancePercent))),
      stabilityTrajectoryPercent: Math.round(
        average(
          runs.map(
            (run) =>
              Math.max(
                0,
                Math.min(
                  100,
                  run.disciplineIndexAverage -
                    ((run.pacingGuardrailViolationPercent + run.structuralOverridePercent + run.guessRatePercent) / 3),
                ),
              ),
          ),
        ),
      ),
    }));
}

function AdminAnalyticsTrendsPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [rows, setRows] = useState<MonthlyTrendRecord[]>(MONTHLY_TREND_FIXTURES);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTrends() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setRows(MONTHLY_TREND_FIXTURES);
        setInlineMessage(
          "Local mode detected. Loaded deterministic monthlySummary fixtures for the dedicated analytics trends workspace.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const dataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        const monthlyRows = buildMonthlyTrendRows(dataset);
        setRows(monthlyRows.length > 0 ? monthlyRows : MONTHLY_TREND_FIXTURES);
        setInlineMessage("Live mode enabled: trends hydrated from GET /admin/analytics summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load analytics trend data.";
        setRows(MONTHLY_TREND_FIXTURES);
        setInlineMessage(`${reason} Falling back to deterministic monthlySummary fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTrends();

    return () => {
      isMounted = false;
    };
  }, []);

  const latestMonth = rows[rows.length - 1] ?? null;

  const rawTrend = useMemo(
    () => toChartPoints(rows, (row) => row.avgRawScorePercent),
    [rows],
  );
  const accuracyTrend = useMemo(
    () => toChartPoints(rows, (row) => row.avgAccuracyPercent),
    [rows],
  );
  const participationTrend = useMemo(
    () => toChartPoints(rows, (row) => row.participationRatePercent),
    [rows],
  );
  const phaseTrend = useMemo(
    () => toChartPoints(rows, (row) => row.phaseAdherencePercent),
    [rows],
  );
  const neglectTrend = useMemo(
    () => toChartPoints(rows, (row) => row.easyNeglectPercent),
    [rows],
  );
  const weaknessTrend = useMemo(
    () => toChartPoints(rows, (row) => row.topicWeaknessPercent),
    [rows],
  );
  const disciplineTrend = useMemo(
    () => toChartPoints(rows, (row) => row.disciplineIndexPercent),
    [rows],
  );
  const controlledModeTrend = useMemo(
    () => toChartPoints(rows, (row) => row.controlledModeEffectivenessPercent),
    [rows],
  );
  const stabilityTrend = useMemo(
    () => toChartPoints(rows, (row) => row.stabilityTrajectoryPercent),
    [rows],
  );

  const monthlyColumns = useMemo<UiTableColumn<MonthlyTrendRecord>[]>(
    () => {
      const baseColumns: UiTableColumn<MonthlyTrendRecord>[] = [
        {
          id: "month",
          header: "Month",
          render: (row) => row.monthLabel,
        },
        {
          id: "raw",
          header: "Avg Raw",
          render: (row) => formatPercent(row.avgRawScorePercent),
        },
        {
          id: "accuracy",
          header: "Avg Accuracy",
          render: (row) => formatPercent(row.avgAccuracyPercent),
        },
        {
          id: "participation",
          header: "Participation",
          render: (row) => formatPercent(row.participationRatePercent),
        },
      ];

      if (!isL2OrAbove) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          id: "discipline",
          header: "Discipline",
          render: (row) => formatPercent(row.disciplineIndexPercent),
        },
        {
          id: "stability",
          header: "Stability",
          render: (row) => formatPercent(row.stabilityTrajectoryPercent),
        },
      ];
    },
    [isL2OrAbove],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-analytics-trends-title">
      <p className="admin-content-eyebrow">Analytics Trends Workspace</p>
      <h2 id="admin-analytics-trends-title">Monthly Performance and Stability Trends</h2>
      <p className="admin-content-copy">
        This dedicated analytics trends route keeps <code>/admin/analytics/trends</code> separate from the overview
        shell. It now hydrates from the live admin analytics summary payload when available, while preserving
        deterministic local fallback coverage for development.
      </p>

      <AnalyticsWorkspaceNav />

      {inlineMessage ? <p className="admin-analytics-inline-note">{inlineMessage}</p> : null}

      <div className="admin-risk-summary-card">
        <h4>Monthly Summary Scope</h4>
        <p>
          Trend cards below track month-over-month performance, participation, and execution quality using admin
          analytics summary fields for the current academic year.
        </p>
        <small>Route: /admin/analytics/trends</small>
      </div>

      {isLoading ? <p className="admin-analytics-inline-note">Loading monthly trend summaries...</p> : null}

      {latestMonth ? (
        <div className="admin-analytics-kpi-grid">
          <article className="admin-analytics-kpi-card">
            <p>Latest Month</p>
            <h3>{latestMonth.monthLabel}</h3>
            <small>current monthlySummary snapshot</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Avg Raw Score</p>
            <h3>{formatPercent(latestMonth.avgRawScorePercent)}</h3>
            <small>L0 monthly performance</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Avg Accuracy</p>
            <h3>{formatPercent(latestMonth.avgAccuracyPercent)}</h3>
            <small>L0 monthly performance</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Participation</p>
            <h3>{formatPercent(latestMonth.participationRatePercent)}</h3>
            <small>current month participation rate</small>
          </article>
          {isL2OrAbove ? (
            <>
              <article className="admin-analytics-kpi-card">
                <p>Discipline Index</p>
                <h3>{formatPercent(latestMonth.disciplineIndexPercent)}</h3>
                <small>L2 monthly discipline trend</small>
              </article>
              <article className="admin-analytics-kpi-card">
                <p>Stability Trajectory</p>
                <h3>{formatPercent(latestMonth.stabilityTrajectoryPercent)}</h3>
                <small>L2 execution stability</small>
              </article>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="admin-analytics-chart-grid">
        <UiChartContainer
          title="Monthly Avg Raw Score"
          subtitle="L0 trend from admin analytics summary payload"
          data={rawTrend}
          maxValue={100}
          variant="line"
        />
        <UiChartContainer
          title="Monthly Avg Accuracy"
          subtitle="L0 trend from admin analytics summary payload"
          data={accuracyTrend}
          maxValue={100}
          variant="line"
        />
        <UiChartContainer
          title="Participation Rate"
          subtitle="Participation trend by month"
          data={participationTrend}
          maxValue={100}
          variant="line"
        />
        {isL1OrAbove ? (
          <UiChartContainer
            title="Phase Adherence Trend"
            subtitle="L1 monthly phase trend"
            data={phaseTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
        {isL1OrAbove ? (
          <UiChartContainer
            title="Easy Neglect Trend"
            subtitle="L1 behavior signal trend"
            data={neglectTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
        {isL1OrAbove ? (
          <UiChartContainer
            title="Topic Weakness Trend"
            subtitle="L1 topic weakness trend"
            data={weaknessTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
        {isL2OrAbove ? (
          <UiChartContainer
            title="Discipline Index Trend"
            subtitle="L2 monthly discipline movement"
            data={disciplineTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
        {isL2OrAbove ? (
          <UiChartContainer
            title="Controlled Mode Effectiveness"
            subtitle="L2 controlled mode monthly delta"
            data={controlledModeTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
        {isL2OrAbove ? (
          <UiChartContainer
            title="Stability Trajectory"
            subtitle="L2 monthly stability score"
            data={stabilityTrend}
            maxValue={100}
            variant="line"
          />
        ) : null}
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Operational Trend Layer</h4>
          <p>
            L0 trendlines show month-over-month raw score, accuracy, and participation shifts through the admin
            analytics summary feed.
          </p>
          <small>Live summary payload with deterministic local fallback</small>
        </article>
        {isL1OrAbove ? (
          <article className="admin-risk-summary-card">
            <h4>Diagnostic Trend Layer</h4>
            <p>
              L1 adds phase adherence, easy neglect, and topic weakness trends so operators can see whether behavior
              signals are improving or compounding.
            </p>
            <small>L1 monthly diagnostics</small>
          </article>
        ) : null}
        {isL2OrAbove ? (
          <article className="admin-risk-summary-card">
            <h4>Execution Trend Layer</h4>
            <p>
              L2 unlocks discipline, controlled mode effectiveness, and stability trajectory so execution quality can
              be reviewed over time without raw session access.
            </p>
            <small>L2 summary-safe execution analytics</small>
          </article>
        ) : null}
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-analytics-trends-table-title">
        <h3 id="admin-analytics-trends-table-title">Monthly Trend Summary Table</h3>
        <UiTable
          caption="Monthly analytics trend summary"
          columns={monthlyColumns}
          rows={rows}
          rowKey={(row) => row.monthId}
          emptyStateText="No monthly trend summaries are available."
        />
      </section>
    </section>
  );
}

export default AdminAnalyticsTrendsPage;
