import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  updateDataRetentionPolicy,
  type AdminSettingsSnapshot,
  type DataRetentionPolicySettings,
} from "./settingsDataset";

const SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

function AdminDataArchiveControlsPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditDataRetention = !isDirector;

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [dataRetentionForm, setDataRetentionForm] = useState<DataRetentionPolicySettings>(
    FALLBACK_SNAPSHOT.dataArchiveControls.dataRetentionPolicy,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setDataRetentionForm(nextSnapshot.dataArchiveControls.dataRetentionPolicy);
    setInlineMessage(message);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchSettingsSnapshot(SETTINGS_INSTITUTE_ID);
        if (!isMounted) {
          return;
        }

        applySnapshot(
          nextSnapshot,
          isLocalSettingsReadMode() ?
            "Local read mode: deterministic data and archive snapshot loaded." :
            "Data and archive controls loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load data and archive controls.";
        applySnapshot(FALLBACK_SNAPSHOT, `${reason} Falling back to deterministic Build 125 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [applySnapshot]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canEditDataRetention) {
      setInlineMessage("Director access is read-only for data retention policy changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateDataRetentionPolicy(SETTINGS_INSTITUTE_ID, dataRetentionForm);
      applySnapshot(nextSnapshot, "Data retention policy updated through secured backend API.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Data retention update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  const storage = snapshot.dataArchiveControls.storageSummary;

  return (
    <section className="admin-content-card" aria-labelledby="admin-data-archive-controls-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-data-archive-controls-title">Dedicated Data & Archive Controls Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates storage visibility and retention controls instead of collapsing the
        data-governance drill-down back into the shared settings workspace.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/settings/profile">Institute Profile</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/academic-year">Academic Year</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/execution-policy">Execution Policy</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/users">Users & Roles</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/security">Security & Access</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/system">System Configuration</NavLink>
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading data and archive controls..." : inlineMessage ?? "Data and archive controls workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Exports remain snapshot-based and never query HOT sessions directly.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Storage Summary</h3>
          <p>
            HOT-WARM-COLD aligned visibility for current-year storage and archived academic-year assets.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/data
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Firestore HOT Usage</p>
          <h3>{storage.firestoreHotUsage}</h3>
          <small>Current operational storage footprint</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>BigQuery Archive Size</p>
          <h3>{storage.bigQueryArchiveSize}</h3>
          <small>Archived analytical storage</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Sessions</p>
          <h3>{storage.activeSessionCount}</h3>
          <small>Current HOT execution load</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Archived Years</p>
          <h3>{storage.archivedAcademicYears}</h3>
          <small>Historical academic-year partitions</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Export and Retention Guidance</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Export Controls</p>
            <h4>Snapshot-first exports</h4>
            <p>Students, run analytics, governance snapshots, and full academic-year exports should read from summary collections, not raw sessions.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Retention Guardrail</p>
            <h4>Active year protected</h4>
            <p>Retention changes must not delete current active-year data or bypass archive sequencing.</p>
          </article>
        </div>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditDataRetention || isSubmitting}>
            <div className="admin-settings-grid-three">
              <label>
                Raw Session Retention (years)
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={dataRetentionForm.rawSessionRetentionYears}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setDataRetentionForm((current) => ({
                      ...current,
                      rawSessionRetentionYears: Number.isFinite(nextValue) ? nextValue : 1,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Auto Export Threshold
                <input
                  type="number"
                  min={1}
                  value={dataRetentionForm.autoExportThreshold}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setDataRetentionForm((current) => ({
                      ...current,
                      autoExportThreshold: Number.isFinite(nextValue) ? nextValue : 1,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Auto Archive Schedule
                <select
                  value={dataRetentionForm.autoArchiveSchedule}
                  onChange={(event) => {
                    setDataRetentionForm((current) => ({
                      ...current,
                      autoArchiveSchedule: event.target.value,
                    }));
                  }}
                >
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="quarterly">quarterly</option>
                </select>
              </label>
            </div>
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditDataRetention || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Retention Policy"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminDataArchiveControlsPage;
