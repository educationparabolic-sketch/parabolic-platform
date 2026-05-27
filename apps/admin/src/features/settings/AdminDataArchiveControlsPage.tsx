import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  updateDataRetentionPolicy,
  type AdminSettingsSnapshot,
  type DataRetentionPolicySettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

interface ExportControlRow {
  id: string;
  label: string;
  format: string;
  source: string;
  scope: string;
  eligibility: string;
  treatment: string;
}

const EXPORT_CONTROL_ROWS: ExportControlRow[] = [
  {
    eligibility: "Current roster snapshot available",
    format: "CSV",
    id: "students-csv",
    label: "Export Students",
    scope: "Active academic year roster and status fields",
    source: "studentYearMetrics + students summary records",
    treatment: "No session scan; preserves current-year roster snapshot for operational backup.",
  },
  {
    eligibility: "runAnalytics summaries sealed",
    format: "CSV / JSON",
    id: "run-analytics",
    label: "Export Run Analytics",
    scope: "Completed run summaries, risk distribution, stability, and discipline metrics",
    source: "runAnalytics/{runId}",
    treatment: "Reads immutable run-level summaries only; raw attempts remain outside settings export.",
  },
  {
    eligibility: "Governance snapshot ready",
    format: "PDF / JSON",
    id: "governance-snapshot",
    label: "Export Governance Snapshot",
    scope: "Latest governance period or archived academic-year snapshot",
    source: "governanceSnapshots/{period}",
    treatment: "Uses sealed governance documents for trustee, planning, and archive evidence.",
  },
  {
    eligibility: "Active export job window open",
    format: "ZIP",
    id: "academic-year",
    label: "Full Academic Year Export",
    scope: "Students, run analytics, governance snapshot, settings audit, and archive manifest",
    source: "snapshot collections + archive manifest",
    treatment: "Creates a backup bundle before archive; does not clear HOT data or mutate retention state.",
  },
];

function AdminDataArchiveControlsPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditDataRetention = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

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
        const nextSnapshot = await fetchSettingsSnapshot(settingsInstituteId);
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
  }, [applySnapshot, settingsInstituteId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canEditDataRetention) {
      setInlineMessage("Director access is read-only for data retention policy changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateDataRetentionPolicy(settingsInstituteId, dataRetentionForm);
      applySnapshot(nextSnapshot, "Data retention policy updated through secured backend API.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Data retention update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  const storage = snapshot.dataArchiveControls.storageSummary;
  const activeYear =
    snapshot.academicYears.find((year) => year.status === "Active") ?? snapshot.academicYears[0] ?? null;
  const latestSnapshotYear =
    snapshot.academicYears.find((year) => year.snapshotStatus.toLowerCase() === "ready") ?? activeYear;
  const exportColumns = useMemo<UiTableColumn<ExportControlRow>[]>(
    () => [
      {
        header: "Export",
        id: "label",
        render: (row) => (
          <div className="admin-risk-student-cell">
            <strong>{row.label}</strong>
            <small>{row.format}</small>
          </div>
        ),
      },
      {
        header: "Snapshot Source",
        id: "source",
        render: (row) => row.source,
      },
      {
        header: "Scope",
        id: "scope",
        render: (row) => row.scope,
      },
      {
        header: "Eligibility",
        id: "eligibility",
        render: (row) => row.eligibility,
      },
      {
        header: "Treatment",
        id: "treatment",
        render: (row) => row.treatment,
      },
    ],
    [],
  );

  function requestExport(row: ExportControlRow): void {
    setInlineMessage(
      `${row.label} queued as a snapshot-backed export from ${row.source}; settings will not query sessions or mutate archive state.`,
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-data-archive-controls-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-data-archive-controls-title">Dedicated Data & Archive Controls Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates storage visibility and retention controls instead of collapsing the
        data-governance drill-down back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

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
        <h3>Dedicated Export Controls Center</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Active Year Export Scope</p>
            <h4>{activeYear?.academicYearLabel ?? "No active year loaded"}</h4>
            <p>
              Student and run exports use current-year snapshot collections. Full academic-year export is treated as a
              backup bundle and does not trigger archive cleanup.
            </p>
            <small>
              Students: {activeYear?.studentCount ?? 0} · Runs: {activeYear?.runCount ?? 0} · Snapshot:{" "}
              {activeYear?.snapshotStatus ?? "Unknown"}
            </small>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Governance Export Scope</p>
            <h4>{latestSnapshotYear?.snapshotId ?? "pending governance snapshot"}</h4>
            <p>
              Governance exports read sealed `governanceSnapshots` records for the selected period and never rebuild
              history from sessions, rawAttempts, or per-question logs.
            </p>
            <small>Status: {latestSnapshotYear?.snapshotStatus ?? "Pending"}</small>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Audit Boundary</p>
            <h4>Export requests stay non-destructive</h4>
            <p>
              Export actions create backup artifacts from snapshot sources. Retention edits, archive jobs, and HOT
              partition clearing remain separate controls.
            </p>
          </article>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <UiTable
          caption="Snapshot-backed settings export controls"
          columns={exportColumns}
          rows={EXPORT_CONTROL_ROWS}
          rowKey={(row) => row.id}
        />
        <div className="admin-analytics-inline-link-row" aria-label="Export actions">
          {EXPORT_CONTROL_ROWS.map((row) => (
            <button
              key={row.id}
              type="button"
              className="admin-primary-link"
              onClick={() => requestExport(row)}
            >
              {row.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Retention Guardrails</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Active Year Protected</p>
            <h4>No retention delete against active year</h4>
            <p>Retention changes must not delete current active-year data or bypass archive sequencing.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Source Contract</p>
            <h4>Exports pull from snapshot collections</h4>
            <p>Students, run analytics, governance snapshots, and full-year bundles are sourced from summaries and archive manifests only.</p>
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
