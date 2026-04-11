import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
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
} from "./analyticsDataset";

interface BatchAggregate {
  batchId: string;
  batchName: string;
  runCount: number;
  participantCount: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgScorePercent: number;
  avgDisciplineIndex: number;
  highRiskPercent: number;
  riskDistribution: Record<RiskCluster, number>;
}

interface TrendSeries {
  batchId: string;
  batchName: string;
  points: UiChartPoint[];
}

function batchKey(batchId: string, batchName: string): string {
  const trimmedId = batchId.trim().toLowerCase();
  if (trimmedId.length > 0) {
    return trimmedId;
  }

  const trimmedName = batchName.trim().toLowerCase();
  return trimmedName.length > 0 ? trimmedName : "unassigned";
}

function buildBatchAggregates(dataset: DashboardDataset): BatchAggregate[] {
  const runMap = new Map<string, BatchAggregate>();

  for (const run of dataset.runAnalytics) {
    const key = batchKey(run.batchId, run.batchName);
    const existing = runMap.get(key);

    if (!existing) {
      runMap.set(key, {
        batchId: run.batchId,
        batchName: run.batchName,
        runCount: 1,
        participantCount: run.participants,
        avgRawScorePercent: run.avgRawScorePercent,
        avgAccuracyPercent: run.avgAccuracyPercent,
        avgScorePercent: (run.avgRawScorePercent + run.avgAccuracyPercent) / 2,
        avgDisciplineIndex: run.disciplineIndexAverage,
        highRiskPercent: 0,
        riskDistribution: { ...run.riskDistribution },
      });
      continue;
    }

    existing.runCount += 1;
    existing.participantCount += run.participants;
    existing.avgRawScorePercent += run.avgRawScorePercent;
    existing.avgAccuracyPercent += run.avgAccuracyPercent;
    existing.avgScorePercent += (run.avgRawScorePercent + run.avgAccuracyPercent) / 2;
    existing.avgDisciplineIndex += run.disciplineIndexAverage;
    for (const cluster of RISK_CLUSTERS) {
      existing.riskDistribution[cluster] += run.riskDistribution[cluster];
    }
  }

  const studentGroupMap = new Map<string, { studentCount: number; disciplineSum: number; highRiskCount: number }>();

  for (const student of dataset.studentYearMetrics) {
    const key = batchKey(student.batchId, student.batchName);
    const existing = studentGroupMap.get(key);
    const isHighRisk = student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical";

    if (!existing) {
      studentGroupMap.set(key, {
        studentCount: 1,
        disciplineSum: student.disciplineIndex,
        highRiskCount: isHighRisk ? 1 : 0,
      });
      continue;
    }

    existing.studentCount += 1;
    existing.disciplineSum += student.disciplineIndex;
    if (isHighRisk) {
      existing.highRiskCount += 1;
    }
  }

  for (const aggregate of runMap.values()) {
    const key = batchKey(aggregate.batchId, aggregate.batchName);
    const studentGroup = studentGroupMap.get(key);

    aggregate.avgRawScorePercent = aggregate.runCount > 0 ? aggregate.avgRawScorePercent / aggregate.runCount : 0;
    aggregate.avgAccuracyPercent = aggregate.runCount > 0 ? aggregate.avgAccuracyPercent / aggregate.runCount : 0;
    aggregate.avgScorePercent = aggregate.runCount > 0 ? aggregate.avgScorePercent / aggregate.runCount : 0;

    if (studentGroup && studentGroup.studentCount > 0) {
      aggregate.avgDisciplineIndex = studentGroup.disciplineSum / studentGroup.studentCount;
      aggregate.highRiskPercent = (studentGroup.highRiskCount / studentGroup.studentCount) * 100;
    } else {
      aggregate.avgDisciplineIndex = aggregate.runCount > 0 ? aggregate.avgDisciplineIndex / aggregate.runCount : 0;
      aggregate.highRiskPercent = 0;
    }
  }

  return [...runMap.values()].sort((left, right) => right.avgScorePercent - left.avgScorePercent);
}

function buildTrendSeries(dataset: DashboardDataset): TrendSeries[] {
  const bucket = new Map<string, { batchId: string; batchName: string; runs: DashboardDataset["runAnalytics"] }>();

  for (const run of dataset.runAnalytics) {
    const key = batchKey(run.batchId, run.batchName);
    const existing = bucket.get(key);

    if (!existing) {
      bucket.set(key, {
        batchId: run.batchId,
        batchName: run.batchName,
        runs: [run],
      });
      continue;
    }

    existing.runs.push(run);
  }

  return [...bucket.values()]
    .map((entry) => {
      const orderedRuns = [...entry.runs].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
      return {
        batchId: entry.batchId,
        batchName: entry.batchName,
        points: orderedRuns.map((run) => ({
          label: formatIsoDate(run.startedAt),
          value: Math.round((run.avgRawScorePercent + run.avgAccuracyPercent) / 2),
        })),
      };
    })
    .sort((left, right) => left.batchName.localeCompare(right.batchName));
}

function batchDisciplineChart(aggregates: BatchAggregate[]): UiChartPoint[] {
  return aggregates.map((aggregate) => ({
    label: aggregate.batchName,
    value: Math.round(aggregate.avgDisciplineIndex),
  }));
}

function batchRiskDistributionChart(aggregate: BatchAggregate | null): UiChartPoint[] {
  if (!aggregate) {
    return RISK_CLUSTERS.map((cluster) => ({
      label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
      value: 0,
    }));
  }

  return RISK_CLUSTERS.map((cluster) => ({
    label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
    value: aggregate.riskDistribution[cluster],
  }));
}

