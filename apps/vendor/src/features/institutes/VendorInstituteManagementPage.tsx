import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiStatCard,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  filterInstitutes,
  getLicenseHistoryForInstitute,
  getVendorInstitutesDataset,
  getWebhookLogsForInstitute,
  type VendorInstituteActionType,
  type VendorInstituteAdministration,
  type VendorInstituteLifecycleStatus,
  type VendorInstituteRecord,
  type VendorInstituteSubscriptionStatus,
  type VendorLicenseChangeRecord,
  type VendorLicenseLevel,
  type VendorLicensePlan,
  type VendorLicensePlanId,
  type VendorLicenseWebhookLog,
} from "./vendorInstitutesDataset";
import {
  useVendorLicenseRequests,
  type VendorBillingCommunication,
  type VendorInvoice,
  type VendorLicenseRequestStatus,
} from "./vendorLicenseRequestsStore";
import VendorInstituteOnboardingWorkspace from "./VendorInstituteOnboardingWorkspace";

interface InstituteFilters {
  query: string;
  layer: VendorLicenseLevel | "all";
  subscriptionStatus: VendorInstituteSubscriptionStatus | "all";
  lifecycleStatus: VendorInstituteLifecycleStatus | "all";
  paymentStatus: VendorInstituteRecord["paymentStatus"] | "all";
}

interface LocalActionRecord {
  id: string;
  actionType: VendorInstituteActionType;
  instituteId: string;
  instituteName: string;
  createdAt: string;
  note: string;
}

