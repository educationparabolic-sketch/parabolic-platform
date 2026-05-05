import { useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";

type ExecutionMode = "Operational" | "Diagnostic" | "Controlled" | "Hard";
type RunStatus = "scheduled" | "active" | "collecting" | "completed" | "archived" | "cancelled" | "terminated";

interface RunAnalyticsSnapshot {
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  riskDistributionSummary: string;
  avgDisciplineIndex: number;
  controlledCompliancePercent: number;
  guessRatePercent: number;
  executionStabilityBadge: string;
  overrideCount: number;
}

interface RunStatusRecord {
  runId: string;
  runName: string;
  templateName: string;
  mode: ExecutionMode;
  batchIds: string[];
  recipientStudentIds: string[];
  startWindowIso: string;
  endWindowIso: string;
  timezone: string;
  gracePeriodMinutes: number;
  shuffleEnabled: boolean;
  status: RunStatus;
  completionPercent: number;
  runAnalyticsSnapshot: RunAnalyticsSnapshot;
}

interface LiveMonitorStudentSnapshot {
  runId: string;
  studentId: string;
  studentName: string;
  progressPercent: number;
  timeRemainingMinutes: number;
  submissionStatus: "in_progress" | "submitted";
  currentPhase: "P1" | "P2" | "P3";
  pacingDriftFlag: boolean;
  skipBurstFlag: boolean;
  rapidGuessFlag: boolean;
  minTimeViolationsLive: number;
  maxTimeViolationsLive: number;
  consecutiveWrongIndicator: number;
  provisionalRiskScore: number;
  controlledCompliancePercent: number;
}

const LIVE_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    templateName: "NEET Revision - Biology Focus",
    mode: "Controlled",
    batchIds: ["batch-c"],
    recipientStudentIds: ["STU-021", "STU-022", "STU-023"],
    startWindowIso: "2026-04-16T04:00:00.000Z",
    endWindowIso: "2026-04-16T07:00:00.000Z",
    timezone: "Asia/Kolkata",
    gracePeriodMinutes: 15,
    shuffleEnabled: true,
    status: "active",
    completionPercent: 64,
    runAnalyticsSnapshot: {
      avgRawScorePercent: 63,
      avgAccuracyPercent: 68,
      avgPhaseAdherencePercent: 71,
      easyNeglectPercent: 14,
      hardBiasPercent: 23,
      riskDistributionSummary: "L 34% / M 40% / H 20% / C 6%",
      avgDisciplineIndex: 66,
      controlledCompliancePercent: 87,
      guessRatePercent: 12,
      executionStabilityBadge: "Drift",
      overrideCount: 1,
    },
  },
];

const LIVE_MONITOR_ROWS: LiveMonitorStudentSnapshot[] = [
  {
    runId: "run-2026-0416-003",
    studentId: "STU-021",
    studentName: "Priya Menon",
    progressPercent: 58,
    timeRemainingMinutes: 44,
    submissionStatus: "in_progress",
    currentPhase: "P2",
    pacingDriftFlag: false,
    skipBurstFlag: false,
    rapidGuessFlag: false,
    minTimeViolationsLive: 0,
    maxTimeViolationsLive: 0,
    consecutiveWrongIndicator: 1,
    provisionalRiskScore: 34,
    controlledCompliancePercent: 91,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-022",
    studentName: "Arjun Das",
    progressPercent: 49,
    timeRemainingMinutes: 48,
    submissionStatus: "in_progress",
    currentPhase: "P2",
    pacingDriftFlag: true,
    skipBurstFlag: false,
    rapidGuessFlag: false,
    minTimeViolationsLive: 1,
    maxTimeViolationsLive: 0,
    consecutiveWrongIndicator: 2,
    provisionalRiskScore: 46,
    controlledCompliancePercent: 84,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-023",
    studentName: "Sara Khan",
    progressPercent: 71,
    timeRemainingMinutes: 31,
    submissionStatus: "in_progress",
    currentPhase: "P3",
    pacingDriftFlag: true,
    skipBurstFlag: true,
    rapidGuessFlag: true,
    minTimeViolationsLive: 3,
    maxTimeViolationsLive: 1,
    consecutiveWrongIndicator: 4,
    provisionalRiskScore: 73,
    controlledCompliancePercent: 64,
  },
];

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function classifyLiveRisk(snapshot: LiveMonitorStudentSnapshot): "Stable" | "Drift" | "HighRisk" {
  if (
    snapshot.rapidGuessFlag ||
    snapshot.skipBurstFlag ||
    snapshot.provisionalRiskScore >= 70 ||
    snapshot.maxTimeViolationsLive >= 2
  ) {
    return "HighRisk";
  }

  if (snapshot.pacingDriftFlag || snapshot.minTimeViolationsLive > 0 || snapshot.provisionalRiskScore >= 45) {
    return "Drift";
  }

  return "Stable";
}

