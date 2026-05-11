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

const ASSIGNMENT_WORKSPACES = [
  {
    title: "Create Assignment",
    description: "Run scheduling workspace for template selection, mode eligibility, recipients, and execution window setup.",
    to: "/admin/assignments/create",
    meta: "Scheduling and assignment creation flow",
  },
  {
    title: "Assignment List",
    description: "Primary list workspace for filtering runs by year, status, mode, batch, and start window.",
    to: "/admin/assignments/list",
    meta: "Operational run review and filters",
  },
  {
    title: "Live Monitor",
    description: "Dedicated live workspace for active run visibility and drill-in access to focused run monitoring.",
    to: "/admin/assignments/live",
    meta: "Active execution monitoring",
  },
  {
    title: "Assignment History",
    description: "Historical run review with summary-safe lifecycle visibility separate from current operations.",
    to: "/admin/assignments/history",
    meta: "Historical reporting and audit review",
  },
  {
    title: "Bulk Operations",
    description: "Centralized workspace for multi-run reminders, archiving, and repeated operator follow-up actions.",
    to: "/admin/assignments/bulk",
    meta: "Batch actions across assignment runs",
  },
] as const;

function AdminAssignmentsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
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
          "Local mode detected. Loaded deterministic assignment landing summaries from analytics fixtures.",
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
        setInlineMessage("Live mode enabled: assignments landing hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load assignments landing.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic assignment fixtures.`);
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

  const activeRuns = useMemo(
    () => dataset.runAnalytics.filter((run) => run.completionRatePercent < 100),
    [dataset],
  );
  const uniqueBatchCount = useMemo(
    () => new Set(dataset.runAnalytics.map((run) => run.batchId)).size,
    [dataset],
  );
  const averageCompletion = useMemo(() => {
    if (dataset.runAnalytics.length === 0) {
      return 0;
    }

    return Math.round(
      dataset.runAnalytics.reduce((sum, run) => sum + run.completionRatePercent, 0) / dataset.runAnalytics.length,
    );
  }, [dataset]);
  const assignmentsWorkspaces = useMemo(
    () => ASSIGNMENT_WORKSPACES.map((workspace) => {
      switch (workspace.to) {
        case "/admin/assignments/create":
          return {
            ...workspace,
            meta: `${dataset.runAnalytics.length} recent run summaries available for operator context`,
          };
        case "/admin/assignments/list":
          return {
            ...workspace,
            meta: `${uniqueBatchCount} batches represented across current run analytics`,
          };
        case "/admin/assignments/live":
          return {
            ...workspace,
            meta: `${activeRuns.length} active or still-collecting runs currently in scope`,
          };
        case "/admin/assignments/history":
          return {
            ...workspace,
            meta: `${averageCompletion}% average completion across indexed run summaries`,
          };
        case "/admin/assignments/bulk":
          return {
            ...workspace,
            meta: `${dataset.yearBehaviorSummary.academicYear} summary-safe run operations anchor`,
          };
        default:
          return workspace;
      }
    }),
    [activeRuns.length, averageCompletion, dataset, uniqueBatchCount],
  );
  const note = isLoading ?
    "Loading assignments landing summary from GET /admin/analytics..." :
    `${inlineMessage ?? "Assignments landing workspace ready."} Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}.`;

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Assignments Workspace"
      title="Dedicated Assignments Landing Workspace"
      description={[
        "This route turns /admin/assignments into a dedicated workspace index instead of redirecting directly into the create-assignment flow.",
        "Assignment operations are grouped into focused destinations for scheduling, run review, live monitoring, history, and bulk follow-up actions.",
      ]}
      note={note}
      stats={[
        {
          label: "Workspaces",
          value: String(ASSIGNMENT_WORKSPACES.length),
          detail: "Dedicated assignment management destinations",
        },
        {
          label: "Runs Indexed",
          value: String(dataset.runAnalytics.length),
          detail: `${dataset.yearBehaviorSummary.academicYear} runAnalytics records`,
        },
        {
          label: "Live Scope",
          value: String(activeRuns.length),
          detail: "active or still-collecting runs in summary-safe scope",
        },
        {
          label: "Avg Completion",
          value: `${averageCompletion}%`,
          detail: "summary-safe execution progress across indexed runs",
        },
      ]}
      links={assignmentsWorkspaces}
    />
  );
}

export default AdminAssignmentsLandingPage;
