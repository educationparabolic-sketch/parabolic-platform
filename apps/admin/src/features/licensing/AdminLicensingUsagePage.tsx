import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
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

interface BillingActionRow {
  action: string;
  destination: string;
  url: string;
  instituteBoundary: string;
}

interface BillingEstimatorRow {
  layer: string;
  model: string;
  currentStatus: string;
}

interface UsageSourceRow {
  metric: string;
  currentValue: string;
  source: string;
}

function summarizeVendorUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

const billingActionColumns: UiTableColumn<BillingActionRow>[] = [
  {
    header: "Action",
    id: "action",
    render: (row) => row.action,
  },
  {
    header: "Vendor Redirect",
    id: "destination",
    render: (row) => row.destination,
  },
  {
    header: "Institute Boundary",
    id: "instituteBoundary",
    render: (row) => row.instituteBoundary,
  },
  {
    header: "Open",
    id: "open",
    render: (row) => (
      <a className="admin-primary-link" href={row.url} target="_blank" rel="noreferrer">
        Open Vendor Flow
      </a>
    ),
  },
];

const billingEstimatorColumns: UiTableColumn<BillingEstimatorRow>[] = [
  {
    header: "Layer",
    id: "layer",
    render: (row) => row.layer,
  },
  {
    header: "Estimator Model",
    id: "model",
    render: (row) => row.model,
  },
  {
    header: "Current Status",
    id: "currentStatus",
    render: (row) => row.currentStatus,
  },
];

const usageSourceColumns: UiTableColumn<UsageSourceRow>[] = [
  {
    header: "Usage Field",
    id: "metric",
    render: (row) => row.metric,
  },
  {
    header: "Current Value",
    id: "currentValue",
    render: (row) => row.currentValue,
  },
  {
    header: "Authoritative Source",
    id: "source",
    render: (row) => row.source,
  },
];

function AdminLicensingUsagePage() {
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
  }, [licensingInstituteId]);

  const currentPlan = snapshot.currentPlan;
  const usage = snapshot.usageAndBilling;
  const billingActionRows: BillingActionRow[] = [
    {
      action: "Download Invoice",
      destination: summarizeVendorUrl(usage.actions.downloadInvoiceUrl),
      instituteBoundary: "Read-only document retrieval; no license mutation inside admin.",
      url: usage.actions.downloadInvoiceUrl,
    },
    {
      action: "View Billing History",
      destination: summarizeVendorUrl(usage.actions.viewBillingHistoryUrl),
      instituteBoundary: "Vendor ledger review; institute licenseHistory remains immutable audit data.",
      url: usage.actions.viewBillingHistoryUrl,
    },
    {
      action: "Update Payment Method",
      destination: summarizeVendorUrl(usage.actions.updatePaymentMethodUrl),
      instituteBoundary: "Payment credential changes are handled only by vendor billing services.",
      url: usage.actions.updatePaymentMethodUrl,
    },
    {
      action: "Contact Support",
      destination: summarizeVendorUrl(usage.actions.contactSupportUrl),
      instituteBoundary: "Support request handoff; no entitlement or feature-flag change is granted.",
      url: usage.actions.contactSupportUrl,
    },
  ];
  const billingEstimatorRows: BillingEstimatorRow[] = [
    {
      currentStatus: currentPlan.currentLayer === "L0" ? "Current layer model" : "Reference only",
      layer: "L0",
      model: "Base fee plus per active student.",
    },
    {
      currentStatus: currentPlan.currentLayer === "L1" ? "Current layer model" : "Reference only",
      layer: "L1",
      model: "Higher base fee plus per active student.",
    },
    {
      currentStatus: currentPlan.currentLayer === "L2" ? "Current layer model" : "Reference only",
      layer: "L2",
      model: "Premium base fee plus per student plus controlled-mode surcharge.",
    },
    {
      currentStatus: currentPlan.currentLayer === "L3" ? "Current layer model" : "Invitation-only reference",
      layer: "L3",
      model: "Annual institutional governance fee.",
    },
  ];
  const usageSourceRows: UsageSourceRow[] = [
    {
      currentValue: `${usage.activeStudents} / ${usage.maxStudentsAllowed}`,
      metric: "Active Students and Max Students Allowed",
      source: "Vendor API GET /licenseUsage with license limit fallback.",
    },
    {
      currentValue: String(usage.remainingStudentSlots),
      metric: "Remaining Student Slots",
      source: "Derived from vendor-accounted active students minus the vendor license limit.",
    },
    {
      currentValue: `${usage.attemptsUsed} used, ${usage.attemptsRemaining} remaining`,
      metric: "Attempts Used and Attempts Remaining",
      source: "Vendor API GET /licenseUsage for current billing cycle attempt volume.",
    },
    {
      currentValue: `${usage.peakConcurrency} / ${usage.maxConcurrentAllowed}`,
      metric: "Peak Concurrency and Max Concurrent Allowed",
      source: "Vendor usage meter plus license concurrency limit.",
    },
    {
      currentValue: `${usage.estimatedCurrentBill}; next billing date ${usage.nextBillingDate}`,
      metric: "Estimated Current Bill and Next Billing Date",
      source: "Vendor billing estimator; displayed as informational, not institute-computed billing authority.",
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-licensing-usage-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-licensing-usage-title">Dedicated Usage & Billing Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates vendor-accounted usage visibility and billing redirects instead of
        collapsing that drill-down back into the shared licensing workspace.
      </p>

      <LicensingWorkspaceNav />

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
          <p>
            Commercial calculation remains vendor-side. The admin portal displays the estimate but cannot
            recompute, approve, or mutate billing state.
          </p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Billing Redirects</p>
          <h4>Vendor authoritative</h4>
          <p>
            Invoice download, billing history, payment method updates, and support all leave this portal through
            vendor-owned redirect URLs.
          </p>
        </article>
      </div>

      <UiTable
        caption="Vendor usage source contract"
        columns={usageSourceColumns}
        rows={usageSourceRows}
        rowKey={(row) => row.metric}
        emptyStateText="No usage source rows available."
      />

      <UiTable
        caption="Billing estimator model by license layer"
        columns={billingEstimatorColumns}
        rows={billingEstimatorRows}
        rowKey={(row) => row.layer}
        emptyStateText="No billing estimator rows available."
      />

      <UiTable
        caption="Vendor-side billing redirect workflow"
        columns={billingActionColumns}
        rows={billingActionRows}
        rowKey={(row) => row.action}
        emptyStateText="No billing action redirects available."
      />

      <p className="admin-settings-inline-note">
        Redirect workflow boundary: actions may open vendor services, but this admin route never changes
        <code>institutes/{"{id}"}/license</code>, feature flags, payment credentials, or billing ledger records.
      </p>
    </section>
  );
}

export default AdminLicensingUsagePage;
