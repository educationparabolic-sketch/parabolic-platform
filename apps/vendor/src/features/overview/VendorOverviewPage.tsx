import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UiStatCard } from "../../../../../shared/ui/components";
import {
  getCalibrationAuditRecords,
  getVendorCalibrationDataset,
} from "../calibration/vendorCalibrationDataset";
import { useVendorLicenseRequests } from "../institutes/vendorLicenseRequestsStore";
import { getVendorIntelligenceDataset } from "../intelligence/vendorIntelligenceDataset";
import { getVendorSystemHealthDataset } from "../system-health/vendorSystemHealthDataset";
import { getVendorOverviewDataset } from "./vendorOverviewDataset";

interface OverviewActivity {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  detail: string;
  target: string;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function VendorOverviewPage() {
  const navigate = useNavigate();
  const dataset = useMemo(() => getVendorOverviewDataset(), []);
  const intelligenceDataset = useMemo(() => getVendorIntelligenceDataset(), []);
  const calibrationDataset = useMemo(() => getVendorCalibrationDataset(), []);
  const systemHealthDataset = useMemo(() => getVendorSystemHealthDataset(), []);
  const {
    requests,
    openRequestCount,
    billingAlerts,
    onboardingRecords,
    unreadOnboardingIds,
    unreadBillingAlertIds,
  } = useVendorLicenseRequests();

  const activeCalibration = calibrationDataset.versions.find((version) => version.isActive);
  const onboardingActionCount = onboardingRecords.filter(
    (record) => !["active", "rejected", "expired"].includes(record.status),
  ).length;
  const criticalSystemAlerts = systemHealthDataset.alerts.filter(
    (alert) => alert.severity === "critical",
  );
  const operationalAttentionCount =
    openRequestCount + onboardingActionCount + billingAlerts.length + criticalSystemAlerts.length;

  const recentActivity = useMemo<OverviewActivity[]>(() => {
    const onboardingEvents = onboardingRecords.flatMap((record) =>
      record.timeline.map((event) => ({
        id: `onboarding-${record.id}-${event.id}`,
        timestamp: event.createdAt,
        category: "Onboarding",
        title: event.label,
        detail: record.instituteName,
        target: `/vendor/institutes?view=onboarding&onboarding=${record.id}`,
      })),
    );
    const licenseEvents = requests.map((request) => ({
      id: `request-${request.id}`,
      timestamp: request.submittedAt,
      category: "Licensing",
      title: `License request ${humanize(request.status)}`,
      detail: `${request.instituteName}: ${request.currentPlanId} to ${request.requestedPlanId}`,
      target: `/vendor/institutes?institute=${request.instituteId}`,
    }));
    const billingEvents = billingAlerts.map((alert) => ({
      id: `billing-${alert.id}`,
      timestamp: alert.createdAt,
      category: "Billing",
      title: alert.title,
      detail: alert.message,
      target: `/vendor/institutes?institute=${alert.instituteId}`,
    }));
    const calibrationEvents = getCalibrationAuditRecords(calibrationDataset).map((event) => ({
      id: `calibration-${event.id}`,
      timestamp: event.createdAt,
      category: "Calibration",
      title: humanize(event.actionType),
      detail: event.note,
      target: "/vendor/calibration",
    }));

    return [...onboardingEvents, ...licenseEvents, ...billingEvents, ...calibrationEvents]
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, 6);
  }, [billingAlerts, calibrationDataset, onboardingRecords, requests]);

  const priorityItems = [
    {
      id: "onboarding",
      label: "Onboarding cases",
      count: onboardingActionCount,
      note: `${unreadOnboardingIds.length} new or unread`,
      severity: onboardingActionCount > 0 ? "warning" : "clear",
      target: "/vendor/institutes?view=onboarding",
    },
    {
      id: "licensing",
      label: "License requests",
      count: openRequestCount,
      note: "Pending decision or payment resolution",
      severity: openRequestCount > 0 ? "warning" : "clear",
      target: "/vendor/institutes?view=requests",
    },
    {
      id: "billing",
      label: "Billing alerts",
      count: billingAlerts.length,
      note: `${unreadBillingAlertIds.length} unread alerts`,
      severity: billingAlerts.some((alert) => alert.severity === "critical")
        ? "critical"
        : "warning",
      target: "/vendor/institutes",
    },
    {
      id: "system",
      label: "System alerts",
      count: criticalSystemAlerts.length,
      note: "Critical infrastructure conditions",
      severity: criticalSystemAlerts.length > 0 ? "critical" : "clear",
      target: "/vendor/system-health",
    },
  ];

