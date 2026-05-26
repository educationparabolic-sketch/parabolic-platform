import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
  type LicensingFeatureRow,
} from "./licensingDataset";
import LicensingWorkspaceNav from "./LicensingWorkspaceNav";

const FEATURE_MATRIX_LAYERS: LicenseLayer[] = ["L0", "L1", "L2", "L3"];

function renderFeatureLayerState(row: LicensingFeatureRow, layer: LicenseLayer, currentLayer: LicenseLayer) {
  const state = row.layers[layer];

  if (state === "enabled") {
    return (
      <span className="admin-licensing-feature-state admin-licensing-feature-state-enabled">
        Enabled
      </span>
    );
  }

  const tooltip =
    layer === currentLayer ?
      `${row.feature} is locked for the current ${currentLayer} plan. Upgrade requires vendor approval.` :
      `${row.feature} is not included at ${layer}. Locked capabilities stay visible for planning only.`;

  return (
    <span
      className="admin-licensing-feature-state admin-licensing-feature-state-locked"
      title={tooltip}
      aria-label={tooltip}
    >
      <span aria-hidden="true" className="admin-licensing-lock-glyph">🔒</span>
      <span className="admin-licensing-locked-text">Locked</span>
    </span>
  );
}

function AdminLicenseFeaturesPage() {
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
            "Local read mode: deterministic licensing feature matrix loaded." :
            "License features loaded from secured backend API. Vendor entitlements remain authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load license features.";
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
  const featureColumns = useMemo<UiTableColumn<LicensingFeatureRow>[]>(
    () => [
      {
        id: "feature",
        header: "Feature",
        render: (row) => (
          <div className="admin-settings-cell-stack">
            <strong>{row.feature}</strong>
            <small>{row.description}</small>
          </div>
        ),
      },
      {
        id: "l0",
        header: "L0",
        render: (row) => renderFeatureLayerState(row, "L0", currentPlan.currentLayer),
      },
      {
        id: "l1",
        header: "L1",
        render: (row) => renderFeatureLayerState(row, "L1", currentPlan.currentLayer),
      },
      {
        id: "l2",
        header: "L2",
        render: (row) => renderFeatureLayerState(row, "L2", currentPlan.currentLayer),
      },
      {
        id: "l3",
        header: "L3",
        render: (row) => renderFeatureLayerState(row, "L3", currentPlan.currentLayer),
      },
    ],
    [currentPlan.currentLayer],
  );

  const lockedForCurrentLayer = snapshot.featureMatrix.filter(
    (row) => row.layers[currentPlan.currentLayer] === "locked",
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-license-features-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-license-features-title">Dedicated Feature Matrix Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates the maturity ladder and entitlement matrix instead of collapsing that
        drill-down back into the shared licensing workspace.
      </p>

      <LicensingWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading license feature matrix..." : inlineMessage ?? "License features workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Transparent entitlement visibility with locked states, non-invasive upgrade messaging, and no UI-only
            capability unlocks.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/features
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Feature Rows</p>
          <h3>{snapshot.featureMatrix.length}</h3>
          <small>Layer ladder coverage</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Enabled In {currentPlan.currentLayer}</p>
          <h3>{snapshot.featureMatrix.length - lockedForCurrentLayer.length}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Locked In {currentPlan.currentLayer}</p>
          <h3>{lockedForCurrentLayer.length}</h3>
          <small>Slight blur, lock icon, upgrade note</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Current layer focus</p>
          <h4>{currentPlan.currentLayer} entitlement boundary</h4>
          <p>
            Locked features for this institute layer:{" "}
            {lockedForCurrentLayer.length > 0 ?
              lockedForCurrentLayer.map((row) => row.feature).join(", ") :
              "None"}
          </p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Upgrade messaging</p>
          <h4>No hard upsell language</h4>
          <p>Locked capabilities stay visible for planning, but all actual entitlement changes remain vendor-approved.</p>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Locked Feature Treatment</h3>
        <div className="admin-licensing-lock-treatment-grid">
          {FEATURE_MATRIX_LAYERS.map((layer) => {
            const lockedCount = snapshot.featureMatrix.filter((row) => row.layers[layer] === "locked").length;

            return (
              <article key={layer} className="admin-risk-summary-card">
                <p className="admin-content-eyebrow">{layer}</p>
                <h4>{lockedCount} locked capabilities</h4>
                <p>
                  Locked cells use a slight blur, lock glyph, and hover tooltip. Visibility is informational only and
                  does not grant backend access.
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Feature Matrix</h3>
        <UiTable
          caption="License feature matrix by layer"
          columns={featureColumns}
          rows={snapshot.featureMatrix}
          rowKey={(row) => row.feature}
          emptyStateText="No entitlement rows available."
        />
      </div>
    </section>
  );
}

export default AdminLicenseFeaturesPage;
