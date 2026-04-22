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
import { UiNavBar, UiRouteLoading } from "../../../shared/ui/components";
import {
  ADMIN_ROUTE_DEFINITIONS,
  evaluateAdminRoutePermissions,
  getVisibleAdminRoutes,
  matchAdminRoute,
} from "./portals/adminRoutes";
import { resolveAdminAccessContext } from "./portals/adminAccess";
import "./App.css";

interface AdminNavItem {
  path: string;
  label: string;
  summary: string;
}

function resolveAdminRedirectTarget(locationState: unknown, fallbackPath: string): string {
  if (
    typeof locationState === "object" &&
    locationState !== null &&
    "from" in locationState &&
    typeof (locationState as { from?: unknown }).from === "string"
  ) {
    const fromPath = String((locationState as { from: string }).from);
    if (fromPath.startsWith("/admin/")) {
      return fromPath;
    }
  }

  return fallbackPath;
}

const ADMIN_NAV_PATH_ORDER = [
  "/admin/overview",
  "/admin/students",
  "/admin/question-bank",
  "/admin/tests",
  "/admin/assignments",
  "/admin/analytics",
  "/admin/insights",
  "/admin/governance",
  "/admin/licensing",
  "/admin/settings",
] as const;

const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_PATH_ORDER.map((path) => {
  const definition = ADMIN_ROUTE_DEFINITIONS.find((route) => route.path === path);
  return {
    path,
    label: definition?.title ?? path,
    summary: definition?.description ?? "Admin route",
  };
});

const AdminAnalyticsDashboardPage = lazy(() => import("./features/analytics/AdminAnalyticsDashboardPage"));
const BatchAnalyticsDashboardPage = lazy(() => import("./features/analytics/BatchAnalyticsDashboardPage"));
const GovernanceMonitoringDashboardPage = lazy(() => import("./features/analytics/GovernanceMonitoringDashboardPage"));
const RiskInsightsDashboardPage = lazy(() => import("./features/analytics/RiskInsightsDashboardPage"));
const AssignmentManagementPage = lazy(() => import("./features/assignments/AssignmentManagementPage"));
const InterventionToolsPage = lazy(() => import("./features/insights/InterventionToolsPage"));
const AdminLicensingConfigurationPage = lazy(() => import("./features/licensing/AdminLicensingConfigurationPage"));
const AdminOverviewPage = lazy(() => import("./features/overview/AdminOverviewPage"));
const AdminSettingsConfigurationPage = lazy(() => import("./features/settings/AdminSettingsConfigurationPage"));
const StudentManagementPage = lazy(() => import("./features/students/StudentManagementPage"));
const QuestionBankManagementPage = lazy(() => import("./features/tests/QuestionBankManagementPage"));
const TestTemplateManagementPage = lazy(() => import("./features/tests/TestTemplateManagementPage"));

function AdminRouteBoundary(props: { label: string; children: ReactElement }) {
  const { label, children } = props;
  return <Suspense fallback={<UiRouteLoading label={label} />}>{children}</Suspense>;
}

