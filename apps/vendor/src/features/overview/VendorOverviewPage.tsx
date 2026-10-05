import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorOverviewAuthorityPage from "./VendorOverviewAuthorityPage";

const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorOverviewPage")) : null;
function VendorOverviewPage() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorOverviewAuthorityPage />;
}
export default VendorOverviewPage;
