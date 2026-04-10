import { useMemo, useState, type FormEvent } from "react";
import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import {
  UiForm,
  UiFormField,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";

const apiClient = createApiClient({ baseUrl: "/" });

const EXECUTION_MODES = ["Operational", "Diagnostic", "Controlled", "Hard"] as const;
const LICENSE_ORDER = ["L0", "L1", "L2", "L3"] as const;

const MODE_REQUIRED_LAYER: Record<ExecutionMode, LicenseLayer> = {
  Operational: "L0",
  Diagnostic: "L1",
  Controlled: "L2",
  Hard: "L3",
};

const CURRENT_LICENSE_LAYER: LicenseLayer = "L2";

type ExecutionMode = (typeof EXECUTION_MODES)[number];
type LicenseLayer = (typeof LICENSE_ORDER)[number];
type RunStatus = "scheduled" | "active" | "completed" | "cancelled";

interface TemplateOption {
  id: string;
  name: string;
  examType: "JEEMains" | "NEET";
  allowedModes: ExecutionMode[];
}

interface BatchOption {
  id: string;
  name: string;
  studentIds: string[];
}

interface AssignmentDraft {
  templateId: string;
  executionMode: ExecutionMode;
  selectedBatchIds: string[];
  assignmentStartLocal: string;
  assignmentEndLocal: string;
}

interface RunStatusRecord {
  runId: string;
  templateId: string;
  templateName: string;
  mode: ExecutionMode;
  batchIds: string[];
  recipientStudentIds: string[];
  startWindowIso: string;
  endWindowIso: string;
  status: RunStatus;
  completionPercent: number;
  createdAtIso: string;
}

interface RunCreatePayload {
  testId: string;
  mode: ExecutionMode;
  recipientStudentIds: string[];
  startWindow: string;
  endWindow: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "tmpl-001",
    name: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    allowedModes: ["Operational", "Diagnostic", "Controlled"],
  },
  {
    id: "tmpl-002",
    name: "NEET Revision - Biology Focus",
    examType: "NEET",
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
  },
  {
    id: "tmpl-003",
    name: "Physics Adaptive Drill - Wave Optics",
    examType: "JEEMains",
    allowedModes: ["Operational", "Diagnostic"],
  },
];

const BATCH_OPTIONS: BatchOption[] = [
  {
    id: "batch-a",
    name: "Batch-A",
    studentIds: ["STU-001", "STU-002", "STU-011", "STU-014"],
  },
  {
    id: "batch-b",
    name: "Batch-B",
    studentIds: ["STU-003", "STU-005", "STU-010"],
  },
  {
    id: "batch-c",
    name: "Batch-C",
    studentIds: ["STU-021", "STU-022", "STU-023", "STU-024", "STU-025"],
  },
];

const FALLBACK_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0410-001",
    templateId: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    mode: "Controlled",
    batchIds: ["batch-a", "batch-b"],
    recipientStudentIds: ["STU-001", "STU-002", "STU-003", "STU-005", "STU-010", "STU-011", "STU-014"],
    startWindowIso: "2026-04-11T03:30:00.000Z",
    endWindowIso: "2026-04-11T06:30:00.000Z",
    status: "scheduled",
    completionPercent: 0,
    createdAtIso: "2026-04-10T06:40:00.000Z",
  },
  {
    runId: "run-2026-0408-009",
    templateId: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    mode: "Diagnostic",
    batchIds: ["batch-c"],
    recipientStudentIds: ["STU-021", "STU-022", "STU-023", "STU-024", "STU-025"],
    startWindowIso: "2026-04-08T04:00:00.000Z",
    endWindowIso: "2026-04-08T07:00:00.000Z",
    status: "completed",
    completionPercent: 100,
    createdAtIso: "2026-04-07T12:20:00.000Z",
  },
];

