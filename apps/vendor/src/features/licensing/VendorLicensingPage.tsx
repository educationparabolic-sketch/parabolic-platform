import { useMemo, useState, type FormEvent } from "react";
import {
  UiForm,
  UiFormField,
  UiStatCard,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  getLicenseHistoryForInstitute,
  getVendorInstitutesDataset,
  getWebhookLogsForInstitute,
  type VendorInstituteSubscriptionStatus,
  type VendorLicenseChangeRecord,
  type VendorLicensePlan,
  type VendorLicensePlanId,
  type VendorLicenseWebhookLog,
} from "../institutes/vendorInstitutesDataset";

interface LicenseAssignmentDraft {
  nextPlanId: VendorLicensePlanId;
  nextStatus: VendorInstituteSubscriptionStatus;
  customStudentCount: string;
  note: string;
}

interface LicenseParameterDraft {
  baseFeeInr: string;
  perStudentFeeInr: string;
  maxConcurrentStudents: string;
  maxExamSessionsPerMonth: string;
  note: string;
}

interface QueuedLicenseAction {
  id: string;
  createdAt: string;
  instituteName: string;
  previousPlanId: VendorLicensePlanId;
  nextPlanId: VendorLicensePlanId;
  nextStatus: VendorInstituteSubscriptionStatus;
  projectedMonthlyFeeInr: number;
  note: string;
}

interface PublishedPlanUpdate {
  id: string;
  createdAt: string;
  planId: VendorLicensePlanId;
  affectedInstitutes: number;
  baseFeeInr: number;
  perStudentFeeInr: number;
  maxConcurrentStudents: number;
  maxExamSessionsPerMonth: number;
  note: string;
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateMonthlyFee(plan: VendorLicensePlan, studentCount: number): number {
  return plan.baseFeeInr + studentCount * plan.perStudentFeeInr;
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((used / limit) * 100));
}

function getPlanLabel(plan: VendorLicensePlan): string {
  return `${plan.level} ${plan.tier}`;
}

