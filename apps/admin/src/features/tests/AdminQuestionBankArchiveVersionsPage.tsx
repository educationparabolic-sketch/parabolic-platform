import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import {
  shouldUseLiveApi as shouldUseConfiguredLiveApi,
} from "../../../../../shared/services/frontendEnvironment";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { QUESTION_BANK, type QuestionBankRecord } from "./testTemplateFixtures";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { createQuestionBankIdempotencyKey, createQuestionVersion, getQuestionLibrary } from "./questionBankApi";

interface ArchiveLifecycleRecord {
  id: string;
  uniqueKey: string;
  subject: string;
  chapter: string;
  thermalState: "hot" | "warm" | "cold";
  version: number;
  revision: number;
  status: "active" | "archived" | "deprecated" | "used";
  usedCount: number;
  lastUsedDate: string;
  archiveBucket: string;
  lifecycleRule: string;
  metadataTreatment: string;
  mediaTreatment: string;
  transitionReadiness: string;
  nextOperatorAction: string;
}

interface LifecyclePolicyRow {
  tier: string;
  trigger: string;
  metadataTreatment: string;
  mediaTreatment: string;
  operatorAction: string;
}

function shouldUseLiveApi(): boolean {
  return shouldUseConfiguredLiveApi();
}

function toArchiveBucket(thermalState: ArchiveLifecycleRecord["thermalState"]): string {
  if (thermalState === "hot") {
    return "CloudStorage/{instituteId}/questionBank/{questionId}/";
  }

  if (thermalState === "warm") {
    return "questionBank active metadata + warm media cache";
  }

  return "archive storage bucket";
}

function toLastUsedDate(
  thermalState: ArchiveLifecycleRecord["thermalState"],
  usedCount: number,
  sourceLastUsedDate?: string | null,
): string {
  if (sourceLastUsedDate) {
    return sourceLastUsedDate;
  }

  if (thermalState === "hot") {
    return "Current-year active";
  }

  if (usedCount > 0) {
    return thermalState === "warm" ? "Historically used" : "Historical archive";
  }

  return thermalState === "cold" ? "Archive candidate" : "Pending use";
}

function toLifecycleRule(thermalState: ArchiveLifecycleRecord["thermalState"]): string {
  if (thermalState === "hot") {
    return "Used in the current academic year.";
  }

  if (thermalState === "warm") {
    return "Unused recently but still active for future templates.";
  }

  return "Unused for more than 2 years.";
}

function toMetadataTreatment(thermalState: ArchiveLifecycleRecord["thermalState"]): string {
  if (thermalState === "cold") {
    return "Metadata retained for historical run lookup.";
  }

  return "Metadata remains indexed and filterable in questionBank.";
}

function toMediaTreatment(thermalState: ArchiveLifecycleRecord["thermalState"]): string {
  if (thermalState === "cold") {
    return "Images moved to archive storage bucket.";
  }

  if (thermalState === "warm") {
    return "Images retained without eager table loading.";
  }

  return "Images remain in active question-bank storage.";
}

function toTransitionReadiness(question: QuestionBankRecord): string {
  if (question.status === "deprecated") {
    return "Deprecated: blocked from new templates, retained for audit.";
  }

  if (question.thermalState === "cold") {
    return "COLD complete: metadata retained, historical deletion blocked.";
  }

  if (question.thermalState === "warm") {
    return question.usedCount === 0 ?
      "Eligible to remain active or transition to COLD after 2 inactive years." :
      "Historically used: version before structural edits.";
  }

  return "HOT protected: keep active while current-year templates depend on it.";
}

function toNextOperatorAction(question: QuestionBankRecord): string {
  if (question.status === "deprecated") {
    return "Review audit lineage only.";
  }

  if (question.thermalState === "cold") {
    return "Verify archived media path; do not delete metadata.";
  }

  if (question.usedCount > 0) {
    return "Create successor version for structural change.";
  }

  return "Keep active or edit flexible metadata.";
}

