import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  updateFeatureFlags,
  type AdminSettingsSnapshot,
  type FeatureFlagsSettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

function AdminSystemConfigurationPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditSystem = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [featureFlagsForm, setFeatureFlagsForm] = useState<FeatureFlagsSettings>(FALLBACK_SNAPSHOT.featureFlags);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setFeatureFlagsForm(nextSnapshot.featureFlags);
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
            "Local read mode: deterministic system configuration snapshot loaded." :
            "System configuration loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load system configuration.";
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

    if (!canEditSystem) {
      setInlineMessage("Director access is read-only for system configuration.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateFeatureFlags(settingsInstituteId, featureFlagsForm);
      applySnapshot(nextSnapshot, "System feature flags updated via secured backend API.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "System configuration update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-system-configuration-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-system-configuration-title">Dedicated System Configuration Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates low-level rollout controls and read-only layer configuration instead of
        collapsing system configuration back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading system configuration..." : inlineMessage ?? "System configuration workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Directors can review but cannot change feature flags here.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Layer Configuration</h3>
          <p>
            Current layer {snapshot.layerConfiguration.currentLayer} · Eligibility {snapshot.layerConfiguration.eligibilityStatus}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/system
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{snapshot.layerConfiguration.currentLayer}</h3>
          <small>Read-only licensing-controlled state</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Eligibility Status</p>
          <h3>{snapshot.layerConfiguration.eligibilityStatus}</h3>
          <small>Commercial authority remains external to settings</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>License Flags</p>
          <h3>{Object.keys(snapshot.layerConfiguration.featureFlags).length}</h3>
          <small>Visible, not editable from settings</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Read-Only Layer Snapshot</h3>
        <div className="admin-analytics-insight-list">
          {Object.entries(snapshot.layerConfiguration.featureFlags).map(([key, value]) => (
            <article key={key} className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">License Flag</p>
              <h4>{key}</h4>
              <p>{value ? "Enabled" : "Disabled"}</p>
            </article>
          ))}
        </div>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditSystem || isSubmitting}>
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
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditSystem || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Feature Flags"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminSystemConfigurationPage;
