import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  updateExecutionPolicy,
  type AdminSettingsSnapshot,
  type ExecutionPolicySettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

function AdminExecutionPolicyPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditExecutionPolicy = true;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [executionForm, setExecutionForm] = useState<ExecutionPolicySettings>(FALLBACK_SNAPSHOT.executionPolicy);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const defaultTimingExamType = Object.keys(FALLBACK_SNAPSHOT.executionPolicy.timingPresets)[0] ?? "JEE_MAIN";
  const [selectedTimingExamType, setSelectedTimingExamType] = useState(defaultTimingExamType);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setExecutionForm(nextSnapshot.executionPolicy);
    setSelectedTimingExamType((currentValue) =>
      Object.keys(nextSnapshot.executionPolicy.timingPresets).includes(currentValue) ?
        currentValue :
        Object.keys(nextSnapshot.executionPolicy.timingPresets)[0] ?? defaultTimingExamType,
    );
    setInlineMessage(message);
  }, [defaultTimingExamType]);

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
            "Local read mode: deterministic execution policy snapshot loaded." :
            "Execution policy loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load execution policy.";
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

    if (isDirector) {
      setInlineMessage("Director access is read-only for execution policy changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateExecutionPolicy(settingsInstituteId, executionForm);
      applySnapshot(nextSnapshot, "Execution defaults saved through secured backend policy API.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Execution policy update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  const timingExamTypes = Object.keys(executionForm.timingPresets);
  const selectedTimingPreset =
    executionForm.timingPresets[selectedTimingExamType] ??
    executionForm.timingPresets[timingExamTypes[0] ?? defaultTimingExamType] ??
    FALLBACK_SNAPSHOT.executionPolicy.timingPresets[defaultTimingExamType];

  function updateTimingPreset(
    difficulty: "easy" | "medium" | "hard",
    boundary: "min" | "max",
    value: number,
  ): void {
    setExecutionForm((current) => {
      const currentPreset =
        current.timingPresets[selectedTimingExamType] ??
        FALLBACK_SNAPSHOT.executionPolicy.timingPresets[defaultTimingExamType];

      return {
        ...current,
        timingPresets: {
          ...current.timingPresets,
          [selectedTimingExamType]: {
            ...currentPreset,
            [difficulty]: {
              ...currentPreset[difficulty],
              [boundary]: Number.isFinite(value) ? value : 0,
            },
          },
        },
      };
    });
  }

  function resetSelectedTimingPreset(): void {
    const systemDefault =
      FALLBACK_SNAPSHOT.executionPolicy.timingPresets[selectedTimingExamType] ??
      FALLBACK_SNAPSHOT.executionPolicy.timingPresets[defaultTimingExamType];

    setExecutionForm((current) => ({
      ...current,
      timingPresets: {
        ...current.timingPresets,
        [selectedTimingExamType]: systemDefault,
      },
    }));
    setInlineMessage(`Timing preset for ${selectedTimingExamType} reset to system defaults. Save to persist.`);
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-execution-policy-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-execution-policy-title">Dedicated Execution Policy Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates phase defaults, advanced execution controls, and alert-frequency policy
        instead of collapsing that drill-down back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading execution policy..." : inlineMessage ?? "Execution policy workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Phase split must total 100%, and execution defaults do not rewrite historical analytics.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Execution Defaults</h3>
          <p>
            Current layer {snapshot.layerConfiguration.currentLayer} with alert cooldown {executionForm.alertFrequencyPolicy.alertCooldownInterval} minutes.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/execution-policy
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Phase 1</p>
          <h3>{executionForm.phaseSplit.phase1Percent}%</h3>
          <small>Starting allocation</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Phase 2</p>
          <h3>{executionForm.phaseSplit.phase2Percent}%</h3>
          <small>Mid-run allocation</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Phase 3</p>
          <h3>{executionForm.phaseSplit.phase3Percent}%</h3>
          <small>Closing allocation</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Alert Cooldown</p>
          <h3>{executionForm.alertFrequencyPolicy.alertCooldownInterval} min</h3>
          <small>Anti-fatigue threshold</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Advanced Controls Snapshot</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Adaptive Phase</p>
            <h4>{executionForm.advancedControls.adaptivePhaseEnabled ? "Enabled" : "Disabled"}</h4>
            <p>Default orchestration behavior for supported layers.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Manual Override</p>
            <h4>{executionForm.advancedControls.manualOverrideAllowed ? "Allowed" : "Blocked"}</h4>
            <p>Operational override access without changing integrity rules.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Hard Mode</p>
            <h4>{executionForm.advancedControls.hardModeAvailable ? "Available" : "Unavailable"}</h4>
            <p>Layer-aware default visibility for stricter execution modes.</p>
          </article>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Timing Policy Editor</h3>
        <p className="admin-content-copy">
          Timing presets are L2+ structural defaults by exam type and difficulty. They define bounded windows only;
          per-question arbitrary timing edits are not allowed here.
        </p>
        <div className="admin-settings-timing-toolbar">
          <label>
            Exam Type
            <select
              value={selectedTimingExamType}
              disabled={isSubmitting}
              onChange={(event) => {
                setSelectedTimingExamType(event.target.value);
              }}
            >
              {timingExamTypes.map((examType) => (
                <option key={examType} value={examType}>
                  {examType}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-compact-button"
            disabled={isDirector || isSubmitting}
            onClick={resetSelectedTimingPreset}
          >
            Reset to System Defaults
          </button>
        </div>
        <div className="admin-settings-timing-grid" aria-label="Timing windows by difficulty">
          {(["easy", "medium", "hard"] as const).map((difficulty) => (
            <article key={difficulty} className="admin-settings-layer-card">
              <p><strong>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</strong></p>
              <div className="admin-settings-grid-three">
                <label>
                  Min Seconds
                  <input
                    type="number"
                    min={0}
                    value={selectedTimingPreset[difficulty].min}
                    disabled={isDirector || isSubmitting}
                    onChange={(event) => {
                      updateTimingPreset(difficulty, "min", Number(event.target.value));
                    }}
                  />
                </label>
                <label>
                  Max Seconds
                  <input
                    type="number"
                    min={selectedTimingPreset[difficulty].min}
                    value={selectedTimingPreset[difficulty].max}
                    disabled={isDirector || isSubmitting}
                    onChange={(event) => {
                      updateTimingPreset(difficulty, "max", Number(event.target.value));
                    }}
                  />
                </label>
                <div className="admin-settings-timing-window">
                  <span>Window</span>
                  <strong>
                    {selectedTimingPreset[difficulty].min}-{selectedTimingPreset[difficulty].max}s
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditExecutionPolicy || isSubmitting}>
            <div className="admin-settings-grid-three">
              <label>
                Phase 1 %
                <input
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
              </label>
              <label>
                Phase 2 %
                <input
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
              </label>
              <label>
                Phase 3 %
                <input
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
              </label>
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
              <label>
                Alert Cooldown (min)
                <input
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
              </label>
              <label>
                Max Alerts / Section
                <input
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
              </label>
              <label>
                Escalation Threshold
                <input
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
              </label>
            </div>
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditExecutionPolicy || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Execution Policy"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminExecutionPolicyPage;
