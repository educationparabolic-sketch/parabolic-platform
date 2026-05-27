import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  requestGovernanceSnapshot,
  resolveAdminInstituteId,
  updateFeatureFlags,
  type AdminSettingsSnapshot,
  type FeatureFlagsSettings,
  type GovernanceSnapshotRequestSettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

interface LicenseSnapshotRow {
  id: string;
  field: string;
  value: string;
  authority: string;
  treatment: string;
}

interface RolloutFlagRow {
  id: keyof FeatureFlagsSettings;
  label: string;
  status: boolean;
  owner: string;
  treatment: string;
}

const ROLLOUT_FLAG_LABELS: Record<keyof FeatureFlagsSettings, {label: string; treatment: string}> = {
  enableBetaUi: {
    label: "Enable Beta UI",
    treatment: "UI rollout only; does not unlock licensed capabilities.",
  },
  enableExperimentalAnalytics: {
    label: "Enable Experimental Analytics",
    treatment: "Admin-controlled analytical preview; license gates still enforce access.",
  },
  enableLlmMonthlySummary: {
    label: "Enable LLM Monthly Summary",
    treatment: "Cost-controlled summary generation flag stored separately from license entitlements.",
  },
  toggleAdvancedPhaseVisualization: {
    label: "Toggle Advanced Phase Visualization",
    treatment: "Visualization rollout flag; execution policy and license checks remain authoritative.",
  },
};

function AdminSystemConfigurationPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditSystem = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [featureFlagsForm, setFeatureFlagsForm] = useState<FeatureFlagsSettings>(FALLBACK_SNAPSHOT.featureFlags);
  const [governanceSnapshotReason, setGovernanceSnapshotReason] =
    useState("Manual L3 settings snapshot for governance review.");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingSnapshot, setIsRequestingSnapshot] = useState(false);
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

  async function handleGovernanceSnapshotRequest(): Promise<void> {
    if (!canRequestGovernanceSnapshot || !activeYear) {
      setInlineMessage("Governance snapshot trigger is available only for L3 settings access with an active year.");
      return;
    }

    setIsRequestingSnapshot(true);
    setInlineMessage(null);

    const payload: GovernanceSnapshotRequestSettings = {
      academicYear: activeYear.yearId,
      reason: governanceSnapshotReason,
      snapshotMonth: currentSnapshotMonth,
    };

    try {
      const nextSnapshot = await requestGovernanceSnapshot(settingsInstituteId, payload);
      applySnapshot(nextSnapshot, `Governance snapshot request queued for ${activeYear.academicYearLabel}.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Governance snapshot request failed.";
      setInlineMessage(reason);
    } finally {
      setIsRequestingSnapshot(false);
    }
  }

  const activeYear =
    snapshot.academicYears.find((year) => year.status === "Active") ?? snapshot.academicYears[0] ?? null;
  const currentSnapshotMonth = new Date().toISOString().slice(0, 7);
  const isLayerL3 =
    accessContext.licenseLayer === "L3" || snapshot.layerConfiguration.currentLayer.toUpperCase() === "L3";
  const canRequestGovernanceSnapshot =
    isLayerL3 && (accessContext.role === "admin" || accessContext.role === "director");
  const enabledLicenseFlagCount = Object.values(snapshot.layerConfiguration.featureFlags).filter(Boolean).length;
  const enabledRolloutFlagCount = Object.values(featureFlagsForm).filter(Boolean).length;
  const licenseSnapshotRows = useMemo<LicenseSnapshotRow[]>(
    () => [
      {
        authority: "Vendor licensing document",
        field: "Current Layer",
        id: "current-layer",
        treatment: "Read-only in Settings; changed only by vendor-approved licensing workflow.",
        value: snapshot.layerConfiguration.currentLayer,
      },
      {
        authority: "Vendor eligibility review",
        field: "Eligibility Status",
        id: "eligibility-status",
        treatment: "Displayed for operator context; no automatic layer switch occurs here.",
        value: snapshot.layerConfiguration.eligibilityStatus,
      },
      {
        authority: "License featureFlags",
        field: "Enabled License Flags",
        id: "enabled-license-flags",
        treatment: "Backend entitlement checks remain enforced outside settings rollout flags.",
        value: `${enabledLicenseFlagCount} of ${Object.keys(snapshot.layerConfiguration.featureFlags).length}`,
      },
      {
        authority: "License collection",
        field: "Source Path",
        id: "source-path",
        treatment: "Settings loads this as a read-only snapshot and never writes license docs.",
        value: "institutes/{id}/license/current",
      },
    ],
    [
      enabledLicenseFlagCount,
      snapshot.layerConfiguration.currentLayer,
      snapshot.layerConfiguration.eligibilityStatus,
      snapshot.layerConfiguration.featureFlags,
    ],
  );
  const licenseFlagRows = useMemo<LicenseSnapshotRow[]>(
    () => Object.entries(snapshot.layerConfiguration.featureFlags).map(([key, value]) => ({
      authority: "License featureFlags",
      field: key,
      id: key,
      treatment: value ? "Entitlement visible as enabled." : "Entitlement visible as disabled or locked.",
      value: value ? "Enabled" : "Disabled",
    })),
    [snapshot.layerConfiguration.featureFlags],
  );
  const rolloutFlagRows = useMemo<RolloutFlagRow[]>(
    () => (Object.keys(ROLLOUT_FLAG_LABELS) as Array<keyof FeatureFlagsSettings>).map((key) => ({
      id: key,
      label: ROLLOUT_FLAG_LABELS[key].label,
      owner: "Institute admin",
      status: featureFlagsForm[key],
      treatment: ROLLOUT_FLAG_LABELS[key].treatment,
    })),
    [featureFlagsForm],
  );
  const licenseColumns = useMemo<UiTableColumn<LicenseSnapshotRow>[]>(
    () => [
      {
        header: "Field",
        id: "field",
        render: (row) => row.field,
      },
      {
        header: "Value",
        id: "value",
        render: (row) => row.value,
      },
      {
        header: "Authority",
        id: "authority",
        render: (row) => row.authority,
      },
      {
        header: "Treatment",
        id: "treatment",
        render: (row) => row.treatment,
      },
    ],
    [],
  );
  const rolloutColumns = useMemo<UiTableColumn<RolloutFlagRow>[]>(
    () => [
      {
        header: "Rollout Flag",
        id: "label",
        render: (row) => row.label,
      },
      {
        header: "Status",
        id: "status",
        render: (row) => row.status ? "Enabled" : "Disabled",
      },
      {
        header: "Owner",
        id: "owner",
        render: (row) => row.owner,
      },
      {
        header: "Treatment",
        id: "treatment",
        render: (row) => row.treatment,
      },
    ],
    [],
  );

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
      <p className="admin-settings-inline-note">
        Licensing state is read-only from <code>institutes/{"{id}"}/license/current</code>; rollout flags are saved
        separately as <code>settingsFeatureFlags</code> on the institute settings document.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Read-Only Licensing Snapshot</h3>
          <p>
            Current layer {snapshot.layerConfiguration.currentLayer} · Eligibility {snapshot.layerConfiguration.eligibilityStatus}
            · License flags {enabledLicenseFlagCount} enabled
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
          <p>Enabled License Flags</p>
          <h3>{enabledLicenseFlagCount}</h3>
          <small>Visible, not editable from settings</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Rollout Flags</p>
          <h3>{enabledRolloutFlagCount}</h3>
          <small>Admin-controlled and separate from license flags</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Licensing Snapshot Contract</h3>
        <UiTable
          caption="Read-only system licensing snapshot"
          columns={licenseColumns}
          rows={licenseSnapshotRows}
          rowKey={(row) => row.id}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>License Feature Flags</h3>
        <UiTable
          caption="Read-only license feature flags"
          columns={licenseColumns}
          rows={licenseFlagRows}
          rowKey={(row) => row.id}
          emptyStateText="No license flags were returned by the licensing snapshot."
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>Separate Rollout Flag Register</h3>
        <UiTable
          caption="Admin-controlled rollout flags stored separately from license flags"
          columns={rolloutColumns}
          rows={rolloutFlagRows}
          rowKey={(row) => row.id}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>L3 Governance Snapshot Trigger</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Settings Capability</p>
            <h4>{canRequestGovernanceSnapshot ? "Available for L3" : "Locked outside L3"}</h4>
            <p>
              Manual governance snapshot requests are queued from Settings for the active academic year and audited in
              `settingsAudit`. The monthly scheduled snapshot job remains the normal accumulator.
            </p>
            <small>
              Required: L3 layer · Current: {snapshot.layerConfiguration.currentLayer} · Role:{" "}
              {accessContext.role ?? "unknown"}
            </small>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Request Scope</p>
            <h4>{activeYear?.academicYearLabel ?? "No active year loaded"}</h4>
            <p>
              Queues `governanceSnapshotRequests` with academic year, snapshot month, requesting actor, and reason.
              It does not query sessions directly or rewrite sealed historical snapshots.
            </p>
            <small>Snapshot month: {currentSnapshotMonth}</small>
          </article>
        </div>
        <div className="ui-form-content">
          <label>
            Snapshot Request Reason
            <input
              type="text"
              value={governanceSnapshotReason}
              onChange={(event) => setGovernanceSnapshotReason(event.target.value)}
              disabled={!canRequestGovernanceSnapshot || isRequestingSnapshot}
            />
          </label>
        </div>
        <div className="ui-form-actions">
          <button
            type="button"
            disabled={!canRequestGovernanceSnapshot || isRequestingSnapshot || !activeYear}
            onClick={() => { void handleGovernanceSnapshotRequest(); }}
          >
            {isRequestingSnapshot ? "Queueing..." : "Request Governance Snapshot"}
          </button>
        </div>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="admin-risk-table-section">
          <h3>Admin Rollout Controls</h3>
          <p className="admin-content-copy">
            These toggles control controlled rollouts only. They cannot modify current layer, eligibility status,
            licensed feature flags, or backend entitlement enforcement.
          </p>
        </div>
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
            {isSubmitting ? "Saving..." : "Save Rollout Flags"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminSystemConfigurationPage;
