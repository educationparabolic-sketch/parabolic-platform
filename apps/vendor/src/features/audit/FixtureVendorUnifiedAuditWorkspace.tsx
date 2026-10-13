import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import {
  getCalibrationAuditRecords,
  getVendorCalibrationDataset,
} from "../calibration/vendorCalibrationDataset";
import { getVendorInstitutesDataset } from "../institutes/vendorInstitutesDataset";
import { useVendorLicenseRequests } from "../institutes/vendorLicenseRequestsStore";

type AuditCategory =
  | "institutes"
  | "onboarding"
  | "licensing"
  | "billing"
  | "calibration"
  | "access";
type AuditStatus = "completed" | "pending" | "failed";
type AuditSeverity = "info" | "warning" | "critical";
type AuditScope = "global" | "institute" | "selected_institutes";
type DateRange = "all" | "24h" | "7d" | "30d" | "90d";

interface UnifiedAuditEvent {
  id: string;
  timestamp: string;
  category: AuditCategory;
  action: string;
  actor: string;
  actorRole: string;
  instituteId: string;
  instituteName: string;
  targetType: string;
  targetId: string;
  scope: AuditScope;
  status: AuditStatus;
  severity: AuditSeverity;
  summary: string;
  source: string;
  metadata: Array<{ label: string; value: string }>;
}

interface AuditFilters {
  query: string;
  category: "all" | AuditCategory;
  instituteId: "all" | string;
  status: "all" | AuditStatus;
  scope: "all" | AuditScope;
  dateRange: DateRange;
}

const CATEGORY_TABS: Array<{ id: AuditFilters["category"]; label: string }> = [
  { id: "all", label: "All Activity" },
  { id: "institutes", label: "Institutes" },
  { id: "onboarding", label: "Onboarding" },
  { id: "licensing", label: "Licensing" },
  { id: "billing", label: "Billing" },
  { id: "calibration", label: "Calibration" },
  { id: "access", label: "Access" },
];

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function getDateCutoff(range: DateRange): number | null {
  if (range === "all") return null;
  const duration: Record<Exclude<DateRange, "all">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  return Date.now() - duration[range];
}

