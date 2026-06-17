import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  type DashboardDataset,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type RunAnalyticsRecord,
  type StudentAnalyticsRecord,
} from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";

type ExecutionMode = "Operational" | "Controlled" | "Focused" | "Hard";
type RunStatus = "Live";

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
  originalEndWindowIso: string;
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

function createRelativeIso(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

const LIVE_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    batchName: "Batch-C",
    mode: "Controlled",
    batchIds: ["batch-c"],
    recipientCount: 3,
    startedAtIso: createRelativeIso(-42),
    originalEndWindowIso: createRelativeIso(128),
    endWindowIso: createRelativeIso(128),
    timezone: "Asia/Kolkata",
    gracePeriodMinutes: 15,
    shuffleEnabled: true,
    status: "Live",
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

function formatCountdownFromMs(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

function toExecutionMode(mode: string): ExecutionMode {
  if (mode === "Operational" || mode === "Controlled" || mode === "Focused" || mode === "Hard") {
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
  const fallbackOriginalEndWindow =
    fallback?.originalEndWindowIso ??
    new Date(Date.parse(record.startedAt) + 3 * 60 * 60 * 1000).toISOString();
  const fallbackEndWindow = fallback?.endWindowIso ?? fallbackOriginalEndWindow;
  const endWindowIso =
    Date.parse(fallbackEndWindow) <= Date.now() ?
      new Date(Date.now() + 45 * 60 * 1000).toISOString() :
      fallbackEndWindow;
  return {
    runId: record.runId,
    runName: record.runName,
    batchName: record.batchName,
    mode: toExecutionMode(record.mode),
    batchIds: fallback?.batchIds ?? [record.batchId],
    recipientCount: record.participants,
    startedAtIso: record.startedAt,
    originalEndWindowIso: fallbackOriginalEndWindow,
    endWindowIso,
    timezone: fallback?.timezone ?? "Asia/Kolkata",
    gracePeriodMinutes: fallback?.gracePeriodMinutes ?? 0,
    shuffleEnabled: fallback?.shuffleEnabled ?? false,
    status: "Live",
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

function phaseFromProgress(progressPercent: number): LiveMonitorStudentSnapshot["currentPhase"] {
  if (progressPercent >= 67) {
    return "P3";
  }
  if (progressPercent >= 34) {
    return "P2";
  }
  return "P1";
}

function buildLiveMonitorRow(
  student: StudentAnalyticsRecord,
  runSummary: StudentAnalyticsRecord["runSummaries"][number],
  run: RunAnalyticsRecord,
  index: number,
): LiveMonitorStudentSnapshot {
  const progressPercent = clampPercent(
    (run.completionRatePercent * 0.55) + (runSummary.phaseAdherencePercent * 0.25) + (runSummary.accuracyPercent * 0.2) - index * 4,
  );
  const timeRemainingMinutes = clampNonNegative(
    ((100 - progressPercent) * 1.2) + ((100 - runSummary.phaseAdherencePercent) * 0.15) + (index % 3) * 3,
  );
  const pacingDriftFlag =
    runSummary.phaseAdherencePercent < run.avgPhaseAdherencePercent ||
    runSummary.overstayPercent >= 14;
  const skipBurstFlag =
    runSummary.easyNeglectPercent > run.easyNeglectPercent ||
    runSummary.topicWeaknessScore >= 36;
  const rapidGuessFlag =
    runSummary.guessRatePercent > run.guessRatePercent ||
    runSummary.riskState === "high" ||
    runSummary.riskState === "critical";
  const minTimeViolationsLive = clampNonNegative(
    Math.max(0, runSummary.overstayPercent - 8) / 6,
  );
  const maxTimeViolationsLive = clampNonNegative(
    (run.mode === "Hard" ? runSummary.hardBiasPercent : runSummary.overstayPercent - 18) / 12,
  );
  const consecutiveWrongIndicator = clampNonNegative(
    (runSummary.topicWeaknessScore / 18) + (runSummary.riskState === "critical" ? 2 : runSummary.riskState === "high" ? 1 : 0),
  );
  const provisionalRiskScore = clampPercent(
    (runSummary.guessRatePercent * 0.35) +
      ((100 - runSummary.disciplineIndex) * 0.35) +
      (runSummary.overstayPercent * 0.2) +
      (runSummary.topicWeaknessScore * 0.1),
  );
  const controlledCompliancePercent = clampPercent(
    run.mode === "Controlled" || run.mode === "Hard" ?
      runSummary.phaseAdherencePercent - runSummary.controlledModeDelta + 8 :
      runSummary.phaseAdherencePercent,
  );

  return {
    runId: run.runId,
    studentId: student.studentId,
    studentName: student.studentName,
    progressPercent,
    timeRemainingMinutes,
    submissionStatus: progressPercent >= 95 ? "submitted" : "in_progress",
    currentPhase: phaseFromProgress(progressPercent),
    pacingDriftFlag,
    skipBurstFlag,
    rapidGuessFlag,
    minTimeViolationsLive,
    maxTimeViolationsLive,
    consecutiveWrongIndicator,
    provisionalRiskScore,
    controlledCompliancePercent,
  };
}

function buildLiveMonitorRows(dataset: DashboardDataset): LiveMonitorStudentSnapshot[] {
  return dataset.runAnalytics.flatMap((run) => {
    const matchingStudents = dataset.studentAnalytics
      .map((student) => ({
        student,
        runSummary: student.runSummaries.find((summary) => summary.runId === run.runId) ?? null,
      }))
      .filter(
        (
          entry,
        ): entry is {
          student: StudentAnalyticsRecord;
          runSummary: StudentAnalyticsRecord["runSummaries"][number];
        } => Boolean(entry.runSummary),
      )
      .sort((left, right) => {
        if (left.student.batchId !== right.student.batchId) {
          return left.student.batchId === run.batchId ? -1 : 1;
        }
        return right.runSummary.guessRatePercent - left.runSummary.guessRatePercent;
      })
      .slice(0, Math.max(1, Math.min(run.participants, 12)));

    return matchingStudents.map(({ student, runSummary }, index) =>
      buildLiveMonitorRow(student, runSummary, run, index),
    );
  });
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

function formatLiveFlag(isActive: boolean): string {
  return isActive ? "Flagged" : "Clear";
}

function AdminAssignmentLiveRunPage() {
  const params = useParams<{ runId?: string }>();
  const [runs, setRuns] = useState<RunStatusRecord[]>(LIVE_RUNS);
  const [liveRows, setLiveRows] = useState<LiveMonitorStudentSnapshot[]>(LIVE_MONITOR_ROWS);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [extensionPreset, setExtensionPreset] = useState<"5" | "10" | "15" | "30" | "custom">("15");
  const [customExtensionMinutes, setCustomExtensionMinutes] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadRunDetail() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setRuns(LIVE_RUNS);
        setLiveRows(LIVE_MONITOR_ROWS);
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
        const nextLiveRows = buildLiveMonitorRows(dataset);
        setRuns(nextRuns.length > 0 ? nextRuns : LIVE_RUNS);
        setLiveRows(nextLiveRows.length > 0 ? nextLiveRows : LIVE_MONITOR_ROWS);
        setInlineMessage(
          "Live mode enabled: focused run summary and per-student live flags hydrated from GET /admin/analytics with deterministic fallback coverage.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load focused live run data.";
        setRuns(LIVE_RUNS);
        setLiveRows(LIVE_MONITOR_ROWS);
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
    () => liveRows.filter((row) => row.runId === selectedRun?.runId),
    [liveRows, selectedRun],
  );

  const countdownLabel = useMemo(() => {
    if (!selectedRun) {
      return "--:--:--";
    }

    const remainingMs = Math.max(0, Date.parse(selectedRun.endWindowIso) - currentTime);
    return formatCountdownFromMs(remainingMs);
  }, [currentTime, selectedRun]);

  const extensionMinutes = useMemo(() => {
    if (extensionPreset === "custom") {
      const parsed = Number(customExtensionMinutes);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
    }

    return Number(extensionPreset);
  }, [customExtensionMinutes, extensionPreset]);

  const previewEndWindowIso = useMemo(() => {
    if (!selectedRun || extensionMinutes === null) {
      return selectedRun?.endWindowIso ?? null;
    }

    return new Date(Date.parse(selectedRun.endWindowIso) + extensionMinutes * 60 * 1000).toISOString();
  }, [extensionMinutes, selectedRun]);

  const previewCountdownLabel = useMemo(() => {
    if (!previewEndWindowIso) {
      return "--:--:--";
    }

    return formatCountdownFromMs(Math.max(0, Date.parse(previewEndWindowIso) - currentTime));
  }, [currentTime, previewEndWindowIso]);

  function extendWindow() {
    if (!selectedRun || extensionMinutes === null) {
      setInlineMessage("Enter a valid extension time before applying the new window.");
      return;
    }

    setRuns((currentRuns) =>
      currentRuns.map((run) =>
        run.runId === selectedRun.runId ?
          {
            ...run,
            endWindowIso: new Date(Date.parse(run.endWindowIso) + extensionMinutes * 60 * 1000).toISOString(),
          } :
          run,
      ),
    );
    setInlineMessage(`Time window extended by ${extensionMinutes} minutes for ${selectedRun.runId}.`);
    if (extensionPreset === "custom") {
      setCustomExtensionMinutes("");
    }
  }

  const liveSummaryLabel = useMemo(() => {
    if (selectedRun.runAnalyticsSnapshot.avgPhaseAdherencePercent >= 75 && selectedRun.runAnalyticsSnapshot.guessRatePercent <= 12) {
      return "Steady live run with healthy pacing";
    }
    if (selectedRun.runAnalyticsSnapshot.avgPhaseAdherencePercent >= 65) {
      return "Live run is progressing with some pacing drift";
    }
    return "Teacher attention recommended for this live run";
  }, [selectedRun]);

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
        header: "Current Phase",
        render: (row) => row.currentPhase,
      },
      {
        id: "status",
        header: "Submission",
        render: (row) => row.submissionStatus,
      },
      {
        id: "l1BehavioralFlags",
        header: "L1 Behavioral Flags",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <span>Pacing drift: <strong>{formatLiveFlag(row.pacingDriftFlag)}</strong></span>
            <span>Skip burst: <strong>{formatLiveFlag(row.skipBurstFlag)}</strong></span>
            <span>Rapid guess: <strong>{formatLiveFlag(row.rapidGuessFlag)}</strong></span>
            <small>Derived from refreshed session snapshot.</small>
          </div>
        ),
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
        id: "l2ExecutionCounters",
        header: "L2 Execution Counters",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <span>Min time: <strong>{row.minTimeViolationsLive}</strong></span>
            <span>Max time: <strong>{row.maxTimeViolationsLive}</strong></span>
            <span>Consecutive wrong: <strong>{row.consecutiveWrongIndicator}</strong></span>
            <span>Provisional risk: <strong>{row.provisionalRiskScore}</strong></span>
            <span>Controlled compliance: <strong>{row.controlledCompliancePercent}%</strong></span>
          </div>
        ),
      },
    ],
    [],
  );

  if (!selectedRun) {
    return null;
  }

  return (
    <section className="admin-content-card admin-assignments-live-drilldown-shell" aria-labelledby="admin-assignment-live-run-title">
      <p className="admin-content-eyebrow">Assignment Live Run Workspace</p>
      <h2 id="admin-assignment-live-run-title">Live Assignment Monitor</h2>
      <p className="admin-content-copy">
        This page helps a teacher supervise one live assignment, check overall progress quickly, and extend the time window when needed.
      </p>

      <AssignmentsWorkspaceNav />

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {isLoading ? (
        <p className="admin-assignments-inline-note">Loading focused run summary from GET /admin/analytics...</p>
      ) : null}

      <section className="admin-assignments-live-hero">
        <div className="admin-assignments-live-hero-copy">
          <h3>{selectedRun.runName}</h3>
          <p>{selectedRun.batchName} · {selectedRun.mode} · {selectedRun.status}</p>
          <small>{liveSummaryLabel}</small>
        </div>
        <div className="admin-assignments-live-hero-side">
          <div className="admin-assignments-detail-actions">
            <NavLink className="admin-primary-link" to="/admin/assignments/list">Back to List</NavLink>
          </div>
          <div className="admin-assignments-live-hero-timer">
            <span>Time Left</span>
            <strong>{countdownLabel}</strong>
            <small>Countdown to the current assignment close time</small>
          </div>
        </div>
      </section>

      <div className="admin-assignments-live-summary-grid">
        <article className="admin-assignments-detail-card">
          <span>Students In Run</span>
          <strong>{selectedRun.recipientCount}</strong>
          <small>Assigned students currently counted in this live run</small>
        </article>
        <article className="admin-assignments-detail-card">
          <span>Completion So Far</span>
          <strong>{selectedRun.completionPercent}%</strong>
          <small>Live completion across the assigned students</small>
        </article>
        <article className="admin-assignments-detail-card">
          <span>Avg Raw %</span>
          <strong>{selectedRun.runAnalyticsSnapshot.avgRawScorePercent}%</strong>
          <small>Latest run summary available to the teacher</small>
        </article>
        <article className="admin-assignments-detail-card">
          <span>Avg Accuracy %</span>
          <strong>{selectedRun.runAnalyticsSnapshot.avgAccuracyPercent}%</strong>
          <small>Latest run summary available to the teacher</small>
        </article>
      </div>

      <div className="admin-assignments-live-layout">
        <section className="admin-assignments-detail-panel">
          <h3>Live Snapshot</h3>
          <p>The key live timing and teaching signals are grouped here for quick supervision.</p>
          <div className="admin-assignments-detail-summary">
            <div>
              <span>Started</span>
              <strong>{formatDateTime(selectedRun.startedAtIso)}</strong>
            </div>
            <div>
              <span>Current End Time</span>
              <strong>{formatDateTime(selectedRun.endWindowIso)}</strong>
            </div>
            <div>
              <span>Batch</span>
              <strong>{selectedRun.batchName}</strong>
            </div>
            <div>
              <span>Timezone</span>
              <strong>{selectedRun.timezone}</strong>
            </div>
            <div>
              <span>Phase Adherence</span>
              <strong>{selectedRun.runAnalyticsSnapshot.avgPhaseAdherencePercent}%</strong>
            </div>
            <div>
              <span>Discipline</span>
              <strong>{selectedRun.runAnalyticsSnapshot.avgDisciplineIndex}</strong>
            </div>
            <div>
              <span>Guess Rate</span>
              <strong>{selectedRun.runAnalyticsSnapshot.guessRatePercent}%</strong>
            </div>
            <div>
              <span>Risk Mix</span>
              <strong>{selectedRun.runAnalyticsSnapshot.riskDistributionSummary}</strong>
            </div>
          </div>
        </section>

        <section className="admin-assignments-detail-panel admin-assignments-live-window-panel">
          <h3>Extend Time Window</h3>
          <p>Give extra time to the students already inside this live assignment by previewing the revised close time before applying it.</p>
          <div className="admin-assignments-detail-summary admin-assignments-live-window-summary">
            <div>
              <span>Original End Time</span>
              <strong>{formatDateTime(selectedRun.originalEndWindowIso)}</strong>
            </div>
            <div>
              <span>Current End Time</span>
              <strong>{formatDateTime(selectedRun.endWindowIso)}</strong>
            </div>
            <div>
              <span>Preview New End Time</span>
              <strong>{previewEndWindowIso ? formatDateTime(previewEndWindowIso) : "--"}</strong>
            </div>
            <div>
              <span>Time Left After Change</span>
              <strong>{previewCountdownLabel}</strong>
            </div>
          </div>
          <div className="admin-assignments-live-extension-row">
            {(["5", "10", "15", "30", "custom"] as const).map((option) => (
              <label key={option} className="admin-assignments-mode-option">
                <input
                  type="radio"
                  name="live-extension-minutes"
                  value={option}
                  checked={extensionPreset === option}
                  onChange={() => setExtensionPreset(option)}
                />
                <span>{option === "custom" ? "Custom" : `${option} min`}</span>
              </label>
            ))}
          </div>
          {extensionPreset === "custom" ? (
            <div className="admin-assignments-live-extension-custom">
              <label>
                Custom Minutes
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={customExtensionMinutes}
                  onChange={(event) => setCustomExtensionMinutes(event.target.value)}
                  placeholder="Enter custom minutes"
                />
              </label>
            </div>
          ) : null}
          <div className="admin-tests-row-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={extendWindow} disabled={extensionMinutes === null}>
              Apply Time Extension
            </button>
          </div>
          <small>Grace period stays at {selectedRun.gracePeriodMinutes} minutes, and the teacher countdown refreshes as soon as the new time is applied.</small>
        </section>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-assignment-live-run-table-title">
        <h3 id="admin-assignment-live-run-table-title">Student Live Monitor</h3>
        <UiTable
          caption={`Live monitor for ${selectedRun.runId}`}
          columns={liveColumns}
          rows={studentRows}
          rowKey={(row) => `${row.runId}-${row.studentId}`}
          emptyStateText="No live student rows are available for this run yet."
        />
      </section>
    </section>
  );
}

export default AdminAssignmentLiveRunPage;
