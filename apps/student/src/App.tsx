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
import { useGlobalPortalState } from "../../../shared/services/globalPortalState";
import {
  getPortalDefaultAuthenticatedPath,
  getPortalLoginPath,
  getPortalRoutePrefix,
} from "../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../shared/types/portalRouting";
import {
  STUDENT_PRIMARY_NAVIGATION,
  findActivePortalNavigationItem,
} from "../../../shared/ui/portalConsistency";
import { UiRouteLoading } from "../../../shared/ui/components";
import "./App.css";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

const StudentDashboardPage = lazy(() => import("./features/dashboard/StudentDashboardPage"));
const StudentDisciplinePage = lazy(() => import("./features/discipline/StudentDisciplinePage"));
const StudentInsightsPage = lazy(() => import("./features/insights/StudentInsightsPage"));
const StudentMyTestsPage = lazy(() => import("./features/my-tests/StudentMyTestsPage"));
const StudentPerformancePage = lazy(() => import("./features/performance/StudentPerformancePage"));
const StudentProfileSettingsPage = lazy(() => import("./features/profile/StudentProfileSettingsPage"));

function StudentRouteBoundary(props: { label: string; children: ReactElement }) {
  const { label, children } = props;
  return <Suspense fallback={<UiRouteLoading label={label} />}>{children}</Suspense>;
}

function StudentLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, clearError } = useAuthProvider();
  const [email, setEmail] = useState("student@parabolic.local");
  const [password, setPassword] = useState("demo-password");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const signedIn = await signIn({ email, password });
    if (signedIn) {
      const nextTarget =
        typeof location.state === "object" && location.state !== null && "from" in location.state ?
          String((location.state as { from?: string }).from ?? protectedPath) :
          protectedPath;

      navigate(nextTarget, { replace: true });
    }
  }

  if (session.status === "authenticated") {
    return <Navigate replace to={protectedPath} />;
  }

  return (
    <main className="student-page-shell student-page-shell-login">
      <section className="student-login-card" aria-labelledby="student-login-title">
        <p className="student-content-eyebrow">Build 126</p>
        <h1 id="student-login-title">Student Login</h1>
        <p className="student-content-copy">
          Sign in through Firebase Authentication to access protected student routes.
        </p>
        <form className="student-login-form" onSubmit={handleSubmit}>
          <label htmlFor="student-login-email">Email</label>
          <input
            id="student-login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="student-login-password">Password</label>
          <input
            id="student-login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button type="submit">Login</button>
        </form>
        {session.error ? <p className="student-login-error" role="alert">{session.error}</p> : null}
        <p className="student-login-meta">
          Protected route: <code>{protectedPath}</code>
        </p>
        <p className="student-login-meta">
          Login route: <code>{loginPath}</code>
        </p>
      </section>
    </main>
  );
}

function StudentProtectedRoute(props: {
  loginPath: string;
  children: ReactElement;
}) {
  const { loginPath, children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="student-page-shell student-page-shell-login">
        <section className="student-login-card" aria-labelledby="student-loading-title">
          <p className="student-content-eyebrow">Build 126</p>
          <h1 id="student-loading-title">Checking session</h1>
          <p className="student-content-copy">Restoring Firebase authentication state.</p>
        </section>
      </main>
    );
  }

  if (session.status !== "authenticated") {
    return <Navigate replace to={loginPath} state={{ from: location.pathname }} />;
  }

  return children;
}

