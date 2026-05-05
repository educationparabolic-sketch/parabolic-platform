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
  QUESTION_BANK,
  type DifficultyLevel,
  type QuestionBankRecord,
} from "./testTemplateFixtures";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

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

function AdminQuestionBankLibraryPage() {
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [filters, setFilters] = useState<QuestionFilterDraft>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [inlineMessage, setInlineMessage] = useState(
    "Question library now has its own mounted workspace with indexed filters, pagination, and structural lock review.",
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
      setErrorMessage("Structural fields are locked once a question is used in assigned runs. Use Create Version instead.");
      return;
    }

    setInlineMessage(`Structural edit allowed for ${question.id}; no assigned-run linkage detected.`);
    setErrorMessage(null);
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
          <p>Exam-facing operators work through search, subject, chapter, difficulty, tag, and HOT/WARM/COLD filters.</p>
          <small>Aligned with the source spec performance rules.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Immutable Structure Rules</h4>
          <p>Questions already used in assigned runs surface a structure lock and must branch through version creation.</p>
          <small>Future metadata edits remain separate from historical scoring.</small>
        </article>
      </div>

      <UiForm
        title="Question Library Filters"
        description="Filter by indexed fields only: subject, chapter, difficulty, tag, thermal state, and text query."
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
