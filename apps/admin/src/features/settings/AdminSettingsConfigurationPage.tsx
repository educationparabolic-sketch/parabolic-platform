import {useCallback, useEffect, useMemo, useState} from "react";
import {NavLink, useLocation} from "react-router-dom";
import {UiForm, UiFormField, UiTable, type UiTableColumn} from "../../../../../shared/ui/components";
import {
  ApiClientError,
  archiveAcademicYear,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  lockAcademicYear,
  removeUserAccess,
  resetUserPassword,
  shouldUseLiveApi,
  type AdminSettingsSnapshot,
  type StaffRole,
  type StaffStatus,
  updateExecutionPolicy,
  updateFeatureFlags,
  updateInstituteProfile,
  updateSecuritySettings,
  upsertUserAccess,
} from "./settingsDataset";

const SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

interface SettingsSection {
  id: string;
  title: string;
  route: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {id: "profile", route: "/admin/settings/profile", title: "Institute Profile"},
  {id: "academic-year", route: "/admin/settings/academic-year", title: "Academic Year"},
  {id: "execution-policy", route: "/admin/settings/execution-policy", title: "Execution Policy"},
  {id: "users", route: "/admin/settings/users", title: "User & Role Management"},
  {id: "security", route: "/admin/settings/security", title: "Security & Access"},
  {id: "system", route: "/admin/settings/system", title: "System Configuration"},
];

interface UserDraft {
  userId: string;
  displayName: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
}

const DEFAULT_USER_DRAFT: UserDraft = {
  displayName: "",
  email: "",
  role: "teacher",
  status: "active",
  userId: "",
};

function toLocalDatetime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

function sectionFromPath(pathname: string): string {
  const matched = SETTINGS_SECTIONS.find((section) => pathname.startsWith(section.route));

  if (matched) {
    return matched.id;
  }

  return "profile";
}

