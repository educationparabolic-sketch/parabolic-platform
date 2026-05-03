import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import UiChartContainer from "../../../../../shared/ui/components/UiChartContainer";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  fetchOverviewSnapshot,
  formatIsoDate,
  formatPercent,
  getFallbackOverviewSnapshot,
  hasLayer,
  shouldUseLiveApi,
  type AdminOverviewSnapshot,
} from "./adminOverviewDataset";

function effectiveLayer(layer: LicenseLayer | null): LicenseLayer {
  return layer ?? "L0";
}

function formatSubmissionTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function metricCard(label: string, value: string) {
  return (
    <article key={label} className="admin-analytics-kpi-card">
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
}

function formatControlledDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
}

function formatRegressionCount(value: number): string {
  return value === 1 ? "1 regression alert" : `${value} regression alerts`;
}

function AdminOverviewPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const currentLayer = effectiveLayer(accessContext.licenseLayer);

  const [snapshot, setSnapshot] = useState<AdminOverviewSnapshot>(() => getFallbackOverviewSnapshot(currentLayer));
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setSnapshot(getFallbackOverviewSnapshot(currentLayer));
        setInlineMessage("Local mode detected. Loaded deterministic summary-document fixtures for Build 116 overview.");
        setIsLoading(false);
        return;
      }

      try {
        const apiSnapshot = await fetchOverviewSnapshot(currentLayer);
        if (!isMounted) {
          return;
        }

        setSnapshot(apiSnapshot);
        setInlineMessage("Live mode enabled: overview hydrated from GET /admin/overview summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load overview summary payload.";
        setSnapshot(getFallbackOverviewSnapshot(currentLayer));
        setInlineMessage(`${reason} Falling back to deterministic Build 116 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      isMounted = false;
    };
  }, [currentLayer]);

  const firstFoldCards = useMemo(
    () => [
      metricCard("Active Students", String(snapshot.operationalSnapshot.activeStudents)),
      metricCard("Tests Conducted (Month)", String(snapshot.operationalSnapshot.testsConducted)),
      metricCard("Tests Scheduled (7d)", String(snapshot.operationalSnapshot.testsScheduled)),
      metricCard("Last Test Completion", formatPercent(snapshot.operationalSnapshot.lastTestCompletionRatePercent)),
      metricCard("Billing Count", String(snapshot.operationalSnapshot.billingCount)),
      metricCard("Concurrent Sessions", String(snapshot.operationalSnapshot.activeConcurrentSessions)),
      metricCard("Current Layer", snapshot.systemHealthAndLicensing.currentLayerBadge),
      metricCard("Eligibility L1", formatPercent(snapshot.systemHealthAndLicensing.eligibilityL1Percentage)),
      metricCard("Eligibility L2", formatPercent(snapshot.systemHealthAndLicensing.eligibilityL2Percentage)),
      metricCard("Peak Concurrency", String(snapshot.systemHealthAndLicensing.peakConcurrencyThisMonth)),
    ],
    [snapshot],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-overview-title">
      <p className="admin-content-eyebrow">Admin / Overview</p>
      <h2 id="admin-overview-title">Operational Snapshot</h2>
      <p className="admin-content-copy">
        Overview reads precomputed summary documents only for academic year <code>{snapshot.academicYear}</code> (updated
        <code> {formatIsoDate(snapshot.computedAt)}</code>). Raw sessions and per-question logs are excluded.
      </p>
      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/tests">Open Live Monitor</NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/analytics">Open Analytics</NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/licensing">Open Licensing</NavLink>
      </p>
      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading overview..." : inlineMessage ?? "Overview summary ready."}
      </p>

      <div className="admin-analytics-kpi-grid">{firstFoldCards}</div>

      <div className="admin-tests-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Activity</p>
          <h3>{String(snapshot.currentActivity.activeTestSessions)} active sessions</h3>
          <small>Students in test: {snapshot.currentActivity.studentsCurrentlyInTest}</small>
          <small>Upcoming: {snapshot.currentActivity.upcomingTestLabel}</small>
          {hasLayer(currentLayer, "L1") ? (
            <div className="admin-overview-activity-signals" aria-label="Current activity behavior signals">
              <div className="admin-overview-activity-signal">
                <span>Behavior alerts</span>
                <strong>{String(snapshot.currentActivity.liveBehaviorAlertCount)}</strong>
              </div>
              <div className="admin-overview-activity-signal">
                <span>Pacing drift</span>
                <strong>{formatPercent(snapshot.currentActivity.pacingDriftPercentage)}</strong>
              </div>
              <div className="admin-overview-activity-signal">
                <span>Skip burst</span>
                <strong>{formatPercent(snapshot.currentActivity.skipBurstPercentage)}</strong>
              </div>
            </div>
          ) : null}
          <div className="admin-overview-submission-list" aria-label="Last five submissions">
            {snapshot.currentActivity.lastFiveSubmissions.map((submission) => (
              <div
                key={`${submission.studentName}-${submission.assessmentLabel}-${submission.submittedAt}`}
                className="admin-overview-submission-item"
              >
                <strong>{submission.studentName}</strong>
                <span>{submission.assessmentLabel}</span>
                <time dateTime={submission.submittedAt}>{formatSubmissionTimestamp(submission.submittedAt)}</time>
              </div>
            ))}
          </div>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Performance Summary (30d)</p>
          <h3>Raw {formatPercent(snapshot.performanceSummary.avgRawScorePercentage)} | Accuracy {formatPercent(snapshot.performanceSummary.avgAccuracyPercentage)}</h3>
          <small>Participation: {formatPercent(snapshot.performanceSummary.participationRate)}</small>
          <small>Batches: {snapshot.performanceSummary.highestPerformingBatch} / {snapshot.performanceSummary.lowestPerformingBatch}</small>
          {hasLayer(currentLayer, "L2") ? (
            <div className="admin-overview-performance-signals" aria-label="L2 structural compliance metrics">
              <div className="admin-overview-performance-signal">
                <span>Risk distribution</span>
                <strong>{snapshot.performanceSummary.riskDistribution}</strong>
              </div>
              <div className="admin-overview-performance-signal">
                <span>Avg discipline index</span>
                <strong>{String(snapshot.performanceSummary.avgDisciplineIndex)}</strong>
              </div>
              <div className="admin-overview-performance-signal">
                <span>Controlled delta</span>
                <strong>{formatControlledDelta(snapshot.performanceSummary.controlledModeImprovementDelta)}</strong>
              </div>
              <div className="admin-overview-performance-signal">
                <span>Execution stability</span>
                <strong>{snapshot.performanceSummary.executionStabilityBadge}</strong>
              </div>
            </div>
          ) : null}
          <div className="admin-overview-performance-chart">
            <UiChartContainer
              title="Distribution Histogram"
              subtitle="30-day raw mark distribution"
              data={snapshot.performanceSummary.distributionHistogram}
            />
          </div>
        </article>
      </div>

      {hasLayer(currentLayer, "L1") ? (
        <div className="admin-tests-grid">
          <article className="admin-analytics-kpi-card">
            <p>Execution Summary (L1+)</p>
            <h3>{formatPercent(snapshot.executionSummary.percentageStudentsWithRepeatedPattern)} repeated patterns</h3>
            <small>Signal: {snapshot.executionSummary.mostCommonDiagnosticSignal}</small>
            <small>Weakness: {snapshot.executionSummary.topicWithHighestWeaknessCluster}</small>
            {hasLayer(currentLayer, "L2") ? (
              <div className="admin-overview-execution-signals" aria-label="L2 execution summary expansion">
                <div className="admin-overview-execution-signal">
                  <span>Risk cluster</span>
                  <strong>{snapshot.executionSummary.riskClusterBreakdown}</strong>
                </div>
                <div className="admin-overview-execution-signal">
                  <span>High-risk students</span>
                  <strong>{String(snapshot.executionSummary.highRiskStudentCount)}</strong>
                </div>
                <div className="admin-overview-execution-signal">
                  <span>Phase compliance</span>
                  <strong>{formatPercent(snapshot.executionSummary.phaseCompliancePercentage)}</strong>
                </div>
                <div className="admin-overview-execution-signal">
                  <span>Discipline regression</span>
                  <strong>{formatRegressionCount(snapshot.executionSummary.disciplineRegressionAlerts)}</strong>
                </div>
              </div>
            ) : null}
          </article>
          <article className="admin-analytics-kpi-card">
            <p>{hasLayer(currentLayer, "L2") ? "Controlled Mode Impact" : "L1 Diagnostics"}</p>
            {hasLayer(currentLayer, "L2") ? (
              <>
                <h3>{snapshot.executionSummary.controlledModeImpactCard}</h3>
                <small>Phase adherence: {formatPercent(snapshot.performanceSummary.avgPhaseAdherencePercentage)}</small>
                <small>Easy neglect: {formatPercent(snapshot.performanceSummary.easyNeglectPercentage)}</small>
                <small>Hard bias: {formatPercent(snapshot.performanceSummary.hardBiasPercentage)}</small>
                <small>Time misallocation: {formatPercent(snapshot.performanceSummary.timeMisallocationPercentage)}</small>
              </>
            ) : (
              <>
                <h3>Phase adherence {formatPercent(snapshot.performanceSummary.avgPhaseAdherencePercentage)}</h3>
                <small>Easy neglect: {formatPercent(snapshot.performanceSummary.easyNeglectPercentage)}</small>
                <small>Hard bias: {formatPercent(snapshot.performanceSummary.hardBiasPercentage)}</small>
                <small>Time misallocation: {formatPercent(snapshot.performanceSummary.timeMisallocationPercentage)}</small>
              </>
            )}
          </article>
        </div>
      ) : null}

      {hasLayer(currentLayer, "L2") ? (
        <div className="admin-tests-grid">
          <article className="admin-analytics-kpi-card">
            <p>Risk Snapshot (L2+)</p>
            <h3>{snapshot.riskSnapshot.riskDistributionPie}</h3>
            <small>Discipline trend (7d): {snapshot.riskSnapshot.disciplineIndex7DayTrend}</small>
            <small>Overstay: {formatPercent(snapshot.riskSnapshot.overstayRatePercentage)}</small>
            <small>Guess cluster: {formatPercent(snapshot.riskSnapshot.guessClusterPercentage)}</small>
            <div className="admin-overview-risk-attention-list" aria-label="Top five students requiring attention">
              {snapshot.riskSnapshot.topFiveStudentsRequiringAttention.map((student) => (
                <div
                  key={`${student.studentName}-${student.riskState}`}
                  className="admin-overview-risk-attention-item"
                >
                  <strong>{student.studentName}</strong>
                  <span>{student.riskState}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>Controlled Mode</p>
            <h3>{formatPercent(snapshot.currentActivity.controlledModeCompliancePercentage)} compliance</h3>
            <small>Live risk count: {snapshot.currentActivity.liveRiskCount}</small>
            <small>MinTime violations: {snapshot.currentActivity.minTimeViolationsLive}</small>
          </article>
        </div>
      ) : null}

      {hasLayer(currentLayer, "L3") ? (
        <div className="admin-tests-grid">
          <article className="admin-analytics-kpi-card">
            <p>Governance Snapshot (L3)</p>
            <h3>Stability Index {snapshot.governanceSnapshot.institutionalStabilityIndex}</h3>
            <small>MoM change: {snapshot.governanceSnapshot.monthOverMonthStabilityChange}</small>
            <small>Discipline trajectory: {snapshot.governanceSnapshot.disciplineTrajectoryIndicator}</small>
          </article>
          <article className="admin-analytics-kpi-card">
            <p>System Health & Licensing</p>
            <h3>{snapshot.systemHealthAndLicensing.storageUsageSummary}</h3>
            <small>Archive: {snapshot.systemHealthAndLicensing.lastArchiveDate}</small>
            <small>{snapshot.systemHealthAndLicensing.upgradeAwarenessCard}</small>
          </article>
        </div>
      ) : (
        <div className="admin-tests-grid">
          <article className="admin-analytics-kpi-card">
            <p>System Health & Licensing</p>
            <h3>{snapshot.systemHealthAndLicensing.storageUsageSummary}</h3>
            <small>Year lock: {snapshot.systemHealthAndLicensing.academicYearLockStatus}</small>
            <small>{snapshot.systemHealthAndLicensing.upgradeAwarenessCard}</small>
          </article>
        </div>
      )}
    </section>
  );
}

export default AdminOverviewPage;
