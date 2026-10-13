import { lazy, Suspense } from "react";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import VendorAuditAuthorityPage from "./VendorAuditAuthorityPage";

const FixturePage = import.meta.env.DEV ? lazy(() => import("./FixtureVendorUnifiedAuditWorkspace")) : null;
function Page() {
  return FixturePage && shouldUseFixtureData()
    ? <Suspense fallback={<p>Loading fixture showcase</p>}><FixturePage /></Suspense>
    : <VendorAuditAuthorityPage />;
}
export default Page;
