import { createContext, useContext } from "react";
import type { VendorLicensePlan, VendorLicensePlanId } from "./vendorInstitutesDataset";

export type VendorLicenseRequestStatus = "pending" | "payment_required" | "approved" | "rejected";

export interface VendorLicenseRequest {
  id: string;
  instituteId: string;
  instituteName: string;
  currentPlanId: VendorLicensePlanId;
  requestedPlanId: VendorLicensePlanId;
  submittedAt: string;
  requestedBy: string;
  reason: string;
  status: VendorLicenseRequestStatus;
  decisionNote: string;
}

export type VendorInvoiceStatus = "draft" | "due" | "past_due" | "paid" | "failed";
export type VendorBillingCommunicationType =
  | "invoice_issued"
  | "invoice_resent"
  | "payment_reminder"
  | "offline_payment";

export interface VendorInvoice {
  id: string;
  instituteId: string;
  invoiceNumber: string;
  billingPeriod: string;
  billableStudents: number;
  amountInr: number;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  status: VendorInvoiceStatus;
  paymentLink: string;
}

export interface VendorBillingCommunication {
  id: string;
  instituteId: string;
  invoiceId: string;
  type: VendorBillingCommunicationType;
  recipient: string;
  createdAt: string;
  status: "sent" | "recorded";
  initiatedBy: string;
  note: string;
}

export interface VendorBillingAlert {
  id: string;
  instituteId: string;
  invoiceId: string;
  title: string;
  message: string;
  createdAt: string;
  severity: "warning" | "critical" | "info";
}

export type VendorOnboardingStatus =
  | "draft"
  | "pending_review"
  | "information_required"
  | "approved"
  | "commercial_configured"
  | "awaiting_acceptance"
  | "awaiting_payment"
  | "payment_received"
  | "administrator_invited"
  | "setup_in_progress"
  | "ready_for_activation"
  | "active"
  | "rejected"
  | "expired";

export interface VendorOnboardingTimelineEvent {
  id: string;
  createdAt: string;
  actor: string;
  label: string;
  note: string;
}

export interface VendorOnboardingRecord {
  id: string;
  instituteName: string;
  instituteType: string;
  location: string;
  timezone: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingContactEmail: string;
  expectedStudents: number;
  expectedConcurrentStudents: number;
  expectedExamSessionsPerMonth: number;
  requestedCapabilities: string[];
  duplicateWarning: string;
  selectedPlanId: VendorLicensePlanId;
  billableStudents: number;
  billingCycle: "Monthly" | "Quarterly";
  licenseStartDate: string;
  licenseExpiryDate: string;
  trialDays: number;
  paymentTermsDays: number;
  proposalAccepted: boolean;
  paymentComplete: boolean;
  profileVerified: boolean;
  termsAccepted: boolean;
  initialSettingsComplete: boolean;
  administratorName: string;
  administratorEmail: string;
  administratorPhone: string;
  invitationExpiresAt: string;
  invitationStatus: "not_sent" | "sent" | "accepted" | "revoked" | "expired";
  assignedOperator: string;
  submittedAt: string;
  status: VendorOnboardingStatus;
  reviewNote: string;
  timeline: VendorOnboardingTimelineEvent[];
}

export interface VendorLicenseRequestsContextValue {
  requests: VendorLicenseRequest[];
  openRequestCount: number;
  unreadRequestIds: string[];
  invoices: VendorInvoice[];
  billingCommunications: VendorBillingCommunication[];
  billingAlerts: VendorBillingAlert[];
  unreadBillingAlertIds: string[];
  licensePlans: VendorLicensePlan[];
  onboardingRecords: VendorOnboardingRecord[];
  unreadOnboardingIds: string[];
  markRequestRead: (requestId: string) => void;
  markAllRequestsRead: () => void;
  markBillingAlertRead: (alertId: string) => void;
  markAllBillingAlertsRead: () => void;
  updateRequestStatus: (
    requestId: string,
    status: Exclude<VendorLicenseRequestStatus, "pending">,
    decisionNote: string,
  ) => void;
  sendBillingCommunication: (
    invoiceId: string,
    type: "invoice_resent" | "payment_reminder",
    recipient: string,
    note: string,
  ) => void;
  recordOfflinePayment: (invoiceId: string, reference: string) => void;
  publishLicensePlan: (plan: VendorLicensePlan) => void;
  markOnboardingRead: (recordId: string) => void;
  markAllOnboardingRead: () => void;
  createOnboardingRecord: (record: VendorOnboardingRecord) => void;
  updateOnboardingRecord: (
    recordId: string,
    changes: Partial<Omit<VendorOnboardingRecord, "id" | "timeline">>,
    eventLabel: string,
    eventNote: string,
  ) => void;
}

