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

function AdminAnalyticsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const showRiskInsights =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const showExecutionMetrics =
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
        setInlineMessage(
          "Local mode detected. Loaded deterministic analytics landing summaries from summary-safe fixtures.",
        );
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

  const analyticsWorkspaces = useMemo(() => ([
    {
      title: "Overview",
      description: "Summary dashboard for performance, participation, risk, and discipline using summary collections only.",
      to: "/admin/analytics/overview",
      meta: `${dataset.runAnalytics.length} runs surfaced for the current academic year`,
    },
    {
      title: "Trends",
      description: "Time-based performance and stability analysis using monthly summary-safe aggregates.",
      to: "/admin/analytics/trends",
      meta: `Monthly anchor ${dataset.yearBehaviorSummary.computedAt.slice(0, 10)}`,
    },
    {
      title: "Template Analytics",
      description: "Structural quality and effectiveness drill-down for a selected template across its runs.",
      to: "/admin/analytics/template/tmpl-001",
      meta: "Cross-run template performance review",
    },
    {
      title: "Batch Analytics",
      description: "Cross-batch comparisons for performance, participation, discipline, and risk distribution.",
      to: "/admin/analytics/batch",
      meta: `${new Set(dataset.runAnalytics.map((record) => record.batchId)).size} batches represented`,
    },
    ...(showRiskInsights ?
      [{
        title: "Risk Insights",
        description: "Risk-focused review for cluster distribution, high-risk learners, and discipline trend signals.",
        to: "/admin/analytics/risk-insights",
        meta: `${dataset.studentYearMetrics.filter((student) => ["high", "critical"].includes(student.rollingRiskCluster)).length} high-risk students currently visible`,
      }] :
      []),
  ]), [dataset, showRiskInsights]);

  const note = isLoading ?
    "Loading analytics landing summary from GET /admin/analytics..." :
    `${inlineMessage ?? "Analytics landing workspace ready."} Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. Risk Insights unlocks from L1.`;

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Analytics Workspace"
      title="Dedicated Analytics Landing Workspace"
      description={[
        "This route turns /admin/analytics into a dedicated workspace index instead of redirecting directly into the overview dashboard.",
        "Analytics workflows are grouped into focused destinations for overview, trends, template performance, batch comparisons, and risk-focused review.",
      ]}
      note={note}
      stats={[
        {
          label: "Workspaces",
          value: String(analyticsWorkspaces.length),
          detail: "Dedicated analytics destinations",
        },
        {
          label: "Runs Indexed",
          value: String(dataset.runAnalytics.length),
          detail: `${dataset.yearBehaviorSummary.academicYear} runAnalytics records`,
        },
        {
          label: "Risk View",
          value: showRiskInsights ? "Enabled" : "Locked",
          detail: showRiskInsights ? "Risk insights available at current layer" : "Unlocks from L1",
        },
        {
          label: "Execution Layer",
          value: showExecutionMetrics ? "Visible" : "Limited",
          detail: showExecutionMetrics ?
            `${dataset.yearBehaviorSummary.executionStabilityIndex}% stability index available` :
            "Execution metrics unlock from L2",
        },
      ]}
      links={analyticsWorkspaces}
    />
  );
}

export default AdminAnalyticsLandingPage;
