import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  STUDENT_MY_TESTS_FALLBACK,
  fetchStudentMyTestsDataset,
  shouldUseLiveApi,
  type StudentTestRecord,
  type StudentTestStatus,
} from "./studentMyTestsDataset";

type StatusFilter = "all" | StudentTestStatus;

interface StatusFilterChip {
  id: StatusFilter;
  label: string;
}

const STATUS_FILTERS: StatusFilterChip[] = [
  { id: "all", label: "All" },
  { id: "scheduled", label: "Scheduled" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "N/A";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function statusLabel(status: StudentTestStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
    default:
      return "Scheduled";
  }
}

function statusClass(status: StudentTestStatus): string {
  switch (status) {
    case "scheduled":
      return "student-my-tests-status student-my-tests-status-scheduled";
    case "active":
      return "student-my-tests-status student-my-tests-status-active";
    case "completed":
      return "student-my-tests-status student-my-tests-status-completed";
    case "archived":
      return "student-my-tests-status student-my-tests-status-archived";
    default:
      return "student-my-tests-status student-my-tests-status-scheduled";
  }
}

function StudentMyTestsPage() {
  const [dataset, setDataset] = useState<StudentTestRecord[]>(STUDENT_MY_TESTS_FALLBACK);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadTests() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_MY_TESTS_FALLBACK);
        setInlineMessage(
          "Local mode detected. Loaded deterministic Build 128 My Tests fixtures mapped to scheduled, active, completed, and archived views.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetchStudentMyTestsDataset();
        if (!isMounted) {
          return;
        }

        setDataset(response);
        setInlineMessage("Live mode enabled: My Tests hydrated from GET /student/tests.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student tests.";
        setDataset(STUDENT_MY_TESTS_FALLBACK);
        setInlineMessage(`${reason} Falling back to deterministic Build 128 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTests();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    return dataset.filter((record) => (activeFilter === "all" ? true : record.status === activeFilter));
  }, [activeFilter, dataset]);

  const summaryCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: dataset.length,
      scheduled: 0,
      active: 0,
      completed: 0,
      archived: 0,
    };

    for (const item of dataset) {
      counts[item.status] += 1;
    }

    return counts;
  }, [dataset]);

  const columns = useMemo<UiTableColumn<StudentTestRecord>[]>(
    () => [
      {
        id: "test",
        header: "Assigned Test",
        render: (row) => (
          <div className="student-my-tests-test-cell">
            <strong>{row.testName}</strong>
            <small>{row.runId}</small>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        render: (row) => <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>,
      },
      {
        id: "window",
        header: "Test Window",
        render: (row) => (
          <div className="student-my-tests-test-cell">
            <strong>{formatDateTime(row.startWindow)}</strong>
            <small>Ends {formatDateTime(row.endWindow)}</small>
          </div>
        ),
      },
      {
        id: "result",
        header: "Results Overview",
        render: (row) => (
          <div className="student-my-tests-test-cell">
            <strong>{`Raw ${formatPercent(row.rawScorePercent)} | Accuracy ${formatPercent(row.accuracyPercent)}`}</strong>
            <small>{row.completedAt ? `Completed ${formatDateTime(row.completedAt)}` : "Awaiting completion"}</small>
          </div>
        ),
      },
      {
        id: "session",
        header: "Exam Session",
        render: (row) => {
          if (!row.sessionLink) {
            return <span className="student-my-tests-session-muted">Session link available after session start.</span>;
          }

          return (
            <a className="student-my-tests-session-link" href={row.sessionLink}>
              {row.status === "active" ? "Resume Session" : "Open Session"}
            </a>
          );
        },
      },
    ],
    [],
  );

  return (
    <section className="student-content-card student-my-tests-page" aria-labelledby="student-my-tests-title">
      <p className="student-content-eyebrow">Build 128</p>
      <h2 id="student-my-tests-title">My Tests</h2>
      <p className="student-content-copy">
        Review assigned tests, track status transitions, and open exam session links from a single filtered workspace.
      </p>

      {inlineMessage ? <p className="student-my-tests-inline-note">{inlineMessage}</p> : null}

      <div className="student-my-tests-filter-grid" role="tablist" aria-label="Filter by test status">
        {STATUS_FILTERS.map((filterItem) => {
          const isActive = filterItem.id === activeFilter;
          return (
            <button
              key={filterItem.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={isActive ? "student-my-tests-filter student-my-tests-filter-active" : "student-my-tests-filter"}
              onClick={() => setActiveFilter(filterItem.id)}
            >
              <span>{filterItem.label}</span>
              <strong>{summaryCounts[filterItem.id]}</strong>
            </button>
          );
        })}
      </div>

      <UiTable
        caption={`My Tests — ${STATUS_FILTERS.find((filterItem) => filterItem.id === activeFilter)?.label ?? "All"}`}
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => `${row.runId}-${row.testId}`}
        emptyStateText={isLoading ? "Loading assigned tests..." : "No tests found for the selected status."}
      />
    </section>
  );
}

export default StudentMyTestsPage;
