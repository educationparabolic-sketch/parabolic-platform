import { useState, type FormEvent } from "react";
import { UiForm, UiFormField } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

type TagOperation = "create" | "rename" | "merge" | "deprecate";

interface TagRecord {
  id: string;
  name: string;
  status: "active" | "deprecated";
  usedInActiveTemplate: boolean;
}

const INITIAL_TAGS: TagRecord[] = [
  { id: "tag-1", name: "motion", status: "active", usedInActiveTemplate: true },
  { id: "tag-2", name: "thermo", status: "active", usedInActiveTemplate: false },
  { id: "tag-3", name: "advanced", status: "active", usedInActiveTemplate: true },
  { id: "tag-4", name: "foundation", status: "active", usedInActiveTemplate: false },
];

function AdminQuestionBankTagManagementPage() {
  const [tagRecords, setTagRecords] = useState<TagRecord[]>(INITIAL_TAGS);
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [tagPrimaryValue, setTagPrimaryValue] = useState("");
  const [tagSecondaryValue, setTagSecondaryValue] = useState("");
  const [inlineMessage, setInlineMessage] = useState(
    "Tag management now has its own mounted workspace for create, rename, merge, and deprecate controls.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeTagCount = tagRecords.filter((tag) => tag.status === "active").length;
  const deprecatedTagCount = tagRecords.filter((tag) => tag.status === "deprecated").length;
  const lockedTagCount = tagRecords.filter((tag) => tag.usedInActiveTemplate).length;

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
          <small>referenced by active templates</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Allowed Operations</p>
          <h3>4</h3>
          <small>create, rename, merge, deprecate</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Governed Lifecycle</h4>
          <p>Tag changes affect future analytics and future question usage without rewriting historical run snapshots.</p>
          <small>Matches the source spec governance rule.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Template Safety</h4>
          <p>Delete is not offered, and deprecate is blocked when a tag is referenced by active templates.</p>
          <small>Active template stability stays intact.</small>
        </article>
      </div>

      <UiForm
        title="Tag Operations"
        description="Supported operations: Create, Rename, Merge, Deprecate."
        submitLabel="Apply Tag Operation"
        onSubmit={applyTagOperation}
        footer={<span className="admin-tests-form-footnote">Delete is blocked when a tag is used in active templates.</span>}
      >
        <UiFormField label="Operation" htmlFor="admin-question-tags-operation">
          <select
            id="admin-question-tags-operation"
            value={tagOperation}
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
            onChange={(event) => setTagPrimaryValue(event.target.value)}
            placeholder="motion"
          />
        </UiFormField>
        <UiFormField label="Secondary Tag" htmlFor="admin-question-tags-secondary">
          <input
            id="admin-question-tags-secondary"
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
    </section>
  );
}

export default AdminQuestionBankTagManagementPage;
