import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiForm, UiFormField, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { QUESTION_BANK, type QuestionBankRecord } from "./testTemplateFixtures";

const apiClient = getPortalApiClient("admin");

type TagOperation = "create" | "rename" | "merge" | "deprecate";

interface TagRecord {
  id: string;
  name: string;
  questionCount: number;
  status: "active" | "deprecated";
  usedInActiveTemplate: boolean;
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

function buildTagRecordsFromQuestions(questions: QuestionBankRecord[]): TagRecord[] {
  const tagMap = new Map<string, TagRecord>();

  const registerTag = (rawTag: string, question: QuestionBankRecord, fallbackId: string): void => {
    const normalizedTag = rawTag.trim().toLowerCase();
    if (normalizedTag.length === 0 || normalizedTag === "none") {
      return;
    }

    const existing = tagMap.get(normalizedTag);
    tagMap.set(normalizedTag, {
      id: existing?.id ?? fallbackId,
      name: normalizedTag,
      questionCount: (existing?.questionCount ?? 0) + 1,
      status: existing?.status ?? "active",
      usedInActiveTemplate:
        (existing?.usedInActiveTemplate ?? false) ||
        (question.status !== "deprecated" && question.usedCount > 0),
    });
  };

  questions.forEach((question, index) => {
    registerTag(question.primaryTag, question, `tag-primary-${index + 1}`);
    registerTag(question.secondaryTag, question, `tag-secondary-${index + 1}`);
  });

  return Array.from(tagMap.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeApiTagRecord(value: unknown, index: number): TagRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    id: toNonEmptyString(record.id, `tag-${index + 1}`),
    name: toNonEmptyString(record.name, `tag-${index + 1}`),
    questionCount: Math.max(0, toNumberOrZero(record.questionCount)),
    status: record.status === "deprecated" ? "deprecated" : "active",
    usedInActiveTemplate: record.usedInActiveTemplate === true,
  };
}

async function fetchTagRecordsFromApi(): Promise<TagRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/tags");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/tags returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      tags?: unknown;
    };
  };
  const tags = Array.isArray(response.data?.tags) ? response.data.tags : [];

  return tags
    .map((entry, index) => normalizeApiTagRecord(entry, index))
    .filter((entry): entry is TagRecord => Boolean(entry));
}

