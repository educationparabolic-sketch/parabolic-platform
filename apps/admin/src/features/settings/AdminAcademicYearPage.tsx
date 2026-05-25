import { useCallback, useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  archiveAcademicYear,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  lockAcademicYear,
  resolveAdminInstituteId,
  type AdminSettingsSnapshot,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

function AdminAcademicYearPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditAcademicYear = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [archiveNoActiveConfirmed, setArchiveNoActiveConfirmed] = useState(false);
  const [archiveIrreversibleConfirmed, setArchiveIrreversibleConfirmed] = useState(false);
  const [archiveTypedLabel, setArchiveTypedLabel] = useState("");

  const defaultYearId = FALLBACK_SNAPSHOT.academicYears[0]?.yearId ?? "";
  const [selectedYearId, setSelectedYearId] = useState(defaultYearId);

  const currentAcademicYear = useMemo(
    () => snapshot.academicYears.find((entry) => entry.yearId === selectedYearId) ?? snapshot.academicYears[0] ?? null,
    [selectedYearId, snapshot.academicYears],
  );
  const archiveReady =
    Boolean(currentAcademicYear) &&
    archiveNoActiveConfirmed &&
    archiveIrreversibleConfirmed &&
    archiveTypedLabel.trim() === currentAcademicYear?.academicYearLabel;

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    const nextYearId = nextSnapshot.academicYears[0]?.yearId ?? "";
    setSelectedYearId((currentValue) => {
      if (nextSnapshot.academicYears.some((entry) => entry.yearId === currentValue)) {
        return currentValue;
      }
      return nextYearId;
    });
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
            "Local read mode: deterministic academic year snapshot loaded." :
            "Academic year settings loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load academic year settings.";
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

  const yearColumns = useMemo<UiTableColumn<AdminSettingsSnapshot["academicYears"][number]>[]>(
    () => [
      {
        id: "year",
        header: "Academic Year",
        render: (year) => (
          <div className="admin-risk-student-cell">
            <strong>{year.academicYearLabel}</strong>
            <small>{year.yearId}</small>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        render: (year) => year.status,
      },
      {
        id: "counts",
        header: "Students / Runs",
        render: (year) => `${year.studentCount} / ${year.runCount}`,
      },
      {
        id: "snapshot",
        header: "Snapshot",
        render: (year) => year.snapshotStatus,
      },
    ],
    [],
  );

  async function handleLockYear(): Promise<void> {
    if (!currentAcademicYear) {
      return;
    }

    if (!canEditAcademicYear) {
      setInlineMessage("Director access is read-only for academic year actions.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await lockAcademicYear(settingsInstituteId, currentAcademicYear.yearId);
      applySnapshot(nextSnapshot, `Academic year ${currentAcademicYear.academicYearLabel} locked successfully.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Academic year lock failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchiveYear(): Promise<void> {
    if (!currentAcademicYear) {
      return;
    }

    if (!canEditAcademicYear) {
      setInlineMessage("Director access is read-only for archive actions.");
      return;
    }

    if (!archiveReady) {
      setInlineMessage("Complete both archive confirmations and type the academic year label before archiving.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      await archiveAcademicYear(settingsInstituteId, currentAcademicYear.yearId);
      const nextSnapshot = await fetchSettingsSnapshot(settingsInstituteId);
      setArchiveNoActiveConfirmed(false);
      setArchiveIrreversibleConfirmed(false);
      setArchiveTypedLabel("");
      applySnapshot(nextSnapshot, `Archive requested for ${currentAcademicYear.academicYearLabel} through secured archive API.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Academic year archive failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-academic-year-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-academic-year-title">Dedicated Academic Year Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates academic-year lifecycle controls instead of collapsing that drill-down
        back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading academic year settings..." : inlineMessage ?? "Academic year workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Active year transitions follow Active to Locked to Archive lifecycle rules.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentAcademicYear?.academicYearLabel ?? "Academic Year"}</h3>
          <p>
            Status {currentAcademicYear?.status ?? "-"} · Snapshot {currentAcademicYear?.snapshotStatus ?? "-"}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/academic-year
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Year</p>
          <h3>{currentAcademicYear?.academicYearLabel ?? "-"}</h3>
          <small>Selected lifecycle record</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Students</p>
          <h3>{currentAcademicYear?.studentCount ?? 0}</h3>
          <small>Current year student volume</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Runs</p>
          <h3>{currentAcademicYear?.runCount ?? 0}</h3>
          <small>Current year run volume</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Snapshot</p>
          <h3>{currentAcademicYear?.snapshotStatus ?? "-"}</h3>
          <small>Governance snapshot readiness</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Academic Year Lifecycle</h3>
        <UiTable
          caption="Academic year lifecycle table"
          columns={yearColumns}
          rows={snapshot.academicYears}
          rowKey={(year) => year.yearId}
          emptyStateText="No academic years available."
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>Selected Year Actions</h3>
        <div className="admin-settings-year-actions">
          <label htmlFor="settings-year-select-dedicated">Selected Year</label>
          <select
            id="settings-year-select-dedicated"
            value={currentAcademicYear?.yearId ?? ""}
            onChange={(event) => {
              setSelectedYearId(event.target.value);
              setArchiveNoActiveConfirmed(false);
              setArchiveIrreversibleConfirmed(false);
              setArchiveTypedLabel("");
            }}
          >
            {snapshot.academicYears.map((year) => (
              <option key={year.yearId} value={year.yearId}>
                {year.academicYearLabel} ({year.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-compact-button"
            disabled={!canEditAcademicYear || !currentAcademicYear || isSubmitting || currentAcademicYear.status !== "Active"}
            onClick={() => {
              void handleLockYear();
            }}
          >
            Lock Year
          </button>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Archive Preview and Confirmation</h3>
        <p className="admin-content-copy">
          Academic-year archive is irreversible. Complete the backup review and both confirmations before sending the
          request to the secured archive pipeline.
        </p>
        <div className="admin-settings-archive-preview">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Selected Year</p>
            <h4>{currentAcademicYear?.academicYearLabel ?? "-"}</h4>
            <p>
              {currentAcademicYear?.studentCount ?? 0} students · {currentAcademicYear?.runCount ?? 0} runs · snapshot{" "}
              {currentAcademicYear?.snapshotStatus ?? "-"}
            </p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Backup / Export</p>
            <h4>Export before archive</h4>
            <p>
              Generate final governance snapshot, seal studentYearMetrics, export sessions to BigQuery, and verify
              snapshot-first backup availability before HOT cleanup.
            </p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Post-Archive State</p>
            <h4>Read-only historical year</h4>
            <p>
              The year appears in Governance longitudinal comparison. No recalculation or new test generation should
              run against the archived year.
            </p>
          </article>
        </div>
        <ol className="admin-settings-archive-flow">
          <li>Generate final governance snapshot.</li>
          <li>Seal studentYearMetrics.</li>
          <li>Export session data to BigQuery.</li>
          <li>Move HOT collections to the WARM partition.</li>
          <li>Clear HOT session collections.</li>
          <li>Initialize the next academic year.</li>
        </ol>
        <div className="admin-settings-archive-confirmation">
          <label>
            <input
              type="checkbox"
              checked={archiveNoActiveConfirmed}
              disabled={!canEditAcademicYear || isSubmitting || currentAcademicYear?.status === "Archived"}
              onChange={(event) => {
                setArchiveNoActiveConfirmed(event.target.checked);
              }}
            />
            I confirm there are no active tests or attempts for this academic year.
          </label>
          <label>
            <input
              type="checkbox"
              checked={archiveIrreversibleConfirmed}
              disabled={!canEditAcademicYear || isSubmitting || currentAcademicYear?.status === "Archived"}
              onChange={(event) => {
                setArchiveIrreversibleConfirmed(event.target.checked);
              }}
            />
            I confirm archive is irreversible and should make the year read-only.
          </label>
          <label>
            Type {currentAcademicYear?.academicYearLabel ?? "the academic year label"} to confirm
            <input
              type="text"
              value={archiveTypedLabel}
              disabled={!canEditAcademicYear || isSubmitting || currentAcademicYear?.status === "Archived"}
              onChange={(event) => {
                setArchiveTypedLabel(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="admin-compact-button"
            disabled={
              !canEditAcademicYear ||
              !currentAcademicYear ||
              isSubmitting ||
              currentAcademicYear.status === "Archived" ||
              !archiveReady
            }
            onClick={() => {
              void handleArchiveYear();
            }}
          >
            {isSubmitting ? "Archiving..." : "Archive Year"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default AdminAcademicYearPage;
