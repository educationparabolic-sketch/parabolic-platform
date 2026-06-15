import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type RunAnalyticsRecord,
} from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";

type ExecutionMode = "Operational" | "Controlled" | "Focused" | "Hard";

interface RunAnalyticsSnapshot {
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  avgDisciplineIndex: number;
  controlledCompliancePercent: number;
  executionStabilityBadge: string;
}

interface RunStatusRecord {
  runId: string;
  runName: string;
  batchName: string;
  mode: ExecutionMode;
  startedAtIso: string;
  completionPercent: number;
  participants: number;
  runAnalyticsSnapshot: RunAnalyticsSnapshot;
}

const LIVE_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    batchName: "Batch-C",
    mode: "Controlled",
    startedAtIso: "2026-04-16T04:00:00.000Z",
    completionPercent: 64,
    participants: 3,
    runAnalyticsSnapshot: {
      avgRawScorePercent: 63,
      avgAccuracyPercent: 68,
      avgPhaseAdherencePercent: 71,
      avgDisciplineIndex: 66,
      controlledCompliancePercent: 87,
      executionStabilityBadge: "Drift",
    },
  },
  {
    runId: "run-2026-0418-001",
    runName: "Run 2026-0418-001",
    batchName: "Batch-A",
    mode: "Focused",
    startedAtIso: "2026-04-18T05:00:00.000Z",
    completionPercent: 42,
    participants: 3,
    runAnalyticsSnapshot: {
      avgRawScorePercent: 67,
      avgAccuracyPercent: 72,
      avgPhaseAdherencePercent: 75,
      avgDisciplineIndex: 71,
      controlledCompliancePercent: 0,
      executionStabilityBadge: "Stable",
    },
  },
];

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function toExecutionMode(mode: string): ExecutionMode {
  if (mode === "Operational" || mode === "Controlled" || mode === "Focused" || mode === "Hard") {
    return mode;
  }

  return "Operational";
}

function toStabilityBadge(record: RunAnalyticsRecord): string {
  if (record.controlledCompliancePercent >= 80 && record.pacingGuardrailViolationPercent <= 12) {
    return "Stable";
  }

  if (record.controlledCompliancePercent >= 55 && record.pacingGuardrailViolationPercent <= 22) {
    return "Drift";
  }

  return "Escalated";
}

function buildLiveRunRows(runAnalytics: RunAnalyticsRecord[]): RunStatusRecord[] {
  const recentRuns = [...runAnalytics].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  const candidateRuns = recentRuns.filter((run) => run.completionRatePercent < 100);
  const sourceRuns = (candidateRuns.length > 0 ? candidateRuns : recentRuns).slice(0, 6);

  return sourceRuns.map((run) => ({
    runId: run.runId,
    runName: run.runName,
    batchName: run.batchName,
    mode: toExecutionMode(run.mode),
    startedAtIso: run.startedAt,
    completionPercent: Math.round(run.completionRatePercent),
    participants: run.participants,
    runAnalyticsSnapshot: {
      avgRawScorePercent: Math.round(run.avgRawScorePercent),
      avgAccuracyPercent: Math.round(run.avgAccuracyPercent),
      avgPhaseAdherencePercent: Math.round(run.avgPhaseAdherencePercent),
      avgDisciplineIndex: Math.round(run.disciplineIndexAverage),
      controlledCompliancePercent: Math.round(run.controlledCompliancePercent),
      executionStabilityBadge: toStabilityBadge(run),
    },
  }));
}

