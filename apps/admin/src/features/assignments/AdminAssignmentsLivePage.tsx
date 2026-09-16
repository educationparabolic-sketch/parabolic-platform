import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import type { AdminRunLiveListRecord } from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { shouldUseLiveApi } from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";
import { fetchAdminLiveRuns } from "./assignmentOperationsApi";

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? `GET /admin/live-runs failed with ${error.code} (${error.status}): ${error.message}`
    : error instanceof Error ? error.message : "Unable to load authoritative live assignments.";
}

function AdminAssignmentsLivePage() {
  const [rows, setRows] = useState<AdminRunLiveListRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!shouldUseLiveApi()) {
      setRows([]);
      setNextCursor(null);
      setServerTime(null);
      setError("Authoritative live monitoring is available only when the live API is enabled; no fixture has been substituted.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAdminLiveRuns({ limit: 50 });
      setRows(result.runs);
      setNextCursor(result.nextCursor);
      setServerTime(result.serverTime);
    } catch (caught) {
      setRows([]);
      setNextCursor(null);
      setServerTime(null);
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const result = await fetchAdminLiveRuns({ cursor: nextCursor, limit: 50 });
      setRows((current) => {
        const byId = new Map(current.map((row) => [row.run.id, row]));
        result.runs.forEach((row) => byId.set(row.run.id, row));
        return Array.from(byId.values());
      });
      setNextCursor(result.nextCursor);
      setServerTime(result.serverTime);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoadingMore(false);
    }
  }

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    active: summary.active + row.summary.activeSessionCount,
    recipients: summary.recipients + row.summary.totalRecipients,
    submitted: summary.submitted + row.summary.submittedCount,
  }), { active: 0, recipients: 0, submitted: 0 }), [rows]);

  const columns = useMemo<UiTableColumn<AdminRunLiveListRecord>[]>(() => [
    {
      id: "run",
      header: "Run",
      render: ({ run }) => (
        <div className="admin-assignments-run-cell">
          <strong>{run.id}</strong>
          <small>{run.testId} · version {run.templateVersion} · revision {run.revision}</small>
        </div>
      ),
    },
    { id: "mode", header: "Mode", render: ({ run }) => run.mode },
    { id: "status", header: "Status", render: ({ run }) => run.status },
    { id: "window", header: "Closes", render: ({ run }) => formatDateTime(run.endWindow) },
    {
      id: "sessions",
      header: "Session state",
      render: ({ summary }) => (
        <div className="admin-assignments-table-stack">
          <span>{summary.activeSessionCount} active · {summary.submittedCount} submitted</span>
          <small>{summary.notStartedCount} not started · {summary.terminatedSessionCount} terminated</small>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Action",
      render: ({ run }) => (
        <NavLink className="admin-primary-link" to={`/admin/assignments/live/${encodeURIComponent(run.id)}`}>
          Open live monitor
        </NavLink>
      ),
    },
  ], []);

  return (
    <section className="admin-content-card" aria-labelledby="admin-assignments-live-title">
      <p className="admin-content-eyebrow">Assignments Live Workspace</p>
      <h2 id="admin-assignments-live-title">Authoritative Live Runs</h2>
      <p className="admin-content-copy">
        Active and collecting runs come only from <code>GET /admin/live-runs</code>. Counts are bounded persisted
        session states; this page does not infer live state from completed analytics.
      </p>
      <AssignmentsWorkspaceNav />

      {error ? <p className="admin-tests-inline-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="admin-assignments-inline-note">Loading authoritative live runs…</p> : null}
      {serverTime ? <p className="admin-assignments-inline-note">Server snapshot: {formatDateTime(serverTime)}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card"><p>Live Runs</p><h3>{rows.length}</h3><small>loaded bounded records</small></article>
        <article className="admin-analytics-kpi-card"><p>Recipients</p><h3>{totals.recipients}</h3><small>assigned across loaded runs</small></article>
        <article className="admin-analytics-kpi-card"><p>Active Sessions</p><h3>{totals.active}</h3><small>persisted active states</small></article>
        <article className="admin-analytics-kpi-card"><p>Submitted</p><h3>{totals.submitted}</h3><small>persisted submissions</small></article>
      </div>

      <UiTable
        caption="Authoritative active assignment runs"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.run.id}
        emptyStateText={isLoading ? "Loading live runs…" : "No active or collecting runs are available."}
      />
      {nextCursor ? (
        <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore}>
          {isLoadingMore ? "Loading…" : "Load more live runs"}
        </button>
      ) : null}
    </section>
  );
}

export default AdminAssignmentsLivePage;