function BatchAnalyticsDashboardPage() {
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic runAnalytics and studentYearMetrics fixtures for Build 122.",
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
        setInlineMessage("Live mode enabled: batch analytics dashboard hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load batch analytics data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 122 fixtures.`);
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

  const aggregates = useMemo(() => buildBatchAggregates(dataset), [dataset]);
  const trendSeries = useMemo(() => buildTrendSeries(dataset), [dataset]);
  const disciplineChartData = useMemo(() => batchDisciplineChart(aggregates), [aggregates]);
  const primaryBatch = useMemo(() => (aggregates.length > 0 ? aggregates[0] : null), [aggregates]);
  const riskDistributionData = useMemo(() => batchRiskDistributionChart(primaryBatch), [primaryBatch]);

  const kpis = useMemo(() => {
    const totalBatches = aggregates.length;
    const averageScore =
      totalBatches > 0
        ? aggregates.reduce((sum, aggregate) => sum + aggregate.avgScorePercent, 0) / totalBatches
        : 0;
    const averageDiscipline =
      totalBatches > 0
        ? aggregates.reduce((sum, aggregate) => sum + aggregate.avgDisciplineIndex, 0) / totalBatches
        : 0;
    const highestRiskBatch =
      aggregates.length > 0
        ? [...aggregates].sort((left, right) => right.highRiskPercent - left.highRiskPercent)[0]?.batchName ?? "N/A"
        : "N/A";

    return [
      { label: "Active Batches", value: `${totalBatches}`, helper: "runAnalytics groups" },
      { label: "Average Score", value: formatPercent(averageScore), helper: "avg raw + accuracy" },
      { label: "Average Discipline", value: formatPercent(averageDiscipline), helper: "studentYearMetrics" },
      { label: "Highest Risk Batch", value: highestRiskBatch, helper: "high + critical share" },
    ];
  }, [aggregates]);

  const comparisonColumns = useMemo<UiTableColumn<BatchAggregate>[]>(
    () => [
      {
        id: "batch",
        header: "Batch",
        render: (aggregate) => (
          <div className="admin-batch-cell">
            <strong>{aggregate.batchName}</strong>
            <small>{aggregate.batchId}</small>
          </div>
        ),
      },
      {
        id: "activity",
        header: "Runs / Participants",
        render: (aggregate) => (
          <div className="admin-batch-cell">
            <strong>{aggregate.runCount} runs</strong>
            <small>{aggregate.participantCount} participants</small>
          </div>
        ),
      },
      {
        id: "scores",
        header: "Average Scores",
        render: (aggregate) => (
          <div className="admin-batch-cell">
            <strong>{formatPercent(aggregate.avgScorePercent)}</strong>
            <small>
              Raw {formatPercent(aggregate.avgRawScorePercent)} | Accuracy {formatPercent(aggregate.avgAccuracyPercent)}
            </small>
          </div>
        ),
      },
      {
        id: "discipline",
        header: "Discipline",
        render: (aggregate) => formatPercent(aggregate.avgDisciplineIndex),
      },
      {
        id: "risk",
        header: "High-Risk Share",
        render: (aggregate) => formatPercent(aggregate.highRiskPercent),
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-batch-analytics-title">
      <p className="admin-content-eyebrow">Batch Analytics Dashboard</p>
      <h2 id="admin-batch-analytics-title">Cross-Batch Performance, Trends, and Risk Distribution</h2>
      <p className="admin-content-copy">
        Batch analytics dashboard sourced from <code>runAnalytics</code> and <code>studentYearMetrics</code> to compare
        academic performance, track time-series score trends, monitor batch discipline, and review batch-level risk
        distribution.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics">
          Back to Analytics Dashboard
        </NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/analytics/risk-insights">
          Open Risk Insights Dashboard
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading batch analytics dashboard..." : inlineMessage ?? "Batch analytics dashboard ready."}
      </p>

      <div className="admin-batch-kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="admin-batch-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-batch-chart-grid">
        <UiChartContainer
          title="Batch Discipline Metrics"
          subtitle="Average discipline index by batch"
          data={disciplineChartData}
        />
        <UiChartContainer
          title={`Batch Risk Distribution${primaryBatch ? ` (${primaryBatch.batchName})` : ""}`}
          subtitle="Risk cluster composition for the highest-performing batch"
          data={riskDistributionData}
          variant="pie"
        />
      </div>

      <div className="admin-batch-trend-section">
        <h3>Average Score Trends Across Runs</h3>
        <p className="admin-content-copy">
          Time-series trends below plot each batch's average score by run date where average score is
          <code> (avgRawScorePercent + avgAccuracyPercent) / 2</code>.
        </p>
        <div className="admin-batch-trend-grid">
          {trendSeries.map((series) => (
            <article key={series.batchId || series.batchName} className="admin-batch-trend-card">
              <h4>{series.batchName}</h4>
              <UiChartContainer
                title={`${series.batchName} Trend`}
                subtitle="Average score trajectory across recent runs"
                data={series.points}
                maxValue={100}
                variant="line"
              />
            </article>
          ))}
        </div>
      </div>

      <div className="admin-batch-table-section">
        <h3>Batch Performance Comparison</h3>
        <UiTable
          caption="Batch-level score, discipline, and risk comparison using summary collections"
          columns={comparisonColumns}
          rows={aggregates}
          rowKey={(row) => row.batchId}
          emptyStateText="No batch analytics rows available."
        />
      </div>
    </section>
  );
}

export default BatchAnalyticsDashboardPage;
