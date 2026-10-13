import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UiChartContainer, UiStatCard } from "../../../../../shared/ui/components";
import {
  getVendorSystemHealthDataset,
  type InfrastructureAlert,
} from "./vendorSystemHealthDataset";

type HealthView = "overview" | "alerts" | "telemetry" | "governance";
type AlertFilter = "all" | InfrastructureAlert["severity"];

const HEALTH_VIEWS: Array<{ id: HealthView; label: string }> = [
  { id: "overview", label: "Health Overview" },
  { id: "alerts", label: "Alerts" },
  { id: "telemetry", label: "Frontend Telemetry" },
  { id: "governance", label: "Governance" },
];

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function formatIndicator(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function VendorSystemHealthDashboardPage() {
  const navigate = useNavigate();
  const dataset = useMemo(() => getVendorSystemHealthDataset(), []);
  const [activeView, setActiveView] = useState<HealthView>("overview");
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
  const [selectedAlertId, setSelectedAlertId] = useState(dataset.alerts[0]?.id ?? "");

  const errorRateMetric = dataset.healthMetrics.find((metric) => metric.id === "ErrorRate");
  const failedFunctionMetric = dataset.healthMetrics.find(
    (metric) => metric.id === "FailedFunctionCount",
  );
  const latencyIndicator = dataset.performanceIndicators.find(
    (indicator) => indicator.indicator === "ApiLatencyP95",
  );
  const queueIndicator = dataset.performanceIndicators.find(
    (indicator) => indicator.indicator === "QueueBacklog",
  );
  const degradedIndicators = dataset.performanceIndicators.filter(
    (indicator) => indicator.status === "degraded",
  );
  const criticalAlertCount = dataset.alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlertCount = dataset.alerts.filter((alert) => alert.severity === "warning").length;
  const filteredAlerts = dataset.alerts.filter(
    (alert) => alertFilter === "all" || alert.severity === alertFilter,
  );
  const selectedAlert =
    filteredAlerts.find((alert) => alert.id === selectedAlertId) ?? filteredAlerts[0] ?? null;
  const resourceMetrics = dataset.healthMetrics.filter((metric) =>
    [
      "FirestoreReadCount",
      "FirestoreWriteCount",
      "CloudFunctionInvocations",
      "BigQueryStorageSize",
      "HostingBandwidth",
    ].includes(metric.id),
  );
  const errorRatePoints = dataset.trend.map((entry) => ({
    label: entry.minute,
    value: Number(entry.errorRatePercent.toFixed(2)),
  }));
  const failurePoints = dataset.trend.map((entry) => ({
    label: entry.minute,
    value: entry.failedFunctions,
  }));

  const overallPosture =
    criticalAlertCount > 0 || degradedIndicators.length > 0 ? "Degraded" : "Healthy";

  return (
    <section
      className="vendor-content-card admin-content-card vendor-system-health-page"
      aria-labelledby="vendor-system-health-title"
    >
      <header className="vendor-health-heading">
        <div>
          <p className="vendor-content-eyebrow">Platform operations</p>
          <h2 id="vendor-system-health-title">System Health</h2>
          <p>Runtime performance, infrastructure alerts, frontend telemetry, and control checks.</p>
        </div>
        <div
          className={`vendor-health-posture${overallPosture === "Degraded" ? " vendor-health-posture-degraded" : ""}`}
        >
          <span>Platform posture</span>
          <strong>{overallPosture}</strong>
          <small>
            {criticalAlertCount} critical alerts, {degradedIndicators.length} degraded services
          </small>
        </div>
      </header>

      <div className="vendor-health-summary">
        <UiStatCard
          title="API Error Rate"
          value={errorRateMetric?.value ?? "-"}
          helper="Across vendor and portal APIs"
        />
        <UiStatCard
          title="API Latency P95"
          value={latencyIndicator?.value ?? "-"}
          helper={latencyIndicator?.status ?? "Unavailable"}
        />
        <UiStatCard
          title="Failed Functions"
          value={failedFunctionMetric?.value ?? "-"}
          helper="Post-retry failures in the last hour"
        />
        <UiStatCard
          title="Queue Backlog"
          value={queueIndicator?.value ?? "-"}
          helper={queueIndicator?.status ?? "Unavailable"}
        />
      </div>

      <nav className="vendor-health-tabs" aria-label="System health views">
        {HEALTH_VIEWS.map((view) => {
          const count =
            view.id === "alerts"
              ? dataset.alerts.length
              : view.id === "telemetry"
                ? dataset.frontendTelemetry.recentCriticalEvents.length
                : view.id === "governance"
                  ? dataset.structuralGuarantees.length
                  : null;
          return (
            <button
              key={view.id}
              type="button"
              className={activeView === view.id ? "vendor-health-tab-active" : ""}
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
              {count !== null ? <span>{count}</span> : null}
            </button>
          );
        })}
      </nav>

      {activeView === "overview" ? (
        <div className="vendor-health-view">
          <section className="vendor-health-section-heading">
            <div>
              <h3>Runtime overview</h3>
              <p>Recent API reliability and serverless execution health.</p>
            </div>
            <span className="vendor-result-count">Last 60 minutes</span>
          </section>

          <div className="vendor-health-chart-grid">
            <UiChartContainer
              title="API Error Rate"
              subtitle="Error percentage across monitored endpoints"
              variant="line"
              maxValue={5}
              data={errorRatePoints}
            />
            <UiChartContainer
              title="Failed Functions"
              subtitle="Post-retry failures in each interval"
              variant="bar"
              data={failurePoints}
            />
          </div>

          <div className="vendor-health-overview-grid">
            <section className="vendor-health-services" aria-labelledby="health-services-title">
              <header>
                <h3 id="health-services-title">Service indicators</h3>
                <p>Current operating state for core platform services.</p>
              </header>
              <div>
                {dataset.performanceIndicators.map((indicator) => (
                  <div key={indicator.indicator}>
                    <span
                      className={`vendor-health-service-dot vendor-health-service-${indicator.status}`}
                    />
                    <span>{formatIndicator(indicator.indicator)}</span>
                    <strong>{indicator.value}</strong>
                    <small className={`vendor-status vendor-status-${indicator.status}`}>
                      {indicator.status}
                    </small>
                  </div>
                ))}
              </div>
            </section>

            <section className="vendor-health-resources" aria-labelledby="health-resources-title">
              <header>
                <h3 id="health-resources-title">Resource activity</h3>
                <p>Current aggregate infrastructure usage.</p>
              </header>
              <dl>
                {resourceMetrics.map((metric) => (
                  <div key={metric.id}>
                    <dt>{metric.label}</dt>
                    <dd>
                      <strong>{metric.value}</strong>
                      <small>{metric.helper}</small>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      ) : null}

      {activeView === "alerts" ? (
        <div className="vendor-health-view">
          <section className="vendor-health-section-heading">
            <div>
              <h3>Infrastructure alerts</h3>
              <p>Operational conditions requiring vendor awareness or investigation.</p>
            </div>
            <div className="vendor-health-alert-counts">
              <span>{criticalAlertCount} critical</span>
              <span>{warningAlertCount} warning</span>
            </div>
          </section>

          <div className="vendor-health-alert-filters" aria-label="Alert severity filters">
            {(["all", "critical", "warning", "info"] as AlertFilter[]).map((severity) => (
              <button
                key={severity}
                type="button"
                className={alertFilter === severity ? "vendor-health-alert-filter-active" : ""}
                onClick={() => setAlertFilter(severity)}
              >
                {severity === "all" ? "All alerts" : `${humanizeSeverity(severity)} only`}
              </button>
            ))}
          </div>

          <div className="vendor-health-alert-layout">
            <section className="vendor-health-alert-list" aria-label="Alert list">
              {filteredAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  className={selectedAlert?.id === alert.id ? "vendor-health-alert-active" : ""}
                  onClick={() => setSelectedAlertId(alert.id)}
                >
                  <span
                    className={`vendor-health-alert-dot vendor-health-alert-${alert.severity}`}
                  />
                  <span>
                    <small>{alert.severity}</small>
                    <strong>{alert.title}</strong>
                    <time>{formatTimestamp(alert.raisedAt)}</time>
                  </span>
                </button>
              ))}
              {filteredAlerts.length === 0 ? (
                <p className="vendor-institute-empty">No alerts match this severity.</p>
              ) : null}
            </section>

            {selectedAlert ? (
              <aside className="vendor-health-alert-detail">
                <header>
                  <div>
                    <p className="vendor-content-eyebrow">{selectedAlert.severity} alert</p>
                    <h3>{selectedAlert.title}</h3>
                  </div>
                  <span
                    className={`vendor-status vendor-health-alert-status-${selectedAlert.severity}`}
                  >
                    Open
                  </span>
                </header>
                <p>{selectedAlert.message}</p>
                <dl>
                  <div>
                    <dt>Raised</dt>
                    <dd>{formatTimestamp(selectedAlert.raisedAt)}</dd>
                  </div>
                  <div>
                    <dt>Alert ID</dt>
                    <dd>
                      <code>{selectedAlert.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>Monitoring dashboards</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="vendor-secondary-button"
                  onClick={() => navigate("/vendor/audit")}
                >
                  Open Audit Activity
                </button>
              </aside>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "telemetry" ? (
        <div className="vendor-health-view">
          <section className="vendor-health-section-heading">
            <div>
              <h3>Frontend telemetry</h3>
              <p>Browser runtime and API-client signals captured for this vendor session.</p>
            </div>
            <span className="vendor-result-count">
              Captured {formatTimestamp(dataset.frontendTelemetry.capturedAt)}
            </span>
          </section>

          <div className="vendor-health-telemetry-summary">
            <UiStatCard
              title="Runtime Exceptions"
              value={String(dataset.frontendTelemetry.runtimeExceptionCount)}
              helper="Window errors and unhandled rejections"
            />
            <UiStatCard
              title="Failed API Calls"
              value={String(dataset.frontendTelemetry.failedApiCallCount)}
              helper="Final failed client requests"
            />
            <UiStatCard
              title="Average API Latency"
              value={`${dataset.frontendTelemetry.averageApiLatencyMs} ms`}
              helper="Current vendor browser session"
            />
          </div>

          <section
            className="vendor-health-telemetry-events"
            aria-labelledby="telemetry-events-title"
          >
            <header>
              <div>
                <h3 id="telemetry-events-title">Critical event stream</h3>
                <p>Append-only browser and API failures for this session.</p>
              </div>
              <code>{dataset.frontendTelemetry.sessionIdentifier}</code>
            </header>
            <div>
              {dataset.frontendTelemetry.recentCriticalEvents.map((event) => (
                <article key={event.eventId}>
                  <span>{event.portal}</span>
                  <strong>{event.eventType}</strong>
                  <p>{event.message}</p>
                  <code>{event.requestPath}</code>
                  <time>{formatTimestamp(event.timestamp)}</time>
                </article>
              ))}
              {dataset.frontendTelemetry.recentCriticalEvents.length === 0 ? (
                <p className="vendor-health-empty-state">
                  No critical frontend events captured in this session.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "governance" ? (
        <div className="vendor-health-view">
          <section className="vendor-health-section-heading">
            <div>
              <h3>Platform governance checks</h3>
              <p>Structural guarantees protecting vendor controls and tenant boundaries.</p>
            </div>
            <span className="vendor-status vendor-status-completed">
              {dataset.structuralGuarantees.length} checks passed
            </span>
          </section>

          <div className="vendor-health-governance-list">
            {dataset.structuralGuarantees.map((item) => (
              <article key={item.id}>
                <span className="vendor-health-governance-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.evidence}</p>
                  <code>{item.id}</code>
                </div>
                <span className="vendor-status vendor-status-completed">Pass</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="vendor-health-boundary">
        <div>
          <strong>Monitoring boundary enforced</strong>
          <span>
            Platform summaries, error logs, and telemetry only; no raw institute session
            recomputation.
          </span>
        </div>
        <code>{dataset.sourceSystems.join(" + ")}</code>
      </footer>
    </section>
  );
}

function humanizeSeverity(value: AlertFilter): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default VendorSystemHealthDashboardPage;