function toArchiveLifecycleRecord(
  question: QuestionBankRecord,
): ArchiveLifecycleRecord {
  return {
    archiveBucket: toArchiveBucket(question.thermalState),
    chapter: question.chapter,
    id: question.id,
    lastUsedDate: toLastUsedDate(question.thermalState, question.usedCount, question.lastUsedDate),
    lifecycleRule: toLifecycleRule(question.thermalState),
    mediaTreatment: toMediaTreatment(question.thermalState),
    metadataTreatment: toMetadataTreatment(question.thermalState),
    nextOperatorAction: toNextOperatorAction(question),
    status: question.status,
    subject: question.subject,
    thermalState: question.thermalState,
    transitionReadiness: toTransitionReadiness(question),
    uniqueKey: question.uniqueKey,
    usedCount: question.usedCount,
    version: question.version,
    revision: question.revision ?? 1,
  };
}

const ARCHIVE_LIFECYCLE_FIXTURES: ArchiveLifecycleRecord[] =
  QUESTION_BANK.map(toArchiveLifecycleRecord);

const LIFECYCLE_POLICY_ROWS: LifecyclePolicyRow[] = [
  {
    tier: "HOT",
    trigger: "Question used in the current academic year.",
    metadataTreatment: "Indexed and operational in institutes/{id}/questions/{questionId}.",
    mediaTreatment: "Question and solution images stay in active question-bank storage.",
    operatorAction: "Use indexed filters, paginate, and version before structural change.",
  },
  {
    tier: "WARM",
    trigger: "Question is unused recently but remains active.",
    metadataTreatment: "Metadata stays retained and selectable for future templates.",
    mediaTreatment: "Media remains available without eager table-image loading.",
    operatorAction: "Review reuse, tags, and flexible metadata; wait for COLD threshold.",
  },
  {
    tier: "COLD",
    trigger: "Question unused for more than 2 years.",
    metadataTreatment: "Metadata remains permanently visible for historical audit lookup.",
    mediaTreatment: "Images move to archive storage bucket.",
    operatorAction: "Verify archive path; never delete questions tied to historical runs.",
  },
];

async function fetchArchiveLifecycleFromApi(): Promise<ArchiveLifecycleRecord[]> {
  return (await getQuestionLibrary({ limit: "100" })).questions
    .map(toArchiveLifecycleRecord);
}

