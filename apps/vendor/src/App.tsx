import { Suspense, lazy, useMemo, useState, type FormEvent, type ReactElement } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { useAuthProvider } from "../../../shared/services/authProvider";
import { PORTAL_MANIFEST } from "../../../shared/services/portalManifest";
import {
  getPortalDefaultAuthenticatedPath,
  getPortalLoginPath,
  getPortalRoutePrefix,
} from "../../../shared/services/portalIntegration";
import { UiNavBar, UiRouteLoading } from "../../../shared/ui/components";
import { resolveVendorAccessContext } from "./portals/vendorAccess";
import "./App.css";

interface VendorNavItem {
  path: string;
  label: string;
  summary: string;
}

const VENDOR_NAV_ITEMS: VendorNavItem[] = [
  {
    path: "/vendor/overview",
    label: "Overview",
    summary: "Executive platform snapshot using aggregated vendor metrics.",
  },
  {
    path: "/vendor/institutes",
    label: "Institutes",
    summary: "Cross-institute management and lifecycle governance.",
  },
  {
    path: "/vendor/licensing",
    label: "Licensing",
    summary: "Vendor-authoritative subscription and layer controls.",
  },
  {
    path: "/vendor/calibration",
    label: "Calibration",
    summary: "Global calibration parameters, simulation, and rollout controls.",
  },
  {
    path: "/vendor/intelligence",
    label: "Intelligence",
    summary: "Cross-institute intelligence and macro behavioral trends.",
  },
  {
    path: "/vendor/system-health",
    label: "System Health",
    summary: "Platform runtime status, cost monitoring, and operational checks.",
  },
  {
    path: "/vendor/audit",
    label: "Audit",
    summary: "Immutable vendor activity and governance events.",
  },
];

const VendorAuditActivityLogsPage = lazy(() => import("./features/audit/VendorAuditActivityLogsPage"));
const VendorCalibrationManagementPage = lazy(() => import("./features/calibration/VendorCalibrationManagementPage"));
const VendorIntelligenceDashboardPage = lazy(() => import("./features/intelligence/VendorIntelligenceDashboardPage"));
const VendorInstituteManagementPage = lazy(() => import("./features/institutes/VendorInstituteManagementPage"));
const VendorLicensingPage = lazy(() => import("./features/licensing/VendorLicensingPage"));
const VendorOverviewPage = lazy(() => import("./features/overview/VendorOverviewPage"));
const VendorSystemHealthDashboardPage = lazy(() => import("./features/system-health/VendorSystemHealthDashboardPage"));

function VendorRouteBoundary(props: { label: string; children: ReactElement }) {
  const { label, children } = props;
  return <Suspense fallback={<UiRouteLoading label={label} />}>{children}</Suspense>;
}

function resolveVendorRedirectTarget(locationState: unknown, fallbackPath: string): string {
  if (
    typeof locationState === "object" &&
    locationState !== null &&
    "from" in locationState &&
    typeof (locationState as { from?: unknown }).from === "string"
  ) {
    const fromPath = String((locationState as { from: string }).from);
    if (fromPath.startsWith("/vendor/")) {
      return fromPath;
    }
  }

  return fallbackPath;
}

function VendorLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, clearError } = useAuthProvider();
  const [email, setEmail] = useState("vendor.test@parabolic.local");
  const [password, setPassword] = useState("Parabolic#Test115");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const signedIn = await signIn({ email, password });
    if (signedIn) {
      const nextTarget = resolveVendorRedirectTarget(location.state, protectedPath);
      navigate(nextTarget, { replace: true });
    }
  }

  if (session.status === "authenticated") {
    return <Navigate replace to={resolveVendorRedirectTarget(location.state, protectedPath)} />;
  }

  return (
    <main className="vendor-page-shell vendor-page-shell-login">
      <section className="vendor-login-card" aria-labelledby="vendor-login-title">
        <p className="vendor-content-eyebrow">Build 136</p>
        <h1 id="vendor-login-title">Vendor Login</h1>
        <p className="vendor-content-copy">
          Vendor-only sign-in route for the global platform control surface.
        </p>
        <form className="vendor-login-form" onSubmit={handleSubmit}>
          <label htmlFor="vendor-login-email">Email</label>
          <input
            id="vendor-login-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />

          <label htmlFor="vendor-login-password">Password</label>
          <input
            id="vendor-login-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />

          <button type="submit">Login</button>
        </form>

        {session.error ? <p className="vendor-login-error" role="alert">{session.error}</p> : null}

        <p className="vendor-login-meta">
          Login route: <code>{loginPath}</code>
        </p>
      </section>
    </main>
  );
}

function VendorUnauthorizedPage() {
  return (
    <main className="vendor-page-shell vendor-page-shell-login">
      <section className="vendor-login-card" aria-labelledby="vendor-unauthorized-title">
        <p className="vendor-content-eyebrow">Access Guard</p>
        <h1 id="vendor-unauthorized-title">Vendor role required</h1>
        <p className="vendor-content-copy">
          This portal is restricted to authenticated users with the <code>vendor</code> role claim.
        </p>
      </section>
    </main>
  );
}