function NotFoundPage() {
  return (
    <main className="admin-page-shell">
      <section className="admin-content-card" aria-labelledby="admin-not-found-title">
        <p className="admin-content-eyebrow">Route Not Found</p>
        <h1 id="admin-not-found-title">Unknown admin route</h1>
        <p className="admin-content-copy">
          The requested path is outside the Build 116 admin navigation scope. Use the sidebar routes under
          <code> /admin/*</code>
          .
        </p>
        <NavLink className="admin-primary-link" to="/admin/overview">
          Go to /admin/overview
        </NavLink>
      </section>
    </main>
  );
}

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const visibleRoutes = useMemo(() => {
    return getVisibleAdminRoutes(accessContext.role, accessContext.licenseLayer);
  }, [accessContext.licenseLayer, accessContext.role]);
  const visibleNavItems = useMemo(() => {
    return ADMIN_NAV_ITEMS.filter((item) => visibleRoutes.some((route) => route.path === item.path));
  }, [visibleRoutes]);

  const activeItem = useMemo(() => {
    return visibleNavItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  }, [location.pathname, visibleNavItems]);
  const navItems = useMemo(() => {
    return visibleNavItems.map((item) => ({
      id: item.path,
      label: item.label,
      hint: item.summary,
      onClick: () => navigate(item.path),
    }));
  }, [navigate, visibleNavItems]);

  return (
    <main className="admin-page-shell">
      <div className="admin-layout-grid">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <UiNavBar
            title="Admin Dashboard"
            subtitle="Institute operations navigation"
            activeItemId={activeItem?.path}
            items={navItems}
          />
        </aside>

        <div className="admin-main-area">
          <header className="admin-topbar">
            <div>
              <p className="admin-topbar-eyebrow">Current Route</p>
              <h2>{activeItem?.label ?? "Admin"}</h2>
              <p className="admin-topbar-path">{location.pathname}</p>
            </div>
            <div className="admin-session-pill">
              <span>Status: {session.status}</span>
              <button
                type="button"
                className="admin-signout-button"
                onClick={() => {
                  void signOut();
                }}
                disabled={session.status !== "authenticated"}
              >
                Sign out
              </button>
            </div>
          </header>

          <section className="admin-content-container">
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}

function AdminLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, clearError } = useAuthProvider();
  const [email, setEmail] = useState("admin@parabolic.local");
  const [password, setPassword] = useState("demo-password");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const signedIn = await signIn({ email, password });
    if (!signedIn) {
      return;
    }

    const nextTarget = resolveAdminRedirectTarget(location.state, protectedPath);
    navigate(nextTarget, { replace: true });
  }

  if (session.status === "authenticated") {
    return <Navigate replace to={resolveAdminRedirectTarget(location.state, protectedPath)} />;
  }

  return (
    <main className="admin-page-shell admin-page-shell-login">
      <section className="admin-content-card admin-login-card" aria-labelledby="admin-login-title">
        <p className="admin-content-eyebrow">Build 116</p>
        <h1 id="admin-login-title">Admin Login</h1>
        <p className="admin-content-copy">
          Sign in to access protected admin routes.
        </p>
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-login-email">Email</label>
          <input
            id="admin-login-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <label htmlFor="admin-login-password">Password</label>
          <input
            id="admin-login-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <button type="submit" className="admin-primary-link">Login</button>
        </form>
        {session.error ? <p className="admin-tests-inline-error" role="alert">{session.error}</p> : null}
        <p className="admin-login-meta">Login route: <code>{loginPath}</code></p>
      </section>
    </main>
  );
}

function AdminProtectedRoute(props: { loginPath: string; children: ReactElement }) {
  const { loginPath, children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="admin-page-shell admin-page-shell-login">
        <section className="admin-content-card admin-login-card" aria-labelledby="admin-loading-title">
          <p className="admin-content-eyebrow">Build 116</p>
          <h1 id="admin-loading-title">Checking session</h1>
          <p className="admin-content-copy">Restoring Firebase authentication state.</p>
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

function AdminRouteAccessGuard(props: { children: ReactElement }) {
  const { children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const matchedRoute = matchAdminRoute(location.pathname);

  if (matchedRoute) {
    const accessDecision = evaluateAdminRoutePermissions(
      matchedRoute,
      accessContext.role,
      accessContext.licenseLayer,
    );

    if (!accessDecision.allowed) {
      return <Navigate replace to={accessDecision.redirectTo ?? "/unauthorized"} />;
    }
  }

  return children;
}

function App() {
  usePortalTitle("admin");
  const loginPath = "/login";
  const protectedDefaultPath = "/admin/overview";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path="/admin" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route
        path={loginPath}
        element={<AdminLoginPage loginPath={loginPath} protectedPath={protectedDefaultPath} />}
      />

      <Route
        path="/admin"
        element={(
          <AdminProtectedRoute loginPath={loginPath}>
            <AdminRouteAccessGuard>
              <AdminLayout />
            </AdminRouteAccessGuard>
          </AdminProtectedRoute>
        )}
      >
        <Route
          path="overview"
          element={<AdminRouteBoundary label="Loading overview"><AdminOverviewPage /></AdminRouteBoundary>}
        />
        <Route
          path="students"
          element={<AdminRouteBoundary label="Loading students"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank"
          element={<AdminRouteBoundary label="Loading question bank"><QuestionBankManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests"
          element={<AdminRouteBoundary label="Loading tests"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments"
          element={<AdminRouteBoundary label="Loading assignments"><AssignmentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics"
          element={<AdminRouteBoundary label="Loading analytics"><AdminAnalyticsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/risk-insights"
          element={<AdminRouteBoundary label="Loading risk insights"><RiskInsightsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/batch"
          element={<AdminRouteBoundary label="Loading batch analytics"><BatchAnalyticsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance"
          element={<AdminRouteBoundary label="Loading governance"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/interventions"
          element={<AdminRouteBoundary label="Loading interventions"><InterventionToolsPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/patterns"
          element={<AdminRouteBoundary label="Loading insight patterns"><RiskInsightsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/execution"
          element={<AdminRouteBoundary label="Loading execution insights"><RiskInsightsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/risk"
          element={<AdminRouteBoundary label="Loading risk insights"><RiskInsightsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights"
          element={<Navigate to="/admin/insights/risk" replace />}
        />
        <Route
          path="licensing"
          element={<Navigate to="/admin/licensing/current" replace />}
        />
        <Route
          path="licensing/current"
          element={<AdminRouteBoundary label="Loading licensing"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/features"
          element={<AdminRouteBoundary label="Loading feature matrix"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/eligibility"
          element={<AdminRouteBoundary label="Loading eligibility"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/usage"
          element={<AdminRouteBoundary label="Loading usage"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/upgrade-preview"
          element={<AdminRouteBoundary label="Loading upgrade preview"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/history"
          element={<AdminRouteBoundary label="Loading license history"><AdminLicensingConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings"
          element={<Navigate to="/admin/settings/profile" replace />}
        />
        <Route
          path="settings/profile"
          element={<AdminRouteBoundary label="Loading settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/academic-year"
          element={<AdminRouteBoundary label="Loading academic year settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/execution-policy"
          element={<AdminRouteBoundary label="Loading execution policy"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/users"
          element={<AdminRouteBoundary label="Loading user settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/security"
          element={<AdminRouteBoundary label="Loading security settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/data"
          element={<AdminRouteBoundary label="Loading data settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/system"
          element={<AdminRouteBoundary label="Loading system settings"><AdminSettingsConfigurationPage /></AdminRouteBoundary>}
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
