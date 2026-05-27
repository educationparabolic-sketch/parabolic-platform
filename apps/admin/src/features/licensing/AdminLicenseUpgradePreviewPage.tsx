import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
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

interface LayerPreviewCard {
  title: string;
  treatment: string;
  detail: string;
}

interface LayerPreviewGroup {
  layer: LicenseLayer;
  label: string;
  availability: string;
  cards: LayerPreviewCard[];
}

interface EvaluationActionRow {
  action: string;
  destination: string;
  approvalBoundary: string;
  url: string;
}

function summarizeVendorUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

const LAYER_PREVIEW_GROUPS: LayerPreviewGroup[] = [
  {
    availability: "Preview available when currently on L0",
    cards: [
      {
        detail: "Strategic risk distribution preview with data intentionally softened.",
        title: "Risk Overview",
        treatment: "Blurred preview",
      },
      {
        detail: "Pattern-alert list preview without granting diagnostic alert access.",
        title: "Pattern Alerts",
        treatment: "Blurred preview",
      },
      {
        detail: "Example student-intelligence card for planning conversations only.",
        title: "Student Intelligence",
        treatment: "Sample card",
      },
    ],
    label: "L0 to L1 Diagnostic Preview",
    layer: "L0",
  },
  {
    availability: "Preview available when currently on L1",
    cards: [
      {
        detail: "Controlled Mode control is visible but disabled until L2 approval.",
        title: "Controlled Mode",
        treatment: "Disabled toggle",
      },
      {
        detail: "Discipline Index graph sample shows execution-intelligence direction.",
        title: "Discipline Index",
        treatment: "Graph preview",
      },
      {
        detail: "Adaptive Phase preview explains phase orchestration without enabling it.",
        title: "Adaptive Phase",
        treatment: "Strategic preview",
      },
    ],
    label: "L1 to L2 Controlled Preview",
    layer: "L1",
  },
  {
    availability: "Preview available when currently on L2",
    cards: [
      {
        detail: "Stability Index gauge sample frames institutional governance depth.",
        title: "Stability Index",
        treatment: "Gauge preview",
      },
      {
        detail: "Batch Risk Heatmap sample shows cohort-level governance visibility.",
        title: "Batch Risk Heatmap",
        treatment: "Heatmap preview",
      },
      {
        detail: "Override Audit sample presents immutable review without live L3 access.",
        title: "Override Audit",
        treatment: "Audit sample",
      },
    ],
    label: "L2 to L3 Governance Preview",
    layer: "L2",
  },
];

const evaluationActionColumns: UiTableColumn<EvaluationActionRow>[] = [
  {
    header: "CTA",
    id: "action",
    render: (row) => row.action,
  },
  {
    header: "Vendor Destination",
    id: "destination",
    render: (row) => row.destination,
  },
  {
    header: "Approval Boundary",
    id: "approvalBoundary",
    render: (row) => row.approvalBoundary,
  },
  {
    header: "Open",
    id: "open",
    render: (row) => (
      <a className="admin-primary-link" href={row.url} target="_blank" rel="noreferrer">
        Open Vendor CTA
      </a>
    ),
  },
];

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
  const activePreviewGroup = LAYER_PREVIEW_GROUPS.find((group) => group.layer === currentPlan.currentLayer);
  const evaluationActionRows: EvaluationActionRow[] = [
    {
      action: "Request Upgrade",
      approvalBoundary: "Creates a vendor review request only; no direct layer switching is exposed.",
      destination: summarizeVendorUrl(upgradePreview.requestUpgradeUrl),
      url: upgradePreview.requestUpgradeUrl,
    },
    {
      action: "Schedule Evaluation",
      approvalBoundary: "Starts vendor evaluation scheduling; license flags remain unchanged until approval.",
      destination: summarizeVendorUrl(upgradePreview.scheduleEvaluationUrl),
      url: upgradePreview.scheduleEvaluationUrl,
    },
  ];

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
          <h3>{activePreviewGroup?.cards.length ?? upgradePreview.previewCards.length}</h3>
          <small>{activePreviewGroup?.label ?? "Current layer already has the highest preview set"}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Governance Unlock</p>
          <h3>{hasLayerAccess(currentPlan.currentLayer, "L3") ? "Active" : "Pending"}</h3>
          <small>{hasLayerAccess(currentPlan.currentLayer, "L3") ? "L3 already available" : "Requires L3 approval"}</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {LAYER_PREVIEW_GROUPS.map((group) => (
          <article key={group.layer} className="admin-risk-summary-card admin-licensing-preview-card">
            <p className="admin-content-eyebrow">{group.label}</p>
            <h4>{group.layer === currentPlan.currentLayer ? "Active strategic preview" : group.availability}</h4>
            <p>
              {group.layer === currentPlan.currentLayer ?
                "This is the preview set shown for the institute's current layer." :
                "Visible as ladder context only; it does not unlock downstream controls."}
            </p>
            <div className="admin-settings-grid-three">
              {group.cards.map((card) => (
                <div key={card.title} className="admin-settings-layer-card">
                  <p><strong>{card.title}</strong></p>
                  <p>{card.treatment}</p>
                  <small>{card.detail}</small>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <UiTable
        caption="Vendor-approved upgrade evaluation CTAs"
        columns={evaluationActionColumns}
        rows={evaluationActionRows}
        rowKey={(row) => row.action}
        emptyStateText="No upgrade evaluation CTAs available."
      />

      <p className="admin-settings-inline-note">
        Required layer unlocks: RiskOverview ({hasLayerAccess(currentPlan.currentLayer, "L1") ? "active" : "requires L1"}),
        ControlledMode ({hasLayerAccess(currentPlan.currentLayer, "L2") ? "active" : "requires L2"}),
        GovernanceDashboard ({hasLayerAccess(currentPlan.currentLayer, "L3") ? "active" : "requires L3"}).
      </p>
      <p className="admin-settings-inline-note">
        Direct layer switching is intentionally absent. Vendor approval must update the authoritative license
        document and backend feature flags before any previewed capability becomes operational.
      </p>
    </section>
  );
}

export default AdminLicenseUpgradePreviewPage;
