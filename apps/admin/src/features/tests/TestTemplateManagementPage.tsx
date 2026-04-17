import { useMemo, useState, type FormEvent } from "react";
import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  DIFFICULTY_LEVELS,
  EXAM_TYPES,
  QUESTION_BANK,
  SELECTION_METHODS,
  deriveCanonicalTemplateId,
  type DifficultyLevel,
  type ExamType,
  type SelectionMethod,
} from "./testTemplateFixtures";

const apiClient = createApiClient({ baseUrl: "/" });

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";

interface TimingWindow {
  minSeconds: number;
  maxSeconds: number;
}

interface TimingProfile {
  easy: TimingWindow;
  medium: TimingWindow;
  hard: TimingWindow;
}

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

interface TemplateDraft {
  templateName: string;
  examType: ExamType;
  selectionMethod: SelectionMethod;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  timingProfile: TimingProfile;
}

interface TestTemplateRecord extends TemplateDraft {
  id: string;
  canonicalId: string;
  status: TemplateStatus;
  updatedAt: string;
}

interface TemplateSubmitPayload {
  templateName: string;
  canonicalId: string;
  examType: ExamType;
  selectionMethod: SelectionMethod;
  totalDurationMinutes: number;
  questionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  timingProfile: TimingProfile;
  publish: boolean;
}

