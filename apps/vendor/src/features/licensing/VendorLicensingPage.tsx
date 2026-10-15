import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorCommercialAuthorityPage from "./VendorCommercialAuthorityPage";
const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorLicensingPage")) : null;
export default function VendorLicensingPage() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorCommercialAuthorityPage />;
}
