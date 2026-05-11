import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type RunAnalyticsRecord,
} from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";

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
  batchName: string;
  mode: ExecutionMode;
  batchIds: string[];
  recipientCount: number;
  startedAtIso: string;
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
    batchName: "Batch-C",
    mode: "Controlled",
    batchIds: ["batch-c"],
    recipientCount: 3,
    startedAtIso: "2026-04-16T04:00:00.000Z",
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

function toExecutionMode(mode: string): ExecutionMode {
  if (mode === "Operational" || mode === "Diagnostic" || mode === "Controlled" || mode === "Hard") {
    return mode;
  }

  return "Operational";
}

function toRiskDistributionSummary(record: RunAnalyticsRecord): string {
  const low = record.riskDistribution.low ?? 0;
  const medium = record.riskDistribution.medium ?? 0;
  const high = record.riskDistribution.high ?? 0;
  const critical = record.riskDistribution.critical ?? 0;
  return `L ${low}% / M ${medium}% / H ${high}% / C ${critical}%`;
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

function buildRunRecord(record: RunAnalyticsRecord, fallback?: RunStatusRecord): RunStatusRecord {
  return {
    runId: record.runId,
    runName: record.runName,
    batchName: record.batchName,
    mode: toExecutionMode(record.mode),
    batchIds: fallback?.batchIds ?? [record.batchId],
    recipientCount: record.participants,
    startedAtIso: record.startedAt,
    timezone: fallback?.timezone ?? "Asia/Kolkata",
    gracePeriodMinutes: fallback?.gracePeriodMinutes ?? 0,
    shuffleEnabled: fallback?.shuffleEnabled ?? false,
    status: fallback?.status ?? "active",
    completionPercent: Math.round(record.completionRatePercent),
    runAnalyticsSnapshot: {
      avgRawScorePercent: Math.round(record.avgRawScorePercent),
      avgAccuracyPercent: Math.round(record.avgAccuracyPercent),
      avgPhaseAdherencePercent: Math.round(record.avgPhaseAdherencePercent),
      easyNeglectPercent: Math.round(record.easyNeglectPercent),
      hardBiasPercent: Math.round(record.hardBiasPercent),
      riskDistributionSummary: toRiskDistributionSummary(record),
      avgDisciplineIndex: Math.round(record.disciplineIndexAverage),
      controlledCompliancePercent: Math.round(record.controlledCompliancePercent),
      guessRatePercent: Math.round(record.guessRatePercent),
      executionStabilityBadge: toStabilityBadge(record),
      overrideCount: Math.round(record.structuralOverridePercent),
    },
  };
}

function buildLiveRunRecords(runAnalytics: RunAnalyticsRecord[]): RunStatusRecord[] {
  const fallbackById = new Map(LIVE_RUNS.map((run) => [run.runId, run]));

  return [...runAnalytics]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .map((record) => buildRunRecord(record, fallbackById.get(record.runId)));
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
  const [runs, setRuns] = useState<RunStatusRecord[]>(LIVE_RUNS);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRunDetail() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setRuns(LIVE_RUNS);
        setInlineMessage(
          "Local mode detected. Loaded deterministic focused-run fixtures; per-student live flags stay local in this mode.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const dataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        const nextRuns = buildLiveRunRecords(dataset.runAnalytics);
        setRuns(nextRuns.length > 0 ? nextRuns : LIVE_RUNS);
        setInlineMessage(
          "Live mode enabled: focused run summary hydrated from GET /admin/analytics. Per-student live flags remain deterministic fallback data.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load focused live run data.";
        setRuns(LIVE_RUNS);
        setInlineMessage(`${reason} Falling back to deterministic focused-run fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRunDetail();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedRun = useMemo(() => {
    return runs.find((run) => run.runId === params.runId) ?? runs[0] ?? null;
  }, [params.runId, runs]);

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

      <AssignmentsWorkspaceNav />

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {isLoading ? (
        <p className="admin-assignments-inline-note">Loading focused run summary from GET /admin/analytics...</p>
      ) : null}

      <div className="admin-risk-summary-card">
        <h4>Focused Run</h4>
        <p>
          <strong>{selectedRun.runName}</strong> · {selectedRun.batchName} · {selectedRun.mode} · {selectedRun.status}
        </p>
        <small>Route: /admin/assignments/live/{selectedRun.runId}</small>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Participants</p>
          <h3>{selectedRun.recipientCount}</h3>
          <small>runAnalytics participant total</small>
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
          <h4>Run Snapshot</h4>
          <p>
            Started {formatDateTime(selectedRun.startedAtIso)}
          </p>
          <small>
            {selectedRun.batchName} · {selectedRun.timezone} · grace {selectedRun.gracePeriodMinutes} min
          </small>
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
          emptyStateText="No deterministic live student rows are available for this run yet."
        />
      </section>
    </section>
  );
}

export default AdminAssignmentLiveRunPage;
