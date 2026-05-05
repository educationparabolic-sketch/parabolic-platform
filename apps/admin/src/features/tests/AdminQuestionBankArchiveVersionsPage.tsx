import { useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

interface ArchiveLifecycleRecord {
  id: string;
  uniqueKey: string;
  subject: string;
  chapter: string;
  thermalState: "hot" | "warm" | "cold";
  version: number;
  status: "active" | "deprecated";
  usedCount: number;
  lastUsedDate: string;
  archiveBucket: string;
}

const ARCHIVE_LIFECYCLE_FIXTURES: ArchiveLifecycleRecord[] = [
  {
    id: "q-101",
    uniqueKey: "PH-KIN-001",
    subject: "Physics",
    chapter: "Kinematics",
    thermalState: "hot",
    version: 2,
    status: "active",
    usedCount: 3,
    lastUsedDate: "2026-04-10",
    archiveBucket: "hot-store",
  },
  {
    id: "q-102",
    uniqueKey: "PH-LOM-002",
    subject: "Physics",
    chapter: "Laws of Motion",
    thermalState: "warm",
    version: 1,
    status: "active",
    usedCount: 0,
    lastUsedDate: "2025-12-18",
    archiveBucket: "warm-store",
  },
  {
    id: "q-107",
    uniqueKey: "MA-QUA-007",
    subject: "Mathematics",
    chapter: "Quadratic Equations",
    thermalState: "hot",
    version: 2,
    status: "deprecated",
    usedCount: 4,
    lastUsedDate: "2026-03-28",
    archiveBucket: "hot-store",
  },
  {
    id: "q-110",
    uniqueKey: "PH-OPT-010",
    subject: "Physics",
    chapter: "Ray Optics",
    thermalState: "cold",
    version: 1,
    status: "active",
    usedCount: 0,
    lastUsedDate: "2023-11-02",
    archiveBucket: "archive-bucket",
  },
  {
    id: "q-111",
    uniqueKey: "CH-ION-011",
    subject: "Chemistry",
    chapter: "Ionic Equilibrium",
    thermalState: "cold",
    version: 1,
    status: "active",
    usedCount: 0,
    lastUsedDate: "2023-08-14",
    archiveBucket: "archive-bucket",
  },
];

function AdminQuestionBankArchiveVersionsPage() {
  const [records, setRecords] = useState<ArchiveLifecycleRecord[]>(ARCHIVE_LIFECYCLE_FIXTURES);
  const [inlineMessage, setInlineMessage] = useState(
    "Archive / Versions now has its own mounted workspace for HOT/WARM/COLD lifecycle review and version-safe controls.",
  );

  const hotCount = records.filter((record) => record.thermalState === "hot").length;
  const warmCount = records.filter((record) => record.thermalState === "warm").length;
  const coldCount = records.filter((record) => record.thermalState === "cold").length;
  const deprecatedCount = records.filter((record) => record.status === "deprecated").length;

  function createSuccessorVersion(questionId: string) {
    const target = records.find((record) => record.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount === 0) {
      setInlineMessage(`Version branching is only required for historically used questions. ${target.id} can still be edited in place.`);
      return;
    }

    const nextVersion = target.version + 1;
    const successor: ArchiveLifecycleRecord = {
      ...target,
      id: `${target.id}-v${nextVersion}`,
      uniqueKey: `${target.uniqueKey}-v${nextVersion}`,
      version: nextVersion,
      usedCount: 0,
      status: "active",
      thermalState: "warm",
      lastUsedDate: "Pending use",
      archiveBucket: "warm-store",
    };

    setRecords((current) => [
      successor,
      ...current.map((record) => (
        record.id === target.id ? { ...record, status: "deprecated" as const } : record
      )),
    ]);
    setInlineMessage(`Created successor version v${nextVersion} for ${target.id}. Previous version remains deprecated for audit-safe history.`);
  }

  const versionColumns: UiTableColumn<ArchiveLifecycleRecord>[] = [
    {
      id: "question",
      header: "Question",
      render: (record) => (
        <div className="admin-analytics-run-cell">
          <strong>{record.uniqueKey}</strong>
          <small>{record.subject} / {record.chapter}</small>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "Lifecycle",
      render: (record) => `${record.thermalState.toUpperCase()} / ${record.archiveBucket}`,
    },
    {
      id: "version",
      header: "Version / Status",
      render: (record) => `v${record.version} / ${record.status}`,
    },
    {
      id: "usage",
      header: "Used Count",
      render: (record) => record.usedCount,
    },
    {
      id: "lastUsed",
      header: "Last Used",
      render: (record) => record.lastUsedDate,
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (record) => (
        <div className="admin-tests-row-actions">
          <button type="button" onClick={() => createSuccessorVersion(record.id)}>
            Create Version
          </button>
          <button
            type="button"
            onClick={() => {
              setInlineMessage(
                record.thermalState === "cold" ?
                  `${record.id} is already cold and stored in archive media. Metadata remains queryable for historical runs.` :
                  `${record.id} remains in ${record.thermalState.toUpperCase()} state until inactivity thresholds move it deeper into the archive lifecycle.`,
              );
            }}
          >
            Review Lifecycle
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-archive-title">
      <p className="admin-content-eyebrow">Question Bank Archive / Versions</p>
      <h2 id="admin-question-bank-archive-title">Dedicated Archive and Version Workspace</h2>
      <p className="admin-content-copy">
        This route keeps <code>/admin/question-bank/archive</code> focused on HOT/WARM/COLD lifecycle visibility,
        deprecated-version review, and audit-safe successor creation instead of leaving those controls merged into
        library or upload workflows.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>HOT</p>
          <h3>{hotCount}</h3>
          <small>current-year actively used</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>WARM</p>
          <h3>{warmCount}</h3>
          <small>inactive recently but still active</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>COLD</p>
          <h3>{coldCount}</h3>
          <small>archived media, retained metadata</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Deprecated Versions</p>
          <h3>{deprecatedCount}</h3>
          <small>blocked from new template use</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Lifecycle Rules</h4>
          <p>HOT questions remain current-year active, WARM questions stay available but quieter, and COLD questions move media into archive storage while metadata remains visible.</p>
          <small>No historical-run deletion is allowed.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Version Integrity</h4>
          <p>Used questions branch through successor versions instead of structural mutation, and deprecated versions remain intact for long-term audit coverage.</p>
          <small>Matches the version-safe editing contract.</small>
        </article>
      </div>

      <UiTable
        caption="Question archive and version lifecycle"
        columns={versionColumns}
        rows={records}
        rowKey={(row) => row.id}
        emptyStateText="No archived or versioned questions are currently available."
      />
    </section>
  );
}

export default AdminQuestionBankArchiveVersionsPage;