function AdminSettingsConfigurationPage() {
  const location = useLocation();
  const activeSection = sectionFromPath(location.pathname);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState(FALLBACK_SNAPSHOT.profile);
  const [executionForm, setExecutionForm] = useState(FALLBACK_SNAPSHOT.executionPolicy);
  const [securityForm, setSecurityForm] = useState(FALLBACK_SNAPSHOT.security);
  const [featureFlagsForm, setFeatureFlagsForm] = useState(FALLBACK_SNAPSHOT.featureFlags);
  const [userDraft, setUserDraft] = useState<UserDraft>(DEFAULT_USER_DRAFT);

  const defaultYearId = FALLBACK_SNAPSHOT.academicYears[0]?.yearId ?? "";
  const [selectedYearId, setSelectedYearId] = useState(defaultYearId);

  const currentAcademicYear = useMemo(
    () => snapshot.academicYears.find((entry) => entry.yearId === selectedYearId) ?? snapshot.academicYears[0] ?? null,
    [selectedYearId, snapshot.academicYears],
  );

  const syncFormsWithSnapshot = useCallback((
    nextSnapshot: AdminSettingsSnapshot,
  ) => {
    setProfileForm(nextSnapshot.profile);
    setExecutionForm(nextSnapshot.executionPolicy);
    setSecurityForm(nextSnapshot.security);
    setFeatureFlagsForm(nextSnapshot.featureFlags);

    const nextYearId = nextSnapshot.academicYears[0]?.yearId ?? "";
    setSelectedYearId((currentValue) => {
      if (nextSnapshot.academicYears.some((entry) => entry.yearId === currentValue)) {
        return currentValue;
      }
      return nextYearId;
    });
  }, []);

  const applySnapshot = useCallback((
    nextSnapshot: AdminSettingsSnapshot,
    message: string,
  ) => {
    setSnapshot(nextSnapshot);
    syncFormsWithSnapshot(nextSnapshot);
    setInlineMessage(message);
  }, [syncFormsWithSnapshot]);

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
          shouldUseLiveApi() ?
            "Live mode enabled: settings loaded from POST /admin/settings." :
            "Local mode detected. Loaded deterministic Build 125 settings fixtures.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load settings snapshot.";
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

  const withSubmitGuard = async (
    operation: () => Promise<AdminSettingsSnapshot | void>,
    successMessage: string,
  ): Promise<void> => {
    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const result = await operation();
      if (result) {
        applySnapshot(result, successMessage);
      } else {
        setInlineMessage(successMessage);
      }
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Settings update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  };

  const yearColumns = useMemo<UiTableColumn<AdminSettingsSnapshot["academicYears"][number]>[]>(
    () => [
      {
        id: "year",
        header: "Academic Year",
        render: (year) => (
          <div className="admin-settings-cell-stack">
            <strong>{year.academicYearLabel}</strong>
            <small>{year.yearId}</small>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        render: (year) => <span className={`admin-settings-status admin-settings-status-${year.status.toLowerCase()}`}>{year.status}</span>,
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

  const userColumns = useMemo<UiTableColumn<AdminSettingsSnapshot["users"][number]>[]>(
    () => [
      {
        id: "user",
        header: "User",
        render: (user) => (
          <div className="admin-settings-cell-stack">
            <strong>{user.displayName}</strong>
            <small>{user.email || user.userId}</small>
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        render: (user) => user.role,
      },
      {
        id: "status",
        header: "Status",
        render: (user) => user.status,
      },
      {
        id: "updatedAt",
        header: "Updated",
        render: (user) => toLocalDatetime(user.updatedAt),
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-settings-title">
      <p className="admin-content-eyebrow">Settings & Configuration</p>
      <h2 id="admin-settings-title">Institution Settings & System Controls</h2>
      <p className="admin-content-copy">
        Configure profile, academic lifecycle, execution policy, user access, security controls, and feature flags.
        All updates route through secured backend APIs.
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading settings configuration..." : inlineMessage ?? "Settings workspace ready."}
      </p>

      <nav className="admin-settings-tab-grid" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((section) => (
          <NavLink
            key={section.id}
            to={section.route}
            className={({isActive}) =>
              isActive ?
                "admin-settings-tab admin-settings-tab-active" :
                "admin-settings-tab"
            }
          >
            {section.title}
          </NavLink>
        ))}
      </nav>

      {activeSection === "profile" ? (
        <UiForm
          title="Institute Profile"
          description="Stored under institutes/{instituteId}/profile. Updates are operational-only and do not mutate historical analytics."
          submitLabel={isSubmitting ? "Saving..." : "Save Profile"}
          onSubmit={(event) => {
            event.preventDefault();
            void withSubmitGuard(
              async () =>
                updateInstituteProfile(SETTINGS_INSTITUTE_ID, profileForm),
              "Institute profile updated via secured admin settings API.",
            );
          }}
        >
          <div className="admin-settings-grid-two">
            <UiFormField label="Institute Name" htmlFor="settings-institute-name">
              <input
                id="settings-institute-name"
                value={profileForm.instituteName}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    instituteName: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Logo Reference" htmlFor="settings-logo-reference" helper="Storage path only (no direct URL).">
              <input
                id="settings-logo-reference"
                value={profileForm.logoReference}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    logoReference: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Contact Email" htmlFor="settings-contact-email">
              <input
                id="settings-contact-email"
                type="email"
                value={profileForm.contactEmail}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Contact Phone" htmlFor="settings-contact-phone">
              <input
                id="settings-contact-phone"
                value={profileForm.contactPhone}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    contactPhone: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Time Zone" htmlFor="settings-time-zone">
              <input
                id="settings-time-zone"
                value={profileForm.timeZone}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    timeZone: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Default Exam Type" htmlFor="settings-default-exam-type">
              <input
                id="settings-default-exam-type"
                value={profileForm.defaultExamType}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    defaultExamType: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Academic Year Format" htmlFor="settings-academic-format">
              <input
                id="settings-academic-format"
                value={profileForm.academicYearFormat}
                onChange={(event) => {
                  setProfileForm((current) => ({
                    ...current,
                    academicYearFormat: event.target.value,
                  }));
                }}
                required
              />
            </UiFormField>
          </div>
        </UiForm>
      ) : null}

      {activeSection === "academic-year" ? (
        <section className="admin-settings-section" aria-label="Academic year settings">
          <h3>Academic Year Management</h3>
          <p>
            Active year transitions follow the architecture lifecycle: Active → Locked → Archive.
            Archive calls the secured <code>/admin/academicYear/archive</code> flow.
          </p>
          <UiTable
            caption="Academic year lifecycle table"
            columns={yearColumns}
            rows={snapshot.academicYears}
            rowKey={(year) => year.yearId}
            emptyStateText="No academic years available."
          />

          <div className="admin-settings-year-actions">
            <label htmlFor="settings-year-select">Selected Year</label>
            <select
              id="settings-year-select"
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
              disabled={!currentAcademicYear || isSubmitting || currentAcademicYear.status !== "Active"}
              onClick={() => {
                if (!currentAcademicYear) {
                  return;
                }

                void withSubmitGuard(
                  async () => lockAcademicYear(SETTINGS_INSTITUTE_ID, currentAcademicYear.yearId),
                  `Academic year ${currentAcademicYear.academicYearLabel} locked successfully.`,
                );
              }}
            >
              Lock Year
            </button>
            <button
              type="button"
              className="admin-compact-button"
              disabled={!currentAcademicYear || isSubmitting || currentAcademicYear.status === "Archived"}
              onClick={() => {
                if (!currentAcademicYear) {
                  return;
                }

                const confirmed = window.confirm(
                  `Archive ${currentAcademicYear.academicYearLabel}? This action is irreversible.`,
                );

                if (!confirmed) {
                  return;
                }

                void withSubmitGuard(
                  async () => {
                    await archiveAcademicYear(SETTINGS_INSTITUTE_ID, currentAcademicYear.yearId);
                    return fetchSettingsSnapshot(SETTINGS_INSTITUTE_ID);
                  },
                  `Archive requested for ${currentAcademicYear.academicYearLabel} through secured archive API.`,
                );
              }}
            >
              Archive Year
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === "execution-policy" ? (
        <UiForm
          title="Default Execution Policies"
          description="Phase split must total 100%. Advanced controls and timing presets are configuration-only defaults."
          submitLabel={isSubmitting ? "Saving..." : "Save Execution Policy"}
          onSubmit={(event) => {
            event.preventDefault();

            void withSubmitGuard(
              async () => updateExecutionPolicy(SETTINGS_INSTITUTE_ID, executionForm),
              "Execution defaults saved through secured backend policy API.",
            );
          }}
        >
          <div className="admin-settings-grid-three">
            <UiFormField label="Phase 1 %" htmlFor="settings-phase-1">
              <input
                id="settings-phase-1"
                type="number"
                min={0}
                max={100}
                value={executionForm.phaseSplit.phase1Percent}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    phaseSplit: {
                      ...current.phaseSplit,
                      phase1Percent: Number.isFinite(nextValue) ? nextValue : 0,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Phase 2 %" htmlFor="settings-phase-2">
              <input
                id="settings-phase-2"
                type="number"
                min={0}
                max={100}
                value={executionForm.phaseSplit.phase2Percent}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    phaseSplit: {
                      ...current.phaseSplit,
                      phase2Percent: Number.isFinite(nextValue) ? nextValue : 0,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Phase 3 %" htmlFor="settings-phase-3">
              <input
                id="settings-phase-3"
                type="number"
                min={0}
                max={100}
                value={executionForm.phaseSplit.phase3Percent}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    phaseSplit: {
                      ...current.phaseSplit,
                      phase3Percent: Number.isFinite(nextValue) ? nextValue : 0,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
          </div>

          <div className="admin-settings-inline-controls">
            <label>
              <input
                type="checkbox"
                checked={executionForm.advancedControls.adaptivePhaseEnabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setExecutionForm((current) => ({
                    ...current,
                    advancedControls: {
                      ...current.advancedControls,
                      adaptivePhaseEnabled: checked,
                    },
                  }));
                }}
              />
              Adaptive Phase Enabled
            </label>
            <label>
              <input
                type="checkbox"
                checked={executionForm.advancedControls.manualOverrideAllowed}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setExecutionForm((current) => ({
                    ...current,
                    advancedControls: {
                      ...current.advancedControls,
                      manualOverrideAllowed: checked,
                    },
                  }));
                }}
              />
              Manual Override Allowed
            </label>
            <label>
              <input
                type="checkbox"
                checked={executionForm.advancedControls.hardModeAvailable}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setExecutionForm((current) => ({
                    ...current,
                    advancedControls: {
                      ...current.advancedControls,
                      hardModeAvailable: checked,
                    },
                  }));
                }}
              />
              Hard Mode Available
            </label>
          </div>

          <div className="admin-settings-grid-three">
            <UiFormField label="Alert Cooldown (min)" htmlFor="settings-alert-cooldown">
              <input
                id="settings-alert-cooldown"
                type="number"
                min={1}
                value={executionForm.alertFrequencyPolicy.alertCooldownInterval}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    alertFrequencyPolicy: {
                      ...current.alertFrequencyPolicy,
                      alertCooldownInterval: Number.isFinite(nextValue) ? nextValue : 1,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Max Alerts / Section" htmlFor="settings-alert-max">
              <input
                id="settings-alert-max"
                type="number"
                min={1}
                value={executionForm.alertFrequencyPolicy.maxAlertsPerSection}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    alertFrequencyPolicy: {
                      ...current.alertFrequencyPolicy,
                      maxAlertsPerSection: Number.isFinite(nextValue) ? nextValue : 1,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Escalation Threshold" htmlFor="settings-alert-escalation">
              <input
                id="settings-alert-escalation"
                type="number"
                min={1}
                value={executionForm.alertFrequencyPolicy.escalationThreshold}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExecutionForm((current) => ({
                    ...current,
                    alertFrequencyPolicy: {
                      ...current.alertFrequencyPolicy,
                      escalationThreshold: Number.isFinite(nextValue) ? nextValue : 1,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
          </div>
        </UiForm>
      ) : null}

      {activeSection === "users" ? (
        <section className="admin-settings-section" aria-label="User and role settings">
          <h3>User & Role Management</h3>
          <p>
            Add, modify, suspend, remove, and password-reset requests are routed through secured settings APIs.
          </p>

          <UiTable
            caption="Settings users table"
            columns={userColumns}
            rows={snapshot.users}
            rowKey={(user) => user.userId}
            emptyStateText="No users configured."
          />

          <UiForm
            title="Add / Update User Access"
            description="Create or update an institute user role assignment."
            submitLabel={isSubmitting ? "Saving..." : "Upsert User"}
            onSubmit={(event) => {
              event.preventDefault();

              void withSubmitGuard(
                async () =>
                  upsertUserAccess(SETTINGS_INSTITUTE_ID, userDraft),
                `User ${userDraft.userId} access updated.`,
              );
            }}
          >
            <div className="admin-settings-grid-two">
              <UiFormField label="User ID" htmlFor="settings-user-id">
                <input
                  id="settings-user-id"
                  value={userDraft.userId}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      userId: event.target.value,
                    }));
                  }}
                  required
                />
              </UiFormField>
              <UiFormField label="Display Name" htmlFor="settings-user-name">
                <input
                  id="settings-user-name"
                  value={userDraft.displayName}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }));
                  }}
                  required
                />
              </UiFormField>
              <UiFormField label="Email" htmlFor="settings-user-email">
                <input
                  id="settings-user-email"
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }));
                  }}
                  required
                />
              </UiFormField>
              <UiFormField label="Role" htmlFor="settings-user-role">
                <select
                  id="settings-user-role"
                  value={userDraft.role}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      role: event.target.value as StaffRole,
                    }));
                  }}
                >
                  <option value="admin">admin</option>
                  <option value="teacher">teacher</option>
                  <option value="director">director</option>
                  <option value="support">support</option>
                </select>
              </UiFormField>
              <UiFormField label="Status" htmlFor="settings-user-status">
                <select
                  id="settings-user-status"
                  value={userDraft.status}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      status: event.target.value as StaffStatus,
                    }));
                  }}
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </UiFormField>
            </div>
          </UiForm>

          <div className="admin-settings-user-actions">
            <button
              type="button"
              className="admin-compact-button"
              disabled={isSubmitting || userDraft.userId.trim().length === 0}
              onClick={() => {
                const userId = userDraft.userId.trim();
                if (!userId) {
                  return;
                }

                void withSubmitGuard(
                  async () => removeUserAccess(SETTINGS_INSTITUTE_ID, userId),
                  `User ${userId} removed from institute role registry.`,
                );
              }}
            >
              Remove User
            </button>
            <button
              type="button"
              className="admin-compact-button"
              disabled={isSubmitting || userDraft.userId.trim().length === 0}
              onClick={() => {
                const userId = userDraft.userId.trim();
                if (!userId) {
                  return;
                }

                void withSubmitGuard(
                  async () => resetUserPassword(SETTINGS_INSTITUTE_ID, userId),
                  `Password reset request logged for ${userId}.`,
                );
              }}
            >
              Reset Password
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === "security" ? (
        <UiForm
          title="Security & Access"
          description="Session, exam deterrent, and notification controls."
          submitLabel={isSubmitting ? "Saving..." : "Save Security Settings"}
          onSubmit={(event) => {
            event.preventDefault();

            void withSubmitGuard(
              async () => updateSecuritySettings(SETTINGS_INSTITUTE_ID, securityForm),
              "Security and access policies updated.",
            );
          }}
        >
          <div className="admin-settings-inline-controls">
            <label>
              <input
                type="checkbox"
                checked={securityForm.allowMultipleAdminSessions}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    allowMultipleAdminSessions: checked,
                  }));
                }}
              />
              Allow Multiple Admin Sessions
            </label>
            <label>
              <input
                type="checkbox"
                checked={securityForm.forceLogoutOnPasswordChange}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    forceLogoutOnPasswordChange: checked,
                  }));
                }}
              />
              Force Logout on Password Change
            </label>
            <label>
              <input
                type="checkbox"
                checked={securityForm.examControls.enforceFullscreen}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    examControls: {
                      ...current.examControls,
                      enforceFullscreen: checked,
                    },
                  }));
                }}
              />
              Enforce Fullscreen
            </label>
            <label>
              <input
                type="checkbox"
                checked={securityForm.examControls.blockRightClick}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    examControls: {
                      ...current.examControls,
                      blockRightClick: checked,
                    },
                  }));
                }}
              />
              Block Right Click
            </label>
            <label>
              <input
                type="checkbox"
                checked={securityForm.examControls.tabSwitchWarning}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    examControls: {
                      ...current.examControls,
                      tabSwitchWarning: checked,
                    },
                  }));
                }}
              />
              Tab Switch Warning
            </label>
            <label>
              <input
                type="checkbox"
                checked={securityForm.examControls.tamperDetectionAlerts}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSecurityForm((current) => ({
                    ...current,
                    examControls: {
                      ...current.examControls,
                      tamperDetectionAlerts: checked,
                    },
                  }));
                }}
              />
              Tamper Detection Alerts
            </label>
          </div>

          <div className="admin-settings-grid-three">
            <UiFormField label="Session Timeout (minutes)" htmlFor="settings-session-timeout">
              <input
                id="settings-session-timeout"
                type="number"
                min={5}
                max={720}
                value={securityForm.sessionTimeoutDuration}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setSecurityForm((current) => ({
                    ...current,
                    sessionTimeoutDuration: Number.isFinite(nextValue) ? nextValue : 30,
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="Sender Name" htmlFor="settings-email-sender">
              <input
                id="settings-email-sender"
                value={securityForm.emailConfiguration.senderName}
                onChange={(event) => {
                  const value = event.target.value;
                  setSecurityForm((current) => ({
                    ...current,
                    emailConfiguration: {
                      ...current.emailConfiguration,
                      senderName: value,
                    },
                  }));
                }}
                required
              />
            </UiFormField>
            <UiFormField label="SMTP Host" htmlFor="settings-email-smtp-host">
              <input
                id="settings-email-smtp-host"
                value={securityForm.emailConfiguration.smtpHost ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSecurityForm((current) => ({
                    ...current,
                    emailConfiguration: {
                      ...current.emailConfiguration,
                      smtpHost: value || undefined,
                    },
                  }));
                }}
              />
            </UiFormField>
            <UiFormField label="SMTP Port" htmlFor="settings-email-smtp-port">
              <input
                id="settings-email-smtp-port"
                type="number"
                min={1}
                max={65535}
                value={securityForm.emailConfiguration.smtpPort ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  const parsed = Number(raw);
                  setSecurityForm((current) => ({
                    ...current,
                    emailConfiguration: {
                      ...current.emailConfiguration,
                      smtpPort: raw ? (Number.isFinite(parsed) ? parsed : undefined) : undefined,
                    },
                  }));
                }}
              />
            </UiFormField>
            <UiFormField label="Notification Emails" htmlFor="settings-email-toggle">
              <select
                id="settings-email-toggle"
                value={securityForm.emailConfiguration.notificationToggles ? "enabled" : "disabled"}
                onChange={(event) => {
                  const enabled = event.target.value === "enabled";
                  setSecurityForm((current) => ({
                    ...current,
                    emailConfiguration: {
                      ...current.emailConfiguration,
                      notificationToggles: enabled,
                    },
                  }));
                }}
              >
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
              </select>
            </UiFormField>
          </div>
        </UiForm>
      ) : null}

      {activeSection === "system" ? (
        <UiForm
          title="System Configuration"
          description="Layer configuration is read-only; feature flags are admin-controlled and separate from license flags."
          submitLabel={isSubmitting ? "Saving..." : "Save Feature Flags"}
          onSubmit={(event) => {
            event.preventDefault();

            void withSubmitGuard(
              async () => updateFeatureFlags(SETTINGS_INSTITUTE_ID, featureFlagsForm),
              "System feature flags updated via secured backend API.",
            );
          }}
        >
          <div className="admin-settings-layer-card">
            <p>
              <strong>Current Layer:</strong> {snapshot.layerConfiguration.currentLayer}
            </p>
            <p>
              <strong>Eligibility Status:</strong> {snapshot.layerConfiguration.eligibilityStatus}
            </p>
            <p>
              <strong>License Feature Flags:</strong>{" "}
              {Object.entries(snapshot.layerConfiguration.featureFlags)
                .map(([key, value]) => `${key}=${value ? "on" : "off"}`)
                .join(", ") || "none"}
            </p>
          </div>

          <div className="admin-settings-inline-controls">
            <label>
              <input
                type="checkbox"
                checked={featureFlagsForm.enableExperimentalAnalytics}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setFeatureFlagsForm((current) => ({
                    ...current,
                    enableExperimentalAnalytics: checked,
                  }));
                }}
              />
              Enable Experimental Analytics
            </label>
            <label>
              <input
                type="checkbox"
                checked={featureFlagsForm.enableBetaUi}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setFeatureFlagsForm((current) => ({
                    ...current,
                    enableBetaUi: checked,
                  }));
                }}
              />
              Enable Beta UI
            </label>
            <label>
              <input
                type="checkbox"
                checked={featureFlagsForm.toggleAdvancedPhaseVisualization}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setFeatureFlagsForm((current) => ({
                    ...current,
                    toggleAdvancedPhaseVisualization: checked,
                  }));
                }}
              />
              Toggle Advanced Phase Visualization
            </label>
            <label>
              <input
                type="checkbox"
                checked={featureFlagsForm.enableLlmMonthlySummary}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setFeatureFlagsForm((current) => ({
                    ...current,
                    enableLlmMonthlySummary: checked,
                  }));
                }}
              />
              Enable LLM Monthly Summary
            </label>
          </div>
        </UiForm>
      ) : null}
    </section>
  );
}

export default AdminSettingsConfigurationPage;
