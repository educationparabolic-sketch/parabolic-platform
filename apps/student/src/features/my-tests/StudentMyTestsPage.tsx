import {toCdnAssetUrl} from "../../../../../shared/services/cdnAssetDelivery";
import {safeBusinessUrl} from "../../../../../shared/services/managedAssetPolicy";
import { useCallback, useEffect, useState } from "react";
import type { StudentCurrentTestRecord, StudentHistoryRecord, StudentSolutionsResultV2, StudentTestsQueryV2, StudentTestsResultV2 } from "../../../../../shared/contracts/studentEntitlements";
import StudentSummaryRead from "../../services/StudentSummaryRead";
import { fetchStudentSolutions, fetchStudentTestsPage, startStudentExamSession } from "./studentMyTestsDataset";

type Filter = "all" | "scheduled" | "active" | "completed" | "archived" | "history";
const filters: [Filter, string][] = [["all", "All"], ["scheduled", "Upcoming"], ["active", "In Progress"],
  ["completed", "Completed"], ["archived", "Closed Assignments"], ["history", "Past Years"]];
const percent = (value: number | null) => value === null ? "Unavailable" : `${Math.round(value)}%`;
const date = (value: string | null) => value === null ? "Unavailable" : new Date(value).toLocaleString();

export default function StudentMyTestsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [restart, setRestart] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const load = useCallback(() => {
    const query: StudentTestsQueryV2 = filter === "history" ? {scope: "history", pageSize: 5} :
      {scope: "current", status: filter, pageSize: 5};
    if (cursor) query.cursor = cursor;
    return fetchStudentTestsPage(query);
  }, [filter, cursor]);
  return <section className="student-content-card student-my-tests-page" aria-labelledby="student-my-tests-title">
    <h2 id="student-my-tests-title">My Tests</h2>
    <div role="tablist" aria-label="Filter by test status" className="student-my-tests-filter-grid">
      {filters.map(([id, label]) => <button type="button" role="tab" aria-selected={filter === id} key={id}
        onClick={() => { setFilter(id); setCursors([undefined]); }}>{label}</button>)}
    </div>
    <button type="button" onClick={() => { setCursors([undefined]); setRestart((v) => v + 1); }}>Restart test list</button>
    <StudentSummaryRead key={`${filter}:${cursor ?? ""}:${restart}`} load={load} label="tests">
      {(result) => <>
        <TestsContent key={`${result.scope.kind}:${result.scope.yearId}`} result={result} />
        <button type="button" disabled={!result.page.hasMore} onClick={() => setCursors((v) => [...v, result.page.nextCursor ?? undefined])}>Next tests</button>
      </>}
    </StudentSummaryRead>
    <nav aria-label="Test pagination">
      <button type="button" disabled={cursors.length <= 1} onClick={() => setCursors((v) => v.slice(0, -1))}>Previous tests</button>
      <span> Page {cursors.length} </span>
    </nav>
  </section>;
}

