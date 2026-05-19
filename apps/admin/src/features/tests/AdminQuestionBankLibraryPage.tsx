import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiForm,
  UiFormField,
  UiPagination,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  DIFFICULTY_LEVELS,
  QUESTION_BANK,
  type DifficultyLevel,
  type QuestionBankRecord,
} from "./testTemplateFixtures";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

const apiClient = getPortalApiClient("admin");

interface QuestionFilterDraft {
  academicYear: string;
  additionalTag: string;
  examType: string;
  query: string;
  questionType: string;
  subject: string;
  chapter: string;
  difficulty: "all" | DifficultyLevel;
  tag: string;
  usedInTemplate: "all" | "yes" | "no";
  thermalState: "all" | "hot" | "warm" | "cold";
}

const PAGE_SIZE = 6;
const STRUCTURAL_LOCK_TOOLTIP = "Locked: Used in assigned test.";
const STRUCTURAL_LOCK_FIELDS = [
  "UniqueKey",
  "Difficulty",
  "Marks",
  "NegativeMarks",
  "QuestionType",
  "QuestionImageFile",
  "CorrectAnswer",
  "Exam",
  "Subject",
];
const FLEXIBLE_FIELD_WARNING = "Changes affect future solution view only. Past scoring unaffected.";
const FLEXIBLE_FIELD_LABELS = [
  "SolutionImageFile",
  "TutorialVideoLink",
  "SimulationLink",
  "PrimaryTag",
  "SecondaryTag",
  "AdditionalTag",
  "Topic",
  "InternalNotes",
];

interface FlexibleFieldDraft {
  additionalTag: string;
  internalNotes: string;
  primaryTag: string;
  secondaryTag: string;
  simulationLink: string;
  solutionImageFile: string;
  topic: string;
  tutorialVideoLink: string;
}

const INITIAL_FILTERS: QuestionFilterDraft = {
  academicYear: "all",
  additionalTag: "all",
  examType: "all",
  query: "",
  questionType: "all",
  subject: "all",
  chapter: "all",
  difficulty: "all",
  tag: "all",
  usedInTemplate: "all",
  thermalState: "all",
};

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

function normalizeDifficulty(value: unknown, fallback: DifficultyLevel): DifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
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

function toFlexibleFieldDraft(question: QuestionBankRecord): FlexibleFieldDraft {
  return {
    additionalTag: question.additionalTag,
    internalNotes: question.internalNotes,
    primaryTag: question.primaryTag,
    secondaryTag: question.secondaryTag,
    simulationLink: question.simulationLink,
    solutionImageFile: question.solutionImageFile,
    topic: question.topic,
    tutorialVideoLink: question.tutorialVideoLink,
  };
}

async function fetchLibraryFromApi(): Promise<QuestionBankRecord[]> {
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

  return normalizedQuestions;
}