export const INITIAL_LICENSE_REQUESTS: VendorLicenseRequest[] = [
  {
    id: "license_req_riverdale_01",
    instituteId: "inst_riverdale",
    instituteName: "Riverdale Test Hub",
    currentPlanId: "L1-T2",
    requestedPlanId: "L1-T3",
    submittedAt: "2026-07-16T08:45:00.000Z",
    requestedBy: "admin@riverdaletest.example",
    reason: "Concurrent participation is reaching the Tier 2 limit during weekly mock exams.",
    status: "pending",
    decisionNote: "",
  },
  {
    id: "license_req_delta_01",
    instituteId: "inst_delta",
    instituteName: "Delta Coaching Network",
    currentPlanId: "L0-T1",
    requestedPlanId: "L1-T1",
    submittedAt: "2026-07-15T11:20:00.000Z",
    requestedBy: "operations@deltacoaching.example",
    reason: "The institute needs L1 diagnostic capabilities for its upcoming academic term.",
    status: "pending",
    decisionNote: "",
  },
  {
    id: "license_req_zenith_01",
    instituteId: "inst_zenith",
    instituteName: "Zenith Integrated Prep",
    currentPlanId: "L2-T2",
    requestedPlanId: "L2-T3",
    submittedAt: "2026-07-14T06:35:00.000Z",
    requestedBy: "director@zenithprep.example",
    reason: "A larger examination window is required for the next multi-campus assessment cycle.",
    status: "payment_required",
    decisionNote: "Resolve the failed payment before vendor approval.",
  },
];

export const INITIAL_INVOICES: VendorInvoice[] = [
  {
    id: "inv_ns_2026_07",
    instituteId: "inst_north_star",
    invoiceNumber: "INV-2026-07101",
    billingPeriod: "July 2026",
    billableStudents: 1340,
    amountInr: 228900,
    issuedAt: "2026-07-01T04:30:00.000Z",
    dueAt: "2026-07-10T23:59:59.000Z",
    paidAt: "2026-07-08T09:22:00.000Z",
    status: "paid",
    paymentLink: "https://pay.parabolic.local/INV-2026-07101",
  },
  {
    id: "inv_river_2026_07",
    instituteId: "inst_riverdale",
    invoiceNumber: "INV-2026-07102",
    billingPeriod: "July 2026",
    billableStudents: 820,
    amountInr: 94600,
    issuedAt: "2026-07-01T04:35:00.000Z",
    dueAt: "2026-07-10T23:59:59.000Z",
    paidAt: null,
    status: "past_due",
    paymentLink: "https://pay.parabolic.local/INV-2026-07102",
  },
  {
    id: "inv_orbit_2026_q3",
    instituteId: "inst_orbit",
    invoiceNumber: "INV-2026-Q301",
    billingPeriod: "Q3 2026",
    billableStudents: 2055,
    amountInr: 1029900,
    issuedAt: "2026-07-01T04:40:00.000Z",
    dueAt: "2026-07-15T23:59:59.000Z",
    paidAt: "2026-07-12T12:10:00.000Z",
    status: "paid",
    paymentLink: "https://pay.parabolic.local/INV-2026-Q301",
  },
  {
    id: "inv_delta_2026_07",
    instituteId: "inst_delta",
    invoiceNumber: "INV-2026-07103",
    billingPeriod: "July 2026",
    billableStudents: 395,
    amountInr: 23250,
    issuedAt: "2026-07-01T04:45:00.000Z",
    dueAt: "2026-07-18T23:59:59.000Z",
    paidAt: null,
    status: "due",
    paymentLink: "https://pay.parabolic.local/INV-2026-07103",
  },
  {
    id: "inv_zenith_2026_07",
    instituteId: "inst_zenith",
    invoiceNumber: "INV-2026-07104",
    billingPeriod: "July 2026",
    billableStudents: 1495,
    amountInr: 243225,
    issuedAt: "2026-07-01T04:50:00.000Z",
    dueAt: "2026-07-10T23:59:59.000Z",
    paidAt: null,
    status: "failed",
    paymentLink: "https://pay.parabolic.local/INV-2026-07104",
  },
];

