import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";

type ExecutionMode = "Operational" | "Diagnostic" | "Controlled" | "Hard";
type RunStatus = "scheduled" | "active" | "collecting" | "completed" | "archived" | "cancelled" | "terminated";

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
  templateName: string;
  mode: ExecutionMode;
  startWindowIso: string;
  endWindowIso: string;
  status: RunStatus;
  completionPercent: number;
  recipientStudentIds: string[];
  runAnalyticsSnapshot: RunAnalyticsSnapshot;
}

const LIVE_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    templateName: "NEET Revision - Biology Focus",
    mode: "Controlled",
    startWindowIso: "2026-04-16T04:00:00.000Z",
    endWindowIso: "2026-04-16T07:00:00.000Z",
    status: "active",
    completionPercent: 64,
    recipientStudentIds: ["STU-021", "STU-022", "STU-023"],
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
    templateName: "JEE Mains Mock - Set A",
    mode: "Diagnostic",
    startWindowIso: "2026-04-18T05:00:00.000Z",
    endWindowIso: "2026-04-18T08:00:00.000Z",
    status: "active",
    completionPercent: 42,
    recipientStudentIds: ["STU-001", "STU-002", "STU-011"],
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

function AdminAssignmentsLivePage() {
  const summaryCards = useMemo(() => {
    const activeRunCount = LIVE_RUNS.length;
    const totalRecipients = LIVE_RUNS.reduce((sum, run) => sum + run.recipientStudentIds.length, 0);
    const avgCompletion =
      activeRunCount > 0 ?
        Math.round(LIVE_RUNS.reduce((sum, run) => sum + run.completionPercent, 0) / activeRunCount) :
        0;
    const avgDiscipline =
      activeRunCount > 0 ?
        Math.round(LIVE_RUNS.reduce((sum, run) => sum + run.runAnalyticsSnapshot.avgDisciplineIndex, 0) / activeRunCount) :
        0;

    return [
      { label: "Active Runs", value: String(activeRunCount), helper: "runs currently in active window" },
      { label: "Recipients In Flight", value: String(totalRecipients), helper: "explicit live recipients" },
      { label: "Average Completion", value: `${avgCompletion}%`, helper: "live execution progress" },
      { label: "Average Discipline", value: String(avgDiscipline), helper: "summary-safe execution quality" },
    ];
  }, []);

  const liveColumns = useMemo<UiTableColumn<RunStatusRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        render: (row) => (
          <div className="admin-assignments-run-cell">
            <strong>{row.runName}</strong>
            <small>{row.templateName}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        id: "window",
        header: "Window",
        render: (row) => (
          <div className="admin-assignments-window-cell">
            <strong>{formatDateTime(row.startWindowIso)}</strong>
            <small>{formatDateTime(row.endWindowIso)}</small>
          </div>
        ),
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
        shell. It focuses on active execution instances only, then routes deeper into run-specific monitoring without
        exposing question content.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/assignments/create">
          Create Assignment
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/assignments/list">
          Assignment List
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/assignments/history">
          Assignment History
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/assignments/bulk">
          Bulk Operations
        </NavLink>
      </p>

      <div className="admin-risk-summary-card">
        <h4>Live Monitor Scope</h4>
        <p>
          This landing workspace lists only active runs, surfaces summary-safe live execution health, and pushes run
          detail into dedicated <code>/admin/assignments/live/:runId</code> pages.
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
          <p>Run completion and recipient-in-flight visibility stay centralized here for currently active windows.</p>
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
          rows={LIVE_RUNS}
          rowKey={(row) => row.runId}
          emptyStateText="No active runs are currently available."
        />
      </section>
    </section>
  );
}

export default AdminAssignmentsLivePage;