function liveIndicatorClass(risk: "Stable" | "Drift" | "HighRisk"): string {
  if (risk === "HighRisk") {
    return "admin-live-indicator admin-live-indicator-highrisk";
  }
  if (risk === "Drift") {
    return "admin-live-indicator admin-live-indicator-drift";
  }
  return "admin-live-indicator admin-live-indicator-stable";
}

function AdminAssignmentLiveRunPage() {
  const params = useParams<{ runId?: string }>();

  const selectedRun = useMemo(() => {
    return LIVE_RUNS.find((run) => run.runId === params.runId) ?? LIVE_RUNS[0] ?? null;
  }, [params.runId]);

  const studentRows = useMemo(
    () => LIVE_MONITOR_ROWS.filter((row) => row.runId === selectedRun?.runId),
    [selectedRun],
  );

  const liveColumns = useMemo<UiTableColumn<LiveMonitorStudentSnapshot>[]>(
    () => [
      {
        id: "studentName",
        header: "Student",
        render: (row) => (
          <div className="admin-assignments-run-cell">
            <strong>{row.studentName}</strong>
            <small>{row.studentId}</small>
          </div>
        ),
      },
      {
        id: "progress",
        header: "Progress",
        render: (row) => `${row.progressPercent}%`,
      },
      {
        id: "timeRemaining",
        header: "Time Remaining",
        render: (row) => `${row.timeRemainingMinutes} min`,
      },
      {
        id: "phase",
        header: "Phase",
        render: (row) => row.currentPhase,
      },
      {
        id: "status",
        header: "Submission",
        render: (row) => row.submissionStatus,
      },
      {
        id: "risk",
        header: "Live Risk",
        render: (row) => {
          const risk = classifyLiveRisk(row);
          return <span className={liveIndicatorClass(risk)}>{risk}</span>;
        },
      },
      {
        id: "compliance",
        header: "Controlled Compliance",
        render: (row) => `${row.controlledCompliancePercent}%`,
      },
    ],
    [],
  );

  if (!selectedRun) {
    return null;
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-assignment-live-run-title">
      <p className="admin-content-eyebrow">Assignment Live Run Workspace</p>
      <h2 id="admin-assignment-live-run-title">Focused Live Monitor for a Single Run</h2>
      <p className="admin-content-copy">
        This dedicated route keeps <code>/admin/assignments/live/{`{runId}`}</code> separate from the broader live
        monitor listing. It focuses on one active execution instance with summary-safe live flags, progress state, and
        run-level compliance context.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/assignments/live">
          Live Monitor
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
        <h4>Focused Run</h4>
        <p>
          <strong>{selectedRun.runName}</strong> · {selectedRun.templateName} · {selectedRun.mode} · {selectedRun.status}
        </p>
        <small>Route: /admin/assignments/live/{selectedRun.runId}</small>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Recipients</p>
          <h3>{selectedRun.recipientStudentIds.length}</h3>
          <small>explicit recipient snapshot</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Completion</p>
          <h3>{selectedRun.completionPercent}%</h3>
          <small>live run completion</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Raw Score</p>
          <h3>{selectedRun.runAnalyticsSnapshot.avgRawScorePercent}%</h3>
          <small>runAnalytics summary</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Accuracy</p>
          <h3>{selectedRun.runAnalyticsSnapshot.avgAccuracyPercent}%</h3>
          <small>runAnalytics summary</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Window Snapshot</h4>
          <p>
            {formatDateTime(selectedRun.startWindowIso)} to {formatDateTime(selectedRun.endWindowIso)}
          </p>
          <small>{selectedRun.timezone} · grace {selectedRun.gracePeriodMinutes} min</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Execution Summary</h4>
          <p>
            Phase adherence {selectedRun.runAnalyticsSnapshot.avgPhaseAdherencePercent}% · discipline{" "}
            {selectedRun.runAnalyticsSnapshot.avgDisciplineIndex} · guess rate{" "}
            {selectedRun.runAnalyticsSnapshot.guessRatePercent}%
          </p>
          <small>{selectedRun.runAnalyticsSnapshot.riskDistributionSummary}</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Control Signals</h4>
          <p>
            Controlled compliance {selectedRun.runAnalyticsSnapshot.controlledCompliancePercent}% · override count{" "}
            {selectedRun.runAnalyticsSnapshot.overrideCount} · stability{" "}
            {selectedRun.runAnalyticsSnapshot.executionStabilityBadge}
          </p>
          <small>Dedicated live-run drill-down instead of shared monitor reuse.</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-assignment-live-run-table-title">
        <h3 id="admin-assignment-live-run-table-title">Per-Student Live Monitor</h3>
        <UiTable
          caption={`Live monitor for ${selectedRun.runId}`}
          columns={liveColumns}
          rows={studentRows}
          rowKey={(row) => `${row.runId}-${row.studentId}`}
          emptyStateText="No live student rows are available for this run."
        />
      </section>
    </section>
  );
}

export default AdminAssignmentLiveRunPage;