async function applyTagOperationInApi(
  operation: TagOperation,
  primaryTag: string,
  secondaryTag: string,
): Promise<{message: string; tags: TagRecord[]}> {
  const payload = await apiClient.post<unknown, {
    actionType: TagOperation;
    primaryTag: string;
    secondaryTag?: string;
  }>("/admin/questions/tags", {
    body: {
      actionType: operation,
      primaryTag,
      secondaryTag: secondaryTag.length > 0 ? secondaryTag : undefined,
    },
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("POST /admin/questions/tags returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      tags?: unknown;
    };
    message?: unknown;
  };
  const tags = Array.isArray(response.data?.tags) ? response.data.tags : [];

  return {
    message:
      typeof response.message === "string" && response.message.trim().length > 0 ?
        response.message :
        "Question tag operation completed.",
    tags: tags
      .map((entry, index) => normalizeApiTagRecord(entry, index))
      .filter((entry): entry is TagRecord => Boolean(entry)),
  };
}

function AdminQuestionBankTagManagementPage() {
  const [tagRecords, setTagRecords] = useState<TagRecord[]>(() => buildTagRecordsFromQuestions(QUESTION_BANK));
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [tagPrimaryValue, setTagPrimaryValue] = useState("");
  const [tagSecondaryValue, setTagSecondaryValue] = useState("");
  const [inlineMessage, setInlineMessage] = useState(
    "Tag management now has its own mounted workspace for create, rename, merge, and deprecate controls.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTagCount = tagRecords.filter((tag) => tag.status === "active").length;
  const deprecatedTagCount = tagRecords.filter((tag) => tag.status === "deprecated").length;
  const lockedTagCount = tagRecords.filter((tag) => tag.usedInActiveTemplate).length;
  const coveredQuestionCount = useMemo(
    () => tagRecords.reduce((sum, tag) => sum + tag.questionCount, 0),
    [tagRecords],
  );

  useEffect(() => {
    let isActive = true;

    async function loadTagRecords(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setTagRecords(buildTagRecordsFromQuestions(QUESTION_BANK));
        setInlineMessage("Local mode detected. Loaded deterministic governed-tag fixtures from question library data.");
        return;
      }

      try {
        const nextTagRecords = await fetchTagRecordsFromApi();
        if (!isActive) {
          return;
        }

        setTagRecords(nextTagRecords.length > 0 ? nextTagRecords : buildTagRecordsFromQuestions(QUESTION_BANK));
        setInlineMessage(
          nextTagRecords.length > 0 ?
            "Live mode enabled: governed tag inventory hydrated from GET /admin/questions/tags." :
            "Live mode enabled, but no persisted governed tags were returned yet.",
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load governed tag inventory.";
        setTagRecords(buildTagRecordsFromQuestions(QUESTION_BANK));
        setInlineMessage(`${reason} Falling back to deterministic governed-tag fixtures.`);
      }
    }

    void loadTagRecords();

    return () => {
      isActive = false;
    };
  }, []);

  const tagColumns: UiTableColumn<TagRecord>[] = [
    { id: "name", header: "Tag", render: (tag) => tag.name },
    { id: "status", header: "Status", render: (tag) => tag.status },
    { id: "questionCount", header: "Questions", render: (tag) => tag.questionCount },
    {
      id: "protected",
      header: "Protected",
      render: (tag) => (tag.usedInActiveTemplate ? "Yes" : "No"),
    },
  ];

  async function runLiveTagOperation(
    operation: TagOperation,
    primary: string,
    secondary: string,
  ): Promise<boolean> {
    if (!shouldUseLiveApi()) {
      return false;
    }

    try {
      setIsSubmitting(true);
      const result = await applyTagOperationInApi(operation, primary, secondary);
      setTagRecords(result.tags);
      setInlineMessage(result.message);
      setErrorMessage(null);
      setTagPrimaryValue("");
      setTagSecondaryValue("");
      return true;
    } catch (error) {
      const reason =
        error instanceof ApiClientError ? error.message : "Failed to apply governed tag operation.";
      setErrorMessage(reason);
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function applyTagOperation(event: FormEvent<HTMLFormElement>) {
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

      if (await runLiveTagOperation(tagOperation, primary, secondary)) {
        return;
      }

      setTagRecords((current) => [
        ...current,
        {
          id: `tag-${Date.now()}`,
          name: primary,
          questionCount: 0,
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

      if (await runLiveTagOperation(tagOperation, primary, secondary)) {
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

      if (await runLiveTagOperation(tagOperation, primary, secondary)) {
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
      setErrorMessage("Cannot deprecate a tag that still appears in live in-use question coverage.");
      return;
    }

    if (await runLiveTagOperation(tagOperation, primary, secondary)) {
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

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-tags-title">
      <p className="admin-content-eyebrow">Question Bank Tags</p>
      <h2 id="admin-question-bank-tags-title">Dedicated Tag Management Workspace</h2>
      <p className="admin-content-copy">
        This route keeps <code>/admin/question-bank/tags</code> focused on governed tag operations instead of merging
        create, rename, merge, and deprecate controls into the upload workflow.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Active Tags</p>
          <h3>{activeTagCount}</h3>
          <small>available for future packaging and analytics</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Deprecated Tags</p>
          <h3>{deprecatedTagCount}</h3>
          <small>retained for historical consistency</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Protected Tags</p>
          <h3>{lockedTagCount}</h3>
          <small>live in-use question coverage blocks risky deprecation</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Allowed Operations</p>
          <h3>4</h3>
          <small>create, rename, merge, deprecate</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Tagged Links</p>
          <h3>{coveredQuestionCount}</h3>
          <small>question-tag relationships loaded into this workspace</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Governed Lifecycle</h4>
          <p>Tag changes affect future analytics and future question usage without rewriting historical run snapshots.</p>
          <small>Matches the source spec governance rule.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Live Coverage Safety</h4>
          <p>This workspace now prefers persisted governed-tag data when available before falling back to deterministic tag fixtures.</p>
          <small>Risky deprecations stay blocked when tags remain in active question coverage.</small>
        </article>
      </div>

      <UiForm
        title="Tag Operations"
        description="Supported operations: Create, Rename, Merge, Deprecate."
        submitLabel={isSubmitting ? "Applying..." : "Apply Tag Operation"}
        onSubmit={applyTagOperation}
        footer={<span className="admin-tests-form-footnote">Delete is blocked when a tag still appears in live in-use question coverage.</span>}
      >
        <UiFormField label="Operation" htmlFor="admin-question-tags-operation">
          <select
            id="admin-question-tags-operation"
            value={tagOperation}
            disabled={isSubmitting}
            onChange={(event) => setTagOperation(event.target.value as TagOperation)}
          >
            <option value="create">Create</option>
            <option value="rename">Rename</option>
            <option value="merge">Merge</option>
            <option value="deprecate">Deprecate</option>
          </select>
        </UiFormField>
        <UiFormField label="Primary Tag" htmlFor="admin-question-tags-primary">
          <input
            id="admin-question-tags-primary"
            type="text"
            value={tagPrimaryValue}
            disabled={isSubmitting}
            onChange={(event) => setTagPrimaryValue(event.target.value)}
            placeholder="motion"
          />
        </UiFormField>
        <UiFormField label="Secondary Tag" htmlFor="admin-question-tags-secondary">
          <input
            id="admin-question-tags-secondary"
            type="text"
            value={tagSecondaryValue}
            disabled={isSubmitting}
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

      <UiTable
        caption="Governed tag coverage"
        columns={tagColumns}
        rows={tagRecords}
        rowKey={(row) => row.id}
        emptyStateText="No governed tags are available yet."
      />
    </section>
  );
}

export default AdminQuestionBankTagManagementPage;
