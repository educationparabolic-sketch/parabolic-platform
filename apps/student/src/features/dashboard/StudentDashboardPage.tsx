import { useEffect, useMemo, useState } from "react";
import { useGlobalPortalState } from "../../../../../shared/services/globalPortalState";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  UiStatCard,
  UiTable,
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
import { isStudentDebugMode } from "../../services/studentDebugMode";

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

function formatRank(value: number): string {
  return `#${Math.round(value)}`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
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

function riskToneClass(riskState: StudentRiskState): string {
  switch (riskState) {
    case "low":
      return "student-dashboard-risk-stable";
    case "medium":
      return "student-dashboard-risk-drift";
    case "high":
      return "student-dashboard-risk-overextended";
    case "critical":
      return "student-dashboard-risk-volatile";
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
  const debugMode = isStudentDebugMode();
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
          "Showing a practice dashboard so you can explore the student experience.",
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
        setInlineMessage("Your dashboard is up to date.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student dashboard data.";
        setDataset(STUDENT_DASHBOARD_FALLBACK_DATASET);
        setInlineMessage(`${reason} Showing a practice dashboard for now.`);
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

  const l0MetricCards = useMemo<DashboardCard[]>(() => {
    return [
      {
        label: "Avg Raw Score %",
        value: formatPercent(dataset.avgRawScorePercent),
        helper: "Current progress snapshot",
      },
      {
        label: "Avg Accuracy %",
        value: formatPercent(dataset.avgAccuracyPercent),
        helper: "Current progress snapshot",
      },
      {
        label: "Tests Attempted",
        value: String(dataset.testsAttempted),
        helper: "Current academic year",
      },
      {
        label: "Upcoming Tests Count",
        value: String(dataset.upcomingTests.length),
        helper: "Assigned runs",
      },
      ...(dataset.batchRank ?
        [
          {
            label: "Batch Rank",
            value: formatRank(dataset.batchRank),
            helper: "Current batch",
          },
        ] :
        []),
    ];
  }, [dataset]);

  const l1MetricCards = useMemo<DashboardCard[]>(
    () => [
      {
        label: "Phase Adherence",
        value: formatPercent(dataset.phaseAdherencePercent),
        helper: "L1 execution behavior",
      },
      {
        label: "Easy Neglect",
        value: formatPercent(dataset.easyNeglectPercent),
        helper: "L1 behavior signal",
      },
      {
        label: "Hard Bias",
        value: formatPercent(dataset.hardBiasPercent),
        helper: "L1 behavior signal",
      },
      {
        label: "Behavior",
        value: dataset.behaviorSummaryTag,
        helper: "L1 summary tag",
      },
    ],
    [dataset],
  );

  const l2MetricCards = useMemo<DashboardCard[]>(
    () => [
      {
        label: "Risk",
        value: dataset.riskState,
        helper: "L2 execution risk",
      },
      {
        label: "Discipline Index",
        value: String(Math.round(dataset.disciplineIndex)),
        helper: "L2 consistency score",
      },
      {
        label: "Controlled Delta",
        value: formatSignedPercent(dataset.controlledModeImprovementDeltaPercent),
        helper: "Controlled-mode performance delta",
      },
      {
        label: "Guess Rate",
        value: formatPercent(dataset.guessProbabilityPercent),
        helper: "L2 rushed-attempt signal",
      },
      {
        label: "Stability",
        value: dataset.executionStabilityFlag,
        helper: "L2 execution stability",
      },
    ],
    [dataset],
  );

  const activeLicenseLayer = useMemo<LicenseLayer>(() => {
    const resolvedLayer = globalState.licenseLayer ?? dataset.licenseLayer;
    return LICENSE_LAYER_ORDER[resolvedLayer] > LICENSE_LAYER_ORDER.L2 ? "L2" : resolvedLayer;
  }, [dataset.licenseLayer, globalState.licenseLayer]);

  const isL1Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2Plus = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const nextUpcoming = getNextUpcomingTest(dataset);
  const latestResult = dataset.recentResults[0] ?? null;

  const motivationalBannerMessage = useMemo(() => {
    const latest = latestResult;
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
  }, [dataset, latestResult]);

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
      <h2 id="student-dashboard-title">Student Dashboard</h2>
      <p className="student-content-copy">
        See your next test, recent progress, and one clear area to keep building.
      </p>
      {isLoading ? <p className="student-learning-state" role="status">Getting your latest progress...</p> : null}

      {debugMode && inlineMessage ? <p className="student-dashboard-inline-note">{inlineMessage}</p> : null}

      <section className="student-dashboard-layer-section" aria-labelledby="student-dashboard-l0-title">
        <div className="student-section-heading">
          <p className="student-dashboard-layer-badge">L0 Metrics</p>
          <h3 id="student-dashboard-l0-title">Current Progress Snapshot</h3>
          <p>Your basic progress view: scores, attempted tests, and upcoming assignment count.</p>
        </div>
        <div className="student-dashboard-card-grid">
          {l0MetricCards.map((card) => (
            <UiStatCard
              key={card.label}
              title={card.label}
              value={isLoading ? "..." : card.value}
              helper={card.helper}
            />
          ))}
        </div>
      </section>

      <section className="student-dashboard-layer-section" aria-labelledby="student-dashboard-trends-title">
        <div className="student-section-heading">
          <h3 id="student-dashboard-trends-title">Upcoming Trends & Recent Results</h3>
          <p>{motivationalBannerMessage}</p>
        </div>
        <div className="student-dashboard-home-grid" aria-label="Upcoming and recent result highlights">
          <article className="student-focus-card student-focus-card-primary">
            <p className="student-focus-card-label">Next Test</p>
            <h3>{nextUpcoming ? nextUpcoming.testName : "Nothing scheduled yet"}</h3>
            <p>
              {nextUpcoming ?
                `${formatDateTime(nextUpcoming.startAt)} · ${nextUpcoming.durationMinutes} min` :
                "Your next assigned test will appear here when it is ready."}
            </p>
            {nextUpcoming ? <span className="student-dashboard-mode-chip">{nextUpcoming.mode}</span> : null}
          </article>
          <article className="student-focus-card">
            <p className="student-focus-card-label">Recent Result</p>
            <h3>{latestResult ? latestResult.testName : "No completed test yet"}</h3>
            <p>
              {latestResult ?
                `${formatPercent(latestResult.rawScorePercent)} Raw Score % · ${formatPercent(latestResult.accuracyPercent)} Accuracy %` :
                "Your first completed test will start your progress history."}
            </p>
          </article>
        </div>
        <div className="student-dashboard-widget-grid student-detail-zone">
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
      </section>

      {isL1Plus ? (
        <section className="student-dashboard-layer-section" aria-labelledby="student-dashboard-l1-title">
          <div className="student-section-heading">
            <p className="student-dashboard-layer-badge">L1 Metrics</p>
            <h3 id="student-dashboard-l1-title">Execution Behavior</h3>
            <p>Phase adherence and behavior signals shown only for L1 and higher student access.</p>
          </div>
          <div className="student-dashboard-layer-grid">
            {l1MetricCards.map((card) => (
              <UiStatCard key={card.label} title={card.label} value={card.value} helper={card.helper} />
            ))}
          </div>
        </section>
      ) : null}

      {isL2Plus ? (
        <section className="student-dashboard-layer-section student-dashboard-l2-section" aria-labelledby="student-dashboard-l2-title">
          <div className="student-section-heading">
            <p className="student-dashboard-layer-badge">L2 Metrics</p>
            <h3 id="student-dashboard-l2-title">Execution Risk & Discipline</h3>
            <p>Risk, discipline, controlled-mode delta, guess rate, and stability shown only for L2 and higher access.</p>
          </div>
          <div className="student-dashboard-layer-grid">
            {l2MetricCards.map((card) => (
              <UiStatCard
                key={card.label}
                title={card.label}
                value={card.label === "Risk" ? (
                  <span className={`student-dashboard-risk-pill ${riskToneClass(dataset.riskState)}`}>{card.value}</span>
                ) : card.value}
                helper={card.helper}
              >
                {card.label === "Discipline Index" ? (
                  <div className="student-dashboard-discipline-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(0, Math.min(100, Math.round(dataset.disciplineIndex)))}%` }} />
                  </div>
                ) : null}
              </UiStatCard>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default StudentDashboardPage;
