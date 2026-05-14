import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

const apiClient = getPortalApiClient("admin");

interface UploadLogRecord {
  created: number;
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  versionCreated: number;
}

const FALLBACK_UPLOAD_LOGS: UploadLogRecord[] = [
  {
    created: 19,
    id: "upl-2026-0412-001",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-12T08:30:00.000Z",
    totalRows: 124,
    errors: 0,
    warnings: 2,
    versionCreated: 19,
  },
  {
    created: 12,
    id: "upl-2026-0411-002",
    uploadedBy: "content.ops@parabolic.local",
    timestamp: "2026-04-11T11:15:00.000Z",
    totalRows: 86,
    errors: 4,
    warnings: 1,
    versionCreated: 12,
  },
  {
    created: 8,
    id: "upl-2026-0409-004",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-09T05:40:00.000Z",
    totalRows: 52,
    errors: 0,
    warnings: 0,
    versionCreated: 8,
  },
];

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeUploadLogRecord(value: unknown, index: number): UploadLogRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_UPLOAD_LOGS[index] ?? FALLBACK_UPLOAD_LOGS[0];

  return {
    created: Math.max(0, toNumberOrZero(record.created ?? fallback?.created ?? 0)),
    errors: Math.max(0, toNumberOrZero(record.errors ?? fallback?.errors ?? 0)),
    id: toNonEmptyString(record.id, fallback?.id ?? `upl-${index + 1}`),
    timestamp: toNonEmptyString(record.timestamp, fallback?.timestamp ?? new Date(0).toISOString()),
    totalRows: Math.max(0, toNumberOrZero(record.totalRows ?? fallback?.totalRows ?? 0)),
    uploadedBy: toNonEmptyString(record.uploadedBy, fallback?.uploadedBy ?? "unknown"),
    versionCreated: Math.max(0, toNumberOrZero(record.versionCreated ?? fallback?.versionCreated ?? 0)),
    warnings: Math.max(0, toNumberOrZero(record.warnings ?? fallback?.warnings ?? 0)),
  };
}

async function fetchUploadLogsFromApi(): Promise<UploadLogRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/upload-logs");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/upload-logs returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      logs?: unknown;
    };
  };
  const logs = Array.isArray(response.data?.logs) ? response.data?.logs : [];
  const normalizedLogs = logs
    .map((entry, index) => normalizeUploadLogRecord(entry, index))
    .filter((entry): entry is UploadLogRecord => Boolean(entry));

  if (normalizedLogs.length === 0) {
    return [];
  }

  return normalizedLogs;
}

function AdminQuestionBankValidationLogsPage() {
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>(FALLBACK_UPLOAD_LOGS);
  const [inlineMessage, setInlineMessage] = useState(
    "Validation logs now live in their own mounted workspace with immutable upload summaries.",
  );

  useEffect(() => {
    let isActive = true;

    async function loadUploadLogs(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setUploadLogs(FALLBACK_UPLOAD_LOGS);
        setInlineMessage("Local mode detected. Loaded deterministic question upload log fixtures.");
        return;
      }

      try {
        const nextLogs = await fetchUploadLogsFromApi();
        if (!isActive) {
          return;
        }

        setUploadLogs(nextLogs.length > 0 ? nextLogs : FALLBACK_UPLOAD_LOGS);
        setInlineMessage(
          nextLogs.length > 0 ?
            "Live mode enabled. Immutable upload logs hydrated from GET /admin/questions/upload-logs." :
            "Live mode enabled, but no persisted question upload logs were returned yet.",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question upload logs.";
        setUploadLogs(FALLBACK_UPLOAD_LOGS);
        setInlineMessage(`${reason} Falling back to deterministic validation log fixtures.`);
      }
    }

    void loadUploadLogs();

    return () => {
      isActive = false;
    };
  }, []);

  const totalRows = useMemo(() => uploadLogs.reduce((sum, log) => sum + log.totalRows, 0), [uploadLogs]);
  const totalIssues = useMemo(() => uploadLogs.reduce((sum, log) => sum + log.errors + log.warnings, 0), [uploadLogs]);
  const totalVersions = useMemo(() => uploadLogs.reduce((sum, log) => sum + log.versionCreated, 0), [uploadLogs]);

  const logColumns: UiTableColumn<UploadLogRecord>[] = [
    { id: "id", header: "Upload ID", render: (log) => log.id },
    { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
    { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
    { id: "rows", header: "Rows", render: (log) => log.totalRows },
    { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
    { id: "created", header: "Created", render: (log) => log.created },
    { id: "version", header: "Version Created", render: (log) => log.versionCreated },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-validation-logs-title">
      <p className="admin-content-eyebrow">Question Bank Validation Logs</p>
      <h2 id="admin-question-bank-validation-logs-title">Immutable Upload Log Review</h2>
      <p className="admin-content-copy">
        This dedicated route keeps <code>/admin/question-bank/validation-logs</code> separate from the upload and tag
        workflows. It surfaces immutable upload records, issue counts, and rollback context using log summaries only.
      </p>

      <QuestionBankWorkspaceNav />
      <p className="admin-tests-inline-note">{inlineMessage}</p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Upload Logs</p>
          <h3>{uploadLogs.length}</h3>
          <small>immutable log records</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Imported Rows</p>
          <h3>{totalRows}</h3>
          <small>rows evaluated across retained imports</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Validation Issues</p>
          <h3>{totalIssues}</h3>
          <small>combined errors and warnings</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Created Versions</p>
          <h3>{totalVersions}</h3>
          <small>new question versions persisted</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Immutable Logs</h4>
          <p>Each record captures uploader, timestamp, row volume, issue counts, and created-question totals without inline edits.</p>
          <small>Matches the validation-log storage contract in the source spec.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Live Read Path</h4>
          <p>This workspace now prefers persisted institute upload logs from the admin API instead of staying fully fixture-backed.</p>
          <small>Deterministic fallback remains available for local development.</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-validation-logs-table-title">
        <h3 id="admin-question-bank-validation-logs-table-title">Upload Log Table</h3>
        <UiTable
          caption="Question upload immutable validation logs"
          columns={logColumns}
          rows={uploadLogs}
          rowKey={(row) => row.id}
          emptyStateText="No upload logs are currently available."
        />
      </section>
    </section>
  );
}

export default AdminQuestionBankValidationLogsPage;