function buildParameterDraft(plan: VendorLicensePlan): LicenseParameterDraft {
  return {
    baseFeeInr: String(plan.baseFeeInr),
    perStudentFeeInr: String(plan.perStudentFeeInr),
    maxConcurrentStudents: String(plan.maxConcurrentStudents),
    maxExamSessionsPerMonth: String(plan.maxExamSessionsPerMonth),
    note: "",
  };
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function VendorLicensingPage() {
  const dataset = useMemo(() => getVendorInstitutesDataset(), []);
  const [licensePlans, setLicensePlans] = useState<VendorLicensePlan[]>(() =>
    dataset.licensePlans.map((plan) => ({ ...plan })),
  );
  const [cataloguePlanId, setCataloguePlanId] = useState<VendorLicensePlanId>(
    dataset.licensePlans[0]?.id ?? "L0-T1",
  );
  const [parameterDraft, setParameterDraft] = useState<LicenseParameterDraft>(() =>
    buildParameterDraft(dataset.licensePlans[0] ?? {
      id: "L0-T1",
      level: "L0",
      tier: "Tier 1",
      baseFeeInr: 3500,
      perStudentFeeInr: 50,
      maxConcurrentStudents: 200,
      maxExamSessionsPerMonth: 30,
      isActive: true,
    }),
  );
  const [instituteId, setInstituteId] = useState(dataset.institutes[0]?.id ?? "");
  const [assignmentDraft, setAssignmentDraft] = useState<LicenseAssignmentDraft>({
    nextPlanId: dataset.institutes[0]?.currentLicensePlanId ?? "L0-T1",
    nextStatus: "active",
    customStudentCount: "",
    note: "",
  });
  const [queuedActions, setQueuedActions] = useState<QueuedLicenseAction[]>([]);
  const [publishedPlanUpdates, setPublishedPlanUpdates] = useState<PublishedPlanUpdate[]>([]);

  const planById = useMemo(() => {
    return new Map(licensePlans.map((plan) => [plan.id, plan]));
  }, [licensePlans]);

  const selectedInstitute = useMemo(() => {
    return dataset.institutes.find((entry) => entry.id === instituteId) ?? dataset.institutes[0] ?? null;
  }, [dataset.institutes, instituteId]);

  const selectedPlan = selectedInstitute ? planById.get(selectedInstitute.currentLicensePlanId) ?? null : null;
  const cataloguePlan = planById.get(cataloguePlanId) ?? licensePlans[0];
  const targetPlan = planById.get(assignmentDraft.nextPlanId) ?? licensePlans[0];
  const studentCountForPreview =
    Number.parseInt(assignmentDraft.customStudentCount, 10) || selectedInstitute?.activeStudentCount || 0;
  const projectedMonthlyFee = calculateMonthlyFee(targetPlan, studentCountForPreview);
  const affectedInstitutesForCataloguePlan = dataset.institutes.filter(
    (institute) => institute.currentLicensePlanId === cataloguePlan?.id,
  );

  const portfolioStats = useMemo(() => {
    return dataset.institutes.reduce(
      (accumulator, institute) => {
        const plan = planById.get(institute.currentLicensePlanId);
        const monthlyFee = plan ? calculateMonthlyFee(plan, institute.activeStudentCount) : 0;

        return {
          activeInstitutes: accumulator.activeInstitutes + (institute.subscriptionStatus === "active" ? 1 : 0),
          monthlyRevenueInr: accumulator.monthlyRevenueInr + monthlyFee,
          nearConcurrentLimit:
            accumulator.nearConcurrentLimit +
            (plan && getUsagePercent(institute.peakConcurrentStudents, plan.maxConcurrentStudents) >= 85 ? 1 : 0),
          nearSessionLimit:
            accumulator.nearSessionLimit +
            (plan && getUsagePercent(institute.examSessionsThisMonth, plan.maxExamSessionsPerMonth) >= 85 ? 1 : 0),
        };
      },
      {
        activeInstitutes: 0,
        monthlyRevenueInr: 0,
        nearConcurrentLimit: 0,
        nearSessionLimit: 0,
      },
    );
  }, [dataset.institutes, planById]);

  const webhookRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseWebhookLog[];
    }

    return getWebhookLogsForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const historyRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseChangeRecord[];
    }

    return getLicenseHistoryForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const planColumns = useMemo<Array<UiTableColumn<VendorLicensePlan>>>(() => {
    return [
      {
        id: "plan",
        header: "Plan",
        render: (row) => getPlanLabel(row),
      },
      {
        id: "baseFee",
        header: "Base Fee",
        render: (row) => formatInr(row.baseFeeInr),
      },
      {
        id: "studentFee",
        header: "Per Student",
        render: (row) => formatInr(row.perStudentFeeInr),
      },
      {
        id: "concurrent",
        header: "Max Concurrent",
        render: (row) => row.maxConcurrentStudents.toLocaleString("en-IN"),
      },
      {
        id: "sessions",
        header: "Exam Sessions / Month",
        render: (row) => row.maxExamSessionsPerMonth.toLocaleString("en-IN"),
      },
      {
        id: "status",
        header: "Status",
        render: (row) => (row.isActive ? "Active" : "Inactive"),
      },
      {
        id: "edit",
        header: "Control",
        render: (row) => (
          <button
            type="button"
            className="vendor-link-button"
            onClick={() => {
              setCataloguePlanId(row.id);
              setParameterDraft(buildParameterDraft(row));
            }}
          >
            Edit parameters
          </button>
        ),
      },
    ];
  }, []);

  const webhookColumns = useMemo<Array<UiTableColumn<VendorLicenseWebhookLog>>>(() => {
    return [
      {
        id: "receivedAt",
        header: "Received",
        render: (row) => formatDateLabel(row.receivedAt),
      },
      {
        id: "eventType",
        header: "Event",
        render: (row) => row.eventType,
      },
      {
        id: "status",
        header: "Status",
        render: (row) => toTitleCase(row.status),
      },
      {
        id: "summary",
        header: "Summary",
        render: (row) => row.summary,
      },
    ];
  }, []);

  const historyColumns = useMemo<Array<UiTableColumn<VendorLicenseChangeRecord>>>(() => {
    return [
      {
        id: "changedAt",
        header: "Changed",
        render: (row) => formatDateLabel(row.changedAt),
      },
      {
        id: "fromTo",
        header: "Plan Change",
        render: (row) => `${row.fromPlanId} -> ${row.toPlanId}`,
      },
      {
        id: "billingCycle",
        header: "Billing Cycle",
        render: (row) => row.billingCycle,
      },
      {
        id: "changedBy",
        header: "Changed By",
        render: (row) => row.changedBy,
      },
      {
        id: "reason",
        header: "Reason",
        render: (row) => row.reason,
      },
    ];
  }, []);

  function handleInstituteSelection(nextInstituteId: string) {
    const nextInstitute = dataset.institutes.find((entry) => entry.id === nextInstituteId);

    setInstituteId(nextInstituteId);
    if (nextInstitute) {
      setAssignmentDraft((previous) => ({
        ...previous,
        nextPlanId: nextInstitute.currentLicensePlanId,
        nextStatus: nextInstitute.subscriptionStatus,
        customStudentCount: "",
      }));
    }
  }

  function handleLicenseAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstitute) {
      return;
    }

    const note = assignmentDraft.note.trim() || "Vendor-approved license assignment.";
    const action: QueuedLicenseAction = {
      id: `${Date.now()}-${selectedInstitute.id}-${assignmentDraft.nextPlanId}`,
      createdAt: new Date().toISOString(),
      instituteName: selectedInstitute.instituteName,
      previousPlanId: selectedInstitute.currentLicensePlanId,
      nextPlanId: assignmentDraft.nextPlanId,
      nextStatus: assignmentDraft.nextStatus,
      projectedMonthlyFeeInr: projectedMonthlyFee,
      note,
    };

    setQueuedActions((previous) => [action, ...previous].slice(0, 10));
    setAssignmentDraft((previous) => ({ ...previous, note: "" }));
  }

  function handleCataloguePlanSelection(nextPlanId: VendorLicensePlanId) {
    const nextPlan = planById.get(nextPlanId);

    setCataloguePlanId(nextPlanId);
    if (nextPlan) {
      setParameterDraft(buildParameterDraft(nextPlan));
    }
  }

  function handlePushPlanParameters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!cataloguePlan) {
      return;
    }

    const updatedPlan: VendorLicensePlan = {
      ...cataloguePlan,
      baseFeeInr: parsePositiveInteger(parameterDraft.baseFeeInr, cataloguePlan.baseFeeInr),
      perStudentFeeInr: parsePositiveInteger(parameterDraft.perStudentFeeInr, cataloguePlan.perStudentFeeInr),
      maxConcurrentStudents: parsePositiveInteger(
        parameterDraft.maxConcurrentStudents,
        cataloguePlan.maxConcurrentStudents,
      ),
      maxExamSessionsPerMonth: parsePositiveInteger(
        parameterDraft.maxExamSessionsPerMonth,
        cataloguePlan.maxExamSessionsPerMonth,
      ),
    };
    const note = parameterDraft.note.trim() || "Vendor pushed updated license parameters to assigned institutes.";

    setLicensePlans((previous) => previous.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)));
    setPublishedPlanUpdates((previous) =>
      [
        {
          id: `${Date.now()}-${updatedPlan.id}`,
          createdAt: new Date().toISOString(),
          planId: updatedPlan.id,
          affectedInstitutes: affectedInstitutesForCataloguePlan.length,
          baseFeeInr: updatedPlan.baseFeeInr,
          perStudentFeeInr: updatedPlan.perStudentFeeInr,
          maxConcurrentStudents: updatedPlan.maxConcurrentStudents,
          maxExamSessionsPerMonth: updatedPlan.maxExamSessionsPerMonth,
          note,
        },
        ...previous,
      ].slice(0, 10),
    );
    setParameterDraft(buildParameterDraft(updatedPlan));
  }

  return (
    <section className="vendor-content-card admin-content-card" aria-labelledby="vendor-licensing-title">
      <p className="vendor-content-eyebrow admin-content-eyebrow">Vendor controlled licensing</p>
      <h2 id="vendor-licensing-title">Licensing &amp; Subscription Control</h2>
      <p className="vendor-content-copy admin-content-copy">
        Control the test portal commercial plan, capacity limits, billing preview, subscription state, and
        institute-specific override queue from one vendor-owned workspace.
      </p>

      <div className="vendor-overview-grid">
        <UiStatCard title="Active Institutes" value={String(portfolioStats.activeInstitutes)} helper="Subscription status is active" />
        <UiStatCard title="Monthly Revenue" value={formatInr(portfolioStats.monthlyRevenueInr)} helper="Base fee plus active student fees" />
        <UiStatCard title="Near Concurrent Cap" value={String(portfolioStats.nearConcurrentLimit)} helper="Peak concurrency at or above 85%" />
        <UiStatCard title="Near Session Cap" value={String(portfolioStats.nearSessionLimit)} helper="Exam sessions at or above 85%" />
        <UiStatCard title="Plan Catalogue" value={String(licensePlans.length)} helper="L0/L1/L2 across three tiers" />
        <UiStatCard title="Control Authority" value="Vendor" helper="Plan assignment and overrides are vendor scoped" />
      </div>

      <UiTable
        caption="License plan catalogue"
        columns={planColumns}
        rows={licensePlans}
        rowKey={(row) => row.id}
        emptyStateText="No license plans configured."
      />

      <div className="vendor-section-grid">
        <UiForm
          title="Edit plan parameters"
          description="Change the vendor-owned commercial and capacity values for a plan, then push the updated catalogue to every institute using that plan."
          submitLabel="Push parameters to institutes"
          onSubmit={handlePushPlanParameters}
        >
          <UiFormField
            label="Plan"
            htmlFor="vendor-catalogue-plan"
            helper={`${affectedInstitutesForCataloguePlan.length} institute(s) currently assigned`}
          >
            <select
              id="vendor-catalogue-plan"
              value={cataloguePlanId}
              onChange={(event) => {
                handleCataloguePlanSelection(event.target.value as VendorLicensePlanId);
              }}
            >
              {licensePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {getPlanLabel(plan)} ({plan.id})
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="Base fee (INR)" htmlFor="vendor-base-fee" helper="Fixed monthly plan fee.">
            <input
              id="vendor-base-fee"
              inputMode="numeric"
              value={parameterDraft.baseFeeInr}
              onChange={(event) => {
                setParameterDraft((previous) => ({ ...previous, baseFeeInr: event.target.value }));
              }}
            />
          </UiFormField>

          <UiFormField label="Per student fee (INR)" htmlFor="vendor-student-fee" helper="Applied to each billable active student.">
            <input
              id="vendor-student-fee"
              inputMode="numeric"
              value={parameterDraft.perStudentFeeInr}
              onChange={(event) => {
                setParameterDraft((previous) => ({ ...previous, perStudentFeeInr: event.target.value }));
              }}
            />
          </UiFormField>

          <UiFormField label="Max concurrent students" htmlFor="vendor-max-concurrent" helper="Runtime cap for simultaneous test portal users.">
            <input
              id="vendor-max-concurrent"
              inputMode="numeric"
              value={parameterDraft.maxConcurrentStudents}
              onChange={(event) => {
                setParameterDraft((previous) => ({ ...previous, maxConcurrentStudents: event.target.value }));
              }}
            />
          </UiFormField>

          <UiFormField label="Max exam sessions / month" htmlFor="vendor-max-sessions" helper="Monthly exam-session creation allowance.">
            <input
              id="vendor-max-sessions"
              inputMode="numeric"
              value={parameterDraft.maxExamSessionsPerMonth}
              onChange={(event) => {
                setParameterDraft((previous) => ({ ...previous, maxExamSessionsPerMonth: event.target.value }));
              }}
            />
          </UiFormField>

          <UiFormField label="Publish note" htmlFor="vendor-parameter-note" helper="Stored with the catalogue push event.">
            <input
              id="vendor-parameter-note"
              value={parameterDraft.note}
              onChange={(event) => {
                setParameterDraft((previous) => ({ ...previous, note: event.target.value }));
              }}
              placeholder="Reason for changing plan parameters"
            />
          </UiFormField>
        </UiForm>

        <UiTable
          caption="Plan parameter push log"
          columns={[
            {
              id: "createdAt",
              header: "Pushed",
              render: (row: PublishedPlanUpdate) => formatDateLabel(row.createdAt),
            },
            {
              id: "plan",
              header: "Plan",
              render: (row: PublishedPlanUpdate) => row.planId,
            },
            {
              id: "institutes",
              header: "Institutes",
              render: (row: PublishedPlanUpdate) => row.affectedInstitutes.toLocaleString("en-IN"),
            },
            {
              id: "commercial",
              header: "Commercial",
              render: (row: PublishedPlanUpdate) => `${formatInr(row.baseFeeInr)} + ${formatInr(row.perStudentFeeInr)}/student`,
            },
            {
              id: "limits",
              header: "Limits",
              render: (row: PublishedPlanUpdate) =>
                `${row.maxConcurrentStudents.toLocaleString("en-IN")} concurrent, ${row.maxExamSessionsPerMonth.toLocaleString("en-IN")} sessions`,
            },
            {
              id: "note",
              header: "Note",
              render: (row: PublishedPlanUpdate) => row.note,
            },
          ]}
          rows={publishedPlanUpdates}
          rowKey={(row) => row.id}
          emptyStateText="No plan parameter updates pushed in this session."
        />
      </div>

      <div className="vendor-section-grid">
        <UiForm
          title="Select institute"
          description="Review the current plan, billing preview, and usage limits for an institute."
          submitLabel="Apply selection"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <UiFormField
            label="Institute"
            htmlFor="vendor-licensing-institute"
            helper="Source collection: institutes/{id}/license"
          >
            <select
              id="vendor-licensing-institute"
              value={selectedInstitute?.id ?? ""}
              onChange={(event) => {
                handleInstituteSelection(event.target.value);
              }}
            >
              {dataset.institutes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.instituteName} ({entry.currentLicensePlanId})
                </option>
              ))}
            </select>
          </UiFormField>

          {selectedInstitute && selectedPlan ? (
            <div className="vendor-license-profile" aria-label="Selected institute license summary">
              <p>
                <strong>{selectedInstitute.instituteName}</strong> is on{" "}
                <strong>{getPlanLabel(selectedPlan)}</strong> with{" "}
                <strong>{selectedInstitute.activeStudentCount.toLocaleString("en-IN")}</strong> active students.
              </p>
              <p>
                Current bill preview:{" "}
                <strong>{formatInr(calculateMonthlyFee(selectedPlan, selectedInstitute.activeStudentCount))}</strong>{" "}
                per month. Next invoice: <strong>{formatDateLabel(selectedInstitute.billing.nextInvoiceDate)}</strong>.
              </p>
            </div>
          ) : null}
        </UiForm>

        <UiForm
          title="Assign license plan"
          description="Queue a vendor-authoritative plan or status change with a clear operator note."
          submitLabel="Queue license assignment"
          onSubmit={handleLicenseAssignment}
        >
          <UiFormField label="Target plan" htmlFor="vendor-target-plan">
            <select
              id="vendor-target-plan"
              value={assignmentDraft.nextPlanId}
              onChange={(event) => {
                setAssignmentDraft((previous) => ({
                  ...previous,
                  nextPlanId: event.target.value as VendorLicensePlanId,
                }));
              }}
            >
              {licensePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {getPlanLabel(plan)} - {formatInr(plan.baseFeeInr)} + {formatInr(plan.perStudentFeeInr)}/student
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="Subscription status" htmlFor="vendor-target-status">
            <select
              id="vendor-target-status"
              value={assignmentDraft.nextStatus}
              onChange={(event) => {
                setAssignmentDraft((previous) => ({
                  ...previous,
                  nextStatus: event.target.value as VendorInstituteSubscriptionStatus,
                }));
              }}
            >
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="suspended">Suspended</option>
              <option value="canceled">Canceled</option>
            </select>
          </UiFormField>

          <UiFormField
            label="Billable student count"
            htmlFor="vendor-student-count"
            helper="Leave blank to use current active students."
          >
            <input
              id="vendor-student-count"
              inputMode="numeric"
              value={assignmentDraft.customStudentCount}
              onChange={(event) => {
                setAssignmentDraft((previous) => ({ ...previous, customStudentCount: event.target.value }));
              }}
              placeholder={selectedInstitute?.activeStudentCount.toString() ?? "0"}
            />
          </UiFormField>

          <UiFormField
            label="Operator note"
            htmlFor="vendor-assignment-note"
            helper={`Preview: ${formatInr(projectedMonthlyFee)} / month`}
          >
            <input
              id="vendor-assignment-note"
              value={assignmentDraft.note}
              onChange={(event) => {
                setAssignmentDraft((previous) => ({ ...previous, note: event.target.value }));
              }}
              placeholder="Upgrade, downgrade, suspension, or billing reason"
            />
          </UiFormField>
        </UiForm>
      </div>

      {selectedInstitute && selectedPlan ? (
        <div className="vendor-overview-grid">
          <UiStatCard title="Current Plan" value={getPlanLabel(selectedPlan)} helper={selectedInstitute.currentLicensePlanId} />
          <UiStatCard title="Base Fee" value={formatInr(selectedPlan.baseFeeInr)} helper="Fixed monthly fee" />
          <UiStatCard title="Per Student Fee" value={formatInr(selectedPlan.perStudentFeeInr)} helper="Applied to billable students" />
          <UiStatCard title="Concurrent Usage" value={`${selectedInstitute.peakConcurrentStudents}/${selectedPlan.maxConcurrentStudents}`} helper={`${getUsagePercent(selectedInstitute.peakConcurrentStudents, selectedPlan.maxConcurrentStudents)}% peak utilization`} />
          <UiStatCard title="Exam Sessions" value={`${selectedInstitute.examSessionsThisMonth}/${selectedPlan.maxExamSessionsPerMonth}`} helper={`${getUsagePercent(selectedInstitute.examSessionsThisMonth, selectedPlan.maxExamSessionsPerMonth)}% used this month`} />
          <UiStatCard title="Amount Due" value={formatInr(selectedInstitute.billing.amountDueInr)} helper={selectedInstitute.paymentStatus} />
        </div>
      ) : (
        <p className="vendor-content-note">No institute data available.</p>
      )}

      <div className="vendor-section-grid">
        <UiTable
          caption="Queued vendor license assignments"
          columns={[
            {
              id: "createdAt",
              header: "Queued",
              render: (row: QueuedLicenseAction) => formatDateLabel(row.createdAt),
            },
            {
              id: "institute",
              header: "Institute",
              render: (row: QueuedLicenseAction) => row.instituteName,
            },
            {
              id: "change",
              header: "Plan Change",
              render: (row: QueuedLicenseAction) => `${row.previousPlanId} -> ${row.nextPlanId}`,
            },
            {
              id: "status",
              header: "Status",
              render: (row: QueuedLicenseAction) => toTitleCase(row.nextStatus),
            },
            {
              id: "fee",
              header: "Projected Fee",
              render: (row: QueuedLicenseAction) => formatInr(row.projectedMonthlyFeeInr),
            },
            {
              id: "note",
              header: "Note",
              render: (row: QueuedLicenseAction) => row.note,
            },
          ]}
          rows={queuedActions}
          rowKey={(row) => row.id}
          emptyStateText="No vendor license assignments queued in this session."
        />

        <UiTable
          caption="License change history"
          columns={historyColumns}
          rows={historyRows}
          rowKey={(row) => row.id}
          emptyStateText="No license history found for selected institute."
        />
      </div>

      <UiTable
        caption="Billing and subscription webhook log"
        columns={webhookColumns}
        rows={webhookRows}
        rowKey={(row) => row.id}
        emptyStateText="No webhook logs found for selected institute."
      />
    </section>
  );
}

export default VendorLicensingPage;