function VendorUnifiedAuditWorkspace() {
  const navigate = useNavigate();
  const instituteDataset = useMemo(() => getVendorInstitutesDataset(), []);
  const calibrationDataset = useMemo(() => getVendorCalibrationDataset(), []);
  const { requests, invoices, billingCommunications, billingAlerts, onboardingRecords } =
    useVendorLicenseRequests();
  const [filters, setFilters] = useState<AuditFilters>({
    query: "",
    category: "all",
    instituteId: "all",
    status: "all",
    scope: "all",
    dateRange: "all",
  });
  const [selectedEventId, setSelectedEventId] = useState("");

  const instituteNames = useMemo(
    () =>
      new Map(
        instituteDataset.institutes.map((institute) => [institute.id, institute.instituteName]),
      ),
    [instituteDataset.institutes],
  );

  const events = useMemo<UnifiedAuditEvent[]>(() => {
    const calibrationEvents: UnifiedAuditEvent[] = getCalibrationAuditRecords(
      calibrationDataset,
    ).map((event) => ({
      id: `calibration-${event.id}`,
      timestamp: event.createdAt,
      category: "calibration",
      action: humanize(event.actionType),
      actor: event.actorUid,
      actorRole: event.actorRole,
      instituteId: event.instituteIds.length === 1 ? event.instituteIds[0] : "",
      instituteName:
        event.instituteIds.length === 1
          ? (instituteNames.get(event.instituteIds[0]) ?? event.instituteIds[0])
          : event.eventScope === "Global"
            ? "All institutes"
            : `${event.instituteIds.length} selected institutes`,
      targetType: "Calibration version",
      targetId: event.calibrationVersionId,
      scope: event.eventScope === "Global" ? "global" : "selected_institutes",
      status: event.actionType === "RollbackQueued" ? "pending" : "completed",
      severity:
        event.actionType === "ManualOverride" || event.actionType.startsWith("Rollback")
          ? "warning"
          : "info",
      summary: event.note,
      source: event.calibrationSourcePath ?? event.targetId,
      metadata: [
        { label: "Calibration version", value: event.calibrationVersionId },
        { label: "Affected institutes", value: String(event.instituteIds.length) },
      ],
    }));

    const onboardingEvents: UnifiedAuditEvent[] = onboardingRecords.flatMap((record) =>
      record.timeline.map((event) => ({
        id: `onboarding-${record.id}-${event.id}`,
        timestamp: event.createdAt,
        category: "onboarding" as const,
        action: event.label,
        actor: event.actor,
        actorRole: event.actor.startsWith("vendor") ? "Vendor" : "System",
        instituteId: record.id,
        instituteName: record.instituteName,
        targetType: "Onboarding record",
        targetId: record.id,
        scope: "institute" as const,
        status:
          record.status === "rejected" || record.status === "expired"
            ? ("failed" as const)
            : ("completed" as const),
        severity:
          record.status === "rejected" || record.status === "expired"
            ? ("warning" as const)
            : ("info" as const),
        summary: event.note,
        source: `onboardingRecords/${record.id}`,
        metadata: [
          { label: "Current stage", value: humanize(record.status) },
          { label: "Selected plan", value: record.selectedPlanId },
          { label: "Assigned operator", value: record.assignedOperator },
        ],
      })),
    );

    const requestEvents: UnifiedAuditEvent[] = requests.map((request) => ({
      id: `license-request-${request.id}`,
      timestamp: request.submittedAt,
      category: "licensing",
      action:
        request.status === "pending"
          ? "License upgrade requested"
          : `License request ${humanize(request.status)}`,
      actor: request.requestedBy,
      actorRole: "Institute administrator",
      instituteId: request.instituteId,
      instituteName: request.instituteName,
      targetType: "License request",
      targetId: request.id,
      scope: "institute",
      status:
        request.status === "pending" || request.status === "payment_required"
          ? "pending"
          : request.status === "rejected"
            ? "failed"
            : "completed",
      severity: request.status === "rejected" ? "warning" : "info",
      summary: request.decisionNote || request.reason,
      source: `licenseRequests/${request.id}`,
      metadata: [
        { label: "Current plan", value: request.currentPlanId },
        { label: "Requested plan", value: request.requestedPlanId },
        { label: "Request status", value: humanize(request.status) },
      ],
    }));

    const licenseHistoryEvents: UnifiedAuditEvent[] = instituteDataset.licenseChangeHistory.map(
      (change) => ({
        id: `license-history-${change.id}`,
        timestamp: change.changedAt,
        category: "licensing",
        action: "Institute license changed",
        actor: change.changedBy,
        actorRole: "Vendor",
        instituteId: change.instituteId,
        instituteName: change.instituteName,
        targetType: "Institute license",
        targetId: change.id,
        scope: "institute",
        status: "completed",
        severity: "info",
        summary: change.reason,
        source: `licenseChangeHistory/${change.id}`,
        metadata: [
          { label: "Previous plan", value: change.fromPlanId },
          { label: "New plan", value: change.toPlanId },
          { label: "Billing cycle", value: change.billingCycle },
        ],
      }),
    );

    const invoiceEvents: UnifiedAuditEvent[] = invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      timestamp: invoice.paidAt ?? invoice.issuedAt,
      category: "billing",
      action: invoice.status === "paid" ? "Invoice paid" : "Invoice issued",
      actor: "billing.automation",
      actorRole: "System",
      instituteId: invoice.instituteId,
      instituteName: instituteNames.get(invoice.instituteId) ?? invoice.instituteId,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      scope: "institute",
      status:
        invoice.status === "paid"
          ? "completed"
          : invoice.status === "failed"
            ? "failed"
            : "pending",
      severity:
        invoice.status === "failed"
          ? "critical"
          : invoice.status === "past_due"
            ? "warning"
            : "info",
      summary: `${invoice.billingPeriod} invoice for INR ${invoice.amountInr.toLocaleString("en-IN")}.`,
      source: `invoices/${invoice.id}`,
      metadata: [
        { label: "Amount", value: `INR ${invoice.amountInr.toLocaleString("en-IN")}` },
        { label: "Due date", value: formatTimestamp(invoice.dueAt) },
        { label: "Invoice status", value: humanize(invoice.status) },
      ],
    }));

    const communicationEvents: UnifiedAuditEvent[] = billingCommunications.map((communication) => ({
      id: `billing-communication-${communication.id}`,
      timestamp: communication.createdAt,
      category: "billing",
      action: humanize(communication.type),
      actor: communication.initiatedBy,
      actorRole: communication.initiatedBy.includes("automation") ? "System" : "Vendor",
      instituteId: communication.instituteId,
      instituteName: instituteNames.get(communication.instituteId) ?? communication.instituteId,
      targetType: "Billing communication",
      targetId: communication.invoiceId,
      scope: "institute",
      status: "completed",
      severity: communication.type === "payment_reminder" ? "warning" : "info",
      summary: communication.note,
      source: `billingCommunications/${communication.id}`,
      metadata: [
        { label: "Recipient", value: communication.recipient },
        { label: "Delivery status", value: humanize(communication.status) },
      ],
    }));

    const alertEvents: UnifiedAuditEvent[] = billingAlerts.map((alert) => ({
      id: `billing-alert-${alert.id}`,
      timestamp: alert.createdAt,
      category: "billing",
      action: alert.title,
      actor: "billing.monitor",
      actorRole: "System",
      instituteId: alert.instituteId,
      instituteName: instituteNames.get(alert.instituteId) ?? alert.instituteId,
      targetType: "Billing alert",
      targetId: alert.invoiceId,
      scope: "institute",
      status: alert.severity === "critical" ? "failed" : "pending",
      severity: alert.severity,
      summary: alert.message,
      source: `billingAlerts/${alert.id}`,
      metadata: [{ label: "Severity", value: humanize(alert.severity) }],
    }));

    const webhookEvents: UnifiedAuditEvent[] = instituteDataset.webhookLogs.map((webhook) => ({
      id: `webhook-${webhook.id}`,
      timestamp: webhook.receivedAt,
      category: "institutes",
      action: humanize(webhook.eventType),
      actor: "vendor.webhook",
      actorRole: "System",
      instituteId: webhook.instituteId,
      instituteName: instituteNames.get(webhook.instituteId) ?? webhook.instituteId,
      targetType: "Institute webhook",
      targetId: webhook.id,
      scope: "institute",
      status:
        webhook.status === "processed"
          ? "completed"
          : webhook.status === "failed"
            ? "failed"
            : "pending",
      severity:
        webhook.status === "failed"
          ? "critical"
          : webhook.status === "retrying"
            ? "warning"
            : "info",
      summary: webhook.summary,
      source: `webhookLogs/${webhook.id}`,
      metadata: [{ label: "Processing status", value: humanize(webhook.status) }],
    }));

    const accessEvents: UnifiedAuditEvent[] = instituteDataset.administration.flatMap((record) => {
      const administrators = [record.primaryAdministrator, ...record.additionalAdministrators];
      return administrators.flatMap((administrator) => {
        const rows: UnifiedAuditEvent[] = [
          {
            id: `access-invited-${administrator.id}`,
            timestamp: administrator.invitedAt,
            category: "access",
            action: "Administrator invited",
            actor: "vendor.onboarding",
            actorRole: "Vendor",
            instituteId: record.instituteId,
            instituteName: instituteNames.get(record.instituteId) ?? record.instituteId,
            targetType: "Administrator account",
            targetId: administrator.id,
            scope: "institute",
            status: administrator.invitationStatus === "pending" ? "pending" : "completed",
            severity: "info",
            summary: `${administrator.name} was invited as ${administrator.role}.`,
            source: `instituteAdministrators/${administrator.id}`,
            metadata: [
              { label: "Email", value: administrator.email },
              { label: "Account status", value: humanize(administrator.status) },
              { label: "MFA", value: administrator.mfaEnabled ? "Enabled" : "Not enabled" },
            ],
          },
        ];
        if (administrator.invitationAcceptedAt) {
          rows.push({
            ...rows[0],
            id: `access-accepted-${administrator.id}`,
            timestamp: administrator.invitationAcceptedAt,
            action: "Administrator invitation accepted",
            actor: administrator.email,
            actorRole: "Institute administrator",
            status: "completed",
            summary: `${administrator.name} accepted administrator access.`,
          });
        }
        return rows;
      });
    });

    return [
      ...calibrationEvents,
      ...onboardingEvents,
      ...requestEvents,
      ...licenseHistoryEvents,
      ...invoiceEvents,
      ...communicationEvents,
      ...alertEvents,
      ...webhookEvents,
      ...accessEvents,
    ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  }, [
    billingAlerts,
    billingCommunications,
    calibrationDataset,
    instituteDataset,
    instituteNames,
    invoices,
    onboardingRecords,
    requests,
  ]);

  const instituteOptions = useMemo(() => {
    const options = new Map<string, string>();
    events.forEach((event) => {
      if (event.instituteId && event.scope === "institute") {
        options.set(event.instituteId, event.instituteName);
      }
    });
    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const cutoff = getDateCutoff(filters.dateRange);
    return events.filter((event) => {
      if (filters.category !== "all" && event.category !== filters.category) return false;
      if (filters.instituteId !== "all" && event.instituteId !== filters.instituteId) return false;
      if (filters.status !== "all" && event.status !== filters.status) return false;
      if (filters.scope !== "all" && event.scope !== filters.scope) return false;
      if (cutoff !== null && Date.parse(event.timestamp) < cutoff) return false;
      if (!query) return true;
      return [
        event.action,
        event.actor,
        event.instituteName,
        event.targetId,
        event.summary,
        event.source,
        ...event.metadata.flatMap((item) => [item.label, item.value]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [events, filters]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ?? filteredEvents[0] ?? null;
  const pendingCount = events.filter((event) => event.status === "pending").length;
  const failedCount = events.filter((event) => event.status === "failed").length;
  const instituteEventCount = events.filter((event) => event.scope === "institute").length;

  function resetFilters() {
    setFilters({
      query: "",
      category: "all",
      instituteId: "all",
      status: "all",
      scope: "all",
      dateRange: "all",
    });
  }

  function openEventTarget(event: UnifiedAuditEvent) {
    if (event.category === "calibration") {
      navigate("/vendor/calibration");
      return;
    }
    if (event.category === "onboarding") {
      navigate(`/vendor/institutes?view=onboarding&onboarding=${event.instituteId}`);
      return;
    }
    if (event.instituteId.startsWith("inst_")) {
      navigate(`/vendor/institutes?institute=${event.instituteId}`);
    }
  }

  return (
    <section
      className="vendor-content-card admin-content-card vendor-audit-page"
      aria-labelledby="vendor-audit-title"
    >
      <header className="vendor-audit-heading">
        <div>
          <p className="vendor-content-eyebrow">Vendor governance</p>
          <h2 id="vendor-audit-title">Audit &amp; Activity</h2>
          <p>
            Cross-portal event history for institute operations, onboarding, licensing, billing,
            calibration, and administrator access.
          </p>
        </div>
        <div className="vendor-audit-integrity">
          <span>Audit posture</span>
          <strong>Append-only records</strong>
          <small>Actor, target, source, and timestamp retained</small>
        </div>
      </header>

      <div className="vendor-audit-summary">
        <UiStatCard
          title="Total Events"
          value={String(events.length)}
          helper={`${filteredEvents.length} match current filters`}
        />
        <UiStatCard
          title="Institute Scoped"
          value={String(instituteEventCount)}
          helper="Institute and onboarding activity"
        />
        <UiStatCard
          title="Pending Actions"
          value={String(pendingCount)}
          helper="Requires completion or review"
        />
        <UiStatCard
          title="Failed / Critical"
          value={String(failedCount)}
          helper="Operational attention required"
        />
      </div>

      <nav className="vendor-audit-category-tabs" aria-label="Audit categories">
        {CATEGORY_TABS.map((tab) => {
          const count =
            tab.id === "all"
              ? events.length
              : events.filter((event) => event.category === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              className={filters.category === tab.id ? "vendor-audit-category-active" : ""}
              onClick={() => setFilters((current) => ({ ...current, category: tab.id }))}
            >
              {tab.label}
              <span>{count}</span>
            </button>
          );
        })}
      </nav>

      <section className="vendor-audit-filters" aria-label="Audit filters">
        <UiFormField label="Search events" htmlFor="vendor-audit-search">
          <input
            id="vendor-audit-search"
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="Actor, action, target or note"
          />
        </UiFormField>
        <UiFormField label="Institute" htmlFor="vendor-audit-institute">
          <select
            id="vendor-audit-institute"
            value={filters.instituteId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, instituteId: event.target.value }))
            }
          >
            <option value="all">All institutes</option>
            {instituteOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </UiFormField>
        <UiFormField label="Status" htmlFor="vendor-audit-status">
          <select
            id="vendor-audit-status"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as AuditFilters["status"],
              }))
            }
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </UiFormField>
        <UiFormField label="Scope" htmlFor="vendor-audit-scope">
          <select
            id="vendor-audit-scope"
            value={filters.scope}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                scope: event.target.value as AuditFilters["scope"],
              }))
            }
          >
            <option value="all">All scopes</option>
            <option value="institute">Institute</option>
            <option value="selected_institutes">Selected institutes</option>
            <option value="global">Global</option>
          </select>
        </UiFormField>
        <UiFormField label="Date range" htmlFor="vendor-audit-range">
          <select
            id="vendor-audit-range"
            value={filters.dateRange}
            onChange={(event) =>
              setFilters((current) => ({ ...current, dateRange: event.target.value as DateRange }))
            }
          >
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </UiFormField>
        <button type="button" className="vendor-secondary-button" onClick={resetFilters}>
          Reset
        </button>
      </section>

      <div className="vendor-audit-layout">
        <section className="vendor-audit-stream" aria-label="Audit event stream">
          <header>
            <h3>Event stream</h3>
            <span>{filteredEvents.length} events</span>
          </header>
          <div>
            {filteredEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`vendor-audit-event${selectedEvent?.id === event.id ? " vendor-audit-event-active" : ""}`}
                onClick={() => setSelectedEventId(event.id)}
              >
                <span
                  className={`vendor-audit-event-marker vendor-audit-severity-${event.severity}`}
                />
                <span className="vendor-audit-event-main">
                  <span>
                    <small>{humanize(event.category)}</small>
                    <time>{formatTimestamp(event.timestamp)}</time>
                  </span>
                  <strong>{event.action}</strong>
                  <p>{event.summary}</p>
                  <small>
                    {event.instituteName || humanize(event.scope)} | {event.actor}
                  </small>
                </span>
                <span className={`vendor-status vendor-status-${event.status}`}>
                  {humanize(event.status)}
                </span>
              </button>
            ))}
            {filteredEvents.length === 0 ? (
              <p className="vendor-institute-empty">No events match the current filters.</p>
            ) : null}
          </div>
        </section>

        {selectedEvent ? (
          <aside className="vendor-audit-detail" aria-label="Selected audit event details">
            <header>
              <div>
                <p className="vendor-content-eyebrow">{humanize(selectedEvent.category)}</p>
                <h3>{selectedEvent.action}</h3>
              </div>
              <span className={`vendor-status vendor-status-${selectedEvent.status}`}>
                {humanize(selectedEvent.status)}
              </span>
            </header>
            <p className="vendor-audit-detail-summary">{selectedEvent.summary}</p>
            <dl>
              <div>
                <dt>Timestamp</dt>
                <dd>{formatTimestamp(selectedEvent.timestamp)}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>
                  {selectedEvent.actor}
                  <small>{selectedEvent.actorRole}</small>
                </dd>
              </div>
              <div>
                <dt>Institute</dt>
                <dd>{selectedEvent.instituteName || "Not applicable"}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{humanize(selectedEvent.scope)}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>
                  {selectedEvent.targetType}
                  <small>{selectedEvent.targetId}</small>
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  <code>{selectedEvent.source}</code>
                </dd>
              </div>
              <div>
                <dt>Event ID</dt>
                <dd>
                  <code>{selectedEvent.id}</code>
                </dd>
              </div>
            </dl>
            {selectedEvent.metadata.length > 0 ? (
              <section className="vendor-audit-metadata">
                <h4>Event metadata</h4>
                {selectedEvent.metadata.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </section>
            ) : null}
            <button
              type="button"
              className="vendor-primary-action"
              disabled={
                selectedEvent.category !== "calibration" &&
                selectedEvent.category !== "onboarding" &&
                !selectedEvent.instituteId.startsWith("inst_")
              }
              onClick={() => openEventTarget(selectedEvent)}
            >
              {selectedEvent.category === "calibration"
                ? "Open Calibration"
                : selectedEvent.category === "onboarding"
                  ? "Open Onboarding Record"
                  : "Open Institute"}
            </button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

export default VendorUnifiedAuditWorkspace;
