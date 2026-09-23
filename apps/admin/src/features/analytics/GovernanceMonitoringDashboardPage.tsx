import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveGlobalPortalState } from "../../../../../shared/services/globalPortalState";
import {
  UiChartContainer,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import { fetchSettingsSnapshot } from "../settings/settingsDataset";
import {
  ApiClientError,
  EMPTY_LIVE_GOVERNANCE_DATASET,
  FALLBACK_GOVERNANCE_DATASET,
  GOVERNANCE_RISK_CLUSTERS,
  authorizeGovernanceReportDownload,
  fetchGovernanceReports,
  fetchGovernanceDataset,
  formatPercent,
  generateGovernanceReport,
  shouldUseLiveApi,
  type GovernanceDashboardDataset,
  type GovernanceRequestContext,
  type GovernanceReportRecord,
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

interface GovernanceSectionDefinition {
  description: string;
  eyebrow: string;
  id: GovernanceSubpage;
  label: string;
  title: string;
  to: string;
}

const GOVERNANCE_SECTIONS: GovernanceSectionDefinition[] = [
  {
    description: "Stored institutional stability and performance indicators from immutable monthly snapshots.",
    eyebrow: "Governance / Stability",
    id: "stability",
    label: "Institutional Stability",
    title: "Institutional Stability",
    to: "/admin/governance/stability",
  },
  {
    description: "Stored execution, discipline, phase-adherence, and behavioral-pattern indicators.",
    eyebrow: "Governance / Integrity",
    id: "integrity",
    label: "Execution Integrity",
    title: "Execution Integrity",
    to: "/admin/governance/integrity",
  },
  {
    description: "Snapshot-recorded override frequency alongside execution and stability context.",
    eyebrow: "Governance / Override Audit",
    id: "override-audit",
    label: "Override Audit",
    title: "Override Audit",
    to: "/admin/governance/override-audit",
  },
  {
    description: "Institution-wide risk-cluster distributions stored in each monthly snapshot.",
    eyebrow: "Governance / Risk",
    id: "batch-risk",
    label: "Risk Distribution",
    title: "Institutional Risk Distribution",
    to: "/admin/governance/batch-risk",
  },
  {
    description: "Bounded longitudinal trends using stored snapshot values only.",
    eyebrow: "Governance / Trends",
    id: "trends",
    label: "Longitudinal Trends",
    title: "Longitudinal Trends",
    to: "/admin/governance/trends",
  },
  {
    description: "Generate and download durable PDFs bound to immutable source periods and captured model versions.",
    eyebrow: "Governance / Reports",
    id: "reports",
    label: "Governance Reports",
    title: "Governance Report Sources",
    to: "/admin/governance/reports",
  },
];

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
    const paddedPayload = payloadSegment.padEnd(
      Math.ceil(payloadSegment.length / 4) * 4,
      "=",
    );
    const claims = JSON.parse(atob(paddedPayload));
    return claims && typeof claims === "object" ?
      claims as Record<string, unknown> :
      null;
  } catch {
    return null;
  }
}

async function resolveGovernanceRequestContext(
  idToken: string | null,
): Promise<GovernanceRequestContext> {
  const claims = decodeIdTokenClaims(idToken);
  if (typeof claims?.instituteId !== "string" || !claims.instituteId.trim()) {
    throw new Error("Verified institute authority is unavailable for governance reads.");
  }

  const instituteId = claims.instituteId.trim();
  const settingsSnapshot = await fetchSettingsSnapshot(instituteId);
  const activeAcademicYear = settingsSnapshot.academicYears.find(
    (entry) => entry.status === "Active",
  );

  if (!activeAcademicYear?.yearId?.trim()) {
    throw new Error("An authoritative active academic year is required for governance reads.");
  }

  return {yearId: activeAcademicYear.yearId.trim()};
}

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value :
    new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
}

function clusterLabel(cluster: GovernanceRiskCluster): string {
  if (cluster === "driftProne") {
    return "Drift Prone";
  }
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

function toTrend(
  snapshots: GovernanceSnapshotRecord[],
  selector: (snapshot: GovernanceSnapshotRecord) => number,
): UiChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(selector(snapshot)),
  }));
}

function GovernanceWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/governance">
        Governance Landing
      </NavLink>
      {GOVERNANCE_SECTIONS.map((section) => (
        <NavLink key={section.id} className="admin-primary-link" to={section.to}>
          {section.label}
        </NavLink>
      ))}
    </div>
  );
}

function GovernanceMonitoringDashboardPage() {
  const {session} = useAuthProvider();
  const portalState = resolveGlobalPortalState({portal: "admin", session});
  const location = useLocation();
  const liveMode = shouldUseLiveApi();
  const [dataset, setDataset] = useState<GovernanceDashboardDataset>(
    liveMode ? EMPTY_LIVE_GOVERNANCE_DATASET : FALLBACK_GOVERNANCE_DATASET,
  );
  const [isLoading, setIsLoading] = useState(liveMode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestContext, setRequestContext] = useState<GovernanceRequestContext | null>(null);
  const [reports, setReports] = useState<GovernanceReportRecord[]>([]);
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const governanceEnabled = portalState.license.featureFlags.governanceAccess;

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      if (!liveMode) {
        setDataset(FALLBACK_GOVERNANCE_DATASET);
        setIsLoading(false);
        return;
      }
      if (!governanceEnabled) {
        setDataset(EMPTY_LIVE_GOVERNANCE_DATASET);
        setReports([]);
        setIsLoading(false);
        return;
      }

      setDataset(EMPTY_LIVE_GOVERNANCE_DATASET);
      setErrorMessage(null);
      setIsLoading(true);
      try {
        const requestContext = await resolveGovernanceRequestContext(session.idToken);
        const [result, reportResult] = await Promise.all([
          fetchGovernanceDataset(requestContext),
          fetchGovernanceReports(requestContext),
        ]);
        if (mounted) {
          setRequestContext(requestContext);
          setDataset(result);
          setReports(reportResult.reports);
        }
      } catch (error) {
        if (mounted) {
          setDataset(EMPTY_LIVE_GOVERNANCE_DATASET);
          setErrorMessage(
            error instanceof ApiClientError || error instanceof Error ?
              error.message :
              "Failed to load governance snapshots.",
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [governanceEnabled, liveMode, session.idToken]);

  const reloadReports = useCallback(async (): Promise<void> => {
    if (!requestContext) {
      return;
    }
    const result = await fetchGovernanceReports(requestContext);
    setReports(result.reports);
  }, [requestContext]);

  const generateReport = useCallback(async (
    snapshot: GovernanceSnapshotRecord,
  ): Promise<void> => {
    if (!requestContext || !governanceEnabled) {
      return;
    }
    setPendingReportId(snapshot.documentId);
    setReportMessage(null);
    try {
      const result = await generateGovernanceReport({
        idempotencyKey: crypto.randomUUID(),
        snapshotId: snapshot.documentId,
        yearId: requestContext.yearId,
      });
      await reloadReports();
      setReportMessage(
        `${result.disposition === "replayed" ? "Existing" : "New"} immutable PDF is ready.`,
      );
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Report generation failed.");
    } finally {
      setPendingReportId(null);
    }
  }, [governanceEnabled, reloadReports, requestContext]);

  const downloadReport = useCallback(async (reportId: string): Promise<void> => {
    setPendingReportId(reportId);
    setReportMessage(null);
    try {
      const download = await authorizeGovernanceReportDownload(reportId);
      const anchor = document.createElement("a");
      anchor.href = download.downloadUrl;
      anchor.download = download.fileName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
      setReportMessage(`Download authorized until ${formatTimestamp(download.expiresAt)}.`);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Download authorization failed.");
    } finally {
      setPendingReportId(null);
    }
  }, []);

  const currentSection = GOVERNANCE_SECTIONS.find((section) =>
    location.pathname.startsWith(section.to),
  ) ?? GOVERNANCE_SECTIONS[0];
  const orderedSnapshots = useMemo(
    () => [...dataset.snapshots].sort((left, right) => left.month.localeCompare(right.month)),
    [dataset.snapshots],
  );
  const latestSnapshot = orderedSnapshots.at(-1) ?? null;
  const stabilityTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.stabilityIndex),
    [orderedSnapshots],
  );
  const integrityTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.executionIntegrityScore),
    [orderedSnapshots],
  );
  const phaseTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.phaseCompliancePercent),
    [orderedSnapshots],
  );
  const overrideTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.overrideFrequency),
    [orderedSnapshots],
  );
  const riskDistribution = useMemo<UiChartPoint[]>(
    () => GOVERNANCE_RISK_CLUSTERS.map((cluster) => ({
      label: clusterLabel(cluster),
      value: Math.round(latestSnapshot?.riskClusterDistribution[cluster] ?? 0),
    })),
    [latestSnapshot],
  );

  const snapshotColumns = useMemo<UiTableColumn<GovernanceSnapshotRecord>[]>(
    () => [
      {header: "Period", id: "period", render: (row) => monthLabel(row.month)},
      {header: "Stability", id: "stability", render: (row) => Math.round(row.stabilityIndex)},
      {header: "Integrity", id: "integrity", render: (row) => formatPercent(row.executionIntegrityScore)},
      {header: "Phase", id: "phase", render: (row) => formatPercent(row.phaseCompliancePercent)},
      {header: "Overrides", id: "overrides", render: (row) => formatPercent(row.overrideFrequency)},
      {header: "Generated", id: "generated", render: (row) => formatTimestamp(row.generatedAt)},
    ],
    [],
  );
  const reportSourceColumns = useMemo<UiTableColumn<GovernanceSnapshotRecord>[]>(
    () => [
      {header: "Snapshot", id: "snapshot", render: (row) => row.documentId},
      {header: "Period", id: "period", render: (row) => monthLabel(row.month)},
      {header: "Calibration", id: "calibration", render: (row) => row.calibrationVersionUsed ?? "Not captured"},
      {header: "Risk model", id: "risk-model", render: (row) => row.riskModelVersionUsed ?? "Not captured"},
      {header: "Template range", id: "template-range", render: (row) => row.templateVersionRangeUsed ?? "Not captured"},
      {header: "Source cutoff", id: "source-cutoff", render: (row) => formatTimestamp(row.generatedAt)},
      {
        header: "Action",
        id: "action",
        render: (row) => (
          <button
            type="button"
            className="admin-compact-button"
            disabled={!liveMode || !governanceEnabled || pendingReportId !== null}
            onClick={() => void generateReport(row)}
          >
            {pendingReportId === row.documentId ? "Generating…" : "Generate PDF"}
          </button>
        ),
      },
    ],
    [generateReport, governanceEnabled, liveMode, pendingReportId],
  );
  const reportColumns = useMemo<UiTableColumn<GovernanceReportRecord>[]>(
    () => [
      {header: "Period", id: "period", render: (row) => monthLabel(row.month)},
      {header: "Created", id: "created", render: (row) => formatTimestamp(row.createdAt)},
      {header: "Events", id: "events", render: (row) => row.source.eventRecordCount},
      {header: "Size", id: "size", render: (row) => `${Math.ceil(row.sizeBytes / 1024)} KB`},
      {
        header: "Artifact",
        id: "artifact",
        render: (row) => (
          <button
            type="button"
            className="admin-compact-button"
            disabled={!governanceEnabled || pendingReportId !== null}
            onClick={() => void downloadReport(row.reportId)}
          >
            {pendingReportId === row.reportId ? "Authorizing…" : "Download PDF"}
          </button>
        ),
      },
    ],
    [downloadReport, governanceEnabled, pendingReportId],
  );

  const isReports = currentSection.id === "reports";

  return (
    <section className="admin-content-card" aria-labelledby="admin-governance-dashboard-title">
      <p className="admin-content-eyebrow">{currentSection.eyebrow}</p>
      <h2 id="admin-governance-dashboard-title">{currentSection.title}</h2>
      <p className="admin-content-copy">{currentSection.description}</p>
      <GovernanceWorkspaceNav />

      <p className="admin-analytics-inline-note" role={errorMessage ? "alert" : undefined}>
        {isLoading ? "Loading bounded governance snapshots..." :
          !governanceEnabled ? "Governance access is disabled for this institute." :
          errorMessage ??
          `${dataset.source === "live" ? "Live" : "Fixture"} snapshot authority loaded for ${dataset.yearId}.`}
      </p>

      {!isLoading && !governanceEnabled ? (
        <section className="admin-governance-report-copy">
          <p role="alert">Governance data and report actions require the governanceAccess feature.</p>
        </section>
      ) : null}

      {!isLoading && !errorMessage && orderedSnapshots.length === 0 ? (
        <section className="admin-governance-report-copy">
          <p>No immutable governance snapshots are available for the active academic year.</p>
        </section>
      ) : null}

      {!isLoading && !errorMessage && latestSnapshot ? (
        <>
          <div className="admin-governance-route-banner">
            <div><strong>Source</strong><span>governanceSnapshots only</span></div>
            <div><strong>Loaded bound</strong><span>{orderedSnapshots.length} / 36</span></div>
            <div><strong>Latest sealed period</strong><span>{monthLabel(latestSnapshot.month)}</span></div>
          </div>

          <div className="admin-governance-kpi-grid">
            <article className="admin-governance-kpi-card">
              <p>Stability Index</p><h3>{Math.round(latestSnapshot.stabilityIndex)}</h3>
              <small>Stored monthly composite</small>
            </article>
            <article className="admin-governance-kpi-card">
              <p>Execution Integrity</p><h3>{formatPercent(latestSnapshot.executionIntegrityScore)}</h3>
              <small>Stored snapshot value</small>
            </article>
            <article className="admin-governance-kpi-card">
              <p>Discipline Mean</p><h3>{formatPercent(latestSnapshot.disciplineMean)}</h3>
              <small>Variance {latestSnapshot.disciplineVariance.toFixed(1)}</small>
            </article>
            <article className="admin-governance-kpi-card">
              <p>Average Accuracy</p><h3>{formatPercent(latestSnapshot.avgAccuracyPercent)}</h3>
              <small>Average raw score {formatPercent(latestSnapshot.avgRawScorePercent)}</small>
            </article>
          </div>

          {isReports ? (
            <>
              <section className="admin-governance-report-copy">
                <p>
                  Each source is immutable. Generated PDFs retain the exact snapshot and model-version authority and
                  downloads use short-lived links to verified bytes.
                </p>
                {!governanceEnabled ? (
                  <p role="alert">Governance report actions are disabled because governanceAccess is not enabled.</p>
                ) : null}
                {reportMessage ? <p role="status">{reportMessage}</p> : null}
              </section>
              <UiTable
                caption="Immutable governance report source authority"
                columns={reportSourceColumns}
                rows={[...orderedSnapshots].reverse()}
                rowKey={(row) => row.documentId}
                emptyStateText="No immutable report sources are available."
              />
              <UiTable
                caption="Ready immutable governance report artifacts"
                columns={reportColumns}
                rows={reports}
                rowKey={(row) => row.reportId}
                emptyStateText="No governance PDF artifacts have been generated."
              />
            </>
          ) : (
            <>
              <div className="admin-governance-chart-grid">
                <UiChartContainer title="Stability" subtitle="Stored monthly values" data={stabilityTrend} variant="line" maxValue={100} />
                <UiChartContainer title="Execution Integrity" subtitle="Stored monthly values" data={integrityTrend} variant="line" maxValue={100} />
                <UiChartContainer title="Phase Compliance" subtitle="Stored monthly values" data={phaseTrend} variant="line" maxValue={100} />
                <UiChartContainer title="Override Frequency" subtitle="Stored monthly values" data={overrideTrend} variant="line" maxValue={100} />
                <UiChartContainer title="Latest Risk Distribution" subtitle="Institution-wide snapshot; no batch split is inferred" data={riskDistribution} variant="pie" />
              </div>
              <section className="admin-governance-table-section">
                <h3>Immutable Snapshot Timeline</h3>
                <p className="admin-governance-section-copy">
                  Values absent from the stored snapshot—batch comparisons, difficulty splits, controlled-mode impact,
                  and per-teacher override analysis—are intentionally not displayed or derived.
                </p>
                <UiTable
                  caption="Source-faithful governance snapshot timeline"
                  columns={snapshotColumns}
                  rows={[...orderedSnapshots].reverse()}
                  rowKey={(row) => row.documentId}
                  emptyStateText="No governance snapshots are available."
                />
              </section>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default GovernanceMonitoringDashboardPage;
