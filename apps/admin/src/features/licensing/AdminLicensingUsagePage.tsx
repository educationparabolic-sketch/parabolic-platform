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

function AdminLicensingUsagePage() {
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
            "Local read mode: deterministic licensing usage snapshot loaded." :
            "Licensing usage loaded from secured backend API. Vendor accounting remains authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load licensing usage.";
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
  const usage = snapshot.usageAndBilling;

  return (
    <section className="admin-content-card" aria-labelledby="admin-licensing-usage-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-licensing-usage-title">Dedicated Usage & Billing Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates vendor-accounted usage visibility and billing redirects instead of
        collapsing that drill-down back into the shared licensing workspace.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/licensing/current">Current Plan</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/features">Feature Matrix</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/eligibility">Eligibility Progress</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/upgrade-preview">Upgrade Preview</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/licensing/history">License History</NavLink>
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading licensing usage..." : inlineMessage ?? "Licensing usage workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Billing cycle {currentPlan.billingCycle} · Next billing date {usage.nextBillingDate}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/usage
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Active Students</p>
          <h3>{usage.activeStudents}</h3>
          <small>Vendor-accounted current month</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Student Slots Left</p>
          <h3>{usage.remainingStudentSlots}</h3>
          <small>Max allowed {usage.maxStudentsAllowed}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Attempts Remaining</p>
          <h3>{usage.attemptsRemaining}</h3>
          <small>Used {usage.attemptsUsed}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Peak Concurrency</p>
          <h3>{usage.peakConcurrency}</h3>
          <small>Max allowed {usage.maxConcurrentAllowed}</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Estimated Current Bill</p>
          <h4>{usage.estimatedCurrentBill}</h4>
          <p>Commercial calculation remains vendor-side and does not mutate institute license state.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Billing Redirects</p>
          <h4>Vendor authoritative</h4>
          <p>Invoice download, billing history, payment method updates, and support stay outside the admin app.</p>
        </article>
      </div>

      <div className="admin-settings-inline-controls">
        <a className="admin-primary-link" href={usage.actions.downloadInvoiceUrl} target="_blank" rel="noreferrer">Download Invoice</a>
        <a className="admin-primary-link" href={usage.actions.viewBillingHistoryUrl} target="_blank" rel="noreferrer">View Billing History</a>
        <a className="admin-primary-link" href={usage.actions.updatePaymentMethodUrl} target="_blank" rel="noreferrer">Update Payment Method</a>
        <a className="admin-primary-link" href={usage.actions.contactSupportUrl} target="_blank" rel="noreferrer">Contact Support</a>
      </div>
    </section>
  );
}

export default AdminLicensingUsagePage;
