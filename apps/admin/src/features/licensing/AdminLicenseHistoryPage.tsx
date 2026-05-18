import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
  type LicensingHistoryEntry,
} from "./licensingDataset";
import LicensingWorkspaceNav from "./LicensingWorkspaceNav";

function toLocalDatetime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

function AdminLicenseHistoryPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const licensingInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchLicensingSnapshot(licensingInstituteId);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalLicensingReadMode() ?
            "Local read mode: deterministic license history snapshot loaded." :
            "License history loaded from secured backend API. Timeline remains immutable and vendor-authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load license history.";
        setSnapshot(FALLBACK_SNAPSHOT);
        setInlineMessage(`${reason} Falling back to deterministic licensing history fixtures.`);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [licensingInstituteId]);

  const historyColumns = useMemo<UiTableColumn<LicensingHistoryEntry>[]>(
    () => [
      {
        id: "time",
        header: "Timestamp",
        render: (entry) => toLocalDatetime(entry.timestamp),
      },
      {
        id: "transition",
        header: "Layer Change",
        render: (entry) => `${entry.previousLayer} -> ${entry.newLayer}`,
      },
      {
        id: "billing",
        header: "Billing Change",
        render: (entry) => entry.billingChange,
      },
      {
        id: "reason",
        header: "Reason",
        render: (entry) => entry.reason,
      },
      {
        id: "actor",
        header: "Actor",
        render: (entry) => entry.actor,
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-license-history-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-license-history-title">Dedicated License History Workspace</h2>
      <p className="admin-content-copy">
        This mounted route exposes immutable licensing events from <code>institutes/{"{id}"}/licenseHistory/{"{eventId}"}</code>
        {" "}without collapsing back into the general licensing workspace.
      </p>

      <LicensingWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading license history..." : inlineMessage ?? "License history workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {snapshot.currentPlan.currentLayer} ({resolveLayerBadge(snapshot.currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{snapshot.currentPlan.planName}</h3>
          <p>
            Start {snapshot.currentPlan.licenseStartDate} · Renewal {snapshot.currentPlan.renewalDate} · Expiry {snapshot.currentPlan.expiryDate}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/history
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>History Events</p>
          <h3>{snapshot.licenseHistory.length}</h3>
          <small>Immutable vendor-side timeline entries</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{snapshot.currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(snapshot.currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Billing Cycle</p>
          <h3>{snapshot.currentPlan.billingCycle}</h3>
          <small>Commercial contract metadata</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Timeline Highlights</h3>
        <div className="admin-analytics-insight-list">
          {snapshot.licenseHistory.map((entry) => (
            <article key={entry.eventId} className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">{toLocalDatetime(entry.timestamp)}</p>
              <h4>{entry.previousLayer} to {entry.newLayer}</h4>
              <p>{entry.reason}</p>
              <small>{entry.billingChange} · {entry.actor}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Immutable License Timeline</h3>
        <UiTable
          caption="Immutable license history timeline"
          columns={historyColumns}
          rows={snapshot.licenseHistory}
          rowKey={(row) => row.eventId}
          emptyStateText="No license history entries available."
        />
      </div>
    </section>
  );
}

export default AdminLicenseHistoryPage;
