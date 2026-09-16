import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminRunHistoryRecord,
  AdminRunMode,
  AdminRunTerminalStatus,
} from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { shouldUseLiveApi } from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";
import { fetchAdminRunDetail } from "./assignmentRunsApi";
import {
  duplicateAdminRun,
  fetchAdminRunHistory,
  reassignAdminRun,
  updateAdminRunLifecycle,
} from "./assignmentOperationsApi";

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `admin-history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function futureLocal(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60_000);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function isoFromLocal(value: string): string {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error("Enter valid start and end windows.");
  return parsed.toISOString();
}

function describeError(error: unknown): string {
  return error instanceof ApiClientError
    ? `${error.code} (${error.status}): ${error.message}`
    : error instanceof Error ? error.message : "Unexpected assignment history failure.";
}

function AdminAssignmentsHistoryPage() {
  const { session } = useAuthProvider();
  const role = resolveAdminAccessContext(session).role;
  const canManage = shouldUseLiveApi() && (role === "teacher" || role === "admin");
  const retryKeys = useRef(new Map<string, string>());
  const [rows, setRows] = useState<AdminRunHistoryRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminRunTerminalStatus | "all">("all");
  const [mode, setMode] = useState<AdminRunMode | "all">("all");
  const [academicYear, setAcademicYear] = useState("");
  const [selected, setSelected] = useState<AdminRunHistoryRecord | null>(null);
  const [startWindow, setStartWindow] = useState(() => futureLocal(24 * 60));
  const [endWindow, setEndWindow] = useState(() => futureLocal(25 * 60));
  const [recipientIds, setRecipientIds] = useState("");
  const [justification, setJustification] = useState("");

  const query = useMemo(() => ({
    ...(academicYear.trim() ? { academicYear: academicYear.trim() } : {}),
    ...(mode === "all" ? {} : { mode }),
    ...(status === "all" ? {} : { status }),
  }), [academicYear, mode, status]);

  const load = useCallback(async (): Promise<void> => {
    if (!shouldUseLiveApi()) {
      setRows([]);
      setError("Authoritative assignment history is available only when the live API is enabled; no fixture has been substituted.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAdminRunHistory({ ...query, limit: 50 });
      setRows(result.runs);
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setRows([]);
      setNextCursor(null);
      setError(`GET /admin/run-history failed: ${describeError(caught)}`);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  function selectRun(row: AdminRunHistoryRecord): void {
    setSelected(row);
    setRecipientIds(row.run.recipientStudentIds.join(", "));
    setJustification("");
    setNotice(null);
    setError(null);
  }

  function retryKey(action: string): string {
    const existing = retryKeys.current.get(action);
    if (existing) return existing;
    const created = idempotencyKey();
    retryKeys.current.set(action, created);
    return created;
  }

  async function runCommand(action: string, operation: () => Promise<string>): Promise<void> {
    if (!canManage || pendingAction) return;
    setPendingAction(action);
    setError(null);
    setNotice(null);
    try {
      const message = await operation();
      retryKeys.current.delete(action);
      setNotice(message);
    } catch (caught) {
      setError(`${action} failed: ${describeError(caught)} Retrying will reuse the idempotency key.`);
    } finally {
      setPendingAction(null);
    }
  }

  async function createDerived(kind: "duplicate" | "reassign"): Promise<void> {
    if (!selected) return;
    const start = isoFromLocal(startWindow);
    const end = isoFromLocal(endWindow);
    if (Date.parse(end) <= Date.parse(start)) {
      setError("The new end window must be later than its start window.");
      return;
    }
    const action = `${kind}:${selected.run.id}`;
    await runCommand(kind === "duplicate" ? "Duplicate run" : "Reassign run", async () => {
      const common = {
        endWindow: end,
        expectedSourceRevision: selected.run.revision,
        idempotencyKey: retryKey(action),
        startWindow: start,
        timezone: selected.run.timezone,
      };
      const result = kind === "duplicate"
        ? await duplicateAdminRun(selected.run.id, common)
        : await reassignAdminRun(selected.run.id, {
          ...common,
          recipientStudentIds: Array.from(new Set(recipientIds.split(",").map((value) => value.trim()).filter(Boolean))),
        });
      const reloaded = await fetchAdminRunDetail(result.run.id);
      if (reloaded.run.id !== result.run.id || reloaded.run.startWindow !== result.run.startWindow || reloaded.run.endWindow !== result.run.endWindow) {
        throw new Error("The new run did not match its authoritative detail reload.");
      }
      if (kind === "reassign" && reloaded.run.recipientStudentIds.join("|") !== result.run.recipientStudentIds.join("|")) {
        throw new Error("The reassigned recipients did not match authoritative detail.");
      }
      retryKeys.current.delete(action);
      return `${kind === "duplicate" ? "Duplicated" : "Reassigned"} as ${result.run.id}; the scheduled run was reconciled through GET /admin/runs/{runId}.`;
    });
  }

  async function archiveSelected(): Promise<void> {
    if (!selected || !justification.trim()) {
      setError("Select a run and enter an archive justification.");
      return;
    }
    const action = `archive:${selected.run.id}`;
    await runCommand("Archive run", async () => {
      const result = await updateAdminRunLifecycle(selected.run.id, {
        action: "archive",
        expectedRevision: selected.run.revision,
        idempotencyKey: retryKey(action),
        justification: justification.trim(),
      });
      const reloaded = await fetchAdminRunHistory({ academicYear: result.run.academicYear, limit: 50, status: "archived" });
      const match = reloaded.runs.find((row) => row.run.id === selected.run.id);
      if (!match || match.run.revision !== result.run.revision) {
        throw new Error("The archived run did not match its authoritative history reload.");
      }
      retryKeys.current.delete(action);
      setSelected(match);
      await load();
      return `${match.run.id} archived and reconciled at revision ${match.run.revision}.`;
    });
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const result = await fetchAdminRunHistory({ ...query, cursor: nextCursor, limit: 50 });
      setRows((current) => {
        const byId = new Map(current.map((row) => [row.run.id, row]));
        result.runs.forEach((row) => byId.set(row.run.id, row));
        return Array.from(byId.values());
      });
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setError(`History pagination failed: ${describeError(caught)}`);
    } finally {
      setIsLoading(false);
    }
  }

  const columns = useMemo<UiTableColumn<AdminRunHistoryRecord>[]>(() => [
    {
      id: "run",
      header: "Run",
      render: (row) => <div className="admin-assignments-run-cell"><strong>{row.run.id}</strong><small>{row.run.testId} · revision {row.run.revision}</small></div>,
    },
    { id: "status", header: "Status", render: (row) => row.run.status },
    { id: "mode", header: "Mode", render: (row) => row.run.mode },
    { id: "year", header: "Academic year", render: (row) => row.run.academicYear },
    { id: "completion", header: "Completion", render: (row) => `${row.analytics.completionPercent}%` },
    { id: "score", header: "Average score", render: (row) => row.analytics.avgRawScorePercent === null ? "Not stored" : `${row.analytics.avgRawScorePercent}%` },
    {
      id: "actions",
      header: "Actions",
      render: (row) => <button type="button" disabled={!canManage || Boolean(pendingAction)} onClick={() => selectRun(row)}>Select operation</button>,
    },
  ], [canManage, pendingAction]);

  return (
    <section className="admin-content-card" aria-labelledby="admin-assignment-history-title">
      <p className="admin-content-eyebrow">Assignments History</p>
      <h2 id="admin-assignment-history-title">Authoritative Terminal Run History</h2>
      <p className="admin-content-copy">Terminal runs and license-redacted analytics come only from <code>GET /admin/run-history</code>.</p>
      <AssignmentsWorkspaceNav />

      <div className="admin-assignments-filter-grid">
        <label>Academic year<input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="Current year by default" /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as AdminRunTerminalStatus | "all")}><option value="all">All terminal</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="terminated">Terminated</option><option value="archived">Archived</option></select></label>
        <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as AdminRunMode | "all")}><option value="all">All modes</option><option value="Operational">Operational</option><option value="Diagnostic">Diagnostic</option><option value="Controlled">Controlled</option><option value="Hard">Hard</option></select></label>
      </div>

      {error ? <p className="admin-tests-inline-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-assignments-inline-note" role="status">{notice}</p> : null}
      {isLoading ? <p className="admin-assignments-inline-note">Loading authoritative history…</p> : null}
      {!canManage ? <p className="admin-assignments-inline-note">History remains readable, but commands require a live teacher/admin session.</p> : null}

      <UiTable caption="Authoritative terminal assignment history" columns={columns} rows={rows} rowKey={(row) => row.run.id} emptyStateText="No terminal runs matched these filters." />
      {nextCursor ? <button type="button" disabled={isLoading} onClick={() => void loadMore()}>Load more history</button> : null}

      {selected ? (
        <section className="admin-assignments-detail-panel">
          <h3>Operations for {selected.run.id}</h3>
          <p>Commands use source revision {selected.run.revision}. A successful command is not reported until its authoritative read-back matches.</p>
          <div className="admin-assignments-filter-grid">
            <label>New start<input type="datetime-local" value={startWindow} onChange={(event) => setStartWindow(event.target.value)} /></label>
            <label>New end<input type="datetime-local" value={endWindow} onChange={(event) => setEndWindow(event.target.value)} /></label>
            <label>Reassignment student IDs<textarea value={recipientIds} onChange={(event) => setRecipientIds(event.target.value)} /></label>
            <label>Archive justification<input maxLength={500} value={justification} onChange={(event) => setJustification(event.target.value)} /></label>
          </div>
          <div className="admin-assignments-row-actions">
            <button type="button" disabled={!canManage || Boolean(pendingAction)} onClick={() => void createDerived("duplicate")}>Duplicate as scheduled run</button>
            <button type="button" disabled={!canManage || Boolean(pendingAction) || !recipientIds.trim()} onClick={() => void createDerived("reassign")}>Reassign as scheduled run</button>
            <button type="button" disabled={!canManage || Boolean(pendingAction) || selected.run.status === "archived"} onClick={() => void archiveSelected()}>Archive run</button>
          </div>
          {pendingAction ? <p className="admin-assignments-inline-note">{pendingAction} is pending authoritative reconciliation…</p> : null}
        </section>
      ) : null}
    </section>
  );
}

export default AdminAssignmentsHistoryPage;