interface LicenseAssignmentDraft {
  nextPlanId: VendorLicensePlanId;
  nextStatus: VendorInstituteSubscriptionStatus;
  customStudentCount: string;
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

interface InstituteDeletionSchedule {
  instituteId: string;
  scheduledAt: string;
  purgeEligibleAt: string;
  reason: string;
  status: "scheduled" | "purged";
}

interface PrimaryAdministratorDraft {
  name: string;
  email: string;
  phone: string;
}

type BillingDialogKind = "preview" | "invoice_resent" | "payment_reminder" | "offline_payment";

interface BillingDialogState {
  kind: BillingDialogKind;
  invoiceId: string;
  linkedRequestId?: string;
}

type InstituteWorkspaceTab = "overview" | "license" | "activity" | "administration";
type InstitutePageView = "directory" | "requests" | "onboarding";

const LAYER_FILTERS: Array<InstituteFilters["layer"]> = ["all", "L0", "L1", "L2"];
const SUBSCRIPTION_FILTERS: Array<InstituteFilters["subscriptionStatus"]> = [
  "all",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];
const LIFECYCLE_FILTERS: Array<InstituteFilters["lifecycleStatus"]> = [
  "all",
  "active",
  "watchlist",
  "suspended",
  "archived",
];
const PAYMENT_FILTERS: Array<InstituteFilters["paymentStatus"]> = ["all", "Paid", "Due", "Failed"];

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDeleteGuardPhrase(instituteId: string): string {
  return `DELETE ${instituteId}`;
}

function buildPurgeGuardPhrase(instituteId: string): string {
  return `PURGE ${instituteId}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function getExtensionDays(currentExpiry: string, nextExpiry: string): number {
  const difference = Date.parse(nextExpiry) - Date.parse(currentExpiry);
  return Math.max(0, Math.ceil(difference / (24 * 60 * 60 * 1000)));
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

function getPlanRank(planId: VendorLicensePlanId): number {
  const levelRank = Number(planId.slice(1, 2));
  const tierRank = Number(planId.slice(-1));

  return levelRank * 10 + tierRank;
}

function getEffectivePaymentStatus(
  invoiceRows: VendorInvoice[],
  fallback: VendorInstituteRecord["paymentStatus"],
): VendorInstituteRecord["paymentStatus"] {
  if (invoiceRows.some((invoice) => invoice.status === "failed")) {
    return "Failed";
  }
  if (invoiceRows.some((invoice) => invoice.status !== "paid")) {
    return "Due";
  }
  return invoiceRows.length > 0 ? "Paid" : fallback;
}

function VendorInstituteManagementPage() {
  const dataset = useMemo(() => getVendorInstitutesDataset(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    requests: licenseRequests,
    openRequestCount,
    unreadRequestIds,
    markRequestRead,
    updateRequestStatus,
    invoices,
    billingCommunications,
    sendBillingCommunication,
    recordOfflinePayment,
    licensePlans,
    unreadOnboardingIds,
  } = useVendorLicenseRequests();
  const [filters, setFilters] = useState<InstituteFilters>({
    query: "",
    layer: "all",
    subscriptionStatus: "all",
    lifecycleStatus: "all",
    paymentStatus: "all",
  });
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>(
    dataset.institutes[0]?.id ?? "",
  );
  const [actionNote, setActionNote] = useState<string>("");
  const [extensionDate, setExtensionDate] = useState<string>("");
  const [deleteGuardInput, setDeleteGuardInput] = useState<string>("");
  const [purgeGuardInput, setPurgeGuardInput] = useState<string>("");
  const [actionFeed, setActionFeed] = useState<LocalActionRecord[]>([]);
  const [licenseExpiryOverrides, setLicenseExpiryOverrides] = useState<Record<string, string>>({});
  const [deletionSchedules, setDeletionSchedules] = useState<
    Record<string, InstituteDeletionSchedule>
  >({});
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const [activeTab, setActiveTab] = useState<InstituteWorkspaceTab>("overview");
  const [assignmentDraft, setAssignmentDraft] = useState<LicenseAssignmentDraft>({
    nextPlanId: dataset.institutes[0]?.currentLicensePlanId ?? "L0-T1",
    nextStatus: dataset.institutes[0]?.subscriptionStatus ?? "active",
    customStudentCount: "",
    note: "",
  });
  const [queuedLicenseActions, setQueuedLicenseActions] = useState<QueuedLicenseAction[]>([]);
  const [requestDecisionNote, setRequestDecisionNote] = useState("");
  const [billingDialog, setBillingDialog] = useState<BillingDialogState | null>(null);
  const [billingRecipient, setBillingRecipient] = useState("");
  const [billingMessage, setBillingMessage] = useState("");
  const [offlinePaymentReference, setOfflinePaymentReference] = useState("");
  const [copiedInvoiceId, setCopiedInvoiceId] = useState("");
  const [administrationOverrides, setAdministrationOverrides] = useState<
    Record<string, VendorInstituteAdministration>
  >({});
  const [administratorEditorOpen, setAdministratorEditorOpen] = useState(false);
  const [primaryAdministratorDraft, setPrimaryAdministratorDraft] =
    useState<PrimaryAdministratorDraft>({ name: "", email: "", phone: "" });

  const requestedPageView = searchParams.get("view");
  const pageView: InstitutePageView =
    requestedPageView === "requests" || requestedPageView === "onboarding"
      ? requestedPageView
      : "directory";
  const linkedInstituteId = searchParams.get("institute");
  const linkedTab = searchParams.get("tab");
  const resolvedActiveTab: InstituteWorkspaceTab =
    linkedTab === "license" || linkedTab === "activity" || linkedTab === "administration"
      ? linkedTab
      : activeTab;
  const requestedRequestId = searchParams.get("request");
  const selectedLicenseRequest =
    licenseRequests.find((request) => request.id === requestedRequestId) ??
    licenseRequests.find((request) => request.status === "pending") ??
    licenseRequests[0] ??
    null;
  const requestInstitute = selectedLicenseRequest
    ? (dataset.institutes.find(
        (institute) => institute.id === selectedLicenseRequest.instituteId,
      ) ?? null)
    : null;
  const requestCurrentPlan = selectedLicenseRequest
    ? (dataset.licensePlans.find((plan) => plan.id === selectedLicenseRequest.currentPlanId) ??
      null)
    : null;
  const requestTargetPlan = selectedLicenseRequest
    ? (dataset.licensePlans.find((plan) => plan.id === selectedLicenseRequest.requestedPlanId) ??
      null)
    : null;
  const requestHasOutstandingInvoice = requestInstitute
    ? invoices.some(
        (invoice) => invoice.instituteId === requestInstitute.id && invoice.status !== "paid",
      )
    : false;
  const requestCanBeApproved = Boolean(
    requestInstitute &&
    !requestHasOutstandingInvoice &&
    requestInstitute.subscriptionStatus !== "suspended" &&
    requestInstitute.lifecycleStatus !== "suspended",
  );
  const requestPortfolio = useMemo(() => {
    return licenseRequests.reduce(
      (summary, request) => ({
        ...summary,
        [request.status]: summary[request.status] + 1,
      }),
      { pending: 0, payment_required: 0, approved: 0, rejected: 0 } satisfies Record<
        VendorLicenseRequestStatus,
        number
      >,
    );
  }, [licenseRequests]);

  const planById = useMemo(() => {
    return new Map(licensePlans.map((plan) => [plan.id, plan]));
  }, [licensePlans]);

  const filteredInstitutes = useMemo(() => {
    const baseRows = filterInstitutes(dataset.institutes, {
      ...filters,
      paymentStatus: "all",
    });

    if (filters.paymentStatus === "all") {
      return baseRows;
    }

    return baseRows.filter((institute) => {
      const instituteInvoices = invoices.filter((invoice) => invoice.instituteId === institute.id);
      return (
        getEffectivePaymentStatus(instituteInvoices, institute.paymentStatus) ===
        filters.paymentStatus
      );
    });
  }, [dataset.institutes, filters, invoices]);

  const selectedInstitute = useMemo(() => {
    const effectiveInstituteId = linkedInstituteId ?? selectedInstituteId;
    return filteredInstitutes.find((institute) => institute.id === effectiveInstituteId) ?? null;
  }, [filteredInstitutes, linkedInstituteId, selectedInstituteId]);

  const selectedPlan = selectedInstitute
    ? (planById.get(selectedInstitute.currentLicensePlanId) ?? null)
    : null;
  const selectedAdministration = selectedInstitute
    ? (administrationOverrides[selectedInstitute.id] ??
      dataset.administration.find(
        (administration) => administration.instituteId === selectedInstitute.id,
      ) ??
      null)
    : null;
  const effectiveLicenseExpiry = selectedInstitute
    ? (licenseExpiryOverrides[selectedInstitute.id] ?? selectedInstitute.licenseExpiresAt)
    : "";
  const minimumExtensionDate = effectiveLicenseExpiry
    ? formatDateLabel(addDays(effectiveLicenseExpiry, 1))
    : "";
  const extensionDays =
    effectiveLicenseExpiry && extensionDate
      ? getExtensionDays(effectiveLicenseExpiry, `${extensionDate}T23:59:59.000Z`)
      : 0;
  const selectedDeletionSchedule = selectedInstitute
    ? (deletionSchedules[selectedInstitute.id] ?? null)
    : null;
  const selectedInvoices = selectedInstitute
    ? invoices.filter((invoice) => invoice.instituteId === selectedInstitute.id)
    : [];
  const selectedBillingCommunications = selectedInstitute
    ? billingCommunications.filter(
        (communication) => communication.instituteId === selectedInstitute.id,
      )
    : [];
  const latestInvoice = selectedInvoices[0] ?? null;
  const outstandingInvoice = selectedInvoices.find((invoice) => invoice.status !== "paid") ?? null;
  const billingDialogInvoice = billingDialog
    ? (invoices.find((invoice) => invoice.id === billingDialog.invoiceId) ?? null)
    : null;
  const requestOutstandingInvoice = requestInstitute
    ? (invoices.find(
        (invoice) => invoice.instituteId === requestInstitute.id && invoice.status !== "paid",
      ) ?? null)
    : null;
  const isPurgeEligible = selectedDeletionSchedule
    ? Date.parse(sessionStartedAt) >= Date.parse(selectedDeletionSchedule.purgeEligibleAt)
    : false;
  const targetPlan = planById.get(assignmentDraft.nextPlanId) ?? licensePlans[0];
  const studentCountForPreview =
    Number.parseInt(assignmentDraft.customStudentCount, 10) ||
    selectedInstitute?.activeStudentCount ||
    0;
  const projectedMonthlyFee = targetPlan
    ? calculateMonthlyFee(targetPlan, studentCountForPreview)
    : 0;

  const historyRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseChangeRecord[];
    }

    return getLicenseHistoryForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const webhookRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseWebhookLog[];
    }

    return getWebhookLogsForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const activitySnapshot = useMemo(() => {
    return filteredInstitutes.reduce(
      (accumulator, institute) => {
        return {
          activeStudents: accumulator.activeStudents + institute.activeStudentCount,
          monthlyUsage: accumulator.monthlyUsage + institute.monthlyUsage,
          monthlyRuns: accumulator.monthlyRuns + institute.activityMetrics.monthlyTestRuns,
          needsAttention:
            accumulator.needsAttention +
            (institute.lifecycleStatus === "watchlist" ||
            institute.subscriptionStatus === "past_due"
              ? 1
              : 0),
        };
      },
      { activeStudents: 0, monthlyUsage: 0, monthlyRuns: 0, needsAttention: 0 },
    );
  }, [filteredInstitutes]);

  const tableColumns: Array<UiTableColumn<VendorInstituteRecord>> = [
    {
      id: "institute",
      header: "Institute",
      render: (row) => (
        <button
          type="button"
          className="vendor-link-button"
          onClick={() => {
            selectInstitute(row);
          }}
        >
          {row.instituteName}
        </button>
      ),
    },
    {
      id: "layer",
      header: "License Plan",
      render: (row) => row.currentLicensePlanId,
    },
    {
      id: "activeStudents",
      header: "Active Students",
      render: (row) => row.activeStudentCount.toLocaleString(),
    },
    {
      id: "subscription",
      header: "Subscription Status",
      render: (row) => toTitleCase(row.subscriptionStatus),
    },
    {
      id: "payment",
      header: "Payment",
      render: (row) =>
        getEffectivePaymentStatus(
          invoices.filter((invoice) => invoice.instituteId === row.id),
          row.paymentStatus,
        ),
    },
    {
      id: "monthlyUsage",
      header: "Monthly Usage %",
      render: (row) => `${row.monthlyUsage}%`,
    },
    {
      id: "lastActive",
      header: "Last Active",
      render: (row) => formatDateLabel(row.lastActiveDate),
    },
  ];

  const historyColumns: Array<UiTableColumn<VendorLicenseChangeRecord>> = [
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

  const webhookColumns: Array<UiTableColumn<VendorLicenseWebhookLog>> = [
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

  function selectInstitute(institute: VendorInstituteRecord) {
    setSearchParams({});
    setSelectedInstituteId(institute.id);
    setActiveTab("overview");
    setExtensionDate("");
    setDeleteGuardInput("");
    setPurgeGuardInput("");
    setAdministratorEditorOpen(false);
    setAssignmentDraft((previous) => ({
      ...previous,
      nextPlanId: institute.currentLicensePlanId,
      nextStatus: institute.subscriptionStatus,
      customStudentCount: "",
    }));
  }

  function selectWorkspaceTab(tab: InstituteWorkspaceTab) {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tab");
    nextParams.delete("invoice");
    setSearchParams(nextParams, { replace: true });
  }

  function queueAction(actionType: VendorInstituteActionType, note: string) {
    if (!selectedInstitute || (selectedDeletionSchedule && actionType !== "PurgeInstitute")) {
      return;
    }

    const createdAt = new Date().toISOString();
    const action: LocalActionRecord = {
      id: `${createdAt}-${actionType}`,
      actionType,
      instituteId: selectedInstitute.id,
      instituteName: selectedInstitute.instituteName,
      createdAt,
      note,
    };

    setActionFeed((previous) => [action, ...previous].slice(0, 12));
    setActionNote("");
  }

  function updateSelectedAdministration(
    update: (current: VendorInstituteAdministration) => VendorInstituteAdministration,
  ) {
    if (!selectedInstitute || !selectedAdministration) return;
    setAdministrationOverrides((current) => ({
      ...current,
      [selectedInstitute.id]: update(selectedAdministration),
    }));
  }

  function openPrimaryAdministratorEditor() {
    if (!selectedAdministration) return;
    setPrimaryAdministratorDraft({
      name: selectedAdministration.primaryAdministrator.name,
      email: selectedAdministration.primaryAdministrator.email,
      phone: selectedAdministration.primaryAdministrator.phone,
    });
    setAdministratorEditorOpen(true);
  }

  function handlePrimaryAdministratorChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedAdministration ||
      !primaryAdministratorDraft.name.trim() ||
      !primaryAdministratorDraft.email.trim()
    ) {
      return;
    }

    const invitedAt = new Date().toISOString();
    updateSelectedAdministration((current) => ({
      ...current,
      primaryAdministrator: {
        ...current.primaryAdministrator,
        name: primaryAdministratorDraft.name.trim(),
        email: primaryAdministratorDraft.email.trim(),
        phone: primaryAdministratorDraft.phone.trim(),
        status: "invited",
        invitationStatus: "pending",
        invitedAt,
        invitationAcceptedAt: "",
        lastLoginAt: "",
        mfaEnabled: false,
      },
    }));
    queueAction(
      "ChangePrimaryAdministrator",
      `Primary administrator changed to ${primaryAdministratorDraft.email.trim()}; invitation queued.`,
    );
    setAdministratorEditorOpen(false);
  }

  function handleAdministratorAccessAction(action: "resend" | "reset" | "suspend" | "restore") {
    if (!selectedAdministration) return;
    const administrator = selectedAdministration.primaryAdministrator;
    const now = new Date().toISOString();

    if (action === "resend") {
      updateSelectedAdministration((current) => ({
        ...current,
        primaryAdministrator: {
          ...current.primaryAdministrator,
          invitedAt: now,
          invitationStatus: "pending",
          status: "invited",
        },
      }));
      queueAction(
        "ResendAdministratorInvitation",
        `Administrator invitation resent to ${administrator.email}.`,
      );
      return;
    }

    const nextStatus = action === "suspend" ? "suspended" : "active";
    updateSelectedAdministration((current) => ({
      ...current,
      primaryAdministrator: { ...current.primaryAdministrator, status: nextStatus },
    }));
    queueAction(
      action === "reset"
        ? "ResetAdministratorAccess"
        : action === "suspend"
          ? "SuspendAdministratorAccess"
          : "RestoreAdministratorAccess",
      action === "reset"
        ? `Access reset initiated for ${administrator.email}.`
        : `${administrator.email} access ${action === "suspend" ? "suspended" : "restored"}.`,
    );
  }

  function handleLicenseAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstitute || selectedDeletionSchedule) {
      return;
    }

    const note = assignmentDraft.note.trim() || "Vendor-approved institute license change.";
    const createdAt = new Date().toISOString();
    const action: QueuedLicenseAction = {
      id: `${createdAt}-${selectedInstitute.id}-${assignmentDraft.nextPlanId}`,
      createdAt,
      instituteName: selectedInstitute.instituteName,
      previousPlanId: selectedInstitute.currentLicensePlanId,
      nextPlanId: assignmentDraft.nextPlanId,
      nextStatus: assignmentDraft.nextStatus,
      projectedMonthlyFeeInr: projectedMonthlyFee,
      note,
    };

    setQueuedLicenseActions((previous) => [action, ...previous].slice(0, 10));
    const lifecycleActionType: VendorInstituteActionType =
      assignmentDraft.nextPlanId === selectedInstitute.currentLicensePlanId
        ? "ExtendLicense"
        : getPlanRank(assignmentDraft.nextPlanId) >
            getPlanRank(selectedInstitute.currentLicensePlanId)
          ? "UpgradeLicense"
          : "DowngradeLicense";

    setActionFeed((previous) =>
      [
        {
          id: `${createdAt}-LicenseChange`,
          actionType: lifecycleActionType,
          instituteId: selectedInstitute.id,
          instituteName: selectedInstitute.instituteName,
          createdAt,
          note,
        },
        ...previous,
      ].slice(0, 12),
    );
    setAssignmentDraft((previous) => ({ ...previous, note: "" }));
  }

  function handleLicenseExtension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !selectedInstitute ||
      selectedDeletionSchedule ||
      !effectiveLicenseExpiry ||
      extensionDays <= 0
    ) {
      return;
    }

    const nextExpiry = `${extensionDate}T23:59:59.000Z`;
    const note = actionNote.trim() || "License validity extended by vendor authorization.";
    setLicenseExpiryOverrides((previous) => ({
      ...previous,
      [selectedInstitute.id]: nextExpiry,
    }));
    queueAction(
      "ExtendLicense",
      `${note} Expiry changed from ${formatDateLabel(effectiveLicenseExpiry)} to ${extensionDate} (${extensionDays} days).`,
    );
    setExtensionDate("");
  }

  function handleScheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstitute || !isDeleteGuardReady || selectedDeletionSchedule) {
      return;
    }

    const scheduledAt = new Date().toISOString();
    const purgeEligibleAt = addDays(scheduledAt, 30);
    const reason = actionNote.trim() || "Institute deletion scheduled by vendor operator.";
    setDeletionSchedules((previous) => ({
      ...previous,
      [selectedInstitute.id]: {
        instituteId: selectedInstitute.id,
        scheduledAt,
        purgeEligibleAt,
        reason,
        status: "scheduled",
      },
    }));
    queueAction(
      "ScheduleDeletion",
      `${reason} Access disabled immediately; permanent purge eligible on ${formatDateLabel(purgeEligibleAt)}.`,
    );
    setDeleteGuardInput("");
  }

  function handlePermanentPurge() {
    if (
      !selectedInstitute ||
      !selectedDeletionSchedule ||
      !isPurgeEligible ||
      purgeGuardInput.trim() !== buildPurgeGuardPhrase(selectedInstitute.id)
    ) {
      return;
    }

    setDeletionSchedules((previous) => ({
      ...previous,
      [selectedInstitute.id]: { ...selectedDeletionSchedule, status: "purged" },
    }));
    queueAction(
      "PurgeInstitute",
      "Permanent purge approved after the retention period. Financial and vendor audit records remain retained.",
    );
    setPurgeGuardInput("");
  }

  function selectLicenseRequest(requestId: string) {
    markRequestRead(requestId);
    setRequestDecisionNote("");
    setSearchParams({ view: "requests", request: requestId });
  }

  function decideLicenseRequest(
    status: Exclude<VendorLicenseRequestStatus, "pending">,
    fallbackNote: string,
  ) {
    if (!selectedLicenseRequest) {
      return;
    }

    updateRequestStatus(
      selectedLicenseRequest.id,
      status,
      requestDecisionNote.trim() || fallbackNote,
    );
    setRequestDecisionNote("");
  }

  function openBillingDialog(
    invoice: VendorInvoice,
    kind: BillingDialogKind,
    linkedRequestId?: string,
  ) {
    const institute = dataset.institutes.find((candidate) => candidate.id === invoice.instituteId);
    setBillingDialog({ kind, invoiceId: invoice.id, linkedRequestId });
    setBillingRecipient(institute?.billing.billingContactEmail ?? "");
    setOfflinePaymentReference("");
    setBillingMessage(
      kind === "invoice_resent"
        ? `Invoice ${invoice.invoiceNumber} is attached again for your records.`
        : `Payment for ${invoice.invoiceNumber} is outstanding. Please use the payment link before ${formatDateLabel(invoice.dueAt)}.`,
    );
  }

  function closeBillingDialog() {
    setBillingDialog(null);
    setBillingRecipient("");
    setBillingMessage("");
    setOfflinePaymentReference("");
  }

  function handleBillingDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!billingDialog || !billingDialogInvoice) {
      return;
    }

    if (billingDialog.kind === "offline_payment") {
      if (!offlinePaymentReference.trim()) {
        return;
      }
      recordOfflinePayment(billingDialogInvoice.id, offlinePaymentReference.trim());
      closeBillingDialog();
      return;
    }

    if (
      (billingDialog.kind === "invoice_resent" || billingDialog.kind === "payment_reminder") &&
      billingRecipient.trim()
    ) {
      sendBillingCommunication(
        billingDialogInvoice.id,
        billingDialog.kind,
        billingRecipient.trim(),
        billingMessage.trim(),
      );
      if (billingDialog.linkedRequestId) {
        updateRequestStatus(
          billingDialog.linkedRequestId,
          "payment_required",
          `Payment reminder sent for ${billingDialogInvoice.invoiceNumber}.`,
        );
      }
      closeBillingDialog();
    }
  }

  async function copyPaymentLink(invoice: VendorInvoice) {
    await navigator.clipboard.writeText(invoice.paymentLink);
    setCopiedInvoiceId(invoice.id);
  }

  function downloadInvoice(invoice: VendorInvoice) {
    const invoiceText = [
      invoice.invoiceNumber,
      `Billing period: ${invoice.billingPeriod}`,
      `Billable students: ${invoice.billableStudents}`,
      `Amount: ${formatInr(invoice.amountInr)}`,
      `Due date: ${formatDateLabel(invoice.dueAt)}`,
      `Status: ${toTitleCase(invoice.status)}`,
    ].join("\n");
    const objectUrl = URL.createObjectURL(new Blob([invoiceText], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${invoice.invoiceNumber}.txt`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  const deleteGuardExpected = selectedInstitute ? buildDeleteGuardPhrase(selectedInstitute.id) : "";
  const isDeleteGuardReady =
    deleteGuardExpected.length > 0 && deleteGuardInput.trim() === deleteGuardExpected;
  const purgeGuardExpected = selectedInstitute ? buildPurgeGuardPhrase(selectedInstitute.id) : "";
  const isPurgeGuardReady = purgeGuardInput.trim() === purgeGuardExpected;

  const workspaceTabs: Array<{ id: InstituteWorkspaceTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "license", label: "License" },
    { id: "activity", label: "Activity & billing" },
    { id: "administration", label: "Administration" },
  ];

