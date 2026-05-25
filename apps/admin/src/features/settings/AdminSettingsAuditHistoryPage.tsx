import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  type AdminSettingsSnapshot,
  type SettingsAuditEntry,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
}

function AdminSettingsAuditHistoryPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchSettingsSnapshot(settingsInstituteId);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalSettingsReadMode() ?
            "Local read mode: deterministic settings audit history loaded." :
            "Settings audit history loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load settings audit history.";
        setSnapshot(FALLBACK_SNAPSHOT);
        setInlineMessage(`${reason} Falling back to deterministic Build 125 settings fixtures.`);
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
  }, [settingsInstituteId]);

  const auditRows = useMemo(
    () => [...snapshot.settingsAudit].sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    [snapshot.settingsAudit],
  );
  const latestAudit = auditRows[0] ?? null;
  const auditedAreas = new Set(auditRows.map((entry) => entry.area)).size;
  const mutationCount = auditRows.filter((entry) => entry.actionType !== "GET_SETTINGS_SNAPSHOT").length;

  const auditColumns = useMemo<UiTableColumn<SettingsAuditEntry>[]>(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        render: (entry) => (
          <div className="admin-settings-audit-cell">
            <strong>{formatTimestamp(entry.timestamp)}</strong>
            <small>{entry.eventId}</small>
          </div>
        ),
      },
      {
        id: "area",
        header: "Settings Area",
        render: (entry) => entry.area,
      },
      {
        id: "action",
        header: "Action",
        render: (entry) => entry.actionType,
      },
      {
        id: "actor",
        header: "Actor",
        render: (entry) => (
          <div className="admin-settings-audit-cell">
            <strong>{entry.actor}</strong>
            <small>{entry.actorRole}</small>
          </div>
        ),
      },
      {
        id: "target",
        header: "Target",
        render: (entry) => entry.target,
      },
      {
        id: "summary",
        header: "Summary",
        render: (entry) => entry.summary,
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-settings-audit-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-settings-audit-title">Dedicated Settings Audit History</h2>
      <p className="admin-content-copy">
        Read-only timeline of configuration mutations recorded under institutes/{"{id}"}/settingsAudit/{"{eventId}"}.
        It surfaces who changed what, when, and which operational boundary was affected.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading settings audit history..." : inlineMessage ?? "Settings audit history ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Audit history is visible here without exposing edit controls.
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Audit Events</p>
          <h3>{auditRows.length}</h3>
          <small>settingsAudit records</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Mutations</p>
          <h3>{mutationCount}</h3>
          <small>configuration-changing entries</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Areas Covered</p>
          <h3>{auditedAreas}</h3>
          <small>settings sections with history</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Latest Event</p>
          <h3>{latestAudit ? latestAudit.area : "-"}</h3>
          <small>{latestAudit ? formatTimestamp(latestAudit.timestamp) : "No audit entries"}</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Mutation Boundary</h4>
          <p>Settings history is audit-only and does not mutate completed runs, sessions, or historical metrics.</p>
          <small>Operational configuration boundary</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Source Collection</h4>
          <p>institutes/{settingsInstituteId}/settingsAudit/{"{eventId}"}</p>
          <small>Append-only event trail</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Access Posture</h4>
          <p>Admin and director users can review history; mutation actions remain on their dedicated workspaces.</p>
          <small>No edit option on audit rows</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Settings Audit Timeline</h3>
        <UiTable
          caption="Settings audit history from institute settingsAudit records"
          columns={auditColumns}
          rows={auditRows}
          rowKey={(entry) => entry.eventId}
          emptyStateText="No settings audit entries are currently available."
        />
      </div>
    </section>
  );
}

export default AdminSettingsAuditHistoryPage;