function AdminQuestionBankLibraryPage() {
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [filters, setFilters] = useState<QuestionFilterDraft>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [inlineMessage, setInlineMessage] = useState(
    "Question library now has its own mounted workspace with indexed filters, pagination, and structural lock review.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flexibleEditQuestionId, setFlexibleEditQuestionId] = useState<string | null>(null);
  const [flexibleDraft, setFlexibleDraft] = useState<FlexibleFieldDraft | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadLibrary(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setQuestions(QUESTION_BANK);
        setInlineMessage("Local mode detected. Loaded deterministic question library fixtures.");
        return;
      }

      try {
        const nextQuestions = await fetchLibraryFromApi();
        if (!isActive) {
          return;
        }

        setQuestions(nextQuestions.length > 0 ? nextQuestions : QUESTION_BANK);
        setInlineMessage(
          nextQuestions.length > 0 ?
            "Live mode enabled: question library hydrated from GET /admin/questions/library." :
            "Live mode enabled, but no persisted question library records were returned yet.",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question library.";
        setQuestions(QUESTION_BANK);
        setInlineMessage(`${reason} Falling back to deterministic question library fixtures.`);
      }
    }

    void loadLibrary();

    return () => {
      isActive = false;
    };
  }, []);

  const subjects = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.subject))];
  }, [questions]);

  const examTypes = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.examType))];
  }, [questions]);

  const chapters = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.chapter))];
  }, [questions]);

  const questionTypes = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.questionType))];
  }, [questions]);

  const tags = useMemo(() => {
    return ["all", ...new Set(questions.flatMap((question) => [question.primaryTag, question.secondaryTag]))];
  }, [questions]);

  const additionalTags = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.additionalTag))];
  }, [questions]);

  const academicYears = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.academicYear))];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return questions.filter((question) => {
      const queryMatches =
        query.length === 0 ||
        question.id.toLowerCase().includes(query) ||
        question.uniqueKey.toLowerCase().includes(query) ||
        question.examType.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        question.primaryTag.toLowerCase().includes(query) ||
        question.secondaryTag.toLowerCase().includes(query) ||
        question.additionalTag.toLowerCase().includes(query) ||
        question.questionType.toLowerCase().includes(query) ||
        question.academicYear.toLowerCase().includes(query);

      const examMatches = filters.examType === "all" || question.examType === filters.examType;
      const subjectMatches = filters.subject === "all" || question.subject === filters.subject;
      const chapterMatches = filters.chapter === "all" || question.chapter === filters.chapter;
      const difficultyMatches = filters.difficulty === "all" || question.difficulty === filters.difficulty;
      const questionTypeMatches =
        filters.questionType === "all" || question.questionType === filters.questionType;
      const tagMatches =
        filters.tag === "all" ||
        question.primaryTag === filters.tag ||
        question.secondaryTag === filters.tag;
      const additionalTagMatches =
        filters.additionalTag === "all" || question.additionalTag === filters.additionalTag;
      const usedInTemplateMatches =
        filters.usedInTemplate === "all" ||
        (filters.usedInTemplate === "yes" && question.usedCount > 0) ||
        (filters.usedInTemplate === "no" && question.usedCount === 0);
      const academicYearMatches =
        filters.academicYear === "all" || question.academicYear === filters.academicYear;
      const thermalMatches = filters.thermalState === "all" || question.thermalState === filters.thermalState;

      return (
        queryMatches &&
        examMatches &&
        subjectMatches &&
        chapterMatches &&
        difficultyMatches &&
        questionTypeMatches &&
        tagMatches &&
        additionalTagMatches &&
        usedInTemplateMatches &&
        academicYearMatches &&
        thermalMatches
      );
    });
  }, [filters, questions]);

  const paginatedQuestions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredQuestions.slice(start, start + PAGE_SIZE);
  }, [filteredQuestions, page]);

  const usedQuestionCount = useMemo(() => {
    return questions.filter((question) => question.usedCount > 0).length;
  }, [questions]);

  function handleIndexedFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setInlineMessage("Indexed filters applied on the dedicated question library workspace.");
    setErrorMessage(null);
  }

  function requestStructuralEdit(question: QuestionBankRecord) {
    if (question.usedCount > 0) {
      setErrorMessage(
        `${STRUCTURAL_LOCK_TOOLTIP} Locked fields: ${STRUCTURAL_LOCK_FIELDS.join(", ")}. Use Create Version instead.`,
      );
      return;
    }

    setInlineMessage(`Structural edit allowed for ${question.id}; no assigned-run linkage detected.`);
    setErrorMessage(null);
  }

  function openFlexibleFieldEditor(question: QuestionBankRecord) {
    setFlexibleEditQuestionId(question.id);
    setFlexibleDraft(toFlexibleFieldDraft(question));
    setInlineMessage(FLEXIBLE_FIELD_WARNING);
    setErrorMessage(null);
  }

  function updateFlexibleDraft(field: keyof FlexibleFieldDraft, value: string) {
    setFlexibleDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function saveFlexibleFieldEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!flexibleEditQuestionId || !flexibleDraft) {
      return;
    }

    setQuestions((current) =>
      current.map((question) =>
        question.id === flexibleEditQuestionId ?
          {
            ...question,
            additionalTag: flexibleDraft.additionalTag.trim() || "none",
            internalNotes: flexibleDraft.internalNotes.trim(),
            primaryTag: flexibleDraft.primaryTag.trim() || "untagged",
            secondaryTag: flexibleDraft.secondaryTag.trim() || "none",
            simulationLink: flexibleDraft.simulationLink.trim(),
            solutionImageFile: flexibleDraft.solutionImageFile.trim(),
            topic: flexibleDraft.topic.trim(),
            tutorialVideoLink: flexibleDraft.tutorialVideoLink.trim(),
          } :
          question,
      ),
    );
    setInlineMessage(`${FLEXIBLE_FIELD_WARNING} Flexible metadata saved for ${flexibleEditQuestionId}.`);
    setErrorMessage(null);
  }

  function closeFlexibleFieldEditor() {
    setFlexibleEditQuestionId(null);
    setFlexibleDraft(null);
    setInlineMessage("Flexible metadata editor closed.");
  }

  function createQuestionVersion(questionId: string) {
    const target = questions.find((question) => question.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount === 0) {
      setInlineMessage("Versioning is required only for structural changes on questions used in assigned runs.");
      setErrorMessage(null);
      return;
    }

    const newVersionId = `${target.id}-v${target.version + 1}`;
    const nextQuestion: QuestionBankRecord = {
      ...target,
      id: newVersionId,
      uniqueKey: `${target.uniqueKey}-v${target.version + 1}`,
      version: target.version + 1,
      usedCount: 0,
      thermalState: "warm",
      status: "active",
    };

    setQuestions((current) => [
      nextQuestion,
      ...current.map((question): QuestionBankRecord => (
        question.id === target.id ? { ...question, status: "deprecated" as const } : question
      )),
    ]);
    setInlineMessage(`Created version ${nextQuestion.version} for ${target.id}. Previous version marked deprecated.`);
    setErrorMessage(null);
  }

  const questionColumns: UiTableColumn<QuestionBankRecord>[] = [
    {
      id: "uniqueKey",
      header: "UniqueKey",
      render: (question) => (
        <div className="admin-tests-template-cell">
          <strong>{question.id}</strong>
          <small>{question.uniqueKey}</small>
        </div>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      render: (question) => question.subject,
    },
    {
      id: "chapter",
      header: "Chapter",
      render: (question) => question.chapter,
    },
    {
      id: "difficulty",
      header: "Difficulty",
      render: (question) => question.difficulty,
    },
    {
      id: "marks",
      header: "Marks",
      render: (question) => `${question.marks}`,
    },
    {
      id: "usedCount",
      header: "Used Count",
      render: (question) => `${question.usedCount}`,
    },
    {
      id: "lastUsedDate",
      header: "Last Used Date",
      render: (question) => question.lastUsedDate ?? "Never",
    },
    {
      id: "version",
      header: "Version",
      render: (question) => `v${question.version}`,
    },
    {
      id: "status",
      header: "Status",
      render: (question) => (
        <span className={`admin-tests-status admin-tests-status-${question.status}`}>{question.status}</span>
      ),
    },
    {
      id: "structuralLock",
      header: "Structure Lock",
      render: (question) => {
        const structuralLocked = question.usedCount > 0;

        return (
          <div className="admin-question-structural-lock">
            {structuralLocked ? (
              <span className="admin-question-lock-pill" title={STRUCTURAL_LOCK_TOOLTIP} aria-label={STRUCTURAL_LOCK_TOOLTIP}>
                <span aria-hidden="true">🔒</span>
                Locked
              </span>
            ) : (
              <span className="admin-question-unlocked-pill">Editable</span>
            )}
            <small>{structuralLocked ? STRUCTURAL_LOCK_FIELDS.join(", ") : "Locks after first assigned test use"}</small>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (question) => {
        const structuralLocked = question.usedCount > 0;

        return (
          <div className="admin-tests-row-actions">
            <button type="button" onClick={() => requestStructuralEdit(question)} title={structuralLocked ? STRUCTURAL_LOCK_TOOLTIP : undefined}>
              {structuralLocked ? "Structure Locked" : "Edit Structure"}
            </button>
            <button
              type="button"
              onClick={() => openFlexibleFieldEditor(question)}
            >
              Edit Metadata
            </button>
            <button type="button" onClick={() => createQuestionVersion(question.id)} disabled={!structuralLocked}>
              Create Version
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-library-title">
      <p className="admin-content-eyebrow">Question Bank Library</p>
      <h2 id="admin-question-bank-library-title">Dedicated Question Library Workspace</h2>
      <p className="admin-content-copy">
        This route keeps <code>/admin/question-bank/library</code> focused on indexed discovery, immutable structural
        lock review, and version-safe library actions instead of leaving those controls merged with upload workflows.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Questions</p>
          <h3>{questions.length}</h3>
          <small>indexed for filter-first retrieval</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Structural Locks</p>
          <h3>{usedQuestionCount}</h3>
          <small>used in assigned runs</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>HOT Inventory</p>
          <h3>{questions.filter((question) => question.thermalState === "hot").length}</h3>
          <small>current-year frequently used</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Deprecated Versions</p>
          <h3>{questions.filter((question) => question.status === "deprecated").length}</h3>
          <small>kept for audit-safe history</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Indexed Filters Only</h4>
          <p>
            Exam-facing operators work through search, exam, subject, chapter, difficulty, type, tag, usage, year, and
            HOT/WARM/COLD filters.
          </p>
          <small>Aligned with the source spec performance rules.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Immutable Structure Rules</h4>
          <p>Questions already used in assigned runs surface a structure lock and must branch through version creation.</p>
          <small>{STRUCTURAL_LOCK_FIELDS.join(", ")}</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Flexible Field Edits</h4>
          <p>{FLEXIBLE_FIELD_WARNING}</p>
          <small>{FLEXIBLE_FIELD_LABELS.join(", ")}</small>
        </article>
      </div>

      {flexibleDraft && flexibleEditQuestionId ? (
        <UiForm
          title={`Flexible Metadata: ${flexibleEditQuestionId}`}
          description={FLEXIBLE_FIELD_WARNING}
          submitLabel="Save Future-Only Metadata"
          onSubmit={saveFlexibleFieldEdits}
          footer={
            <button type="button" onClick={closeFlexibleFieldEditor}>
              Close
            </button>
          }
        >
          <div className="admin-tests-grid">
            <UiFormField label="SolutionImageFile" htmlFor="admin-question-flex-solution-image">
              <input
                id="admin-question-flex-solution-image"
                type="text"
                value={flexibleDraft.solutionImageFile}
                onChange={(event) => updateFlexibleDraft("solutionImageFile", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="TutorialVideoLink" htmlFor="admin-question-flex-tutorial">
              <input
                id="admin-question-flex-tutorial"
                type="url"
                value={flexibleDraft.tutorialVideoLink}
                onChange={(event) => updateFlexibleDraft("tutorialVideoLink", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="SimulationLink" htmlFor="admin-question-flex-simulation">
              <input
                id="admin-question-flex-simulation"
                type="url"
                value={flexibleDraft.simulationLink}
                onChange={(event) => updateFlexibleDraft("simulationLink", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="PrimaryTag" htmlFor="admin-question-flex-primary-tag">
              <input
                id="admin-question-flex-primary-tag"
                type="text"
                value={flexibleDraft.primaryTag}
                onChange={(event) => updateFlexibleDraft("primaryTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="SecondaryTag" htmlFor="admin-question-flex-secondary-tag">
              <input
                id="admin-question-flex-secondary-tag"
                type="text"
                value={flexibleDraft.secondaryTag}
                onChange={(event) => updateFlexibleDraft("secondaryTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="AdditionalTag" htmlFor="admin-question-flex-additional-tag">
              <input
                id="admin-question-flex-additional-tag"
                type="text"
                value={flexibleDraft.additionalTag}
                onChange={(event) => updateFlexibleDraft("additionalTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Topic" htmlFor="admin-question-flex-topic">
              <input
                id="admin-question-flex-topic"
                type="text"
                value={flexibleDraft.topic}
                onChange={(event) => updateFlexibleDraft("topic", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="InternalNotes" htmlFor="admin-question-flex-internal-notes">
              <textarea
                id="admin-question-flex-internal-notes"
                value={flexibleDraft.internalNotes}
                onChange={(event) => updateFlexibleDraft("internalNotes", event.target.value)}
              />
            </UiFormField>
          </div>
        </UiForm>
      ) : null}

      <UiForm
        title="Question Library Filters"
        description="Filter by indexed fields only: exam, subject, chapter, difficulty, question type, tags, usage, academic year, thermal state, and text query."
        submitLabel="Apply Filters"
        onSubmit={handleIndexedFiltersSubmit}
      >
        <div className="admin-tests-grid">
          <UiFormField label="Search" htmlFor="admin-question-library-filter-search">
            <input
              id="admin-question-library-filter-search"
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="id, key, subject, chapter, prompt"
            />
          </UiFormField>
          <UiFormField label="Exam" htmlFor="admin-question-library-filter-exam">
            <select
              id="admin-question-library-filter-exam"
              value={filters.examType}
              onChange={(event) => setFilters((current) => ({ ...current, examType: event.target.value }))}
            >
              {examTypes.map((examType) => (
                <option key={examType} value={examType}>
                  {examType}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Subject" htmlFor="admin-question-library-filter-subject">
            <select
              id="admin-question-library-filter-subject"
              value={filters.subject}
              onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
            >
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Chapter" htmlFor="admin-question-library-filter-chapter">
            <select
              id="admin-question-library-filter-chapter"
              value={filters.chapter}
              onChange={(event) => setFilters((current) => ({ ...current, chapter: event.target.value }))}
            >
              {chapters.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Difficulty" htmlFor="admin-question-library-filter-difficulty">
            <select
              id="admin-question-library-filter-difficulty"
              value={filters.difficulty}
              onChange={(event) => setFilters((current) => ({
                ...current,
                difficulty: event.target.value as "all" | DifficultyLevel,
              }))}
            >
              <option value="all">all</option>
              {DIFFICULTY_LEVELS.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Question Type" htmlFor="admin-question-library-filter-question-type">
            <select
              id="admin-question-library-filter-question-type"
              value={filters.questionType}
              onChange={(event) => setFilters((current) => ({ ...current, questionType: event.target.value }))}
            >
              {questionTypes.map((questionType) => (
                <option key={questionType} value={questionType}>
                  {questionType}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Tag" htmlFor="admin-question-library-filter-tag">
            <select
              id="admin-question-library-filter-tag"
              value={filters.tag}
              onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Additional Tag" htmlFor="admin-question-library-filter-additional-tag">
            <select
              id="admin-question-library-filter-additional-tag"
              value={filters.additionalTag}
              onChange={(event) => setFilters((current) => ({ ...current, additionalTag: event.target.value }))}
            >
              {additionalTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Used in Template" htmlFor="admin-question-library-filter-used">
            <select
              id="admin-question-library-filter-used"
              value={filters.usedInTemplate}
              onChange={(event) => setFilters((current) => ({
                ...current,
                usedInTemplate: event.target.value as "all" | "yes" | "no",
              }))}
            >
              <option value="all">all</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </UiFormField>
          <UiFormField label="Academic Year" htmlFor="admin-question-library-filter-academic-year">
            <select
              id="admin-question-library-filter-academic-year"
              value={filters.academicYear}
              onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
            >
              {academicYears.map((academicYear) => (
                <option key={academicYear} value={academicYear}>
                  {academicYear}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="HOT/WARM/COLD" htmlFor="admin-question-library-filter-thermal">
            <select
              id="admin-question-library-filter-thermal"
              value={filters.thermalState}
              onChange={(event) => setFilters((current) => ({
                ...current,
                thermalState: event.target.value as "all" | "hot" | "warm" | "cold",
              }))}
            >
              <option value="all">all</option>
              <option value="hot">hot</option>
              <option value="warm">warm</option>
              <option value="cold">cold</option>
            </select>
          </UiFormField>
        </div>
      </UiForm>

      <UiTable
        caption="Question library"
        columns={questionColumns}
        rows={paginatedQuestions}
        rowKey={(row) => row.id}
        emptyStateText="No questions match the indexed filters."
      />
      <UiPagination
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={filteredQuestions.length}
        onPageChange={setPage}
      />
    </section>
  );
}

export default AdminQuestionBankLibraryPage;
