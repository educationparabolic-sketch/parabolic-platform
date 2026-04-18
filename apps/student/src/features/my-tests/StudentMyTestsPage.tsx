import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  completedPageSize,
  fetchStudentSolutions,
  fetchStudentTestsPage,
  startStudentExamSession,
  shouldUseLiveApi,
  type StudentSolutionItem,
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
  { id: "scheduled", label: "Available" },
  { id: "active", label: "In Progress" },
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

function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "N/A";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function computeTimeRemaining(endWindowIso: string): string {
  const remainingMs = Date.parse(endWindowIso) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "Session window ended";
  }

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m remaining`;
  }

  return `${hours}h ${minutes}m remaining`;
}

function statusLabel(status: StudentTestStatus): string {
  switch (status) {
    case "scheduled":
      return "Available";
    case "active":
      return "In Progress";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
    default:
      return "Available";
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
  const [scheduledTests, setScheduledTests] = useState<StudentTestRecord[]>([]);
  const [activeTests, setActiveTests] = useState<StudentTestRecord[]>([]);
  const [completedTests, setCompletedTests] = useState<StudentTestRecord[]>([]);
  const [archivedTests, setArchivedTests] = useState<StudentTestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [completedPage, setCompletedPage] = useState(1);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedHasMore, setCompletedHasMore] = useState(false);
  const [isLaunchingSession, setIsLaunchingSession] = useState<string | null>(null);
  const [openSolutionTestId, setOpenSolutionTestId] = useState<string | null>(null);
  const [solutionItems, setSolutionItems] = useState<StudentSolutionItem[]>([]);
  const [solutionError, setSolutionError] = useState<string | null>(null);
  const [isLoadingSolution, setIsLoadingSolution] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStaticStatuses() {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const [scheduledResponse, activeResponse, archivedResponse] = await Promise.all([
          fetchStudentTestsPage("scheduled", 1, 50),
          fetchStudentTestsPage("active", 1, 50),
          fetchStudentTestsPage("archived", 1, 50),
        ]);

        if (!isMounted) {
          return;
        }

        setScheduledTests(scheduledResponse.tests);
        setActiveTests(activeResponse.tests);
        setArchivedTests(archivedResponse.tests);

        if (!shouldUseLiveApi()) {
          setInlineMessage(
            "Local mode detected. Build 128 fallback data loaded with separated available, in-progress, completed, and archived states.",
          );
        } else {
          setInlineMessage("Live mode enabled: My Tests hydrated from GET /student/tests.");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student tests.";
        setInlineMessage(`${reason} My Tests could not be fully loaded.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStaticStatuses();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCompletedPage() {
      setIsLoading(true);
      try {
        const response = await fetchStudentTestsPage("completed", completedPage, completedPageSize());
        if (!isMounted) {
          return;
        }

        setCompletedTests(response.tests);
        setCompletedTotal(response.total);
        setCompletedHasMore(response.hasMore);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load completed tests.";
        setInlineMessage(reason);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCompletedPage();

    return () => {
      isMounted = false;
    };
  }, [completedPage]);

  useEffect(() => {
    setOpenSolutionTestId(null);
    setSolutionItems([]);
    setSolutionError(null);
  }, [activeFilter]);

  async function launchSession(test: StudentTestRecord) {
    setIsLaunchingSession(test.testId);
    setInlineMessage(null);

    try {
      const sessionUrl = await startStudentExamSession(test);
      window.location.assign(sessionUrl);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Unable to start exam session.";
      setInlineMessage(`${reason} Session launch requires signed token issuance.`);
    } finally {
      setIsLaunchingSession(null);
    }
  }

  async function openSolutions(test: StudentTestRecord) {
    if (!test.currentAcademicYear || test.status !== "completed") {
      setSolutionError("Solutions are available only for completed tests in the current academic year.");
      return;
    }

    setOpenSolutionTestId(test.testId);
    setIsLoadingSolution(true);
    setSolutionError(null);

    try {
      const items = await fetchStudentSolutions(test.testId);
      setSolutionItems(items);
      if (items.length === 0) {
        setSolutionError("No solution assets were returned for this test.");
      }
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Failed to load solutions.";
      setSolutionError(reason);
      setSolutionItems([]);
    } finally {
      setIsLoadingSolution(false);
    }
  }

  const allVisibleRows = useMemo(() => {
    if (activeFilter === "scheduled") {
      return scheduledTests;
    }

    if (activeFilter === "active") {
      return activeTests;
    }

    if (activeFilter === "completed") {
      return completedTests;
    }

    if (activeFilter === "archived") {
      return archivedTests;
    }

    return [...scheduledTests, ...activeTests, ...completedTests, ...archivedTests];
  }, [activeFilter, activeTests, archivedTests, completedTests, scheduledTests]);

  const summaryCounts = useMemo(() => {
    return {
      all: scheduledTests.length + activeTests.length + completedTotal + archivedTests.length,
      scheduled: scheduledTests.length,
      active: activeTests.length,
      completed: completedTotal,
      archived: archivedTests.length,
    };
  }, [activeTests.length, archivedTests.length, completedTotal, scheduledTests.length]);

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
        id: "meta",
        header: "Duration & Mode",
        render: (row) => (
          <div className="student-my-tests-test-cell">
            <strong>{`${formatDuration(row.durationMinutes)} · ${row.mode}`}</strong>
            <small>Academic Year {row.academicYear}</small>
          </div>
        ),
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
        id: "actions",
        header: "Actions",
        render: (row) => {
          if (row.status === "scheduled") {
            return (
              <button
                type="button"
                className="student-my-tests-action"
                disabled={isLaunchingSession === row.testId}
                onClick={() => {
                  void launchSession(row);
                }}
              >
                {isLaunchingSession === row.testId ? "Starting..." : "Start Test"}
              </button>
            );
          }

          if (row.status === "active") {
            return (
              <div className="student-my-tests-action-stack">
                <button
                  type="button"
                  className="student-my-tests-action"
                  disabled={isLaunchingSession === row.testId}
                  onClick={() => {
                    void launchSession(row);
                  }}
                >
                  {isLaunchingSession === row.testId ? "Resuming..." : "Resume"}
                </button>
                <small>{computeTimeRemaining(row.endWindow)}</small>
              </div>
            );
          }

          if (row.status === "completed") {
            return (
              <div className="student-my-tests-action-stack">
                <button
                  type="button"
                  className="student-my-tests-action"
                  disabled={!row.currentAcademicYear || isLoadingSolution}
                  onClick={() => {
                    void openSolutions(row);
                  }}
                >
                  View Solutions
                </button>
                {row.summaryPdfUrl ? (
                  <a className="student-my-tests-session-link" href={row.summaryPdfUrl}>
                    Download Summary
                  </a>
                ) : null}
              </div>
            );
          }

          return (
            <div className="student-my-tests-action-stack">
              <span className="student-my-tests-session-muted">Summary only</span>
              <small>No archived solution access</small>
            </div>
          );
        },
      },
    ],
    [isLaunchingSession, isLoadingSolution],
  );

  const openSolutionTest = useMemo(() => {
    if (!openSolutionTestId) {
      return null;
    }

    return allVisibleRows.find((row) => row.testId === openSolutionTestId) ?? null;
  }, [allVisibleRows, openSolutionTestId]);

  return (
    <section className="student-content-card student-my-tests-page" aria-labelledby="student-my-tests-title">
      <p className="student-content-eyebrow">Build 128</p>
      <h2 id="student-my-tests-title">My Tests</h2>
      <p className="student-content-copy">
        Review assigned tests, track status transitions, and manage exam-session lifecycle from a single filtered workspace.
      </p>

      <p className="student-content-note">
        Session launch is token-gated through <code>POST /exam/start</code>. Completed tests are paginated and
        archived records remain summary-only without solution access.
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
        rows={allVisibleRows}
        rowKey={(row) => `${row.runId}-${row.testId}`}
        emptyStateText={isLoading ? "Loading assigned tests..." : "No tests found for the selected status."}
      />

      {activeFilter === "completed" || activeFilter === "all" ? (
        <div className="student-my-tests-pagination" aria-label="Completed test pagination controls">
          <button
            type="button"
            disabled={completedPage <= 1 || isLoading}
            onClick={() => setCompletedPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <p>
            Completed Page {completedPage} · Showing up to {completedPageSize()} per page
          </p>
          <button
            type="button"
            disabled={!completedHasMore || isLoading}
            onClick={() => setCompletedPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      {activeFilter === "archived" ? (
        <p className="student-content-note">
          Archived view is COLD summary-only and intentionally excludes solution assets, direct question URLs, and
          tutorial links.
        </p>
      ) : null}

      {openSolutionTest ? (
        <section className="student-my-tests-solution-view" aria-label="Solution view">
          <h3>{`Solutions — ${openSolutionTest.testName}`}</h3>
          <p>
            Lazy-loaded question and solution assets for current academic year only.
          </p>

          {solutionError ? <p className="student-my-tests-inline-note">{solutionError}</p> : null}

          {isLoadingSolution ? <p>Loading solution assets...</p> : null}

          {!isLoadingSolution && solutionItems.length > 0 ? (
            <div className="student-my-tests-solution-grid">
              {solutionItems.map((item) => (
                <article key={item.questionId} className="student-my-tests-solution-card">
                  <h4>{`Question ${item.questionId}`}</h4>
                  <div className="student-my-tests-solution-images">
                    <img src={item.questionImageUrl} alt={`Question ${item.questionId}`} loading="lazy" />
                    <img src={item.solutionImageUrl} alt={`Solution ${item.questionId}`} loading="lazy" />
                  </div>
                  <p>{`Correct: ${item.correctAnswer} · Your Answer: ${item.studentAnswer}`}</p>
                  <div className="student-my-tests-solution-links">
                    {item.tutorialVideoLink ? (
                      <a href={item.tutorialVideoLink} target="_blank" rel="noreferrer">
                        Tutorial Video
                      </a>
                    ) : null}
                    {item.simulationLink ? (
                      <a href={item.simulationLink} target="_blank" rel="noreferrer">
                        Simulation
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export default StudentMyTestsPage;
