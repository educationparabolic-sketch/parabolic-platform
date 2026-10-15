import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorInstituteAuthorityPage from "./VendorInstituteAuthorityPage";
const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorInstituteManagementPage")) : null;
export default function VendorInstituteManagementPage() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorInstituteAuthorityPage />;
}
