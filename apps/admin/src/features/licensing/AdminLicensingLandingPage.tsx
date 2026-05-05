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

interface LicensingWorkspaceLink {
  title: string;
  description: string;
  to: string;
}

const LICENSING_WORKSPACES: LicensingWorkspaceLink[] = [
  {
    title: "Current Plan",
    description: "Live capability state, contract dates, student limits, and concurrency boundaries.",
    to: "/admin/licensing/current",
  },
  {
    title: "Feature Matrix",
    description: "Transparent entitlement ladder across L0-L3 with locked-state visibility.",
    to: "/admin/licensing/features",
  },
  {
    title: "Eligibility Progress",
    description: "Truth-ladder maturity checkpoints for L1, L2, and L3 readiness.",
    to: "/admin/licensing/eligibility",
  },
  {
    title: "Usage & Billing",
    description: "Vendor-accounted usage limits, billing estimate visibility, and redirect-based actions.",
    to: "/admin/licensing/usage",
  },
  {
    title: "Upgrade Preview",
    description: "Strategic next-layer previews with vendor-approved upgrade actions only.",
    to: "/admin/licensing/upgrade-preview",
  },
  {
    title: "License History",
    description: "Immutable licensing timeline and audit-only layer transition visibility.",
    to: "/admin/licensing/history",
  },
];

function AdminLicensingLandingPage() {
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
            "Local read mode: deterministic licensing landing snapshot loaded." :
            "Licensing landing loaded from secured backend API. Vendor authority remains primary.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load licensing landing.";
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

  return (
    <section className="admin-content-card" aria-labelledby="admin-licensing-landing-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-licensing-landing-title">Dedicated Licensing Landing Workspace</h2>
      <p className="admin-content-copy">
        This mounted route replaces the old redirect with a dedicated landing workspace for license state,
        entitlement visibility, readiness tracking, usage, upgrade planning, and history.
      </p>
      <p className="admin-content-copy">
        Licensing governs feature access, enforcement activation, dashboard visibility, usage boundaries, and
        billing eligibility. Vendor-side controls remain authoritative.
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading licensing landing..." : inlineMessage ?? "Licensing landing workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Plan Name</p>
          <h3>{currentPlan.planName}</h3>
          <small>{currentPlan.billingCycle} billing cycle</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Students</p>
          <h3>{currentPlan.activeStudentCount}</h3>
          <small>Max {currentPlan.maxStudentLimit}</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {LICENSING_WORKSPACES.map((workspace) => (
          <article key={workspace.to} className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Licensing Section</p>
            <h4>{workspace.title}</h4>
            <p>{workspace.description}</p>
            <NavLink className="admin-primary-link" to={workspace.to}>
              Open Workspace
            </NavLink>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminLicensingLandingPage;
