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
      description: "See which tests are working well across classes, recent runs, and teaching contexts.",
      to: "/admin/analytics/templates",
      meta: `${templates.length} tests summarized for quick teacher review`,
    },
    {
      title: "Cross-Batch Analytics",
      description: "Compare batches side by side to spot support needs, strong groups, and follow-up opportunities.",
      to: "/admin/analytics/batches",
      meta: `${batches.length} batches available for side-by-side review`,
    },
  ]), [batches.length, templates.length]);

  const note = isLoading ?
    "Loading analytics landing summary from GET /admin/analytics..." :
    `${inlineMessage ?? "Analytics workspace ready."} Current role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. This area stays focused on quick comparison, while detailed follow-up continues inside the main tests, students, and assignments pages.`;

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Analytics Workspace"
      title="Teacher-Friendly Analytics Workspace"
      description={[
        "Use this space for quick comparison across tests and batches without leaving the admin teaching workflow.",
        "Each workspace is built for summary-first review, with drill-through links when you want to inspect a specific test, batch, or assignment more closely.",
      ]}
      note={note}
      stats={[
        {
          label: "Analytics Pages",
          value: "2",
          detail: "Cross-template and cross-batch views",
        },
        {
          label: "Runs Compared",
          value: String(runs.length),
          detail: "Recent test runs included in the summary",
        },
        {
          label: "Templates Compared",
          value: String(templates.length),
          detail: "Tests rolled up for comparison",
        },
        {
          label: "L2 Depth",
          value: showL2 ? "Enabled" : "Limited",
          detail: showL2 ? "Advanced execution signals are visible" : "Advanced execution signals unlock at L2",
        },
      ]}
      links={analyticsWorkspaces}
    />
  );
}

export default AdminAnalyticsLandingPage;
