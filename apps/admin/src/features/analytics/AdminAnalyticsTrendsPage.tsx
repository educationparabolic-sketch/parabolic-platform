import { useMemo } from "react";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { formatPercent, shouldUseLiveApi } from "./analyticsDataset";
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

function AdminAnalyticsTrendsPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const latestMonth = MONTHLY_TREND_FIXTURES[MONTHLY_TREND_FIXTURES.length - 1] ?? null;

  const rawTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.avgRawScorePercent),
    [],
  );
  const accuracyTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.avgAccuracyPercent),
    [],
  );
  const participationTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.participationRatePercent),
    [],
  );
  const phaseTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.phaseAdherencePercent),
    [],
  );
  const neglectTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.easyNeglectPercent),
    [],
  );
  const weaknessTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.topicWeaknessPercent),
    [],
  );
  const disciplineTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.disciplineIndexPercent),
    [],
  );
  const controlledModeTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.controlledModeEffectivenessPercent),
    [],
  );
  const stabilityTrend = useMemo(
    () => toChartPoints(MONTHLY_TREND_FIXTURES, (row) => row.stabilityTrajectoryPercent),
    [],
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

  const inlineMessage = shouldUseLiveApi() ?
    "Dedicated trends route is mounted. Live monthlySummary hydration remains tracked separately while this workspace uses summary-safe monthly fixtures." :
    "Local mode detected. Loaded deterministic monthlySummary fixtures for the dedicated analytics trends workspace.";

  return (
    <section className="admin-content-card" aria-labelledby="admin-analytics-trends-title">
      <p className="admin-content-eyebrow">Analytics Trends Workspace</p>
      <h2 id="admin-analytics-trends-title">Monthly Performance and Stability Trends</h2>
      <p className="admin-content-copy">
        This dedicated analytics trends route keeps <code>/admin/analytics/trends</code> separate from the overview
        shell. It uses summary-safe <code>monthlySummary</code> style records for time-based aggregation rather than
        recomputing trends from run-level data.
      </p>

      <AnalyticsWorkspaceNav />

      <p className="admin-analytics-inline-note">{inlineMessage}</p>

      <div className="admin-risk-summary-card">
        <h4>Monthly Summary Scope</h4>
        <p>
          Trend cards below track month-over-month performance, participation, and execution quality using immutable
          summary documents for the current academic year.
        </p>
        <small>Route: /admin/analytics/trends</small>
      </div>

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
          subtitle="L0 trend from monthly summary documents"
          data={rawTrend}
          maxValue={100}
          variant="line"
        />
        <UiChartContainer
          title="Monthly Avg Accuracy"
          subtitle="L0 trend from monthly summary documents"
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
            L0 trendlines show month-over-month raw score, accuracy, and participation shifts without dropping into
            run-level recomputation.
          </p>
          <small>monthlySummary aggregation only</small>
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
          rows={MONTHLY_TREND_FIXTURES}
          rowKey={(row) => row.monthId}
          emptyStateText="No monthly trend summaries are available."
        />
      </section>
    </section>
  );
}

export default AdminAnalyticsTrendsPage;
