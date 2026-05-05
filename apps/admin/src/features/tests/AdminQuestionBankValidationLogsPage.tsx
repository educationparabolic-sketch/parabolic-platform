import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

interface UploadLogRecord {
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  versionCreated: number;
  packageStatus: "blocked" | "imported" | "rolled_back";
}

const UPLOAD_LOGS: UploadLogRecord[] = [
  {
    id: "upl-2026-0412-001",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-12T08:30:00.000Z",
    totalRows: 124,
    errors: 0,
    warnings: 2,
    versionCreated: 19,
    packageStatus: "imported",
  },
  {
    id: "upl-2026-0411-002",
    uploadedBy: "content.ops@parabolic.local",
    timestamp: "2026-04-11T11:15:00.000Z",
    totalRows: 86,
    errors: 6,
    warnings: 1,
    versionCreated: 18,
    packageStatus: "blocked",
  },
  {
    id: "upl-2026-0409-004",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-09T05:40:00.000Z",
    totalRows: 52,
    errors: 0,
    warnings: 0,
    versionCreated: 17,
    packageStatus: "rolled_back",
  },
];

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function AdminQuestionBankValidationLogsPage() {
  const logColumns: UiTableColumn<UploadLogRecord>[] = [
    { id: "id", header: "Upload ID", render: (log) => log.id },
    { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
    { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
    { id: "rows", header: "Rows", render: (log) => log.totalRows },
    { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
    { id: "version", header: "Version", render: (log) => log.versionCreated },
    { id: "status", header: "Package Status", render: (log) => log.packageStatus },
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

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Upload Logs</p>
          <h3>{UPLOAD_LOGS.length}</h3>
          <small>immutable log records</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Blocked Packages</p>
          <h3>{UPLOAD_LOGS.filter((log) => log.packageStatus === "blocked").length}</h3>
          <small>row/schema issues prevented import</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Imported Versions</p>
          <h3>{UPLOAD_LOGS.filter((log) => log.packageStatus === "imported").length}</h3>
          <small>version-safe imports completed</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Rollback Cases</p>
          <h3>{UPLOAD_LOGS.filter((log) => log.packageStatus === "rolled_back").length}</h3>
          <small>unused-question rollback only</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Immutable Logs</h4>
          <p>Each record captures uploader, timestamp, row volume, issue counts, and created version without inline edits.</p>
          <small>Matches the validation-log storage contract in the source spec.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Rollback Guardrail</h4>
          <p>Rollback remains exceptional and only applies when imported questions are still unused in assigned templates.</p>
          <small>Historical run integrity stays intact.</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-question-bank-validation-logs-table-title">
        <h3 id="admin-question-bank-validation-logs-table-title">Upload Log Table</h3>
        <UiTable
          caption="Question upload immutable validation logs"
          columns={logColumns}
          rows={UPLOAD_LOGS}
          rowKey={(row) => row.id}
          emptyStateText="No upload logs are currently available."
        />
      </section>
    </section>
  );
}

export default AdminQuestionBankValidationLogsPage;
