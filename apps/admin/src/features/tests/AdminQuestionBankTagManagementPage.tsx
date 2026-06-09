import { useMemo, useState, type FormEvent } from "react";
import { UiForm, UiFormField, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { QUESTION_BANK, type QuestionBankRecord } from "./testTemplateFixtures";

type TagFieldScope = "primaryTag" | "secondaryTag" | "topic";
type TagOperation = "create" | "rename" | "merge" | "deprecate";

interface TagRecord {
  id: string;
  name: string;
  questionCount: number;
  status: "active" | "deprecated";
  usedInActiveTemplate: boolean;
}

interface TagLibraryFilters {
  examType: string;
  subject: string;
  chapter: string;
}

const TAG_SCOPE_LABELS: Record<TagFieldScope, string> = {
  primaryTag: "Primary Tag",
  secondaryTag: "Secondary Tag",
  topic: "Topic",
};

const TAG_OPERATION_LABELS: Record<TagOperation, string> = {
  create: "Create Tag",
  rename: "Rename Tag",
  merge: "Merge Tags",
  deprecate: "Deprecate Tag",
};

function buildTagRecordsFromQuestions(
  questions: QuestionBankRecord[],
  tagFieldScope: TagFieldScope,
  deprecatedNames: Set<string>,
): TagRecord[] {
  const tagMap = new Map<string, TagRecord>();

  questions.forEach((question, index) => {
    const rawTag = question[tagFieldScope];
    const normalizedTag = typeof rawTag === "string" ? rawTag.trim().toLowerCase() : "";
    if (normalizedTag.length === 0 || normalizedTag === "none") {
      return;
    }

    const existing = tagMap.get(normalizedTag);
    tagMap.set(normalizedTag, {
      id: existing?.id ?? `${tagFieldScope}-${index + 1}`,
      name: normalizedTag,
      questionCount: (existing?.questionCount ?? 0) + 1,
      status: deprecatedNames.has(normalizedTag) ? "deprecated" : "active",
      usedInActiveTemplate:
        (existing?.usedInActiveTemplate ?? false) ||
        (question.status !== "deprecated" && question.usedCount > 0),
    });
  });

  return Array.from(tagMap.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function updateQuestionTagField(
  questions: QuestionBankRecord[],
  tagFieldScope: TagFieldScope,
  matcher: (currentValue: string) => boolean,
  nextValue: string,
): QuestionBankRecord[] {
  return questions.map((question) => {
    const currentValue = question[tagFieldScope];
    if (typeof currentValue !== "string") {
      return question;
    }

    return matcher(currentValue.trim().toLowerCase()) ? { ...question, [tagFieldScope]: nextValue } : question;
  });
}

function AdminQuestionBankTagManagementPage() {
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [tagFieldScope, setTagFieldScope] = useState<TagFieldScope>("primaryTag");
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [firstEntryValue, setFirstEntryValue] = useState("");
  const [secondEntryValue, setSecondEntryValue] = useState("");
  const [tableFilters, setTableFilters] = useState<TagLibraryFilters>({
    examType: "all",
    subject: "all",
    chapter: "all",
  });
  const [deprecatedTagsByScope, setDeprecatedTagsByScope] = useState<Record<TagFieldScope, Set<string>>>({
    primaryTag: new Set(),
    secondaryTag: new Set(),
    topic: new Set(),
  });
  const [inlineMessage, setInlineMessage] = useState(
    "Choose which tag field you want to manage, then apply a create, rename, merge, or deprecate change.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const examTypes = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.examType))],
    [questions],
  );
  const subjects = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.subject))],
    [questions],
  );
  const chapters = useMemo(
    () => ["all", ...new Set(questions.map((question) => question.chapter))],
    [questions],
  );

  const filteredQuestions = useMemo(
    () =>
      questions.filter((question) => {
        const examMatches = tableFilters.examType === "all" || question.examType === tableFilters.examType;
        const subjectMatches = tableFilters.subject === "all" || question.subject === tableFilters.subject;
        const chapterMatches = tableFilters.chapter === "all" || question.chapter === tableFilters.chapter;
        return examMatches && subjectMatches && chapterMatches;
      }),
    [questions, tableFilters],
  );

  const tagRecords = useMemo(
    () => buildTagRecordsFromQuestions(filteredQuestions, tagFieldScope, deprecatedTagsByScope[tagFieldScope]),
    [deprecatedTagsByScope, filteredQuestions, tagFieldScope],
  );

  const activeTagCount = tagRecords.filter((tag) => tag.status === "active").length;
  const deprecatedTagCount = tagRecords.filter((tag) => tag.status === "deprecated").length;
  const lockedTagCount = tagRecords.filter((tag) => tag.usedInActiveTemplate).length;

  const tagColumns: UiTableColumn<TagRecord>[] = [
    {
      id: "name",
      header: "Tag",
      render: (tag) => (
        <div className="admin-question-library-main-cell">
          <strong>{tag.name}</strong>
          <small>{tag.status === "deprecated" ? "Historical tag only" : "Available for future question use"}</small>
        </div>
      ),
    },
    { id: "status", header: "Status", render: (tag) => (tag.status === "deprecated" ? "Deprecated" : "Active") },
    { id: "questionCount", header: "Questions Using Tag", render: (tag) => tag.questionCount },
    { id: "protected", header: "Live Use", render: (tag) => (tag.usedInActiveTemplate ? "Yes" : "No") },
  ];

  const formSecondaryLabel =
    tagOperation === "rename" ? "New Name" :
    tagOperation === "merge" ? "Merged Tag Name" :
    "Second Entry";

  const formSecondaryHelper =
    tagOperation === "rename" ? "Enter the replacement name for the selected tag." :
    tagOperation === "merge" ? "Enter the single tag name that should remain after merging." :
    "This field is only needed for rename and merge.";

  function clearForm() {
    setFirstEntryValue("");
    setSecondEntryValue("");
  }

  function updateDeprecatedScope(
    updater: (current: Set<string>) => Set<string>,
  ) {
    setDeprecatedTagsByScope((current) => ({
      ...current,
      [tagFieldScope]: updater(current[tagFieldScope]),
    }));
  }

  function applyTagOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const primaryInput = firstEntryValue.trim().toLowerCase();
    const secondaryInput = secondEntryValue.trim().toLowerCase();

    if (tagOperation === "create") {
      if (primaryInput.length === 0) {
        setErrorMessage("Enter the new tag name first.");
        return;
      }

      if (tagRecords.some((tag) => tag.name === primaryInput)) {
        setErrorMessage("That tag already exists in this tag field.");
        return;
      }

      const fillerValue = tagFieldScope === "topic" ? primaryInput : primaryInput;
      setQuestions((current) => [
        {
          ...current[0],
          id: `${current[0]?.id ?? "q-new"}-tag-${Date.now()}`,
          uniqueKey: `${current[0]?.uniqueKey ?? "NEW"}-tag-${Date.now()}`,
          usedCount: 0,
          lastUsedDate: null,
          status: "active",
          thermalState: "warm",
          [tagFieldScope]: fillerValue,
        },
        ...current,
      ]);
      updateDeprecatedScope((scopeTags) => {
        const next = new Set(scopeTags);
        next.delete(primaryInput);
        return next;
      });
      setInlineMessage(`${TAG_SCOPE_LABELS[tagFieldScope]} "${primaryInput}" created and is now available for question use.`);
      setErrorMessage(null);
      clearForm();
      return;
    }

    if (primaryInput.length === 0) {
      setErrorMessage(tagOperation === "merge" ? "Enter the source tags first." : "Enter the current tag name first.");
      return;
    }

    const existingNames = new Set(tagRecords.map((tag) => tag.name));

    if (tagOperation === "rename") {
      if (!existingNames.has(primaryInput)) {
        setErrorMessage("The current tag name was not found.");
        return;
      }

      if (secondaryInput.length === 0) {
        setErrorMessage("Enter the new tag name.");
        return;
      }

      setQuestions((current) =>
        updateQuestionTagField(current, tagFieldScope, (value) => value === primaryInput, secondaryInput),
      );
      updateDeprecatedScope((scopeTags) => {
        const next = new Set(scopeTags);
        next.delete(primaryInput);
        next.delete(secondaryInput);
        return next;
      });
      setInlineMessage(
        `${TAG_SCOPE_LABELS[tagFieldScope]} "${primaryInput}" renamed to "${secondaryInput}" across all questions in this workspace.`,
      );
      setErrorMessage(null);
      clearForm();
      return;
    }

    if (tagOperation === "merge") {
      const mergeSources = primaryInput
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

      if (mergeSources.length < 2) {
        setErrorMessage("Enter at least two source tags, separated by commas, for merge.");
        return;
      }

      const missingSources = mergeSources.filter((source) => !existingNames.has(source));
      if (missingSources.length > 0) {
        setErrorMessage(`These tags were not found: ${missingSources.join(", ")}.`);
        return;
      }

      if (secondaryInput.length === 0) {
        setErrorMessage("Enter the single merged tag name that should remain.");
        return;
      }

      const mergeSourceSet = new Set(mergeSources);
      setQuestions((current) =>
        updateQuestionTagField(current, tagFieldScope, (value) => mergeSourceSet.has(value), secondaryInput),
      );
      updateDeprecatedScope((scopeTags) => {
        const next = new Set(scopeTags);
        mergeSources.forEach((source) => next.add(source));
        next.delete(secondaryInput);
        return next;
      });
      setInlineMessage(
        `${mergeSources.join(", ")} merged into "${secondaryInput}" across all questions in this workspace.`,
      );
      setErrorMessage(null);
      clearForm();
      return;
    }

    const target = tagRecords.find((tag) => tag.name === primaryInput);
    if (!target) {
      setErrorMessage("The tag to deprecate was not found.");
      return;
    }

    if (target.usedInActiveTemplate) {
      setErrorMessage("This tag is still in active use. Review or retag those questions before deprecating it.");
      return;
    }

    updateDeprecatedScope((scopeTags) => {
      const next = new Set(scopeTags);
      next.add(primaryInput);
      return next;
    });
    setInlineMessage(
      `${TAG_SCOPE_LABELS[tagFieldScope]} "${primaryInput}" is now deprecated and should not be used for future questions.`,
    );
    setErrorMessage(null);
    clearForm();
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-tags-title">
      <p className="admin-content-eyebrow">Question Bank Tags</p>
      <h2 id="admin-question-bank-tags-title">Tag Management</h2>
      <p className="admin-content-copy">
        Keep question tags clean, consistent, and safe for future use across the question bank.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Active</p>
          <h3>{activeTagCount}</h3>
          <small>ready for future use</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Deprecated</p>
          <h3>{deprecatedTagCount}</h3>
          <small>historical only</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Live Use</p>
          <h3>{lockedTagCount}</h3>
          <small>still linked to active coverage</small>
        </article>
      </div>

      <div className="admin-question-tags-layout">
        <UiForm
          title="Tag Actions"
          description="Choose the tag field, choose the action, then make the change."
          submitLabel="Apply Tag Change"
          onSubmit={applyTagOperation}
          footer={<span className="admin-tests-form-footnote">The selected change will be applied across the questions currently loaded here for this tag field.</span>}
        >
          <div className="admin-question-tags-action-grid">
            <UiFormField label="Tag Field" htmlFor="admin-question-tags-scope">
              <select
                id="admin-question-tags-scope"
                value={tagFieldScope}
                onChange={(event) => {
                  setTagFieldScope(event.target.value as TagFieldScope);
                  clearForm();
                  setErrorMessage(null);
                }}
              >
                <option value="primaryTag">Primary Tag</option>
                <option value="secondaryTag">Secondary Tag</option>
                <option value="topic">Topic</option>
              </select>
            </UiFormField>

            <UiFormField label="Action" htmlFor="admin-question-tags-operation">
              <select
                id="admin-question-tags-operation"
                value={tagOperation}
                onChange={(event) => {
                  setTagOperation(event.target.value as TagOperation);
                  clearForm();
                  setErrorMessage(null);
                }}
              >
                <option value="create">{TAG_OPERATION_LABELS.create}</option>
                <option value="rename">{TAG_OPERATION_LABELS.rename}</option>
                <option value="merge">{TAG_OPERATION_LABELS.merge}</option>
                <option value="deprecate">{TAG_OPERATION_LABELS.deprecate}</option>
              </select>
            </UiFormField>

            <UiFormField
              label={
                tagOperation === "create" ? `New ${TAG_SCOPE_LABELS[tagFieldScope]} Name` :
                tagOperation === "merge" ? `Source ${TAG_SCOPE_LABELS[tagFieldScope]}s` :
                `Current ${TAG_SCOPE_LABELS[tagFieldScope]}`
              }
              htmlFor="admin-question-tags-primary"
              helper={
                tagOperation === "merge" ?
                  "Use commas between the tags you want to merge." :
                  "Enter the value you want to work with."
              }
            >
              <input
                id="admin-question-tags-primary"
                type="text"
                value={firstEntryValue}
                onChange={(event) => setFirstEntryValue(event.target.value)}
                placeholder={
                  tagOperation === "merge" ? "motion, dynamics, force" :
                  tagOperation === "create" ? "motion" :
                  "Enter tag name"
                }
              />
            </UiFormField>

            {(tagOperation === "rename" || tagOperation === "merge") ? (
              <UiFormField
                label={formSecondaryLabel}
                htmlFor="admin-question-tags-secondary"
                helper={formSecondaryHelper}
              >
                <input
                  id="admin-question-tags-secondary"
                  type="text"
                  value={secondEntryValue}
                  onChange={(event) => setSecondEntryValue(event.target.value)}
                  placeholder={tagOperation === "merge" ? "final merged tag" : "replacement name"}
                />
              </UiFormField>
            ) : null}
          </div>

        </UiForm>

        <div className="admin-question-tags-guidance">
          <article className="admin-risk-summary-card">
            <h4>Quick Guide</h4>
            <p>Choose the field first, then the action.</p>
            <small>Create adds a new value. Rename replaces one value. Merge combines many old values into one final value. Deprecate retires a value from future use.</small>
          </article>
          <article className="admin-risk-summary-card">
            <h4>Merge Rule</h4>
            <p>Use merge for duplicate or messy naming.</p>
            <small>Enter the old values in the first box and the one clean final value in the second box. The result is applied across all loaded questions for the selected field.</small>
          </article>
          <article className="admin-risk-summary-card">
            <h4>Safety Rule</h4>
            <p>Do not retire values still tied to active coverage.</p>
            <small>Review or retag those questions first so search, filtering, and future template use stay clean.</small>
          </article>
        </div>
      </div>

      <UiForm
        title={`${TAG_SCOPE_LABELS[tagFieldScope]} Library Filters`}
        description="Narrow the table to the exam, subject, and chapter you want to review."
        submitLabel="Apply Filters"
        onSubmit={(event) => event.preventDefault()}
        footer={
          <button
            type="button"
            onClick={() => setTableFilters({ examType: "all", subject: "all", chapter: "all" })}
          >
            Clear Filters
          </button>
        }
      >
        <div className="admin-question-library-filter-grid admin-question-tags-filter-grid">
          <UiFormField label="Exam" htmlFor="admin-question-tags-filter-exam">
            <select
              id="admin-question-tags-filter-exam"
              value={tableFilters.examType}
              onChange={(event) => setTableFilters((current) => ({ ...current, examType: event.target.value }))}
            >
              {examTypes.map((examType) => (
                <option key={examType} value={examType}>
                  {examType}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Subject" htmlFor="admin-question-tags-filter-subject">
            <select
              id="admin-question-tags-filter-subject"
              value={tableFilters.subject}
              onChange={(event) => setTableFilters((current) => ({ ...current, subject: event.target.value }))}
            >
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Chapter" htmlFor="admin-question-tags-filter-chapter">
            <select
              id="admin-question-tags-filter-chapter"
              value={tableFilters.chapter}
              onChange={(event) => setTableFilters((current) => ({ ...current, chapter: event.target.value }))}
            >
              {chapters.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </UiFormField>
        </div>
      </UiForm>

      <UiTable
        caption={`${TAG_SCOPE_LABELS[tagFieldScope]} library`}
        columns={tagColumns}
        rows={tagRecords}
        rowKey={(row) => row.id}
        emptyStateText="No tags are available for this field yet."
      />
    </section>
  );
}

export default AdminQuestionBankTagManagementPage;
