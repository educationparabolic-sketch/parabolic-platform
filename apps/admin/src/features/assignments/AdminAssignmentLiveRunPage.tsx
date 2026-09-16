import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import type {
  AdminRunLiveDetailResult,
  AdminRunLiveStudentRecord,
  AdminRunSessionOverrideType,
} from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { shouldUseLiveApi } from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";
import {
  applyAdminSessionOverride,
  fetchAdminLiveRun,
  fetchAdminRunHistory,
  resendAdminRunNotifications,
  updateAdminRunLifecycle,
} from "./assignmentOperationsApi";

function commandKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `admin-assignment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function describeError(error: unknown): string {
  return error instanceof ApiClientError
    ? `${error.code} (${error.status}): ${error.message}`
    : error instanceof Error ? error.message : "Unexpected assignment operation failure.";
}

async function loadCompleteLiveDetail(runId: string): Promise<AdminRunLiveDetailResult> {
  const first = await fetchAdminLiveRun(runId, { limit: 50 });
  if (!first.nextCursor) return first;
  const second = await fetchAdminLiveRun(runId, { cursor: first.nextCursor, limit: 50 });
  if (second.nextCursor) throw new Error("Live detail exceeded the supported 100-recipient bound.");
  return {
    ...second,
    students: [...first.students, ...second.students],
  };
}

async function verifyTerminalRun(runId: string, status: "completed" | "terminated"): Promise<void> {
  let cursor: string | undefined;
  for (let page = 0; page < 2; page += 1) {
    const result = await fetchAdminRunHistory({ cursor, limit: 50, status });
    if (result.runs.some((row) => row.run.id === runId)) return;
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  throw new Error("The terminated run was not present in the bounded authoritative history reload.");
}

function AdminAssignmentLiveRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { session } = useAuthProvider();
  const role = resolveAdminAccessContext(session).role;
  const canManage = shouldUseLiveApi() && (role === "teacher" || role === "admin");
  const retryKeys = useRef(new Map<string, string>());
  const [detail, setDetail] = useState<AdminRunLiveDetailResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extensionMinutes, setExtensionMinutes] = useState("15");
  const [justification, setJustification] = useState("");

  const reload = useCallback(async (): Promise<AdminRunLiveDetailResult> => {
    if (!runId) throw new Error("The live route is missing its run identifier.");
    const result = await loadCompleteLiveDetail(runId);
    setDetail(result);
    return result;
  }, [runId]);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setError("Authoritative live detail is available only when the live API is enabled; no fixture has been substituted.");
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const result = await loadCompleteLiveDetail(runId ?? "");
        if (mounted) setDetail(result);
      } catch (caught) {
        if (mounted) setError(`GET /admin/live-runs/{runId} failed: ${describeError(caught)}`);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [runId]);

  function idempotencyKey(action: string): string {
    const existing = retryKeys.current.get(action);
    if (existing) return existing;
    const created = commandKey();
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
      setError(`${action} failed: ${describeError(caught)} Retrying this action will reuse its idempotency key.`);
    } finally {
      setPendingAction(null);
    }
  }

  async function extendRun(): Promise<void> {
    if (!detail || !runId) return;
    const minutes = Number(extensionMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || !justification.trim()) {
      setError("Enter 1–1440 extension minutes and a justification.");
      return;
    }
    const expectedRevision = detail.run.revision;
    await runCommand("Extend run", async () => {
      const result = await updateAdminRunLifecycle(runId, {
        action: "extend",
        expectedRevision,
        extensionMinutes: minutes,
        idempotencyKey: idempotencyKey("Extend run"),
        justification: justification.trim(),
      });
      const reloaded = await reload();
      if (reloaded.run.revision !== result.run.revision || reloaded.run.endWindow !== result.run.endWindow) {
        throw new Error("Authoritative reload did not match the extend command result.");
      }
      return `Run extended to ${formatDateTime(reloaded.run.endWindow)} and reconciled at revision ${reloaded.run.revision}.`;
    });
  }

  async function resendNotifications(): Promise<void> {
    if (!detail || !runId) return;
    const expectedRevision = detail.run.revision;
    await runCommand("Resend notifications", async () => {
      const result = await resendAdminRunNotifications(runId, {
        expectedRevision,
        idempotencyKey: idempotencyKey("Resend notifications"),
      });
      const reloaded = await reload();
      if (reloaded.run.revision !== expectedRevision + 1) {
        throw new Error("Authoritative reload did not advance the run revision after notification resend.");
      }
      return `${result.queuedNotificationCount} notification jobs queued and reconciled at run revision ${reloaded.run.revision}.`;
    });
  }

  async function terminateRun(): Promise<void> {
    if (!detail || !runId || !justification.trim()) {
      setError("Enter a justification before terminating the run.");
      return;
    }
    const expectedRevision = detail.run.revision;
    await runCommand("Terminate run", async () => {
      const result = await updateAdminRunLifecycle(runId, {
        action: "terminate",
        expectedRevision,
        idempotencyKey: idempotencyKey("Terminate run"),
        justification: justification.trim(),
      });
      if (result.run.status !== "terminated" || result.recoveryState !== "complete") {
        throw new Error("Termination did not return a complete terminal result.");
      }
      await verifyTerminalRun(runId, "terminated");
      navigate("/admin/assignments/history", { replace: true });
      return `Run ${runId} terminated and reconciled from authoritative history.`;
    });
  }

  async function overrideSession(student: AdminRunLiveStudentRecord, overrideType: AdminRunSessionOverrideType): Promise<void> {
    if (!detail || !runId || !student.sessionId || !student.sessionRevision || !justification.trim()) {
      setError("A persisted session revision and justification are required for an override.");
      return;
    }
    const action = `${overrideType}:${student.sessionId}`;
    const expectedRunRevision = detail.run.revision;
    await runCommand(action, async () => {
      const result = await applyAdminSessionOverride(runId, student.sessionId!, {
        expectedRunRevision,
        expectedSessionRevision: student.sessionRevision!,
        idempotencyKey: idempotencyKey(action),
        justification: justification.trim(),
        overrideType,
      });
      try {
        const reloaded = await reload();
        const reloadedStudent = reloaded.students.find((row) => row.sessionId === result.sessionId);
        if (!reloadedStudent || reloadedStudent.sessionRevision !== result.sessionRevision || reloadedStudent.status !== result.sessionStatus) {
          throw new Error("Authoritative live reload did not match the session override result.");
        }
      } catch (caught) {
        if (overrideType !== "force_submit") throw caught;
        if (result.sessionStatus !== "submitted") throw caught;
        try {
          await verifyTerminalRun(runId, "completed");
        } catch {
          await verifyTerminalRun(runId, "terminated");
        }
      }
      return `${overrideType === "force_submit" ? "Force submit" : "Minimum-time bypass"} reconciled for ${student.studentName} at session revision ${result.sessionRevision}.`;
    });
  }

  const columns: UiTableColumn<AdminRunLiveStudentRecord>[] = [
    {
      id: "student",
      header: "Student",
      render: (row) => <div className="admin-assignments-run-cell"><strong>{row.studentName}</strong><small>{row.studentId}</small></div>,
    },
    { id: "status", header: "Session", render: (row) => `${row.status}${row.sessionRevision ? ` · r${row.sessionRevision}` : ""}` },
    { id: "progress", header: "Progress", render: (row) => `${row.progressPercent}%` },
    { id: "remaining", header: "Remaining", render: (row) => formatDuration(row.timeRemainingSeconds) },
    { id: "phase", header: "Phase", render: (row) => row.currentPhase ?? "Not stored" },
    {
      id: "signals",
      header: "Stored signals",
      render: (row) => (
        <div className="admin-assignments-table-stack">
          <span>Pacing {row.pacingDrift === null ? "not licensed/stored" : row.pacingDrift ? "drift" : "stable"}</span>
          <small>Minimum {row.minTimeViolationCount ?? "—"} · Maximum {row.maxTimeViolationCount ?? "—"} · Override {row.overrideUsed ? "used" : "not used"}</small>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Permitted controls",
      render: (row) => {
        const mutable = Boolean(row.sessionId && row.sessionRevision && !["submitted", "expired", "terminated"].includes(row.status));
        return (
          <div className="admin-assignments-row-actions">
            <button type="button" disabled={!canManage || !mutable || Boolean(pendingAction)} onClick={() => void overrideSession(row, "minimum_time_bypass")}>
              Bypass minimum time
            </button>
            <button type="button" disabled={!canManage || !mutable || Boolean(pendingAction)} onClick={() => void overrideSession(row, "force_submit")}>
              Force submit
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="admin-content-card admin-assignments-live-drilldown-shell" aria-labelledby="admin-assignment-live-run-title">
      <p className="admin-content-eyebrow">Assignment Live Monitor</p>
      <h2 id="admin-assignment-live-run-title">{detail?.run.id ?? runId ?? "Unknown run"}</h2>
      <p className="admin-content-copy">
        This view uses only <code>GET /admin/live-runs/{`{runId}`}</code> and persisted session projections. Face/camera overrides are intentionally unavailable until their policy owner is implemented.
      </p>
      <AssignmentsWorkspaceNav />
      <div className="admin-assignments-detail-actions">
        <NavLink className="admin-primary-link" to="/admin/assignments/live">Back to Live Runs</NavLink>
        <NavLink className="admin-primary-link" to={`/admin/assignments/details/${encodeURIComponent(runId ?? "")}`}>Run Setup</NavLink>
      </div>

      {error ? <p className="admin-tests-inline-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-assignments-inline-note" role="status">{notice}</p> : null}
      {isLoading ? <p className="admin-assignments-inline-note">Loading authoritative live detail…</p> : null}
      {!canManage ? <p className="admin-assignments-inline-note">Mutation controls require a live teacher/admin session.</p> : null}

      {detail ? (
        <>
          <div className="admin-assignments-detail-grid">
            <article className="admin-assignments-detail-card"><span>Status</span><strong>{detail.run.status}</strong><small>run revision {detail.run.revision}</small></article>
            <article className="admin-assignments-detail-card"><span>Recipients</span><strong>{detail.summary.totalRecipients}</strong><small>{detail.summary.notStartedCount} not started</small></article>
            <article className="admin-assignments-detail-card"><span>Active</span><strong>{detail.summary.activeSessionCount}</strong><small>persisted session states</small></article>
            <article className="admin-assignments-detail-card"><span>Submitted</span><strong>{detail.summary.submittedCount}</strong><small>{detail.summary.terminatedSessionCount} terminated</small></article>
            <article className="admin-assignments-detail-card"><span>End window</span><strong>{formatDateTime(detail.run.endWindow)}</strong><small>{detail.run.timezone}</small></article>
          </div>

          <section className="admin-assignments-detail-panel">
            <h3>Revision-bound run controls</h3>
            <label>
              Justification
              <input value={justification} maxLength={500} onChange={(event) => setJustification(event.target.value)} placeholder="Required audit justification" />
            </label>
            <label>
              Extension minutes
              <input type="number" min="1" max="1440" value={extensionMinutes} onChange={(event) => setExtensionMinutes(event.target.value)} />
            </label>
            <div className="admin-assignments-row-actions">
              <button type="button" disabled={!canManage || Boolean(pendingAction)} onClick={() => void extendRun()}>Extend window</button>
              <button type="button" disabled={!canManage || Boolean(pendingAction)} onClick={() => void resendNotifications()}>Resend notifications</button>
              <button type="button" disabled={!canManage || Boolean(pendingAction)} onClick={() => void terminateRun()}>Terminate run</button>
            </div>
            {pendingAction ? <p className="admin-assignments-inline-note">{pendingAction} is pending authoritative reconciliation…</p> : null}
          </section>

          <UiTable
            caption="Authoritative live student session projections"
            columns={columns}
            rows={detail.students}
            rowKey={(row) => row.studentId}
            emptyStateText="No recipient session projections are available."
          />
          <p className="admin-assignments-inline-note">Server snapshot: {formatDateTime(detail.serverTime)}</p>
        </>
      ) : null}
    </section>
  );
}

export default AdminAssignmentLiveRunPage;
