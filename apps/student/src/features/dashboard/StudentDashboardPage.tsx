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
  STUDENT_DASHBOARD_FALLBACK_DATASET,
  fetchStudentDashboardDataset,
  shouldUseLiveApi,
  type RecentResultRecord,
  type StudentDashboardDataset,
  type StudentRiskState,
  type UpcomingTestRecord,
} from "./studentDashboardDataset";

interface DashboardCard {
  label: string;
  value: string;
  helper: string;
}

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "N/A";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
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

function riskToneClass(riskState: StudentRiskState): string {
  switch (riskState) {
    case "Stable":
      return "student-dashboard-risk-stable";
    case "Drift-Prone":
      return "student-dashboard-risk-drift";
    case "Impulsive":
      return "student-dashboard-risk-impulsive";
    case "Volatile":
      return "student-dashboard-risk-volatile";
    case "Overextended":
      return "student-dashboard-risk-overextended";
    default:
      return "student-dashboard-risk-stable";
  }
}

function getNextUpcomingTest(dataset: StudentDashboardDataset): UpcomingTestRecord | null {
  if (dataset.upcomingTests.length === 0) {
    return null;
  }

  return [...dataset.upcomingTests]
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))[0];
}

function StudentDashboardPage() {
  const globalState = useGlobalPortalState();
  const [dataset, setDataset] = useState<StudentDashboardDataset>(STUDENT_DASHBOARD_FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_DASHBOARD_FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic Build 127 student dashboard fixtures (studentYearMetrics + assigned runs summary).",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchStudentDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: dashboard hydrated from GET /student/dashboard.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student dashboard data.";
        setDataset(STUDENT_DASHBOARD_FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 127 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const summaryCards = useMemo<DashboardCard[]>(() => {
    return [
      {
        label: "Avg Raw Score % (Last 5 Tests)",
        value: formatPercent(dataset.avgRawScorePercent),
        helper: "studentYearMetrics",
      },
      {
        label: "Avg Accuracy %",
        value: formatPercent(dataset.avgAccuracyPercent),
        helper: "studentYearMetrics",
      },
      {
        label: "Tests Attempted (Current Year)",
        value: String(dataset.testsAttempted),
        helper: "Current academic year",
      },
      {
        label: "Upcoming Tests Count",
        value: String(dataset.upcomingTests.length),
        helper: "Assigned runs",
      },
    ];
  }, [dataset]);

  const activeLicenseLayer = useMemo<LicenseLayer>(() => {
    const resolvedLayer = globalState.licenseLayer ?? dataset.licenseLayer;
    return LICENSE_LAYER_ORDER[resolvedLayer] > LICENSE_LAYER_ORDER.L2 ? "L2" : resolvedLayer;
  }, [dataset.licenseLayer, globalState.licenseLayer]);

  const isL1Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const motivationalBannerMessage = useMemo(() => {
    const nextUpcoming = getNextUpcomingTest(dataset);
    const latest = dataset.recentResults[0];
    const previous = dataset.recentResults[1];

    let headline = "Consistency is your strength this month.";
    if (latest && previous) {
      const delta = Math.round(latest.rawScorePercent - previous.rawScorePercent);
      if (delta > 0) {
        headline = `You improved Raw % by +${delta}% in your last 2 tests.`;
      } else if (delta === 0) {
        headline = "Your Raw % is stable across the last 2 tests. Keep momentum.";
      } else {
        headline = "Stay steady. Your next run is a chance to recover recent dip.";
      }
    }

    const nextRunPrompt =
      nextUpcoming ?
        `Next available test: ${nextUpcoming.testName} at ${formatDateTime(nextUpcoming.startAt)}.` :
        "No upcoming run is scheduled yet. Check back for newly assigned tests.";

    return `${headline} ${nextRunPrompt}`;
  }, [dataset]);

  const performanceTrendPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.recentResults
      .slice(0, 5)
      .reverse()
      .map((result) => ({
        label: formatDate(result.completedAt),
        value: Math.round(result.rawScorePercent),
      }));
  }, [dataset.recentResults]);

  const upcomingColumns = useMemo<UiTableColumn<UpcomingTestRecord>[]>(
    () => [
      {
        id: "test",
        header: "Test",
        render: (row) => (
          <div className="student-dashboard-table-title">
            <strong>{row.testName}</strong>
            <small>{row.runId}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => <span className="student-dashboard-mode-chip">{row.mode}</span>,
      },
      {
        id: "window",
        header: "Start Window",
        render: (row) => (
          <div className="student-dashboard-table-title">
            <strong>{formatDateTime(row.startAt)}</strong>
            <small>Ends {formatDateTime(row.endAt)}</small>
          </div>
        ),
      },
      {
        id: "duration",
        header: "Duration",
        render: (row) => `${row.durationMinutes} min`,
      },
    ],
    [],
  );

  const resultColumns = useMemo<UiTableColumn<RecentResultRecord>[]>(
    () => [
      {
        id: "test",
        header: "Recent Test",
        render: (row) => (
          <div className="student-dashboard-table-title">
            <strong>{row.testName}</strong>
            <small>{formatDateTime(row.completedAt)}</small>
          </div>
        ),
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
    <section className="student-content-card student-dashboard-page" aria-labelledby="student-dashboard-title">
      <p className="student-content-eyebrow">Build 127</p>
      <h2 id="student-dashboard-title">Student Dashboard</h2>
      <p className="student-content-copy">
        Track upcoming tests, recent outcomes, current risk signal, and discipline trends from summary-only
        analytics sources.
      </p>
      <p className="student-dashboard-motivational-banner" role="status">
        {motivationalBannerMessage}
      </p>
      <p className="student-dashboard-layer-badge">License Layer: {activeLicenseLayer}</p>

      {inlineMessage ? <p className="student-dashboard-inline-note">{inlineMessage}</p> : null}

      <div className="student-dashboard-card-grid">
        {summaryCards.map((card) => (
          <UiStatCard
            key={card.label}
            title={card.label}
            value={isLoading ? "Loading..." : card.value}
            helper={card.helper}
          />
        ))}
      </div>

      <div className="student-dashboard-status-grid">
        <UiStatCard
          title="Current Risk Indicator"
          value={<span className={`student-dashboard-risk-pill ${riskToneClass(dataset.riskState)}`}>{dataset.riskState}</span>}
          helper="studentYearMetrics.riskState"
        >
          Risk signal is rendered with constructive, neutral language.
        </UiStatCard>

        <UiStatCard
          title="Discipline Index Summary"
          value={formatPercent(dataset.disciplineIndex)}
          helper="studentYearMetrics.disciplineIndex"
        >
          <div className="student-dashboard-discipline-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, Math.round(dataset.disciplineIndex)))}%` }} />
          </div>
        </UiStatCard>
      </div>

      {isL1Plus ? (
        <div className="student-dashboard-layer-grid" aria-label="L1 behavioral cards and adherence indicators">
          <UiStatCard title="Phase Adherence %" value={formatPercent(dataset.phaseAdherencePercent)} helper="L1 adherence indicator" />
          <UiStatCard title="Easy Neglect %" value={formatPercent(dataset.easyNeglectPercent)} helper="L1 behavior indicator" />
          <UiStatCard title="Hard Bias %" value={formatPercent(dataset.hardBiasPercent)} helper="L1 behavior indicator" />
          <UiStatCard
            title="Time Misallocation %"
            value={formatPercent(dataset.timeMisallocationPercent)}
            helper="L1 pacing indicator"
          />
          <UiStatCard title="Behavior Summary Tag" value={dataset.behaviorSummaryTag} helper="Constructive interpretation" />
        </div>
      ) : null}

      <div className="student-dashboard-widget-grid">
        <UiTable
          caption="Upcoming Test List"
          columns={upcomingColumns}
          rows={dataset.upcomingTests}
          rowKey={(row) => row.runId}
          emptyStateText="No upcoming assigned runs."
        />

        <UiTable
          caption="Recent Results"
          columns={resultColumns}
          rows={dataset.recentResults}
          rowKey={(row) => row.runId}
          emptyStateText="No completed runs yet."
        />
      </div>

      <UiChartContainer
        title="Recent Raw Score Trend"
        subtitle="Last completed tests"
        variant="line"
        data={performanceTrendPoints.length > 0 ? performanceTrendPoints : [{ label: "No Data", value: 0 }]}
        maxValue={100}
      />

      {isL2Plus ? (
        <section className="student-dashboard-l2-section" aria-label="L2 risk-state and discipline depth">
          <div className="student-dashboard-layer-grid">
            <UiStatCard
              title="Controlled Mode Improvement Delta"
              value={`${Math.round(dataset.controlledModeImprovementDeltaPercent)}%`}
              helper="L2 execution depth"
            />
            <UiStatCard
              title="Guess Probability Indicator"
              value={`${Math.round(dataset.guessProbabilityPercent)}%`}
              helper="L2 execution depth"
            />
          </div>
          <UiChartContainer
            title="Phase Compliance Mini Trend"
            subtitle="L2 phase discipline progression"
            variant="line"
            data={dataset.phaseComplianceMiniTrend}
            maxValue={100}
          />
        </section>
      ) : null}
    </section>
  );
}

export default StudentDashboardPage;
