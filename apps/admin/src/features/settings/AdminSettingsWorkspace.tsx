import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  lockAcademicYear,
  removeUserAccess,
  requestAcademicYearArchive,
  resetUserPassword,
  resolveAdminInstituteId,
  updateInstituteProfile,
  updateSecuritySettings,
  upsertUserAccess,
  type AdminSettingsSnapshot,
  type InstituteProfileSettings,
  type SettingsAuditEntry,
  type StaffAccessRecord,
  type StaffRole,
} from "./settingsDataset";

type SettingsView = "general" | "academic" | "access" | "activity";

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string; path: string }> = [
  { id: "general", label: "General", path: "/admin/settings/profile" },
  { id: "academic", label: "Academic Years", path: "/admin/settings/academic-year" },
  { id: "access", label: "Users & Access", path: "/admin/settings/access" },
  { id: "activity", label: "Activity", path: "/admin/settings/audit-history" },
];

interface ArchiveRequest {
  id: string;
  yearId: string;
  yearLabel: string;
  requestedAt: string;
  status: "pending";
}

interface UserDraft {
  displayName: string;
  email: string;
  role: Exclude<StaffRole, "support">;
}

const EMPTY_USER_DRAFT: UserDraft = { displayName: "", email: "", role: "teacher" };
const MAX_LOGO_FILE_BYTES = 500 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function resolveView(pathname: string): SettingsView {
  if (pathname.endsWith("/academic-year")) return "academic";
  if (pathname.endsWith("/access")) return "access";
  if (pathname.endsWith("/audit-history")) return "activity";
  return "general";
}

