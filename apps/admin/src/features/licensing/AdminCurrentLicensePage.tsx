import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
} from "./licensingDataset";

const LICENSING_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

function AdminCurrentLicensePage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchLicensingSnapshot(LICENSING_INSTITUTE_ID);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalLicensingReadMode() ?
            "Local read mode: deterministic current-license snapshot loaded." :
            "Current license loaded from secured backend API. Vendor controls remain authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load current license.";
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
  }, []);

  const currentPlan = snapshot.currentPlan;
  const attemptsRemaining = Math.max(
    0,
    currentPlan.attemptsQuotaThisMonth - currentPlan.attemptsUsedThisMonth,
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-current-license-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-current-license-title">Dedicated Current Plan Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates the institute’s live capability state instead of collapsing that drill-down
        back into the shared licensing workspace.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/licensing/features">Feature Matrix</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/eligibility">Eligibility Progress</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/usage">Usage & Billing</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/upgrade-preview">Upgrade Preview</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/history">License History</NavLink>
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading current license..." : inlineMessage ?? "Current license workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Start {currentPlan.licenseStartDate} · Renewal {currentPlan.renewalDate} · Expiry {currentPlan.expiryDate}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/current
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Students</p>
          <h3>{currentPlan.activeStudentCount}</h3>
          <small>Max allowed {currentPlan.maxStudentLimit}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Attempts Remaining</p>
          <h3>{attemptsRemaining}</h3>
          <small>Used {currentPlan.attemptsUsedThisMonth}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Concurrency Limit</p>
          <h3>{currentPlan.concurrencyLimit}</h3>
          <small>Vendor-enforced operational ceiling</small>
        </article>
      </div>

      <div className="admin-settings-grid-three">
        <article className="admin-settings-layer-card">
          <p><strong>Plan Name:</strong> {currentPlan.planName}</p>
          <p><strong>Billing Cycle:</strong> {currentPlan.billingCycle}</p>
          <p><strong>Current Layer:</strong> {currentPlan.currentLayer}</p>
          <p><strong>Layer Badge:</strong> {resolveLayerBadge(currentPlan.currentLayer)}</p>
        </article>
        <article className="admin-settings-layer-card">
          <p><strong>License Start Date:</strong> {currentPlan.licenseStartDate}</p>
          <p><strong>Expiry Date:</strong> {currentPlan.expiryDate}</p>
          <p><strong>Renewal Date:</strong> {currentPlan.renewalDate}</p>
        </article>
        <article className="admin-settings-layer-card">
          <p><strong>Active Student Count:</strong> {currentPlan.activeStudentCount}</p>
          <p><strong>Max Student Limit:</strong> {currentPlan.maxStudentLimit}</p>
          <p><strong>Attempts Used This Month:</strong> {currentPlan.attemptsUsedThisMonth}</p>
          <p><strong>Attempts Quota This Month:</strong> {currentPlan.attemptsQuotaThisMonth}</p>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Single source of truth</p>
          <h4>Server-signed license object</h4>
          <p>The institute license document remains vendor-controlled and cached in memory after login.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Backend enforcement</p>
          <h4>No UI-only unlocks</h4>
          <p>Protected endpoints must reject missing license capabilities server-side instead of trusting UI state.</p>
        </article>
      </div>
    </section>
  );
}

export default AdminCurrentLicensePage;
