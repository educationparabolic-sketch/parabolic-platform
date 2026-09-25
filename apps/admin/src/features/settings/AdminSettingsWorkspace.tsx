import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CAPABILITY_MATRIX } from "../../../../../shared/contracts/capabilityPolicy";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  archiveAcademicYear,
  fetchSettingsSnapshot,
  inviteStaff,
  isLocalSettingsReadMode,
  lockAcademicYear,
  removeUserAccess,
  resetUserPassword,
  updateInstituteProfile,
  updateSecuritySettings,
  updateUserAccess,
  type AdminSettingsSnapshot,
  type InstituteProfileSettings,
  type SecuritySettings,
  type StaffRole,
  type StaffStatus,
} from "./settingsDataset";

type SettingsView = "general" | "academic" | "access" | "activity" | "unavailable";

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string; path: string }> = [
  { id: "general", label: "General", path: "/admin/settings/profile" },
  { id: "academic", label: "Academic Years", path: "/admin/settings/academic-year" },
  { id: "access", label: "Users & Access", path: "/admin/settings/access" },
  { id: "activity", label: "Activity", path: "/admin/settings/audit-history" },
];

interface UserDraft {
  displayName: string;
  email: string;
  role: StaffRole;
}

interface PendingCommand {
  id: string;
  intentKey: string;
}

const EMPTY_USER_DRAFT: UserDraft = { displayName: "", email: "", role: "teacher" };