function formatDate(value?: string): string {
  if (!value) return "Not available";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

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

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function resolveLogoSource(reference: string): string {
  const normalized = reference.trim();
  if (!normalized) return "";
  if (/^(data:|blob:|https?:\/\/)/i.test(normalized)) return normalized;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function instituteInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function localAudit(
  area: string,
  actionType: SettingsAuditEntry["actionType"],
  summary: string,
): SettingsAuditEntry {
  const timestamp = new Date().toISOString();
  const eventId = `settings_audit_${Date.now()}`;
  return {
    eventId,
    timestamp,
    actor: "admin.current",
    actorRole: "admin",
    actionType,
    area,
    summary,
    target: area.toLowerCase().replaceAll(" ", "."),
    sourcePath: `institutes/local/settingsAudit/${eventId}`,
  };
}

function AdminSettingsWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const instituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const activeView = resolveView(location.pathname);
  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [profileDraft, setProfileDraft] = useState<InstituteProfileSettings>(
    FALLBACK_SNAPSHOT.profile,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedYearId, setSelectedYearId] = useState(
    FALLBACK_SNAPSHOT.academicYears[0]?.yearId ?? "",
  );
  const [lockConfirmed, setLockConfirmed] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [archiveTypedLabel, setArchiveTypedLabel] = useState("");
  const [archiveRequests, setArchiveRequests] = useState<ArchiveRequest[]>([]);
  const [userDraft, setUserDraft] = useState<UserDraft>(EMPTY_USER_DRAFT);
  const [selectedUserId, setSelectedUserId] = useState(FALLBACK_SNAPSHOT.users[0]?.userId ?? "");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityArea, setActivityArea] = useState("all");
  const [sessionTimeoutDraft, setSessionTimeoutDraft] = useState(
    String(FALLBACK_SNAPSHOT.security.sessionTimeoutDuration),
  );
  const [logoFileName, setLogoFileName] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoImageFailed, setLogoImageFailed] = useState(false);
  const [logoInputKey, setLogoInputKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setIsLoading(true);
      try {
        const nextSnapshot = await fetchSettingsSnapshot(instituteId);
        if (!mounted) return;
        setSnapshot(nextSnapshot);
        setProfileDraft(nextSnapshot.profile);
        setSessionTimeoutDraft(String(nextSnapshot.security.sessionTimeoutDuration));
        setLogoImageFailed(false);
        setSelectedYearId(nextSnapshot.academicYears[0]?.yearId ?? "");
        setSelectedUserId(nextSnapshot.users[0]?.userId ?? "");
        setMessage(
          isLocalSettingsReadMode()
            ? "Local institute settings loaded."
            : "Institute settings loaded from the secured API.",
        );
      } catch (error) {
        if (!mounted) return;
        setSnapshot(FALLBACK_SNAPSHOT);
        setMessage(
          `${error instanceof ApiClientError ? error.message : "Unable to load institute settings."} Showing the last available snapshot.`,
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [instituteId]);

  const activeYear = snapshot.academicYears.find((year) => year.status === "Active") ?? null;
  const selectedYear =
    snapshot.academicYears.find((year) => year.yearId === selectedYearId) ??
    snapshot.academicYears[0] ??
    null;
  const selectedUser = snapshot.users.find((user) => user.userId === selectedUserId) ?? null;
  const primaryAdmin = snapshot.users.find((user) => user.role === "admin") ?? null;
  const activeUsers = snapshot.users.filter((user) => user.status === "active").length;
  const activityAreas = [...new Set(snapshot.settingsAudit.map((entry) => entry.area))].sort();
  const filteredActivity = snapshot.settingsAudit.filter((entry) => {
    if (activityArea !== "all" && entry.area !== activityArea) return false;
    const query = activityQuery.trim().toLowerCase();
    if (!query) return true;
    return [entry.actor, entry.area, entry.summary, entry.actionType, entry.target]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  function applyLocalSnapshot(nextSnapshot: AdminSettingsSnapshot, nextMessage: string) {
    setSnapshot(nextSnapshot);
    setProfileDraft(nextSnapshot.profile);
    setMessage(nextMessage);
  }

  function resetLogoSelection() {
    setProfileDraft((current) => ({ ...current, logoReference: snapshot.profile.logoReference }));
    setLogoFileName("");
    setLogoError("");
    setLogoImageFailed(false);
    setLogoInputKey((current) => current + 1);
  }

  function handleLogoSelection(file: File | null) {
    setLogoError("");
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setLogoError("Use a PNG, JPG, or WebP image.");
      setLogoInputKey((current) => current + 1);
      return;
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setLogoError("Logo must be 500 KB or smaller.");
      setLogoInputKey((current) => current + 1);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setLogoError("Unable to read the selected image.");
        return;
      }
      setProfileDraft((current) => ({ ...current, logoReference: reader.result as string }));
      setLogoFileName(file.name);
      setLogoImageFailed(false);
    };
    reader.onerror = () => setLogoError("Unable to read the selected image.");
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirector) return;
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        applyLocalSnapshot(
          {
            ...snapshot,
            profile: profileDraft,
            settingsAudit: [
              localAudit(
                "Institute Profile",
                "UPDATE_INSTITUTE_PROFILE",
                "Operational institute profile updated.",
              ),
              ...snapshot.settingsAudit,
            ],
          },
          "Institute profile saved.",
        );
      } else {
        applyLocalSnapshot(
          await updateInstituteProfile(instituteId, profileDraft),
          "Institute profile saved.",
        );
      }
      setLogoFileName("");
      setLogoError("");
      setLogoInputKey((current) => current + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save institute profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLockYear() {
    if (!selectedYear || selectedYear.status !== "Active" || !lockConfirmed || isDirector) return;
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        const nextSnapshot = {
          ...snapshot,
          academicYears: snapshot.academicYears.map((year) =>
            year.yearId === selectedYear.yearId ? { ...year, status: "Locked" as const } : year,
          ),
          settingsAudit: [
            localAudit(
              "Academic Year Management",
              "LOCK_ACADEMIC_YEAR",
              `${selectedYear.academicYearLabel} locked after active-attempt confirmation.`,
            ),
            ...snapshot.settingsAudit,
          ],
        };
        applyLocalSnapshot(nextSnapshot, `${selectedYear.academicYearLabel} locked.`);
      } else {
        applyLocalSnapshot(
          await lockAcademicYear(instituteId, selectedYear.yearId),
          `${selectedYear.academicYearLabel} locked.`,
        );
      }
      setLockConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to lock academic year.");
    } finally {
      setIsSaving(false);
    }
  }

  async function requestArchive() {
    if (
      !selectedYear ||
      selectedYear.status !== "Locked" ||
      !archiveConfirmed ||
      archiveTypedLabel.trim() !== selectedYear.academicYearLabel ||
      isDirector
    ) {
      setMessage("Select a locked year, confirm the request, and type its exact label.");
      return;
    }
    if (archiveRequests.some((request) => request.yearId === selectedYear.yearId)) {
      setMessage("An archive request is already pending for this academic year.");
      return;
    }
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        setSnapshot((current) => ({
          ...current,
          settingsAudit: [
            localAudit(
              "Academic Year Management",
              "REQUEST_ACADEMIC_YEAR_ARCHIVE",
              `Archive requested for ${selectedYear.academicYearLabel}; no data was deleted.`,
            ),
            ...current.settingsAudit,
          ],
        }));
      } else {
        applyLocalSnapshot(
          await requestAcademicYearArchive(instituteId, selectedYear.yearId),
          `Archive request submitted for ${selectedYear.academicYearLabel}.`,
        );
      }
      setArchiveRequests((current) => [
        {
          id: `archive_request_${Date.now()}`,
          yearId: selectedYear.yearId,
          yearLabel: selectedYear.academicYearLabel,
          requestedAt: new Date().toISOString(),
          status: "pending",
        },
        ...current,
      ]);
      setArchiveConfirmed(false);
      setArchiveTypedLabel("");
      setMessage(`Archive request submitted for ${selectedYear.academicYearLabel}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit archive request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirector) return;
    setIsSaving(true);
    const nextUser: StaffAccessRecord = {
      userId: `staff_${Date.now()}`,
      displayName: userDraft.displayName.trim(),
      email: userDraft.email.trim().toLowerCase(),
      role: userDraft.role,
      status: "active",
      updatedAt: new Date().toISOString(),
    };
    try {
      if (isLocalSettingsReadMode()) {
        const nextSnapshot = {
          ...snapshot,
          users: [...snapshot.users, nextUser],
          settingsAudit: [
            localAudit(
              "User & Role Management",
              "UPSERT_USER_ACCESS",
              `Invited ${nextUser.email} as ${nextUser.role}.`,
            ),
            ...snapshot.settingsAudit,
          ],
        };
        applyLocalSnapshot(nextSnapshot, `Invitation created for ${nextUser.email}.`);
      } else {
        applyLocalSnapshot(
          await upsertUserAccess(instituteId, nextUser),
          `Invitation created for ${nextUser.email}.`,
        );
      }
      setUserDraft(EMPTY_USER_DRAFT);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite user.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSelectedUser(changes: Partial<Pick<StaffAccessRecord, "role" | "status">>) {
    if (!selectedUser || selectedUser.userId === primaryAdmin?.userId || isDirector) return;
    const nextUser = { ...selectedUser, ...changes, updatedAt: new Date().toISOString() };
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        applyLocalSnapshot(
          {
            ...snapshot,
            users: snapshot.users.map((user) =>
              user.userId === nextUser.userId ? nextUser : user,
            ),
            settingsAudit: [
              localAudit(
                "User & Role Management",
                "UPSERT_USER_ACCESS",
                `Updated access for ${nextUser.email}.`,
              ),
              ...snapshot.settingsAudit,
            ],
          },
          `Access updated for ${nextUser.email}.`,
        );
      } else {
        applyLocalSnapshot(
          await upsertUserAccess(instituteId, nextUser),
          `Access updated for ${nextUser.email}.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update user access.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeSelectedUser() {
    if (!selectedUser || selectedUser.userId === primaryAdmin?.userId || isDirector) return;
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        const remainingUsers = snapshot.users.filter((user) => user.userId !== selectedUser.userId);
        applyLocalSnapshot(
          {
            ...snapshot,
            users: remainingUsers,
            settingsAudit: [
              localAudit(
                "User & Role Management",
                "REMOVE_USER_ACCESS",
                `Removed ${selectedUser.email}.`,
              ),
              ...snapshot.settingsAudit,
            ],
          },
          `${selectedUser.email} removed from institute access.`,
        );
        setSelectedUserId(remainingUsers[0]?.userId ?? "");
      } else {
        applyLocalSnapshot(
          await removeUserAccess(instituteId, selectedUser.userId),
          `${selectedUser.email} removed from institute access.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove user access.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendResetEmail() {
    if (!selectedUser || isDirector) return;
    setIsSaving(true);
    try {
      if (!isLocalSettingsReadMode()) {
        applyLocalSnapshot(
          await resetUserPassword(instituteId, selectedUser.userId),
          `Password reset email requested for ${selectedUser.email}.`,
        );
      } else {
        setMessage(`Password reset email requested for ${selectedUser.email}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request password reset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSessionPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDirector) return;
    const sessionTimeoutDuration = Number(sessionTimeoutDraft);
    if (
      !Number.isInteger(sessionTimeoutDuration) ||
      sessionTimeoutDuration < 5 ||
      sessionTimeoutDuration > 720
    ) {
      setMessage("Idle timeout must be a whole number between 5 and 720 minutes.");
      return;
    }
    const nextSecurity = { ...snapshot.security, sessionTimeoutDuration };
    setIsSaving(true);
    try {
      if (isLocalSettingsReadMode()) {
        setSnapshot((current) => ({
          ...current,
          security: nextSecurity,
          settingsAudit: [
            localAudit(
              "Security & Access",
              "UPDATE_SECURITY_SETTINGS",
              "Institute session policy updated.",
            ),
            ...current.settingsAudit,
          ],
        }));
        setMessage("Session policy saved.");
      } else {
        applyLocalSnapshot(
          await updateSecuritySettings(instituteId, nextSecurity),
          "Session policy saved.",
        );
      }
      setSessionTimeoutDraft(String(sessionTimeoutDuration));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save session policy.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className="admin-content-card admin-settings-page"
      aria-labelledby="admin-settings-title"
    >
      <header className="admin-settings-heading">
        <div>
          <p className="admin-content-eyebrow">Institute administration</p>
          <h2 id="admin-settings-title">Settings</h2>
          <p>Institute-owned profile, academic lifecycle, staff access, and change history.</p>
        </div>
        <div className="admin-settings-posture">
          <span>Access posture</span>
          <strong>{isDirector ? "Read only" : "Administrator"}</strong>
          <small>
            {activeUsers} active users · {activeYear?.academicYearLabel ?? "No active year"}
          </small>
        </div>
      </header>

      <nav className="admin-settings-tabs" aria-label="Settings workspaces">
        {SETTINGS_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={activeView === view.id ? "admin-settings-tab-active" : ""}
            onClick={() => navigate(view.path)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      <p className="admin-settings-load-state">{isLoading ? "Loading settings..." : message}</p>

      {activeView === "general" ? (
        <div className="admin-settings-view">
          <section className="admin-settings-view-heading">
            <div>
              <h3>Institute profile</h3>
              <p>Operational identity and regional defaults used across the admin portal.</p>
            </div>
            <span className="admin-settings-status-pill">Institute managed</span>
          </section>
          <div className="admin-settings-summary">
            <UiStatCard
              title="Institute"
              value={snapshot.profile.instituteName}
              helper="Registered identity"
            />
            <UiStatCard
              title="Time Zone"
              value={profileDraft.timeZone}
              helper="Scheduling and reports"
            />
            <UiStatCard
              title="Default Exam"
              value={profileDraft.defaultExamType}
              helper="New-test default"
            />
            <UiStatCard
              title="Academic Format"
              value={profileDraft.academicYearFormat}
              helper="Display convention"
            />
          </div>
          <form className="admin-settings-form-panel" onSubmit={saveProfile}>
            <header>
              <h3>General information</h3>
              <p>Registered institute identity changes require vendor support.</p>
            </header>
            <div className="admin-settings-form-grid">
              <UiFormField
                label="Registered institute name"
                htmlFor="settings-name"
                helper="Vendor-managed legal and billing identity."
              >
                <input id="settings-name" value={profileDraft.instituteName} disabled />
              </UiFormField>
              <section
                className="admin-settings-logo-control"
                aria-labelledby="settings-logo-label"
              >
                <div className="admin-settings-logo-preview">
                  {resolveLogoSource(profileDraft.logoReference) && !logoImageFailed ? (
                    <img
                      src={resolveLogoSource(profileDraft.logoReference)}
                      alt={`${profileDraft.instituteName} logo`}
                      onError={() => setLogoImageFailed(true)}
                    />
                  ) : (
                    <span aria-hidden="true">
                      {instituteInitials(profileDraft.instituteName) || "IN"}
                    </span>
                  )}
                </div>
                <div className="admin-settings-logo-copy">
                  <span id="settings-logo-label" className="ui-form-label">
                    Institute logo
                  </span>
                  <strong>{logoFileName || "Current institute logo"}</strong>
                  <small>PNG, JPG, or WebP. Maximum 500 KB. A square image works best.</small>
                  <div className="admin-settings-logo-actions">
                    <label
                      htmlFor="settings-logo-upload"
                      className={
                        isDirector || isSaving ? "admin-settings-logo-upload-disabled" : ""
                      }
                    >
                      Choose Image
                    </label>
                    {logoFileName ? (
                      <button
                        type="button"
                        onClick={resetLogoSelection}
                        disabled={isDirector || isSaving}
                      >
                        Discard
                      </button>
                    ) : null}
                  </div>
                  <input
                    key={logoInputKey}
                    id="settings-logo-upload"
                    className="admin-settings-logo-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={isDirector || isSaving}
                    onChange={(event) => handleLogoSelection(event.target.files?.[0] ?? null)}
                  />
                  {logoError ? (
                    <small className="admin-settings-logo-error" role="alert">
                      {logoError}
                    </small>
                  ) : null}
                </div>
              </section>
              <UiFormField label="Operational email" htmlFor="settings-email">
                <input
                  id="settings-email"
                  type="email"
                  value={profileDraft.contactEmail}
                  disabled={isDirector || isSaving}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, contactEmail: event.target.value }))
                  }
                  required
                />
              </UiFormField>
              <UiFormField label="Operational phone" htmlFor="settings-phone">
                <input
                  id="settings-phone"
                  value={profileDraft.contactPhone}
                  disabled={isDirector || isSaving}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, contactPhone: event.target.value }))
                  }
                  required
                />
              </UiFormField>
              <UiFormField label="Time zone" htmlFor="settings-timezone">
                <select
                  id="settings-timezone"
                  value={profileDraft.timeZone}
                  disabled={isDirector || isSaving}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, timeZone: event.target.value }))
                  }
                >
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="UTC">UTC</option>
                </select>
              </UiFormField>
              <UiFormField label="Default exam type" htmlFor="settings-exam">
                <select
                  id="settings-exam"
                  value={profileDraft.defaultExamType}
                  disabled={isDirector || isSaving}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      defaultExamType: event.target.value,
                    }))
                  }
                >
                  <option value="JEE_MAIN">JEE Main</option>
                  <option value="JEE_ADVANCED">JEE Advanced</option>
                  <option value="NEET">NEET</option>
                  <option value="FOUNDATION">Foundation</option>
                </select>
              </UiFormField>
              <UiFormField label="Academic year format" htmlFor="settings-year-format">
                <select
                  id="settings-year-format"
                  value={profileDraft.academicYearFormat}
                  disabled={isDirector || isSaving}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      academicYearFormat: event.target.value,
                    }))
                  }
                >
                  <option value="YYYY-YY">YYYY-YY</option>
                  <option value="YYYY-YYYY">YYYY-YYYY</option>
                </select>
              </UiFormField>
            </div>
            <footer>
              <button
                type="button"
                onClick={() => {
                  setProfileDraft(snapshot.profile);
                  setLogoFileName("");
                  setLogoError("");
                  setLogoImageFailed(false);
                  setLogoInputKey((current) => current + 1);
                }}
                disabled={isDirector || isSaving}
              >
                Reset
              </button>
              <button
                type="submit"
                className="admin-primary-link"
                disabled={isDirector || isSaving}
              >
                {isSaving ? "Saving..." : "Save General Settings"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {activeView === "academic" ? (
        <div className="admin-settings-view">
          <section className="admin-settings-view-heading">
            <div>
              <h3>Academic years</h3>
              <p>Manage the active-year boundary and request archival of locked years.</p>
            </div>
            <span className="admin-settings-status-pill">
              {snapshot.academicYears.length} years
            </span>
          </section>
          <div className="admin-settings-year-layout">
            <section className="admin-settings-year-list">
              <header>
                <h3>Year registry</h3>
                <p>Select a year to inspect its lifecycle.</p>
              </header>
              <div>
                {snapshot.academicYears.map((year) => (
                  <button
                    key={year.yearId}
                    type="button"
                    className={
                      selectedYear?.yearId === year.yearId ? "admin-settings-year-selected" : ""
                    }
                    onClick={() => {
                      setSelectedYearId(year.yearId);
                      setLockConfirmed(false);
                      setArchiveConfirmed(false);
                      setArchiveTypedLabel("");
                    }}
                  >
                    <span>
                      <strong>{year.academicYearLabel}</strong>
                      <small>
                        {formatDate(year.startDate)} to {formatDate(year.endDate)}
                      </small>
                    </span>
                    <span
                      className={`admin-settings-year-status admin-settings-year-status-${year.status.toLowerCase()}`}
                    >
                      {year.status}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            {selectedYear ? (
              <section className="admin-settings-year-detail">
                <header>
                  <div>
                    <p className="admin-content-eyebrow">Selected year</p>
                    <h3>{selectedYear.academicYearLabel}</h3>
                  </div>
                  <span
                    className={`admin-settings-year-status admin-settings-year-status-${selectedYear.status.toLowerCase()}`}
                  >
                    {selectedYear.status}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>Students</dt>
                    <dd>{selectedYear.studentCount}</dd>
                  </div>
                  <div>
                    <dt>Completed runs</dt>
                    <dd>{selectedYear.runCount}</dd>
                  </div>
                  <div>
                    <dt>Snapshot</dt>
                    <dd>{selectedYear.snapshotStatus}</dd>
                  </div>
                  <div>
                    <dt>Archive date</dt>
                    <dd>{formatDate(selectedYear.archivedAt)}</dd>
                  </div>
                </dl>
                {selectedYear.status === "Active" ? (
                  <div className="admin-settings-year-action">
                    <strong>Lock academic year</strong>
                    <p>
                      Locking blocks new tests and assignments for this year. The backend must
                      confirm there are no active attempts.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={lockConfirmed}
                        disabled={isDirector || isSaving}
                        onChange={(event) => setLockConfirmed(event.target.checked)}
                      />{" "}
                      I confirm no active examinations or attempts are running.
                    </label>
                    <button
                      type="button"
                      className="admin-primary-link"
                      disabled={isDirector || isSaving || !lockConfirmed}
                      onClick={() => void handleLockYear()}
                    >
                      Lock Academic Year
                    </button>
                  </div>
                ) : null}
                {selectedYear.status === "Locked" ? (
                  <div className="admin-settings-year-action">
                    <strong>Request archive</strong>
                    <p>
                      This creates a review request only. It does not delete or immediately archive
                      institute data.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={archiveConfirmed}
                        disabled={isDirector || isSaving}
                        onChange={(event) => setArchiveConfirmed(event.target.checked)}
                      />{" "}
                      I understand this request requires platform review.
                    </label>
                    <input
                      value={archiveTypedLabel}
                      disabled={isDirector || isSaving}
                      placeholder={`Type ${selectedYear.academicYearLabel}`}
                      onChange={(event) => setArchiveTypedLabel(event.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-primary-link"
                      disabled={
                        isDirector ||
                        isSaving ||
                        !archiveConfirmed ||
                        archiveTypedLabel !== selectedYear.academicYearLabel
                      }
                      onClick={() => void requestArchive()}
                    >
                      Submit Archive Request
                    </button>
                  </div>
                ) : null}
                {archiveRequests
                  .filter((request) => request.yearId === selectedYear.yearId)
                  .map((request) => (
                    <div key={request.id} className="admin-settings-pending-request">
                      <strong>Archive request pending</strong>
                      <span>Submitted {formatTimestamp(request.requestedAt)}</span>
                    </div>
                  ))}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "access" ? (
        <div className="admin-settings-view">
          <section className="admin-settings-view-heading">
            <div>
              <h3>Users &amp; access</h3>
              <p>Manage institute staff accounts and administrator session policy.</p>
            </div>
            <span className="admin-settings-status-pill">{activeUsers} active</span>
          </section>
          <div className="admin-settings-access-layout">
            <section className="admin-settings-user-registry">
              <header>
                <h3>Staff registry</h3>
                <p>The primary administrator is vendor-managed.</p>
              </header>
              <div>
                {snapshot.users.map((user) => (
                  <button
                    key={user.userId}
                    type="button"
                    className={
                      selectedUser?.userId === user.userId ? "admin-settings-user-selected" : ""
                    }
                    onClick={() => setSelectedUserId(user.userId)}
                  >
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>{user.email}</small>
                    </span>
                    <span>
                      <small>{user.role}</small>
                      <b>{user.status}</b>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="admin-settings-user-detail">
              <header>
                <div>
                  <p className="admin-content-eyebrow">Selected user</p>
                  <h3>{selectedUser?.displayName ?? "No user selected"}</h3>
                </div>
                {selectedUser?.userId === primaryAdmin?.userId ? (
                  <span className="admin-settings-status-pill">Primary admin</span>
                ) : null}
              </header>
              {selectedUser ? (
                <>
                  <dl>
                    <div>
                      <dt>Email</dt>
                      <dd>{selectedUser.email}</dd>
                    </div>
                    <div>
                      <dt>Role</dt>
                      <dd>{humanize(selectedUser.role)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{humanize(selectedUser.status)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatTimestamp(selectedUser.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="admin-settings-user-actions">
                    <UiFormField label="Role" htmlFor="settings-user-role">
                      <select
                        id="settings-user-role"
                        value={selectedUser.role}
                        disabled={
                          isDirector || isSaving || selectedUser.userId === primaryAdmin?.userId
                        }
                        onChange={(event) =>
                          void updateSelectedUser({
                            role: event.target.value as Exclude<StaffRole, "support">,
                          })
                        }
                      >
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="director">Director</option>
                      </select>
                    </UiFormField>
                    <button
                      type="button"
                      onClick={() =>
                        void updateSelectedUser({
                          status: selectedUser.status === "active" ? "suspended" : "active",
                        })
                      }
                      disabled={
                        isDirector || isSaving || selectedUser.userId === primaryAdmin?.userId
                      }
                    >
                      {selectedUser.status === "active" ? "Suspend Access" : "Restore Access"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendResetEmail()}
                      disabled={isDirector || isSaving}
                    >
                      Send Reset Email
                    </button>
                    <button
                      type="button"
                      className="admin-settings-danger-button"
                      onClick={() => void removeSelectedUser()}
                      disabled={
                        isDirector || isSaving || selectedUser.userId === primaryAdmin?.userId
                      }
                    >
                      Remove User
                    </button>
                  </div>
                  {selectedUser.userId === primaryAdmin?.userId ? (
                    <p className="admin-settings-primary-note">
                      Primary administrator replacement must be requested through the vendor.
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>
          </div>
          <div className="admin-settings-access-secondary">
            <form className="admin-settings-form-panel" onSubmit={inviteUser}>
              <header>
                <h3>Invite staff member</h3>
                <p>Creates an institute-scoped staff invitation.</p>
              </header>
              <div className="admin-settings-form-grid">
                <UiFormField label="Name" htmlFor="settings-invite-name">
                  <input
                    id="settings-invite-name"
                    value={userDraft.displayName}
                    disabled={isDirector || isSaving}
                    onChange={(event) =>
                      setUserDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                    required
                  />
                </UiFormField>
                <UiFormField label="Email" htmlFor="settings-invite-email">
                  <input
                    id="settings-invite-email"
                    type="email"
                    value={userDraft.email}
                    disabled={isDirector || isSaving}
                    onChange={(event) =>
                      setUserDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    required
                  />
                </UiFormField>
                <UiFormField label="Role" htmlFor="settings-invite-role">
                  <select
                    id="settings-invite-role"
                    value={userDraft.role}
                    disabled={isDirector || isSaving}
                    onChange={(event) =>
                      setUserDraft((current) => ({
                        ...current,
                        role: event.target.value as UserDraft["role"],
                      }))
                    }
                  >
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                    <option value="director">Director</option>
                  </select>
                </UiFormField>
              </div>
              <footer>
                <button
                  type="submit"
                  className="admin-primary-link"
                  disabled={isDirector || isSaving}
                >
                  Send Invitation
                </button>
              </footer>
            </form>
            <form className="admin-settings-form-panel" onSubmit={saveSessionPolicy}>
              <header>
                <h3>Administrator sessions</h3>
                <p>
                  Account-security controls only; exam behavior belongs to individual test
                  configuration.
                </p>
              </header>
              <div className="admin-settings-session-controls">
                <UiFormField
                  label="Idle timeout"
                  htmlFor="settings-timeout"
                  helper="Enter a whole number from 5 to 720 minutes."
                >
                  <input
                    id="settings-timeout"
                    type="number"
                    min={5}
                    max={720}
                    step={1}
                    value={sessionTimeoutDraft}
                    disabled={isDirector || isSaving}
                    onChange={(event) => setSessionTimeoutDraft(event.target.value)}
                  />
                </UiFormField>
                <label className="admin-settings-session-toggle">
                  <input
                    type="checkbox"
                    checked={snapshot.security.allowMultipleAdminSessions}
                    disabled={isDirector || isSaving}
                    onChange={(event) =>
                      setSnapshot((current) => ({
                        ...current,
                        security: {
                          ...current.security,
                          allowMultipleAdminSessions: event.target.checked,
                        },
                      }))
                    }
                  />{" "}
                  Allow multiple admin sessions
                </label>
                <label className="admin-settings-session-toggle">
                  <input
                    type="checkbox"
                    checked={snapshot.security.forceLogoutOnPasswordChange}
                    disabled={isDirector || isSaving}
                    onChange={(event) =>
                      setSnapshot((current) => ({
                        ...current,
                        security: {
                          ...current.security,
                          forceLogoutOnPasswordChange: event.target.checked,
                        },
                      }))
                    }
                  />{" "}
                  Force logout after password change
                </label>
              </div>
              <footer>
                <button
                  type="submit"
                  className="admin-primary-link"
                  disabled={isDirector || isSaving}
                >
                  Save Session Policy
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {activeView === "activity" ? (
        <div className="admin-settings-view">
          <section className="admin-settings-view-heading">
            <div>
              <h3>Settings activity</h3>
              <p>Read-only history of institute-owned setting changes.</p>
            </div>
            <span className="admin-settings-status-pill">{filteredActivity.length} events</span>
          </section>
          <section className="admin-settings-activity-filters">
            <UiFormField label="Search" htmlFor="settings-activity-search">
              <input
                id="settings-activity-search"
                value={activityQuery}
                onChange={(event) => setActivityQuery(event.target.value)}
                placeholder="Actor, action or summary"
              />
            </UiFormField>
            <UiFormField label="Area" htmlFor="settings-activity-area">
              <select
                id="settings-activity-area"
                value={activityArea}
                onChange={(event) => setActivityArea(event.target.value)}
              >
                <option value="all">All areas</option>
                {activityAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </UiFormField>
            <button
              type="button"
              onClick={() => {
                setActivityQuery("");
                setActivityArea("all");
              }}
            >
              Reset
            </button>
          </section>
          <section className="admin-settings-activity-list" aria-label="Settings activity list">
            <header>
              <h3>Activity timeline</h3>
              <span>Read only</span>
            </header>
            <div>
              {filteredActivity.map((entry) => (
                <article key={entry.eventId}>
                  <span className="admin-settings-activity-marker" />
                  <div>
                    <span>
                      <small>{entry.area}</small>
                      <time>{formatTimestamp(entry.timestamp)}</time>
                    </span>
                    <strong>{humanize(entry.actionType)}</strong>
                    <p>{entry.summary}</p>
                    <small>
                      {entry.actor} · {entry.target}
                    </small>
                  </div>
                </article>
              ))}
              {filteredActivity.length === 0 ? (
                <p className="admin-settings-empty">No activity matches the current filters.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <footer className="admin-settings-boundary">
        <div>
          <strong>Institute-owned settings only</strong>
          <span>
            License parameters, platform retention, feature flags, calibration, SMTP infrastructure,
            and primary administrator replacement remain vendor-controlled.
          </span>
        </div>
        <code>institutes/{instituteId}/settings</code>
      </footer>
    </section>
  );
}

export default AdminSettingsWorkspace;
