import { useEffect, useMemo, useState } from "react";
import { useGlobalPortalState } from "../../../../../shared/services/globalPortalState";
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
  type ControlledModeComparison,
  type StudentPerformanceDataset,
  type StudentPerformancePoint,
} from "./studentPerformanceDataset";
import {
  STUDENT_INSIGHTS_FALLBACK_DATASET,
  fetchStudentInsightsDataset,
  type TopicWeaknessInsight,
} from "../insights/studentInsightsDataset";
import { isStudentDebugMode } from "../../services/studentDebugMode";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

const RECENT_HISTORY_PAGE_SIZE = 5;

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDelta(value: number, invert = false): string {
  const rounded = Math.round(value);
  const effective = invert ? -rounded : rounded;
  const prefix = rounded > 0 ? "+" : "";
  const suffix = effective >= 0 ? " improved" : " watch";
  return `${prefix}${rounded}%${suffix}`;
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

function toTrendPoints(
  timeline: StudentPerformancePoint[],
  selector: (entry: StudentPerformancePoint) => number,
): UiChartPoint[] {
  return timeline.map((entry) => ({
    label: formatDate(entry.completedAt),
    value: Math.round(selector(entry)),
  }));
}

function controlledComparisonTone(value: number, invert = false): string {
  const effective = invert ? -value : value;
  if (effective > 0) {
    return "student-performance-controlled-value student-performance-controlled-value-positive";
  }

  if (effective < 0) {
    return "student-performance-controlled-value student-performance-controlled-value-watch";
  }

  return "student-performance-controlled-value";
}

function formatWeaknessPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function behaviorLabelForRun(entry: StudentPerformancePoint): string {
  if (entry.phaseAdherencePercent < 65) {
    return "Late-phase drift";
  }

  if (entry.guessRatePercent >= 25) {
    return "Rushed pattern";
  }

  if (entry.timeAllocationBalancePercent < 65) {
    return "Pacing imbalance";
  }

  return "Stable pacing";
}

function toDateInputEpoch(value: string, endOfDay = false): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function StudentPerformancePage() {
  const globalState = useGlobalPortalState();
  const debugMode = isStudentDebugMode();
  const [dataset, setDataset] = useState<StudentPerformanceDataset>(STUDENT_PERFORMANCE_FALLBACK_DATASET);
  const [topicWeaknessRows, setTopicWeaknessRows] = useState<TopicWeaknessInsight[]>(
    STUDENT_INSIGHTS_FALLBACK_DATASET.topicWeaknessSummary,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function loadPerformance() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setTopicWeaknessRows(STUDENT_INSIGHTS_FALLBACK_DATASET.topicWeaknessSummary);
        setInlineMessage(
          "Showing practice performance trends so you can explore this page.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const [apiDataset, apiInsightsDataset] = await Promise.all([
          fetchStudentPerformanceDataset(10),
          fetchStudentInsightsDataset(6),
        ]);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setTopicWeaknessRows(apiInsightsDataset.topicWeaknessSummary);
        setInlineMessage("Your performance trends are up to date.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student performance analytics.";
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setTopicWeaknessRows(STUDENT_INSIGHTS_FALLBACK_DATASET.topicWeaknessSummary);
        setInlineMessage(`${reason} Showing practice performance trends for now.`);
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
    const resolvedLayer = globalState.licenseLayer ?? dataset.licenseLayer;
    return LICENSE_LAYER_ORDER[resolvedLayer] > LICENSE_LAYER_ORDER.L2 ? "L2" : resolvedLayer;
  }, [dataset.licenseLayer, globalState.licenseLayer]);

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
  const timeAllocationTrend = useMemo(
    () => toTrendPoints(timeline, (entry) => entry.timeAllocationBalancePercent),
    [timeline],
  );
  const controlledComparison = dataset.controlledModeComparison;

  const latestSummaryCards = useMemo(() => {
    return [
      {
        label: "Raw Score %",
        value: latestSnapshot ? formatPercent(latestSnapshot.rawScorePercent) : "-",
        helper: "Latest completed test",
      },
      {
        label: "Accuracy %",
        value: latestSnapshot ? formatPercent(latestSnapshot.accuracyPercent) : "-",
        helper: "Latest completed test",
      },
      {
        label: "Time Spent",
        value: latestSnapshot ? `${Math.round(latestSnapshot.timeSpentMinutes)} min` : "-",
        helper: "Latest completed test",
      },
      {
        label: "Rank",
        value: latestSnapshot?.rankInBatch !== null && latestSnapshot?.rankInBatch !== undefined ? `#${latestSnapshot.rankInBatch}` : "N/A",
        helper: "Latest batch rank",
      },
    ];
  }, [latestSnapshot]);

  const l1SummaryCards = useMemo(() => {
    return [
      {
        label: "Phase Adherence",
        value: latestSnapshot ? formatPercent(latestSnapshot.phaseAdherencePercent) : "N/A",
        helper: "Latest L1 phase behavior",
      },
      {
        label: "Easy Neglect",
        value: formatPercent(dataset.easyNeglectFrequencyPercent),
        helper: "L1 behavior frequency",
      },
      {
        label: "Hard Bias",
        value: formatPercent(dataset.hardBiasFrequencyPercent),
        helper: "L1 behavior frequency",
      },
      {
        label: "Time Allocation Balance",
        value: formatPercent(dataset.timeAllocationBalancePercent),
        helper: "L1 pacing balance",
      },
    ];
  }, [dataset, latestSnapshot]);

  const l2SummaryCards = useMemo(() => {
    return [
      {
        label: "Discipline Index",
        value: formatPercent(dataset.disciplineIndex),
        helper: "L2 execution consistency",
      },
      {
        label: "Controlled Improvement",
        value: formatPercent(dataset.controlledModeImprovementPercent),
        helper: "L2 controlled-mode lift",
      },
      {
        label: "Overstay Frequency",
        value: formatPercent(dataset.overstayFrequencyPercent),
        helper: "L2 max-time pressure",
      },
      {
        label: "Guess Rate",
        value: formatPercent(dataset.guessProbabilityPercent),
        helper: `${dataset.guessProbabilityCluster} cluster`,
      },
    ];
  }, [dataset]);

  const controlledComparisonRows = useMemo(() => {
    const comparison: ControlledModeComparison = controlledComparison;
    return [
      {
        label: "Phase Adherence",
        delta: comparison.phaseAdherenceDeltaPercent,
        helper: "Higher adherence means steadier phase discipline.",
        invert: false,
      },
      {
        label: "Discipline Index",
        delta: comparison.disciplineIndexDeltaPercent,
        helper: "Higher discipline indicates stronger controlled execution.",
        invert: false,
      },
      {
        label: "MinTime Violations",
        delta: comparison.minTimeViolationDeltaPercent,
        helper: "Lower violation frequency is the desired direction.",
        invert: true,
      },
      {
        label: "MaxTime Violations",
        delta: comparison.maxTimeViolationDeltaPercent,
        helper: "Lower overstay frequency is the desired direction.",
        invert: true,
      },
      {
        label: "Guess Rate",
        delta: comparison.guessRateDeltaPercent,
        helper: "Lower guess rate means more deliberate attempts.",
        invert: true,
      },
    ];
  }, [controlledComparison]);

  const topicWeaknessColumns = useMemo<UiTableColumn<TopicWeaknessInsight>[]>(
    () => [
      {
        id: "topic",
        header: "Weak Topic",
        render: (row) => (
          <div className="student-insights-topic-cell">
            <strong>{row.topic}</strong>
            <small>{formatWeaknessPercent(row.weaknessPercent)} weakness marker</small>
          </div>
        ),
      },
    ],
    [],
  );

  const orderedTopicWeaknessRows = useMemo(
    () => [...topicWeaknessRows].sort((left, right) => right.weaknessPercent - left.weaknessPercent),
    [topicWeaknessRows],
  );

  const filteredTimeline = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase();
    const fromEpoch = toDateInputEpoch(historyFromDate);
    const toEpoch = toDateInputEpoch(historyToDate, true);

    return timeline.filter((entry) => {
      if (normalizedQuery && !entry.runLabel.toLowerCase().includes(normalizedQuery) && !entry.runId.toLowerCase().includes(normalizedQuery)) {
        return false;
      }

      const completedEpoch = Date.parse(entry.completedAt);
      if (!Number.isFinite(completedEpoch)) {
        return false;
      }

      if (fromEpoch !== null && completedEpoch < fromEpoch) {
        return false;
      }

      if (toEpoch !== null && completedEpoch > toEpoch) {
        return false;
      }

      return true;
    });
  }, [historyFromDate, historyQuery, historyToDate, timeline]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyFromDate, historyQuery, historyToDate]);

  const historyPageCount = Math.max(1, Math.ceil(filteredTimeline.length / RECENT_HISTORY_PAGE_SIZE));
  const normalizedHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedTimeline = useMemo(() => {
    const startIndex = (normalizedHistoryPage - 1) * RECENT_HISTORY_PAGE_SIZE;
    return filteredTimeline.slice(startIndex, startIndex + RECENT_HISTORY_PAGE_SIZE);
  }, [filteredTimeline, normalizedHistoryPage]);

  const historyColumns = useMemo<UiTableColumn<StudentPerformancePoint>[]>(() => {
    const columns: UiTableColumn<StudentPerformancePoint>[] = [
      {
        id: "run",
        header: "Test",
        render: (entry) => (
          <div className="student-performance-run-cell">
            <strong>{entry.runLabel}</strong>
            <small>{formatDate(entry.completedAt)}</small>
          </div>
        ),
      },
      {
        id: "raw",
        header: "Raw Score %",
        render: (entry) => formatPercent(entry.rawScorePercent),
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (entry) => formatPercent(entry.accuracyPercent),
      },
      {
        id: "time",
        header: "Time",
        render: (entry) => `${Math.round(entry.timeSpentMinutes)} min`,
      },
      {
        id: "rank",
        header: "Rank",
        render: (entry) => entry.rankInBatch === null ? "N/A" : `#${Math.round(entry.rankInBatch)}`,
      },
    ];

    if (isL1Plus) {
      columns.push({
        id: "l1",
        header: "L1 Signals",
        render: (entry) => (
          <div className="student-performance-table-signals">
            <strong>L1</strong>
            <span>Phase: {formatPercent(entry.phaseAdherencePercent)}</span>
            <span>Easy neglect: {formatPercent(dataset.easyNeglectFrequencyPercent)}</span>
            <span>Hard bias: {formatPercent(dataset.hardBiasFrequencyPercent)}</span>
            <span>Behavior: {behaviorLabelForRun(entry)}</span>
          </div>
        ),
      });
    }

    if (isL2Plus) {
      columns.push({
        id: "l2",
        header: "L2 Signals",
        render: (entry) => (
          <div className="student-performance-table-signals student-performance-table-signals-l2">
            <strong>L2</strong>
            <span>Risk: {entry.riskState}</span>
            <span>Discipline: {Math.round(entry.disciplineIndex)}</span>
            <span>Guess: {formatPercent(entry.guessRatePercent)}</span>
          </div>
        ),
      });
    }

    return columns;
  }, [dataset.easyNeglectFrequencyPercent, dataset.hardBiasFrequencyPercent, isL1Plus, isL2Plus]);

  return (
    <section className="student-content-card student-performance-page" aria-labelledby="student-performance-title">
      <h2 id="student-performance-title">Analytics</h2>
      {isLoading ? <p className="student-learning-state" role="status">Preparing your analytics...</p> : null}

      {debugMode && inlineMessage ? <p className="student-performance-inline-note">{inlineMessage}</p> : null}

      <section className="student-performance-layer-section" aria-labelledby="student-performance-l0-title">
        <div className="student-section-heading">
          <p className="student-dashboard-layer-badge">L0 Metrics</p>
          <h3 id="student-performance-l0-title">Academic Performance Snapshot</h3>
          <p>Raw Score %, Accuracy %, time, rank, trends, topic performance, and recent test history.</p>
        </div>
        <div className="student-performance-kpi-grid">
          {latestSummaryCards.map((card) => (
            <UiStatCard
              key={card.label}
              title={card.label}
              value={isLoading ? "..." : card.value}
              helper={card.helper}
            />
          ))}
        </div>
        <div className="student-performance-chart-grid">
          <UiChartContainer
            title="Raw Score % Trend"
            subtitle="Recent completed tests"
            variant="line"
            data={rawTrend}
            maxValue={100}
          />
          <UiChartContainer
            title="Accuracy % Trend"
            subtitle="Recent completed tests"
            variant="line"
            data={accuracyTrend}
            maxValue={100}
          />
        </div>
        <section className="student-section-group" aria-label="Topic performance">
          <div className="student-section-heading">
            <h3>Topic Performance</h3>
            <p>Subject-level Raw Score % and Accuracy %.</p>
          </div>
          <div className="student-topic-card-grid">
            {dataset.topicPerformanceBreakdown.length === 0 ? (
              <p className="student-empty-state">No topic performance details are available yet.</p>
            ) : null}
            {dataset.topicPerformanceBreakdown.map((topic) => (
              <article key={topic.topic} className="student-topic-card">
                <strong>{topic.topic}</strong>
                <span>{`${formatPercent(topic.rawScorePercent)} Raw Score %`}</span>
                <span>{`${formatPercent(topic.accuracyPercent)} Accuracy %`}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="student-section-group" aria-label="Recent performance history">
          <div className="student-section-heading">
            <h3>Recent Test History</h3>
            <p>Search completed tests and review layer-aware signals per run.</p>
          </div>
          <section className="student-performance-history-filters" aria-label="Recent test history filters">
            <label>
              Test Name
              <input
                type="search"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Search test history"
              />
            </label>
            <label>
              From Date
              <input
                type="date"
                value={historyFromDate}
                onChange={(event) => setHistoryFromDate(event.target.value)}
              />
            </label>
            <label>
              To Date
              <input
                type="date"
                value={historyToDate}
                onChange={(event) => setHistoryToDate(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setHistoryQuery("");
                setHistoryFromDate("");
                setHistoryToDate("");
                setHistoryPage(1);
              }}
              disabled={!historyQuery && !historyFromDate && !historyToDate}
            >
              Clear
            </button>
          </section>
          <div className="student-performance-history-table-card">
            <UiTable
              caption="Recent Test History"
              columns={historyColumns}
              rows={pagedTimeline}
              rowKey={(entry) => entry.runId}
              emptyStateText="No test history matched the selected filters."
            />
            <div className="student-performance-history-pagination" aria-label="Recent test history pagination">
              <button
                type="button"
                disabled={normalizedHistoryPage <= 1}
                onClick={() => setHistoryPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Previous
              </button>
              <p>
                Page {normalizedHistoryPage} of {historyPageCount} · {filteredTimeline.length} runs
              </p>
              <button
                type="button"
                disabled={normalizedHistoryPage >= historyPageCount}
                onClick={() => setHistoryPage((currentPage) => Math.min(historyPageCount, currentPage + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </section>

      {isL1Plus ? (
        <section className="student-performance-layer-section" aria-labelledby="student-performance-l1-title">
          <div className="student-section-heading">
            <p className="student-dashboard-layer-badge">L1 Metrics</p>
            <h3 id="student-performance-l1-title">Behavior & Pacing</h3>
            <p>Phase adherence, easy neglect, hard bias, and time allocation signals.</p>
          </div>
          <div className="student-performance-l1-grid">
            {l1SummaryCards.map((card) => (
              <UiStatCard key={card.label} title={card.label} value={card.value} helper={card.helper} />
            ))}
          </div>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="Phase Adherence Trend"
              subtitle="Pacing consistency"
              variant="line"
              data={phaseTrend}
              maxValue={100}
            />
            <UiChartContainer
              title="Time Allocation Trend"
              subtitle="Pacing balance across recent runs"
              variant="line"
              data={timeAllocationTrend}
              maxValue={100}
            />
          </div>
        </section>
      ) : null}

      {isL2Plus ? (
        <section className="student-performance-layer-section" aria-labelledby="student-performance-l2-title">
          <div className="student-section-heading">
            <p className="student-dashboard-layer-badge">L2 Metrics</p>
            <h3 id="student-performance-l2-title">Execution Risk & Controlled Mode</h3>
            <p>Discipline, overstay, guess rate, risk states, and controlled-mode comparison.</p>
          </div>
          <div className="student-performance-kpi-grid">
            {l2SummaryCards.map((card) => (
              <UiStatCard key={card.label} title={card.label} value={card.value} helper={card.helper} />
            ))}
          </div>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="Discipline Index Trend"
              subtitle="Execution habits over time"
              variant="line"
              data={disciplineTrend}
              maxValue={100}
            />
            <UiChartContainer
              title="Guess Rate Trend"
              subtitle="Confidence pattern over time"
              variant="line"
              data={guessTrend}
              maxValue={100}
            />
          </div>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="MinTime Violation % Trend"
              subtitle="Early timing checks"
              variant="line"
              data={minViolationTrend}
              maxValue={100}
            />
            <UiChartContainer
              title="MaxTime Violation % Trend"
              subtitle="Late timing checks"
              variant="line"
              data={maxViolationTrend}
              maxValue={100}
            />
          </div>

          <UiTable
            caption="Weak Topic Guidance"
            columns={topicWeaknessColumns}
            rows={orderedTopicWeaknessRows}
            rowKey={(row) => row.topic}
            emptyStateText="No weak-topic guidance is available yet."
          />

          <section className="student-performance-controlled-section" aria-label="Controlled mode comparison">
            <div className="student-performance-controlled-header">
              <div>
                <p className="student-content-eyebrow">Controlled Mode Comparison</p>
                <h3>{`${controlledComparison.baselineLabel} vs ${controlledComparison.currentLabel}`}</h3>
              </div>
              <span>{formatPercent(dataset.controlledModeImprovementPercent)} net discipline lift</span>
            </div>
            <div className="student-performance-controlled-grid">
              {controlledComparisonRows.map((row) => (
                <article key={row.label} className="student-performance-controlled-card">
                  <p>{row.label}</p>
                  <strong className={controlledComparisonTone(row.delta, row.invert)}>
                    {formatDelta(row.delta, row.invert)}
                  </strong>
                  <small>{row.helper}</small>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </section>
  );
}

export default StudentPerformancePage;