function resolveView(pathname: string): SettingsView {
  if (
    pathname.endsWith("/execution-policy") ||
    pathname.endsWith("/data") ||
    pathname.endsWith("/system")
  ) return "unavailable";
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

function AdminSettingsWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const activeView = resolveView(location.pathname);
  const fixtureMode = isLocalSettingsReadMode();
  const managePolicy = CAPABILITY_MATRIX["admin.settings.manage"];
  const minimumManageLayer = managePolicy.minimumLicenseLayer;
  const hasManageCapability = accessContext.role !== null &&
    managePolicy.allowedRoles.some((allowedRole) => allowedRole === accessContext.role) &&
    accessContext.licenseLayer !== null &&
    minimumManageLayer !== null &&
    LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER[minimumManageLayer];
  const canManageSettings = !fixtureMode && hasManageCapability;
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
  const [userDraft, setUserDraft] = useState<UserDraft>(EMPTY_USER_DRAFT);
  const [selectedUserId, setSelectedUserId] = useState(FALLBACK_SNAPSHOT.users[0]?.userId ?? "");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityArea, setActivityArea] = useState("all");
  const [sessionTimeoutDraft, setSessionTimeoutDraft] = useState(
    String(FALLBACK_SNAPSHOT.sessionPolicy.sessionTimeoutDuration),
  );
  const [sessionPolicyDraft, setSessionPolicyDraft] = useState<SecuritySettings>(
    FALLBACK_SNAPSHOT.sessionPolicy,
  );
  const [logoImageFailed, setLogoImageFailed] = useState(false);
  const profileCommand = useRef<PendingCommand | null>(null);
  const sessionPolicyCommand = useRef<PendingCommand | null>(null);
  const inviteCommand = useRef<PendingCommand | null>(null);
  const updateStaffCommand = useRef<PendingCommand | null>(null);
  const removeStaffCommand = useRef<PendingCommand | null>(null);
  const resetPasswordCommand = useRef<PendingCommand | null>(null);
  const lockYearCommand = useRef<PendingCommand | null>(null);
  const archiveYearCommand = useRef<PendingCommand | null>(null);

  function commandIdFor(reference: { current: PendingCommand | null }, intentKey: string) {
    if (reference.current?.intentKey !== intentKey) {
      reference.current = { id: crypto.randomUUID(), intentKey };
    }
    return reference.current.id;
  }

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setIsLoading(true);
      try {
        const nextSnapshot = await fetchSettingsSnapshot();
        if (!mounted) return;
        setSnapshot(nextSnapshot);
        setProfileDraft(nextSnapshot.profile);
        setSessionTimeoutDraft(String(nextSnapshot.sessionPolicy.sessionTimeoutDuration));
        setSessionPolicyDraft(nextSnapshot.sessionPolicy);
        setLogoImageFailed(false);
        setSelectedYearId(nextSnapshot.academicYears[0]?.yearId ?? "");
        setSelectedUserId(nextSnapshot.users[0]?.userId ?? "");
        setMessage(
          fixtureMode
            ? "Fixture settings loaded read-only; mutations require the secured API."
            : "Institute settings loaded from the secured API.",
        );
      } catch (error) {
        if (!mounted) return;
        setMessage(
          error instanceof ApiClientError ? error.message : "Unable to load institute settings.",
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [fixtureMode, session.idToken]);

  const activeYear = snapshot.academicYears.find((year) => year.status === "Active") ?? null;
  const selectedYear =
    snapshot.academicYears.find((year) => year.yearId === selectedYearId) ??
    snapshot.academicYears[0] ??
    null;
  const selectedUser = snapshot.users.find((user) => user.userId === selectedUserId) ?? null;
  const activeUsers = snapshot.users.filter((user) => user.status === "active").length;
  const activityAreas = [...new Set(snapshot.audit.items.map((entry) => entry.area))].sort();
  const filteredActivity = snapshot.audit.items.filter((entry) => {
    if (activityArea !== "all" && entry.area !== activityArea) return false;
    const query = activityQuery.trim().toLowerCase();
    if (!query) return true;
    return [entry.actorUserId, entry.area, entry.summary, entry.actionType, entry.targetId]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  function applyAuthoritativeSnapshot(nextSnapshot: AdminSettingsSnapshot, nextMessage: string) {
    setSnapshot(nextSnapshot);
    setProfileDraft(nextSnapshot.profile);
    setSessionPolicyDraft(nextSnapshot.sessionPolicy);
    setSessionTimeoutDraft(String(nextSnapshot.sessionPolicy.sessionTimeoutDuration));
    setSelectedYearId((current) =>
      nextSnapshot.academicYears.some((year) => year.yearId === current)
        ? current
        : nextSnapshot.academicYears[0]?.yearId ?? "");
    setSelectedUserId((current) =>
      nextSnapshot.users.some((user) => user.userId === current)
        ? current
        : nextSnapshot.users[0]?.userId ?? "");
    setLogoImageFailed(false);
    setMessage(nextMessage);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasManageCapability) return;
    if (fixtureMode) {
      setMessage("Profile updates require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      const profileIntent = {
        academicYearFormat: profileDraft.academicYearFormat,
        contactEmail: profileDraft.contactEmail,
        contactPhone: profileDraft.contactPhone,
        defaultExamType: profileDraft.defaultExamType,
        timeZone: profileDraft.timeZone,
      };
      applyAuthoritativeSnapshot(
        await updateInstituteProfile(
          profileIntent,
          snapshot.revision,
          commandIdFor(profileCommand, JSON.stringify(profileIntent)),
        ),
        "Institute profile saved.",
      );
      profileCommand.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save institute profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLockYear() {
    if (!selectedYear || selectedYear.status !== "Active" || !lockConfirmed || !hasManageCapability) return;
    if (fixtureMode) {
      setMessage("Academic-year mutations require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      applyAuthoritativeSnapshot(
        await lockAcademicYear(
          selectedYear.yearId,
          snapshot.revision,
          commandIdFor(lockYearCommand, selectedYear.yearId),
        ),
        `${selectedYear.academicYearLabel} locked.`,
      );
      lockYearCommand.current = null;
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
      !hasManageCapability
    ) {
      setMessage("Select a locked year, confirm the request, and type its exact label.");
      return;
    }
    if (fixtureMode) {
      setMessage("Academic-year mutations require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await archiveAcademicYear(
        selectedYear.yearId,
        snapshot.revision,
        commandIdFor(archiveYearCommand, selectedYear.yearId),
      );
      applyAuthoritativeSnapshot(
        result.snapshot,
        `${selectedYear.academicYearLabel} archived after export and governance snapshot completion.`,
      );
      archiveYearCommand.current = null;
      setArchiveConfirmed(false);
      setArchiveTypedLabel("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive academic year.");
    } finally {
      setIsSaving(false);
    }
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasManageCapability) return;
    if (fixtureMode) {
      setMessage("Staff mutations require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    const invitation = {
      displayName: userDraft.displayName.trim(),
      email: userDraft.email.trim().toLowerCase(),
      role: userDraft.role,
    };
    try {
      const intentKey = JSON.stringify(invitation);
      const result = await inviteStaff(
        invitation,
        snapshot.revision,
        commandIdFor(inviteCommand, intentKey),
      );
      const deliveryMessage = result.communication?.status === "delivered"
        ? `Invitation email delivered to ${invitation.email}.`
        : result.communication?.status === "failed"
          ? `Invitation created for ${invitation.email}, but email delivery failed.`
          : `Invitation email queued for ${invitation.email}.`;
      applyAuthoritativeSnapshot(
        result.snapshot,
        deliveryMessage,
      );
      inviteCommand.current = null;
      setUserDraft(EMPTY_USER_DRAFT);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite user.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSelectedUser(changes: { role?: StaffRole; status?: StaffStatus }) {
    if (
      !selectedUser ||
      selectedUser.isPrimaryAdministrator ||
      selectedUser.userId === session.user?.uid ||
      !hasManageCapability
    ) return;
    if (fixtureMode) {
      setMessage("Staff mutations require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      const intent = { targetUserId: selectedUser.userId, ...changes };
      applyAuthoritativeSnapshot(
        await updateUserAccess(
          intent,
          snapshot.revision,
          commandIdFor(updateStaffCommand, JSON.stringify(intent)),
        ),
        `Access updated for ${selectedUser.email}.`,
      );
      updateStaffCommand.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update user access.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeSelectedUser() {
    if (
      !selectedUser ||
      selectedUser.isPrimaryAdministrator ||
      selectedUser.userId === session.user?.uid ||
      !hasManageCapability
    ) return;
    if (fixtureMode) {
      setMessage("Staff mutations require the secured API and are unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      const nextSnapshot = await removeUserAccess(
        selectedUser.userId,
        snapshot.revision,
        commandIdFor(removeStaffCommand, selectedUser.userId),
      );
      removeStaffCommand.current = null;
      applyAuthoritativeSnapshot(nextSnapshot, `${selectedUser.email} removed from institute access.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove user access.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendPasswordReset() {
    if (!selectedUser || !hasManageCapability) return;
    if (fixtureMode) {
      setMessage("Password reset requires the secured API and is unavailable in fixture mode.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await resetUserPassword(
        selectedUser.userId,
        snapshot.revision,
        commandIdFor(resetPasswordCommand, selectedUser.userId),
      );
      const deliveryMessage = result.communication?.status === "delivered"
        ? `Password-reset email delivered to ${selectedUser.email}.`
        : result.communication?.status === "failed"
          ? `Sessions revoked for ${selectedUser.email}, but email delivery failed.`
          : `Sessions revoked and password-reset email queued for ${selectedUser.email}.`;
      applyAuthoritativeSnapshot(
        result.snapshot,
        deliveryMessage,
      );
      resetPasswordCommand.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request password reset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSessionPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasManageCapability) return;
    if (fixtureMode) {
      setMessage("Session-policy updates require the secured API and are unavailable in fixture mode.");
      return;
    }
    const sessionTimeoutDuration = Number(sessionTimeoutDraft);
    if (
      !Number.isInteger(sessionTimeoutDuration) ||
      sessionTimeoutDuration < 5 ||
      sessionTimeoutDuration > 720
    ) {
      setMessage("Idle timeout must be a whole number between 5 and 720 minutes.");
      return;
    }
    const nextSecurity = { ...sessionPolicyDraft, sessionTimeoutDuration };
    setIsSaving(true);
    try {
      const nextSnapshot = await updateSecuritySettings(
        nextSecurity,
        snapshot.revision,
        commandIdFor(sessionPolicyCommand, JSON.stringify(nextSecurity)),
      );
      applyAuthoritativeSnapshot(nextSnapshot, "Session policy saved.");
      sessionPolicyCommand.current = null;
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
          <strong>{canManageSettings ? "Administrator" : fixtureMode ? "Fixture read only" : "Read only"}</strong>
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
                  <strong>Current institute logo</strong>
                  <small>Vendor-managed asset. Contact platform support to replace it.</small>
                </div>
              </section>
              <UiFormField label="Operational email" htmlFor="settings-email">
                <input
                  id="settings-email"
                  type="email"
                  value={profileDraft.contactEmail}
                  disabled={!canManageSettings || isSaving}
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
                  disabled={!canManageSettings || isSaving}
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
                  disabled={!canManageSettings || isSaving}
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
                  disabled={!canManageSettings || isSaving}
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
                  disabled={!canManageSettings || isSaving}
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
                  setLogoImageFailed(false);
                }}
                disabled={!canManageSettings || isSaving}
              >
                Reset
              </button>
              <button
                type="submit"
                className="admin-primary-link"
                disabled={!canManageSettings || isSaving}
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
                      Locking blocks new assignments, session starts, and operational writes for this year. The backend must
                      atomically confirm every run and session is terminal.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={lockConfirmed}
                        disabled={!canManageSettings || isSaving}
                        onChange={(event) => setLockConfirmed(event.target.checked)}
                      />{" "}
                      I confirm all examinations and attempts have reached terminal states.
                    </label>
                    <button
                      type="button"
                      className="admin-primary-link"
                      disabled={!canManageSettings || isSaving || !lockConfirmed}
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
                      This irreversible command exports terminal session summaries, creates the
                      final governance snapshot, seals the year as archived, and records immutable
                      audit authority. Existing retained records remain read-only.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={archiveConfirmed}
                        disabled={!canManageSettings || isSaving}
                        onChange={(event) => setArchiveConfirmed(event.target.checked)}
                      />{" "}
                      I understand this immediately starts the irreversible archive workflow.
                    </label>
                    <input
                      value={archiveTypedLabel}
                      disabled={!canManageSettings || isSaving}
                      placeholder={`Type ${selectedYear.academicYearLabel}`}
                      onChange={(event) => setArchiveTypedLabel(event.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-primary-link"
                      disabled={
                        !canManageSettings ||
                        isSaving ||
                        !archiveConfirmed ||
                        archiveTypedLabel !== selectedYear.academicYearLabel
                      }
                      onClick={() => void requestArchive()}
                    >
                      Archive Academic Year
                    </button>
                  </div>
                ) : null}
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
                {selectedUser?.isPrimaryAdministrator ? (
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
                          !canManageSettings || isSaving || selectedUser.isPrimaryAdministrator || selectedUser.userId === session.user?.uid
                        }
                        onChange={(event) =>
                          void updateSelectedUser({
                            role: event.target.value as StaffRole,
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
                        !canManageSettings || isSaving || selectedUser.isPrimaryAdministrator || selectedUser.userId === session.user?.uid
                      }
                    >
                      {selectedUser.status === "active" ? "Suspend Access" : "Activate Access"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendPasswordReset()}
                      disabled={!canManageSettings || isSaving}
                    >
                      Send Reset Email
                    </button>
                    <button
                      type="button"
                      className="admin-settings-danger-button"
                      onClick={() => void removeSelectedUser()}
                      disabled={
                        !canManageSettings || isSaving || selectedUser.isPrimaryAdministrator || selectedUser.userId === session.user?.uid
                      }
                    >
                      Remove User
                    </button>
                  </div>
                  {selectedUser.isPrimaryAdministrator ? (
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
                    disabled={!canManageSettings || isSaving}
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
                    disabled={!canManageSettings || isSaving}
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
                    disabled={!canManageSettings || isSaving}
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
                  disabled={!canManageSettings || isSaving}
                >
                  Create Invitation
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
                    disabled={!canManageSettings || isSaving}
                    onChange={(event) => setSessionTimeoutDraft(event.target.value)}
                  />
                </UiFormField>
                <label className="admin-settings-session-toggle">
                  <input
                    type="checkbox"
                    checked={sessionPolicyDraft.allowMultipleAdminSessions}
                    disabled={!canManageSettings || isSaving}
                    onChange={(event) =>
                      setSessionPolicyDraft((current) => ({
                          ...current,
                          allowMultipleAdminSessions: event.target.checked,
                      }))
                    }
                  />{" "}
                  Allow multiple admin sessions
                </label>
                <label className="admin-settings-session-toggle">
                  <input
                    type="checkbox"
                    checked={sessionPolicyDraft.forceLogoutOnPasswordChange}
                    disabled={!canManageSettings || isSaving}
                    onChange={(event) =>
                      setSessionPolicyDraft((current) => ({
                          ...current,
                          forceLogoutOnPasswordChange: event.target.checked,
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
                  disabled={!canManageSettings || isSaving}
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
                      <time>{formatTimestamp(entry.occurredAt)}</time>
                    </span>
                    <strong>{humanize(entry.actionType)}</strong>
                    <p>{entry.summary}</p>
                    <small>
                      {entry.actorUserId} · {entry.targetId} · revision {entry.revision}
                    </small>
                  </div>
                </article>
              ))}
              {filteredActivity.length === 0 ? (
                <p className="admin-settings-empty">No activity matches the current filters.</p>
              ) : null}
            </div>
            <p className="admin-settings-empty">
              Showing the latest {snapshot.audit.items.length} authoritative changes
              {snapshot.audit.nextCursor
                ? "; additional history exists outside this bounded settings snapshot."
                : "."}
            </p>
          </section>
        </div>
      ) : null}

      {activeView === "unavailable" ? (
        <div className="admin-settings-view">
          <section className="admin-settings-view-heading">
            <div>
              <h3>Settings action unavailable</h3>
              <p>This legacy URL does not expose a supported institute settings command.</p>
            </div>
            <span className="admin-settings-status-pill">No mutation available</span>
          </section>
          <section className="admin-settings-form-panel" aria-label="Unavailable settings actions">
            <header>
              <h3>Explicit ownership boundaries</h3>
              <p>No local or pending success is created for these removed actions.</p>
            </header>
            <dl className="admin-settings-summary">
              <div>
                <dt>Execution policy</dt>
                <dd>Configure supported execution behavior on each test or assignment.</dd>
              </div>
              <div>
                <dt>Data retention</dt>
                <dd>Platform retention infrastructure remains vendor-controlled.</dd>
              </div>
              <div>
                <dt>Feature and system controls</dt>
                <dd>License features, calibration, and SMTP infrastructure remain vendor-controlled.</dd>
              </div>
              <div>
                <dt>Governance snapshots</dt>
                <dd>Use the authorized Governance workspace; Settings has no snapshot command.</dd>
              </div>
            </dl>
            <footer>
              <button type="button" onClick={() => navigate("/admin/settings/profile")}>Return to General</button>
            </footer>
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
        <code>Tenant derived from authenticated server identity</code>
      </footer>
    </section>
  );
}

export default AdminSettingsWorkspace;