function StudentLayout() {
  const location = useLocation();
  const { session, signOut } = useAuthProvider();
  const globalState = useGlobalPortalState();
  const activeLicenseLayer = globalState.licenseLayer ?? "L0";

  const visibleNavItems = useMemo(() => {
    return STUDENT_PRIMARY_NAVIGATION.filter((item) => {
      if (!item.minimumLicenseLayer) {
        return true;
      }

      return LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER[item.minimumLicenseLayer];
    });
  }, [activeLicenseLayer]);
  const activeRoute = findActivePortalNavigationItem(STUDENT_PRIMARY_NAVIGATION, location.pathname);
  const activeRouteLabel = activeRoute?.label ?? "Student";
  const activeRouteSummary = activeRoute?.summary ?? "Student route selection and contextual section guidance.";

  return (
    <main className="student-page-shell">
      <div className="student-layout-grid">
        <aside className="student-sidebar" aria-label="Student sidebar menu">
          <div className="student-sidebar-header">
            <div className="student-sidebar-brand">
              <p className="student-sidebar-eyebrow">Parabolic Platform</p>
              <h1>Student Portal</h1>
              <p className="student-sidebar-copy">
                Dedicated learner workspaces with summary-only progress and route-aware access.
              </p>
              <div className="student-sidebar-meta">
                <p className="student-sidebar-path" title={location.pathname}>{location.pathname}</p>
                <div className="student-sidebar-session">
                  <span>Status: {session.status}</span>
                  {globalState.role ? <span>Role: {globalState.role}</span> : null}
                  <span>Layer: {activeLicenseLayer}</span>
                </div>
                <button
                  type="button"
                  className="student-signout-button student-sidebar-signout-button"
                  onClick={() => {
                    void signOut();
                  }}
                  disabled={session.status !== "authenticated"}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>

          <div className="student-sidebar-body">
            <div className="student-sidebar-nav-scroll">
              <nav className="student-sidebar-nav" aria-label="Student navigation">
                <section className="student-sidebar-section" aria-labelledby="student-nav-section-main">
                  <div className="student-sidebar-section-header">
                    <h2 id="student-nav-section-main">Routes</h2>
                  </div>
                  <div className="student-sidebar-section-items">
                    {visibleNavItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          isActive ?
                            "student-sidebar-link student-sidebar-link-active" :
                            "student-sidebar-link"
                        }
                      >
                        <span className="student-sidebar-link-badge" aria-hidden="true">
                          {item.label
                            .split(" ")
                            .map((part) => part[0] ?? "")
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="student-sidebar-link-copy">
                          <span className="student-sidebar-link-label">{item.label}</span>
                          <small>{item.summary}</small>
                        </span>
                        <span
                          className="student-sidebar-link-indicator"
                          aria-hidden="true"
                          data-active={item.path === activeRoute?.path ? "true" : "false"}
                        />
                      </NavLink>
                    ))}
                  </div>
                </section>
              </nav>
            </div>
            <div className="student-sidebar-guidance">
              <p className="student-content-note">
                Data flow: Session Submitted to runAnalytics updated to studentYearMetrics updated to Student
                Portal summary refresh.
              </p>
              <p className="student-content-note">
                Summary-only contract: student routes accept summary resources only and reject raw session logs,
                per-question timestamps, and raw answer arrays at payload validation.
              </p>
              <p className="student-content-note">
                Terminology standard: display only Raw Score % and Accuracy %. Score, Total Marks, and
                cumulative raw marks are not shown.
              </p>
              {LICENSE_LAYER_ORDER[activeLicenseLayer] < LICENSE_LAYER_ORDER.L1 ? (
            <p className="student-content-note">
              Insights unlock at L1+ license layer. Upgrade path remains backend-authoritative.
            </p>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="student-main-content" aria-label="Student main dashboard container">
          <section className="student-workspace-header" aria-label="Student workspace context">
            <div className="student-workspace-title-block">
              <p className="student-content-eyebrow">Student Workspace</p>
              <h2>{activeRouteLabel}</h2>
              <p>{activeRouteSummary}</p>
            </div>
            <div className="student-workspace-context-grid">
              <article>
                <p>Route</p>
                <h3>{location.pathname}</h3>
                <small>Dedicated student section</small>
              </article>
              <article>
                <p>Data Boundary</p>
                <h3>Summary Only</h3>
                <small>studentYearMetrics, runAnalytics, assigned-run summaries</small>
              </article>
              <article>
                <p>Access</p>
                <h3>{activeLicenseLayer}</h3>
                <small>{globalState.role ?? "student"} navigation is layer-aware</small>
              </article>
            </div>
          </section>
          <Outlet />
        </section>
      </div>
    </main>
  );
}

function StudentLicenseRoute(props: {
  minimumLicenseLayer: LicenseLayer;
  fallbackPath: string;
  children: ReactElement;
}) {
  const { minimumLicenseLayer, fallbackPath, children } = props;
  const globalState = useGlobalPortalState();
  const location = useLocation();

  const activeLicenseLayer = globalState.licenseLayer ?? "L0";
  const hasAccess = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER[minimumLicenseLayer];

  if (!hasAccess) {
    return <Navigate replace to={fallbackPath} state={{ from: location.pathname }} />;
  }

  return children;
}

function App() {
  usePortalTitle("student");

  const basePath = getPortalRoutePrefix("student");
  const loginPath = getPortalLoginPath("student");
  const protectedDefaultPath = getPortalDefaultAuthenticatedPath("student");

  return (
    <Routes>
      <Route path="/" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path={basePath} element={<Navigate to={protectedDefaultPath} replace />} />
      <Route
        path={loginPath}
        element={<StudentLoginPage loginPath={loginPath} protectedPath={protectedDefaultPath} />}
      />
      <Route
        path={basePath}
        element={(
          <StudentProtectedRoute loginPath={loginPath}>
            <StudentLayout />
          </StudentProtectedRoute>
        )}
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<StudentRouteBoundary label="Loading dashboard"><StudentDashboardPage /></StudentRouteBoundary>} />
        <Route path="my-tests" element={<StudentRouteBoundary label="Loading tests"><StudentMyTestsPage /></StudentRouteBoundary>} />
        <Route path="performance" element={<StudentRouteBoundary label="Loading performance"><StudentPerformancePage /></StudentRouteBoundary>} />
        <Route
          path="insights"
          element={(
            <StudentLicenseRoute minimumLicenseLayer="L1" fallbackPath="/student/dashboard">
              <StudentRouteBoundary label="Loading insights">
                <StudentInsightsPage />
              </StudentRouteBoundary>
            </StudentLicenseRoute>
          )}
        />
        <Route
          path="discipline"
          element={(
            <StudentLicenseRoute minimumLicenseLayer="L2" fallbackPath="/student/dashboard">
              <StudentRouteBoundary label="Loading discipline">
                <StudentDisciplinePage />
              </StudentRouteBoundary>
            </StudentLicenseRoute>
          )}
        />
        <Route path="profile" element={<StudentRouteBoundary label="Loading profile"><StudentProfileSettingsPage /></StudentRouteBoundary>} />
      </Route>
      <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
    </Routes>
  );
}

export default App;
