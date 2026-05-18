import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { fetchSettingsSnapshot } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_GOVERNANCE_DATASET,
  GOVERNANCE_RISK_CLUSTERS,
  fetchGovernanceDataset,
  formatPercent,
  shouldUseLiveApi,
  type GovernanceDashboardDataset,
  type GovernanceRequestContext,
  type GovernanceRiskCluster,
  type GovernanceSnapshotRecord,
} from "./governanceDataset";

type GovernanceSubpage =
  | "stability"
  | "integrity"
  | "override-audit"
  | "batch-risk"
  | "trends"
  | "reports";

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

interface GovernanceSectionDefinition {
  id: GovernanceSubpage;
  label: string;
  to: string;
  eyebrow: string;
  title: string;
  description: string;
}

interface GovernanceReportRow {
  id: string;
  period: string;
  generatedAt: string;
  stabilityIndex: number;
  executionIntegrity: number;
  overrideFrequency: number;
}

const FALLBACK_GOVERNANCE_INSTITUTE_ID = "demo-institute";
const FALLBACK_GOVERNANCE_YEAR_ID = "2026";

const GOVERNANCE_SECTIONS: GovernanceSectionDefinition[] = [
  {
    id: "stability",
    label: "Institutional Stability",
    to: "/admin/governance/stability",
    eyebrow: "Governance / Stability",
    title: "Institutional Stability",
    description:
      "Dedicated stability workspace for reading institutional consistency through immutable governance snapshots.",
  },
  {
    id: "integrity",
    label: "Execution Integrity",
    to: "/admin/governance/integrity",
    eyebrow: "Governance / Integrity",
    title: "Execution Integrity",
    description:
      "Director-only integrity workspace focused on structural discipline, compliance movement, and execution quality signals.",
  },
  {
    id: "override-audit",
    label: "Override Audit",
    to: "/admin/governance/override-audit",
    eyebrow: "Governance / Override Audit",
    title: "Override Audit",
    description:
      "Read-only override governance surface for tracking override frequency and its relationship to institutional stability.",
  },
  {
    id: "batch-risk",
    label: "Batch Risk Map",
    to: "/admin/governance/batch-risk",
    eyebrow: "Governance / Batch Risk",
    title: "Batch Risk Map",
    description:
      "Strategic cohort risk workspace for comparing the institutional risk mix across immutable monthly governance snapshots.",
  },
  {
    id: "trends",
    label: "Longitudinal Trends",
    to: "/admin/governance/trends",
    eyebrow: "Governance / Trends",
    title: "Longitudinal Trends",
    description:
      "Cross-month governance trend workspace for stability, compliance, override behavior, and execution trajectory.",
  },
  {
    id: "reports",
    label: "Governance Reports",
    to: "/admin/governance/reports",
    eyebrow: "Governance / Reports",
    title: "Governance Reports",
    description:
      "Immutable report-preparation workspace that packages governance snapshot records into export-ready institutional reporting views.",
  },
];

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

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
}

function resolveGovernanceSubpage(pathname: string): GovernanceSubpage {
  const matched = GOVERNANCE_SECTIONS.find((section) => pathname.startsWith(section.to));
  return matched?.id ?? "stability";
}

function toTrend(dataset: GovernanceDashboardDataset, selector: (snapshot: GovernanceSnapshotRecord) => number): UiChartPoint[] {
  return dataset.snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(selector(snapshot)),
  }));
}

function buildRiskDistribution(snapshot: GovernanceSnapshotRecord | null): UiChartPoint[] {
  return GOVERNANCE_RISK_CLUSTERS.map((cluster) => ({
    label: clusterLabel(cluster),
    value: Math.round(snapshot?.riskDistribution[cluster] ?? 0),
  }));
}

