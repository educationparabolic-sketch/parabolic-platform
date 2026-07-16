import { useMemo, useState, type FormEvent } from "react";
import { UiFormField, UiStatCard, UiTable } from "../../../../../shared/ui/components";
import {
  getVendorInstitutesDataset,
  type VendorLicenseLevel,
  type VendorLicensePlan,
  type VendorLicensePlanId,
} from "../institutes/vendorInstitutesDataset";
import { useVendorLicenseRequests } from "../institutes/vendorLicenseRequestsStore";

interface LicenseParameterDraft {
  baseFeeInr: string;
  perStudentFeeInr: string;
  maxConcurrentStudents: string;
  maxExamSessionsPerMonth: string;
  isActive: boolean;
  note: string;
}

interface PublishedPlanUpdate {
  id: string;
  version: string;
  createdAt: string;
  planId: VendorLicensePlanId;
  affectedInstitutes: number;
  changedParameters: string[];
  baseFeeInr: number;
  perStudentFeeInr: number;
  maxConcurrentStudents: number;
  maxExamSessionsPerMonth: number;
  effectiveMode: "immediate" | "next_billing_cycle";
  note: string;
}

type LevelFilter = "all" | VendorLicenseLevel;

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatInr(value: number): string {
  if (!Number.isFinite(value)) {
    return "Invalid value";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPlanLabel(plan: VendorLicensePlan): string {
  return `${plan.level} ${plan.tier}`;
}

function calculateMonthlyFee(plan: VendorLicensePlan, studentCount: number): number {
  return plan.baseFeeInr + studentCount * plan.perStudentFeeInr;
}

function buildParameterDraft(plan: VendorLicensePlan): LicenseParameterDraft {
  return {
    baseFeeInr: String(plan.baseFeeInr),
    perStudentFeeInr: String(plan.perStudentFeeInr),
    maxConcurrentStudents: String(plan.maxConcurrentStudents),
    maxExamSessionsPerMonth: String(plan.maxExamSessionsPerMonth),
    isActive: plan.isActive,
    note: "",
  };
}

function parseDraftNumber(value: string): number {
  return Number.parseInt(value, 10);
}

function buildPlanFromDraft(
  plan: VendorLicensePlan,
  draft: LicenseParameterDraft,
): VendorLicensePlan {
  return {
    ...plan,
    baseFeeInr: parseDraftNumber(draft.baseFeeInr),
    perStudentFeeInr: parseDraftNumber(draft.perStudentFeeInr),
    maxConcurrentStudents: parseDraftNumber(draft.maxConcurrentStudents),
    maxExamSessionsPerMonth: parseDraftNumber(draft.maxExamSessionsPerMonth),
    isActive: draft.isActive,
  };
}

function getChangedParameters(plan: VendorLicensePlan, draftPlan: VendorLicensePlan): string[] {
  const changes: string[] = [];
  if (plan.baseFeeInr !== draftPlan.baseFeeInr) changes.push("Base fee");
  if (plan.perStudentFeeInr !== draftPlan.perStudentFeeInr) changes.push("Per-student fee");
  if (plan.maxConcurrentStudents !== draftPlan.maxConcurrentStudents)
    changes.push("Concurrent limit");
  if (plan.maxExamSessionsPerMonth !== draftPlan.maxExamSessionsPerMonth)
    changes.push("Exam-session limit");
  if (plan.isActive !== draftPlan.isActive) changes.push("Plan status");
  return changes;
}

function validateDraft(
  selectedPlan: VendorLicensePlan,
  draftPlan: VendorLicensePlan,
  plans: VendorLicensePlan[],
): string[] {
  const errors: string[] = [];
  const numericValues = [
    ["Base fee", draftPlan.baseFeeInr],
    ["Per-student fee", draftPlan.perStudentFeeInr],
    ["Concurrent-student limit", draftPlan.maxConcurrentStudents],
    ["Monthly exam-session limit", draftPlan.maxExamSessionsPerMonth],
  ] as const;

  for (const [label, value] of numericValues) {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${label} must be a positive whole number.`);
    }
  }

  const sameLevelPlans = plans
    .filter((plan) => plan.level === selectedPlan.level && plan.id !== selectedPlan.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  const lowerPlan = sameLevelPlans.filter((plan) => plan.id < selectedPlan.id).at(-1);
  const higherPlan = sameLevelPlans.find((plan) => plan.id > selectedPlan.id);

  if (lowerPlan && draftPlan.baseFeeInr < lowerPlan.baseFeeInr) {
    errors.push(
      `Base fee must remain at least ${formatInr(lowerPlan.baseFeeInr)} (${lowerPlan.id}).`,
    );
  }
  if (higherPlan && draftPlan.baseFeeInr > higherPlan.baseFeeInr) {
    errors.push(`Base fee cannot exceed ${formatInr(higherPlan.baseFeeInr)} (${higherPlan.id}).`);
  }
  if (lowerPlan && draftPlan.perStudentFeeInr < lowerPlan.perStudentFeeInr) {
    errors.push(
      `Per-student fee must remain at least ${formatInr(lowerPlan.perStudentFeeInr)} (${lowerPlan.id}).`,
    );
  }
  if (higherPlan && draftPlan.perStudentFeeInr > higherPlan.perStudentFeeInr) {
    errors.push(
      `Per-student fee cannot exceed ${formatInr(higherPlan.perStudentFeeInr)} (${higherPlan.id}).`,
    );
  }
  if (lowerPlan && draftPlan.maxConcurrentStudents < lowerPlan.maxConcurrentStudents) {
    errors.push(`Concurrent limit cannot be below the lower tier ${lowerPlan.id}.`);
  }
  if (higherPlan && draftPlan.maxConcurrentStudents > higherPlan.maxConcurrentStudents) {
    errors.push(`Concurrent limit cannot exceed the higher tier ${higherPlan.id}.`);
  }
  if (lowerPlan && draftPlan.maxExamSessionsPerMonth < lowerPlan.maxExamSessionsPerMonth) {
    errors.push(`Exam-session limit cannot be below the lower tier ${lowerPlan.id}.`);
  }
  if (higherPlan && draftPlan.maxExamSessionsPerMonth > higherPlan.maxExamSessionsPerMonth) {
    errors.push(`Exam-session limit cannot exceed the higher tier ${higherPlan.id}.`);
  }

  return errors;
}

function VendorLicensingPage() {
  const dataset = useMemo(() => getVendorInstitutesDataset(), []);
  const { licensePlans, publishLicensePlan } = useVendorLicenseRequests();
  const [drafts, setDrafts] = useState<Record<VendorLicensePlanId, LicenseParameterDraft>>(
    () =>
      Object.fromEntries(
        licensePlans.map((plan) => [plan.id, buildParameterDraft(plan)]),
      ) as Record<VendorLicensePlanId, LicenseParameterDraft>,
  );
  const [selectedPlanId, setSelectedPlanId] = useState<VendorLicensePlanId>(
    dataset.licensePlans[0]?.id ?? "L0-T1",
  );
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [effectiveMode, setEffectiveMode] = useState<"immediate" | "next_billing_cycle">(
    "next_billing_cycle",
  );
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishedUpdates, setPublishedUpdates] = useState<PublishedPlanUpdate[]>([]);

  const selectedPlan = licensePlans.find((plan) => plan.id === selectedPlanId) ?? licensePlans[0];
  const selectedDraft = selectedPlan ? drafts[selectedPlan.id] : undefined;
  const draftPlan =
    selectedPlan && selectedDraft ? buildPlanFromDraft(selectedPlan, selectedDraft) : null;
  const validationErrors =
    selectedPlan && draftPlan ? validateDraft(selectedPlan, draftPlan, licensePlans) : [];
  const changedParameters =
    selectedPlan && draftPlan ? getChangedParameters(selectedPlan, draftPlan) : [];
  const hasChanges = changedParameters.length > 0;
  const affectedInstitutes = selectedPlan
    ? dataset.institutes.filter((institute) => institute.currentLicensePlanId === selectedPlan.id)
    : [];
  const revenueDelta =
    selectedPlan && draftPlan
      ? affectedInstitutes.reduce(
          (total, institute) =>
            total +
            calculateMonthlyFee(draftPlan, institute.activeStudentCount) -
            calculateMonthlyFee(selectedPlan, institute.activeStudentCount),
          0,
        )
      : 0;
  const concurrencyConflicts = draftPlan
    ? affectedInstitutes.filter(
        (institute) => institute.peakConcurrentStudents > draftPlan.maxConcurrentStudents,
      ).length
    : 0;
  const sessionConflicts = draftPlan
    ? affectedInstitutes.filter(
        (institute) => institute.examSessionsThisMonth > draftPlan.maxExamSessionsPerMonth,
      ).length
    : 0;
  const filteredPlans = licensePlans.filter(
    (plan) => levelFilter === "all" || plan.level === levelFilter,
  );
  const modifiedPlanCount = licensePlans.filter((plan) => {
    const draft = drafts[plan.id];
    return draft ? getChangedParameters(plan, buildPlanFromDraft(plan, draft)).length > 0 : false;
  }).length;
  const assignedPlanCount = new Set(
    dataset.institutes.map((institute) => institute.currentLicensePlanId),
  ).size;

  function selectPlan(planId: VendorLicensePlanId) {
    setSelectedPlanId(planId);
    setPublishConfirmed(false);
    setEffectiveMode("next_billing_cycle");
  }

  function updateDraft(field: keyof LicenseParameterDraft, value: string | boolean) {
    if (!selectedPlan) return;
    setDrafts((current) => ({
      ...current,
      [selectedPlan.id]: { ...current[selectedPlan.id], [field]: value },
    }));
    setPublishConfirmed(false);
  }

  function resetSelectedDraft() {
    if (!selectedPlan) return;
    setDrafts((current) => ({
      ...current,
      [selectedPlan.id]: buildParameterDraft(selectedPlan),
    }));
    setPublishConfirmed(false);
  }

  function publishSelectedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedPlan ||
      !selectedDraft ||
      !draftPlan ||
      validationErrors.length > 0 ||
      !hasChanges ||
      !selectedDraft.note.trim() ||
      !publishConfirmed
    ) {
      return;
    }

    const createdAt = new Date().toISOString();
    const planVersion = `v1.${publishedUpdates.filter((update) => update.planId === selectedPlan.id).length + 1}`;
    const update: PublishedPlanUpdate = {
      id: `${createdAt}-${selectedPlan.id}`,
      version: planVersion,
      createdAt,
      planId: selectedPlan.id,
      affectedInstitutes: affectedInstitutes.length,
      changedParameters,
      baseFeeInr: draftPlan.baseFeeInr,
      perStudentFeeInr: draftPlan.perStudentFeeInr,
      maxConcurrentStudents: draftPlan.maxConcurrentStudents,
      maxExamSessionsPerMonth: draftPlan.maxExamSessionsPerMonth,
      effectiveMode,
      note: selectedDraft.note.trim(),
    };

    publishLicensePlan(draftPlan);
    setDrafts((current) => ({
      ...current,
      [selectedPlan.id]: buildParameterDraft(draftPlan),
    }));
    setPublishedUpdates((current) => [update, ...current].slice(0, 20));
    setPublishConfirmed(false);
  }

  return (
    <section
      className="vendor-content-card admin-content-card vendor-licensing-page"
      aria-labelledby="vendor-licensing-title"
    >
      <header className="vendor-licensing-heading">
        <div>
          <p className="vendor-content-eyebrow admin-content-eyebrow">Plan configuration</p>
          <h2 id="vendor-licensing-title">Licensing</h2>
          <p className="vendor-content-copy admin-content-copy">
            Define commercial fees and capacity limits, validate their impact, and publish a
            controlled parameter version to institutes using the plan.
          </p>
        </div>
        <span className="vendor-result-count">Vendor controlled</span>
      </header>

      <div className="vendor-institute-summary" aria-label="License catalogue summary">
        <UiStatCard
          title="Plans"
          value={String(licensePlans.length)}
          helper="L0-L2 across three tiers"
        />
        <UiStatCard
          title="Assigned Plans"
          value={String(assignedPlanCount)}
          helper="Used by at least one institute"
        />
        <UiStatCard
          title="Draft Changes"
          value={String(modifiedPlanCount)}
          helper="Not yet published"
        />
        <UiStatCard
          title="Published Updates"
          value={String(publishedUpdates.length)}
          helper="This vendor session"
        />
      </div>

      <div className="vendor-license-config-layout">
        <aside className="vendor-plan-browser" aria-labelledby="vendor-plan-browser-title">
          <div className="vendor-section-heading">
            <div>
              <h3 id="vendor-plan-browser-title">Plan catalogue</h3>
              <p>Select a plan to edit its parameters.</p>
            </div>
          </div>
          <div className="vendor-level-filter" role="tablist" aria-label="Filter plans by level">
            {(["all", "L0", "L1", "L2"] as LevelFilter[]).map((level) => (
              <button
                key={level}
                type="button"
                role="tab"
                aria-selected={levelFilter === level}
                className={levelFilter === level ? "vendor-level-filter-active" : ""}
                onClick={() => setLevelFilter(level)}
              >
                {level === "all" ? "All" : level}
              </button>
            ))}
          </div>
          <div className="vendor-plan-list">
            {filteredPlans.map((plan) => {
              const planDraft = drafts[plan.id];
              const isModified = planDraft
                ? getChangedParameters(plan, buildPlanFromDraft(plan, planDraft)).length > 0
                : false;
              const assignedCount = dataset.institutes.filter(
                (institute) => institute.currentLicensePlanId === plan.id,
              ).length;
              return (
                <button
                  key={plan.id}
                  type="button"
                  className={`vendor-plan-list-item${plan.id === selectedPlan?.id ? " vendor-plan-list-item-active" : ""}`}
                  onClick={() => selectPlan(plan.id)}
                >
                  <span>
                    <strong>{getPlanLabel(plan)}</strong>
                    <small>
                      {plan.id} | {assignedCount} institute(s)
                    </small>
                  </span>
                  <span className="vendor-plan-list-meta">
                    <small>{formatInr(plan.baseFeeInr)} base</small>
                    <i>{isModified ? "Draft" : plan.isActive ? "Active" : "Inactive"}</i>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selectedPlan && selectedDraft && draftPlan ? (
          <form className="vendor-plan-editor" onSubmit={publishSelectedPlan}>
            <header className="vendor-plan-editor-header">
              <div>
                <p className="vendor-content-eyebrow">Selected plan</p>
                <h3>{getPlanLabel(selectedPlan)}</h3>
                <p>
                  {selectedPlan.id} | {affectedInstitutes.length} assigned institute(s)
                </p>
              </div>
              <span
                className={`vendor-status ${hasChanges ? "vendor-status-due" : "vendor-status-active"}`}
              >
                {hasChanges ? `${changedParameters.length} draft changes` : "Published values"}
              </span>
            </header>

            <section
              className="vendor-parameter-editor"
              aria-labelledby="vendor-parameter-editor-title"
            >
              <div className="vendor-section-heading">
                <div>
                  <h4 id="vendor-parameter-editor-title">Parameters</h4>
                  <p>All monetary values are monthly INR amounts.</p>
                </div>
                <button
                  type="button"
                  className="vendor-secondary-button"
                  disabled={!hasChanges}
                  onClick={resetSelectedDraft}
                >
                  Reset draft
                </button>
              </div>
              <div className="vendor-parameter-grid">
                <UiFormField
                  label="Base fee (INR)"
                  htmlFor="vendor-license-base-fee"
                  helper={`Published: ${formatInr(selectedPlan.baseFeeInr)}`}
                >
                  <input
                    id="vendor-license-base-fee"
                    inputMode="numeric"
                    value={selectedDraft.baseFeeInr}
                    onChange={(event) => updateDraft("baseFeeInr", event.target.value)}
                  />
                </UiFormField>
                <UiFormField
                  label="Per-student fee (INR)"
                  htmlFor="vendor-license-student-fee"
                  helper={`Published: ${formatInr(selectedPlan.perStudentFeeInr)}`}
                >
                  <input
                    id="vendor-license-student-fee"
                    inputMode="numeric"
                    value={selectedDraft.perStudentFeeInr}
                    onChange={(event) => updateDraft("perStudentFeeInr", event.target.value)}
                  />
                </UiFormField>
                <UiFormField
                  label="Maximum concurrent students"
                  htmlFor="vendor-license-concurrent"
                  helper={`Published: ${selectedPlan.maxConcurrentStudents.toLocaleString("en-IN")}`}
                >
                  <input
                    id="vendor-license-concurrent"
                    inputMode="numeric"
                    value={selectedDraft.maxConcurrentStudents}
                    onChange={(event) => updateDraft("maxConcurrentStudents", event.target.value)}
                  />
                </UiFormField>
                <UiFormField
                  label="Maximum exam sessions / month"
                  htmlFor="vendor-license-sessions"
                  helper={`Published: ${selectedPlan.maxExamSessionsPerMonth.toLocaleString("en-IN")}`}
                >
                  <input
                    id="vendor-license-sessions"
                    inputMode="numeric"
                    value={selectedDraft.maxExamSessionsPerMonth}
                    onChange={(event) => updateDraft("maxExamSessionsPerMonth", event.target.value)}
                  />
                </UiFormField>
              </div>
              <label className="vendor-plan-active-toggle">
                <input
                  type="checkbox"
                  checked={selectedDraft.isActive}
                  onChange={(event) => updateDraft("isActive", event.target.checked)}
                />
                <span>
                  <strong>Plan available for assignment</strong>
                  <small>
                    Disabling prevents new assignments; existing institutes remain assigned.
                  </small>
                </span>
              </label>
            </section>

            <section
              className="vendor-parameter-impact"
              aria-labelledby="vendor-parameter-impact-title"
            >
              <div className="vendor-section-heading">
                <div>
                  <h4 id="vendor-parameter-impact-title">Change impact</h4>
                  <p>Preview before publishing to assigned institutes.</p>
                </div>
              </div>
              <div className="vendor-parameter-impact-grid">
                <div>
                  <span>Affected institutes</span>
                  <strong>{affectedInstitutes.length}</strong>
                </div>
                <div>
                  <span>Monthly revenue change</span>
                  <strong>
                    {revenueDelta >= 0 ? "+" : ""}
                    {formatInr(revenueDelta)}
                  </strong>
                </div>
                <div>
                  <span>Concurrency conflicts</span>
                  <strong>{concurrencyConflicts}</strong>
                </div>
                <div>
                  <span>Session conflicts</span>
                  <strong>{sessionConflicts}</strong>
                </div>
              </div>
              <div className="vendor-price-examples">
                <span>
                  100 students: <strong>{formatInr(calculateMonthlyFee(draftPlan, 100))}</strong>
                </span>
                <span>
                  500 students: <strong>{formatInr(calculateMonthlyFee(draftPlan, 500))}</strong>
                </span>
              </div>
              {validationErrors.length > 0 ? (
                <div className="vendor-parameter-validation" role="alert">
                  <strong>Resolve before publishing</strong>
                  <ul>
                    {validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="vendor-parameter-valid">Parameters pass catalogue validation.</p>
              )}
            </section>

            <section
              className="vendor-publish-control"
              aria-labelledby="vendor-publish-control-title"
            >
              <div className="vendor-section-heading">
                <div>
                  <h4 id="vendor-publish-control-title">Publish update</h4>
                  <p>Published changes are versioned and added to the vendor audit trail.</p>
                </div>
              </div>
              <div className="vendor-publish-grid">
                <UiFormField label="Effective timing" htmlFor="vendor-license-effective-mode">
                  <select
                    id="vendor-license-effective-mode"
                    value={effectiveMode}
                    onChange={(event) =>
                      setEffectiveMode(event.target.value as "immediate" | "next_billing_cycle")
                    }
                  >
                    <option value="next_billing_cycle">Next billing cycle</option>
                    <option value="immediate">Immediately</option>
                  </select>
                </UiFormField>
                <UiFormField
                  label="Publish note"
                  htmlFor="vendor-license-publish-note"
                  helper="Required for the audit trail."
                >
                  <input
                    id="vendor-license-publish-note"
                    value={selectedDraft.note}
                    onChange={(event) => updateDraft("note", event.target.value)}
                    placeholder="Reason for changing these parameters"
                  />
                </UiFormField>
              </div>
              {effectiveMode === "immediate" &&
              changedParameters.some((parameter) =>
                ["Base fee", "Per-student fee"].includes(parameter),
              ) ? (
                <p className="vendor-publish-warning">
                  Immediate commercial changes can alter current-cycle billing previews. Existing
                  issued invoices remain unchanged.
                </p>
              ) : null}
              <label className="vendor-publish-confirmation">
                <input
                  type="checkbox"
                  checked={publishConfirmed}
                  onChange={(event) => setPublishConfirmed(event.target.checked)}
                />
                <span>
                  I reviewed pricing, capacity conflicts, timing, and affected institutes.
                </span>
              </label>
              <div className="vendor-publish-actions">
                <span>
                  {changedParameters.length > 0
                    ? `Changes: ${changedParameters.join(", ")}`
                    : "No unpublished changes."}
                </span>
                <button
                  type="submit"
                  className="vendor-primary-action"
                  disabled={
                    !hasChanges ||
                    validationErrors.length > 0 ||
                    !selectedDraft.note.trim() ||
                    !publishConfirmed
                  }
                >
                  Publish parameter version
                </button>
              </div>
            </section>
          </form>
        ) : null}
      </div>

      <section className="vendor-license-history" aria-labelledby="vendor-license-history-title">
        <div className="vendor-section-heading">
          <div>
            <h3 id="vendor-license-history-title">Publication history</h3>
            <p>Parameter versions published during this vendor session.</p>
          </div>
        </div>
        <UiTable
          caption="Published license parameter versions"
          columns={[
            {
              id: "date",
              header: "Published",
              render: (row: PublishedPlanUpdate) => formatDateLabel(row.createdAt),
            },
            { id: "version", header: "Version", render: (row: PublishedPlanUpdate) => row.version },
            { id: "plan", header: "Plan", render: (row: PublishedPlanUpdate) => row.planId },
            {
              id: "changes",
              header: "Changed",
              render: (row: PublishedPlanUpdate) => row.changedParameters.join(", "),
            },
            {
              id: "institutes",
              header: "Institutes",
              render: (row: PublishedPlanUpdate) => row.affectedInstitutes,
            },
            {
              id: "timing",
              header: "Effective",
              render: (row: PublishedPlanUpdate) =>
                row.effectiveMode === "immediate" ? "Immediately" : "Next billing cycle",
            },
            { id: "note", header: "Note", render: (row: PublishedPlanUpdate) => row.note },
          ]}
          rows={publishedUpdates}
          rowKey={(row) => row.id}
          emptyStateText="No parameter versions published in this session."
        />
      </section>

      <section className="vendor-license-matrix" aria-labelledby="vendor-license-matrix-title">
        <div className="vendor-section-heading">
          <div>
            <h3 id="vendor-license-matrix-title">Published catalogue matrix</h3>
            <p>Current values used for billing and capacity enforcement.</p>
          </div>
        </div>
        <UiTable
          caption="Published license catalogue"
          columns={[
            { id: "plan", header: "Plan", render: (row: VendorLicensePlan) => getPlanLabel(row) },
            {
              id: "base",
              header: "Base Fee",
              render: (row: VendorLicensePlan) => formatInr(row.baseFeeInr),
            },
            {
              id: "student",
              header: "Per Student",
              render: (row: VendorLicensePlan) => formatInr(row.perStudentFeeInr),
            },
            {
              id: "concurrent",
              header: "Max Concurrent",
              render: (row: VendorLicensePlan) => row.maxConcurrentStudents.toLocaleString("en-IN"),
            },
            {
              id: "sessions",
              header: "Exam Sessions / Month",
              render: (row: VendorLicensePlan) =>
                row.maxExamSessionsPerMonth.toLocaleString("en-IN"),
            },
            {
              id: "status",
              header: "Status",
              render: (row: VendorLicensePlan) => (row.isActive ? "Active" : "Inactive"),
            },
          ]}
          rows={licensePlans}
          rowKey={(row) => row.id}
          emptyStateText="No license plans configured."
        />
      </section>
    </section>
  );
}

export default VendorLicensingPage;
