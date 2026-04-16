import { useEffect, useMemo, useState } from "react";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
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

function StudentDashboardPage() {
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
        label: "Avg Raw Score (Last 5)",
        value: formatPercent(dataset.avgRawScorePercent),
        helper: "studentYearMetrics",
      },
      {
        label: "Avg Accuracy",
        value: formatPercent(dataset.avgAccuracyPercent),
        helper: "studentYearMetrics",
      },
      {
        label: "Tests Attempted",
        value: String(dataset.testsAttempted),
        helper: "Current academic year",
      },
      {
        label: "Upcoming Tests",
        value: String(dataset.upcomingTests.length),
        helper: "Assigned runs",
      },
    ];
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

      {inlineMessage ? <p className="student-dashboard-inline-note">{inlineMessage}</p> : null}

      <div className="student-dashboard-card-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="student-dashboard-summary-card">
            <p>{card.label}</p>
            <strong>{isLoading ? "Loading..." : card.value}</strong>
            <small>{card.helper}</small>
          </article>
        ))}
      </div>

      <div className="student-dashboard-status-grid">
        <article className="student-dashboard-risk-card" aria-label="Current risk indicator">
          <h3>Current Risk Indicator</h3>
          <p className={`student-dashboard-risk-pill ${riskToneClass(dataset.riskState)}`}>{dataset.riskState}</p>
          <p>
            Risk signal sourced from <code>studentYearMetrics.riskState</code> using constructive, neutral framing.
          </p>
        </article>

        <article className="student-dashboard-discipline-card" aria-label="Discipline index summary">
          <h3>Discipline Index Summary</h3>
          <p className="student-dashboard-discipline-value">{formatPercent(dataset.disciplineIndex)}</p>
          <div className="student-dashboard-discipline-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, Math.round(dataset.disciplineIndex)))}%` }} />
          </div>
          <p>Higher values indicate stronger timing discipline and steadier execution behavior.</p>
        </article>
      </div>

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
    </section>
  );
}

export default StudentDashboardPage;
