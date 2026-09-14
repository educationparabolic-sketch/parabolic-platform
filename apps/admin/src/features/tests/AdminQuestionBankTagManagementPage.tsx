import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AdminQuestionTagAuthorityRecord, AdminQuestionTagField, AdminQuestionTagMutationRequest } from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { shouldUseLiveApi } from "../../../../../shared/services/frontendEnvironment";
import { UiForm, UiFormField, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { createQuestionBankIdempotencyKey, getQuestionTags, mutateQuestionTags } from "./questionBankApi";
import { QUESTION_BANK } from "./testTemplateFixtures";

type TagOperation = "create" | "rename" | "merge" | "deprecate";
const TAG_SCOPE_LABELS: Record<AdminQuestionTagField, string> = {
  primaryTag: "Primary Tag", secondaryTag: "Secondary Tag", additionalTag: "Additional Tag", topic: "Topic",
};
const TAG_OPERATION_LABELS: Record<TagOperation, string> = {
  create: "Create Tag", rename: "Rename Tag", merge: "Merge Tags", deprecate: "Deprecate Tag",
};

function fixtureTags(field: AdminQuestionTagField): AdminQuestionTagAuthorityRecord[] {
  const counts = new Map<string, {count: number; used: boolean}>();
  QUESTION_BANK.forEach((question) => {
    const name = question[field].trim();
    if (!name || name === "none") return;
    const current = counts.get(name) ?? {count: 0, used: false};
    counts.set(name, {count: current.count + 1, used: current.used || question.usedCount > 0});
  });
  return Array.from(counts, ([name, value]) => ({
    field, name, questionCount: value.count, status: "active" as const, usedInActiveTemplate: value.used,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

function AdminQuestionBankTagManagementPage() {
  const {session} = useAuthProvider();
  const role = resolveAdminAccessContext(session).role;
  const canManage = shouldUseLiveApi() && (role === "teacher" || role === "admin");
  const [tagFieldScope, setTagFieldScope] = useState<AdminQuestionTagField>("primaryTag");
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [firstEntryValue, setFirstEntryValue] = useState("");
  const [secondEntryValue, setSecondEntryValue] = useState("");
  const [tags, setTags] = useState<AdminQuestionTagAuthorityRecord[]>(fixtureTags("primaryTag"));
  const [dictionaryRevision, setDictionaryRevision] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inlineMessage, setInlineMessage] = useState("Choose a tag field and governed operation.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const reloadTags = useCallback(async (field: AdminQuestionTagField) => {
    if (!shouldUseLiveApi()) {
      setTags(fixtureTags(field));
      setDictionaryRevision(1);
      return {dictionaryRevision: 1, tags: fixtureTags(field)};
    }
    const result = await getQuestionTags(field);
    setTags(result.tags);
    setDictionaryRevision(result.dictionaryRevision);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    void reloadTags(tagFieldScope).then(() => {
      if (active) setInlineMessage("Authoritative tag dictionary loaded.");
    }).catch((error) => {
      if (active) setErrorMessage(error instanceof ApiClientError ? error.message : "Failed to load tag dictionary.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [reloadTags, tagFieldScope]);

  const counts = useMemo(() => ({
    active: tags.filter((tag) => tag.status === "active").length,
    deprecated: tags.filter((tag) => tag.status === "deprecated").length,
    locked: tags.filter((tag) => tag.usedInActiveTemplate).length,
  }), [tags]);
  const columns: UiTableColumn<AdminQuestionTagAuthorityRecord>[] = [
    {id: "name", header: "Tag", render: (tag) => tag.name},
    {id: "status", header: "Status", render: (tag) => tag.status},
    {id: "count", header: "Questions", render: (tag) => tag.questionCount},
    {id: "protected", header: "Active Template Use", render: (tag) => tag.usedInActiveTemplate ? "Yes" : "No"},
  ];

  function clearForm() {
    setFirstEntryValue("");
    setSecondEntryValue("");
    idempotencyKeyRef.current = null;
  }

  async function applyTagOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || isSaving) {
      setErrorMessage("Tag changes require a live teacher or admin session.");
      return;
    }
    const first = firstEntryValue.trim();
    const second = secondEntryValue.trim();
    const idempotencyKey = idempotencyKeyRef.current ?? createQuestionBankIdempotencyKey(`tag-${tagOperation}`);
    let mutation: AdminQuestionTagMutationRequest;
    if (tagOperation === "create") {
      if (!first) { setErrorMessage("Enter the new tag name."); return; }
      mutation = {action: "create", expectedDictionaryRevision: dictionaryRevision, field: tagFieldScope, idempotencyKey, name: first};
    } else if (tagOperation === "rename") {
      if (!first || !second) { setErrorMessage("Enter both the current and replacement names."); return; }
      mutation = {action: "rename", destinationName: second, expectedDictionaryRevision: dictionaryRevision, field: tagFieldScope, idempotencyKey, sourceName: first};
    } else if (tagOperation === "merge") {
      const sourceNames = first.split(",").map((name) => name.trim()).filter(Boolean);
      if (sourceNames.length < 2 || !second) { setErrorMessage("Enter at least two source tags and one destination."); return; }
      mutation = {action: "merge", destinationName: second, expectedDictionaryRevision: dictionaryRevision, field: tagFieldScope, idempotencyKey, sourceNames};
    } else {
      if (!first) { setErrorMessage("Enter the tag to deprecate."); return; }
      mutation = {action: "deprecate", expectedDictionaryRevision: dictionaryRevision, field: tagFieldScope, idempotencyKey, name: first};
    }
    idempotencyKeyRef.current = idempotencyKey;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await mutateQuestionTags(mutation);
      const reloaded = await reloadTags(tagFieldScope);
      if (reloaded.dictionaryRevision !== result.dictionaryRevision) {
        throw new Error("Tag change completed, but authoritative reload did not reconcile its revision.");
      }
      setInlineMessage(`${TAG_OPERATION_LABELS[tagOperation]} applied and reloaded at revision ${result.dictionaryRevision}.`);
      clearForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tag change failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-tags-title">
      <p className="admin-content-eyebrow">Question Bank Tags</p>
      <h2 id="admin-question-bank-tags-title">Tag Management</h2>
      <p className="admin-content-copy">Create, rename, merge, and deprecate values through the governed dictionary.</p>
      <QuestionBankWorkspaceNav />
      <p className="admin-tests-inline-note">{isLoading ? "Loading authoritative tags..." : isSaving ? "Applying tag change..." : inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}
      {!canManage ? <p className="admin-tests-inline-note">Tag mutations are unavailable outside a live teacher/admin session.</p> : null}
      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card"><p>Active</p><h3>{counts.active}</h3><small>ready for use</small></article>
        <article className="admin-analytics-kpi-card"><p>Deprecated</p><h3>{counts.deprecated}</h3><small>historical only</small></article>
        <article className="admin-analytics-kpi-card"><p>Live Use</p><h3>{counts.locked}</h3><small>protected by active templates</small></article>
        <article className="admin-analytics-kpi-card"><p>Revision</p><h3>{dictionaryRevision}</h3><small>concurrency authority</small></article>
      </div>
      <UiForm title="Tag Actions" description="Choose the exact governed field and operation." submitLabel="Apply Tag Change" onSubmit={applyTagOperation}>
        <div className="admin-question-tags-action-grid">
          <UiFormField label="Tag Field" htmlFor="admin-question-tags-scope">
            <select id="admin-question-tags-scope" value={tagFieldScope} onChange={(event) => {setTagFieldScope(event.target.value as AdminQuestionTagField); clearForm(); setErrorMessage(null);}}>
              {Object.entries(TAG_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </UiFormField>
          <UiFormField label="Action" htmlFor="admin-question-tags-operation">
            <select id="admin-question-tags-operation" value={tagOperation} onChange={(event) => {setTagOperation(event.target.value as TagOperation); clearForm(); setErrorMessage(null);}}>
              {Object.entries(TAG_OPERATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </UiFormField>
          <UiFormField label={tagOperation === "create" ? "New Name" : tagOperation === "merge" ? "Source Tags" : "Current Name"} htmlFor="admin-question-tags-primary" helper={tagOperation === "merge" ? "Separate source tags with commas." : undefined}>
            <input id="admin-question-tags-primary" value={firstEntryValue} onChange={(event) => setFirstEntryValue(event.target.value)} />
          </UiFormField>
          {(tagOperation === "rename" || tagOperation === "merge") ? <UiFormField label={tagOperation === "rename" ? "New Name" : "Merged Tag Name"} htmlFor="admin-question-tags-secondary">
            <input id="admin-question-tags-secondary" value={secondEntryValue} onChange={(event) => setSecondEntryValue(event.target.value)} />
          </UiFormField> : null}
        </div>
      </UiForm>
      <UiTable caption={`${TAG_SCOPE_LABELS[tagFieldScope]} authoritative dictionary`} columns={columns} rows={tags}
        rowKey={(row) => `${row.field}:${row.name}`} emptyStateText="No tags exist for this field." />
    </section>
  );
}

export default AdminQuestionBankTagManagementPage;
