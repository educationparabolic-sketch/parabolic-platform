import { lazy, Suspense, type ReactNode } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import { VendorLicenseRequestsContext } from "./vendorLicenseRequestsContextCore";
import type { VendorLicenseRequestsContextValue } from "./vendorLicenseRequestsStore";
const FixtureProvider = import.meta.env.DEV ? lazy(() => import("./FixtureVendorLicenseRequestsProvider")) : null;
const unavailable = () => { /* No local business authority is available in live mode. */ };
const live: VendorLicenseRequestsContextValue = {
  requests: [], openRequestCount: 0, unreadRequestIds: [], invoices: [], billingCommunications: [], billingAlerts: [],
  unreadBillingAlertIds: [], licensePlans: [], onboardingRecords: [], unreadOnboardingIds: [],
  markRequestRead: unavailable, markAllRequestsRead: unavailable, markBillingAlertRead: unavailable,
  markAllBillingAlertsRead: unavailable, updateRequestStatus: unavailable, sendBillingCommunication: unavailable,
  recordOfflinePayment: unavailable, publishLicensePlan: unavailable, markOnboardingRead: unavailable,
  markAllOnboardingRead: unavailable, createOnboardingRecord: unavailable, updateOnboardingRecord: unavailable,
};
export function VendorLicenseRequestsProvider({ children }: { children: ReactNode }) {
  return FixtureProvider && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture provider</p>}><FixtureProvider>{children}</FixtureProvider></Suspense>
    : <VendorLicenseRequestsContext.Provider value={live}>{children}</VendorLicenseRequestsContext.Provider>;
}