function buildRiskHistory(
  snapshots: GovernanceSnapshotRecord[],
  cluster: GovernanceRiskCluster,
): UiChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(snapshot.riskDistribution[cluster] ?? 0),
  }));
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function resolveGovernanceRequestContext(idToken: string | null): Promise<GovernanceRequestContext> {
  const claims = decodeIdTokenClaims(idToken);
  const instituteId =
    typeof claims?.instituteId === "string" && claims.instituteId.trim().length > 0 ?
      claims.instituteId :
      FALLBACK_GOVERNANCE_INSTITUTE_ID;
  const settingsSnapshot = await fetchSettingsSnapshot(instituteId);
  const activeAcademicYear =
    settingsSnapshot.academicYears.find((entry) => entry.status === "Active") ??
    settingsSnapshot.academicYears[0] ??
    null;

  return {
    instituteId,
    yearId: activeAcademicYear?.yearId?.trim() || FALLBACK_GOVERNANCE_YEAR_ID,
  };
}

function GovernanceMonitoringDashboardPage() {
  const { session } = useAuthProvider();
  const location = useLocation();
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
        const requestContext = await resolveGovernanceRequestContext(session.idToken);
        const apiDataset = await fetchGovernanceDataset(requestContext);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage(
          `Live mode enabled: governance dashboard hydrated from POST /admin/governance/snapshots for ${requestContext.instituteId} (${requestContext.yearId}).`,
        );
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
  }, [session.idToken]);

  const currentSubpage = useMemo(() => resolveGovernanceSubpage(location.pathname), [location.pathname]);
  const currentSection = GOVERNANCE_SECTIONS.find((section) => section.id === currentSubpage) ?? GOVERNANCE_SECTIONS[0];

  const orderedSnapshots = useMemo(
    () => [...dataset.snapshots].sort((left, right) => left.month.localeCompare(right.month)),
    [dataset.snapshots],
  );

  const latestSnapshot = orderedSnapshots[orderedSnapshots.length - 1] ?? null;
  const previousSnapshot = orderedSnapshots[orderedSnapshots.length - 2] ?? null;

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
  const integrityTrend = useMemo(
    () => toTrend({ snapshots: orderedSnapshots }, (snapshot) => snapshot.executionIntegrityScore),
    [orderedSnapshots],
  );
  const latestRiskDistribution = useMemo<UiChartPoint[]>(
    () => buildRiskDistribution(latestSnapshot),
    [latestSnapshot],
  );
  const stableRiskTrend = useMemo(
    () => buildRiskHistory(orderedSnapshots, "stable"),
    [orderedSnapshots],
  );
  const driftRiskTrend = useMemo(
    () => buildRiskHistory(orderedSnapshots, "driftProne"),
    [orderedSnapshots],
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

  const reportRows = useMemo<GovernanceReportRow[]>(
    () =>
      [...orderedSnapshots].reverse().map((snapshot) => ({
        id: snapshot.documentId,
        period: monthLabel(snapshot.month),
        generatedAt: formatTimestamp(snapshot.generatedAt),
        stabilityIndex: Math.round(snapshot.stabilityIndex),
        executionIntegrity: Math.round(snapshot.executionIntegrityScore),
        overrideFrequency: Math.round(snapshot.overrideFrequency),
      })),
    [orderedSnapshots],
  );

  const reportColumns = useMemo<UiTableColumn<GovernanceReportRow>[]>(
    () => [
      {
        id: "period",
        header: "Report Period",
        render: (row) => (
          <div className="admin-governance-month-cell">
            <strong>{row.period}</strong>
            <small>{row.id}</small>
          </div>
        ),
      },
      {
        id: "generatedAt",
        header: "Generated At",
        render: (row) => row.generatedAt,
      },
      {
        id: "stabilityIndex",
        header: "Stability",
        render: (row) => row.stabilityIndex,
      },
      {
        id: "executionIntegrity",
        header: "Integrity",
        render: (row) => `${row.executionIntegrity}%`,
      },
      {
        id: "overrideFrequency",
        header: "Override Share",
        render: (row) => `${row.overrideFrequency}%`,
      },
    ],
    [],
  );

  const sectionKpis = useMemo<Record<GovernanceSubpage, GovernanceKpi[]>>(() => {
    const stableShare = latestSnapshot?.riskDistribution.stable ?? 0;
    const driftShare = latestSnapshot?.riskDistribution.driftProne ?? 0;
    const impulsiveShare = latestSnapshot?.riskDistribution.impulsive ?? 0;
    const overextendedShare = latestSnapshot?.riskDistribution.overextended ?? 0;

    return {
      stability: [
        {
          label: "Stability Index",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "0-100 institutional stability",
        },
        {
          label: "Execution Integrity",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "current structural execution quality",
        },
        {
          label: "Stable Share",
          value: formatPercent(stableShare),
          helper: "latest stable cluster coverage",
        },
        {
          label: "Snapshot Coverage",
          value: `${orderedSnapshots.length}`,
          helper: "immutable monthly records",
        },
      ],
      integrity: [
        {
          label: "Phase Adherence",
          value: formatPercent(latestSnapshot?.phaseCompliancePercent ?? 0),
          helper: "monthly compliance rate",
        },
        {
          label: "Execution Integrity",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "institutional discipline quality",
        },
        {
          label: "Stable Share",
          value: formatPercent(stableShare),
          helper: "students in stable execution cluster",
        },
        {
          label: "Drift Share",
          value: formatPercent(driftShare),
          helper: "students trending away from structure",
        },
      ],
      "override-audit": [
        {
          label: "Override Frequency",
          value: formatPercent(latestSnapshot?.overrideFrequency ?? 0),
          helper: "share of runs using overrides",
        },
        {
          label: "Integrity After Override",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "paired institutional integrity score",
        },
        {
          label: "Stability Index",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "context for override movement",
        },
        {
          label: "Month Delta",
          value:
            latestSnapshot && previousSnapshot ?
              `${Math.round(latestSnapshot.overrideFrequency - previousSnapshot.overrideFrequency)} pts` :
              "0 pts",
          helper: "change from previous snapshot",
        },
      ],
      "batch-risk": [
        {
          label: "Stable",
          value: formatPercent(stableShare),
          helper: "latest batch mix in stable cluster",
        },
        {
          label: "Drift Prone",
          value: formatPercent(driftShare),
          helper: "latest drift-prone mix",
        },
        {
          label: "Impulsive",
          value: formatPercent(impulsiveShare),
          helper: "latest impulsive share",
        },
        {
          label: "Overextended",
          value: formatPercent(overextendedShare),
          helper: "latest overextended share",
        },
      ],
      trends: [
        {
          label: "Latest Stability",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "current index level",
        },
        {
          label: "Phase Trend",
          value: formatPercent(latestSnapshot?.phaseCompliancePercent ?? 0),
          helper: "latest compliance mark",
        },
        {
          label: "Override Trend",
          value: formatPercent(latestSnapshot?.overrideFrequency ?? 0),
          helper: "latest override mark",
        },
        {
          label: "Integrity Trend",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "latest integrity mark",
        },
      ],
      reports: [
        {
          label: "Reportable Months",
          value: `${orderedSnapshots.length}`,
          helper: "immutable governance periods",
        },
        {
          label: "Latest Snapshot",
          value: latestSnapshot ? monthLabel(latestSnapshot.month) : "-",
          helper: "current report anchor period",
        },
        {
          label: "Avg Stability",
          value:
            orderedSnapshots.length > 0 ?
              `${Math.round(orderedSnapshots.reduce((sum, snapshot) => sum + snapshot.stabilityIndex, 0) / orderedSnapshots.length)}` :
              "0",
          helper: "mean stability across loaded snapshots",
        },
        {
          label: "Avg Integrity",
          value:
            orderedSnapshots.length > 0 ?
              `${Math.round(orderedSnapshots.reduce((sum, snapshot) => sum + snapshot.executionIntegrityScore, 0) / orderedSnapshots.length)}%` :
              "0%",
          helper: "mean execution integrity across snapshots",
        },
      ],
    };
  }, [latestSnapshot, orderedSnapshots, previousSnapshot]);

  function renderMonthComparison() {
    if (monthComparison.length === 0) {
      return null;
    }

    return (
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
    );
  }

  function renderSectionContent() {
    if (currentSubpage === "stability") {
      return (
        <>
          {renderMonthComparison()}
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Stability Index Trend"
              subtitle="Institutional stability trajectory from recent monthly snapshots"
              data={stabilityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Stable Cluster Share"
              subtitle="Latest governance risk mix centered on the stable cohort"
              data={latestRiskDistribution}
              variant="pie"
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-table-title">
            <h3 id="admin-governance-table-title">Governance Snapshot Timeline</h3>
            <UiTable
              caption="Month-by-month institutional stability records"
              columns={snapshotColumns}
              rows={[...orderedSnapshots].reverse()}
              rowKey={(snapshot) => snapshot.documentId}
              emptyStateText="No governance snapshots are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "integrity") {
      return (
        <>
          {renderMonthComparison()}
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Phase Compliance Trend"
              subtitle="Monthly phase discipline trajectory"
              data={phaseTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Execution Integrity Trend"
              subtitle="Institution-wide structural execution quality"
              data={integrityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Stable Risk Share"
              subtitle="Risk-cluster fingerprint for the latest snapshot"
              data={latestRiskDistribution}
              variant="pie"
            />
            <UiChartContainer
              title="Drift-Prone Share Trend"
              subtitle="How often structure drift shows up in monthly governance snapshots"
              data={driftRiskTrend}
              variant="bar"
              maxValue={100}
            />
          </div>
        </>
      );
    }

    if (currentSubpage === "override-audit") {
      return (
        <>
          {renderMonthComparison()}
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Override Frequency Trend"
              subtitle="Monthly override usage across governance snapshots"
              data={overrideTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Stability vs Override Context"
              subtitle="Read override movement together with institutional stability"
              data={stabilityTrend}
              variant="bar"
              maxValue={100}
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-audit-title">
            <h3 id="admin-governance-audit-title">Override Audit Timeline</h3>
            <UiTable
              caption="Month-by-month override share and governance context"
              columns={snapshotColumns}
              rows={[...orderedSnapshots].reverse()}
              rowKey={(snapshot) => snapshot.documentId}
              emptyStateText="No override audit records are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "batch-risk") {
      return (
        <>
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Latest Batch Risk Mix"
              subtitle="Current governance risk distribution across institutional batches"
              data={latestRiskDistribution}
              variant="pie"
            />
            <UiChartContainer
              title="Stable Share Trend"
              subtitle="Monthly movement in the stable cohort"
              data={stableRiskTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Drift-Prone Share Trend"
              subtitle="Monthly movement in drift-prone exposure"
              data={driftRiskTrend}
              variant="line"
              maxValue={100}
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-batch-risk-title">
            <h3 id="admin-governance-batch-risk-title">Batch Risk Snapshot Matrix</h3>
            <UiTable
              caption="Institutional risk mix by month from governance snapshots"
              columns={[
                {
                  id: "month",
                  header: "Month",
                  render: (snapshot: GovernanceSnapshotRecord) => monthLabel(snapshot.month),
                },
                {
                  id: "stable",
                  header: "Stable",
                  render: (snapshot: GovernanceSnapshotRecord) => formatPercent(snapshot.riskDistribution.stable),
                },
                {
                  id: "drift",
                  header: "Drift Prone",
                  render: (snapshot: GovernanceSnapshotRecord) => formatPercent(snapshot.riskDistribution.driftProne),
                },
                {
                  id: "impulsive",
                  header: "Impulsive",
                  render: (snapshot: GovernanceSnapshotRecord) => formatPercent(snapshot.riskDistribution.impulsive),
                },
                {
                  id: "overextended",
                  header: "Overextended",
                  render: (snapshot: GovernanceSnapshotRecord) => formatPercent(snapshot.riskDistribution.overextended),
                },
                {
                  id: "volatile",
                  header: "Volatile",
                  render: (snapshot: GovernanceSnapshotRecord) => formatPercent(snapshot.riskDistribution.volatile),
                },
              ]}
              rows={[...orderedSnapshots].reverse()}
              rowKey={(snapshot) => snapshot.documentId}
              emptyStateText="No batch risk records are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "trends") {
      return (
        <>
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Stability Index Trend"
              subtitle="Cross-month stability trajectory"
              data={stabilityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Phase Adherence Trend"
              subtitle="Cross-month phase compliance movement"
              data={phaseTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Override Frequency Trend"
              subtitle="Cross-month override movement"
              data={overrideTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Execution Integrity Trend"
              subtitle="Cross-month execution quality movement"
              data={integrityTrend}
              variant="line"
              maxValue={100}
            />
          </div>
        </>
      );
    }

    return (
      <>
        <section className="admin-governance-report-copy">
          <p>
            Governance reports remain read-only and snapshot-driven here. This mounted route now isolates report
            preparation from the monitoring routes while deeper PDF-first generation details stay tracked separately.
          </p>
        </section>
        <div className="admin-governance-chart-grid">
          <UiChartContainer
            title="Report Stability Baseline"
            subtitle="Latest stability context included in governance report packets"
            data={stabilityTrend}
            variant="line"
            maxValue={100}
          />
          <UiChartContainer
            title="Report Integrity Baseline"
            subtitle="Latest execution integrity context included in governance report packets"
            data={integrityTrend}
            variant="line"
            maxValue={100}
          />
        </div>
        <section className="admin-governance-table-section" aria-labelledby="admin-governance-reports-title">
          <h3 id="admin-governance-reports-title">Governance Report Packets</h3>
          <UiTable
            caption="Snapshot-backed governance report periods ready for export workflows"
            columns={reportColumns}
            rows={reportRows}
            rowKey={(row) => row.id}
            emptyStateText="No governance report packets are currently available."
          />
        </section>
      </>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-governance-dashboard-title">
      <p className="admin-content-eyebrow">{currentSection.eyebrow}</p>
      <h2 id="admin-governance-dashboard-title">{currentSection.title}</h2>
      <p className="admin-content-copy">{currentSection.description}</p>

      <div className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics">
          Back to Analytics Dashboard
        </NavLink>
      </div>

      <nav className="admin-governance-subnav" aria-label="Governance sections">
        {GOVERNANCE_SECTIONS.map((section) => (
          <NavLink
            key={section.id}
            className={({ isActive }) =>
              isActive ? "admin-governance-subnav-link admin-governance-subnav-link-active" : "admin-governance-subnav-link"
            }
            to={section.to}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading governance monitoring dashboard..." : inlineMessage ?? "Governance dashboard ready."}
      </p>

      <div className="admin-governance-route-banner">
        <div>
          <strong>Mounted Route</strong>
          <span>{currentSection.to}</span>
        </div>
        <div>
          <strong>Snapshot Source</strong>
          <span>governanceSnapshots only</span>
        </div>
        <div>
          <strong>Latest Snapshot</strong>
          <span>{latestSnapshot ? monthLabel(latestSnapshot.month) : "No data"}</span>
        </div>
      </div>

      <div className="admin-governance-kpi-grid">
        {sectionKpis[currentSubpage].map((kpi) => (
          <article key={kpi.label} className="admin-governance-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      {renderSectionContent()}
    </section>
  );
}

export default GovernanceMonitoringDashboardPage;
