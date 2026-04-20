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
  STUDENT_INSIGHTS_FALLBACK_DATASET,
  fetchStudentInsightsDataset,
  shouldUseLiveApi,
  type StudentInsightsDataset,
  type StudentInsightSnapshot,
  type TopicWeaknessInsight,
} from "./studentInsightsDataset";

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
  snapshots: StudentInsightSnapshot[],
  selector: (snapshot: StudentInsightSnapshot) => number,
): UiChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: formatDate(snapshot.generatedAt),
    value: Math.round(selector(snapshot)),
  }));
}

function StudentInsightsPage() {
  const { session } = useAuthProvider();
  const [dataset, setDataset] = useState<StudentInsightsDataset>(STUDENT_INSIGHTS_FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInsights() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_INSIGHTS_FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic Build 130 insightSnapshots fixtures (summary-only, no raw sessions).",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchStudentInsightsDataset(6);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: behavioral insights hydrated from GET /student/insights.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student insights.";
        setDataset(STUDENT_INSIGHTS_FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 130 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInsights();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeLicenseLayer = useMemo<LicenseLayer>(() => {
    const tokenLayer = decodeLicenseLayerFromToken(session.idToken);
    return tokenLayer ?? dataset.licenseLayer;
  }, [dataset.licenseLayer, session.idToken]);

  const isL2Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const latestSnapshot = dataset.snapshots[dataset.snapshots.length - 1];

  const behaviorTrend = useMemo(
    () => toTrendPoints(dataset.snapshots, (snapshot) => snapshot.latePhaseDropPercent),
    [dataset.snapshots],
  );
  const guessTrend = useMemo(
    () => toTrendPoints(dataset.snapshots, (snapshot) => snapshot.guessDetectionPercent),
    [dataset.snapshots],
  );
  const rushedTrend = useMemo(
    () => toTrendPoints(dataset.snapshots, (snapshot) => snapshot.rushedPatternFrequencyPercent),
    [dataset.snapshots],
  );
  const skipBurstTrend = useMemo(
    () => toTrendPoints(dataset.snapshots, (snapshot) => snapshot.skipBurstFrequencyPercent),
    [dataset.snapshots],
  );

  const patternSnapshotRows = useMemo<UiTableColumn<StudentInsightSnapshot>[]>(
    () => [
      {
        id: "snapshot",
        header: "Snapshot",
        render: (row) => (
          <div className="student-insights-snapshot-cell">
            <strong>{formatDate(row.generatedAt)}</strong>
            <small>{row.snapshotId}</small>
          </div>
        ),
      },
      {
        id: "scores",
        header: "Outcome",
        render: (row) => `Raw ${formatPercent(row.rawScorePercent)} | Accuracy ${formatPercent(row.accuracyPercent)}`,
      },
      {
        id: "pattern",
        header: "Dominant Pattern",
        render: (row) => row.dominantPattern,
      },
      {
        id: "guess",
        header: "Guess Detection",
        render: (row) => formatPercent(row.guessDetectionPercent),
      },
      {
        id: "drop",
        header: "Late-Phase Drop",
        render: (row) => formatPercent(row.latePhaseDropPercent),
      },
    ],
    [],
  );

  const topicWeaknessColumns = useMemo<UiTableColumn<TopicWeaknessInsight>[]>(
    () => [
      {
        id: "topic",
        header: "Topic Weakness",
        render: (row) => (
          <div className="student-insights-topic-cell">
            <strong>{row.topic}</strong>
            <small>{formatPercent(row.weaknessPercent)} instability marker</small>
          </div>
        ),
      },
      {
        id: "feedback",
        header: "Constructive Feedback",
        render: (row) => row.feedback,
      },
      {
        id: "resources",
        header: "Practice Resources",
        render: (row) => (
          <div className="student-insights-resource-links">
            {row.tutorialVideoLink ? (
              <a href={row.tutorialVideoLink} target="_blank" rel="noreferrer">
                TutorialVideoLink
              </a>
            ) : (
              <span className="student-insights-resource-muted">TutorialVideoLink unavailable</span>
            )}
            {row.simulationLink ? (
              <a href={row.simulationLink} target="_blank" rel="noreferrer">
                SimulationLink
              </a>
            ) : (
              <span className="student-insights-resource-muted">SimulationLink unavailable</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <section className="student-content-card student-insights-page" aria-labelledby="student-insights-title">
      <p className="student-content-eyebrow">Build 130</p>
      <h2 id="student-insights-title">Student Insights</h2>
      <p className="student-content-copy">
        Review behavior patterns, topic-level friction, and next-step suggestions powered by insightSnapshots
        and studentYearMetrics summary outputs.
      </p>
      <p className="student-dashboard-motivational-banner">
        Keep building consistency. Insights highlight one behavior to improve each week instead of overwhelming
        you with alerts.
      </p>
      <p className="student-dashboard-layer-badge">License Layer: {activeLicenseLayer}</p>

      {inlineMessage ? <p className="student-insights-inline-note">{inlineMessage}</p> : null}

      <div className="student-insights-kpi-grid">
        <UiStatCard
          title="Most Frequent Pattern"
          value={isLoading ? "Loading..." : dataset.mostFrequentBehaviorPattern}
          helper="Insight snapshot rollup"
        />
        <UiStatCard
          title="Latest Late-Phase Drop"
          value={isLoading ? "Loading..." : formatPercent(dataset.latePhaseDropIndicatorPercent)}
          helper="L1 pacing signal"
        />
        <UiStatCard
          title="Latest Guess Detection"
          value={isLoading ? "Loading..." : formatPercent(dataset.guessDetectionAlertPercent)}
          helper="Constructive alert"
        />
        <UiStatCard
          title="Archived Summary Entries"
          value={isLoading ? "Loading..." : String(dataset.archivedSummaryOnlyCount)}
          helper="Summary-only, no solution assets"
        />
      </div>

      <div className="student-insights-guardrail-strip">
        <p>
          Current-year solution access:
          {" "}
          <strong>{dataset.currentYearSolutionAccessOnly ? "Enabled (current year only)" : "Restricted"}</strong>
        </p>
        <p>
          Historical archived runs remain summary-only and never expose raw session payloads or direct question
          access.
        </p>
      </div>

      <div className="student-insights-chart-grid">
        <UiChartContainer
          title="Late-Phase Drop Trend"
          subtitle="Keep final-phase stamina stable"
          variant="line"
          data={behaviorTrend}
          maxValue={100}
        />
        <UiChartContainer
          title="Guess Detection Trend"
          subtitle="Focus on elimination discipline"
          variant="line"
          data={guessTrend}
          maxValue={100}
        />
      </div>

      <div className="student-insights-chart-grid">
        <UiChartContainer
          title="Rushed Pattern Trend"
          subtitle="Track commit speed under pressure"
          variant="line"
          data={rushedTrend}
          maxValue={100}
        />
        <UiChartContainer
          title="Skip Burst Trend"
          subtitle="Reduce skip clusters through attempt planning"
          variant="line"
          data={skipBurstTrend}
          maxValue={100}
        />
      </div>

      <UiTable
        caption="Insight Snapshot Timeline"
        columns={patternSnapshotRows}
        rows={dataset.snapshots}
        rowKey={(row) => row.snapshotId}
        emptyStateText="No insight snapshots available yet."
      />

      <UiTable
        caption="Topic Weakness Summary"
        columns={topicWeaknessColumns}
        rows={dataset.topicWeaknessSummary}
        rowKey={(row) => row.topic}
        emptyStateText="No topic weakness summary available yet."
      />

      <section className="student-insights-guidance" aria-label="Discipline improvement suggestions">
        <h3>Discipline Improvement Suggestions</h3>
        <p>{dataset.phaseAdherenceFeedback}</p>
        <ul>
          {dataset.disciplineImprovementSuggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>

        {isL2Plus && latestSnapshot ? (
          <div className="student-insights-l2-grid">
            <article className="student-insights-progress-card">
              <header>
                <strong>Rushed Pattern Frequency</strong>
                <span>{formatPercent(dataset.rushedPatternFrequencyPercent)}</span>
              </header>
              <div className="student-insights-progress-track" aria-hidden="true">
                <span style={{ width: `${Math.round(dataset.rushedPatternFrequencyPercent)}%` }} />
              </div>
            </article>
            <article className="student-insights-progress-card">
              <header>
                <strong>Skip Burst Indicator</strong>
                <span>{formatPercent(dataset.skipBurstIndicatorPercent)}</span>
              </header>
              <div className="student-insights-progress-track" aria-hidden="true">
                <span style={{ width: `${Math.round(dataset.skipBurstIndicatorPercent)}%` }} />
              </div>
            </article>
            <article className="student-insights-progress-card">
              <header>
                <strong>Latest Raw %</strong>
                <span>{formatPercent(latestSnapshot.rawScorePercent)}</span>
              </header>
              <div className="student-insights-progress-track" aria-hidden="true">
                <span style={{ width: `${Math.round(latestSnapshot.rawScorePercent)}%` }} />
              </div>
            </article>
            <article className="student-insights-progress-card">
              <header>
                <strong>Latest Accuracy %</strong>
                <span>{formatPercent(latestSnapshot.accuracyPercent)}</span>
              </header>
              <div className="student-insights-progress-track" aria-hidden="true">
                <span style={{ width: `${Math.round(latestSnapshot.accuracyPercent)}%` }} />
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </section>
  );
}

export default StudentInsightsPage;
