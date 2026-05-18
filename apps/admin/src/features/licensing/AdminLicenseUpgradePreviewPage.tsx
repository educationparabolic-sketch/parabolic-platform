import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  hasLayerAccess,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
} from "./licensingDataset";
import LicensingWorkspaceNav from "./LicensingWorkspaceNav";

function AdminLicenseUpgradePreviewPage() {
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
            "Local read mode: deterministic licensing upgrade preview loaded." :
            "Upgrade preview loaded from secured backend API. Vendor approval remains required for license changes.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load upgrade preview.";
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
  const upgradePreview = snapshot.upgradePreview;

  return (
    <section className="admin-content-card" aria-labelledby="admin-license-upgrade-preview-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-license-upgrade-preview-title">Dedicated Upgrade Preview Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates strategic upgrade visibility instead of collapsing that drill-down back into
        the shared licensing workspace.
      </p>

      <LicensingWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading upgrade preview..." : inlineMessage ?? "Upgrade preview workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Preview is strategic visibility only. Direct layer switching stays blocked and requires vendor approval.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/upgrade-preview
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Preview Cards</p>
          <h3>{upgradePreview.previewCards.length}</h3>
          <small>Strategic visibility only</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Governance Unlock</p>
          <h3>{hasLayerAccess(currentPlan.currentLayer, "L3") ? "Active" : "Pending"}</h3>
          <small>{hasLayerAccess(currentPlan.currentLayer, "L3") ? "L3 already available" : "Requires L3 approval"}</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {upgradePreview.previewCards.map((card) => (
          <article key={card} className="admin-risk-summary-card admin-licensing-preview-card">
            <p className="admin-content-eyebrow">Preview</p>
            <h4>{card}</h4>
            <p>Visible for planning without granting direct control over layer switching.</p>
          </article>
        ))}
      </div>

      <div className="admin-settings-inline-controls">
        <a className="admin-primary-link" href={upgradePreview.requestUpgradeUrl} target="_blank" rel="noreferrer">Request Upgrade</a>
        <a className="admin-primary-link" href={upgradePreview.scheduleEvaluationUrl} target="_blank" rel="noreferrer">Schedule Evaluation</a>
      </div>

      <p className="admin-settings-inline-note">
        Required layer unlocks: RiskOverview ({hasLayerAccess(currentPlan.currentLayer, "L1") ? "active" : "requires L1"}),
        ControlledMode ({hasLayerAccess(currentPlan.currentLayer, "L2") ? "active" : "requires L2"}),
        GovernanceDashboard ({hasLayerAccess(currentPlan.currentLayer, "L3") ? "active" : "requires L3"}).
      </p>
    </section>
  );
}

export default AdminLicenseUpgradePreviewPage;