export const INITIAL_BILLING_COMMUNICATIONS: VendorBillingCommunication[] = [
  {
    id: "comm_river_issued",
    instituteId: "inst_riverdale",
    invoiceId: "inv_river_2026_07",
    type: "invoice_issued",
    recipient: "billing@riverdaletest.example",
    createdAt: "2026-07-01T04:36:00.000Z",
    status: "sent",
    initiatedBy: "billing.automation",
    note: "Monthly invoice issued automatically.",
  },
  {
    id: "comm_river_reminder",
    instituteId: "inst_riverdale",
    invoiceId: "inv_river_2026_07",
    type: "payment_reminder",
    recipient: "billing@riverdaletest.example",
    createdAt: "2026-07-11T05:10:00.000Z",
    status: "sent",
    initiatedBy: "billing.automation",
    note: "First overdue reminder sent.",
  },
  {
    id: "comm_zenith_issued",
    instituteId: "inst_zenith",
    invoiceId: "inv_zenith_2026_07",
    type: "invoice_issued",
    recipient: "accounts@zenithprep.example",
    createdAt: "2026-07-01T04:51:00.000Z",
    status: "sent",
    initiatedBy: "billing.automation",
    note: "Monthly invoice issued automatically.",
  },
];

export const INITIAL_BILLING_ALERTS: VendorBillingAlert[] = [
  {
    id: "alert_river_overdue",
    instituteId: "inst_riverdale",
    invoiceId: "inv_river_2026_07",
    title: "Invoice overdue",
    message: "Riverdale Test Hub has an overdue invoice of INR 94,600.",
    createdAt: "2026-07-11T05:00:00.000Z",
    severity: "warning",
  },
  {
    id: "alert_zenith_failed",
    instituteId: "inst_zenith",
    invoiceId: "inv_zenith_2026_07",
    title: "Payment failed",
    message: "Zenith Integrated Prep has repeated payment failures on INV-2026-07104.",
    createdAt: "2026-07-10T07:25:00.000Z",
    severity: "critical",
  },
];

