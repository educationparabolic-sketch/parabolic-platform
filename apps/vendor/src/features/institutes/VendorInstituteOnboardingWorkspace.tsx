import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import type { VendorLicensePlan, VendorLicensePlanId } from "./vendorInstitutesDataset";
import {
  useVendorLicenseRequests,
  type VendorOnboardingRecord,
  type VendorOnboardingStatus,
} from "./vendorLicenseRequestsStore";

type OnboardingFilter = "all" | "attention" | "commercial" | "setup" | "complete";

const TRIAL_STUDENT_LIMIT = 200;
const TRIAL_PLAN: VendorLicensePlan = {
  id: "TRIAL",
  level: "L0",
  tier: "Tier 1",
  baseFeeInr: 0,
  perStudentFeeInr: 0,
  maxConcurrentStudents: 200,
  maxExamSessionsPerMonth: 30,
  isActive: true,
};

interface OnboardingDraft {
  instituteName: string;
  instituteType: string;
  location: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingContactEmail: string;
  expectedStudents: string;
  expectedConcurrentStudents: string;
  expectedExamSessionsPerMonth: string;
  selectedPlanId: VendorLicensePlanId;
  billingCycle: "Monthly" | "Quarterly";
  licenseStartDate: string;
  licenseExpiryDate: string;
  trialDays: string;
  paymentTermsDays: string;
  administratorName: string;
  administratorEmail: string;
  administratorPhone: string;
  invitationExpiresAt: string;
  note: string;
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getTrialExpiryDate(startDate: string): string {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return startDate;

  const targetMonthStart = new Date(Date.UTC(year, month, 1));
  const targetMonthLastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const anniversary = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      Math.min(day, targetMonthLastDay),
    ),
  );
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildCommercialDraft(record: VendorOnboardingRecord) {
  return {
    selectedPlanId: record.selectedPlanId,
    billableStudents: String(record.billableStudents),
    billingCycle: record.billingCycle,
    licenseStartDate: record.licenseStartDate,
    licenseExpiryDate: record.licenseExpiryDate,
    trialDays: String(record.trialDays),
    paymentTermsDays: String(record.paymentTermsDays),
  };
}

function buildAdministratorDraft(record: VendorOnboardingRecord) {
  return {
    administratorName: record.administratorName,
    administratorEmail: record.administratorEmail,
    administratorPhone: record.administratorPhone,
    invitationExpiresAt: record.invitationExpiresAt,
  };
}

function createEmptyDraft(defaultPlanId: VendorLicensePlanId): OnboardingDraft {
  return {
    instituteName: "",
    instituteType: "School",
    location: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    billingContactEmail: "",
    expectedStudents: "",
    expectedConcurrentStudents: "",
    expectedExamSessionsPerMonth: "",
    selectedPlanId: defaultPlanId,
    billingCycle: "Monthly",
    licenseStartDate: "2026-08-01",
    licenseExpiryDate: "2027-07-31",
    trialDays: "0",
    paymentTermsDays: "15",
    administratorName: "",
    administratorEmail: "",
    administratorPhone: "",
    invitationExpiresAt: "2026-08-07",
    note: "",
  };
}

function getNextAction(record: VendorOnboardingRecord): string {
  const labels: Record<VendorOnboardingStatus, string> = {
    draft: "Complete application",
    pending_review: "Review application",
    information_required: "Await institute response",
    approved: "Configure proposal",
    commercial_configured: "Send proposal",
    awaiting_acceptance: "Await proposal acceptance",
    awaiting_payment: "Confirm payment",
    payment_received: "Invite administrator",
    trial_terms_accepted: "Invite administrator",
    administrator_invited: "Await administrator",
    setup_in_progress: "Complete setup",
    ready_for_activation: "Activate institute",
    active: "Onboarding complete",
    rejected: "No action",
    expired: "Review expired application",
  };
  return labels[record.status];
}

function VendorInstituteOnboardingWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    onboardingRecords,
    unreadOnboardingIds,
    licensePlans,
    markOnboardingRead,
    createOnboardingRecord,
    updateOnboardingRecord,
  } = useVendorLicenseRequests();
  const onboardingPlans = [TRIAL_PLAN, ...licensePlans];
  const requestedRecordId = searchParams.get("onboarding");
  const initialRecord =
    onboardingRecords.find((record) => record.id === requestedRecordId) ??
    onboardingRecords[0] ??
    null;
  const [selectedRecordId, setSelectedRecordId] = useState(initialRecord?.id ?? "");
  const [filter, setFilter] = useState<OnboardingFilter>("all");
  const [reviewNote, setReviewNote] = useState("");
  const [commercialDraft, setCommercialDraft] = useState(() =>
    initialRecord ? buildCommercialDraft(initialRecord) : null,
  );
  const [administratorDraft, setAdministratorDraft] = useState(() =>
    initialRecord ? buildAdministratorDraft(initialRecord) : null,
  );
  const [createStep, setCreateStep] = useState(1);
  const [newDraft, setNewDraft] = useState(() => createEmptyDraft(licensePlans[0]?.id ?? "L0-T1"));

  const createMode = searchParams.get("mode") === "new";
  const selectedRecord =
    onboardingRecords.find((record) => record.id === selectedRecordId) ?? initialRecord;
  const filteredRecords = onboardingRecords.filter((record) => {
    if (filter === "all") return true;
    if (filter === "attention")
      return ["pending_review", "information_required", "expired"].includes(record.status);
    if (filter === "commercial")
      return [
        "approved",
        "commercial_configured",
        "awaiting_acceptance",
        "awaiting_payment",
        "payment_received",
        "trial_terms_accepted",
      ].includes(record.status);
    if (filter === "setup")
      return ["administrator_invited", "setup_in_progress", "ready_for_activation"].includes(
        record.status,
      );
    return ["active", "rejected"].includes(record.status);
  });
  const statusCounts = onboardingRecords.reduce(
    (summary, record) => ({
      pending: summary.pending + (record.status === "pending_review" ? 1 : 0),
      commercial:
        summary.commercial +
        ([
          "approved",
          "commercial_configured",
          "awaiting_acceptance",
          "awaiting_payment",
          "payment_received",
          "trial_terms_accepted",
        ].includes(record.status)
          ? 1
          : 0),
      setup:
        summary.setup +
        (["administrator_invited", "setup_in_progress", "ready_for_activation"].includes(
          record.status,
        )
          ? 1
          : 0),
      active: summary.active + (record.status === "active" ? 1 : 0),
    }),
    { pending: 0, commercial: 0, setup: 0, active: 0 },
  );
  const draftPlan = commercialDraft
    ? onboardingPlans.find((plan) => plan.id === commercialDraft.selectedPlanId)
    : null;
  const selectedIsTrial = selectedRecord?.selectedPlanId === "TRIAL";
  const commercialIsTrial = commercialDraft?.selectedPlanId === "TRIAL";
  const activationChecks = selectedRecord
    ? [
        { label: "Institute profile verified", complete: selectedRecord.profileVerified },
        { label: "Commercial proposal accepted", complete: selectedRecord.proposalAccepted },
        {
          label: selectedIsTrial ? "Payment not required for Trial" : "Required payment received",
          complete: selectedIsTrial || selectedRecord.paymentComplete,
        },
        {
          label: "Administrator invitation accepted",
          complete: selectedRecord.invitationStatus === "accepted",
        },
        { label: "Platform terms accepted", complete: selectedRecord.termsAccepted },
        { label: "Initial settings completed", complete: selectedRecord.initialSettingsComplete },
      ]
    : [];
  const activationReady =
    activationChecks.length > 0 && activationChecks.every((check) => check.complete);
  const reviewComplete = selectedRecord
    ? !["draft", "pending_review", "information_required", "rejected", "expired"].includes(
        selectedRecord.status,
      )
    : false;
  const commercialComplete = selectedRecord
    ? [
        "commercial_configured",
        "awaiting_acceptance",
        "awaiting_payment",
        "payment_received",
        "trial_terms_accepted",
        "administrator_invited",
        "setup_in_progress",
        "ready_for_activation",
        "active",
      ].includes(selectedRecord.status)
    : false;
  const proposalSent = selectedRecord
    ? [
        "awaiting_acceptance",
        "awaiting_payment",
        "payment_received",
        "trial_terms_accepted",
        "administrator_invited",
        "setup_in_progress",
        "ready_for_activation",
        "active",
      ].includes(selectedRecord.status)
    : false;
  const invitationAccepted = selectedRecord?.invitationStatus === "accepted";
  const instituteSetupComplete = selectedRecord
    ? selectedRecord.profileVerified &&
      selectedRecord.termsAccepted &&
      selectedRecord.initialSettingsComplete
    : false;
  const workflowSteps = [
    { label: "Review", complete: reviewComplete },
    { label: "Configure", complete: commercialComplete },
    { label: selectedIsTrial ? "Trial Terms" : "Proposal", complete: proposalSent },
    { label: "Acceptance", complete: selectedRecord?.proposalAccepted ?? false },
    ...(selectedIsTrial
      ? []
      : [{ label: "Payment", complete: selectedRecord?.paymentComplete ?? false }]),
    { label: "Invitation", complete: invitationAccepted },
    { label: "Setup", complete: instituteSetupComplete },
    { label: "Activation", complete: selectedRecord?.status === "active" },
  ];
  const currentWorkflowStep = workflowSteps.findIndex((step) => !step.complete);
  const workflowGuidance = !selectedRecord
    ? null
    : selectedRecord.status === "rejected"
      ? {
          current: "Application closed",
          next: "No further action is available for a rejected application.",
        }
      : selectedRecord.status === "information_required"
        ? {
            current: "Waiting for institute information",
            next: "Review the response when it arrives, then approve or reject the application.",
          }
        : selectedRecord.status === "expired"
          ? {
              current: "Application expired",
              next: "Review the application before restarting onboarding.",
            }
          : selectedRecord.status === "active"
            ? {
                current: "Onboarding complete",
                next: "The institute is active and can now be managed from the Directory.",
              }
            : !reviewComplete
              ? {
                  current: "Application review",
                  next: "Verify the institute details, then approve, request information, or reject.",
                }
              : !commercialComplete
                ? {
                    current: "Configure license and billing",
                    next: "Confirm the plan and commercial terms, then save the setup.",
                  }
                : !proposalSent
                  ? {
                      current: selectedIsTrial ? "Trial setup saved" : "Commercial setup saved",
                      next: selectedIsTrial
                        ? "Review the fixed one-month term, then send the Trial Terms."
                        : "Review the calculated amount, then send the proposal to the institute.",
                    }
                  : !selectedRecord.proposalAccepted
                    ? {
                        current: selectedIsTrial
                          ? "Waiting for Trial Terms acceptance"
                          : "Waiting for proposal acceptance",
                        next: selectedIsTrial
                          ? "Mark accepted only after the institute accepts the Trial Terms."
                          : "Mark accepted only after the institute confirms the proposal.",
                      }
                    : !selectedRecord.paymentComplete
                      ? {
                          current: "Awaiting payment",
                          next: "Confirm the transaction, then mark the initial payment as received.",
                        }
                      : selectedRecord.invitationStatus === "not_sent" ||
                          selectedRecord.invitationStatus === "revoked" ||
                          selectedRecord.invitationStatus === "expired"
                        ? {
                            current: "Payment confirmed",
                            next: "Verify the administrator details, then send the invitation.",
                          }
                        : !invitationAccepted
                          ? {
                              current: "Administrator invitation sent",
                              next: "Wait for the administrator to accept the invitation and platform terms.",
                            }
                          : !instituteSetupComplete
                            ? {
                                current: "Institute setup in progress",
                                next: "Verify the profile and confirm the initial platform settings.",
                              }
                            : {
                                current: "Ready for activation",
                                next: "All required checks are complete. Activate the institute.",
                              };
  const canReview = selectedRecord
    ? ["draft", "pending_review", "information_required", "expired"].includes(selectedRecord.status)
    : false;
  const canSaveCommercial = selectedRecord
    ? ["approved", "commercial_configured"].includes(selectedRecord.status)
    : false;
  const canSendProposal = selectedRecord?.status === "commercial_configured";
  const canMarkProposalAccepted = selectedRecord?.status === "awaiting_acceptance";
  const canMarkPaymentReceived = selectedRecord?.status === "awaiting_payment";
  const canPrepareInvitation = selectedRecord?.paymentComplete ?? false;
  const canSendInvitation = selectedRecord
    ? selectedRecord.paymentComplete &&
      ["not_sent", "revoked", "expired"].includes(selectedRecord.invitationStatus)
    : false;
  const canMarkInvitationAccepted =
    selectedRecord?.status === "administrator_invited" &&
    selectedRecord.invitationStatus === "sent";
  const canCompleteInstituteSetup = invitationAccepted && selectedRecord?.status !== "active";
  const newPlan = onboardingPlans.find((plan) => plan.id === newDraft.selectedPlanId);
  const newMonthlyFee = newPlan
    ? newPlan.baseFeeInr +
      (Number.parseInt(newDraft.expectedStudents, 10) || 0) * newPlan.perStudentFeeInr
    : 0;

  function selectRecord(record: VendorOnboardingRecord) {
    markOnboardingRead(record.id);
    setSelectedRecordId(record.id);
    setCommercialDraft(buildCommercialDraft(record));
    setAdministratorDraft(buildAdministratorDraft(record));
    setReviewNote(record.reviewNote);
    setSearchParams({ view: "onboarding", onboarding: record.id });
  }

  function updateStatus(status: VendorOnboardingStatus, label: string, fallbackNote: string) {
    if (!selectedRecord) return;
    updateOnboardingRecord(
      selectedRecord.id,
      { status, reviewNote: reviewNote.trim() || fallbackNote },
      label,
      reviewNote.trim() || fallbackNote,
    );
    setReviewNote("");
  }

  function saveCommercialSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecord || !commercialDraft) return;
    updateOnboardingRecord(
      selectedRecord.id,
      {
        selectedPlanId: commercialDraft.selectedPlanId,
        billableStudents:
          commercialDraft.selectedPlanId === "TRIAL"
            ? Math.min(
                TRIAL_STUDENT_LIMIT,
                Number.parseInt(commercialDraft.billableStudents, 10) || 0,
              )
            : Number.parseInt(commercialDraft.billableStudents, 10) || 0,
        billingCycle:
          commercialDraft.selectedPlanId === "TRIAL" ? "Monthly" : commercialDraft.billingCycle,
        licenseStartDate: commercialDraft.licenseStartDate,
        licenseExpiryDate:
          commercialDraft.selectedPlanId === "TRIAL"
            ? getTrialExpiryDate(commercialDraft.licenseStartDate)
            : commercialDraft.licenseExpiryDate,
        trialDays: 0,
        paymentTermsDays:
          commercialDraft.selectedPlanId === "TRIAL"
            ? 0
            : Number.parseInt(commercialDraft.paymentTermsDays, 10) || 0,
        status: "commercial_configured",
      },
      "Commercial setup saved",
      commercialDraft.selectedPlanId === "TRIAL"
        ? "Configured a fixed one-calendar-month Trial with L0 Tier 1 entitlement limits."
        : `Configured ${commercialDraft.selectedPlanId} on a ${commercialDraft.billingCycle.toLowerCase()} cycle.`,
    );
  }

  function saveAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRecord || !administratorDraft) return;
    updateOnboardingRecord(
      selectedRecord.id,
      administratorDraft,
      "Administrator details saved",
      `Administrator contact set to ${administratorDraft.administratorEmail}.`,
    );
  }

  function submitNewInstitute(status: "draft" | "pending_review") {
    if (!newDraft.instituteName.trim() || !newDraft.primaryContactEmail.trim()) return;
    const createdAt = new Date().toISOString();
    const record: VendorOnboardingRecord = {
      id: `onboard_${createdAt.replace(/[^0-9]/g, "")}`,
      instituteName: newDraft.instituteName.trim(),
      instituteType: newDraft.instituteType,
      location: newDraft.location.trim(),
      timezone: "Asia/Kolkata",
      primaryContactName: newDraft.primaryContactName.trim(),
      primaryContactEmail: newDraft.primaryContactEmail.trim(),
      primaryContactPhone: newDraft.primaryContactPhone.trim(),
      billingContactEmail: newDraft.billingContactEmail.trim(),
      expectedStudents: Number.parseInt(newDraft.expectedStudents, 10) || 0,
      expectedConcurrentStudents: Number.parseInt(newDraft.expectedConcurrentStudents, 10) || 0,
      expectedExamSessionsPerMonth: Number.parseInt(newDraft.expectedExamSessionsPerMonth, 10) || 0,
      requestedCapabilities: ["Vendor-created onboarding"],
      duplicateWarning: "",
      selectedPlanId: newDraft.selectedPlanId,
      billableStudents:
        newDraft.selectedPlanId === "TRIAL"
          ? Math.min(TRIAL_STUDENT_LIMIT, Number.parseInt(newDraft.expectedStudents, 10) || 0)
          : Number.parseInt(newDraft.expectedStudents, 10) || 0,
      billingCycle: newDraft.selectedPlanId === "TRIAL" ? "Monthly" : newDraft.billingCycle,
      licenseStartDate: newDraft.licenseStartDate,
      licenseExpiryDate:
        newDraft.selectedPlanId === "TRIAL"
          ? getTrialExpiryDate(newDraft.licenseStartDate)
          : newDraft.licenseExpiryDate,
      trialDays: 0,
      paymentTermsDays:
        newDraft.selectedPlanId === "TRIAL"
          ? 0
          : Number.parseInt(newDraft.paymentTermsDays, 10) || 0,
      proposalAccepted: false,
      paymentComplete: false,
      profileVerified: false,
      termsAccepted: false,
      initialSettingsComplete: false,
      administratorName: newDraft.administratorName.trim(),
      administratorEmail: newDraft.administratorEmail.trim(),
      administratorPhone: newDraft.administratorPhone.trim(),
      invitationExpiresAt: newDraft.invitationExpiresAt,
      invitationStatus: "not_sent",
      assignedOperator: "vendor.current",
      submittedAt: createdAt,
      status,
      reviewNote: newDraft.note.trim(),
      timeline: [
        {
          id: `${createdAt}-created`,
          createdAt,
          actor: "vendor.current",
          label: status === "draft" ? "Draft created" : "Submitted for review",
          note: newDraft.note.trim() || "Vendor-created institute onboarding record.",
        },
      ],
    };
    createOnboardingRecord(record);
    setSelectedRecordId(record.id);
    setCommercialDraft(buildCommercialDraft(record));
    setAdministratorDraft(buildAdministratorDraft(record));
    setNewDraft(createEmptyDraft(licensePlans[0]?.id ?? "L0-T1"));
    setCreateStep(1);
    setSearchParams({ view: "onboarding", onboarding: record.id });
  }

  if (createMode) {
    return (
      <section
        className="vendor-onboarding-create"
        aria-labelledby="vendor-onboarding-create-title"
      >
        <header className="vendor-onboarding-create-header">
          <div>
            <p className="vendor-content-eyebrow">Vendor-created onboarding</p>
            <h3 id="vendor-onboarding-create-title">Add institute</h3>
            <p>Create a controlled onboarding record before activating an institute.</p>
          </div>
          <button
            type="button"
            className="vendor-secondary-button"
            onClick={() => setSearchParams({ view: "onboarding" })}
          >
            Back to queue
          </button>
        </header>
        <div className="vendor-onboarding-steps" aria-label="Onboarding steps">
          {["Institute", "License & billing", "Administrator", "Review"].map((label, index) => (
            <button
              key={label}
              type="button"
              className={createStep === index + 1 ? "vendor-onboarding-step-active" : ""}
              onClick={() => setCreateStep(index + 1)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="vendor-onboarding-create-panel">
          {createStep === 1 ? (
            <div className="vendor-onboarding-form-grid">
              <UiFormField label="Institute name" htmlFor="onboard-name">
                <input
                  id="onboard-name"
                  value={newDraft.instituteName}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, instituteName: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Institute type" htmlFor="onboard-type">
                <select
                  id="onboard-type"
                  value={newDraft.instituteType}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, instituteType: event.target.value }))
                  }
                >
                  <option>School</option>
                  <option>College</option>
                  <option>Coaching institute</option>
                  <option>Test preparation centre</option>
                </select>
              </UiFormField>
              <UiFormField label="Location" htmlFor="onboard-location">
                <input
                  id="onboard-location"
                  value={newDraft.location}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, location: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Primary contact" htmlFor="onboard-contact">
                <input
                  id="onboard-contact"
                  value={newDraft.primaryContactName}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, primaryContactName: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Contact email" htmlFor="onboard-email">
                <input
                  id="onboard-email"
                  type="email"
                  value={newDraft.primaryContactEmail}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, primaryContactEmail: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Contact phone" htmlFor="onboard-phone">
                <input
                  id="onboard-phone"
                  value={newDraft.primaryContactPhone}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, primaryContactPhone: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Billing email" htmlFor="onboard-billing-email">
                <input
                  id="onboard-billing-email"
                  type="email"
                  value={newDraft.billingContactEmail}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, billingContactEmail: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Expected students" htmlFor="onboard-students">
                <input
                  id="onboard-students"
                  inputMode="numeric"
                  value={newDraft.expectedStudents}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, expectedStudents: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Expected concurrent students" htmlFor="onboard-concurrent">
                <input
                  id="onboard-concurrent"
                  inputMode="numeric"
                  value={newDraft.expectedConcurrentStudents}
                  onChange={(event) =>
                    setNewDraft((draft) => ({
                      ...draft,
                      expectedConcurrentStudents: event.target.value,
                    }))
                  }
                />
              </UiFormField>
              <UiFormField label="Exam sessions / month" htmlFor="onboard-sessions">
                <input
                  id="onboard-sessions"
                  inputMode="numeric"
                  value={newDraft.expectedExamSessionsPerMonth}
                  onChange={(event) =>
                    setNewDraft((draft) => ({
                      ...draft,
                      expectedExamSessionsPerMonth: event.target.value,
                    }))
                  }
                />
              </UiFormField>
            </div>
          ) : null}
          {createStep === 2 ? (
            <div className="vendor-onboarding-form-grid">
              <UiFormField label="Initial license plan" htmlFor="onboard-plan">
                <select
                  id="onboard-plan"
                  value={newDraft.selectedPlanId}
                  onChange={(event) => {
                    const selectedPlanId = event.target.value as VendorLicensePlanId;
                    setNewDraft((draft) => ({
                      ...draft,
                      selectedPlanId,
                      billingCycle: selectedPlanId === "TRIAL" ? "Monthly" : draft.billingCycle,
                      licenseExpiryDate:
                        selectedPlanId === "TRIAL"
                          ? getTrialExpiryDate(draft.licenseStartDate)
                          : draft.licenseExpiryDate,
                      paymentTermsDays: selectedPlanId === "TRIAL" ? "0" : draft.paymentTermsDays,
                    }));
                  }}
                >
                  {onboardingPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.id === "TRIAL"
                        ? "Trial - free for one calendar month (L0 Tier 1 limits)"
                        : `${plan.level} ${plan.tier} - ${formatInr(plan.baseFeeInr)} + ${formatInr(plan.perStudentFeeInr)}/student`}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Billing cycle" htmlFor="onboard-cycle">
                <select
                  id="onboard-cycle"
                  value={newDraft.billingCycle}
                  disabled={newDraft.selectedPlanId === "TRIAL"}
                  onChange={(event) =>
                    setNewDraft((draft) => ({
                      ...draft,
                      billingCycle: event.target.value as "Monthly" | "Quarterly",
                    }))
                  }
                >
                  <option>Monthly</option>
                  <option>Quarterly</option>
                </select>
              </UiFormField>
              <UiFormField label="License start" htmlFor="onboard-start">
                <input
                  id="onboard-start"
                  type="date"
                  value={newDraft.licenseStartDate}
                  onChange={(event) =>
                    setNewDraft((draft) => ({
                      ...draft,
                      licenseStartDate: event.target.value,
                      licenseExpiryDate:
                        draft.selectedPlanId === "TRIAL"
                          ? getTrialExpiryDate(event.target.value)
                          : draft.licenseExpiryDate,
                    }))
                  }
                />
              </UiFormField>
              <UiFormField label="License expiry" htmlFor="onboard-expiry">
                <input
                  id="onboard-expiry"
                  type="date"
                  value={newDraft.licenseExpiryDate}
                  disabled={newDraft.selectedPlanId === "TRIAL"}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, licenseExpiryDate: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Payment terms (days)" htmlFor="onboard-terms">
                <input
                  id="onboard-terms"
                  inputMode="numeric"
                  value={newDraft.paymentTermsDays}
                  disabled={newDraft.selectedPlanId === "TRIAL"}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, paymentTermsDays: event.target.value }))
                  }
                />
              </UiFormField>
              <div className="vendor-onboarding-fee-preview">
                <span>
                  {newDraft.selectedPlanId === "TRIAL"
                    ? "Fixed Trial entitlement"
                    : "Estimated monthly charge"}
                </span>
                <strong>{formatInr(newMonthlyFee)}</strong>
                <small>
                  {newDraft.selectedPlanId === "TRIAL"
                    ? `One calendar month | Up to ${TRIAL_STUDENT_LIMIT} students | 200 concurrent | 30 sessions`
                    : "Based on expected students and current published parameters."}
                </small>
              </div>
            </div>
          ) : null}
          {createStep === 3 ? (
            <div className="vendor-onboarding-form-grid">
              <UiFormField label="Administrator name" htmlFor="onboard-admin-name">
                <input
                  id="onboard-admin-name"
                  value={newDraft.administratorName}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, administratorName: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Administrator email" htmlFor="onboard-admin-email">
                <input
                  id="onboard-admin-email"
                  type="email"
                  value={newDraft.administratorEmail}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, administratorEmail: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Administrator phone" htmlFor="onboard-admin-phone">
                <input
                  id="onboard-admin-phone"
                  value={newDraft.administratorPhone}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, administratorPhone: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Invitation expiry" htmlFor="onboard-invite-expiry">
                <input
                  id="onboard-invite-expiry"
                  type="date"
                  value={newDraft.invitationExpiresAt}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, invitationExpiresAt: event.target.value }))
                  }
                />
              </UiFormField>
            </div>
          ) : null}
          {createStep === 4 ? (
            <div className="vendor-onboarding-review">
              <dl>
                <div>
                  <dt>Institute</dt>
                  <dd>{newDraft.instituteName || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{newDraft.primaryContactEmail || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{newDraft.selectedPlanId}</dd>
                </div>
                <div>
                  <dt>Billing</dt>
                  <dd>
                    {newDraft.selectedPlanId === "TRIAL" ? "Not applicable" : newDraft.billingCycle}
                  </dd>
                </div>
                <div>
                  <dt>Estimated monthly fee</dt>
                  <dd>{formatInr(newMonthlyFee)}</dd>
                </div>
                <div>
                  <dt>Administrator</dt>
                  <dd>{newDraft.administratorEmail || "Not provided"}</dd>
                </div>
              </dl>
              <UiFormField label="Vendor note" htmlFor="onboard-note">
                <textarea
                  id="onboard-note"
                  rows={4}
                  value={newDraft.note}
                  onChange={(event) =>
                    setNewDraft((draft) => ({ ...draft, note: event.target.value }))
                  }
                />
              </UiFormField>
            </div>
          ) : null}
        </div>
        <footer className="vendor-onboarding-create-actions">
          <button
            type="button"
            className="vendor-secondary-button"
            disabled={createStep === 1}
            onClick={() => setCreateStep((step) => Math.max(1, step - 1))}
          >
            Back
          </button>
          <span>Step {createStep} of 4</span>
          {createStep < 4 ? (
            <button
              type="button"
              className="vendor-primary-action"
              onClick={() => setCreateStep((step) => Math.min(4, step + 1))}
            >
              Continue
            </button>
          ) : (
            <div>
              <button
                type="button"
                className="vendor-secondary-button"
                onClick={() => submitNewInstitute("draft")}
              >
                Save draft
              </button>
              <button
                type="button"
                className="vendor-primary-action"
                onClick={() => submitNewInstitute("pending_review")}
              >
                Submit for review
              </button>
            </div>
          )}
        </footer>
      </section>
    );
  }

  return (
    <section className="vendor-onboarding-workspace" aria-labelledby="vendor-onboarding-title">
      <div className="vendor-section-heading">
        <div>
          <h3 id="vendor-onboarding-title">Institute onboarding</h3>
          <p>Review applications and control commercial setup, invitations, and activation.</p>
        </div>
        <button
          type="button"
          className="vendor-primary-action"
          onClick={() => setSearchParams({ view: "onboarding", mode: "new" })}
        >
          Add institute
        </button>
      </div>
      <div className="vendor-institute-summary">
        <UiStatCard
          title="Pending Review"
          value={String(statusCounts.pending)}
          helper="Needs vendor decision"
        />
        <UiStatCard
          title="Commercial Setup"
          value={String(statusCounts.commercial)}
          helper="Proposal or payment stage"
        />
        <UiStatCard
          title="Setup & Activation"
          value={String(statusCounts.setup)}
          helper="Administrator and configuration"
        />
        <UiStatCard
          title="Active"
          value={String(statusCounts.active)}
          helper="Completed onboarding"
        />
      </div>
      <div className="vendor-onboarding-filter" role="tablist" aria-label="Onboarding filters">
        {(["all", "attention", "commercial", "setup", "complete"] as OnboardingFilter[]).map(
          (option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? "vendor-onboarding-filter-active" : ""}
              onClick={() => setFilter(option)}
            >
              {toTitleCase(option)}
            </button>
          ),
        )}
      </div>
      <div className="vendor-onboarding-layout">
        <section className="vendor-onboarding-queue" aria-label="Onboarding queue">
          {filteredRecords.map((record) => (
            <button
              key={record.id}
              type="button"
              className={`vendor-onboarding-queue-item${selectedRecord?.id === record.id ? " vendor-onboarding-queue-item-active" : ""}`}
              onClick={() => selectRecord(record)}
            >
              <span>
                <strong>
                  {unreadOnboardingIds.includes(record.id) ? <i /> : null}
                  {record.instituteName}
                </strong>
                <small>
                  {record.expectedStudents.toLocaleString("en-IN")} students |{" "}
                  {record.selectedPlanId}
                </small>
                <small>Next: {getNextAction(record)}</small>
              </span>
              <span className={`vendor-status vendor-status-${record.status}`}>
                {toTitleCase(record.status)}
              </span>
            </button>
          ))}
        </section>
        {selectedRecord && commercialDraft && administratorDraft ? (
          <section
            className="vendor-onboarding-detail"
            aria-labelledby="vendor-onboarding-detail-title"
          >
            <header>
              <div>
                <p className="vendor-content-eyebrow">Onboarding record</p>
                <h3 id="vendor-onboarding-detail-title">{selectedRecord.instituteName}</h3>
                <p>
                  {selectedRecord.id} | Assigned to {selectedRecord.assignedOperator}
                </p>
              </div>
              <span className={`vendor-status vendor-status-${selectedRecord.status}`}>
                {toTitleCase(selectedRecord.status)}
              </span>
            </header>
            <div
              className={`vendor-onboarding-progress${selectedIsTrial ? " vendor-onboarding-progress-trial" : ""}`}
              aria-label="Onboarding progress"
            >
              {workflowSteps.map((step, index) => {
                const state = step.complete
                  ? "complete"
                  : index === currentWorkflowStep
                    ? "current"
                    : "upcoming";
                return (
                  <div key={step.label} className={`vendor-onboarding-progress-${state}`}>
                    <span>{step.complete ? "Done" : index + 1}</span>
                    <strong>{step.label}</strong>
                  </div>
                );
              })}
            </div>
            {workflowGuidance ? (
              <section className="vendor-onboarding-next-action" aria-live="polite">
                <div>
                  <span>Current step</span>
                  <strong>{workflowGuidance.current}</strong>
                </div>
                <div>
                  <span>Next action</span>
                  <p>{workflowGuidance.next}</p>
                </div>
              </section>
            ) : null}
            {selectedRecord.duplicateWarning ? (
              <p className="vendor-onboarding-warning">
                <strong>Duplicate review:</strong> {selectedRecord.duplicateWarning}
              </p>
            ) : null}
            <section className="vendor-onboarding-detail-section">
              <h4>Application review</h4>
              <div className="vendor-onboarding-detail-grid">
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{selectedRecord.instituteType}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{selectedRecord.location}</dd>
                  </div>
                  <div>
                    <dt>Primary contact</dt>
                    <dd>{selectedRecord.primaryContactName}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{selectedRecord.primaryContactEmail}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{selectedRecord.primaryContactPhone}</dd>
                  </div>
                </dl>
                <dl>
                  <div>
                    <dt>Expected students</dt>
                    <dd>{selectedRecord.expectedStudents.toLocaleString("en-IN")}</dd>
                  </div>
                  <div>
                    <dt>Expected concurrent</dt>
                    <dd>{selectedRecord.expectedConcurrentStudents}</dd>
                  </div>
                  <div>
                    <dt>Exam sessions / month</dt>
                    <dd>{selectedRecord.expectedExamSessionsPerMonth}</dd>
                  </div>
                  <div>
                    <dt>Requested capabilities</dt>
                    <dd>{selectedRecord.requestedCapabilities.join(", ")}</dd>
                  </div>
                </dl>
              </div>
              <UiFormField label="Vendor review note" htmlFor="onboarding-review-note">
                <textarea
                  id="onboarding-review-note"
                  rows={3}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                />
              </UiFormField>
              <div className="vendor-onboarding-actions">
                <button
                  type="button"
                  className="vendor-primary-action"
                  disabled={!canReview}
                  onClick={() =>
                    updateStatus(
                      "approved",
                      "Application approved",
                      "Application approved for commercial setup.",
                    )
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={!canReview}
                  onClick={() =>
                    updateStatus(
                      "information_required",
                      "Information requested",
                      "Additional institute information requested.",
                    )
                  }
                >
                  Request information
                </button>
                <button
                  type="button"
                  className="vendor-danger-button"
                  disabled={!canReview || !reviewNote.trim()}
                  onClick={() =>
                    updateStatus(
                      "rejected",
                      "Application rejected",
                      "Application rejected by vendor.",
                    )
                  }
                >
                  Reject
                </button>
              </div>
            </section>
            <form className="vendor-onboarding-detail-section" onSubmit={saveCommercialSetup}>
              <h4>
                {commercialIsTrial ? "Trial subscription setup" : "License and commercial setup"}
              </h4>
              <div className="vendor-onboarding-form-grid">
                <UiFormField label="Plan" htmlFor="onboarding-commercial-plan">
                  <select
                    id="onboarding-commercial-plan"
                    value={commercialDraft.selectedPlanId}
                    onChange={(event) => {
                      const selectedPlanId = event.target.value as VendorLicensePlanId;
                      setCommercialDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              selectedPlanId,
                              billingCycle:
                                selectedPlanId === "TRIAL" ? "Monthly" : draft.billingCycle,
                              licenseExpiryDate:
                                selectedPlanId === "TRIAL"
                                  ? getTrialExpiryDate(draft.licenseStartDate)
                                  : draft.licenseExpiryDate,
                              paymentTermsDays:
                                selectedPlanId === "TRIAL" ? "0" : draft.paymentTermsDays,
                            }
                          : draft,
                      );
                    }}
                  >
                    {onboardingPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.id === "TRIAL" ? "Trial - one month" : `${plan.level} ${plan.tier}`}
                      </option>
                    ))}
                  </select>
                </UiFormField>
                <UiFormField
                  label={commercialIsTrial ? "Trial student allowance" : "Billable students"}
                  htmlFor="onboarding-billable"
                  helper={
                    commercialIsTrial ? `Maximum ${TRIAL_STUDENT_LIMIT} students.` : undefined
                  }
                >
                  <input
                    id="onboarding-billable"
                    inputMode="numeric"
                    max={commercialIsTrial ? TRIAL_STUDENT_LIMIT : undefined}
                    value={commercialDraft.billableStudents}
                    onChange={(event) =>
                      setCommercialDraft((draft) =>
                        draft ? { ...draft, billableStudents: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Billing cycle" htmlFor="onboarding-billing-cycle">
                  <select
                    id="onboarding-billing-cycle"
                    value={commercialDraft.billingCycle}
                    disabled={commercialIsTrial}
                    onChange={(event) =>
                      setCommercialDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              billingCycle: event.target.value as "Monthly" | "Quarterly",
                            }
                          : draft,
                      )
                    }
                  >
                    <option>Monthly</option>
                    <option>Quarterly</option>
                  </select>
                </UiFormField>
                <UiFormField label="Start date" htmlFor="onboarding-license-start">
                  <input
                    id="onboarding-license-start"
                    type="date"
                    value={commercialDraft.licenseStartDate}
                    onChange={(event) =>
                      setCommercialDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              licenseStartDate: event.target.value,
                              licenseExpiryDate:
                                draft.selectedPlanId === "TRIAL"
                                  ? getTrialExpiryDate(event.target.value)
                                  : draft.licenseExpiryDate,
                            }
                          : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Expiry date" htmlFor="onboarding-license-expiry">
                  <input
                    id="onboarding-license-expiry"
                    type="date"
                    value={commercialDraft.licenseExpiryDate}
                    disabled={commercialIsTrial}
                    onChange={(event) =>
                      setCommercialDraft((draft) =>
                        draft ? { ...draft, licenseExpiryDate: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Payment terms" htmlFor="onboarding-payment-terms">
                  <input
                    id="onboarding-payment-terms"
                    inputMode="numeric"
                    value={commercialDraft.paymentTermsDays}
                    disabled={commercialIsTrial}
                    onChange={(event) =>
                      setCommercialDraft((draft) =>
                        draft ? { ...draft, paymentTermsDays: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
              </div>
              <div className="vendor-onboarding-commercial-preview">
                <span>{commercialIsTrial ? "Trial charge" : "Monthly estimate"}</span>
                <strong>
                  {draftPlan
                    ? formatInr(
                        draftPlan.baseFeeInr +
                          (Number.parseInt(commercialDraft.billableStudents, 10) || 0) *
                            draftPlan.perStudentFeeInr,
                      )
                    : formatInr(0)}
                </strong>
              </div>
              <div className="vendor-onboarding-actions">
                <button
                  type="submit"
                  className={selectedRecord.status === "approved" ? "vendor-primary-action" : ""}
                  disabled={!canSaveCommercial}
                >
                  Save setup
                </button>
                <button
                  type="button"
                  className={canSendProposal ? "vendor-primary-action" : ""}
                  disabled={!canSendProposal}
                  onClick={() =>
                    updateStatus(
                      "awaiting_acceptance",
                      selectedIsTrial ? "Trial Terms sent" : "Proposal sent",
                      selectedIsTrial
                        ? "One-month Trial Terms sent to the institute."
                        : `Commercial proposal sent for ${commercialDraft.selectedPlanId}.`,
                    )
                  }
                >
                  {selectedIsTrial ? "Send Trial Terms" : "Send proposal"}
                </button>
                <button
                  type="button"
                  className={canMarkProposalAccepted ? "vendor-primary-action" : ""}
                  disabled={!canMarkProposalAccepted}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      {
                        proposalAccepted: true,
                        paymentComplete: selectedIsTrial,
                        status: selectedIsTrial ? "trial_terms_accepted" : "awaiting_payment",
                      },
                      selectedIsTrial ? "Trial Terms accepted" : "Proposal accepted",
                      selectedIsTrial
                        ? "Institute accepted the one-month Trial Terms; payment is not applicable."
                        : "Institute accepted the commercial proposal.",
                    )
                  }
                >
                  Mark accepted
                </button>
                {!selectedIsTrial ? (
                  <button
                    type="button"
                    className={canMarkPaymentReceived ? "vendor-primary-action" : ""}
                    disabled={!canMarkPaymentReceived}
                    onClick={() =>
                      updateOnboardingRecord(
                        selectedRecord.id,
                        { paymentComplete: true, status: "payment_received" },
                        "Payment received",
                        "Initial payment confirmed by vendor.",
                      )
                    }
                  >
                    Mark payment received
                  </button>
                ) : null}
              </div>
            </form>
            <form className="vendor-onboarding-detail-section" onSubmit={saveAdministrator}>
              <h4>Administrator invitation</h4>
              <div className="vendor-onboarding-form-grid">
                <UiFormField label="Administrator name" htmlFor="onboarding-admin-name">
                  <input
                    id="onboarding-admin-name"
                    value={administratorDraft.administratorName}
                    onChange={(event) =>
                      setAdministratorDraft((draft) =>
                        draft ? { ...draft, administratorName: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Administrator email" htmlFor="onboarding-admin-email">
                  <input
                    id="onboarding-admin-email"
                    type="email"
                    value={administratorDraft.administratorEmail}
                    onChange={(event) =>
                      setAdministratorDraft((draft) =>
                        draft ? { ...draft, administratorEmail: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Administrator phone" htmlFor="onboarding-admin-phone">
                  <input
                    id="onboarding-admin-phone"
                    value={administratorDraft.administratorPhone}
                    onChange={(event) =>
                      setAdministratorDraft((draft) =>
                        draft ? { ...draft, administratorPhone: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
                <UiFormField label="Invitation expires" htmlFor="onboarding-admin-expiry">
                  <input
                    id="onboarding-admin-expiry"
                    type="date"
                    value={administratorDraft.invitationExpiresAt}
                    onChange={(event) =>
                      setAdministratorDraft((draft) =>
                        draft ? { ...draft, invitationExpiresAt: event.target.value } : draft,
                      )
                    }
                  />
                </UiFormField>
              </div>
              <div className="vendor-onboarding-actions">
                <button type="submit" disabled={!canPrepareInvitation}>
                  Save administrator
                </button>
                <button
                  type="button"
                  className={canSendInvitation ? "vendor-primary-action" : ""}
                  disabled={!canSendInvitation}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      {
                        ...administratorDraft,
                        invitationStatus: "sent",
                        status: "administrator_invited",
                      },
                      "Administrator invited",
                      `Invitation sent to ${administratorDraft.administratorEmail}.`,
                    )
                  }
                >
                  Send invitation
                </button>
                <button
                  type="button"
                  disabled={selectedRecord.invitationStatus !== "sent"}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      { invitationStatus: "revoked" },
                      "Invitation revoked",
                      "Administrator invitation revoked by vendor.",
                    )
                  }
                >
                  Revoke
                </button>
                <button
                  type="button"
                  className={canMarkInvitationAccepted ? "vendor-primary-action" : ""}
                  disabled={!canMarkInvitationAccepted}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      {
                        invitationStatus: "accepted",
                        termsAccepted: true,
                        status: "setup_in_progress",
                      },
                      "Invitation accepted",
                      "Administrator identity and platform terms confirmed.",
                    )
                  }
                >
                  Mark invitation accepted
                </button>
              </div>
            </form>
            <section className="vendor-onboarding-detail-section">
              <h4>Activation checklist</h4>
              <div className="vendor-activation-checklist">
                {activationChecks.map((check) => (
                  <div
                    key={check.label}
                    className={check.complete ? "vendor-activation-check-complete" : ""}
                  >
                    <span>{check.complete ? "Complete" : "Pending"}</span>
                    <strong>{check.label}</strong>
                  </div>
                ))}
              </div>
              <div className="vendor-onboarding-actions">
                <button
                  type="button"
                  disabled={!canCompleteInstituteSetup || selectedRecord.profileVerified}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      {
                        profileVerified: true,
                        status:
                          selectedRecord.termsAccepted && selectedRecord.initialSettingsComplete
                            ? "ready_for_activation"
                            : "setup_in_progress",
                      },
                      "Profile verified",
                      "Institute details verified by vendor.",
                    )
                  }
                >
                  Verify profile
                </button>
                <button
                  type="button"
                  disabled={!canCompleteInstituteSetup || selectedRecord.initialSettingsComplete}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      {
                        initialSettingsComplete: true,
                        status:
                          selectedRecord.termsAccepted && selectedRecord.profileVerified
                            ? "ready_for_activation"
                            : "setup_in_progress",
                      },
                      "Initial settings completed",
                      "Academic year and default settings confirmed.",
                    )
                  }
                >
                  Complete settings
                </button>
                <button
                  type="button"
                  className="vendor-primary-action"
                  disabled={!activationReady}
                  onClick={() =>
                    updateOnboardingRecord(
                      selectedRecord.id,
                      { status: "active" },
                      "Institute activated",
                      "Institute tenant and administrator access activated.",
                    )
                  }
                >
                  Activate institute
                </button>
              </div>
            </section>
            <section className="vendor-onboarding-detail-section">
              <h4>Onboarding timeline</h4>
              <ol className="vendor-onboarding-timeline">
                {selectedRecord.timeline.map((event) => (
                  <li key={event.id}>
                    <time>{formatDate(event.createdAt)}</time>
                    <div>
                      <strong>{event.label}</strong>
                      <p>{event.note}</p>
                      <small>{event.actor}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </section>
        ) : (
          <p className="vendor-institute-empty">No onboarding records match this filter.</p>
        )}
      </div>
    </section>
  );
}

export default VendorInstituteOnboardingWorkspace;
