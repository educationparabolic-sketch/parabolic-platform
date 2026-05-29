import { useEffect, useMemo, useState } from "react";
import { useGlobalPortalState } from "../../../../../shared/services/globalPortalState";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  UiChartContainer,
  UiStatCard,
  type UiChartPoint,
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
import { isStudentDebugMode } from "../../services/studentDebugMode";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

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

function riskStateClass(riskState: StudentPerformancePoint["riskState"]): string {
  switch (riskState) {
    case "Stable":
      return "student-performance-risk-pill student-performance-risk-pill-stable";
    case "Improving":
      return "student-performance-risk-pill student-performance-risk-pill-improving";
    case "Building Discipline":
    default:
      return "student-performance-risk-pill student-performance-risk-pill-building";
  }
}

function riskStateHelper(riskState: StudentPerformancePoint["riskState"]): string {
  switch (riskState) {
    case "Stable":
      return "Recent execution signals look steady across discipline and timing.";
    case "Improving":
      return "Momentum is moving in the right direction across recent runs.";
    case "Building Discipline":
    default:
      return "This phase is about strengthening habits with each new attempt.";
  }
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

function StudentPerformancePage() {
  const globalState = useGlobalPortalState();
  const debugMode = isStudentDebugMode();
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
          "Showing practice performance trends so you can explore this page.",
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
        setInlineMessage("Your performance trends are up to date.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student performance analytics.";
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
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
  const riskTimeline = useMemo(() => [...timeline].reverse(), [timeline]);
  const controlledComparison = dataset.controlledModeComparison;

  const latestSummaryCards = useMemo(() => {
    return [
      {
        label: "Latest Raw Score %",
        value: latestSnapshot ? formatPercent(latestSnapshot.rawScorePercent) : "-",
        helper: "Latest completed test",
      },
      {
        label: "Latest Accuracy %",
        value: latestSnapshot ? formatPercent(latestSnapshot.accuracyPercent) : "-",
        helper: "Latest completed test",
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

  return (
    <section className="student-content-card student-performance-page" aria-labelledby="student-performance-title">
      <h2 id="student-performance-title">Student Performance</h2>
      <p className="student-content-copy">
        Follow your Raw % and Accuracy % over recent tests, plus the habits that help you stay steady.
      </p>
      {isLoading ? <p className="student-learning-state" role="status">Preparing your performance trends...</p> : null}

      {debugMode && inlineMessage ? <p className="student-performance-inline-note">{inlineMessage}</p> : null}

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
          title="Raw % Trend"
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

      {isL1Plus ? (
        <>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="Phase Adherence Trend"
              subtitle="Pacing consistency"
              variant="line"
              data={phaseTrend}
              maxValue={100}
            />
          </div>

          <section className="student-performance-allocation-section" aria-label="Time allocation overview">
            <div className="student-performance-chart-grid">
              <UiChartContainer
                title="Time Allocation Trend"
                subtitle="How evenly you pace time across recent runs"
                variant="line"
                data={timeAllocationTrend}
                maxValue={100}
              />
              <article className="student-performance-allocation-card">
                <h3>Time Allocation Balance</h3>
                <p>
                  Balance stays strongest when early under-spend and late overstay both remain controlled across the
                  full test.
                </p>
                <div className="student-performance-progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.round(dataset.timeAllocationBalancePercent)}%` }} />
                </div>
                <dl>
                  <div>
                    <dt>Current Balance</dt>
                    <dd>{formatPercent(dataset.timeAllocationBalancePercent)}</dd>
                  </div>
                  <div>
                    <dt>Latest MinTime</dt>
                    <dd>{latestSnapshot ? formatPercent(latestSnapshot.minTimeViolationPercent) : "N/A"}</dd>
                  </div>
                  <div>
                    <dt>Latest MaxTime</dt>
                    <dd>{latestSnapshot ? formatPercent(latestSnapshot.maxTimeViolationPercent) : "N/A"}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>

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
              helper="L1 pacing chart summary"
            />
          </div>

          <section className="student-section-group" aria-label="Topic performance">
            <div className="student-section-heading">
              <h3>Topic Performance</h3>
              <p>Use this as a quick scan for where practice may help most.</p>
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
        </>
      ) : null}

      {isL2Plus ? (
        <>
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
          </div>
          <div className="student-performance-chart-grid">
            <UiChartContainer
              title="MaxTime Violation % Trend"
              subtitle="Late timing checks"
              variant="line"
              data={maxViolationTrend}
              maxValue={100}
            />
          </div>

          <section className="student-performance-risk-section" aria-label="Risk state timeline">
            <h3>Risk State Timeline</h3>
            <p>
              Precomputed run-level risk states stay constructive and help students notice steadier execution patterns
              over time.
            </p>
            <div className="student-performance-risk-grid">
              {riskTimeline.map((entry) => (
                <article key={entry.runId} className="student-performance-risk-card">
                  <header>
                    <div className="student-performance-run-cell">
                      <strong>{entry.runLabel}</strong>
                      <small>{formatDate(entry.completedAt)}</small>
                    </div>
                    <span className={riskStateClass(entry.riskState)}>{entry.riskState}</span>
                  </header>
                  <p>{riskStateHelper(entry.riskState)}</p>
                  <dl>
                    <div>
                      <dt>Discipline</dt>
                      <dd>{formatPercent(entry.disciplineIndex)}</dd>
                    </div>
                    <div>
                      <dt>Guess Rate</dt>
                      <dd>{formatPercent(entry.guessRatePercent)}</dd>
                    </div>
                    <div>
                      <dt>MaxTime Violations</dt>
                      <dd>{formatPercent(entry.maxTimeViolationPercent)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

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

      <section className="student-section-group" aria-label="Recent performance history">
        <div className="student-section-heading">
          <h3>Recent Test History</h3>
          <p>A lighter view of your recent Raw Score %, Accuracy %, time, and rank.</p>
        </div>
        <div className="student-performance-history-list">
          {timeline.length === 0 ? <p className="student-empty-state">No performance history available yet.</p> : null}
          {timeline.map((entry) => (
            <article key={entry.runId} className="student-performance-history-card">
              <div>
                <strong>{entry.runLabel}</strong>
                <span>{formatDate(entry.completedAt)}</span>
              </div>
              <dl>
                <div>
                  <dt>Raw Score %</dt>
                  <dd>{formatPercent(entry.rawScorePercent)}</dd>
                </div>
                <div>
                  <dt>Accuracy %</dt>
                  <dd>{formatPercent(entry.accuracyPercent)}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{`${Math.round(entry.timeSpentMinutes)} min`}</dd>
                </div>
                <div>
                  <dt>Rank</dt>
                  <dd>{entry.rankInBatch === null ? "N/A" : `#${Math.round(entry.rankInBatch)}`}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default StudentPerformancePage;
