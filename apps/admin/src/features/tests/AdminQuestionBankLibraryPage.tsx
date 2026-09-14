import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import type { AdminQuestionImageAssetMutation } from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import {
  shouldUseLiveApi as shouldUseConfiguredLiveApi,
} from "../../../../../shared/services/frontendEnvironment";
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
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  createQuestionBankIdempotencyKey,
  createQuestionVersion as createQuestionVersionWithApi,
  fileToBase64,
  getQuestionLibrary,
  updateQuestionLifecycle,
  updateQuestionMetadata,
  updateQuestionStructure,
} from "./questionBankApi";

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

interface MetadataFieldDraft {
  additionalTag: string;
  internalNotes: string;
  primaryTag: string;
  secondaryTag: string;
  simulationLink: string;
  solutionImageFile: string;
  topic: string;
  tutorialVideoLink: string;
}

interface StructuralFieldDraft {
  academicYear: string;
  additionalTag: string;
  chapter: string;
  correctAnswer: string;
  difficulty: DifficultyLevel;
  examType: string;
  marks: string;
  negativeMarks: string;
  primaryTag: string;
  questionImageFile: string;
  questionType: string;
  secondaryTag: string;
  solutionImageFile: string;
  subject: string;
  topic: string;
  uniqueKey: string;
}

const PAGE_SIZE = 6;
const STRUCTURAL_LOCK_TOOLTIP = "Locked: Used in assigned test.";

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
  return shouldUseConfiguredLiveApi();
}