function VendorProtectedRoute(props: {
  loginPath: string;
  children: ReactElement;
}) {
  const { loginPath, children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="vendor-page-shell vendor-page-shell-login">
        <section className="vendor-login-card" aria-labelledby="vendor-loading-title">
          <p className="vendor-content-eyebrow">Build 136</p>
          <h1 id="vendor-loading-title">Checking session</h1>
          <p className="vendor-content-copy">Restoring authentication context for vendor routes.</p>
        </section>
      </main>
    );
  }

  if (session.status !== "authenticated") {
    return (
      <Navigate
        replace
        to={loginPath}
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return children;
}

function VendorRoleGuard(props: { children: ReactElement }) {
  const { children } = props;
  const { session } = useAuthProvider();
  const accessContext = resolveVendorAccessContext(session);

  if (!accessContext.isVendor) {
    return <Navigate replace to="/unauthorized" />;
  }

  return children;
}

function VendorLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuthProvider();

  const activeItem = useMemo(() => {
    return VENDOR_NAV_ITEMS.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  }, [location.pathname]);
  const navBarItems = useMemo(() => {
    return VENDOR_NAV_ITEMS.map((item) => ({
      id: item.path,
      label: item.label,
      hint: item.summary,
      onClick: () => navigate(item.path),
    }));
  }, [navigate]);

  const portal = PORTAL_MANIFEST.vendor;

  return (
    <main className="vendor-page-shell">
      <header className="vendor-topbar" aria-label="Vendor top header bar">
        <div>
          <p className="vendor-topbar-eyebrow">{portal.domain}</p>
          <h1>Vendor Portal</h1>
          <p className="vendor-topbar-path">{location.pathname}</p>
        </div>

        <UiNavBar
          title="Vendor Routes"
          subtitle="Global administration"
          activeItemId={activeItem?.path}
          items={navBarItems}
        />

        <button
          type="button"
          className="vendor-signout-button"
          onClick={() => {
            void signOut();
          }}
          disabled={session.status !== "authenticated"}
        >
          Sign out
        </button>
      </header>

      <div className="vendor-layout-grid">
        <aside className="vendor-sidebar" aria-label="Vendor sidebar navigation">
          <p className="vendor-content-eyebrow">Primary Navigation</p>
          <h2>{activeItem?.label ?? "Vendor"}</h2>
          <p className="vendor-sidebar-copy">
            {activeItem?.summary ?? "Vendor dashboard sections for platform-wide operations."}
          </p>
          <ul className="vendor-sidebar-list">
            {VENDOR_NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "vendor-sidebar-link vendor-sidebar-link-active" : "vendor-sidebar-link"
                  }
                >
                  <strong>{item.label}</strong>
                  <small>{item.summary}</small>
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="vendor-content-note">
            Collection boundary: vendor views consume global summary collections and do not query institute
            session collections.
          </p>
        </aside>

        <section className="vendor-main-content" aria-label="Vendor main content container">
          <Outlet />
        </section>
      </div>
    </main>
  );
}

function App() {
  usePortalTitle("vendor");

  const basePath = getPortalRoutePrefix("vendor");
  const loginPath = getPortalLoginPath("vendor");
  const protectedDefaultPath = getPortalDefaultAuthenticatedPath("vendor");

  return (
    <Routes>
      <Route path="/" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path={basePath} element={<Navigate to={protectedDefaultPath} replace />} />
      <Route
        path={loginPath}
        element={<VendorLoginPage loginPath={loginPath} protectedPath={protectedDefaultPath} />}
      />
      <Route path="/unauthorized" element={<VendorUnauthorizedPage />} />

      <Route
        path={basePath}
        element={(
          <VendorProtectedRoute loginPath={loginPath}>
            <VendorRoleGuard>
              <VendorLayout />
            </VendorRoleGuard>
          </VendorProtectedRoute>
        )}
      >
        <Route path="overview" element={<VendorRouteBoundary label="Loading overview"><VendorOverviewPage /></VendorRouteBoundary>} />
        <Route
          path="institutes"
          element={<VendorRouteBoundary label="Loading institutes"><VendorInstituteManagementPage /></VendorRouteBoundary>}
        />
        <Route
          path="licensing"
          element={<VendorRouteBoundary label="Loading licensing"><VendorLicensingPage /></VendorRouteBoundary>}
        />
        <Route
          path="calibration"
          element={<VendorRouteBoundary label="Loading calibration"><VendorCalibrationManagementPage /></VendorRouteBoundary>}
        />
        <Route
          path="intelligence"
          element={<VendorRouteBoundary label="Loading intelligence"><VendorIntelligenceDashboardPage /></VendorRouteBoundary>}
        />
        <Route
          path="system-health"
          element={<VendorRouteBoundary label="Loading system health"><VendorSystemHealthDashboardPage /></VendorRouteBoundary>}
        />
        <Route
          path="audit"
          element={<VendorRouteBoundary label="Loading audit"><VendorAuditActivityLogsPage /></VendorRouteBoundary>}
        />
        <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
      </Route>

      <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
    </Routes>
  );
}

export default App;