const FALLBACK_TEMPLATES: TestTemplateRecord[] = [
  {
    id: "tmpl-001",
    canonicalId: "14a94be7286349e2624b0ef42f9eaa9f4c89eb2d270218071b060962fce6057f",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    selectionMethod: "manual",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-104", "q-105", "q-107", "q-108"],
    difficultyDistribution: { easy: 3, medium: 3, hard: 0 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "draft",
    updatedAt: "2026-04-10T08:30:00.000Z",
  },
  {
    id: "tmpl-002",
    canonicalId: "da6cf95d845169f18f6f0f260fa8535f89b7afe29158416f1572a5f9f29407f5",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    selectionMethod: "round_robin",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-101", "q-103", "q-104", "q-106", "q-108", "q-109"],
    difficultyDistribution: { easy: 2, medium: 2, hard: 2 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "assigned",
    updatedAt: "2026-04-08T11:45:00.000Z",
  },
];

const INITIAL_DRAFT: TemplateDraft = {
  templateName: "",
  examType: "JEEMains",
  selectionMethod: "manual",
  totalDurationMinutes: 180,
  selectedQuestionIds: [],
  difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
  timingProfile: {
    easy: { minSeconds: 30, maxSeconds: 60 },
    medium: { minSeconds: 60, maxSeconds: 150 },
    hard: { minSeconds: 150, maxSeconds: 210 },
  },
};

function isDraftEditable(status: TemplateStatus): boolean {
  return status === "draft";
}

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function buildPayload(draft: TemplateDraft, publish: boolean): TemplateSubmitPayload {
  return {
    templateName: draft.templateName.trim(),
    canonicalId: "",
    examType: draft.examType,
    selectionMethod: draft.selectionMethod,
    totalDurationMinutes: draft.totalDurationMinutes,
    questionIds: draft.selectedQuestionIds,
    difficultyDistribution: draft.difficultyDistribution,
    timingProfile: draft.timingProfile,
    publish,
  };
}

function validateDraft(draft: TemplateDraft): string | null {
  if (draft.templateName.trim().length < 3) {
    return "Template name must contain at least 3 characters.";
  }

  if (draft.selectedQuestionIds.length === 0) {
    return "Select at least one question before saving.";
  }

  const distributionTotal =
    draft.difficultyDistribution.easy +
    draft.difficultyDistribution.medium +
    draft.difficultyDistribution.hard;

  if (distributionTotal !== draft.selectedQuestionIds.length) {
    return "Difficulty distribution must equal selected question count.";
  }

  for (const difficulty of DIFFICULTY_LEVELS) {
    const window = draft.timingProfile[difficulty];
    if (window.minSeconds <= 0 || window.maxSeconds <= 0) {
      return "Timing profile values must be positive.";
    }

    if (window.minSeconds > window.maxSeconds) {
      return "Timing profile min seconds cannot exceed max seconds.";
    }
  }

  return null;
}

async function submitTemplateToApi(payload: TemplateSubmitPayload): Promise<void> {
  await apiClient.post<unknown, TemplateSubmitPayload>("/admin/tests", { body: payload });
}

function TestTemplateManagementPage() {
  const [templates, setTemplates] = useState<TestTemplateRecord[]>(FALLBACK_TEMPLATES);
  const [draft, setDraft] = useState<TemplateDraft>(INITIAL_DRAFT);
  const [duplicateTemplate, setDuplicateTemplate] = useState<TestTemplateRecord | null>(null);
  const [pendingDuplicateRecord, setPendingDuplicateRecord] = useState<TestTemplateRecord | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [questionQuery, setQuestionQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string>(
    shouldUseLiveApi() ?
      "Live mode enabled: template create/publish sends POST /admin/tests." :
      "Local mode detected: using deterministic question bank and template fixtures for Build 118.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishTargetId, setPublishTargetId] = useState<string | null>(null);

  const visibleQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase();
    if (query.length === 0) {
      return QUESTION_BANK;
    }

    return QUESTION_BANK.filter((question) => {
      return (
        question.id.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query)
      );
    });
  }, [questionQuery]);

  const selectedQuestionCount = draft.selectedQuestionIds.length;
  const selectedDifficultyCount = useMemo(() => {
    return QUESTION_BANK.reduce<DifficultyDistribution>(
      (accumulator, question) => {
        if (!draft.selectedQuestionIds.includes(question.id)) {
          return accumulator;
        }

        accumulator[question.difficulty] += 1;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
  }, [draft.selectedQuestionIds]);

  function updateTiming(
    difficulty: DifficultyLevel,
    field: "minSeconds" | "maxSeconds",
    rawValue: string,
  ) {
    const value = Number(rawValue);
    setDraft((current) => ({
      ...current,
      timingProfile: {
        ...current.timingProfile,
        [difficulty]: {
          ...current.timingProfile[difficulty],
          [field]: Number.isFinite(value) ? Math.max(1, value) : 1,
        },
      },
    }));
  }

  function updateDistribution(difficulty: DifficultyLevel, rawValue: string) {
    const value = Number(rawValue);
    setDraft((current) => ({
      ...current,
      difficultyDistribution: {
        ...current.difficultyDistribution,
        [difficulty]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
      },
    }));
  }

  function toggleQuestionSelection(questionId: string) {
    setDraft((current) => {
      const isSelected = current.selectedQuestionIds.includes(questionId);
      const selectedQuestionIds =
        isSelected ?
          current.selectedQuestionIds.filter((id) => id !== questionId) :
          [...current.selectedQuestionIds, questionId];

      return {
        ...current,
        selectedQuestionIds,
      };
    });
  }

  function syncDistributionToSelectedPool() {
    setDraft((current) => ({
      ...current,
      difficultyDistribution: selectedDifficultyCount,
    }));
  }

  function resetEditor() {
    setDraft(INITIAL_DRAFT);
    setEditingTemplateId(null);
    setDuplicateTemplate(null);
    setPendingDuplicateRecord(null);
    setErrorMessage(null);
  }

  function startEditingTemplate(templateId: string) {
    const target = templates.find((template) => template.id === templateId);
    if (!target) {
      return;
    }

    if (!isDraftEditable(target.status)) {
      setErrorMessage("Only draft templates are editable. Assigned/ready templates are structurally locked.");
      return;
    }

    setDraft({
      templateName: target.templateName,
      examType: target.examType,
      selectionMethod: target.selectionMethod,
      totalDurationMinutes: target.totalDurationMinutes,
      selectedQuestionIds: target.selectedQuestionIds,
      difficultyDistribution: target.difficultyDistribution,
      timingProfile: target.timingProfile,
    });
    setEditingTemplateId(target.id);
    setErrorMessage(null);
  }

  async function saveDraftTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validateDraft(draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const now = new Date().toISOString();
    const canonicalId = await deriveCanonicalTemplateId(draft.selectedQuestionIds);
    const nextRecord: TestTemplateRecord = {
      id: editingTemplateId ?? `tmpl-${Date.now()}`,
      ...draft,
      canonicalId,
      status: "draft",
      updatedAt: now,
    };

    const duplicate = templates.find((template) => {
      return template.id !== nextRecord.id && template.canonicalId === canonicalId;
    });

    if (duplicate) {
      setDuplicateTemplate(duplicate);
      setPendingDuplicateRecord(nextRecord);
      return;
    }

    await persistDraftRecord(nextRecord);
  }

  async function persistDraftRecord(nextRecord: TestTemplateRecord) {
    setIsSubmitting(true);
    setErrorMessage(null);

    const payloadDraft: TemplateDraft = {
      templateName: nextRecord.templateName,
      examType: nextRecord.examType,
      selectionMethod: nextRecord.selectionMethod,
      totalDurationMinutes: nextRecord.totalDurationMinutes,
      selectedQuestionIds: nextRecord.selectedQuestionIds,
      difficultyDistribution: nextRecord.difficultyDistribution,
      timingProfile: nextRecord.timingProfile,
    };

    try {
      if (shouldUseLiveApi()) {
        await submitTemplateToApi({
          ...buildPayload(payloadDraft, false),
          canonicalId: nextRecord.canonicalId,
        });
      }

      setTemplates((current) => {
        const existingIndex = current.findIndex((item) => item.id === nextRecord.id);
        if (existingIndex === -1) {
          return [nextRecord, ...current];
        }

        return current.map((item) => (item.id === nextRecord.id ? nextRecord : item));
      });

      setInlineMessage(
        editingTemplateId ?
          "Draft template updated. Structural edits remain available until published or assigned." :
          "Draft template created successfully.",
      );
      resetEditor();
    } catch (error) {
      const reason =
        error instanceof ApiClientError ?
          `POST /admin/tests failed with ${error.code} (${error.status}).` :
          "POST /admin/tests failed unexpectedly.";
      setErrorMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function publishDraftTemplate(templateId: string) {
    const target = templates.find((template) => template.id === templateId);
    if (!target) {
      setPublishTargetId(null);
      return;
    }

    if (!isDraftEditable(target.status)) {
      setErrorMessage("Only draft templates can be published.");
      setPublishTargetId(null);
      return;
    }

    const validationError = validateDraft(target);
    if (validationError) {
      setErrorMessage(`Cannot publish template: ${validationError}`);
      setPublishTargetId(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (shouldUseLiveApi()) {
        const canonicalId = target.canonicalId || await deriveCanonicalTemplateId(target.selectedQuestionIds);
        await submitTemplateToApi({
          ...buildPayload(target, true),
          canonicalId,
        });
      }

      setTemplates((current) =>
        current.map((template) =>
          template.id === templateId ?
            {
              ...template,
              status: "ready",
              updatedAt: new Date().toISOString(),
            } :
            template,
        ),
      );
      setInlineMessage("Template published. Status moved from draft to ready.");
    } catch (error) {
      const reason =
        error instanceof ApiClientError ?
          `POST /admin/tests failed with ${error.code} (${error.status}) during publish.` :
          "Publish request failed unexpectedly.";
      setErrorMessage(reason);
    } finally {
      setPublishTargetId(null);
      setIsSubmitting(false);
    }
  }

  function proceedWithDuplicateSave() {
    if (!pendingDuplicateRecord) {
      setDuplicateTemplate(null);
      return;
    }

    setDuplicateTemplate(null);
    void persistDraftRecord(pendingDuplicateRecord);
  }

  function reuseExistingDuplicateTemplate() {
    if (!duplicateTemplate) {
      return;
    }

    setDuplicateTemplate(null);
    setPendingDuplicateRecord(null);
    setInlineMessage(
      `Duplicate template detected. Reusing existing template ${duplicateTemplate.templateName} (${duplicateTemplate.id}).`,
    );
    setErrorMessage(null);
  }

  const templateColumns: UiTableColumn<TestTemplateRecord>[] = [
    {
      id: "name",
      header: "Template",
      render: (template) => (
        <div className="admin-tests-template-cell">
          <strong>{template.templateName}</strong>
          <small>{template.examType}</small>
        </div>
      ),
    },
    {
      id: "selectionMethod",
      header: "Selection Method",
      render: (template) => template.selectionMethod,
    },
    {
      id: "questions",
      header: "Question Count",
      render: (template) => template.selectedQuestionIds.length,
    },
    {
      id: "distribution",
      header: "Difficulty Distribution",
      render: (template) =>
        `E:${template.difficultyDistribution.easy} M:${template.difficultyDistribution.medium} H:${template.difficultyDistribution.hard}`,
    },
    {
      id: "status",
      header: "Status",
      render: (template) => (
        <span className={`admin-tests-status admin-tests-status-${template.status}`}>{template.status}</span>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      render: (template) => formatIsoDate(template.updatedAt),
    },
    {
      id: "canonicalId",
      header: "Canonical ID",
      render: (template) => (
        <code className="admin-tests-canonical-id">{template.canonicalId.slice(0, 16)}...</code>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (template) => {
        const editable = isDraftEditable(template.status);
        return (
          <div className="admin-tests-row-actions">
            <button type="button" onClick={() => startEditingTemplate(template.id)} disabled={!editable}>
              Edit Draft
            </button>
            <button type="button" onClick={() => setPublishTargetId(template.id)} disabled={!editable}>
              Publish
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-tests-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-tests-title">Test Template Management UI</h2>
      <p className="admin-content-copy">
        Create and manage template drafts with architecture-aligned question selection, timing profile configuration,
        and difficulty distribution controls before publish.
      </p>

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-tests-grid">
        <UiForm
          title={editingTemplateId ? "Edit Draft Template" : "Create Test Template"}
          description="Configure template metadata, duration, and selection method before saving as draft."
          submitLabel={isSubmitting ? "Saving..." : editingTemplateId ? "Save Draft Changes" : "Save Draft"}
          onSubmit={saveDraftTemplate}
          footer={
            editingTemplateId ?
              <button type="button" onClick={resetEditor} disabled={isSubmitting}>
                Cancel Edit
              </button> :
              <span className="admin-tests-form-footnote">Drafts remain editable until published.</span>
          }
        >
          <UiFormField label="Template Name" htmlFor="admin-tests-template-name">
            <input
              id="admin-tests-template-name"
              type="text"
              value={draft.templateName}
              onChange={(event) => setDraft((current) => ({ ...current, templateName: event.target.value }))}
              placeholder="JEE Mains Mock - Set C"
              required
            />
          </UiFormField>
          <UiFormField label="Exam Type" htmlFor="admin-tests-exam-type">
            <select
              id="admin-tests-exam-type"
              value={draft.examType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  examType: event.target.value as ExamType,
                }))
              }
            >
              {EXAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Selection Method" htmlFor="admin-tests-selection-method">
            <select
              id="admin-tests-selection-method"
              value={draft.selectionMethod}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  selectionMethod: event.target.value as SelectionMethod,
                }))
              }
            >
              {SELECTION_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Total Duration (minutes)" htmlFor="admin-tests-duration">
            <input
              id="admin-tests-duration"
              type="number"
              min={30}
              step={5}
              value={draft.totalDurationMinutes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  totalDurationMinutes: Math.max(30, Number(event.target.value) || 30),
                }))
              }
            />
          </UiFormField>
        </UiForm>

        <UiForm
          title="Question Selection"
          description="Select question IDs for this template. Distribution totals must match selected count."
          submitLabel="Sync Difficulty Distribution"
          onSubmit={(event) => {
            event.preventDefault();
            syncDistributionToSelectedPool();
          }}
          footer={
            <span className="admin-tests-form-footnote">
              Selected: {selectedQuestionCount} | Easy: {selectedDifficultyCount.easy} | Medium:{" "}
              {selectedDifficultyCount.medium} | Hard: {selectedDifficultyCount.hard}
            </span>
          }
        >
          <UiFormField label="Search Question Pool" htmlFor="admin-tests-question-search">
            <input
              id="admin-tests-question-search"
              type="search"
              value={questionQuery}
              onChange={(event) => setQuestionQuery(event.target.value)}
              placeholder="Search by id, subject, chapter, or prompt"
            />
          </UiFormField>
          <div className="admin-tests-question-list" role="group" aria-label="Template question selection">
            {visibleQuestions.map((question) => {
              const checked = draft.selectedQuestionIds.includes(question.id);
              return (
                <label key={question.id} className="admin-tests-question-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleQuestionSelection(question.id)}
                  />
                  <span>
                    <strong>{question.id}</strong> {question.subject} / {question.chapter} / {question.difficulty}
                  </span>
                </label>
              );
            })}
          </div>
        </UiForm>
      </div>

      <div className="admin-tests-config-grid">
        <UiForm
          title="Difficulty Distribution"
          description="Configure easy, medium, and hard counts."
          submitLabel="Apply Distribution"
          onSubmit={(event) => event.preventDefault()}
          footer={
            <span className="admin-tests-form-footnote">
              Total configured:{" "}
              {draft.difficultyDistribution.easy +
                draft.difficultyDistribution.medium +
                draft.difficultyDistribution.hard}
            </span>
          }
        >
          {DIFFICULTY_LEVELS.map((difficulty) => (
            <UiFormField
              key={difficulty}
              label={`${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)} count`}
              htmlFor={`admin-tests-distribution-${difficulty}`}
            >
              <input
                id={`admin-tests-distribution-${difficulty}`}
                type="number"
                min={0}
                value={draft.difficultyDistribution[difficulty]}
                onChange={(event) => updateDistribution(difficulty, event.target.value)}
              />
            </UiFormField>
          ))}
        </UiForm>

        <UiForm
          title="Timing Profile"
          description="Set min/max time windows (seconds) for each difficulty."
          submitLabel="Keep Timing Profile"
          onSubmit={(event) => event.preventDefault()}
        >
          {DIFFICULTY_LEVELS.map((difficulty) => (
            <div key={difficulty} className="admin-tests-timing-row">
              <UiFormField
                label={`${difficulty.charAt(0).toUpperCase()} min`}
                htmlFor={`admin-tests-timing-min-${difficulty}`}
              >
                <input
                  id={`admin-tests-timing-min-${difficulty}`}
                  type="number"
                  min={1}
                  value={draft.timingProfile[difficulty].minSeconds}
                  onChange={(event) => updateTiming(difficulty, "minSeconds", event.target.value)}
                />
              </UiFormField>
              <UiFormField
                label={`${difficulty.charAt(0).toUpperCase()} max`}
                htmlFor={`admin-tests-timing-max-${difficulty}`}
              >
                <input
                  id={`admin-tests-timing-max-${difficulty}`}
                  type="number"
                  min={1}
                  value={draft.timingProfile[difficulty].maxSeconds}
                  onChange={(event) => updateTiming(difficulty, "maxSeconds", event.target.value)}
                />
              </UiFormField>
            </div>
          ))}
        </UiForm>
      </div>

      <UiTable
        caption="Saved Test Templates"
        columns={templateColumns}
        rows={templates}
        rowKey={(row) => row.id}
        emptyStateText="No templates created yet."
      />

      <UiModal
        isOpen={Boolean(publishTargetId)}
        title="Publish Template"
        description="Publishing moves draft to ready and locks editing as per template lifecycle."
        onClose={() => setPublishTargetId(null)}
      >
        <div className="admin-tests-publish-actions">
          <button
            type="button"
            onClick={() => {
              if (publishTargetId) {
                void publishDraftTemplate(publishTargetId);
              }
            }}
            disabled={isSubmitting}
          >
            Confirm Publish
          </button>
          <button type="button" onClick={() => setPublishTargetId(null)} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </UiModal>

      <UiModal
        isOpen={Boolean(duplicateTemplate)}
        title="Duplicate template detected"
        description="Canonical template ID already exists. Reuse existing template or proceed intentionally."
        onClose={() => {
          setDuplicateTemplate(null);
          setPendingDuplicateRecord(null);
        }}
      >
        <div className="admin-tests-publish-actions">
          <button type="button" onClick={reuseExistingDuplicateTemplate} disabled={isSubmitting}>
            Reuse Existing Template
          </button>
          <button type="button" onClick={proceedWithDuplicateSave} disabled={isSubmitting}>
            Proceed Intentionally
          </button>
        </div>
      </UiModal>
    </section>
  );
}

export default TestTemplateManagementPage;
