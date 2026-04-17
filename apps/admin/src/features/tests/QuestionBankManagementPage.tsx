import { useMemo, useState, type FormEvent } from "react";
import {
  UiForm,
  UiFormField,
  UiPagination,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  DIFFICULTY_LEVELS,
  EXAM_TYPES,
  QUESTION_BANK,
  type DifficultyLevel,
  type ExamType,
  type QuestionBankRecord,
} from "./testTemplateFixtures";

type UploadLogRecord = {
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  versionCreated: number;
};

type TagOperation = "create" | "rename" | "merge" | "deprecate";

interface TagRecord {
  id: string;
  name: string;
  status: "active" | "deprecated";
  usedInActiveTemplate: boolean;
}

interface QuestionFilterDraft {
  query: string;
  subject: string;
  chapter: string;
  difficulty: "all" | DifficultyLevel;
  tag: string;
  thermalState: "all" | "hot" | "warm" | "cold";
}

const PAGE_SIZE = 6;

const INITIAL_FILTERS: QuestionFilterDraft = {
  query: "",
  subject: "all",
  chapter: "all",
  difficulty: "all",
  tag: "all",
  thermalState: "all",
};

const INITIAL_TAGS: TagRecord[] = [
  { id: "tag-1", name: "motion", status: "active", usedInActiveTemplate: true },
  { id: "tag-2", name: "thermo", status: "active", usedInActiveTemplate: false },
  { id: "tag-3", name: "advanced", status: "active", usedInActiveTemplate: true },
  { id: "tag-4", name: "foundation", status: "active", usedInActiveTemplate: false },
];

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function QuestionBankManagementPage() {
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [filters, setFilters] = useState<QuestionFilterDraft>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedUploadFile, setSelectedUploadFile] = useState<string>("");
  const [uploadExamType, setUploadExamType] = useState<ExamType>("JEEMains");
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>([]);
  const [tagRecords, setTagRecords] = useState<TagRecord[]>(INITIAL_TAGS);
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [tagPrimaryValue, setTagPrimaryValue] = useState("");
  const [tagSecondaryValue, setTagSecondaryValue] = useState("");
  const [inlineMessage, setInlineMessage] = useState(
    "Question library uses indexed filter inputs with paginated results and immutable structural lock cues.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const subjects = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.subject))];
  }, [questions]);

  const chapters = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.chapter))];
  }, [questions]);

  const tags = useMemo(() => {
    return ["all", ...new Set(questions.flatMap((question) => [question.primaryTag, question.secondaryTag]))];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return questions.filter((question) => {
      const queryMatches =
        query.length === 0 ||
        question.id.toLowerCase().includes(query) ||
        question.uniqueKey.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        question.primaryTag.toLowerCase().includes(query) ||
        question.secondaryTag.toLowerCase().includes(query);

      const subjectMatches = filters.subject === "all" || question.subject === filters.subject;
      const chapterMatches = filters.chapter === "all" || question.chapter === filters.chapter;
      const difficultyMatches = filters.difficulty === "all" || question.difficulty === filters.difficulty;
      const tagMatches =
        filters.tag === "all" ||
        question.primaryTag === filters.tag ||
        question.secondaryTag === filters.tag;
      const thermalMatches = filters.thermalState === "all" || question.thermalState === filters.thermalState;

      return queryMatches && subjectMatches && chapterMatches && difficultyMatches && tagMatches && thermalMatches;
    });
  }, [filters, questions]);

  const paginatedQuestions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredQuestions.slice(start, start + PAGE_SIZE);
  }, [filteredQuestions, page]);

  function handleIndexedFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setInlineMessage("Indexed filters applied with paginated question library view.");
    setErrorMessage(null);
  }

  function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedUploadFile.trim().length === 0) {
      setErrorMessage("Select a ZIP package before validation/upload.");
      return;
    }

    const nextLog: UploadLogRecord = {
      id: `upl-${Date.now()}`,
      uploadedBy: "admin@parabolic.local",
      timestamp: new Date().toISOString(),
      totalRows: 120,
      errors: 0,
      warnings: uploadExamType === "NEET" ? 1 : 0,
      versionCreated: 1,
    };

    setUploadLogs((current) => [nextLog, ...current]);
    setInlineMessage(
      `Upload package ${selectedUploadFile} validated for ${uploadExamType}. Log saved immutably under questionUploadLogs.`,
    );
    setErrorMessage(null);
    setSelectedUploadFile("");
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

  function requestStructuralEdit(question: QuestionBankRecord) {
    if (question.usedCount > 0) {
      setErrorMessage("Structural fields are locked once a question is used in assigned runs. Use Create Version instead.");
      return;
    }

    setInlineMessage(`Structural edit allowed for ${question.id}; no assigned-run linkage detected.`);
    setErrorMessage(null);
  }

  function applyTagOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const primary = tagPrimaryValue.trim().toLowerCase();
    const secondary = tagSecondaryValue.trim().toLowerCase();

    if (primary.length === 0) {
      setErrorMessage("Provide at least one tag value to perform tag management operations.");
      return;
    }

    if (tagOperation === "create") {
      if (tagRecords.some((tag) => tag.name.toLowerCase() === primary)) {
        setErrorMessage("Tag already exists.");
        return;
      }

      setTagRecords((current) => [
        ...current,
        {
          id: `tag-${Date.now()}`,
          name: primary,
          status: "active",
          usedInActiveTemplate: false,
        },
      ]);
      setInlineMessage(`Tag ${primary} created for future question and analytics usage.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      return;
    }

    const target = tagRecords.find((tag) => tag.name.toLowerCase() === primary);
    if (!target) {
      setErrorMessage("Primary tag not found.");
      return;
    }

    if (tagOperation === "rename") {
      if (secondary.length === 0) {
        setErrorMessage("Provide the new tag name for rename.");
        return;
      }

      setTagRecords((current) => current.map((tag) => (
        tag.id === target.id ? { ...tag, name: secondary } : tag
      )));
      setInlineMessage(`Tag ${primary} renamed to ${secondary}.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      setTagSecondaryValue("");
      return;
    }

    if (tagOperation === "merge") {
      if (secondary.length === 0) {
        setErrorMessage("Provide destination tag for merge.");
        return;
      }

      if (!tagRecords.some((tag) => tag.name.toLowerCase() === secondary)) {
        setErrorMessage("Destination tag does not exist.");
        return;
      }

      setTagRecords((current) => current.map((tag) => (
        tag.id === target.id ? { ...tag, status: "deprecated" } : tag
      )));
      setInlineMessage(`Merged ${primary} into ${secondary}. Source tag marked deprecated for future use.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      setTagSecondaryValue("");
      return;
    }

    if (target.usedInActiveTemplate) {
      setErrorMessage("Cannot deprecate a tag referenced by active templates.");
      return;
    }

    setTagRecords((current) => current.map((tag) => (
      tag.id === target.id ? { ...tag, status: "deprecated" } : tag
    )));
    setInlineMessage(`Tag ${primary} deprecated. Future templates can exclude this tag.`);
    setErrorMessage(null);
    setTagPrimaryValue("");
    setTagSecondaryValue("");
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
      header: "Subject / Chapter",
      render: (question) => `${question.subject} / ${question.chapter}`,
    },
    {
      id: "difficulty",
      header: "Difficulty",
      render: (question) => question.difficulty,
    },
    {
      id: "tags",
      header: "Tags",
      render: (question) => `${question.primaryTag}, ${question.secondaryTag}`,
    },
    {
      id: "usage",
      header: "Used / Version / Tier",
      render: (question) => `${question.usedCount} / v${question.version} / ${question.thermalState}`,
    },
    {
      id: "status",
      header: "Status",
      render: (question) => (
        <span className={`admin-tests-status admin-tests-status-${question.status}`}>{question.status}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (question) => {
        const structuralLocked = question.usedCount > 0;
        return (
          <div className="admin-tests-row-actions">
            <button type="button" onClick={() => requestStructuralEdit(question)}>
              {structuralLocked ? "Structure Locked" : "Edit Structure"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInlineMessage(
                  `Metadata warning: edits to tags/notes for ${question.id} affect future solution view only.`,
                );
                setErrorMessage(null);
              }}
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

  const uploadLogColumns: UiTableColumn<UploadLogRecord>[] = [
    { id: "id", header: "Upload ID", render: (log) => log.id },
    { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
    { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
    { id: "totalRows", header: "Rows", render: (log) => log.totalRows },
    { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
    { id: "versionCreated", header: "Version", render: (log) => log.versionCreated },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-question-bank-title">Question Bank Management UI</h2>
      <p className="admin-content-copy">
        Upload question packages, manage indexed library filters, enforce structural immutability rules, and maintain
        governed tags.
      </p>

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-tests-grid">
        <UiForm
          title="Upload Question Package"
          description="ZIP upload validates schema and writes immutable logs for rollback-safe auditing."
          submitLabel="Validate & Queue Upload"
          onSubmit={handleUploadSubmit}
          footer={
            <span className="admin-tests-form-footnote">
              Upload is admin-role only. Structural mutations are versioned when question is already assigned.
            </span>
          }
        >
          <UiFormField label="Exam Type" htmlFor="admin-question-upload-exam-type">
            <select
              id="admin-question-upload-exam-type"
              value={uploadExamType}
              onChange={(event) => setUploadExamType(event.target.value as ExamType)}
            >
              {EXAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Question Package (.zip)" htmlFor="admin-question-upload-file">
            <input
              id="admin-question-upload-file"
              type="file"
              accept=".zip"
              onChange={(event) => setSelectedUploadFile(event.target.files?.[0]?.name ?? "")}
            />
          </UiFormField>
          <UiFormField label="Sample Workbook Schema" htmlFor="admin-question-upload-schema">
            <textarea
              id="admin-question-upload-schema"
              rows={4}
              value="UniqueKey, Exam, Subject, Chapter, Difficulty, Marks, NegativeMarks, QuestionType, CorrectAnswer"
              readOnly
            />
          </UiFormField>
        </UiForm>

        <UiForm
          title="Tag Management"
          description="Supported operations: Create, Rename, Merge, Deprecate."
          submitLabel="Apply Tag Operation"
          onSubmit={applyTagOperation}
          footer={<span className="admin-tests-form-footnote">Delete is blocked when tag is used in active templates.</span>}
        >
          <UiFormField label="Operation" htmlFor="admin-tag-operation">
            <select
              id="admin-tag-operation"
              value={tagOperation}
              onChange={(event) => setTagOperation(event.target.value as TagOperation)}
            >
              <option value="create">Create</option>
              <option value="rename">Rename</option>
              <option value="merge">Merge</option>
              <option value="deprecate">Deprecate</option>
            </select>
          </UiFormField>
          <UiFormField label="Primary Tag" htmlFor="admin-tag-primary">
            <input
              id="admin-tag-primary"
              type="text"
              value={tagPrimaryValue}
              onChange={(event) => setTagPrimaryValue(event.target.value)}
              placeholder="motion"
            />
          </UiFormField>
          <UiFormField label="Secondary Tag" htmlFor="admin-tag-secondary">
            <input
              id="admin-tag-secondary"
              type="text"
              value={tagSecondaryValue}
              onChange={(event) => setTagSecondaryValue(event.target.value)}
              placeholder="Required for rename/merge"
            />
          </UiFormField>
          <div className="admin-question-tag-chips" role="list" aria-label="Existing tags">
            {tagRecords.map((tag) => (
              <span key={tag.id} role="listitem" className={`admin-question-tag-chip admin-question-tag-chip-${tag.status}`}>
                {tag.name} ({tag.status})
              </span>
            ))}
          </div>
        </UiForm>
      </div>

      <UiForm
        title="Question Library (Indexed Filters)"
        description="Filter by indexed fields only: subject, chapter, difficulty, tag, thermal state and text query."
        submitLabel="Apply Filters"
        onSubmit={handleIndexedFiltersSubmit}
      >
        <div className="admin-tests-grid">
          <UiFormField label="Search" htmlFor="admin-question-filter-search">
            <input
              id="admin-question-filter-search"
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="id, key, subject, chapter, prompt"
            />
          </UiFormField>
          <UiFormField label="Subject" htmlFor="admin-question-filter-subject">
            <select
              id="admin-question-filter-subject"
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
          <UiFormField label="Chapter" htmlFor="admin-question-filter-chapter">
            <select
              id="admin-question-filter-chapter"
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
          <UiFormField label="Difficulty" htmlFor="admin-question-filter-difficulty">
            <select
              id="admin-question-filter-difficulty"
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
          <UiFormField label="Tag" htmlFor="admin-question-filter-tag">
            <select
              id="admin-question-filter-tag"
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
          <UiFormField label="HOT/WARM/COLD" htmlFor="admin-question-filter-thermal">
            <select
              id="admin-question-filter-thermal"
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
        caption="Question Library"
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

      <UiTable
        caption="Question Upload Logs"
        columns={uploadLogColumns}
        rows={uploadLogs}
        rowKey={(row) => row.id}
        emptyStateText="No package uploads yet."
      />
    </section>
  );
}

export default QuestionBankManagementPage;
