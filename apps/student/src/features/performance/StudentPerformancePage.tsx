import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  UiChartContainer,
  UiStatCard,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  ApiClientError,
  STUDENT_PERFORMANCE_FALLBACK_DATASET,
  fetchStudentPerformanceDataset,
  shouldUseLiveApi,
  type StudentPerformanceDataset,
  type StudentPerformancePoint,
  type TopicPerformanceEntry,
} from "./studentPerformanceDataset";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "N/A";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function decodeLicenseLayerFromToken(idToken: string | null): LicenseLayer | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = JSON.parse(atob(paddedPayload)) as Record<string, unknown>;
    const candidate = typeof payload.licenseLayer === "string" ? payload.licenseLayer.trim().toUpperCase() : "";

    if (candidate === "L0" || candidate === "L1" || candidate === "L2" || candidate === "L3") {
      return candidate;
    }
  } catch {
    return null;
  }

  return null;
}

function toTrendPoints(
  timeline: StudentPerformancePoint[],
  selector: (entry: StudentPerformancePoint) => number,
): UiChartPoint[] {
  return timeline.map((entry) => ({
    label: formatDate(entry.completedAt),
    value: Math.round(selector(entry)),
  }));
}

function StudentPerformancePage() {
  const { session } = useAuthProvider();
  const [dataset, setDataset] = useState<StudentPerformanceDataset>(STUDENT_PERFORMANCE_FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPerformance() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic Build 129 performance fixtures from studentYearMetrics-style summary trends.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchStudentPerformanceDataset(10);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: performance analytics hydrated from GET /student/performance.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student performance analytics.";
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 129 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPerformance();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeLicenseLayer = useMemo<LicenseLayer>(() => {
    const tokenLayer = decodeLicenseLayerFromToken(session.idToken);
    const resolvedLayer = tokenLayer ?? dataset.licenseLayer;
    return LICENSE_LAYER_ORDER[resolvedLayer] > LICENSE_LAYER_ORDER.L2 ? "L2" : resolvedLayer;
  }, [dataset.licenseLayer, session.idToken]);

  const isL1Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const timeline = dataset.timeline;
  const latestSnapshot = timeline[timeline.length - 1] ?? STUDENT_PERFORMANCE_FALLBACK_DATASET.timeline.at(-1);

  const rawTrend = useMemo(() => toTrendPoints(timeline, (entry) => entry.rawScorePercent), [timeline]);
  const accuracyTrend = useMemo(() => toTrendPoints(timeline, (entry) => entry.accuracyPercent), [timeline]);
  const phaseTrend = useMemo(() => toTrendPoints(timeline, (entry) => entry.phaseAdherencePercent), [timeline]);
  const guessTrend = useMemo(() => toTrendPoints(timeline, (entry) => entry.guessRatePercent), [timeline]);
  const disciplineTrend = useMemo(() => toTrendPoints(timeline, (entry) => entry.disciplineIndex), [timeline]);
  const minViolationTrend = useMemo(
    () => toTrendPoints(timeline, (entry) => entry.minTimeViolationPercent),
    [timeline],
  );
  const maxViolationTrend = useMemo(
    () => toTrendPoints(timeline, (entry) => entry.maxTimeViolationPercent),
    [timeline],
  );

  const latestSummaryCards = useMemo(() => {
    return [
      {
        label: "Latest Raw Score %",
        value: latestSnapshot ? formatPercent(latestSnapshot.rawScorePercent) : "-",
        helper: "studentYearMetrics.rawScorePercent",
      },
      {
        label: "Latest Accuracy %",
        value: latestSnapshot ? formatPercent(latestSnapshot.accuracyPercent) : "-",
        helper: "studentYearMetrics.accuracyPercent",
      },
      {
        label: "Latest Time Spent",
        value: latestSnapshot ? `${Math.round(latestSnapshot.timeSpentMinutes)} min` : "-",
        helper: "run summary",
      },
      {
        label: "Latest Rank",
        value: latestSnapshot?.rankInBatch !== null && latestSnapshot?.rankInBatch !== undefined ? `#${latestSnapshot.rankInBatch}` : "N/A",
        helper: "batch rank",
      },
    ];
  }, [latestSnapshot]);

  const timelineColumns = useMemo<UiTableColumn<StudentPerformancePoint>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        render: (row) => (
          <div className="student-performance-run-cell">
            <strong>{row.runLabel}</strong>
            <small>{row.runId}</small>
          </div>
        ),
      },
      {
        id: "completedAt",
        header: "Completed",
        render: (row) => formatDate(row.completedAt),
      },
      {
        id: "raw",
        header: "Raw %",
        render: (row) => formatPercent(row.rawScorePercent),
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (row) => formatPercent(row.accuracyPercent),
      },
      {
        id: "time",
        header: "Time Spent",
        render: (row) => `${Math.round(row.timeSpentMinutes)} min`,
      },
      {
        id: "rank",
        header: "Rank",
        render: (row) => (row.rankInBatch === null ? "N/A" : `#${Math.round(row.rankInBatch)}`),
      },
    ],
    [],
  );

  const topicColumns = useMemo<UiTableColumn<TopicPerformanceEntry>[]>(
    () => [
      {
        id: "topic",
        header: "Topic",
        render: (row) => row.topic,
      },
      {
        id: "raw",
        header: "Raw %",
        render: (row) => formatPercent(row.rawScorePercent),
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (row) => formatPercent(row.accuracyPercent),
      },
    ],
    [],
  );

  return (
    <section className="student-content-card student-performance-page" aria-labelledby="student-performance-title">
      <p className="student-content-eyebrow">Build 129</p>
      <h2 id="student-performance-title">Student Performance Analytics</h2>
      <p className="student-content-copy">
        Visualize longitudinal Raw % and Accuracy % growth across runs while tracking execution discipline from
        studentYearMetrics summary data only.
      </p>
      <p className="student-dashboard-layer-badge">License Layer: {activeLicenseLayer}</p>

      {inlineMessage ? <p className="student-performance-inline-note">{inlineMessage}</p> : null}

      <div className="student-performance-kpi-grid">
        {latestSummaryCards.map((card) => (
          <UiStatCard
            key={card.label}
            title={card.label}
            value={isLoading ? "Loading..." : card.value}
            helper={card.helper}
          />
        ))}
      </div>

      <div className="student-performance-chart-grid">
        <UiChartContainer
          title="Raw % Trend"
          subtitle="Longitudinal score trend"
          variant="line"
          data={rawTrend}
          maxValue={100}
        />
        <UiChartContainer
          title="Accuracy % Trend"
          subtitle="Longitudinal accuracy trend"
          variant="line"
          data={accuracyTrend}
          maxValue={100}
        />
      </div>

      {isL1Plus ? (
        <>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="Phase Adherence Trend"
              subtitle="Layer L1 pacing consistency"
              variant="line"
              data={phaseTrend}
              maxValue={100}
            />
            <UiChartContainer
              title="Guess Rate Trend"
              subtitle="Layer L1 guess behavior"
              variant="line"
              data={guessTrend}
              maxValue={100}
            />
          </div>

          <div className="student-performance-l1-grid">
            <UiStatCard
              title="Easy Neglect Frequency"
              value={formatPercent(dataset.easyNeglectFrequencyPercent)}
              helper="L1 behavior indicator"
            />
            <UiStatCard
              title="Hard Bias Frequency"
              value={formatPercent(dataset.hardBiasFrequencyPercent)}
              helper="L1 behavior indicator"
            />
            <UiStatCard
              title="Time Allocation Balance"
              value={formatPercent(dataset.timeAllocationBalancePercent)}
              helper="L1 pacing indicator"
            />
          </div>

          <UiTable
            caption="Topic Performance Breakdown"
            columns={topicColumns}
            rows={dataset.topicPerformanceBreakdown}
            rowKey={(row) => row.topic}
            emptyStateText="No topic-level summary available."
          />
        </>
      ) : null}

      {isL2Plus ? (
        <>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="Discipline Index Trend"
              subtitle="Layer L2 execution maturity"
              variant="line"
              data={disciplineTrend}
              maxValue={100}
            />
            <UiChartContainer
              title="MinTime Violation % Trend"
              subtitle="Layer-aware timing compliance"
              variant="line"
              data={minViolationTrend}
              maxValue={100}
            />
          </div>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="MaxTime Violation % Trend"
              subtitle="Hard-mode overstay behavior"
              variant="line"
              data={maxViolationTrend}
              maxValue={100}
            />
          </div>

          <section className="student-performance-discipline-section" aria-label="Discipline progress overview">
            <h3>Discipline Overview</h3>
            <div className="student-performance-progress-grid">
              <article className="student-performance-progress-card">
                <header>
                  <strong>Discipline Index</strong>
                  <span>{formatPercent(dataset.disciplineIndex)}</span>
                </header>
                <div className="student-performance-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.round(dataset.disciplineIndex)}%` }} />
                </div>
              </article>

              <article className="student-performance-progress-card">
                <header>
                  <strong>Phase Compliance %</strong>
                  <span>{formatPercent(dataset.phaseCompliancePercent)}</span>
                </header>
                <div className="student-performance-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.round(dataset.phaseCompliancePercent)}%` }} />
                </div>
              </article>

              <article className="student-performance-progress-card">
                <header>
                  <strong>Controlled Mode Improvement %</strong>
                  <span>{formatPercent(dataset.controlledModeImprovementPercent)}</span>
                </header>
                <div className="student-performance-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, Math.round(dataset.controlledModeImprovementPercent + 50)))}%` }} />
                </div>
              </article>

              <article className="student-performance-progress-card">
                <header>
                  <strong>Overstay Frequency</strong>
                  <span>{formatPercent(dataset.overstayFrequencyPercent)}</span>
                </header>
                <div className="student-performance-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.round(dataset.overstayFrequencyPercent)}%` }} />
                </div>
              </article>
            </div>

            <p className="student-performance-cluster-pill">
              Guess Probability Cluster: <strong>{dataset.guessProbabilityCluster}</strong> ({formatPercent(dataset.guessProbabilityPercent)})
            </p>
          </section>
        </>
      ) : null}

      <UiTable
        caption="Performance Timeline Across Runs"
        columns={timelineColumns}
        rows={timeline}
        rowKey={(row) => row.runId}
        emptyStateText="No performance timeline available yet."
      />
    </section>
  );
}

export default StudentPerformancePage;