const INITIAL_DRAFT: AssignmentDraft = {
  templateId: TEMPLATE_OPTIONS[0]?.id ?? "",
  executionMode: "Operational",
  selectedBatchIds: ["batch-a"],
  assignmentStartLocal: "",
  assignmentEndLocal: "",
};

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function normalizeIsoDatetime(localDatetime: string): string | null {
  if (localDatetime.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(localDatetime);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function hasLicenseAccess(current: LicenseLayer, required: LicenseLayer): boolean {
  const currentIndex = LICENSE_ORDER.indexOf(current);
  const requiredIndex = LICENSE_ORDER.indexOf(required);

  return currentIndex >= requiredIndex;
}

function buildRecipientStudentIds(selectedBatchIds: string[]): string[] {
  const recipients = new Set<string>();

  for (const batchId of selectedBatchIds) {
    const batch = BATCH_OPTIONS.find((entry) => entry.id === batchId);
    if (!batch) {
      continue;
    }

    for (const studentId of batch.studentIds) {
      recipients.add(studentId);
    }
  }

  return Array.from(recipients);
}

function validateDraft(draft: AssignmentDraft): string | null {
  if (draft.templateId.trim().length === 0) {
    return "Select a test template before scheduling the run.";
  }

  if (draft.selectedBatchIds.length === 0) {
    return "Select at least one student batch.";
  }

  const template = TEMPLATE_OPTIONS.find((entry) => entry.id === draft.templateId);
  if (!template) {
    return "The selected template is not recognized.";
  }

  const requiredLayer = MODE_REQUIRED_LAYER[draft.executionMode];
  if (!hasLicenseAccess(CURRENT_LICENSE_LAYER, requiredLayer)) {
    return `Execution mode ${draft.executionMode} requires license layer ${requiredLayer}.`;
  }

  if (!template.allowedModes.includes(draft.executionMode)) {
    return `Template "${template.name}" does not allow ${draft.executionMode} mode.`;
  }

  const startWindow = normalizeIsoDatetime(draft.assignmentStartLocal);
  const endWindow = normalizeIsoDatetime(draft.assignmentEndLocal);

  if (!startWindow || !endWindow) {
    return "Provide both assignment start and end windows.";
  }

  if (Date.parse(endWindow) <= Date.parse(startWindow)) {
    return "Assignment end window must be later than start window.";
  }

  return null;
}

function buildRunPayload(draft: AssignmentDraft): RunCreatePayload {
  const startWindow = normalizeIsoDatetime(draft.assignmentStartLocal);
  const endWindow = normalizeIsoDatetime(draft.assignmentEndLocal);

  if (!startWindow || !endWindow) {
    throw new Error("Assignment window values are invalid.");
  }

  return {
    testId: draft.templateId,
    mode: draft.executionMode,
    recipientStudentIds: buildRecipientStudentIds(draft.selectedBatchIds),
    startWindow,
    endWindow,
  };
}

function parseRunIdFromApiResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const candidates = [objectPayload.runId, objectPayload.id, (objectPayload.data as Record<string, unknown> | undefined)?.runId];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function buildFallbackRunRecord(draft: AssignmentDraft, runId: string): RunStatusRecord {
  const template = TEMPLATE_OPTIONS.find((entry) => entry.id === draft.templateId);
  const startWindowIso = normalizeIsoDatetime(draft.assignmentStartLocal) ?? new Date().toISOString();
  const endWindowIso = normalizeIsoDatetime(draft.assignmentEndLocal) ?? new Date().toISOString();

  return {
    runId,
    templateId: draft.templateId,
    templateName: template?.name ?? "Unknown template",
    mode: draft.executionMode,
    batchIds: draft.selectedBatchIds,
    recipientStudentIds: buildRecipientStudentIds(draft.selectedBatchIds),
    startWindowIso,
    endWindowIso,
    status: "scheduled",
    completionPercent: 0,
    createdAtIso: new Date().toISOString(),
  };
}

function statusClassName(status: RunStatus): string {
  switch (status) {
    case "scheduled":
      return "admin-assignments-status admin-assignments-status-scheduled";
    case "active":
      return "admin-assignments-status admin-assignments-status-active";
    case "completed":
      return "admin-assignments-status admin-assignments-status-completed";
    default:
      return "admin-assignments-status admin-assignments-status-cancelled";
  }
}

function AssignmentManagementPage() {
  const [draft, setDraft] = useState<AssignmentDraft>(INITIAL_DRAFT);
  const [runs, setRuns] = useState<RunStatusRecord[]>(FALLBACK_RUNS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(
    shouldUseLiveApi() ?
      "Live mode enabled: scheduling sends POST /admin/runs." :
      "Local mode detected: using deterministic assignment fixtures for Build 119.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => TEMPLATE_OPTIONS.find((template) => template.id === draft.templateId) ?? null,
    [draft.templateId],
  );

  const selectedBatchDetails = useMemo(
    () => BATCH_OPTIONS.filter((batch) => draft.selectedBatchIds.includes(batch.id)),
    [draft.selectedBatchIds],
  );

  const selectedRecipientCount = useMemo(
    () => buildRecipientStudentIds(draft.selectedBatchIds).length,
    [draft.selectedBatchIds],
  );

  const columns = useMemo<UiTableColumn<RunStatusRecord>[]>(() => {
    return [
      {
        id: "run",
        header: "Run",
        render: (row) => (
          <div className="admin-assignments-run-cell">
            <strong>{row.runId}</strong>
            <small>{row.templateName}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => (
          <div className="admin-assignments-mode-cell">
            <span>{row.mode}</span>
            <small>Recipients: {row.recipientStudentIds.length}</small>
          </div>
        ),
      },
      {
        id: "batches",
        header: "Batches",
        render: (row) => row.batchIds.map((batchId) => {
          const batch = BATCH_OPTIONS.find((entry) => entry.id === batchId);
          return batch?.name ?? batchId;
        }).join(", "),
      },
      {
        id: "window",
        header: "Assignment Window",
        render: (row) => (
          <div className="admin-assignments-window-cell">
            <span>{formatDateTime(row.startWindowIso)}</span>
            <small>to {formatDateTime(row.endWindowIso)}</small>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        className: "admin-assignments-status-col",
        render: (row) => (
          <div className="admin-assignments-status-cell">
            <span className={statusClassName(row.status)}>{row.status}</span>
            <small>{row.completionPercent}% complete</small>
          </div>
        ),
      },
    ];
  }, []);

  function toggleBatch(batchId: string) {
    setDraft((current) => {
      if (current.selectedBatchIds.includes(batchId)) {
        return {
          ...current,
          selectedBatchIds: current.selectedBatchIds.filter((value) => value !== batchId),
        };
      }

      return {
        ...current,
        selectedBatchIds: [...current.selectedBatchIds, batchId],
      };
    });
  }

  async function scheduleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setInlineMessage(null);

    const validationError = validateDraft(draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const payload = buildRunPayload(draft);
    setIsSubmitting(true);

    try {
      let runId = `run-${Date.now()}`;

      if (shouldUseLiveApi()) {
        const apiResponse = await apiClient.post<unknown, RunCreatePayload>("/admin/runs", {
          body: payload,
        });
        runId = parseRunIdFromApiResponse(apiResponse) ?? runId;
      }

      const nextRun = buildFallbackRunRecord(draft, runId);
      setRuns((current) => [nextRun, ...current]);
      setInlineMessage(
        shouldUseLiveApi() ?
          `Run ${runId} scheduled through POST /admin/runs.` :
          `Run ${runId} added locally for deterministic Build 119 assignment-flow verification.`,
      );
      setDraft((current) => ({
        ...current,
        assignmentStartLocal: "",
        assignmentEndLocal: "",
      }));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(`POST /admin/runs failed: ${error.code} (${error.status}).`);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to schedule run due to an unexpected error.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="admin-content-card" aria-labelledby="admin-assignments-title">
      <p className="admin-content-eyebrow">Admin / Assignments</p>
      <h2 id="admin-assignments-title">Assignment Management Interface</h2>
      <p className="admin-content-copy">
        Create assignment runs by selecting a template, choosing a license-aware execution mode,
        targeting student batches, and scheduling assignment windows.
      </p>

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {errorMessage ? <p className="admin-assignments-inline-error">{errorMessage}</p> : null}

      <UiForm
        title="Schedule Assignment Run"
        description="Build 119 workflow: Select template, mode, target batches, and assignment window."
        submitLabel={isSubmitting ? "Scheduling..." : "Schedule Run"}
        onSubmit={(event) => {
          void scheduleRun(event);
        }}
        footer={<span className="admin-assignments-form-footnote">Endpoint: POST /admin/runs</span>}
      >
        <div className="admin-assignments-grid">
          <UiFormField
            label="Test Template"
            htmlFor="assignment-template"
            helper="Template must be assignment-ready and mode-compatible."
          >
            <select
              id="assignment-template"
              value={draft.templateId}
              onChange={(event) => {
                setDraft((current) => ({ ...current, templateId: event.target.value }));
              }}
            >
              {TEMPLATE_OPTIONS.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.examType})
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField
            label="Execution Mode"
            htmlFor="assignment-mode"
            helper={`Current license layer: ${CURRENT_LICENSE_LAYER}.`}
          >
            <select
              id="assignment-mode"
              value={draft.executionMode}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  executionMode: event.target.value as ExecutionMode,
                }));
              }}
            >
              {EXECUTION_MODES.map((mode) => {
                const requiredLayer = MODE_REQUIRED_LAYER[mode];
                const disabled = !hasLicenseAccess(CURRENT_LICENSE_LAYER, requiredLayer);
                return (
                  <option key={mode} value={mode} disabled={disabled}>
                    {mode} (requires {requiredLayer})
                  </option>
                );
              })}
            </select>
          </UiFormField>

          <UiFormField
            label="Assignment Start"
            htmlFor="assignment-start"
            helper="Define when students can begin the run."
          >
            <input
              id="assignment-start"
              type="datetime-local"
              value={draft.assignmentStartLocal}
              onChange={(event) => {
                setDraft((current) => ({ ...current, assignmentStartLocal: event.target.value }));
              }}
            />
          </UiFormField>

          <UiFormField
            label="Assignment End"
            htmlFor="assignment-end"
            helper="Window close must be later than window start."
          >
            <input
              id="assignment-end"
              type="datetime-local"
              value={draft.assignmentEndLocal}
              onChange={(event) => {
                setDraft((current) => ({ ...current, assignmentEndLocal: event.target.value }));
              }}
            />
          </UiFormField>
        </div>

        <UiFormField
          label="Student Batches"
          htmlFor="assignment-batches"
          helper="One run can target one or more batches; recipients are de-duplicated by studentId."
        >
          <div id="assignment-batches" className="admin-assignments-batch-list">
            {BATCH_OPTIONS.map((batch) => {
              const isChecked = draft.selectedBatchIds.includes(batch.id);
              return (
                <label key={batch.id} className="admin-assignments-batch-option">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      toggleBatch(batch.id);
                    }}
                  />
                  <span>
                    <strong>{batch.name}</strong>
                    <small>{batch.studentIds.length} students</small>
                  </span>
                </label>
              );
            })}
          </div>
        </UiFormField>
      </UiForm>

      <section className="admin-assignments-summary" aria-label="Assignment selection summary">
        <h3>Run Summary</h3>
        <p>
          Template: <strong>{selectedTemplate?.name ?? "None"}</strong>
        </p>
        <p>
          Mode: <strong>{draft.executionMode}</strong> (requires {MODE_REQUIRED_LAYER[draft.executionMode]})
        </p>
        <p>
          Selected batches: <strong>{selectedBatchDetails.map((batch) => batch.name).join(", ") || "None"}</strong>
        </p>
        <p>
          Recipient count: <strong>{selectedRecipientCount}</strong>
        </p>
      </section>

      <UiTable
        caption="Run Status Table"
        columns={columns}
        rows={runs}
        rowKey={(row) => row.runId}
        emptyStateText="No assignment runs scheduled yet."
      />
    </article>
  );
}

export default AssignmentManagementPage;
