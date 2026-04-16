import { useState, type FormEvent, type ReactElement } from "react";
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
import AdminAnalyticsDashboardPage from "./features/analytics/AdminAnalyticsDashboardPage";
import BatchAnalyticsDashboardPage from "./features/analytics/BatchAnalyticsDashboardPage";
import GovernanceMonitoringDashboardPage from "./features/analytics/GovernanceMonitoringDashboardPage";
import RiskInsightsDashboardPage from "./features/analytics/RiskInsightsDashboardPage";
import AssignmentManagementPage from "./features/assignments/AssignmentManagementPage";
import InterventionToolsPage from "./features/insights/InterventionToolsPage";
import AdminSettingsConfigurationPage from "./features/settings/AdminSettingsConfigurationPage";
import StudentManagementPage from "./features/students/StudentManagementPage";
import TestTemplateManagementPage from "./features/tests/TestTemplateManagementPage";
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

interface AdminSectionPageProps {
  title: string;
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
  "/admin/tests",
  "/admin/assignments",
  "/admin/analytics",
  "/admin/governance",
  "/admin/insights/risk",
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

function AdminSectionPage({ title, summary }: AdminSectionPageProps) {
  return (
    <section className="admin-content-card" aria-labelledby="admin-content-title">
      <p className="admin-content-eyebrow">Admin Portal</p>
      <h2 id="admin-content-title">{title}</h2>
      <p className="admin-content-copy">{summary}</p>
      <p className="admin-content-note">
        Build 116 establishes layout, navigation, and route-based rendering for this section.
      </p>
    </section>
  );
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
  const { session, signOut } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const visibleRoutes = getVisibleAdminRoutes(accessContext.role, accessContext.licenseLayer);
  const visibleNavItems = ADMIN_NAV_ITEMS.filter((item) => visibleRoutes.some((route) => route.path === item.path));

  const activeItem = visibleNavItems.find((item) =>
    location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  );

  return (
    <main className="admin-page-shell">
      <div className="admin-layout-grid">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar-header">
            <p className="admin-sidebar-eyebrow">Portal</p>
            <h1>Admin Dashboard</h1>
            <p className="admin-sidebar-copy">Institute operations navigation</p>
          </div>
          <nav>
            <ul className="admin-nav-list">
              {visibleNavItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      isActive ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"
                    }
                  >
                    <span>{item.label}</span>
                    <small>{item.summary}</small>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
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
          element={
            <AdminSectionPage
              title="Overview"
              summary="Track operational status, activity, and summary insights for your institute from the admin portal landing page."
            />
          }
        />
        <Route
          path="students"
          element={<StudentManagementPage />}
        />
        <Route
          path="tests"
          element={<TestTemplateManagementPage />}
        />
        <Route
          path="assignments"
          element={<AssignmentManagementPage />}
        />
        <Route
          path="analytics"
          element={<AdminAnalyticsDashboardPage />}
        />
        <Route
          path="analytics/risk-insights"
          element={<RiskInsightsDashboardPage />}
        />
        <Route
          path="analytics/batch"
          element={<BatchAnalyticsDashboardPage />}
        />
        <Route
          path="governance"
          element={<GovernanceMonitoringDashboardPage />}
        />
        <Route
          path="insights/interventions"
          element={<InterventionToolsPage />}
        />
        <Route
          path="insights/risk"
          element={<RiskInsightsDashboardPage />}
        />
        <Route
          path="insights"
          element={<Navigate to="/admin/insights/risk" replace />}
        />
        <Route
          path="settings"
          element={<Navigate to="/admin/settings/profile" replace />}
        />
        <Route
          path="settings/profile"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/academic-year"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/execution-policy"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/users"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/security"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/data"
          element={<AdminSettingsConfigurationPage />}
        />
        <Route
          path="settings/system"
          element={<AdminSettingsConfigurationPage />}
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
