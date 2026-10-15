import { createContext, useContext } from "react";
import type { VendorLicenseRequestsContextValue } from "./vendorLicenseRequestsStore";

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