function AdminQuestionBankArchiveVersionsPage() {
  const { session } = useAuthProvider();
  const role = resolveAdminAccessContext(session).role;
  const canManage = shouldUseLiveApi() && (role === "teacher" || role === "admin");
  const [records, setRecords] = useState<ArchiveLifecycleRecord[]>(() =>
    shouldUseLiveApi() ? [] : ARCHIVE_LIFECYCLE_FIXTURES);
  const [inlineMessage, setInlineMessage] = useState(
    "Archive / Versions now has its own mounted workspace for HOT/WARM/COLD lifecycle review and version-safe controls.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadArchiveLifecycle(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setRecords(ARCHIVE_LIFECYCLE_FIXTURES);
        setInlineMessage("Local mode detected. Loaded deterministic archive/version fixtures.");
        return;
      }

      setIsLoading(true);

      try {
        const nextRecords = await fetchArchiveLifecycleFromApi();
        if (!isActive) {
          return;
        }

        setRecords(nextRecords);
        setInlineMessage(
          nextRecords.length > 0 ?
            "Live mode enabled: archive/version lifecycle hydrated from GET /admin/questions/library." :
            "Live mode enabled, but no persisted archive/version records were returned yet.",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load archive/version lifecycle.";
        setInlineMessage(reason);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadArchiveLifecycle();

    return () => {
      isActive = false;
    };
  }, []);

  const hotCount = useMemo(() => records.filter((record) => record.thermalState === "hot").length, [records]);
  const warmCount = useMemo(() => records.filter((record) => record.thermalState === "warm").length, [records]);
  const coldCount = useMemo(() => records.filter((record) => record.thermalState === "cold").length, [records]);
  const deprecatedCount = useMemo(
    () => records.filter((record) => record.status === "deprecated").length,
    [records],
  );

  async function createSuccessorVersion(questionId: string) {
    const target = records.find((record) => record.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount === 0) {
      setInlineMessage(`Version branching is only required for historically used questions. ${target.id} can still be edited in place.`);
      return;
    }

    if (!canManage || pendingQuestionId) {
      setInlineMessage("Version creation requires a live teacher or admin session.");
      return;
    }
    setPendingQuestionId(target.id);
    try {
      const result = await createQuestionVersion(target.id, {
        expectedRevision: target.revision,
        idempotencyKey: createQuestionBankIdempotencyKey("archive-version"),
      });
      const nextRecords = await fetchArchiveLifecycleFromApi();
      if (!nextRecords.some((record) => record.id === result.successorQuestionId &&
        record.revision === result.successorRevision)) {
        throw new Error("Version created, but authoritative reload did not return its successor.");
      }
      setRecords(nextRecords);
      setInlineMessage(`Created and reloaded successor ${result.successorQuestionId}.`);
    } catch (error) {
      setInlineMessage(error instanceof Error ? error.message : "Question version creation failed.");
    } finally {
      setPendingQuestionId(null);
    }
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
      render: (record) => (
        <div className="admin-analytics-run-cell">
          <strong>{record.thermalState.toUpperCase()}</strong>
          <small>{record.lifecycleRule}</small>
        </div>
      ),
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
      id: "storage",
      header: "Storage Treatment",
      render: (record) => (
        <div className="admin-analytics-run-cell">
          <strong>{record.archiveBucket}</strong>
          <small>{record.mediaTreatment}</small>
        </div>
      ),
    },
    {
      id: "retention",
      header: "Retention / Readiness",
      render: (record) => (
        <div className="admin-analytics-run-cell">
          <strong>{record.lastUsedDate}</strong>
          <small>{record.transitionReadiness}</small>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (record) => (
        <div className="admin-tests-row-actions">
          <button type="button" onClick={() => void createSuccessorVersion(record.id)} disabled={!canManage || Boolean(pendingQuestionId) || record.usedCount === 0}>
            Create Version
          </button>
          <button
            type="button"
            onClick={() => {
              setInlineMessage(
                record.thermalState === "cold" ?
                  `${record.id} is COLD: ${record.mediaTreatment} ${record.metadataTreatment} ${record.nextOperatorAction}` :
                  `${record.id} is ${record.thermalState.toUpperCase()}: ${record.lifecycleRule} ${record.nextOperatorAction}`,
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
      {isLoading ? <p className="admin-analytics-inline-note">Loading archive/version lifecycle from GET /admin/questions/library...</p> : null}

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
          <p>HOT means used in the current academic year, WARM means unused recently but active, and COLD means unused for more than 2 years.</p>
          <small>COLD moves images to archive storage while metadata remains retained.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Version Integrity</h4>
          <p>Used questions branch through successor versions instead of structural mutation, and deprecated versions remain intact for long-term audit coverage.</p>
          <small>Never delete questions tied to historical runs.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Operator Boundary</h4>
          <p>Archive review is visibility-first: lifecycle transitions and media movement are surfaced here, while destructive deletion is not offered.</p>
          <small>Library tables still avoid full image loading and rely on indexed filters.</small>
        </article>
      </div>

      <UiTable
        caption="HOT/WARM/COLD lifecycle policy"
        columns={[
          {
            id: "tier",
            header: "Tier",
            render: (row) => row.tier,
          },
          {
            id: "trigger",
            header: "Trigger",
            render: (row) => row.trigger,
          },
          {
            id: "metadata",
            header: "Metadata",
            render: (row) => row.metadataTreatment,
          },
          {
            id: "media",
            header: "Media",
            render: (row) => row.mediaTreatment,
          },
          {
            id: "operator",
            header: "Operator Action",
            render: (row) => row.operatorAction,
          },
        ]}
        rows={LIFECYCLE_POLICY_ROWS}
        rowKey={(row) => row.tier}
        emptyStateText="No lifecycle policy rows are configured."
      />

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