  return (
    <section
      className="vendor-content-card admin-content-card vendor-overview-page"
      aria-labelledby="vendor-overview-title"
    >
      <header className="vendor-overview-heading">
        <div>
          <p className="vendor-content-eyebrow">Vendor command center</p>
          <h2 id="vendor-overview-title">Overview</h2>
          <p>Portfolio status, pending vendor actions, and platform controls in one workspace.</p>
        </div>
        <div
          className={`vendor-overview-posture${operationalAttentionCount > 0 ? " vendor-overview-posture-attention" : ""}`}
        >
          <span>Operational posture</span>
          <strong>{operationalAttentionCount > 0 ? "Action required" : "All clear"}</strong>
          <small>{operationalAttentionCount} items across vendor workflows</small>
        </div>
      </header>

      <div className="vendor-overview-summary">
        <UiStatCard
          title="Total Institutes"
          value={formatNumber(dataset.portfolio.totalInstitutes)}
          helper={`${formatNumber(dataset.portfolio.activeInstitutes)} active subscriptions`}
        />
        <UiStatCard
          title="Active Students"
          value={formatNumber(dataset.portfolio.activeStudents)}
          helper="Current reporting-cycle aggregate"
        />
        <UiStatCard
          title="Monthly Test Runs"
          value={formatNumber(dataset.portfolio.monthlyTestRuns)}
          helper={dataset.reportingPeriod}
        />
        <UiStatCard
          title="Global Discipline Index"
          value={dataset.intelligence.globalDisciplineIndex.toFixed(1)}
          helper="Cross-institute aggregate"
        />
      </div>

      <div className="vendor-overview-command-grid">
        <section className="vendor-overview-priorities" aria-labelledby="overview-priorities-title">
          <header>
            <div>
              <h3 id="overview-priorities-title">Needs attention</h3>
              <p>Vendor-owned actions ordered by operational impact.</p>
            </div>
            <span className="vendor-result-count">{operationalAttentionCount} items</span>
          </header>
          <div>
            {priorityItems.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.target)}>
                <span
                  className={`vendor-overview-priority-marker vendor-overview-priority-${item.severity}`}
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </span>
                <b>{item.count}</b>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
        </section>

        <section
          className="vendor-overview-control-status"
          aria-labelledby="overview-control-title"
        >
          <header>
            <h3 id="overview-control-title">Control status</h3>
            <p>Current vendor-authoritative configuration.</p>
          </header>
          <dl>
            <div>
              <dt>Calibration profile</dt>
              <dd>
                <strong>{activeCalibration?.versionId ?? "Not available"}</strong>
                <small>{activeCalibration ? "Active globally" : "Review calibration"}</small>
              </dd>
            </div>
            <div>
              <dt>License plans</dt>
              <dd>
                <strong>Trial + 9 plans</strong>
                <small>L0, L1, and L2 tiers</small>
              </dd>
            </div>
            <div>
              <dt>Data boundary</dt>
              <dd>
                <strong>Enforced</strong>
                <small>Summary-only global reads</small>
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="vendor-secondary-button"
            onClick={() => navigate("/vendor/calibration")}
          >
            Review Controls
          </button>
        </section>
      </div>

      <div className="vendor-overview-insight-grid">
        <section
          className="vendor-overview-subscriptions"
          aria-labelledby="overview-subscriptions-title"
        >
          <header>
            <div>
              <h3 id="overview-subscriptions-title">Subscription posture</h3>
              <p>Institutes by current license layer.</p>
            </div>
            <button
              type="button"
              className="vendor-link-button"
              onClick={() => navigate("/vendor/intelligence")}
            >
              Open intelligence
            </button>
          </header>
          <div>
            {intelligenceDataset.layerDistribution.map((entry) => (
              <div key={entry.layer}>
                <span>{entry.layer === "TRIAL" ? "Trial" : entry.layer}</span>
                <div aria-hidden="true">
                  <i style={{ width: `${entry.percentage}%` }} />
                </div>
                <strong>{entry.instituteCount}</strong>
                <small>{entry.percentage.toFixed(1)}%</small>
              </div>
            ))}
          </div>
        </section>

        <section className="vendor-overview-risk" aria-labelledby="overview-risk-title">
          <header>
            <div>
              <h3 id="overview-risk-title">Global risk posture</h3>
              <p>Aggregated student risk distribution.</p>
            </div>
            <strong>{dataset.intelligence.riskDistribution.high}% high risk</strong>
          </header>
          <div className="vendor-overview-risk-bar" aria-label="Global risk distribution">
            <i
              className="vendor-overview-risk-low"
              style={{ width: `${dataset.intelligence.riskDistribution.low}%` }}
            />
            <i
              className="vendor-overview-risk-moderate"
              style={{ width: `${dataset.intelligence.riskDistribution.moderate}%` }}
            />
            <i
              className="vendor-overview-risk-high"
              style={{ width: `${dataset.intelligence.riskDistribution.high}%` }}
            />
          </div>
          <div className="vendor-overview-risk-legend">
            <span>
              <i className="vendor-overview-risk-low" />
              Low <strong>{dataset.intelligence.riskDistribution.low}%</strong>
            </span>
            <span>
              <i className="vendor-overview-risk-moderate" />
              Moderate <strong>{dataset.intelligence.riskDistribution.moderate}%</strong>
            </span>
            <span>
              <i className="vendor-overview-risk-high" />
              High <strong>{dataset.intelligence.riskDistribution.high}%</strong>
            </span>
          </div>
        </section>
      </div>

      <section className="vendor-overview-activity" aria-labelledby="overview-activity-title">
        <header>
          <div>
            <h3 id="overview-activity-title">Recent vendor activity</h3>
            <p>Latest onboarding, licensing, billing, and calibration events.</p>
          </div>
          <button
            type="button"
            className="vendor-link-button"
            onClick={() => navigate("/vendor/audit")}
          >
            View all activity
          </button>
        </header>
        <div>
          {recentActivity.map((activity) => (
            <button key={activity.id} type="button" onClick={() => navigate(activity.target)}>
              <span>{activity.category}</span>
              <strong>{activity.title}</strong>
              <small>{activity.detail}</small>
              <time>{formatTimestamp(activity.timestamp)}</time>
            </button>
          ))}
        </div>
      </section>

      <footer className="vendor-overview-boundary">
        <div>
          <strong>Global collection boundary enforced</strong>
          <span>
            Overview uses vendor summaries and workflow records; raw institute sessions remain
            isolated.
          </span>
        </div>
        <code>{dataset.dataSource}</code>
      </footer>
    </section>
  );
}

export default VendorOverviewPage;