  return (
    <section
      className="vendor-content-card admin-content-card vendor-institutes-page"
      aria-labelledby="vendor-institutes-title"
    >
      <div className="vendor-institutes-heading">
        <div>
          <p className="vendor-content-eyebrow admin-content-eyebrow">Institute control</p>
          <h2 id="vendor-institutes-title">Institutes</h2>
          <p className="vendor-content-copy admin-content-copy">
            Find an institute, review its account, and manage its license from one workspace.
          </p>
        </div>
        <div className="vendor-institute-view-switch" role="tablist" aria-label="Institute views">
          <button
            type="button"
            role="tab"
            aria-selected={pageView === "directory"}
            className={pageView === "directory" ? "vendor-institute-view-active" : ""}
            onClick={() => setSearchParams({})}
          >
            Directory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageView === "requests"}
            className={pageView === "requests" ? "vendor-institute-view-active" : ""}
            onClick={() => setSearchParams({ view: "requests" })}
          >
            License Requests
            {openRequestCount > 0 ? <span>{openRequestCount}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pageView === "onboarding"}
            className={pageView === "onboarding" ? "vendor-institute-view-active" : ""}
            onClick={() => setSearchParams({ view: "onboarding" })}
          >
            Onboarding
            {unreadOnboardingIds.length > 0 ? <span>{unreadOnboardingIds.length}</span> : null}
          </button>
        </div>
      </div>

