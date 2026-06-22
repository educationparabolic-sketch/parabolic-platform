import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type DashboardDataset,
} from "../analytics/analyticsDataset";

function AdminInsightsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic insights landing summaries.");
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: insights landing hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load insights landing.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic insights fixtures.`);
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

  const highRiskStudents = useMemo(
    () =>
      dataset.studentYearMetrics.filter(
        (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
      ).length,
    [dataset.studentYearMetrics],
  );
  const riskyBatches = useMemo(
    () => dataset.yearBehaviorSummary.batchDiagnosticHeatmap.filter((batch) => batch.percentPacingDrift >= 28).length,
    [dataset.yearBehaviorSummary.batchDiagnosticHeatmap],
  );

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Insights Workspace"
      title="Risk Support Workspace"
      description={[
        "Insights is now intentionally lean and L2+ only. It helps teachers understand where support is needed, why pressure may be building, and what to review next.",
        "Risk Overview is the single current insights surface and brings together priority students, batch-level concerns, likely drivers, and clear drill-through into the right ownership pages.",
      ]}
      note={
        isLoading ?
          "Loading insights landing from GET /admin/analytics..." :
          `${inlineMessage ?? "Insights landing ready."} Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}.`
      }
      stats={[
        {
          label: "Insights Pages",
          value: "1",
          detail: "One focused support workspace",
        },
        {
          label: "Entry Layer",
          value: "L2",
          detail: "Opens automatically for L2+ institutes",
        },
        {
          label: "High-Risk Students",
          value: String(highRiskStudents),
          detail: "Students who may need quicker attention",
        },
        {
          label: "Risk-Heavy Batches",
          value: String(riskyBatches),
          detail: "Batches showing stronger warning signals",
        },
      ]}
      links={[
        {
          title: "Risk Overview",
          description: "A teacher-friendly risk workspace for prioritizing students, spotting batch concerns, and deciding the next best follow-up.",
          to: "/admin/insights/risk",
          meta: `Academic year ${dataset.yearBehaviorSummary.academicYear} · summary-safe only`,
        },
      ]}
    />
  );
}

export default AdminInsightsLandingPage;