function AdminAssignmentsLivePage() {
  const [liveRuns, setLiveRuns] = useState<RunStatusRecord[]>(LIVE_RUNS);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLiveRuns() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setLiveRuns(LIVE_RUNS);
        setInlineMessage(
          "Local mode detected. Loaded deterministic active-run fixtures for the dedicated live monitor landing.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const dataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        const nextRuns = buildLiveRunRows(dataset.runAnalytics);
        setLiveRuns(nextRuns.length > 0 ? nextRuns : LIVE_RUNS);
        setInlineMessage(
          "Live mode enabled: live monitor landing hydrated from GET /admin/analytics runAnalytics summaries.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load live monitor data.";
        setLiveRuns(LIVE_RUNS);
        setInlineMessage(`${reason} Falling back to deterministic live-run fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadLiveRuns();

    return () => {
      isMounted = false;
    };
  }, []);

  const summaryCards = useMemo(() => {
    const activeRunCount = liveRuns.length;
    const totalRecipients = liveRuns.reduce((sum, run) => sum + run.participants, 0);
    const avgCompletion =
      activeRunCount > 0 ?
        Math.round(liveRuns.reduce((sum, run) => sum + run.completionPercent, 0) / activeRunCount) :
        0;
    const avgDiscipline =
      activeRunCount > 0 ?
        Math.round(liveRuns.reduce((sum, run) => sum + run.runAnalyticsSnapshot.avgDisciplineIndex, 0) / activeRunCount) :
        0;

    return [
      { label: "Runs In Scope", value: String(activeRunCount), helper: "recent live-monitor summaries" },
      { label: "Participants In Scope", value: String(totalRecipients), helper: "runAnalytics participant totals" },
      { label: "Average Completion", value: `${avgCompletion}%`, helper: "summary-safe execution progress" },
      { label: "Average Discipline", value: String(avgDiscipline), helper: "runAnalytics discipline average" },
    ];
  }, [liveRuns]);

  const liveColumns = useMemo<UiTableColumn<RunStatusRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        render: (row) => (
          <div className="admin-assignments-run-cell">
            <strong>{row.runName}</strong>
            <small>{row.batchName}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        id: "startedAt",
        header: "Started",
        render: (row) => formatDateTime(row.startedAtIso),
      },
      {
        id: "participants",
        header: "Participants",
        render: (row) => row.participants,
      },
      {
        id: "completion",
        header: "Completion",
        render: (row) => `${row.completionPercent}%`,
      },
      {
        id: "discipline",
        header: "Discipline",
        render: (row) => `${row.runAnalyticsSnapshot.avgDisciplineIndex}`,
      },
      {
        id: "compliance",
        header: "Controlled Compliance",
        render: (row) => `${row.runAnalyticsSnapshot.controlledCompliancePercent}%`,
      },
      {
        id: "actions",
        header: "Focused Run",
        render: (row) => (
          <NavLink className="admin-primary-link" to={`/admin/assignments/live/${row.runId}`}>
            Open {row.runId}
          </NavLink>
        ),
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-assignments-live-title">
      <p className="admin-content-eyebrow">Assignments Live Workspace</p>
      <h2 id="admin-assignments-live-title">Dedicated Live Monitor Landing</h2>
      <p className="admin-content-copy">
        This dedicated route keeps <code>/admin/assignments/live</code> separate from the broader assignment-management
        shell. It focuses on active execution visibility first, then routes deeper into run-specific monitoring without
        exposing question content.
      </p>

      <AssignmentsWorkspaceNav />

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {isLoading ? (
        <p className="admin-assignments-inline-note">Loading live monitor summaries from GET /admin/analytics...</p>
      ) : null}

      <div className="admin-risk-summary-card">
        <h4>Live Monitor Scope</h4>
        <p>
          This landing workspace surfaces summary-safe live execution health from centralized run analytics and pushes
          run detail into dedicated <code>/admin/assignments/live/:runId</code> pages.
        </p>
        <small>Route: /admin/assignments/live</small>
      </div>

      <div className="admin-analytics-kpi-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="admin-analytics-kpi-card">
            <p>{card.label}</p>
            <h3>{card.value}</h3>
            <small>{card.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>L0 Live Snapshot</h4>
          <p>Run completion and participant-in-scope visibility stay centralized here for the current monitor set.</p>
          <small>Active-run landing view</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>L1/L2 Health Signals</h4>
          <p>
            Phase adherence, discipline, and controlled-compliance indicators stay summary-safe and never reveal
            question content.
          </p>
          <small>Execution health without raw-session exposure</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Focused Drill-In</h4>
          <p>Each row links into a dedicated live-run route instead of collapsing back into the shared parent screen.</p>
          <small>Route separation for `GBL-003`</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-assignments-live-table-title">
        <h3 id="admin-assignments-live-table-title">Active Run Monitor Table</h3>
        <UiTable
          caption="Active assignments live monitor"
          columns={liveColumns}
          rows={liveRuns}
          rowKey={(row) => row.runId}
          emptyStateText="No active runs are currently available."
        />
      </section>
    </section>
  );
}

export default AdminAssignmentsLivePage;
