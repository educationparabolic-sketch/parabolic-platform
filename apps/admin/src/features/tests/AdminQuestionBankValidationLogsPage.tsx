import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminQuestionUploadLogDetailResult } from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { shouldUseLiveApi } from "../../../../../shared/services/frontendEnvironment";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import {
  createQuestionBankIdempotencyKey,
  getQuestionUploadLogDetail,
  getQuestionUploadLogs,
  rollbackQuestionPackage,
} from "./questionBankApi";

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function AdminQuestionBankValidationLogsPage() {
  const {session} = useAuthProvider();
  const role = resolveAdminAccessContext(session).role;
  const canManage = shouldUseLiveApi() && (role === "teacher" || role === "admin");
  const [logs, setLogs] = useState<AdminQuestionUploadLogDetailResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading immutable validation logs...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rollbackKeys = useRef<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!shouldUseLiveApi()) {
      setLogs([]);
      setMessage("Validation logs require live API mode; no fixture rollback authority is shown.");
      return;
    }
    const summaries = await getQuestionUploadLogs();
    const details = await Promise.all(summaries.map((log) => getQuestionUploadLogDetail(log.id)));
    setLogs(details);
    setMessage(details.length ? "Immutable validation rows and rollback authority loaded." : "No question package logs exist yet.");
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void reload().catch((error) => {
      if (active) setErrorMessage(error instanceof ApiClientError ? error.message : "Failed to load validation logs.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  async function rollback(log: AdminQuestionUploadLogDetailResult) {
    if (!canManage || !log.rollbackEligible || pendingLogId) return;
    const key = rollbackKeys.current[log.uploadLogId] ?? createQuestionBankIdempotencyKey("question-package-rollback");
    rollbackKeys.current[log.uploadLogId] = key;
    setPendingLogId(log.uploadLogId);
    setErrorMessage(null);
    try {
      const result = await rollbackQuestionPackage(log.uploadLogId, {
        expectedPackageRevision: log.packageRevision,
        idempotencyKey: key,
        reason: "Rolled back from the Admin immutable validation log review.",
      });
      await reload();
      const reloaded = await getQuestionUploadLogDetail(log.uploadLogId);
      if (reloaded.state !== "rolled_back" || reloaded.packageRevision !== result.packageRevision) {
        throw new Error("Rollback completed, but authoritative log reload did not reconcile it.");
      }
      delete rollbackKeys.current[log.uploadLogId];
      setMessage(`Rollback finalized for ${log.uploadLogId}; ${result.removedQuestionCount} questions and ${result.removedAssetCount} assets were removed.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Question package rollback failed.");
    } finally {
      setPendingLogId(null);
    }
  }

  const totals = useMemo(() => logs.reduce((result, log) => ({
    rows: result.rows + log.summary.received,
    issues: result.issues + log.summary.invalid + log.summary.warnings,
    versions: result.versions + log.summary.created + log.summary.updated,
  }), {rows: 0, issues: 0, versions: 0}), [logs]);
  const columns: UiTableColumn<AdminQuestionUploadLogDetailResult>[] = [
    {id: "id", header: "Upload ID", render: (log) => log.uploadLogId},
    {id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy},
    {id: "timestamp", header: "Validated", render: (log) => formatIsoDate(log.validatedAt)},
    {id: "state", header: "State", render: (log) => log.state},
    {id: "rows", header: "Rows", render: (log) => log.summary.received},
    {id: "issues", header: "Errors / Warnings", render: (log) => `${log.summary.invalid} / ${log.summary.warnings}`},
    {id: "rollback", header: "Rollback", render: (log) => (
      <button type="button" disabled={!canManage || !log.rollbackEligible || Boolean(pendingLogId)} onClick={() => void rollback(log)}>
        {pendingLogId === log.uploadLogId ? "Rolling back..." : log.rollbackEligible ? "Rollback" : "Blocked"}
      </button>
    )},
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-validation-logs-title">
      <p className="admin-content-eyebrow">Question Bank Validation Logs</p>
      <h2 id="admin-question-bank-validation-logs-title">Immutable Upload Log Review</h2>
      <p className="admin-content-copy">Review authoritative package state, row outcomes, and guarded create-only rollback eligibility.</p>
      <QuestionBankWorkspaceNav />
      <p className="admin-tests-inline-note">{isLoading ? "Loading authoritative validation logs..." : message}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}
      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card"><p>Upload Logs</p><h3>{logs.length}</h3><small>immutable package records</small></article>
        <article className="admin-analytics-kpi-card"><p>Evaluated Rows</p><h3>{totals.rows}</h3><small>authoritative row results</small></article>
        <article className="admin-analytics-kpi-card"><p>Validation Issues</p><h3>{totals.issues}</h3><small>errors and warnings</small></article>
        <article className="admin-analytics-kpi-card"><p>Created / Updated</p><h3>{totals.versions}</h3><small>committed question records</small></article>
        <article className="admin-analytics-kpi-card"><p>Rollback Eligible</p><h3>{logs.filter((log) => log.rollbackEligible).length}</h3><small>unchanged create-only packages</small></article>
      </div>
      <div className="admin-question-log-grid">
        {logs.map((log) => (
          <article key={log.uploadLogId} className="admin-question-log-card">
            <div className="admin-question-log-card-header"><div><h3>{log.uploadLogId}</h3><p>{log.uploadedBy} · {formatIsoDate(log.validatedAt)}</p></div><span>{log.state}</span></div>
            <div className="admin-question-log-stats"><span>{log.summary.received} rows</span><span>{log.summary.invalid} errors</span><span>{log.summary.warnings} warnings</span><span>revision {log.packageRevision}</span></div>
            <div className="admin-question-log-issue-grid">
              <div><strong>Errors</strong><ul>{log.rows.flatMap((row) => row.errors.map((issue) => <li key={`${row.rowNumber}:${issue}`}>Row {row.rowNumber}: {issue}</li>)).slice(0, 5)}</ul></div>
              <div><strong>Warnings</strong><ul>{log.rows.flatMap((row) => row.warnings.map((issue) => <li key={`${row.rowNumber}:${issue}`}>Row {row.rowNumber}: {issue}</li>)).slice(0, 5)}</ul></div>
            </div>
            <p className="admin-question-log-rollback-note">{log.rollbackEligible ? "Eligible: committed questions remain unchanged and unused." : log.rollbackReason ?? "Rollback is unavailable."}</p>
          </article>
        ))}
      </div>
      <UiTable caption="Question package validation authority" columns={columns} rows={logs} rowKey={(row) => row.uploadLogId} emptyStateText="No upload logs are available." />
    </section>
  );
}

export default AdminQuestionBankValidationLogsPage;
