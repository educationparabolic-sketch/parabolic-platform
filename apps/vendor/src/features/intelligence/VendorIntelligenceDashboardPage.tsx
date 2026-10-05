import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorIntelligenceAuthorityPage from "./VendorIntelligenceAuthorityPage";

const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorIntelligenceDashboardPage")) : null;
function VendorIntelligenceDashboardPage() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorIntelligenceAuthorityPage />;
}
export default VendorIntelligenceDashboardPage;
