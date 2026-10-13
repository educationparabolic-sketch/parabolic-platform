import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorSystemHealthAuthorityPage from "./VendorSystemHealthAuthorityPage";

const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorSystemHealthDashboardPage")) : null;
function Page() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorSystemHealthAuthorityPage />;
}
export default Page;