function toMetadataFieldDraft(question: QuestionBankRecord): MetadataFieldDraft {
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

function toStructuralFieldDraft(question: QuestionBankRecord): StructuralFieldDraft {
  return {
    academicYear: question.academicYear,
    additionalTag: question.additionalTag,
    chapter: question.chapter,
    correctAnswer: question.correctAnswer ?? "",
    difficulty: question.difficulty,
    examType: question.examType,
    marks: String(question.marks),
    negativeMarks: String(question.negativeMarks),
    primaryTag: question.primaryTag,
    questionImageFile: question.questionImageFile ?? "",
    questionType: question.questionType,
    secondaryTag: question.secondaryTag,
    solutionImageFile: question.solutionImageFile,
    subject: question.subject,
    topic: question.topic,
    uniqueKey: question.uniqueKey,
  };
}

async function fetchLibraryFromApi(): Promise<QuestionBankRecord[]> {
  return (await getQuestionLibrary({ limit: "100" })).questions;
}

function AdminQuestionBankLibraryPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const canManageQuestionBank = shouldUseLiveApi() &&
    (accessContext.role === "teacher" || accessContext.role === "admin");
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [filters, setFilters] = useState<QuestionFilterDraft>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [inlineMessage, setInlineMessage] = useState(
    "Search the library, open a question, and decide whether it needs a metadata update or a new version.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metadataEditQuestionId, setMetadataEditQuestionId] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataFieldDraft | null>(null);
  const [structureEditQuestionId, setStructureEditQuestionId] = useState<string | null>(null);
  const [structureDraft, setStructureDraft] = useState<StructuralFieldDraft | null>(null);
  const [metadataSolutionImage, setMetadataSolutionImage] = useState<File | null>(null);
  const [structureQuestionImage, setStructureQuestionImage] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const idempotencyKeysRef = useRef<Record<string, string>>({});
  const metadataEditorRef = useRef<HTMLElement | null>(null);
  const structureEditorRef = useRef<HTMLElement | null>(null);

  const reloadLibrary = useCallback(async (): Promise<QuestionBankRecord[]> => {
    const nextQuestions = await fetchLibraryFromApi();
    setQuestions(nextQuestions);
    return nextQuestions;
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadLibrary(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setQuestions(QUESTION_BANK);
        setInlineMessage("Question library is ready.");
        return;
      }

      try {
        const nextQuestions = await reloadLibrary();
        if (!isActive) {
          return;
        }

        setQuestions(nextQuestions);
        setInlineMessage(
          nextQuestions.length > 0 ?
            "Question library is ready." :
            "No saved questions were returned yet.",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question library.";
        setInlineMessage(reason);
      }
    }

    void loadLibrary();

    return () => {
      isActive = false;
    };
  }, [reloadLibrary]);

  const subjects = useMemo(() => ["all", ...new Set(questions.map((question) => question.subject))], [questions]);
  const examTypes = useMemo(() => ["all", ...new Set(questions.map((question) => question.examType))], [questions]);
  const chapters = useMemo(() => ["all", ...new Set(questions.map((question) => question.chapter))], [questions]);
  const questionTypes = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.questionType))],
    [questions],
  );
  const tags = useMemo(
    () => ["all", ...new Set(questions.flatMap((question) => [question.primaryTag, question.secondaryTag]))],
    [questions],
  );
  const additionalTags = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.additionalTag))],
    [questions],
  );
  const academicYears = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.academicYear))],
    [questions],
  );

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
  const activeMetadataQuestion = useMemo(
    () => questions.find((question) => question.id === metadataEditQuestionId) ?? null,
    [metadataEditQuestionId, questions],
  );
  const activeStructureQuestion = useMemo(
    () => questions.find((question) => question.id === structureEditQuestionId) ?? null,
    [questions, structureEditQuestionId],
  );

  const usedQuestionCount = useMemo(
    () => questions.filter((question) => question.usedCount > 0).length,
    [questions],
  );
  const editableQuestionCount = useMemo(
    () => questions.filter((question) => question.usedCount === 0 && question.status !== "deprecated").length,
    [questions],
  );

  useEffect(() => {
    if (metadataEditQuestionId && metadataEditorRef.current) {
      metadataEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [metadataEditQuestionId]);

  useEffect(() => {
    if (structureEditQuestionId && structureEditorRef.current) {
      structureEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [structureEditQuestionId]);

  function handleIndexedFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setInlineMessage("Filters applied. Open any question below to review its details.");
    setErrorMessage(null);
  }

  function openMetadataEditor(question: QuestionBankRecord) {
    setStructureEditQuestionId(null);
    setStructureDraft(null);
    setMetadataEditQuestionId(question.id);
    setMetadataDraft(toMetadataFieldDraft(question));
    setMetadataSolutionImage(null);
    setInlineMessage("Update tags, notes, links, topic, and the solution image for future use here.");
    setErrorMessage(null);
  }

  function openStructureEditor(question: QuestionBankRecord) {
    if (question.usedCount > 0) {
      setErrorMessage(
        `${STRUCTURAL_LOCK_TOOLTIP} This question has already been used in assigned runs. Create a new version instead of changing the original structure.`,
      );
      return;
    }

    setMetadataEditQuestionId(null);
    setMetadataDraft(null);
    setStructureEditQuestionId(question.id);
    setStructureDraft(toStructuralFieldDraft(question));
    setStructureQuestionImage(null);
    setInlineMessage("This question is still open, so you can edit the full structure here.");
    setErrorMessage(null);
  }

  function updateMetadataDraft(field: keyof MetadataFieldDraft, value: string) {
    setMetadataDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateStructureDraft(field: keyof StructuralFieldDraft, value: string) {
    setStructureDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function handleMetadataSolutionImageSelection(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (file.type !== "image/png" && file.type !== "image/webp") {
      setErrorMessage("Choose a PNG or WebP image. JPEG assets are not accepted by the managed boundary.");
      return;
    }
    setMetadataSolutionImage(file);
    updateMetadataDraft("solutionImageFile", file.name);
    setInlineMessage(`Selected updated solution image: ${file.name}. Save the metadata changes to keep it.`);
    setErrorMessage(null);
  }

  function handleStructureAssetSelection(
    field: "questionImageFile" | "solutionImageFile",
    fileList: FileList | null,
  ) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (file.type !== "image/png" && file.type !== "image/webp") {
      setErrorMessage("Choose a PNG or WebP image. JPEG assets are not accepted by the managed boundary.");
      return;
    }
    if (field === "questionImageFile") {
      setStructureQuestionImage(file);
    } else {
      setErrorMessage("Replace solution images from Metadata so the managed mutation remains explicit.");
      return;
    }
    updateStructureDraft(field, file.name);
    setInlineMessage(`Selected ${field === "questionImageFile" ? "question" : "solution"} image: ${file.name}. Save the structure changes to keep it.`);
    setErrorMessage(null);
  }

  async function saveMetadataEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!metadataEditQuestionId || !metadataDraft) {
      return;
    }

    const target = questions.find((question) => question.id === metadataEditQuestionId);
    if (!target || !canManageQuestionBank || pendingAction) {
      setErrorMessage("Question mutations require a live teacher or admin session.");
      return;
    }
    if (!metadataSolutionImage && metadataDraft.solutionImageFile.trim() !== (target.solutionImageFile ?? "")) {
      setErrorMessage("Choose a managed PNG/WebP file, retain the current asset, or clear the filename to remove it.");
      return;
    }
    const actionKey = `metadata:${target.id}:${target.revision ?? 1}`;
    const idempotencyKey = idempotencyKeysRef.current[actionKey] ?? createQuestionBankIdempotencyKey("question-metadata");
    idempotencyKeysRef.current[actionKey] = idempotencyKey;
    setPendingAction(actionKey);
    setErrorMessage(null);
    try {
      let solutionImage: AdminQuestionImageAssetMutation = { action: "retain" };
      if (metadataSolutionImage) {
        solutionImage = {
          action: "replace",
          contentBase64: await fileToBase64(metadataSolutionImage),
          extension: metadataSolutionImage.type === "image/webp" ? "webp" : "png",
        };
      } else if (!metadataDraft.solutionImageFile.trim() && target.solutionImageFile) {
        solutionImage = { action: "remove" };
      }
      const result = await updateQuestionMetadata(target.id, {
        additionalTag: metadataDraft.additionalTag.trim() || null,
        expectedRevision: target.revision ?? 1,
        idempotencyKey,
        internalNotes: metadataDraft.internalNotes.trim() || null,
        primaryTag: metadataDraft.primaryTag.trim() || null,
        secondaryTag: metadataDraft.secondaryTag.trim() || null,
        simulationLink: metadataDraft.simulationLink.trim() || null,
        solutionImage,
        topic: metadataDraft.topic.trim() || null,
        tutorialVideoLink: metadataDraft.tutorialVideoLink.trim() || null,
      });
      const reloaded = await reloadLibrary();
      if (reloaded.find((question) => question.id === target.id)?.revision !== result.revision) {
        throw new Error("Metadata saved, but authoritative reload did not reconcile its revision.");
      }
      delete idempotencyKeysRef.current[actionKey];
      setMetadataSolutionImage(null);
      setMetadataDraft(toMetadataFieldDraft(reloaded.find((question) => question.id === target.id) ?? target));
      setInlineMessage(`Metadata saved and reloaded for ${target.id}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Question metadata update failed.");
    } finally {
      setPendingAction(null);
    }
  }

  function closeMetadataEditor() {
    setMetadataEditQuestionId(null);
    setMetadataDraft(null);
    setInlineMessage("Question library is ready.");
  }

  async function saveStructureEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!structureEditQuestionId || !structureDraft) {
      return;
    }

    const target = questions.find((question) => question.id === structureEditQuestionId);
    if (!target || !canManageQuestionBank || pendingAction) {
      setErrorMessage("Question mutations require a live teacher or admin session.");
      return;
    }
    if (!structureQuestionImage && structureDraft.questionImageFile.trim() !== (target.questionImageFile ?? "")) {
      setErrorMessage("Choose a managed PNG/WebP file, retain the current question image, or clear it to remove it.");
      return;
    }
    const actionKey = `structure:${target.id}:${target.revision ?? 1}`;
    const idempotencyKey = idempotencyKeysRef.current[actionKey] ?? createQuestionBankIdempotencyKey("question-structure");
    idempotencyKeysRef.current[actionKey] = idempotencyKey;
    setPendingAction(actionKey);
    setErrorMessage(null);
    try {
      let questionImage: AdminQuestionImageAssetMutation = { action: "retain" };
      if (structureQuestionImage) {
        questionImage = {
          action: "replace",
          contentBase64: await fileToBase64(structureQuestionImage),
          extension: structureQuestionImage.type === "image/webp" ? "webp" : "png",
        };
      } else if (!structureDraft.questionImageFile.trim() && target.questionImageFile) {
        questionImage = { action: "remove" };
      }
      const result = await updateQuestionStructure(target.id, {
        academicYear: structureDraft.academicYear.trim() || null,
        chapter: structureDraft.chapter.trim(),
        correctAnswer: structureDraft.correctAnswer.trim(),
        difficulty: structureDraft.difficulty === "easy" ? "Easy" : structureDraft.difficulty === "hard" ? "Hard" : "Medium",
        examType: structureDraft.examType.trim(),
        expectedRevision: target.revision ?? 1,
        idempotencyKey,
        marks: Number(structureDraft.marks),
        negativeMarks: Number(structureDraft.negativeMarks),
        questionImage,
        questionType: structureDraft.questionType.trim(),
        subject: structureDraft.subject.trim(),
        uniqueKey: structureDraft.uniqueKey.trim(),
      });
      const reloaded = await reloadLibrary();
      if (reloaded.find((question) => question.id === target.id)?.revision !== result.revision) {
        throw new Error("Structure saved, but authoritative reload did not reconcile its revision.");
      }
      delete idempotencyKeysRef.current[actionKey];
      setStructureQuestionImage(null);
      setStructureDraft(toStructuralFieldDraft(reloaded.find((question) => question.id === target.id) ?? target));
      setInlineMessage(`Structure saved and reloaded for ${target.id}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Question structure update failed.");
    } finally {
      setPendingAction(null);
    }
  }

  function closeStructureEditor() {
    setStructureEditQuestionId(null);
    setStructureDraft(null);
    setInlineMessage("Question library is ready.");
  }

  async function createQuestionVersion(questionId: string) {
    const target = questions.find((question) => question.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount === 0) {
      setInlineMessage("Create a new version only when a structurally locked question needs to change.");
      setErrorMessage(null);
      return;
    }

    if (!canManageQuestionBank || pendingAction) return;
    const actionKey = `version:${target.id}:${target.revision ?? 1}`;
    const idempotencyKey = idempotencyKeysRef.current[actionKey] ?? createQuestionBankIdempotencyKey("question-version");
    idempotencyKeysRef.current[actionKey] = idempotencyKey;
    setPendingAction(actionKey);
    setErrorMessage(null);
    try {
      const result = await createQuestionVersionWithApi(target.id, {
        expectedRevision: target.revision ?? 1,
        idempotencyKey,
      });
      const reloaded = await reloadLibrary();
      const successor = reloaded.find((question) => question.id === result.successorQuestionId);
      if (!successor || successor.revision !== result.successorRevision) {
        throw new Error("Version created, but authoritative reload did not return its successor.");
      }
      delete idempotencyKeysRef.current[actionKey];
      setPage(1);
      setStructureEditQuestionId(successor.id);
      setStructureDraft(toStructuralFieldDraft(successor));
      setInlineMessage(`Created and reloaded successor ${successor.id}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Question version creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function markQuestionDeprecated(questionId: string) {
    const target = questions.find((question) => question.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount > 0) {
      setErrorMessage("Questions already used in assigned runs should move through versioning instead of direct deprecation.");
      return;
    }

    if (!canManageQuestionBank || pendingAction) return;
    const actionKey = `deprecate:${target.id}:${target.revision ?? 1}`;
    const idempotencyKey = idempotencyKeysRef.current[actionKey] ?? createQuestionBankIdempotencyKey("question-deprecate");
    idempotencyKeysRef.current[actionKey] = idempotencyKey;
    setPendingAction(actionKey);
    setErrorMessage(null);
    try {
      const result = await updateQuestionLifecycle(target.id, {
        action: "deprecate",
        expectedRevision: target.revision ?? 1,
        idempotencyKey,
        reason: "Deprecated from the Admin Question Bank library.",
      });
      const reloaded = await reloadLibrary();
      if (reloaded.find((question) => question.id === target.id)?.revision !== result.revision) {
        throw new Error("Lifecycle changed, but authoritative reload did not reconcile its revision.");
      }
      delete idempotencyKeysRef.current[actionKey];
      setInlineMessage(`${questionId} is deprecated and the authoritative library has been reloaded.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Question deprecation failed.");
    } finally {
      setPendingAction(null);
    }
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
      id: "question",
      header: "Question",
      render: (question) => (
        <div className="admin-question-library-main-cell">
          <strong>Primary tag: {question.primaryTag}</strong>
          <small>Subject: {question.subject}</small>
          <small>Chapter: {question.chapter}</small>
        </div>
      ),
    },
    {
      id: "setup",
      header: "Setup",
      render: (question) => (
        <div className="admin-question-library-compact-cell">
          <strong>{question.examType}</strong>
          <small>{question.questionType}</small>
          <small>{question.difficulty} • {question.marks} / -{question.negativeMarks}</small>
        </div>
      ),
    },
    {
      id: "activity",
      header: "Activity",
      render: (question) => (
        <div className="admin-question-library-compact-cell">
          <strong>{question.usedCount} runs</strong>
          <small>{question.lastUsedDate ? `Last used ${question.lastUsedDate}` : "Not used yet"}</small>
          <span className={`admin-tests-status admin-tests-status-${question.status}`}>{question.status}</span>
          <div className="admin-question-library-state-row">
            <span className={`admin-question-thermal-pill admin-question-thermal-${question.thermalState}`}>
              {question.thermalState.toUpperCase()}
            </span>
            {question.usedCount > 0 ? (
              <span className="admin-question-lock-pill" title={STRUCTURAL_LOCK_TOOLTIP}>
                Locked
              </span>
            ) : (
              <span className="admin-question-unlocked-pill">Open</span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-question-library-actions-col",
      render: (question) => (
        <div className="admin-question-library-actions">
          <NavLink to={`/admin/question-bank/library/${question.id}`}>View</NavLink>
          <button type="button" onClick={() => openMetadataEditor(question)} disabled={!canManageQuestionBank || Boolean(pendingAction)}>
            Metadata
          </button>
          <button
            type="button"
            onClick={() => openStructureEditor(question)}
            disabled={!canManageQuestionBank || Boolean(pendingAction) || question.usedCount > 0}
            title={question.usedCount > 0 ? STRUCTURAL_LOCK_TOOLTIP : "Edit full question structure"}
          >
            Structure
          </button>
          <button type="button" onClick={() => void createQuestionVersion(question.id)} disabled={!canManageQuestionBank || Boolean(pendingAction) || question.usedCount === 0}>
            Version
          </button>
          <button
            type="button"
            onClick={() => void markQuestionDeprecated(question.id)}
            disabled={!canManageQuestionBank || Boolean(pendingAction) || question.usedCount > 0 || question.status === "deprecated"}
          >
            Deprecate
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-library-title">
      <p className="admin-content-eyebrow">Question Bank Library</p>
      <h2 id="admin-question-bank-library-title">Question Library</h2>
      <p className="admin-content-copy">
        Search the question bank, open a question, update future-only metadata, or edit the full structure while a
        question is still open.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{pendingAction ? "Saving through the authoritative Question Bank API..." : inlineMessage}</p>
      {!canManageQuestionBank ? <p className="admin-tests-inline-note">Question changes are available only to teacher/admin identities in live API mode.</p> : null}
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Total Questions</p>
          <h3>{questions.length}</h3>
          <small>currently available in the library</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Locked Questions</p>
          <h3>{usedQuestionCount}</h3>
          <small>already used in assigned runs</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Open Questions</p>
          <h3>{editableQuestionCount}</h3>
          <small>still open for direct structure edits</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Deprecated Versions</p>
          <h3>{questions.filter((question) => question.status === "deprecated").length}</h3>
          <small>kept for history and review only</small>
        </article>
      </div>

      <UiForm
        title="Question Library Filters"
        description="Start with the main filters, then open more only if you need a narrower search."
        submitLabel="Apply Filters"
        onSubmit={handleIndexedFiltersSubmit}
        footer={
          <button
            type="button"
            onClick={() => {
              setFilters(INITIAL_FILTERS);
              setPage(1);
              setInlineMessage("Filters cleared. The full question library is now visible.");
              setErrorMessage(null);
            }}
          >
            Clear Filters
          </button>
        }
      >
        <div className="admin-question-library-filter-grid">
          <UiFormField label="Search" htmlFor="admin-question-library-filter-search">
            <input
              id="admin-question-library-filter-search"
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="id, key, subject, chapter, tag"
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
        </div>

        <details className="admin-question-library-advanced-filters">
          <summary>More filters</summary>
          <div className="admin-question-library-filter-grid admin-question-library-filter-grid-advanced">
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
            <UiFormField label="Main Tag" htmlFor="admin-question-library-filter-tag">
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
        </details>
        <div className="admin-question-library-filter-footnote">
          Use the top row for everyday search. Open more filters only when you need a narrower library cut.
        </div>
      </UiForm>

      <div className="admin-question-library-table-shell">
        <div className="admin-question-library-table-header">
          <div>
            <p>Question List</p>
            <h3>{filteredQuestions.length} questions in this view</h3>
          </div>
          <small>
            Use the row actions to open a question, edit metadata, edit open-question structure, or create a version
            when the structure is locked.
          </small>
        </div>
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
      </div>

      <section className="admin-question-library-help">
        <article className="admin-risk-summary-card">
          <h4>About HOT / WARM / COLD</h4>
          <p>HOT questions are in active current use, WARM questions are still available but less active, and COLD questions are mainly kept for history, review, or deprecated reference.</p>
          <small>Use these labels to understand how active a question is in the working library and whether it belongs to everyday use or historical review.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>About Structure Lock / Open</h4>
          <p>Open questions have not yet been used in assigned runs, so their structure can still be edited directly. Locked questions have already been used and should move through versioning instead of in-place structural change.</p>
          <small>Use Edit Structure for open questions and Create Version for locked ones.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>About Metadata Edit vs Structure Edit</h4>
          <p>Edit Metadata changes future-facing support details like tags, notes, links, topic, and solution image. Edit Structure changes core question setup like key, exam, subject, chapter, marks, answer, and image files.</p>
          <small>Use metadata editing for support updates and structure editing for real question-definition changes.</small>
        </article>
      </section>

      {metadataDraft && metadataEditQuestionId ? (
        <section ref={metadataEditorRef} className="admin-question-library-editor-shell">
          <div className="admin-question-library-editor-header">
            <div>
              <p>Metadata Editor</p>
              <h3>{metadataEditQuestionId}</h3>
            </div>
            {activeMetadataQuestion ? (
              <div className="admin-question-library-editor-tags">
                <span>{activeMetadataQuestion.subject}</span>
                <span>{activeMetadataQuestion.chapter}</span>
                <span>{activeMetadataQuestion.primaryTag}</span>
              </div>
            ) : null}
          </div>
          <UiForm
            title={`Edit Metadata: ${metadataEditQuestionId}`}
            description="Update future-facing tags, notes, links, topic, and the solution image here."
            submitLabel="Save Metadata Changes"
            onSubmit={saveMetadataEdits}
            footer={
              <button type="button" onClick={closeMetadataEditor}>
                Close
              </button>
            }
          >
            <div className="admin-tests-grid">
              <UiFormField
                label="Solution Image File"
                htmlFor="admin-question-metadata-solution-image"
                helper="You can type the filename directly or choose a replacement file below."
              >
                <input
                  id="admin-question-metadata-solution-image"
                  type="text"
                  value={metadataDraft.solutionImageFile}
                  onChange={(event) => updateMetadataDraft("solutionImageFile", event.target.value)}
                />
              </UiFormField>
              <UiFormField
                label="Upload Updated Solution Image"
                htmlFor="admin-question-metadata-solution-image-upload"
                helper="The selected filename will be saved for this question."
              >
                <input
                  id="admin-question-metadata-solution-image-upload"
                  type="file"
                  accept=".png,.webp,image/png,image/webp"
                  onChange={(event) => handleMetadataSolutionImageSelection(event.target.files)}
                />
              </UiFormField>
              <UiFormField label="Primary Tag" htmlFor="admin-question-metadata-primary-tag">
                <input
                  id="admin-question-metadata-primary-tag"
                  type="text"
                  value={metadataDraft.primaryTag}
                  onChange={(event) => updateMetadataDraft("primaryTag", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Secondary Tag" htmlFor="admin-question-metadata-secondary-tag">
                <input
                  id="admin-question-metadata-secondary-tag"
                  type="text"
                  value={metadataDraft.secondaryTag}
                  onChange={(event) => updateMetadataDraft("secondaryTag", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Additional Tag" htmlFor="admin-question-metadata-additional-tag">
                <input
                  id="admin-question-metadata-additional-tag"
                  type="text"
                  value={metadataDraft.additionalTag}
                  onChange={(event) => updateMetadataDraft("additionalTag", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Topic" htmlFor="admin-question-metadata-topic">
                <input
                  id="admin-question-metadata-topic"
                  type="text"
                  value={metadataDraft.topic}
                  onChange={(event) => updateMetadataDraft("topic", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Tutorial Video Link" htmlFor="admin-question-metadata-tutorial">
                <input
                  id="admin-question-metadata-tutorial"
                  type="url"
                  value={metadataDraft.tutorialVideoLink}
                  onChange={(event) => updateMetadataDraft("tutorialVideoLink", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Simulation Link" htmlFor="admin-question-metadata-simulation">
                <input
                  id="admin-question-metadata-simulation"
                  type="url"
                  value={metadataDraft.simulationLink}
                  onChange={(event) => updateMetadataDraft("simulationLink", event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Internal Notes" htmlFor="admin-question-metadata-notes">
                <textarea
                  id="admin-question-metadata-notes"
                  value={metadataDraft.internalNotes}
                  onChange={(event) => updateMetadataDraft("internalNotes", event.target.value)}
                />
              </UiFormField>
            </div>
          </UiForm>
        </section>
      ) : null}

      {structureDraft && structureEditQuestionId ? (
        <section ref={structureEditorRef} className="admin-question-library-editor-shell admin-question-library-editor-shell-structure">
          <div className="admin-question-library-editor-header">
            <div>
              <p>Structure Editor</p>
              <h3>{structureEditQuestionId}</h3>
            </div>
            {activeStructureQuestion ? (
              <div className="admin-question-library-editor-tags">
                <span>{activeStructureQuestion.examType}</span>
                <span>{activeStructureQuestion.subject}</span>
                <span>{activeStructureQuestion.usedCount > 0 ? "Locked" : "Open"}</span>
              </div>
            ) : null}
          </div>
          <UiForm
            title={`Edit Structure: ${structureEditQuestionId}`}
            description="Update the full question structure here. This is allowed only while the question is still open and unused in assigned runs."
            submitLabel="Save Structure Changes"
            onSubmit={saveStructureEdits}
            footer={
              <button type="button" onClick={closeStructureEditor}>
                Close
              </button>
            }
          >
            <div className="admin-tests-grid">
            <UiFormField label="Unique Key" htmlFor="admin-question-structure-key">
              <input
                id="admin-question-structure-key"
                type="text"
                value={structureDraft.uniqueKey}
                onChange={(event) => updateStructureDraft("uniqueKey", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Exam" htmlFor="admin-question-structure-exam">
              <input
                id="admin-question-structure-exam"
                type="text"
                value={structureDraft.examType}
                onChange={(event) => updateStructureDraft("examType", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Academic Year" htmlFor="admin-question-structure-academic-year">
              <input
                id="admin-question-structure-academic-year"
                type="text"
                value={structureDraft.academicYear}
                onChange={(event) => updateStructureDraft("academicYear", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Subject" htmlFor="admin-question-structure-subject">
              <input
                id="admin-question-structure-subject"
                type="text"
                value={structureDraft.subject}
                onChange={(event) => updateStructureDraft("subject", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Chapter" htmlFor="admin-question-structure-chapter">
              <input
                id="admin-question-structure-chapter"
                type="text"
                value={structureDraft.chapter}
                onChange={(event) => updateStructureDraft("chapter", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Difficulty" htmlFor="admin-question-structure-difficulty">
              <select
                id="admin-question-structure-difficulty"
                value={structureDraft.difficulty}
                onChange={(event) => updateStructureDraft("difficulty", event.target.value as DifficultyLevel)}
              >
                {DIFFICULTY_LEVELS.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </UiFormField>
            <UiFormField label="Marks" htmlFor="admin-question-structure-marks">
              <input
                id="admin-question-structure-marks"
                type="number"
                min="0"
                value={structureDraft.marks}
                onChange={(event) => updateStructureDraft("marks", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Negative Marks" htmlFor="admin-question-structure-negative-marks">
              <input
                id="admin-question-structure-negative-marks"
                type="number"
                min="0"
                value={structureDraft.negativeMarks}
                onChange={(event) => updateStructureDraft("negativeMarks", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Question Type" htmlFor="admin-question-structure-question-type">
              <input
                id="admin-question-structure-question-type"
                type="text"
                value={structureDraft.questionType}
                onChange={(event) => updateStructureDraft("questionType", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Correct Answer" htmlFor="admin-question-structure-correct-answer">
              <input
                id="admin-question-structure-correct-answer"
                type="text"
                value={structureDraft.correctAnswer}
                onChange={(event) => updateStructureDraft("correctAnswer", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Question Image File" htmlFor="admin-question-structure-question-image">
              <input
                id="admin-question-structure-question-image"
                type="text"
                value={structureDraft.questionImageFile}
                onChange={(event) => updateStructureDraft("questionImageFile", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Upload Question Image" htmlFor="admin-question-structure-question-image-upload">
              <input
                id="admin-question-structure-question-image-upload"
                type="file"
                accept=".png,.webp,image/png,image/webp"
                onChange={(event) => handleStructureAssetSelection("questionImageFile", event.target.files)}
              />
            </UiFormField>
            <UiFormField label="Solution Image File" htmlFor="admin-question-structure-solution-image">
              <input
                id="admin-question-structure-solution-image"
                type="text"
                value={structureDraft.solutionImageFile}
                onChange={(event) => updateStructureDraft("solutionImageFile", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Solution Image" htmlFor="admin-question-structure-solution-image-upload" helper="Use Metadata to replace the managed solution image.">
              <input
                id="admin-question-structure-solution-image-upload"
                type="file"
                accept=".png,.webp,image/png,image/webp"
                disabled
              />
            </UiFormField>
            <UiFormField label="Primary Tag" htmlFor="admin-question-structure-primary-tag">
              <input
                id="admin-question-structure-primary-tag"
                type="text"
                value={structureDraft.primaryTag}
                onChange={(event) => updateStructureDraft("primaryTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Secondary Tag" htmlFor="admin-question-structure-secondary-tag">
              <input
                id="admin-question-structure-secondary-tag"
                type="text"
                value={structureDraft.secondaryTag}
                onChange={(event) => updateStructureDraft("secondaryTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Additional Tag" htmlFor="admin-question-structure-additional-tag">
              <input
                id="admin-question-structure-additional-tag"
                type="text"
                value={structureDraft.additionalTag}
                onChange={(event) => updateStructureDraft("additionalTag", event.target.value)}
              />
            </UiFormField>
            <UiFormField label="Topic" htmlFor="admin-question-structure-topic">
              <input
                id="admin-question-structure-topic"
                type="text"
                value={structureDraft.topic}
                onChange={(event) => updateStructureDraft("topic", event.target.value)}
              />
            </UiFormField>
            </div>
          </UiForm>
        </section>
      ) : null}

    </section>
  );
}

export default AdminQuestionBankLibraryPage;