function TestsContent({result}: {result: StudentTestsResultV2}) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = result.page.items.filter((row) => {
    const timestamp = Date.parse(row.completedAt ?? ("startWindow" in row ? row.startWindow : ""));
    return row.testName.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!from || timestamp >= Date.parse(`${from}T00:00:00`)) && (!to || timestamp <= Date.parse(`${to}T23:59:59`));
  });
  return <>
    <p>{result.scope.kind === "history" ? "Past academic years — retained basic summaries only." : `Current academic year: ${result.scope.yearId}`}</p>
    <section aria-label="Search this test page">
      <label>Test Name<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <label>From Date<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>To Date<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button type="button" onClick={() => { setSearch(""); setFrom(""); setTo(""); }}>Clear filters</button>
      <p>Search and dates filter this page only. Use Next tests to examine more records.</p>
    </section>
    {rows.length === 0 ? <p>No retained tests on this page.{result.page.hasMore ? " More source records are available on the next page." : ""}</p> : null}
    {result.scope.kind === "history" ? <HistoryRows rows={rows as StudentHistoryRecord[]} /> :
      <CurrentRows key={`${search}:${from}:${to}`} rows={rows as StudentCurrentTestRecord[]} />}
  </>;
}
function HistoryRows({rows}: {rows: StudentHistoryRecord[]}) {
  return <table><caption>Past Year Test History</caption><thead><tr><th>Academic year</th><th>Test</th><th>Raw Score %</th><th>Accuracy %</th><th>Completed</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={`${row.academicYear}:${row.runId}`}><td>{row.academicYear}</td><td>{row.testName}</td>
      <td>{percent(row.rawScorePercent)}</td><td>{percent(row.accuracyPercent)}</td><td>{date(row.completedAt)}</td></tr>)}</tbody></table>;
}
function CurrentRows({rows}: {rows: StudentCurrentTestRecord[]}) {
  const [selection, setSelection] = useState<StudentCurrentTestRecord | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function launch(row: StudentCurrentTestRecord) {
    setLaunching(row.runId); setError(null);
    try { window.location.assign((await startStudentExamSession(row)).examUrl); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Test launch unavailable."); }
    finally { setLaunching(null); }
  }
  if (selection) return <SolutionReview test={selection} close={() => setSelection(null)} />;
  return <section aria-label="Assigned tests" className="student-test-list">
    {error ? <p role="alert">{error}</p> : null}
    {rows.map((row) => <article key={`${row.academicYear}:${row.runId}`} className="student-test-card">
      <div className="student-test-card-main"><h3>{row.testName}</h3><p>{row.status} · {row.mode}</p>
        {row.status === "completed" ? <div><p>Raw Score % {percent(row.rawScorePercent)} · Accuracy % {percent(row.accuracyPercent)} · Completed {date(row.completedAt)}</p>
          <p>Time Used {row.timeUsedMinutes === null ? "Unavailable" : `${Math.round(row.timeUsedMinutes)} min`} · Rank {row.rankInBatch === null ? "Unavailable" : `#${row.rankInBatch}`}</p></div> :
          <p>{date(row.startWindow)} – {date(row.endWindow)}</p>}
      </div>
      {row.status === "scheduled" || row.status === "active" ? <button type="button" disabled={launching !== null}
        onClick={() => { void launch(row); }}>{launching === row.runId ? "Opening..." : row.status === "active" ? "Resume" : "Start Test"}</button> : null}
      {row.status === "completed" ? <div>
        <button type="button" disabled={row.solutionAccess.state !== "available"} onClick={() => setSelection(row)}>View Solutions</button>
        {row.solutionAccess.state === "locked" ? <p>Solutions {row.solutionAccess.reason === "not_released" ? "not released yet" : "unavailable"}.</p> : null}
      </div> : null}
      {row.status === "archived" ? <p>Closed current-year assignment. Execution and review unavailable.</p> : null}
    </article>)}
  </section>;
}
function SolutionReview({test, close}: {test: StudentCurrentTestRecord; close: () => void}) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const load = useCallback(() => fetchStudentSolutions(test.testId, test.runId, cursor), [test.testId, test.runId, cursor]);
  return <section aria-label="Solution review"><h3>{test.testName}</h3>
    <button type="button" onClick={close}>Back to My Tests</button>
    <button type="button" onClick={() => setCursors([undefined])}>Restart solutions</button>
    <StudentSummaryRead key={`${test.academicYear}:${test.runId}:${cursor ?? ""}`} load={load} label="solutions">
      {(result) => <>
        <ReleasedSolutions result={result} yearId={test.academicYear} />
        <button type="button" disabled={!result.page.hasMore} onClick={() => setCursors((v) => [...v, result.page.nextCursor ?? undefined])}>Next solutions</button>
      </>}
    </StudentSummaryRead>
    <button type="button" disabled={cursors.length <= 1} onClick={() => setCursors((v) => v.slice(0, -1))}>Previous solutions</button>
    <span> Page {cursors.length} </span>
  </section>;
}
function ReleasedSolutions({result, yearId}: {result: StudentSolutionsResultV2; yearId: string}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (result.scope.yearId !== yearId) return <p role="alert">The academic year changed. Return to My Tests and refresh.</p>;
  return <div className="student-my-tests-solution-grid">
    {result.page.items.length === 0 ? <p>No released solutions on this page.</p> : null}
    {result.page.items.map((item) => <article key={`${item.questionId}:${item.questionRevision}`} className="student-my-tests-solution-card">
      <h4>Question {item.questionId}</h4>
      {item.assetsExpireAt !== null && Date.parse(item.assetsExpireAt) <= now ? <p>Solution images expired. Refresh solutions to request access again.</p> : <>
        {item.questionImageUrl ? <img src={toCdnAssetUrl(item.questionImageUrl)} alt={`Question ${item.questionId}`} /> : <p>Question image unavailable.</p>}
        {item.solutionImageUrl ? <img src={toCdnAssetUrl(item.solutionImageUrl)} alt={`Solution ${item.questionId}`} /> : <p>Solution image unavailable.</p>}
      </>}
      <p>Correct Answer: {item.correctAnswer} · Student Response: {item.studentAnswer ?? "Unanswered"}</p>
      {item.tutorialVideoLink ? <a href={safeBusinessUrl(item.tutorialVideoLink)} target="_blank" rel="noreferrer">Video</a> : null}
      {item.simulationLink ? <a href={safeBusinessUrl(item.simulationLink)} target="_blank" rel="noreferrer">Simulation</a> : null}
    </article>)}
  </div>;
}
