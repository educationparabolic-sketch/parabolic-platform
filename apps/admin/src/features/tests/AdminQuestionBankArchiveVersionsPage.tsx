import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { QUESTION_BANK, type QuestionBankRecord } from "./testTemplateFixtures";

const apiClient = getPortalApiClient("admin");

interface ArchiveLifecycleRecord {
  id: string;
  uniqueKey: string;
  subject: string;
  chapter: string;
  thermalState: "hot" | "warm" | "cold";
  version: number;
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
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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

function toOptionalDateString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeThermalState(
  value: unknown,
  fallback: QuestionBankRecord["thermalState"],
): QuestionBankRecord["thermalState"] {
  return value === "hot" || value === "warm" || value === "cold" ? value : fallback;
}

function normalizeStatus(
  value: unknown,
  fallback: QuestionBankRecord["status"],
): QuestionBankRecord["status"] {
  return value === "active" || value === "used" || value === "archived" || value === "deprecated" ? value : fallback;
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

function normalizeQuestionRecord(value: unknown, index: number): QuestionBankRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = QUESTION_BANK[index] ?? QUESTION_BANK[0];

  return {
    academicYear: toNonEmptyString(record.academicYear, fallback?.academicYear ?? "unassigned"),
    additionalTag: toNonEmptyString(record.additionalTag, fallback?.additionalTag ?? "none"),
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    difficulty:
      record.difficulty === "easy" || record.difficulty === "medium" || record.difficulty === "hard" ?
        record.difficulty :
        (fallback?.difficulty ?? "medium"),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    id: toNonEmptyString(record.id, fallback?.id ?? `q-${index + 1}`),
    lastUsedDate: toOptionalDateString(record.lastUsedDate, fallback?.lastUsedDate ?? null),
    marks: Math.max(0, toNumberOrZero(record.marks ?? fallback?.marks ?? 0)),
    negativeMarks: Math.max(0, toNumberOrZero(record.negativeMarks ?? fallback?.negativeMarks ?? 0)),
    primaryTag: toNonEmptyString(record.primaryTag, fallback?.primaryTag ?? "untagged"),
    prompt: toNonEmptyString(record.prompt, fallback?.prompt ?? ""),
    questionType: toNonEmptyString(record.questionType, fallback?.questionType ?? "Question"),
    secondaryTag: toNonEmptyString(record.secondaryTag, fallback?.secondaryTag ?? "none"),
    simulationLink: toNonEmptyString(record.simulationLink, fallback?.simulationLink ?? ""),
    solutionImageFile: toNonEmptyString(record.solutionImageFile, fallback?.solutionImageFile ?? ""),
    status: normalizeStatus(record.status, fallback?.status ?? "active"),
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
    thermalState: normalizeThermalState(record.thermalState, fallback?.thermalState ?? "warm"),
    topic: toNonEmptyString(record.topic, fallback?.topic ?? ""),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    tutorialVideoLink: toNonEmptyString(record.tutorialVideoLink, fallback?.tutorialVideoLink ?? ""),
    internalNotes: toNonEmptyString(record.internalNotes, fallback?.internalNotes ?? ""),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

async function fetchArchiveLifecycleFromApi(): Promise<ArchiveLifecycleRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/library", {
    query: {
      limit: "250",
    },
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/library returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      questions?: unknown;
    };
  };
  const questions = Array.isArray(response.data?.questions) ? response.data?.questions : [];
  return questions
    .map((entry, index) => normalizeQuestionRecord(entry, index))
    .filter((entry): entry is QuestionBankRecord => Boolean(entry))
    .map(toArchiveLifecycleRecord);
}

function AdminQuestionBankArchiveVersionsPage() {
  const [records, setRecords] = useState<ArchiveLifecycleRecord[]>(ARCHIVE_LIFECYCLE_FIXTURES);
  const [inlineMessage, setInlineMessage] = useState(
    "Archive / Versions now has its own mounted workspace for HOT/WARM/COLD lifecycle review and version-safe controls.",
  );
  const [isLoading, setIsLoading] = useState(false);

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

        setRecords(nextRecords.length > 0 ? nextRecords : ARCHIVE_LIFECYCLE_FIXTURES);
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
        setRecords(ARCHIVE_LIFECYCLE_FIXTURES);
        setInlineMessage(`${reason} Falling back to deterministic archive/version fixtures.`);
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
      archiveBucket: toArchiveBucket("warm"),
      lifecycleRule: toLifecycleRule("warm"),
      metadataTreatment: toMetadataTreatment("warm"),
      mediaTreatment: toMediaTreatment("warm"),
      transitionReadiness: "New successor: available for future templates only.",
      nextOperatorAction: "Use in future templates after review.",
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
          <button type="button" onClick={() => createSuccessorVersion(record.id)}>
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