      {pageView === "directory" ? (
        <>
          <div className="vendor-institute-summary" aria-label="Filtered institute summary">
            <UiStatCard
              title="Institutes"
              value={String(filteredInstitutes.length)}
              helper="Matching current filters"
            />
            <UiStatCard
              title="Active Students"
              value={activitySnapshot.activeStudents.toLocaleString("en-IN")}
              helper="Across matching institutes"
            />
            <UiStatCard
              title="Monthly Test Runs"
              value={activitySnapshot.monthlyRuns.toLocaleString("en-IN")}
              helper="Latest reporting month"
            />
            <UiStatCard
              title="Needs Attention"
              value={String(activitySnapshot.needsAttention)}
              helper="Past due or on watchlist"
            />
          </div>

          <section
            className="vendor-institute-directory"
            aria-labelledby="vendor-institute-directory-title"
          >
            <div className="vendor-section-heading">
              <div>
                <h3 id="vendor-institute-directory-title">Institute directory</h3>
                <p>Select an institute name to open its control workspace.</p>
              </div>
              <button
                type="button"
                className="vendor-secondary-button"
                onClick={() => {
                  setFilters({
                    query: "",
                    layer: "all",
                    subscriptionStatus: "all",
                    lifecycleStatus: "all",
                    paymentStatus: "all",
                  });
                }}
              >
                Reset filters
              </button>
            </div>

            <div className="vendor-filter-toolbar">
              <UiFormField label="Search" htmlFor="vendor-institute-query">
                <input
                  id="vendor-institute-query"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, query: event.target.value }))
                  }
                  placeholder="Name, ID, plan or status"
                />
              </UiFormField>
              <UiFormField label="License layer" htmlFor="vendor-institute-layer">
                <select
                  id="vendor-institute-layer"
                  value={filters.layer}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      layer: event.target.value as InstituteFilters["layer"],
                    }))
                  }
                >
                  {LAYER_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All layers" : option}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Subscription" htmlFor="vendor-institute-subscription">
                <select
                  id="vendor-institute-subscription"
                  value={filters.subscriptionStatus}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      subscriptionStatus: event.target
                        .value as InstituteFilters["subscriptionStatus"],
                    }))
                  }
                >
                  {SUBSCRIPTION_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All subscriptions" : toTitleCase(option)}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Lifecycle" htmlFor="vendor-institute-lifecycle">
                <select
                  id="vendor-institute-lifecycle"
                  value={filters.lifecycleStatus}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      lifecycleStatus: event.target.value as InstituteFilters["lifecycleStatus"],
                    }))
                  }
                >
                  {LIFECYCLE_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All lifecycle states" : toTitleCase(option)}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Payment" htmlFor="vendor-institute-payment">
                <select
                  id="vendor-institute-payment"
                  value={filters.paymentStatus}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      paymentStatus: event.target.value as InstituteFilters["paymentStatus"],
                    }))
                  }
                >
                  {PAYMENT_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All payment states" : option}
                    </option>
                  ))}
                </select>
              </UiFormField>
            </div>

            <UiTable
              caption="Institute list"
              columns={tableColumns}
              rows={filteredInstitutes}
              rowKey={(row) => row.id}
              emptyStateText="No institutes matched the selected filters."
            />
          </section>

          {selectedInstitute && selectedPlan ? (
            <section
              className="vendor-institute-workspace"
              aria-labelledby="vendor-institute-drilldown-title"
            >
              <header className="vendor-institute-workspace-header">
                <div>
                  <p className="vendor-content-eyebrow">Selected institute</p>
                  <h3 id="vendor-institute-drilldown-title">{selectedInstitute.instituteName}</h3>
                  <p>{selectedInstitute.id}</p>
                </div>
                <div className="vendor-status-group" aria-label="Institute statuses">
                  {selectedDeletionSchedule ? (
                    <span
                      className={`vendor-status vendor-status-${selectedDeletionSchedule.status}`}
                    >
                      {selectedDeletionSchedule.status === "purged"
                        ? "Purge completed"
                        : "Deletion scheduled"}
                    </span>
                  ) : null}
                  <span
                    className={`vendor-status vendor-status-${selectedInstitute.lifecycleStatus}`}
                  >
                    {toTitleCase(selectedInstitute.lifecycleStatus)}
                  </span>
                  <span
                    className={`vendor-status vendor-status-${selectedInstitute.subscriptionStatus}`}
                  >
                    {toTitleCase(selectedInstitute.subscriptionStatus)}
                  </span>
                  <span className="vendor-status">{selectedInstitute.currentLicensePlanId}</span>
                </div>
              </header>

              <div className="vendor-workspace-tabs" role="tablist" aria-label="Institute details">
                {workspaceTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={resolvedActiveTab === tab.id}
                    className={resolvedActiveTab === tab.id ? "vendor-workspace-tab-active" : ""}
                    onClick={() => selectWorkspaceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {resolvedActiveTab === "overview" ? (
                <div className="vendor-workspace-panel" role="tabpanel">
                  <div className="vendor-institute-summary">
                    <UiStatCard
                      title="Current Plan"
                      value={getPlanLabel(selectedPlan)}
                      helper={`Expires ${formatDateLabel(effectiveLicenseExpiry)}`}
                    />
                    <UiStatCard
                      title="Active Students"
                      value={selectedInstitute.activeStudentCount.toLocaleString("en-IN")}
                      helper={`${selectedInstitute.monthlyUsage}% monthly usage`}
                    />
                    <UiStatCard
                      title="Monthly Fee"
                      value={formatInr(
                        calculateMonthlyFee(selectedPlan, selectedInstitute.activeStudentCount),
                      )}
                      helper={`${selectedInstitute.billing.billingCycle} billing`}
                    />
                    <UiStatCard
                      title="Last Active"
                      value={formatDateLabel(selectedInstitute.lastActiveDate)}
                      helper={`${selectedInstitute.activityMetrics.supportTicketsOpen} open support tickets`}
                    />
                  </div>
                  <div className="vendor-detail-grid">
                    <section>
                      <h4>Account status</h4>
                      <dl>
                        <div>
                          <dt>Subscription</dt>
                          <dd>{toTitleCase(selectedInstitute.subscriptionStatus)}</dd>
                        </div>
                        <div>
                          <dt>Payment</dt>
                          <dd>{selectedInstitute.paymentStatus}</dd>
                        </div>
                        <div>
                          <dt>Risk profile</dt>
                          <dd>{selectedInstitute.riskProfile ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Stability index</dt>
                          <dd>{selectedInstitute.stabilityIndex ?? "Not set"}</dd>
                        </div>
                      </dl>
                    </section>
                    <section>
                      <h4>Usage limits</h4>
                      <dl>
                        <div>
                          <dt>Concurrent now</dt>
                          <dd>
                            {selectedInstitute.concurrentStudentsNow} /{" "}
                            {selectedPlan.maxConcurrentStudents}
                          </dd>
                        </div>
                        <div>
                          <dt>Peak concurrent</dt>
                          <dd>
                            {selectedInstitute.peakConcurrentStudents} (
                            {getUsagePercent(
                              selectedInstitute.peakConcurrentStudents,
                              selectedPlan.maxConcurrentStudents,
                            )}
                            %)
                          </dd>
                        </div>
                        <div>
                          <dt>Exam sessions</dt>
                          <dd>
                            {selectedInstitute.examSessionsThisMonth} /{" "}
                            {selectedPlan.maxExamSessionsPerMonth}
                          </dd>
                        </div>
                        <div>
                          <dt>Monthly test runs</dt>
                          <dd>
                            {selectedInstitute.activityMetrics.monthlyTestRuns.toLocaleString(
                              "en-IN",
                            )}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </div>
              ) : null}

              {resolvedActiveTab === "license" ? (
                <div className="vendor-workspace-panel" role="tabpanel">
                  <div className="vendor-license-layout">
                    <section
                      className="vendor-current-license"
                      aria-labelledby="vendor-current-license-title"
                    >
                      <h4 id="vendor-current-license-title">Current license</h4>
                      <strong>{getPlanLabel(selectedPlan)}</strong>
                      <dl>
                        <div>
                          <dt>Base fee</dt>
                          <dd>{formatInr(selectedPlan.baseFeeInr)}</dd>
                        </div>
                        <div>
                          <dt>Per student</dt>
                          <dd>{formatInr(selectedPlan.perStudentFeeInr)}</dd>
                        </div>
                        <div>
                          <dt>Concurrent limit</dt>
                          <dd>{selectedPlan.maxConcurrentStudents}</dd>
                        </div>
                        <div>
                          <dt>Exam sessions / month</dt>
                          <dd>{selectedPlan.maxExamSessionsPerMonth}</dd>
                        </div>
                        <div>
                          <dt>License expiry</dt>
                          <dd>{formatDateLabel(effectiveLicenseExpiry)}</dd>
                        </div>
                      </dl>
                    </section>
                    {selectedDeletionSchedule ? (
                      <section
                        className="vendor-control-lock"
                        aria-label="License controls unavailable"
                      >
                        <h4>License controls unavailable</h4>
                        <p>
                          This institute is deactivated and scheduled for deletion. License changes
                          stay locked throughout the retention period.
                        </p>
                      </section>
                    ) : (
                      <UiForm
                        title="Change institute license"
                        description={`Preview and queue a controlled change for ${selectedInstitute.instituteName}.`}
                        submitLabel="Queue license change"
                        onSubmit={handleLicenseAssignment}
                      >
                        <UiFormField
                          label="Target license plan"
                          htmlFor="vendor-institute-target-plan"
                        >
                          <select
                            id="vendor-institute-target-plan"
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
                                {getPlanLabel(plan)} - {formatInr(plan.baseFeeInr)} +{" "}
                                {formatInr(plan.perStudentFeeInr)}/student
                              </option>
                            ))}
                          </select>
                        </UiFormField>

                        <UiFormField
                          label="Subscription status"
                          htmlFor="vendor-institute-target-status"
                        >
                          <select
                            id="vendor-institute-target-status"
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
                          htmlFor="vendor-institute-student-count"
                          helper="Leave blank to use current active students."
                        >
                          <input
                            id="vendor-institute-student-count"
                            inputMode="numeric"
                            value={assignmentDraft.customStudentCount}
                            onChange={(event) => {
                              setAssignmentDraft((previous) => ({
                                ...previous,
                                customStudentCount: event.target.value,
                              }));
                            }}
                            placeholder={selectedInstitute.activeStudentCount.toString()}
                          />
                        </UiFormField>

                        <UiFormField
                          label="Vendor note"
                          htmlFor="vendor-institute-license-note"
                          helper={`Preview: ${formatInr(projectedMonthlyFee)} / month`}
                        >
                          <input
                            id="vendor-institute-license-note"
                            value={assignmentDraft.note}
                            onChange={(event) => {
                              setAssignmentDraft((previous) => ({
                                ...previous,
                                note: event.target.value,
                              }));
                            }}
                            placeholder="Reason for upgrade, downgrade, suspension, or billing change"
                          />
                        </UiFormField>
                      </UiForm>
                    )}
                  </div>
                  <UiTable
                    caption="Queued institute license changes"
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
                        render: (row: QueuedLicenseAction) =>
                          `${row.previousPlanId} -> ${row.nextPlanId}`,
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
                    rows={queuedLicenseActions}
                    rowKey={(row) => row.id}
                    emptyStateText="No institute license changes queued in this session."
                  />
                </div>
              ) : null}

              {resolvedActiveTab === "activity" ? (
                <div className="vendor-workspace-panel" role="tabpanel">
                  <div className="vendor-institute-summary">
                    <UiStatCard
                      title="Outstanding Balance"
                      value={formatInr(
                        selectedInvoices
                          .filter((invoice) => invoice.status !== "paid")
                          .reduce((total, invoice) => total + invoice.amountInr, 0),
                      )}
                      helper={
                        outstandingInvoice
                          ? `${outstandingInvoice.invoiceNumber} needs attention`
                          : "No unpaid invoices"
                      }
                    />
                    <UiStatCard
                      title="Current Charge"
                      value={latestInvoice ? formatInr(latestInvoice.amountInr) : formatInr(0)}
                      helper={latestInvoice?.billingPeriod ?? "No invoice generated"}
                    />
                    <UiStatCard
                      title="Billable Students"
                      value={(
                        latestInvoice?.billableStudents ?? selectedInstitute.activeStudentCount
                      ).toLocaleString("en-IN")}
                      helper={`${selectedInstitute.billing.billingCycle} billing cycle`}
                    />
                    <UiStatCard
                      title="Payment Method"
                      value={selectedInstitute.billing.paymentMethodLabel}
                      helper={`${selectedInstitute.billing.paymentFailures} recorded failures`}
                    />
                  </div>

                  <section
                    className="vendor-billing-section"
                    aria-labelledby="vendor-invoice-history-title"
                  >
                    <div className="vendor-section-heading">
                      <div>
                        <h4 id="vendor-invoice-history-title">Invoices</h4>
                        <p>
                          Review charges, communicate with the institute, or record an offline
                          payment.
                        </p>
                      </div>
                      <span className="vendor-result-count">
                        {selectedInvoices.length} invoices
                      </span>
                    </div>
                    <UiTable
                      caption="Invoice history"
                      columns={[
                        {
                          id: "number",
                          header: "Invoice",
                          render: (row: VendorInvoice) => row.invoiceNumber,
                        },
                        {
                          id: "period",
                          header: "Period",
                          render: (row: VendorInvoice) => row.billingPeriod,
                        },
                        {
                          id: "students",
                          header: "Students",
                          render: (row: VendorInvoice) =>
                            row.billableStudents.toLocaleString("en-IN"),
                        },
                        {
                          id: "amount",
                          header: "Amount",
                          render: (row: VendorInvoice) => formatInr(row.amountInr),
                        },
                        {
                          id: "due",
                          header: "Due",
                          render: (row: VendorInvoice) => formatDateLabel(row.dueAt),
                        },
                        {
                          id: "status",
                          header: "Status",
                          render: (row: VendorInvoice) => (
                            <span className={`vendor-status vendor-status-${row.status}`}>
                              {toTitleCase(row.status)}
                            </span>
                          ),
                        },
                        {
                          id: "actions",
                          header: "Actions",
                          render: (row: VendorInvoice) => (
                            <div className="vendor-invoice-actions">
                              <button
                                type="button"
                                onClick={() => openBillingDialog(row, "preview")}
                              >
                                View
                              </button>
                              <button type="button" onClick={() => downloadInvoice(row)}>
                                Download
                              </button>
                              <button
                                type="button"
                                onClick={() => openBillingDialog(row, "invoice_resent")}
                              >
                                Resend
                              </button>
                              {row.status !== "paid" ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openBillingDialog(row, "payment_reminder")}
                                  >
                                    Send reminder
                                  </button>
                                  <button type="button" onClick={() => void copyPaymentLink(row)}>
                                    {copiedInvoiceId === row.id ? "Copied" : "Copy payment link"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openBillingDialog(row, "offline_payment")}
                                  >
                                    Record payment
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ),
                        },
                      ]}
                      rows={selectedInvoices}
                      rowKey={(row) => row.id}
                      emptyStateText="No invoices found for this institute."
                    />
                  </section>

                  <section
                    className="vendor-billing-section"
                    aria-labelledby="vendor-billing-communication-title"
                  >
                    <div className="vendor-section-heading">
                      <div>
                        <h4 id="vendor-billing-communication-title">
                          Billing communication history
                        </h4>
                        <p>Automated and vendor-triggered invoice communication.</p>
                      </div>
                    </div>
                    <UiTable
                      caption="Billing communication history"
                      columns={[
                        {
                          id: "date",
                          header: "Date",
                          render: (row: VendorBillingCommunication) =>
                            formatDateLabel(row.createdAt),
                        },
                        {
                          id: "type",
                          header: "Event",
                          render: (row: VendorBillingCommunication) => toTitleCase(row.type),
                        },
                        {
                          id: "recipient",
                          header: "Recipient",
                          render: (row: VendorBillingCommunication) => row.recipient,
                        },
                        {
                          id: "operator",
                          header: "Initiated By",
                          render: (row: VendorBillingCommunication) => row.initiatedBy,
                        },
                        {
                          id: "status",
                          header: "Status",
                          render: (row: VendorBillingCommunication) => toTitleCase(row.status),
                        },
                        {
                          id: "note",
                          header: "Note",
                          render: (row: VendorBillingCommunication) => row.note,
                        },
                      ]}
                      rows={selectedBillingCommunications}
                      rowKey={(row) => row.id}
                      emptyStateText="No billing communications recorded for this institute."
                    />
                  </section>

                  <div className="vendor-section-grid">
                    <UiTable
                      caption="Selected institute license history"
                      columns={historyColumns}
                      rows={historyRows}
                      rowKey={(row) => row.id}
                      emptyStateText="No license history found for selected institute."
                    />
                    <UiTable
                      caption="Selected institute billing webhook log"
                      columns={webhookColumns}
                      rows={webhookRows}
                      rowKey={(row) => row.id}
                      emptyStateText="No webhook logs found for selected institute."
                    />
                  </div>
                </div>
              ) : null}

              {resolvedActiveTab === "administration" ? (
                <div className="vendor-workspace-panel" role="tabpanel">
                  {selectedAdministration ? (
                    <section
                      className="vendor-administrator-management"
                      aria-labelledby="vendor-administrator-management-title"
                    >
                      <div className="vendor-section-heading">
                        <div>
                          <h4 id="vendor-administrator-management-title">
                            Institute administrators
                          </h4>
                          <p>
                            Administrator records established during onboarding and updated after
                            activation.
                          </p>
                        </div>
                        <span className="vendor-result-count">
                          {selectedAdministration.additionalAdministrators.length + 1} account
                          {selectedAdministration.additionalAdministrators.length === 0 ? "" : "s"}
                        </span>
                      </div>

                      <div className="vendor-administrator-layout">
                        <article className="vendor-primary-administrator">
                          <header>
                            <div>
                              <span>Primary administrator</span>
                              <h4>{selectedAdministration.primaryAdministrator.name}</h4>
                              <p>{selectedAdministration.primaryAdministrator.email}</p>
                            </div>
                            <span
                              className={`vendor-status vendor-status-${selectedAdministration.primaryAdministrator.status}`}
                            >
                              {toTitleCase(selectedAdministration.primaryAdministrator.status)}
                            </span>
                          </header>
                          <dl>
                            <div>
                              <dt>Phone</dt>
                              <dd>{selectedAdministration.primaryAdministrator.phone}</dd>
                            </div>
                            <div>
                              <dt>Role</dt>
                              <dd>{selectedAdministration.primaryAdministrator.role}</dd>
                            </div>
                            <div>
                              <dt>Invitation</dt>
                              <dd>
                                {toTitleCase(
                                  selectedAdministration.primaryAdministrator.invitationStatus,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Invitation accepted</dt>
                              <dd>
                                {selectedAdministration.primaryAdministrator.invitationAcceptedAt
                                  ? formatDateLabel(
                                      selectedAdministration.primaryAdministrator
                                        .invitationAcceptedAt,
                                    )
                                  : "Not yet"}
                              </dd>
                            </div>
                            <div>
                              <dt>Last login</dt>
                              <dd>
                                {selectedAdministration.primaryAdministrator.lastLoginAt
                                  ? formatDateLabel(
                                      selectedAdministration.primaryAdministrator.lastLoginAt,
                                    )
                                  : "Never"}
                              </dd>
                            </div>
                            <div>
                              <dt>MFA</dt>
                              <dd>
                                {selectedAdministration.primaryAdministrator.mfaEnabled
                                  ? "Enabled"
                                  : "Not enabled"}
                              </dd>
                            </div>
                          </dl>
                          <div className="vendor-administrator-actions">
                            <button type="button" onClick={openPrimaryAdministratorEditor}>
                              Change administrator
                            </button>
                            <button
                              type="button"
                              disabled={
                                selectedAdministration.primaryAdministrator.invitationStatus ===
                                "accepted"
                              }
                              onClick={() => handleAdministratorAccessAction("resend")}
                            >
                              Resend invitation
                            </button>
                            <button
                              type="button"
                              disabled={
                                selectedAdministration.primaryAdministrator.status === "invited"
                              }
                              onClick={() => handleAdministratorAccessAction("reset")}
                            >
                              Reset access
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAdministratorAccessAction(
                                  selectedAdministration.primaryAdministrator.status === "suspended"
                                    ? "restore"
                                    : "suspend",
                                )
                              }
                            >
                              {selectedAdministration.primaryAdministrator.status === "suspended"
                                ? "Restore access"
                                : "Suspend access"}
                            </button>
                          </div>
                        </article>

                        <aside className="vendor-administrator-contacts">
                          <section>
                            <span>Billing contact</span>
                            <h4>{selectedAdministration.billingContactName}</h4>
                            <a href={`mailto:${selectedAdministration.billingContactEmail}`}>
                              {selectedAdministration.billingContactEmail}
                            </a>
                            <p>{selectedAdministration.billingContactPhone}</p>
                          </section>
                          <section>
                            <span>Access posture</span>
                            <dl>
                              <div>
                                <dt>MFA</dt>
                                <dd>
                                  {selectedAdministration.primaryAdministrator.mfaEnabled
                                    ? "Compliant"
                                    : "Needs attention"}
                                </dd>
                              </div>
                              <div>
                                <dt>Account</dt>
                                <dd>
                                  {toTitleCase(selectedAdministration.primaryAdministrator.status)}
                                </dd>
                              </div>
                            </dl>
                          </section>
                        </aside>
                      </div>

                      {administratorEditorOpen ? (
                        <form
                          className="vendor-administrator-editor"
                          onSubmit={handlePrimaryAdministratorChange}
                        >
                          <div>
                            <h4>Change primary administrator</h4>
                            <p>
                              The new administrator will receive an invitation. The existing account
                              remains in the audit history.
                            </p>
                          </div>
                          <div className="vendor-onboarding-form-grid">
                            <UiFormField label="Name" htmlFor="vendor-primary-admin-name">
                              <input
                                id="vendor-primary-admin-name"
                                value={primaryAdministratorDraft.name}
                                onChange={(event) =>
                                  setPrimaryAdministratorDraft((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                              />
                            </UiFormField>
                            <UiFormField label="Email" htmlFor="vendor-primary-admin-email">
                              <input
                                id="vendor-primary-admin-email"
                                type="email"
                                value={primaryAdministratorDraft.email}
                                onChange={(event) =>
                                  setPrimaryAdministratorDraft((current) => ({
                                    ...current,
                                    email: event.target.value,
                                  }))
                                }
                              />
                            </UiFormField>
                            <UiFormField label="Phone" htmlFor="vendor-primary-admin-phone">
                              <input
                                id="vendor-primary-admin-phone"
                                value={primaryAdministratorDraft.phone}
                                onChange={(event) =>
                                  setPrimaryAdministratorDraft((current) => ({
                                    ...current,
                                    phone: event.target.value,
                                  }))
                                }
                              />
                            </UiFormField>
                          </div>
                          <div className="vendor-administrator-actions">
                            <button type="submit" className="vendor-primary-action">
                              Save and send invitation
                            </button>
                            <button type="button" onClick={() => setAdministratorEditorOpen(false)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}

                      <section className="vendor-additional-administrators">
                        <div className="vendor-section-heading">
                          <div>
                            <h4>Additional administrators</h4>
                            <p>Institute-managed accounts with administrative access.</p>
                          </div>
                        </div>
                        {selectedAdministration.additionalAdministrators.length > 0 ? (
                          <div className="vendor-additional-administrator-list">
                            {selectedAdministration.additionalAdministrators.map(
                              (administrator) => (
                                <div key={administrator.id}>
                                  <span>
                                    <strong>{administrator.name}</strong>
                                    <small>{administrator.email}</small>
                                  </span>
                                  <span>{administrator.role}</span>
                                  <span>
                                    Last login:{" "}
                                    {administrator.lastLoginAt
                                      ? formatDateLabel(administrator.lastLoginAt)
                                      : "Never"}
                                  </span>
                                  <span
                                    className={`vendor-status vendor-status-${administrator.status}`}
                                  >
                                    {toTitleCase(administrator.status)}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="vendor-institute-empty">
                            No additional administrators have been created.
                          </p>
                        )}
                      </section>
                    </section>
                  ) : (
                    <p className="vendor-institute-empty">
                      No administrator record is available for this institute.
                    </p>
                  )}

                  <div className="vendor-section-grid vendor-section-grid-actions">
                    <section
                      className="vendor-admin-actions"
                      aria-label="Institute lifecycle actions"
                    >
                      <h4>Lifecycle controls</h4>
                      <p>Use an operator note to keep the action queue auditable.</p>
                      <UiFormField label="Operator note" htmlFor="vendor-action-note">
                        <input
                          id="vendor-action-note"
                          value={actionNote}
                          onChange={(event) => setActionNote(event.target.value)}
                          placeholder="Reason for this action"
                        />
                      </UiFormField>
                      <div className="vendor-action-buttons">
                        <button
                          type="button"
                          disabled={Boolean(selectedDeletionSchedule)}
                          onClick={() =>
                            queueAction(
                              "SuspendInstitute",
                              actionNote || "Suspension requested by vendor control plane.",
                            )
                          }
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(selectedDeletionSchedule)}
                          onClick={() =>
                            queueAction(
                              "ForceArchive",
                              actionNote || "Archive workflow initiated by vendor operator.",
                            )
                          }
                        >
                          Archive
                        </button>
                      </div>

                      <form className="vendor-extension-control" onSubmit={handleLicenseExtension}>
                        <div className="vendor-admin-subheading">
                          <h4>Extend license</h4>
                          <p>
                            Current expiry:{" "}
                            <strong>{formatDateLabel(effectiveLicenseExpiry)}</strong>
                          </p>
                        </div>
                        <UiFormField
                          label="Extend until"
                          htmlFor="vendor-license-extension-date"
                          helper={
                            extensionDays > 0
                              ? `${extensionDays} additional days; the current plan remains unchanged.`
                              : "Choose a date later than the current expiry."
                          }
                        >
                          <input
                            id="vendor-license-extension-date"
                            type="date"
                            min={minimumExtensionDate}
                            value={extensionDate}
                            disabled={Boolean(selectedDeletionSchedule)}
                            onChange={(event) => setExtensionDate(event.target.value)}
                          />
                        </UiFormField>
                        <button
                          type="submit"
                          className="vendor-primary-action"
                          disabled={extensionDays <= 0 || Boolean(selectedDeletionSchedule)}
                        >
                          Confirm extension
                        </button>
                      </form>

                      <div className="vendor-danger-zone">
                        <h4>Delete institute</h4>
                        <p>
                          Deletion first disables access and starts a 30-day retention period.
                          Permanent purge is a separate approval.
                        </p>

                        <div
                          className="vendor-deletion-impact"
                          aria-label="Deletion impact summary"
                        >
                          <div>
                            <strong>Disabled immediately</strong>
                            <ul>
                              <li>Institute login and active access tokens</li>
                              <li>New exams, sessions, and subscription access</li>
                              <li>Operational integrations and API credentials</li>
                            </ul>
                          </div>
                          <div>
                            <strong>Purged after retention</strong>
                            <ul>
                              <li>
                                Institute profile, settings, and{" "}
                                {selectedInstitute.activeStudentCount.toLocaleString("en-IN")}{" "}
                                active student accounts
                              </li>
                              <li>Institute-owned test configuration and operational records</li>
                              <li>Personal data not covered by a retention requirement</li>
                            </ul>
                          </div>
                          <div>
                            <strong>Retained or anonymized</strong>
                            <ul>
                              <li>Invoices, payments, refunds, and tax records</li>
                              <li>Vendor audit and license-change history</li>
                              <li>Required examination and compliance records</li>
                            </ul>
                          </div>
                        </div>

                        {!selectedDeletionSchedule ? (
                          <form
                            className="vendor-deletion-confirmation"
                            onSubmit={handleScheduleDeletion}
                          >
                            <label
                              className="vendor-delete-guard"
                              htmlFor="vendor-delete-guard-input"
                            >
                              <span>
                                Type <code>{deleteGuardExpected}</code> to deactivate and schedule
                                deletion.
                              </span>
                              <input
                                id="vendor-delete-guard-input"
                                value={deleteGuardInput}
                                onChange={(event) => setDeleteGuardInput(event.target.value)}
                                placeholder="DELETE institute_id"
                              />
                            </label>
                            <button
                              type="submit"
                              className="vendor-danger-button"
                              disabled={!isDeleteGuardReady}
                            >
                              Deactivate and schedule deletion
                            </button>
                          </form>
                        ) : (
                          <div className="vendor-deletion-status" role="status">
                            <span
                              className={`vendor-status vendor-status-${selectedDeletionSchedule.status}`}
                            >
                              {selectedDeletionSchedule.status === "purged"
                                ? "Purge completed"
                                : "Deletion scheduled"}
                            </span>
                            <dl>
                              <div>
                                <dt>Scheduled</dt>
                                <dd>{formatDateLabel(selectedDeletionSchedule.scheduledAt)}</dd>
                              </div>
                              <div>
                                <dt>Purge eligible</dt>
                                <dd>{formatDateLabel(selectedDeletionSchedule.purgeEligibleAt)}</dd>
                              </div>
                              <div>
                                <dt>Reason</dt>
                                <dd>{selectedDeletionSchedule.reason}</dd>
                              </div>
                            </dl>

                            {selectedDeletionSchedule.status === "scheduled" ? (
                              <div className="vendor-purge-control">
                                <label
                                  className="vendor-delete-guard"
                                  htmlFor="vendor-purge-guard-input"
                                >
                                  <span>
                                    {isPurgeEligible ? (
                                      <>
                                        Type <code>{purgeGuardExpected}</code> for permanent purge.
                                      </>
                                    ) : (
                                      `Permanent purge unlocks after ${formatDateLabel(selectedDeletionSchedule.purgeEligibleAt)}.`
                                    )}
                                  </span>
                                  <input
                                    id="vendor-purge-guard-input"
                                    value={purgeGuardInput}
                                    disabled={!isPurgeEligible}
                                    onChange={(event) => setPurgeGuardInput(event.target.value)}
                                    placeholder="PURGE institute_id"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="vendor-danger-button"
                                  disabled={!isPurgeEligible || !isPurgeGuardReady}
                                  onClick={handlePermanentPurge}
                                >
                                  Permanently purge institute data
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </section>
                    <UiTable
                      caption="Recent action queue"
                      columns={[
                        {
                          id: "time",
                          header: "Date",
                          render: (row: LocalActionRecord) => formatDateLabel(row.createdAt),
                        },
                        {
                          id: "action",
                          header: "Action",
                          render: (row: LocalActionRecord) => toTitleCase(row.actionType),
                        },
                        {
                          id: "note",
                          header: "Note",
                          render: (row: LocalActionRecord) => row.note,
                        },
                      ]}
                      rows={actionFeed.filter(
                        (action) => action.instituteId === selectedInstitute.id,
                      )}
                      rowKey={(row) => row.id}
                      emptyStateText="No administrative actions queued for this institute."
                    />
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="vendor-institute-empty">No institute matches the current filters.</p>
          )}
        </>
      ) : pageView === "requests" ? (
        <section
          className="vendor-license-requests-view"
          aria-labelledby="vendor-license-requests-title"
        >
          <div className="vendor-section-heading">
            <div>
              <h3 id="vendor-license-requests-title">License requests</h3>
              <p>Review institute-initiated plan changes and record the vendor decision.</p>
            </div>
            <span className="vendor-result-count">{unreadRequestIds.length} unread</span>
          </div>

          <div className="vendor-institute-summary" aria-label="License request summary">
            <UiStatCard
              title="Pending Review"
              value={String(requestPortfolio.pending)}
              helper="Awaiting vendor decision"
            />
            <UiStatCard
              title="Payment Required"
              value={String(requestPortfolio.payment_required)}
              helper="Blocked by billing status"
            />
            <UiStatCard
              title="Approved"
              value={String(requestPortfolio.approved)}
              helper="Approved this session"
            />
            <UiStatCard
              title="Rejected"
              value={String(requestPortfolio.rejected)}
              helper="Declined this session"
            />
          </div>

          <div className="vendor-license-request-layout">
            <section className="vendor-request-list" aria-label="License request queue">
              {licenseRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={`vendor-request-list-item${selectedLicenseRequest?.id === request.id ? " vendor-request-list-item-active" : ""}`}
                  onClick={() => selectLicenseRequest(request.id)}
                >
                  <span className="vendor-request-list-main">
                    <strong>
                      {unreadRequestIds.includes(request.id) ? <i aria-label="Unread" /> : null}
                      {request.instituteName}
                    </strong>
                    <small>
                      {request.currentPlanId} to {request.requestedPlanId}
                    </small>
                  </span>
                  <span className={`vendor-status vendor-status-${request.status}`}>
                    {toTitleCase(request.status)}
                  </span>
                </button>
              ))}
            </section>

            {selectedLicenseRequest &&
            requestInstitute &&
            requestCurrentPlan &&
            requestTargetPlan ? (
              <section
                className="vendor-request-review"
                aria-labelledby="vendor-request-review-title"
              >
                <header>
                  <div>
                    <p className="vendor-content-eyebrow">Request review</p>
                    <h3 id="vendor-request-review-title">{selectedLicenseRequest.instituteName}</h3>
                    <p>
                      Submitted by {selectedLicenseRequest.requestedBy} on{" "}
                      {formatDateLabel(selectedLicenseRequest.submittedAt)}
                    </p>
                  </div>
                  <span className={`vendor-status vendor-status-${selectedLicenseRequest.status}`}>
                    {toTitleCase(selectedLicenseRequest.status)}
                  </span>
                </header>

                <div className="vendor-request-plan-comparison">
                  <section>
                    <span>Current plan</span>
                    <strong>{getPlanLabel(requestCurrentPlan)}</strong>
                    <small>
                      {formatInr(
                        calculateMonthlyFee(
                          requestCurrentPlan,
                          requestInstitute.activeStudentCount,
                        ),
                      )}{" "}
                      / month
                    </small>
                  </section>
                  <span aria-hidden="true">-&gt;</span>
                  <section>
                    <span>Requested plan</span>
                    <strong>{getPlanLabel(requestTargetPlan)}</strong>
                    <small>
                      {formatInr(
                        calculateMonthlyFee(requestTargetPlan, requestInstitute.activeStudentCount),
                      )}{" "}
                      / month
                    </small>
                  </section>
                </div>

                <div className="vendor-request-context">
                  <dl>
                    <div>
                      <dt>Active students</dt>
                      <dd>{requestInstitute.activeStudentCount.toLocaleString("en-IN")}</dd>
                    </div>
                    <div>
                      <dt>Peak concurrent</dt>
                      <dd>{requestInstitute.peakConcurrentStudents}</dd>
                    </div>
                    <div>
                      <dt>Exam sessions</dt>
                      <dd>{requestInstitute.examSessionsThisMonth}</dd>
                    </div>
                    <div>
                      <dt>Payment</dt>
                      <dd>{requestInstitute.paymentStatus}</dd>
                    </div>
                    <div>
                      <dt>Subscription</dt>
                      <dd>{toTitleCase(requestInstitute.subscriptionStatus)}</dd>
                    </div>
                    <div>
                      <dt>Lifecycle</dt>
                      <dd>{toTitleCase(requestInstitute.lifecycleStatus)}</dd>
                    </div>
                  </dl>
                  <div>
                    <h4>Institute reason</h4>
                    <p>{selectedLicenseRequest.reason}</p>
                  </div>
                </div>

                {selectedLicenseRequest.decisionNote ? (
                  <p className="vendor-request-decision-note">
                    <strong>Latest decision note:</strong> {selectedLicenseRequest.decisionNote}
                  </p>
                ) : null}

                {selectedLicenseRequest.status === "pending" ||
                selectedLicenseRequest.status === "payment_required" ? (
                  <div className="vendor-request-decision-controls">
                    {!requestCanBeApproved ? (
                      <p className="vendor-request-blocker">
                        Approval is blocked until payment and suspension issues are resolved.
                      </p>
                    ) : null}
                    <UiFormField label="Decision note" htmlFor="vendor-request-decision-note">
                      <textarea
                        id="vendor-request-decision-note"
                        rows={3}
                        value={requestDecisionNote}
                        onChange={(event) => setRequestDecisionNote(event.target.value)}
                        placeholder="Explain the approval, rejection, or payment requirement"
                      />
                    </UiFormField>
                    <div className="vendor-request-decision-actions">
                      <button
                        type="button"
                        className="vendor-primary-action"
                        disabled={!requestCanBeApproved}
                        onClick={() =>
                          decideLicenseRequest("approved", "Upgrade approved by vendor.")
                        }
                      >
                        Approve upgrade
                      </button>
                      <button
                        type="button"
                        disabled={!requestOutstandingInvoice}
                        onClick={() => {
                          if (requestOutstandingInvoice) {
                            openBillingDialog(
                              requestOutstandingInvoice,
                              "payment_reminder",
                              selectedLicenseRequest.id,
                            );
                          }
                        }}
                      >
                        {requestOutstandingInvoice ? "Request payment" : "No outstanding invoice"}
                      </button>
                      <button
                        type="button"
                        className="vendor-danger-button"
                        disabled={requestDecisionNote.trim().length === 0}
                        onClick={() =>
                          decideLicenseRequest("rejected", "Upgrade request rejected by vendor.")
                        }
                      >
                        Reject request
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : (
              <p className="vendor-institute-empty">No license request is available for review.</p>
            )}
          </div>
        </section>
      ) : (
        <VendorInstituteOnboardingWorkspace
          key={searchParams.get("onboarding") ?? searchParams.get("mode") ?? "onboarding-queue"}
        />
      )}

      <UiModal
        isOpen={Boolean(billingDialog && billingDialogInvoice)}
        title={
          billingDialog?.kind === "preview"
            ? "Invoice preview"
            : billingDialog?.kind === "invoice_resent"
              ? "Resend invoice"
              : billingDialog?.kind === "payment_reminder"
                ? "Send payment reminder"
                : "Record offline payment"
        }
        description={
          billingDialogInvoice
            ? `${billingDialogInvoice.invoiceNumber} | ${billingDialogInvoice.billingPeriod}`
            : undefined
        }
        onClose={closeBillingDialog}
      >
        {billingDialogInvoice ? (
          billingDialog?.kind === "preview" ? (
            <div className="vendor-invoice-preview">
              <dl>
                <div>
                  <dt>Invoice</dt>
                  <dd>{billingDialogInvoice.invoiceNumber}</dd>
                </div>
                <div>
                  <dt>Billing period</dt>
                  <dd>{billingDialogInvoice.billingPeriod}</dd>
                </div>
                <div>
                  <dt>Billable students</dt>
                  <dd>{billingDialogInvoice.billableStudents.toLocaleString("en-IN")}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>{formatDateLabel(billingDialogInvoice.issuedAt)}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{formatDateLabel(billingDialogInvoice.dueAt)}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatInr(billingDialogInvoice.amountInr)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{toTitleCase(billingDialogInvoice.status)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>
                    {billingDialogInvoice.paidAt
                      ? formatDateLabel(billingDialogInvoice.paidAt)
                      : "Not paid"}
                  </dd>
                </div>
              </dl>
              <div className="vendor-invoice-preview-actions">
                <button type="button" onClick={() => downloadInvoice(billingDialogInvoice)}>
                  Download invoice
                </button>
                <button type="button" onClick={() => void copyPaymentLink(billingDialogInvoice)}>
                  Copy payment link
                </button>
              </div>
            </div>
          ) : (
            <form className="vendor-billing-dialog-form" onSubmit={handleBillingDialogSubmit}>
              <div className="vendor-invoice-dialog-summary">
                <span>{formatInr(billingDialogInvoice.amountInr)}</span>
                <small>
                  Due {formatDateLabel(billingDialogInvoice.dueAt)} |{" "}
                  {toTitleCase(billingDialogInvoice.status)}
                </small>
              </div>
              {billingDialog?.kind === "offline_payment" ? (
                <UiFormField
                  label="Payment reference"
                  htmlFor="vendor-offline-payment-reference"
                  helper="Use the bank transfer, UPI, cheque, or internal receipt reference."
                >
                  <input
                    id="vendor-offline-payment-reference"
                    value={offlinePaymentReference}
                    onChange={(event) => setOfflinePaymentReference(event.target.value)}
                    placeholder="Payment reference"
                  />
                </UiFormField>
              ) : (
                <>
                  <UiFormField label="Recipient" htmlFor="vendor-billing-recipient">
                    <input
                      id="vendor-billing-recipient"
                      type="email"
                      value={billingRecipient}
                      onChange={(event) => setBillingRecipient(event.target.value)}
                    />
                  </UiFormField>
                  <UiFormField
                    label="Message preview"
                    htmlFor="vendor-billing-message"
                    helper={`Payment link: ${billingDialogInvoice.paymentLink}`}
                  >
                    <textarea
                      id="vendor-billing-message"
                      rows={5}
                      value={billingMessage}
                      onChange={(event) => setBillingMessage(event.target.value)}
                    />
                  </UiFormField>
                </>
              )}
              <button
                type="submit"
                className="vendor-primary-action"
                disabled={
                  billingDialog?.kind === "offline_payment"
                    ? !offlinePaymentReference.trim()
                    : !billingRecipient.trim() || !billingMessage.trim()
                }
              >
                {billingDialog?.kind === "offline_payment"
                  ? "Record payment"
                  : billingDialog?.kind === "invoice_resent"
                    ? "Send invoice"
                    : "Send reminder"}
              </button>
            </form>
          )
        ) : null}
      </UiModal>
    </section>
  );
}

export default VendorInstituteManagementPage;
