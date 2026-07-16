import { useMemo, useState, type ReactNode } from "react";
import { getVendorInstitutesDataset } from "./vendorInstitutesDataset";
import {
  INITIAL_BILLING_ALERTS,
  INITIAL_BILLING_COMMUNICATIONS,
  INITIAL_INVOICES,
  INITIAL_LICENSE_REQUESTS,
  INITIAL_ONBOARDING_RECORDS,
  VendorLicenseRequestsContext,
  type VendorLicenseRequest,
  type VendorLicenseRequestsContextValue,
  type VendorBillingAlert,
  type VendorBillingCommunication,
  type VendorInvoice,
  type VendorOnboardingRecord,
} from "./vendorLicenseRequestsStore";

export function VendorLicenseRequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<VendorLicenseRequest[]>(INITIAL_LICENSE_REQUESTS);
  const [unreadRequestIds, setUnreadRequestIds] = useState<string[]>(
    INITIAL_LICENSE_REQUESTS.map((request) => request.id),
  );
  const [invoices, setInvoices] = useState<VendorInvoice[]>(INITIAL_INVOICES);
  const [billingCommunications, setBillingCommunications] = useState<VendorBillingCommunication[]>(
    INITIAL_BILLING_COMMUNICATIONS,
  );
  const [billingAlerts, setBillingAlerts] = useState<VendorBillingAlert[]>(INITIAL_BILLING_ALERTS);
  const [licensePlans, setLicensePlans] = useState(() =>
    getVendorInstitutesDataset().licensePlans.map((plan) => ({ ...plan })),
  );
  const [unreadBillingAlertIds, setUnreadBillingAlertIds] = useState<string[]>(
    INITIAL_BILLING_ALERTS.map((alert) => alert.id),
  );
  const [onboardingRecords, setOnboardingRecords] = useState<VendorOnboardingRecord[]>(
    INITIAL_ONBOARDING_RECORDS,
  );
  const [unreadOnboardingIds, setUnreadOnboardingIds] = useState<string[]>(
    INITIAL_ONBOARDING_RECORDS.map((record) => record.id),
  );

  const value = useMemo<VendorLicenseRequestsContextValue>(() => {
    return {
      requests,
      openRequestCount: requests.filter(
        (request) => request.status === "pending" || request.status === "payment_required",
      ).length,
      unreadRequestIds,
      invoices,
      billingCommunications,
      billingAlerts,
      unreadBillingAlertIds,
      licensePlans,
      onboardingRecords,
      unreadOnboardingIds,
      markRequestRead: (requestId) => {
        setUnreadRequestIds((current) => current.filter((id) => id !== requestId));
      },
      markAllRequestsRead: () => {
        setUnreadRequestIds([]);
      },
      markBillingAlertRead: (alertId) => {
        setUnreadBillingAlertIds((current) => current.filter((id) => id !== alertId));
      },
      markAllBillingAlertsRead: () => {
        setUnreadBillingAlertIds([]);
      },
      updateRequestStatus: (requestId, status, decisionNote) => {
        setRequests((current) =>
          current.map((request) =>
            request.id === requestId ? { ...request, status, decisionNote } : request,
          ),
        );
        setUnreadRequestIds((current) => current.filter((id) => id !== requestId));
      },
      sendBillingCommunication: (invoiceId, type, recipient, note) => {
        const invoice = invoices.find((candidate) => candidate.id === invoiceId);
        if (!invoice) {
          return;
        }

        const createdAt = new Date().toISOString();
        setBillingCommunications((current) => [
          {
            id: `${createdAt}-${type}-${invoiceId}`,
            instituteId: invoice.instituteId,
            invoiceId,
            type,
            recipient,
            createdAt,
            status: "sent",
            initiatedBy: "vendor.current",
            note,
          },
          ...current,
        ]);
      },
      recordOfflinePayment: (invoiceId, reference) => {
        const invoice = invoices.find((candidate) => candidate.id === invoiceId);
        if (!invoice) {
          return;
        }

        const createdAt = new Date().toISOString();
        setInvoices((current) =>
          current.map((candidate) =>
            candidate.id === invoiceId
              ? { ...candidate, status: "paid", paidAt: createdAt }
              : candidate,
          ),
        );
        setBillingCommunications((current) => [
          {
            id: `${createdAt}-offline-payment-${invoiceId}`,
            instituteId: invoice.instituteId,
            invoiceId,
            type: "offline_payment",
            recipient: "Internal billing record",
            createdAt,
            status: "recorded",
            initiatedBy: "vendor.current",
            note: `Offline payment recorded. Reference: ${reference}`,
          },
          ...current,
        ]);
        setBillingAlerts((current) => current.filter((alert) => alert.invoiceId !== invoiceId));
        setUnreadBillingAlertIds((current) =>
          current.filter(
            (alertId) =>
              !billingAlerts.some((alert) => alert.id === alertId && alert.invoiceId === invoiceId),
          ),
        );
      },
      publishLicensePlan: (nextPlan) => {
        setLicensePlans((current) =>
          current.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan)),
        );
      },
      markOnboardingRead: (recordId) => {
        setUnreadOnboardingIds((current) => current.filter((id) => id !== recordId));
      },
      markAllOnboardingRead: () => {
        setUnreadOnboardingIds([]);
      },
      createOnboardingRecord: (record) => {
        setOnboardingRecords((current) => [record, ...current]);
        setUnreadOnboardingIds((current) => [record.id, ...current]);
      },
      updateOnboardingRecord: (recordId, changes, eventLabel, eventNote) => {
        const createdAt = new Date().toISOString();
        setOnboardingRecords((current) =>
          current.map((record) =>
            record.id === recordId
              ? {
                  ...record,
                  ...changes,
                  timeline: [
                    {
                      id: `${createdAt}-${recordId}`,
                      createdAt,
                      actor: "vendor.current",
                      label: eventLabel,
                      note: eventNote,
                    },
                    ...record.timeline,
                  ],
                }
              : record,
          ),
        );
        setUnreadOnboardingIds((current) => current.filter((id) => id !== recordId));
      },
    };
  }, [
    billingAlerts,
    billingCommunications,
    invoices,
    licensePlans,
    onboardingRecords,
    requests,
    unreadBillingAlertIds,
    unreadRequestIds,
    unreadOnboardingIds,
  ]);

  return (
    <VendorLicenseRequestsContext.Provider value={value}>
      {children}
    </VendorLicenseRequestsContext.Provider>
  );
}