export const INITIAL_ONBOARDING_RECORDS: VendorOnboardingRecord[] = [
  {
    id: "onboard_apex_2026",
    instituteName: "Apex Learning Centre",
    instituteType: "Coaching institute",
    location: "Pune, Maharashtra",
    timezone: "Asia/Kolkata",
    primaryContactName: "Neha Kulkarni",
    primaryContactEmail: "neha@apexlearning.example",
    primaryContactPhone: "+91 98765 41020",
    billingContactEmail: "accounts@apexlearning.example",
    expectedStudents: 540,
    expectedConcurrentStudents: 280,
    expectedExamSessionsPerMonth: 42,
    requestedCapabilities: ["Diagnostics", "Scheduled mock examinations"],
    duplicateWarning: "",
    selectedPlanId: "L1-T2",
    billableStudents: 540,
    billingCycle: "Monthly",
    licenseStartDate: "2026-08-01",
    licenseExpiryDate: "2027-07-31",
    trialDays: 0,
    paymentTermsDays: 15,
    proposalAccepted: false,
    paymentComplete: false,
    profileVerified: false,
    termsAccepted: false,
    initialSettingsComplete: false,
    administratorName: "Neha Kulkarni",
    administratorEmail: "neha@apexlearning.example",
    administratorPhone: "+91 98765 41020",
    invitationExpiresAt: "2026-08-07",
    invitationStatus: "not_sent",
    assignedOperator: "vendor.onboarding@parabolic.local",
    submittedAt: "2026-07-16T07:20:00.000Z",
    status: "pending_review",
    reviewNote: "",
    timeline: [
      {
        id: "apex_received",
        createdAt: "2026-07-16T07:20:00.000Z",
        actor: "application.portal",
        label: "Application received",
        note: "Institute application and contact details submitted.",
      },
    ],
  },
  {
    id: "onboard_meridian_2026",
    instituteName: "Meridian Public School",
    instituteType: "School",
    location: "Jaipur, Rajasthan",
    timezone: "Asia/Kolkata",
    primaryContactName: "Rohan Mehta",
    primaryContactEmail: "rohan@meridianps.example",
    primaryContactPhone: "+91 98290 77314",
    billingContactEmail: "finance@meridianps.example",
    expectedStudents: 1180,
    expectedConcurrentStudents: 360,
    expectedExamSessionsPerMonth: 48,
    requestedCapabilities: ["Diagnostics", "Department analytics"],
    duplicateWarning: "",
    selectedPlanId: "L1-T2",
    billableStudents: 1180,
    billingCycle: "Quarterly",
    licenseStartDate: "2026-08-01",
    licenseExpiryDate: "2027-07-31",
    trialDays: 0,
    paymentTermsDays: 15,
    proposalAccepted: true,
    paymentComplete: false,
    profileVerified: true,
    termsAccepted: true,
    initialSettingsComplete: false,
    administratorName: "Rohan Mehta",
    administratorEmail: "rohan@meridianps.example",
    administratorPhone: "+91 98290 77314",
    invitationExpiresAt: "2026-08-07",
    invitationStatus: "not_sent",
    assignedOperator: "vendor.onboarding@parabolic.local",
    submittedAt: "2026-07-12T10:40:00.000Z",
    status: "awaiting_payment",
    reviewNote: "Proposal accepted; awaiting initial quarterly payment.",
    timeline: [
      {
        id: "meridian_proposal",
        createdAt: "2026-07-15T09:30:00.000Z",
        actor: "vendor.current",
        label: "Proposal accepted",
        note: "Institute accepted L1 Tier 2 quarterly terms.",
      },
      {
        id: "meridian_received",
        createdAt: "2026-07-12T10:40:00.000Z",
        actor: "application.portal",
        label: "Application received",
        note: "Application submitted and email verified.",
      },
    ],
  },
  {
    id: "onboard_horizon_2026",
    instituteName: "Horizon Examination Academy",
    instituteType: "Test preparation centre",
    location: "Bengaluru, Karnataka",
    timezone: "Asia/Kolkata",
    primaryContactName: "Anita Rao",
    primaryContactEmail: "anita@horizonacademy.example",
    primaryContactPhone: "+91 99001 55220",
    billingContactEmail: "billing@horizonacademy.example",
    expectedStudents: 760,
    expectedConcurrentStudents: 390,
    expectedExamSessionsPerMonth: 50,
    requestedCapabilities: ["Diagnostics", "Advanced examination controls"],
    duplicateWarning: "Similar domain found in an archived application; vendor review completed.",
    selectedPlanId: "L2-T2",
    billableStudents: 760,
    billingCycle: "Monthly",
    licenseStartDate: "2026-08-01",
    licenseExpiryDate: "2027-07-31",
    trialDays: 0,
    paymentTermsDays: 7,
    proposalAccepted: true,
    paymentComplete: true,
    profileVerified: true,
    termsAccepted: true,
    initialSettingsComplete: true,
    administratorName: "Anita Rao",
    administratorEmail: "anita@horizonacademy.example",
    administratorPhone: "+91 99001 55220",
    invitationExpiresAt: "2026-07-25",
    invitationStatus: "accepted",
    assignedOperator: "vendor.enterprise@parabolic.local",
    submittedAt: "2026-07-08T06:15:00.000Z",
    status: "ready_for_activation",
    reviewNote: "All activation prerequisites completed.",
    timeline: [
      {
        id: "horizon_ready",
        createdAt: "2026-07-16T05:50:00.000Z",
        actor: "onboarding.automation",
        label: "Ready for activation",
        note: "All mandatory checklist items completed.",
      },
      {
        id: "horizon_invite",
        createdAt: "2026-07-14T08:00:00.000Z",
        actor: "vendor.current",
        label: "Administrator accepted invitation",
        note: "Administrator identity and terms confirmed.",
      },
      {
        id: "horizon_received",
        createdAt: "2026-07-08T06:15:00.000Z",
        actor: "application.portal",
        label: "Application received",
        note: "Application submitted and email verified.",
      },
    ],
  },
];

export const VendorLicenseRequestsContext = createContext<VendorLicenseRequestsContextValue | null>(
  null,
);

export function useVendorLicenseRequests(): VendorLicenseRequestsContextValue {
  const context = useContext(VendorLicenseRequestsContext);

  if (!context) {
    throw new Error("useVendorLicenseRequests must be used within VendorLicenseRequestsProvider.");
  }

  return context;
}
