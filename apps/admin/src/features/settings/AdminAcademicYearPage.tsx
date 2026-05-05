import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
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
  type AdminSettingsSnapshot,
} from "./settingsDataset";

const SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

function AdminAcademicYearPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditAcademicYear = !isDirector;

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const defaultYearId = FALLBACK_SNAPSHOT.academicYears[0]?.yearId ?? "";
  const [selectedYearId, setSelectedYearId] = useState(defaultYearId);

  const currentAcademicYear = useMemo(
    () => snapshot.academicYears.find((entry) => entry.yearId === selectedYearId) ?? snapshot.academicYears[0] ?? null,
    [selectedYearId, snapshot.academicYears],
  );

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
        const nextSnapshot = await fetchSettingsSnapshot(SETTINGS_INSTITUTE_ID);
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
  }, [applySnapshot]);

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
      const nextSnapshot = await lockAcademicYear(SETTINGS_INSTITUTE_ID, currentAcademicYear.yearId);
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

    const confirmed = window.confirm(
      `Archive ${currentAcademicYear.academicYearLabel}? This action is irreversible.`,
    );

    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      await archiveAcademicYear(SETTINGS_INSTITUTE_ID, currentAcademicYear.yearId);
      const nextSnapshot = await fetchSettingsSnapshot(SETTINGS_INSTITUTE_ID);
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

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/settings/profile">Institute Profile</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/execution-policy">Execution Policy</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/users">Users & Roles</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/security">Security & Access</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/data">Data & Archive</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/system">System Configuration</NavLink>
      </p>

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
          <button
            type="button"
            className="admin-compact-button"
            disabled={!canEditAcademicYear || !currentAcademicYear || isSubmitting || currentAcademicYear.status === "Archived"}
            onClick={() => {
              void handleArchiveYear();
            }}
          >
            Archive Year
          </button>
        </div>
      </div>
    </section>
  );
}

export default AdminAcademicYearPage;
