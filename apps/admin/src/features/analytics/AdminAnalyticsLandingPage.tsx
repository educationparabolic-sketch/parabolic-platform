import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type DashboardDataset,
} from "./analyticsDataset";
import {
  deriveBatchRecords,
  deriveRunRecords,
  deriveTemplateRecords,
} from "./analyticsArchitecture";

function AdminAnalyticsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const showL2 =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic analytics comparison fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: analytics landing hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load analytics landing.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic analytics fixtures.`);
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
  }, []);

  const runs = useMemo(() => deriveRunRecords(dataset.runAnalytics), [dataset.runAnalytics]);
  const templates = useMemo(() => deriveTemplateRecords(runs), [runs]);
  const batches = useMemo(() => deriveBatchRecords(runs, dataset.studentYearMetrics), [runs, dataset.studentYearMetrics]);

  const analyticsWorkspaces = useMemo(() => ([
    {
      title: "Cross-Template Analytics",
      description: "Compare reusable templates across their run history without duplicating the one-template detail workspace.",
      to: "/admin/analytics/templates",
      meta: `${templates.length} templates aggregated from summary-safe run history`,
    },
    {
      title: "Cross-Batch Analytics",
      description: "Compare cohorts institute-wide without replacing the canonical batch workspace inside Students.",
      to: "/admin/analytics/batches",
      meta: `${batches.length} batches represented across current analytics scope`,
    },
  ]), [batches.length, runs.length, templates.length]);

  const note = isLoading ?
    "Loading analytics landing summary from GET /admin/analytics..." :
    `${inlineMessage ?? "Analytics comparison workspace ready."} Current role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. Analytics stays comparison-only and does not duplicate student, assignment, or template detail pages.`;

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Analytics Workspace"
      title="Cross-Entity Analytics Workspace"
      description={[
        "This module now follows the updated architecture contract: Analytics is reserved for cross-entity comparison only.",
        "The analytics surfaces here are cross-template analytics and cross-batch analytics, each with shared layer visibility and canonical drill-through into ownership pages.",
      ]}
      note={note}
      stats={[
        {
          label: "Analytics Pages",
          value: "2",
          detail: "Cross-template and cross-batch",
        },
        {
          label: "Runs Compared",
          value: String(runs.length),
          detail: "Delivered run events in current dataset",
        },
        {
          label: "Templates Compared",
          value: String(templates.length),
          detail: "Reusable templates aggregated across runs",
        },
        {
          label: "L2 Depth",
          value: showL2 ? "Enabled" : "Limited",
          detail: showL2 ? "Execution and risk signals are visible" : "Execution and risk metrics unlock from L2",
        },
      ]}
      links={analyticsWorkspaces}
    />
  );
}

export default AdminAnalyticsLandingPage;
