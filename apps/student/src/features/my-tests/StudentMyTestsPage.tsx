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
import { isStudentDebugMode } from "../../services/studentDebugMode";

type StatusFilter = "all" | StudentTestStatus;

interface StatusFilterChip {
  id: StatusFilter;
  label: string;
}

const STATUS_FILTERS: StatusFilterChip[] = [
  { id: "all", label: "All" },
  { id: "scheduled", label: "Upcoming" },
  { id: "active", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Older History" },
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

function formatOptionalDuration(minutes: number | null): string {
  if (minutes === null) {
    return "N/A";
  }

  return formatDuration(minutes);
}

function formatRank(rank: number | null): string {
  return rank === null ? "N/A" : `#${Math.round(rank)}`;
}

function formatAttemptStatus(row: StudentTestRecord): string {
  if (row.attemptStatusLabel) {
    return row.attemptStatusLabel;
  }

  if (row.attemptedQuestions !== null && row.totalQuestions !== null) {
    return `${Math.round(row.attemptedQuestions)} of ${Math.round(row.totalQuestions)} questions attempted`;
  }

  return "Attempt in progress";
}

function formatFlaggedStatus(row: StudentTestRecord): string {
  if (row.flaggedQuestions === null) {
    return "Review markers will appear after the test updates.";
  }

  return `${Math.round(row.flaggedQuestions)} flagged for review`;
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
      return "Upcoming";
    case "active":
      return "In Progress";
    case "completed":
      return "Completed";
    case "archived":
      return "Older History";
    default:
      return "Upcoming";
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
  const debugMode = isStudentDebugMode();
  const [scheduledTests, setScheduledTests] = useState<StudentTestRecord[]>([]);
  const [activeTests, setActiveTests] = useState<StudentTestRecord[]>([]);
  const [completedTests, setCompletedTests] = useState<StudentTestRecord[]>([]);
  const [archivedTests, setArchivedTests] = useState<StudentTestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [testNameQuery, setTestNameQuery] = useState("");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
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
            "Local mode detected. Build 128 fallback data loaded with separated upcoming, in-progress, completed, and older-history states.",
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
      setInlineMessage(`${reason} Please try again from your assigned test list.`);
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

  const statusRows = useMemo(() => {
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

  const allVisibleRows = useMemo(() => {
    const normalizedQuery = testNameQuery.trim().toLowerCase();
    const startEpoch = dateRangeStart ? Date.parse(`${dateRangeStart}T00:00:00`) : null;
    const endEpoch = dateRangeEnd ? Date.parse(`${dateRangeEnd}T23:59:59`) : null;

    return statusRows.filter((row) => {
      if (normalizedQuery && !row.testName.toLowerCase().includes(normalizedQuery)) {
        return false;
      }

      const rowDateSource = row.completedAt ?? row.startWindow;
      const rowEpoch = Date.parse(rowDateSource);
      if (!Number.isFinite(rowEpoch)) {
        return false;
      }

      if (startEpoch !== null && Number.isFinite(startEpoch) && rowEpoch < startEpoch) {
        return false;
      }

      if (endEpoch !== null && Number.isFinite(endEpoch) && rowEpoch > endEpoch) {
        return false;
      }

      return true;
    });
  }, [dateRangeEnd, dateRangeStart, statusRows, testNameQuery]);

  const summaryCounts = useMemo(() => {
    return {
      all: scheduledTests.length + activeTests.length + completedTotal + archivedTests.length,
      scheduled: scheduledTests.length,
      active: activeTests.length,
      completed: completedTotal,
      archived: archivedTests.length,
    };
  }, [activeTests.length, archivedTests.length, completedTotal, scheduledTests.length]);

  const archivedColumns = useMemo<UiTableColumn<StudentTestRecord>[]>(
    () => [
      {
        id: "test",
        header: "Test Name",
        render: (row) => (
          <div className="student-my-tests-test-cell">
            <strong>{row.testName}</strong>
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
      {
        id: "date",
        header: "Date",
        render: (row) => formatDateTime(row.completedAt ?? row.endWindow),
      },
    ],
    [],
  );

  const openSolutionTest = useMemo(() => {
    if (!openSolutionTestId) {
      return null;
    }

    return allVisibleRows.find((row) => row.testId === openSolutionTestId) ?? null;
  }, [allVisibleRows, openSolutionTestId]);

  function renderTestAction(row: StudentTestRecord) {
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
        <span className="student-my-tests-session-muted">History record</span>
        <small>Review locked for older history</small>
      </div>
    );
  }

  function renderTestMeta(row: StudentTestRecord) {
    if (row.status === "active") {
      return (
        <>
          <span>{formatAttemptStatus(row)}</span>
          <span>{formatFlaggedStatus(row)}</span>
          <span>{`Closes ${formatDateTime(row.endWindow)}`}</span>
        </>
      );
    }

    if (row.status === "completed" || row.status === "archived") {
      return (
        <>
          <span>{`Raw Score % ${formatPercent(row.rawScorePercent)}`}</span>
          <span>{`Accuracy % ${formatPercent(row.accuracyPercent)}`}</span>
          <span>{`Time Used ${formatOptionalDuration(row.timeUsedMinutes)}`}</span>
          <span>{`Rank ${formatRank(row.rankInBatch)}`}</span>
          <span>{row.completedAt ? `Completed ${formatDateTime(row.completedAt)}` : "Awaiting completion"}</span>
        </>
      );
    }

    return (
      <>
        <span>{`${formatDuration(row.durationMinutes)} · ${row.mode}`}</span>
        <span>{`Starts ${formatDateTime(row.startWindow)}`}</span>
        <span>{`Closes ${formatDateTime(row.endWindow)}`}</span>
      </>
    );
  }

  if (openSolutionTest) {
    return (
      <section className="student-content-card student-my-tests-page student-my-tests-drilldown-page" aria-labelledby="student-my-tests-solution-title">
        <div className="student-my-tests-drilldown-header">
          <div>
            <p className="student-content-eyebrow">Solution Review</p>
            <h2 id="student-my-tests-solution-title">{openSolutionTest.testName}</h2>
          </div>
          <button
            type="button"
            className="student-my-tests-action"
            onClick={() => {
              setOpenSolutionTestId(null);
              setSolutionItems([]);
              setSolutionError(null);
            }}
          >
            Back to My Tests
          </button>
        </div>

        <div className="student-my-tests-drilldown-meta" aria-label="Selected test summary">
          <span>{`Raw Score % ${formatPercent(openSolutionTest.rawScorePercent)}`}</span>
          <span>{`Accuracy % ${formatPercent(openSolutionTest.accuracyPercent)}`}</span>
          <span>{`Completed ${formatDateTime(openSolutionTest.completedAt)}`}</span>
        </div>

        {solutionError ? <p className="student-my-tests-inline-note">{solutionError}</p> : null}

        {isLoadingSolution ? <p className="student-learning-state">Preparing your solution review...</p> : null}

        {!isLoadingSolution && solutionItems.length > 0 ? (
          <div className="student-my-tests-solution-grid">
            {solutionItems.map((item) => (
              <article key={item.questionId} className="student-my-tests-solution-card">
                <div className="student-my-tests-solution-card-header">
                  <h3>{`Question ${item.questionId}`}</h3>
                  <span>{`Student Response: ${item.studentAnswer}`}</span>
                </div>
                <div className="student-my-tests-solution-images" aria-label={`Question and solution for ${item.questionId}`}>
                  <figure>
                    <img src={item.questionImageUrl} alt={`Question ${item.questionId}`} loading="lazy" />
                    <figcaption>Question Image</figcaption>
                  </figure>
                  <figure>
                    <img src={item.solutionImageUrl} alt={`Solution ${item.questionId}`} loading="lazy" />
                    <figcaption>Solution Image</figcaption>
                  </figure>
                </div>
                <div className="student-my-tests-response-row">
                  <span>{`Correct Answer: ${item.correctAnswer}`}</span>
                  <span>{`Student Response: ${item.studentAnswer}`}</span>
                </div>
                <div className="student-my-tests-solution-links">
                  {item.tutorialVideoLink ? (
                    <a href={item.tutorialVideoLink} target="_blank" rel="noreferrer">
                      Video Link
                    </a>
                  ) : (
                    <span>Video unavailable</span>
                  )}
                  {item.simulationLink ? (
                    <a href={item.simulationLink} target="_blank" rel="noreferrer">
                      Simulation Link
                    </a>
                  ) : (
                    <span>Simulation unavailable</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="student-content-card student-my-tests-page" aria-labelledby="student-my-tests-title">
      {debugMode ? <p className="student-content-eyebrow">Build 128</p> : null}
      <h2 id="student-my-tests-title">My Tests</h2>

      {debugMode && inlineMessage ? <p className="student-my-tests-inline-note">{inlineMessage}</p> : null}

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

      <section className="student-my-tests-search-panel" aria-label="Search and date filters">
        <label>
          Test Name
          <input
            type="search"
            value={testNameQuery}
            onChange={(event) => setTestNameQuery(event.target.value)}
            placeholder="Search by test name"
          />
        </label>
        <label>
          From Date
          <input
            type="date"
            value={dateRangeStart}
            onChange={(event) => setDateRangeStart(event.target.value)}
          />
        </label>
        <label>
          To Date
          <input
            type="date"
            value={dateRangeEnd}
            onChange={(event) => setDateRangeEnd(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setTestNameQuery("");
            setDateRangeStart("");
            setDateRangeEnd("");
          }}
          disabled={!testNameQuery && !dateRangeStart && !dateRangeEnd}
        >
          Clear
        </button>
      </section>

      {activeFilter === "archived" ? (
        <UiTable
          caption="Older Test History"
          columns={archivedColumns}
          rows={allVisibleRows}
          rowKey={(row) => `${row.runId}-${row.testId}`}
          emptyStateText={isLoading ? "Checking your older test history..." : "No older history yet."}
        />
      ) : (
        <section className="student-test-list" aria-label="Assigned tests">
          {isLoading ? <p className="student-learning-state">Checking your assigned tests...</p> : null}
          {!isLoading && allVisibleRows.length === 0 ? (
            <p className="student-empty-state">No tests found for this view. New assignments will appear here when they are ready.</p>
          ) : null}
          {allVisibleRows.map((row) => (
            <article key={`${row.runId}-${row.testId}`} className="student-test-card">
              <div className="student-test-card-main">
                <div>
                  <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                  <h3>{row.testName}</h3>
                </div>
                <div className="student-test-card-meta">
                  {renderTestMeta(row)}
                </div>
              </div>
              <div className="student-test-card-action">
                {renderTestAction(row)}
              </div>
            </article>
          ))}
        </section>
      )}

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
          Older-history tests are kept as summary records. Recent completed tests remain available for review when your
          learning plan includes review access, and active assignments stay ready to launch or resume. Students do not
          manually archive tests from this page.
        </p>
      ) : null}

    </section>
  );
}

export default StudentMyTestsPage;
