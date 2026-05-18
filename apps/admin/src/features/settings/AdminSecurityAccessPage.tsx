import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  updateSecuritySettings,
  type AdminSettingsSnapshot,
  type SecuritySettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

function AdminSecurityAccessPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditSecurity = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [securityForm, setSecurityForm] = useState<SecuritySettings>(FALLBACK_SNAPSHOT.security);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setSecurityForm(nextSnapshot.security);
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
            "Local read mode: deterministic security and access snapshot loaded." :
            "Security and access settings loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load security settings.";
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

    if (!canEditSecurity) {
      setInlineMessage("Director access is read-only for security and access changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateSecuritySettings(settingsInstituteId, securityForm);
      applySnapshot(nextSnapshot, "Security and access policies updated.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Security settings update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-security-access-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-security-access-title">Dedicated Security & Access Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates session controls, exam deterrent toggles, and notification settings
        instead of collapsing the security drill-down back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading security and access settings..." : inlineMessage ?? "Security and access workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. These controls are deterrent and operational, not full security enforcement.
      </p>
      <p className="admin-settings-inline-note">
        Loaded snapshot sender: {snapshot.security.emailConfiguration.senderName}. Layer-bound access remains enforced outside this UI.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Session and Exam Controls</h3>
          <p>
            UI-level guardrails for admin sessions, exam subdomain behavior, and notification plumbing.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/security
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Session Timeout</p>
          <h3>{securityForm.sessionTimeoutDuration} min</h3>
          <small>Admin session idle timeout</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Parallel Sessions</p>
          <h3>{securityForm.allowMultipleAdminSessions ? "Allowed" : "Blocked"}</h3>
          <small>Concurrent admin session policy</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Sender Name</p>
          <h3>{securityForm.emailConfiguration.senderName}</h3>
          <small>Notification email identity</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Current Deterrent Posture</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Fullscreen</p>
            <h4>{securityForm.examControls.enforceFullscreen ? "Required" : "Optional"}</h4>
            <p>Frontend deterrent for exam execution windows.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Right Click</p>
            <h4>{securityForm.examControls.blockRightClick ? "Blocked" : "Allowed"}</h4>
            <p>UI-level exam shell guard, not a backend integrity guarantee.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Tamper Alerts</p>
            <h4>{securityForm.examControls.tamperDetectionAlerts ? "Enabled" : "Disabled"}</h4>
            <p>Operational signal for higher-sensitivity runs.</p>
          </article>
        </div>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditSecurity || isSubmitting}>
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
              <label>
                Session Timeout (minutes)
                <input
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
              </label>
              <label>
                Sender Name
                <input
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
              </label>
              <label>
                SMTP Host
                <input
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
              </label>
              <label>
                SMTP Port
                <input
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
              </label>
              <label>
                Notification Emails
                <select
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
              </label>
            </div>
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditSecurity || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Security Settings"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminSecurityAccessPage;
