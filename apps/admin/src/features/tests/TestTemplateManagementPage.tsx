import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
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
  type QuestionBankRecord,
  type SelectionMethod,
} from "./testTemplateFixtures";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";
type TestSubpage = "create" | "library" | "analytics" | "distribution" | "settings";

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

interface QuestionPoolLoadState {
  questions: QuestionBankRecord[];
  source: "local" | "live";
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

function toTemplateStatus(value: unknown): TemplateStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "draft" || normalized === "ready" || normalized === "assigned" || normalized === "archived" || normalized === "deprecated") {
    return normalized;
  }
  return "draft";
}

function normalizeSelectionMethod(value: unknown, fallback: SelectionMethod): SelectionMethod {
  if (typeof value !== "string") {
    return fallback;
  }

  return SELECTION_METHODS.includes(value as SelectionMethod) ? (value as SelectionMethod) : fallback;
}

function normalizeExamType(value: unknown, fallback: ExamType): ExamType {
  if (typeof value !== "string") {
    return fallback;
  }

  return EXAM_TYPES.includes(value as ExamType) ? (value as ExamType) : fallback;
}

function normalizeTimingWindow(value: unknown, fallback: TimingWindow): TimingWindow {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;
  return {
    minSeconds: Math.max(1, toNumberOrZero(source.minSeconds ?? source.min ?? fallback.minSeconds)),
    maxSeconds: Math.max(1, toNumberOrZero(source.maxSeconds ?? source.max ?? fallback.maxSeconds)),
  };
}

function normalizeDifficulty(
  value: unknown,
  fallback: DifficultyLevel,
): DifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
}

function normalizeThermalState(
  value: unknown,
  fallback: QuestionBankRecord["thermalState"],
): QuestionBankRecord["thermalState"] {
  return value === "hot" || value === "warm" || value === "cold" ? value : fallback;
}

function normalizeQuestionStatus(
  value: unknown,
  fallback: QuestionBankRecord["status"],
): QuestionBankRecord["status"] {
  return value === "active" || value === "used" || value === "archived" || value === "deprecated" ? value : fallback;
}

