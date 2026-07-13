import { useMemo } from "react";
import {
  UiChartContainer,
  UiStatCard,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  getVendorSystemHealthDataset,
  type FrontendTelemetryCriticalEvent,
  type InfrastructureAlert,
  type SystemHealthPerformanceIndicator,
} from "./vendorSystemHealthDataset";

function formatAlertTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function VendorSystemHealthDashboardPage() {
  const dataset = useMemo(() => getVendorSystemHealthDataset(), []);

  const errorRatePoints = useMemo<UiChartPoint[]>(() => {
    return dataset.trend.map((entry) => ({
      label: entry.minute,
      value: Number(entry.errorRatePercent.toFixed(2)),
    }));
  }, [dataset.trend]);

  const failurePoints = useMemo<UiChartPoint[]>(() => {
    return dataset.trend.map((entry) => ({
      label: entry.minute,
      value: entry.failedFunctions,
    }));
  }, [dataset.trend]);

  const costPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.trend.map((entry) => ({
      label: entry.minute,
      value: Number(entry.estimatedCostUsd.toFixed(1)),
    }));
  }, [dataset.trend]);

  const indicatorColumns = useMemo<Array<UiTableColumn<SystemHealthPerformanceIndicator>>>(() => {
    return [
      {
        id: "indicator",
        header: "Performance Indicator",
        render: (row) => row.indicator,
      },
      {
        id: "value",
        header: "Value",
        render: (row) => row.value,
      },
      {
        id: "status",
        header: "Status",
        render: (row) => row.status,
      },
    ];
  }, []);

  const telemetryColumns = useMemo<Array<UiTableColumn<FrontendTelemetryCriticalEvent>>>(() => {
    return [
      {
        id: "timestamp",
        header: "Timestamp",
        render: (row) => formatAlertTimestamp(row.timestamp),
      },
      {
        id: "portal",
        header: "Portal",
        render: (row) => row.portal,
      },
      {
        id: "eventType",
        header: "Event Type",
        render: (row) => row.eventType,
      },
      {
        id: "severity",
        header: "Severity",
        render: (row) => row.severity,
      },
      {
        id: "actorId",
        header: "Actor",
        render: (row) => row.actorId,
      },
      {
        id: "requestPath",
        header: "Path",
        render: (row) => row.requestPath,
      },
      {
        id: "message",
        header: "Message",
        render: (row) => row.message,
      },
    ];
  }, []);

  return (
    <section
      className="vendor-content-card admin-content-card vendor-system-health-page"
      aria-labelledby="vendor-system-health-title"
    >
      <p className="vendor-content-eyebrow admin-content-eyebrow">Build 140</p>
      <h2 id="vendor-system-health-title">System Health Monitoring Dashboard</h2>
      <p className="vendor-content-copy admin-content-copy">
        Global runtime monitoring, infrastructure alerts, performance indicators, and telemetry for vendor
        operators.
      </p>

      <div className="vendor-overview-grid">
        {dataset.healthMetrics.map((metric) => (
          <UiStatCard key={metric.id} title={metric.label} value={metric.value} helper={metric.helper} />
        ))}
      </div>

      <div className="vendor-section-grid vendor-system-health-chart-grid">
        <UiChartContainer
          title="Error Rate Trend (%)"
          subtitle="API error-rate telemetry from monitoring dashboards"
          variant="line"
          maxValue={5}
          data={errorRatePoints}
        />
        <UiChartContainer
          title="Failed Function Count"
          subtitle="Recent failure volume after retries"
          variant="bar"
          data={failurePoints}
        />
        <UiChartContainer
          title="Estimated Cost Drift (USD / 10m)"
          subtitle="Infrastructure cost pulse from platform metrics"
          variant="line"
          data={costPoints}
        />
      </div>

      <section aria-label="Infrastructure alerts">
        <h3 className="vendor-subsection-title">Infrastructure Alerts</h3>
        <ul className="vendor-alert-list">
          {dataset.alerts.map((alert: InfrastructureAlert) => (
            <li
              key={alert.id}
              className={`vendor-alert-item vendor-alert-${alert.severity}`}
              aria-label={`${alert.severity} alert`}
            >
              <p>
                <strong>{alert.title}</strong> <span>{formatAlertTimestamp(alert.raisedAt)}</span>
              </p>
              <p>{alert.message}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="vendor-section-grid">
        <UiTable
          caption="System performance indicators"
          columns={indicatorColumns}
          rows={dataset.performanceIndicators}
          rowKey={(row) => row.indicator}
          emptyStateText="No system performance indicators available."
        />

        <section className="vendor-content-card admin-content-card vendor-nested-card" aria-label="Structural guarantees">
          <h3 className="vendor-subsection-title">Structural Guarantee Checklist</h3>
          <ul className="vendor-guarantee-list">
            {dataset.structuralGuarantees.map((item) => (
              <li key={item.id}>
                <p>
                  <strong>{item.label}</strong> <span>{item.status.toUpperCase()}</span>
                </p>
                <p>{item.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="vendor-section-grid vendor-telemetry-summary-grid">
        <UiStatCard
          title="Frontend Runtime Exceptions"
          value={String(dataset.frontendTelemetry.runtimeExceptionCount)}
          helper="Captured from window.error and unhandled rejection events."
        />
        <UiStatCard
          title="Frontend Failed API Calls"
          value={String(dataset.frontendTelemetry.failedApiCallCount)}
          helper="Final failed calls with method/path/status metadata."
        />
        <UiStatCard
          title="Frontend Avg API Latency"
          value={`${dataset.frontendTelemetry.averageApiLatencyMs} ms`}
          helper="Average request timing from shared API client telemetry."
        />
      </div>

      <UiTable
        caption={`Critical frontend telemetry events (session ${dataset.frontendTelemetry.sessionIdentifier})`}
        columns={telemetryColumns}
        rows={dataset.frontendTelemetry.recentCriticalEvents}
        rowKey={(row) => row.eventId}
        emptyStateText="No critical frontend telemetry events captured in this session."
      />

      <div className="vendor-boundary-note admin-content-note" role="note" aria-label="System health boundaries and controls">
        <p>Build 140 controls:</p>
        <ul>
          <li>Health metrics derive from platform metrics, monitoring dashboards, and error logs.</li>
          <li>Critical alerts are highlighted for immediate vendor visibility.</li>
          <li>No raw cross-institute session recomputation is performed in this route.</li>
          <li>Frontend telemetry critical events use append-only audit identifiers with actor and timestamp metadata.</li>
        </ul>
      </div>
    </section>
  );
}

export default VendorSystemHealthDashboardPage;
