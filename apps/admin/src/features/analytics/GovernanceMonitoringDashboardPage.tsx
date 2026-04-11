import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  FALLBACK_GOVERNANCE_DATASET,
  GOVERNANCE_RISK_CLUSTERS,
  fetchGovernanceDataset,
  formatPercent,
  shouldUseLiveApi,
  type GovernanceDashboardDataset,
  type GovernanceRiskCluster,
  type GovernanceSnapshotRecord,
} from "./governanceDataset";

interface GovernanceKpi {
  label: string;
  value: string;
  helper: string;
}

interface MonthComparison {
  label: string;
  metric: "index" | "percent";
  currentValue: number;
  previousValue: number;
}

function clusterLabel(cluster: GovernanceRiskCluster): string {
  if (cluster === "driftProne") {
    return "Drift Prone";
  }
  if (cluster === "overextended") {
    return "Overextended";
  }
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

function monthLabel(month: string): string {
  const [year, monthValue] = month.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(monthValue);

  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return month;
  }

  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function toTrend(dataset: GovernanceDashboardDataset, selector: (snapshot: GovernanceSnapshotRecord) => number): UiChartPoint[] {
  return dataset.snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(selector(snapshot)),
  }));
}

function GovernanceMonitoringDashboardPage() {
  const [dataset, setDataset] = useState<GovernanceDashboardDataset>(FALLBACK_GOVERNANCE_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_GOVERNANCE_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic governanceSnapshots fixtures for Build 123.");
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchGovernanceDataset();
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: governance dashboard hydrated from POST /admin/governance/snapshots.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load governance snapshot data.";
        setDataset(FALLBACK_GOVERNANCE_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 123 fixtures.`);
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

  const orderedSnapshots = useMemo(
    () => [...dataset.snapshots].sort((left, right) => left.month.localeCompare(right.month)),
    [dataset.snapshots],
  );

  const latestSnapshot = orderedSnapshots[orderedSnapshots.length - 1] ?? null;
  const previousSnapshot = orderedSnapshots[orderedSnapshots.length - 2] ?? null;

  const kpis = useMemo<GovernanceKpi[]>(() => {
    if (!latestSnapshot) {
      return [
        { label: "Stability Index", value: "0", helper: "governanceSnapshots" },
        { label: "Phase Adherence", value: "0%", helper: "governanceSnapshots" },
        { label: "Override Frequency", value: "0%", helper: "governanceSnapshots" },
        { label: "Execution Integrity", value: "0%", helper: "governanceSnapshots" },
      ];
    }

    return [
      {
        label: "Stability Index",
        value: `${Math.round(latestSnapshot.stabilityIndex)}`,
        helper: "0-100 institutional stability",
      },
      {
        label: "Phase Adherence",
        value: formatPercent(latestSnapshot.phaseCompliancePercent),
        helper: "monthly compliance rate",
      },
      {
        label: "Override Frequency",
        value: formatPercent(latestSnapshot.overrideFrequency),
        helper: "override usage share",
      },
      {
        label: "Execution Integrity",
        value: formatPercent(latestSnapshot.executionIntegrityScore),
        helper: "structural execution quality",
      },
    ];
  }, [latestSnapshot]);

  const monthComparison = useMemo<MonthComparison[]>(() => {
    if (!latestSnapshot || !previousSnapshot) {
      return [];
    }

    return [
      {
        label: "Stability Index",
        metric: "index",
        currentValue: latestSnapshot.stabilityIndex,
        previousValue: previousSnapshot.stabilityIndex,
      },
      {
        label: "Phase Adherence",
        metric: "percent",
        currentValue: latestSnapshot.phaseCompliancePercent,
        previousValue: previousSnapshot.phaseCompliancePercent,
      },
      {
        label: "Override Frequency",
        metric: "percent",
        currentValue: latestSnapshot.overrideFrequency,
        previousValue: previousSnapshot.overrideFrequency,
      },
      {
        label: "Execution Integrity",
        metric: "percent",
        currentValue: latestSnapshot.executionIntegrityScore,
        previousValue: previousSnapshot.executionIntegrityScore,
      },
    ];
  }, [latestSnapshot, previousSnapshot]);

  const stabilityTrend = useMemo(() => toTrend({ snapshots: orderedSnapshots }, (snapshot) => snapshot.stabilityIndex), [orderedSnapshots]);
  const phaseTrend = useMemo(
    () => toTrend({ snapshots: orderedSnapshots }, (snapshot) => snapshot.phaseCompliancePercent),
    [orderedSnapshots],
  );
  const overrideTrend = useMemo(
    () => toTrend({ snapshots: orderedSnapshots }, (snapshot) => snapshot.overrideFrequency),
    [orderedSnapshots],
  );

  const latestRiskDistribution = useMemo<UiChartPoint[]>(
    () =>
      GOVERNANCE_RISK_CLUSTERS.map((cluster) => ({
        label: clusterLabel(cluster),
        value: Math.round(latestSnapshot?.riskDistribution[cluster] ?? 0),
      })),
    [latestSnapshot],
  );

  const snapshotColumns = useMemo<UiTableColumn<GovernanceSnapshotRecord>[]>(
    () => [
      {
        id: "month",
        header: "Month",
        render: (snapshot) => (
          <div className="admin-governance-month-cell">
            <strong>{monthLabel(snapshot.month)}</strong>
            <small>{snapshot.documentId}</small>
          </div>
        ),
      },
      {
        id: "stability",
        header: "Stability Index",
        render: (snapshot) => Math.round(snapshot.stabilityIndex),
      },
      {
        id: "phaseAdherence",
        header: "Phase Adherence",
        render: (snapshot) => formatPercent(snapshot.phaseCompliancePercent),
      },
      {
        id: "overrideFrequency",
        header: "Override Frequency",
        render: (snapshot) => formatPercent(snapshot.overrideFrequency),
      },
      {
        id: "executionIntegrity",
        header: "Execution Integrity",
        render: (snapshot) => formatPercent(snapshot.executionIntegrityScore),
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-governance-dashboard-title">
      <p className="admin-content-eyebrow">Governance Monitoring Dashboard</p>
      <h2 id="admin-governance-dashboard-title">Institutional Stability and Execution Governance</h2>
      <p className="admin-content-copy">
        Read-only governance dashboard sourced from <code>governanceSnapshots</code> to monitor stability index,
        phase adherence, override frequency, and risk distribution with month-to-month comparisons.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics">
          Back to Analytics Dashboard
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading governance monitoring dashboard..." : inlineMessage ?? "Governance dashboard ready."}
      </p>

      <div className="admin-governance-kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="admin-governance-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      {monthComparison.length > 0 ? (
        <section className="admin-governance-comparison">
          <h3>
            Month-to-Month Comparison ({monthLabel(previousSnapshot?.month ?? "")} to {monthLabel(latestSnapshot?.month ?? "")})
          </h3>
          <div className="admin-governance-comparison-grid">
            {monthComparison.map((metric) => {
              const delta = metric.currentValue - metric.previousValue;
              const trend = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
              const currentDisplay =
                metric.metric === "index" ?
                  `${Math.round(metric.currentValue)}` :
                  formatPercent(metric.currentValue);
              const previousDisplay =
                metric.metric === "index" ?
                  `${Math.round(metric.previousValue)}` :
                  formatPercent(metric.previousValue);

              return (
                <article key={metric.label} className={`admin-governance-comparison-card admin-governance-comparison-${trend}`}>
                  <p>{metric.label}</p>
                  <h4>{currentDisplay}</h4>
                  <small>
                    Previous {previousDisplay} ({delta >= 0 ? "+" : ""}
                    {Math.round(delta)})
                  </small>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="admin-governance-chart-grid">
        <UiChartContainer
          title="Stability Index Trend"
          subtitle="12-month institutional stability trajectory"
          data={stabilityTrend}
          variant="line"
          maxValue={100}
        />
        <UiChartContainer
          title="Phase Adherence Trend"
          subtitle="Month-to-month phase compliance rates"
          data={phaseTrend}
          variant="line"
          maxValue={100}
        />
        <UiChartContainer
          title="Override Frequency Trend"
          subtitle="Monthly override usage across governance snapshots"
          data={overrideTrend}
          variant="line"
          maxValue={100}
        />
        <UiChartContainer
          title="Risk Cluster Distribution Across Batches"
          subtitle="Latest governance snapshot risk distribution aggregate"
          data={latestRiskDistribution}
          variant="pie"
        />
      </div>

      <section className="admin-governance-table-section" aria-labelledby="admin-governance-table-title">
        <h3 id="admin-governance-table-title">Governance Snapshot Timeline</h3>
        <UiTable
          caption="Month-by-month governance snapshot metrics"
          columns={snapshotColumns}
          rows={[...orderedSnapshots].reverse()}
          rowKey={(snapshot) => snapshot.documentId}
          emptyStateText="No governance snapshots are currently available."
        />
      </section>
    </section>
  );
}

export default GovernanceMonitoringDashboardPage;