function normalizeQuestionRecord(
  value: unknown,
  index: number,
): QuestionBankRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = QUESTION_BANK[index] ?? QUESTION_BANK[0];

  return {
    academicYear: toNonEmptyString(record.academicYear, fallback?.academicYear ?? "unassigned"),
    additionalTag: toNonEmptyString(record.additionalTag, fallback?.additionalTag ?? "none"),
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    difficulty: normalizeDifficulty(record.difficulty, fallback?.difficulty ?? "medium"),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    id: toNonEmptyString(record.id, fallback?.id ?? `q-${index + 1}`),
    lastUsedDate: toOptionalDateString(record.lastUsedDate, fallback?.lastUsedDate ?? null),
    marks: Math.max(0, toNumberOrZero(record.marks ?? fallback?.marks ?? 0)),
    negativeMarks: Math.max(0, toNumberOrZero(record.negativeMarks ?? fallback?.negativeMarks ?? 0)),
    primaryTag: toNonEmptyString(record.primaryTag, fallback?.primaryTag ?? "untagged"),
    prompt: toNonEmptyString(record.prompt, fallback?.prompt ?? ""),
    questionType: toNonEmptyString(record.questionType, fallback?.questionType ?? "Question"),
    secondaryTag: toNonEmptyString(record.secondaryTag, fallback?.secondaryTag ?? "none"),
    status: normalizeQuestionStatus(record.status, fallback?.status ?? "active"),
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
    thermalState: normalizeThermalState(record.thermalState, fallback?.thermalState ?? "warm"),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

function normalizeTemplateRecord(value: unknown, index: number): TestTemplateRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_TEMPLATES[index] ?? FALLBACK_TEMPLATES[0];
  const difficultySource =
    record.difficultyDistribution && typeof record.difficultyDistribution === "object" ?
      (record.difficultyDistribution as Record<string, unknown>) :
      {};
  const timingProfileSource =
    record.timingProfile && typeof record.timingProfile === "object" ?
      (record.timingProfile as Record<string, unknown>) :
      {};
  const questionIdsSource = record.selectedQuestionIds ?? record.questionIds;
  const selectedQuestionIds = Array.isArray(questionIdsSource) ?
    questionIdsSource.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) :
    fallback?.selectedQuestionIds ?? [];

  return {
    id: toNonEmptyString(record.id, `tmpl-${index + 1}`),
    canonicalId: toNonEmptyString(record.canonicalId, fallback?.canonicalId ?? `canonical-${index + 1}`),
    templateName: toNonEmptyString(record.templateName, fallback?.templateName ?? `Template ${index + 1}`),
    examType: normalizeExamType(record.examType, fallback?.examType ?? "JEEMains"),
    selectionMethod: normalizeSelectionMethod(record.selectionMethod, fallback?.selectionMethod ?? "manual"),
    totalDurationMinutes: Math.max(30, toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes)),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: Math.max(0, toNumberOrZero(difficultySource.easy)),
      medium: Math.max(0, toNumberOrZero(difficultySource.medium)),
      hard: Math.max(0, toNumberOrZero(difficultySource.hard)),
    },
    timingProfile: {
      easy: normalizeTimingWindow(timingProfileSource.easy, fallback?.timingProfile.easy ?? { minSeconds: 30, maxSeconds: 60 }),
      medium: normalizeTimingWindow(timingProfileSource.medium, fallback?.timingProfile.medium ?? { minSeconds: 60, maxSeconds: 150 }),
      hard: normalizeTimingWindow(timingProfileSource.hard, fallback?.timingProfile.hard ?? { minSeconds: 150, maxSeconds: 210 }),
    },
    status: toTemplateStatus(record.status),
    updatedAt: toNonEmptyString(record.updatedAt, fallback?.updatedAt ?? new Date(0).toISOString()),
  };
}

async function fetchTemplatesFromApi(): Promise<TestTemplateRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/tests");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/tests returned an invalid payload.");
  }

  const templates = payload
    .map((entry, index) => normalizeTemplateRecord(entry, index))
    .filter((entry): entry is TestTemplateRecord => Boolean(entry));

  if (templates.length === 0) {
    throw new Error("GET /admin/tests did not include any templates.");
  }

  return templates;
}

async function fetchQuestionPoolFromApi(): Promise<QuestionPoolLoadState> {
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
  const normalizedQuestions = questions
    .map((entry, index) => normalizeQuestionRecord(entry, index))
    .filter((entry): entry is QuestionBankRecord => Boolean(entry));

  return {
    questions: normalizedQuestions.length > 0 ? normalizedQuestions : QUESTION_BANK,
    source: normalizedQuestions.length > 0 ? "live" : "local",
  };
}

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

