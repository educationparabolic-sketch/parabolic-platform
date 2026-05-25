import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
} from "./licensingDataset";
import LicensingWorkspaceNav from "./LicensingWorkspaceNav";

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function statusLabel(status: AdminLicensingSnapshot["eligibilityProgress"][number]["status"]): string {
  if (status === "in_progress") {
    return "In progress";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function AdminLicensingEligibilityPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const licensingInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchLicensingSnapshot(licensingInstituteId);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalLicensingReadMode() ?
            "Local read mode: deterministic licensing eligibility snapshot loaded." :
            "Licensing eligibility loaded from secured backend API. Upgrade approval remains vendor-controlled.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load licensing eligibility.";
        setSnapshot(FALLBACK_SNAPSHOT);
        setInlineMessage(`${reason} Falling back to deterministic Build 125 licensing fixtures.`);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [licensingInstituteId]);

  const currentPlan = snapshot.currentPlan;

  return (
    <section className="admin-content-card" aria-labelledby="admin-licensing-eligibility-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-licensing-eligibility-title">Dedicated Eligibility Progress Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates the institutional maturity ladder and eligibility checkpoints instead of
        collapsing that drill-down back into the shared licensing workspace.
      </p>

      <LicensingWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading licensing eligibility..." : inlineMessage ?? "Licensing eligibility workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Eligibility reflects readiness only and never grants self-service upgrades.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/eligibility
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Eligibility Stages</p>
          <h3>{snapshot.eligibilityProgress.length}</h3>
          <small>Truth-ladder checkpoints</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Fully Eligible</p>
          <h3>{snapshot.eligibilityProgress.filter((stage) => stage.status === "eligible").length}</h3>
          <small>Vendor review still required</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Upgrade Authority</p>
          <h3>Vendor</h3>
          <small>No automatic layer switch</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Truth-Ladder Eligibility Rules</h3>
        <div className="admin-licensing-eligibility-grid">
          {snapshot.eligibilityProgress.map((stage) => {
            const progressValue = percent(stage.progressCurrent, stage.progressTarget);

            return (
              <article key={stage.stage} className="admin-settings-layer-card">
                <div className="admin-licensing-stage-header">
                  <div>
                    <p><strong>{stage.label}</strong></p>
                    <small>{stage.stage} maturity checkpoint</small>
                  </div>
                  <span>{statusLabel(stage.status)}</span>
                </div>
                <p>{stage.summary}</p>
                <p className="admin-licensing-rule-copy">{stage.rulePresentation}</p>
                <p>{stage.progressCurrent} / {stage.progressTarget} complete ({progressValue}%)</p>
                <div className="admin-licensing-progress-track" aria-hidden="true">
                  <span className="admin-licensing-progress-fill" style={{ width: `${progressValue}%` }} />
                </div>
                <div className="admin-licensing-checklist">
                  {stage.checklist.map((item) => (
                    <div key={item.id} className="admin-licensing-check-row">
                      <span>{item.met ? "PASS" : "PENDING"}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>
                          Current {item.currentValue} · Required {item.requiredValue}
                        </small>
                        <small>Source: {item.source}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="admin-licensing-rule-copy">{stage.upgradeControl}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default AdminLicensingEligibilityPage;