function resolveTestSubpage(pathname: string): TestSubpage {
  if (pathname.includes("/tests/create")) {
    return "create";
  }
  if (pathname.includes("/tests/analytics")) {
    return "analytics";
  }
  if (pathname.includes("/tests/distribution")) {
    return "distribution";
  }
  if (pathname.includes("/tests/settings")) {
    return "settings";
  }

  return "library";
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
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();
  const [templates, setTemplates] = useState<TestTemplateRecord[]>(FALLBACK_TEMPLATES);
  const [questionPool, setQuestionPool] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [draft, setDraft] = useState<TemplateDraft>(INITIAL_DRAFT);
  const [duplicateTemplate, setDuplicateTemplate] = useState<TestTemplateRecord | null>(null);
  const [pendingDuplicateRecord, setPendingDuplicateRecord] = useState<TestTemplateRecord | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [questionQuery, setQuestionQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string>(
    shouldUseLiveApi() ?
      "Live mode enabled: template create/publish sends POST /admin/tests." :
      "Local mode detected: using deterministic question bank and template fixtures for Build 118.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishTargetId, setPublishTargetId] = useState<string | null>(null);
  const [inspectedTemplateId, setInspectedTemplateId] = useState<string>(FALLBACK_TEMPLATES[0]?.id ?? "");

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      setIsLoadingTemplates(true);

      if (!shouldUseLiveApi()) {
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage("Local mode detected: using deterministic question bank and template fixtures for Build 118.");
        setIsLoadingTemplates(false);
        return;
      }

      try {
        const liveTemplates = await fetchTemplatesFromApi();
        if (!isMounted) {
          return;
        }

        setTemplates(liveTemplates);
        setInlineMessage("Live mode enabled: template library hydrated from GET /admin/tests, and create/publish sends POST /admin/tests.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            `GET /admin/tests failed with ${error.code} (${error.status}).` :
            "Failed to load template library.";
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage(`${reason} Falling back to deterministic Build 118 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadQuestionPool() {
      if (!shouldUseLiveApi()) {
        setQuestionPool(QUESTION_BANK);
        return;
      }

      try {
        const nextQuestionPool = await fetchQuestionPoolFromApi();
        if (!isMounted) {
          return;
        }

        setQuestionPool(nextQuestionPool.questions);
        setInlineMessage((current) => {
          const suffix =
            nextQuestionPool.source === "live" ?
              " Question-pool selection now hydrates from GET /admin/questions/library." :
              " GET /admin/questions/library returned no persisted records yet, so question-pool selection stayed on deterministic fallback data.";
          return current.includes("Question-pool selection now hydrates from GET /admin/questions/library.")
            || current.includes("question-pool selection stayed on deterministic fallback data.")
            ? current
            : `${current}${suffix}`;
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setQuestionPool(QUESTION_BANK);
        const reason =
          error instanceof ApiClientError ?
            `GET /admin/questions/library failed with ${error.code} (${error.status}).` :
            "Failed to load the question pool.";
        setInlineMessage((current) =>
          current.includes("question-pool selection")
            ? current
            : `${current} ${reason} Question-pool selection fell back to deterministic fixtures.`,
        );
      }
    }

    void loadQuestionPool();

    return () => {
      isMounted = false;
    };
  }, []);

  const currentSubpage = useMemo(() => resolveTestSubpage(location.pathname), [location.pathname]);

  const visibleQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase();
    if (query.length === 0) {
      return questionPool;
    }

    return questionPool.filter((question) => {
      return (
        question.id.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query)
      );
    });
  }, [questionPool, questionQuery]);

  const questionPoolById = useMemo(() => {
    const byId = new Map<string, QuestionBankRecord>();
    for (const question of QUESTION_BANK) {
      byId.set(question.id, question);
    }
    for (const question of questionPool) {
      byId.set(question.id, question);
    }
    return byId;
  }, [questionPool]);

  const selectedQuestionCount = draft.selectedQuestionIds.length;
  const selectedDifficultyCount = useMemo(() => {
    return draft.selectedQuestionIds.reduce<DifficultyDistribution>(
      (accumulator, question) => {
        const resolvedQuestion = questionPoolById.get(question);
        if (!resolvedQuestion) {
          return accumulator;
        }

        accumulator[resolvedQuestion.difficulty] += 1;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
  }, [draft.selectedQuestionIds, questionPoolById]);

  useEffect(() => {
    if (templates.length === 0) {
      setInspectedTemplateId("");
      return;
    }

    if (params.testId && templates.some((template) => template.id === params.testId)) {
      setInspectedTemplateId(params.testId);
      return;
    }

    setInspectedTemplateId((current) =>
      current && templates.some((template) => template.id === current) ? current : templates[0]?.id ?? "",
    );
  }, [params.testId, templates]);

  const inspectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === inspectedTemplateId) ?? templates[0] ?? null;
  }, [inspectedTemplateId, templates]);

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
    setInspectedTemplateId(target.id);
    navigate("/admin/tests/create");
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
            <button type="button" onClick={() => navigate(`/admin/tests/${template.id}`)}>
              Open Detail
            </button>
            <button type="button" onClick={() => navigate(`/admin/tests/analytics/${template.id}`)}>
              Analytics
            </button>
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

  const analyticsColumns: UiTableColumn<TestTemplateRecord>[] = [
    {
      id: "template",
      header: "Template",
      render: (template) => template.templateName,
    },
    {
      id: "status",
      header: "Status",
      render: (template) => template.status,
    },
    {
      id: "questions",
      header: "Questions",
      render: (template) => template.selectedQuestionIds.length,
    },
    {
      id: "distribution",
      header: "Difficulty Mix",
      render: (template) =>
        `E:${template.difficultyDistribution.easy} M:${template.difficultyDistribution.medium} H:${template.difficultyDistribution.hard}`,
    },
    {
      id: "selectionMethod",
      header: "Selection",
      render: (template) => template.selectionMethod,
    },
  ];

  const selectedTemplateDifficultyRows =
    inspectedTemplate ?
      DIFFICULTY_LEVELS.map((difficulty) => ({
        difficulty,
        count: inspectedTemplate.difficultyDistribution[difficulty],
        minSeconds: inspectedTemplate.timingProfile[difficulty].minSeconds,
        maxSeconds: inspectedTemplate.timingProfile[difficulty].maxSeconds,
      })) :
      [];

  const totalQuestionCount = templates.reduce((total, template) => total + template.selectedQuestionIds.length, 0);
  const readyOrAssignedCount = templates.filter((template) => template.status === "ready" || template.status === "assigned").length;

  function renderCreateView() {
    return (
      <>
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
      </>
    );
  }

  function renderLibraryView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Library Status</h3>
            <p>{templates.length} saved templates across draft, ready, and assigned states.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Publishable Templates</h3>
            <p>{templates.filter((template) => template.status === "draft").length} drafts remain editable.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Structure Locked</h3>
            <p>{readyOrAssignedCount} templates are ready/assigned and treated as lifecycle-locked snapshots.</p>
          </article>
        </div>

        {inspectedTemplate ? (
          <article className="admin-tests-summary-card admin-tests-detail-card">
            <h3>Focused Template</h3>
            <p>
              <strong>{inspectedTemplate.templateName}</strong> · {inspectedTemplate.examType} ·{" "}
              {inspectedTemplate.selectedQuestionIds.length} questions
            </p>
            <div className="admin-tests-row-actions">
              <button type="button" onClick={() => navigate(`/admin/tests/analytics/${inspectedTemplate.id}`)}>
                Open Analytics
              </button>
              <button type="button" onClick={() => navigate("/admin/tests/distribution")}>
                Open Distribution Review
              </button>
              <button type="button" onClick={() => navigate("/admin/tests/settings")}>
                Open Template Settings
              </button>
            </div>
          </article>
        ) : null}

        <UiTable
          caption="Saved Test Templates"
          columns={templateColumns}
          rows={templates}
          rowKey={(row) => row.id}
          emptyStateText="No templates created yet."
        />
      </>
    );
  }

  function renderAnalyticsView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Templates Tracked</h3>
            <p>{templates.length} templates are available for structural analytics drill-in.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Question Coverage</h3>
            <p>{totalQuestionCount} frozen question slots are currently represented across library templates.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Focused Template</h3>
            <p>{inspectedTemplate ? inspectedTemplate.templateName : "No template selected for analytics."}</p>
          </article>
        </div>

        {inspectedTemplate ? (
          <article className="admin-tests-summary-card admin-tests-detail-card">
            <h3>Focused Analytics Snapshot</h3>
            <p>
              Selection: {inspectedTemplate.selectionMethod} · Status: {inspectedTemplate.status} · Last updated:{" "}
              {formatIsoDate(inspectedTemplate.updatedAt)}
            </p>
            <p className="admin-tests-form-footnote">
              This dedicated analytics route now separates template analysis from create/library flows. Deeper L1/L2
              metric depth remains tracked separately under `TST-015`.
            </p>
          </article>
        ) : null}

        <UiTable
          caption="Template analytics workspace"
          columns={analyticsColumns}
          rows={templates}
          rowKey={(row) => row.id}
          emptyStateText="No templates available for analytics."
        />
      </>
    );
  }

  function renderDistributionView() {
    return (
      <>
        <article className="admin-tests-summary-card admin-tests-detail-card">
          <h3>Distribution Review</h3>
          <p>
            {inspectedTemplate ?
              `${inspectedTemplate.templateName} keeps a frozen ${inspectedTemplate.selectedQuestionIds.length}-question structural snapshot.` :
              "No template selected for structural review."}
          </p>
          {inspectedTemplate ? (
            <UiFormField label="Template" htmlFor="admin-tests-distribution-template">
              <select
                id="admin-tests-distribution-template"
                value={inspectedTemplate.id}
                onChange={(event) => setInspectedTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.templateName}
                  </option>
                ))}
              </select>
            </UiFormField>
          ) : null}
        </article>

        <UiTable
          caption="Difficulty and timing review"
          columns={[
            { id: "difficulty", header: "Difficulty", render: (row) => row.difficulty },
            { id: "count", header: "Question Count", render: (row) => row.count },
            { id: "min", header: "Min Seconds", render: (row) => row.minSeconds },
            { id: "max", header: "Max Seconds", render: (row) => row.maxSeconds },
          ]}
          rows={selectedTemplateDifficultyRows}
          rowKey={(row) => row.difficulty}
          emptyStateText="No template is currently available for distribution review."
        />
      </>
    );
  }

  function renderSettingsView() {
    return (
      <>
        <div className="admin-tests-summary-grid">
          <article className="admin-tests-summary-card">
            <h3>Lifecycle Rules</h3>
            <p>`draft` and `ready` remain editable. First assignment locks structure permanently.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Mode Ceiling</h3>
            <p>L0 allows Operational. L1 adds Diagnostic. L2+ adds Controlled and Hard capability.</p>
          </article>
          <article className="admin-tests-summary-card">
            <h3>Focused Status</h3>
            <p>{inspectedTemplate ? `${inspectedTemplate.templateName}: ${inspectedTemplate.status}` : "No template selected."}</p>
          </article>
        </div>

        <UiTable
          caption="Template settings and lock guidance"
          columns={[
            { id: "rule", header: "Rule", render: (row) => row.rule },
            { id: "value", header: "Value", render: (row) => row.value },
          ]}
          rows={[
            { rule: "Capability ceiling", value: "Configured at template creation and reused during assignment" },
            { rule: "Structural lock", value: "Applied after first assignment to preserve canonical identity" },
            { rule: "Timing profile", value: "Stored per difficulty and treated as immutable snapshot post-assignment" },
            { rule: "Duplicate handling", value: "Canonical ID comparison allows reuse or intentional duplication" },
          ]}
          rowKey={(row) => row.rule}
          emptyStateText="No template settings are currently available."
        />
      </>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-tests-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-tests-title">Test Template Management UI</h2>
      <p className="admin-content-copy">
        Create and manage template drafts through dedicated mounted subpages for authoring, library review, analytics,
        distribution review, and template settings.
      </p>

      <TestsWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {isLoadingTemplates ? <p className="admin-tests-inline-note">Loading template library from GET /admin/tests...</p> : null}
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      {currentSubpage === "create" ? renderCreateView() : null}
      {currentSubpage === "library" ? renderLibraryView() : null}
      {currentSubpage === "analytics" ? renderAnalyticsView() : null}
      {currentSubpage === "distribution" ? renderDistributionView() : null}
      {currentSubpage === "settings" ? renderSettingsView() : null}

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
