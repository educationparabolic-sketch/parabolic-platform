import { Suspense, lazy, useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
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
import { isStudentDebugMode } from "./services/studentDebugMode";
import "./App.css";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

const STUDENT_SIDEBAR_STORAGE_KEY = "student-sidebar-collapsed";

function studentLivePhotoStorageKey(email: string): string {
  return `student-live-photo:${email.toLowerCase()}`;
}

const StudentDashboardPage = lazy(() => import("./features/dashboard/StudentDashboardPage"));
const StudentMyTestsPage = lazy(() => import("./features/my-tests/StudentMyTestsPage"));
const StudentPerformancePage = lazy(() => import("./features/performance/StudentPerformancePage"));
const StudentProfileSettingsPage = lazy(() => import("./features/profile/StudentProfileSettingsPage"));

function StudentRouteBoundary(props: { label: string; children: ReactElement }) {
  const { label, children } = props;
  return <Suspense fallback={<UiRouteLoading label={label} />}>{children}</Suspense>;
}

function StudentLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const debugMode = isStudentDebugMode();
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
        {debugMode ? <p className="student-content-eyebrow">Build 126</p> : null}
        <h1 id="student-login-title">Student Login</h1>
        <p className="student-content-copy">
          Sign in to continue to your student workspace.
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
        {debugMode ? (
          <>
            <p className="student-login-meta">
              Protected route: <code>{protectedPath}</code>
            </p>
            <p className="student-login-meta">
              Login route: <code>{loginPath}</code>
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}

function StudentProtectedRoute(props: {
  loginPath: string;
  children: ReactElement;
}) {
  const { loginPath, children } = props;
  const debugMode = isStudentDebugMode();
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="student-page-shell student-page-shell-login">
        <section className="student-login-card" aria-labelledby="student-loading-title">
          {debugMode ? <p className="student-content-eyebrow">Build 126</p> : null}
          <h1 id="student-loading-title">Checking session</h1>
          <p className="student-content-copy">Getting your workspace ready.</p>
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
  const debugMode = isStudentDebugMode();
  const activeLicenseLayer = globalState.licenseLayer ?? "L0";
  const [pageScrolled, setPageScrolled] = useState(false);
  const [hasLivePhoto, setHasLivePhoto] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(STUDENT_SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    function handleScroll() {
      setPageScrolled(window.scrollY > 72);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STUDENT_SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Best-effort preference persistence only.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const email = session.user?.email;
    if (!email) {
      setHasLivePhoto(true);
      return;
    }

    try {
      setHasLivePhoto(Boolean(window.localStorage.getItem(studentLivePhotoStorageKey(email))));
    } catch {
      setHasLivePhoto(true);
    }
  }, [location.pathname, session.user?.email]);

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
  const activeRouteSummary = activeRoute?.summary ?? "Your student workspace.";

  return (
    <main className="student-page-shell">
      <div className={`student-layout-grid${sidebarCollapsed ? " student-layout-grid-collapsed" : ""}`}>
        <aside className={`student-sidebar${sidebarCollapsed ? " student-sidebar-collapsed" : ""}`} aria-label="Student sidebar menu">
          <div className="student-sidebar-header">
            <div className="student-sidebar-brand">
              <p className="student-sidebar-eyebrow">Parabolic Platform</p>
              <h1>Student Portal</h1>
              {!sidebarCollapsed ? (
                <>
                  <p className="student-sidebar-copy">
                    Your test progress, insights, and practice review in one calm workspace.
                  </p>
                  {debugMode ? (
                    <div className="student-sidebar-meta">
                      <p className="student-sidebar-path" title={location.pathname}>{location.pathname}</p>
                      <div className="student-sidebar-session">
                        <span>Status: {session.status}</span>
                        {globalState.role ? <span>Role: {globalState.role}</span> : null}
                        <span>Layer: {activeLicenseLayer}</span>
                      </div>
                    </div>
                  ) : null}
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
                </>
              ) : null}
            </div>
            <div className="student-sidebar-actions">
              <button
                type="button"
                className="student-sidebar-icon-button"
                onClick={() => setSidebarCollapsed((currentValue) => !currentValue)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={sidebarCollapsed}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? ">>" : "<<"}
              </button>
              {sidebarCollapsed ? (
                <button
                  type="button"
                  className="student-sidebar-icon-button"
                  onClick={() => {
                    void signOut();
                  }}
                  disabled={session.status !== "authenticated"}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  SO
                </button>
              ) : null}
            </div>
          </div>

          <div className="student-sidebar-body">
            <div className="student-sidebar-nav-scroll">
              <nav className="student-sidebar-nav" aria-label="Student navigation">
                <section className="student-sidebar-section" aria-labelledby="student-nav-section-main">
                  <div className="student-sidebar-section-header">
                    <h2 id="student-nav-section-main">{sidebarCollapsed ? "M" : "Menu"}</h2>
                  </div>
                  <div className="student-sidebar-section-items">
                    {visibleNavItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        aria-label={sidebarCollapsed ? item.label : undefined}
                        title={sidebarCollapsed ? `${item.label}: ${item.summary}` : undefined}
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
                          {!sidebarCollapsed ? <small>{item.summary}</small> : null}
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
            {!sidebarCollapsed ? (
              <div className="student-sidebar-guidance">
                <p className="student-content-note">
                  Your progress updates after each completed test, with Raw % and Accuracy % kept easy to follow.
                </p>
                {LICENSE_LAYER_ORDER[activeLicenseLayer] < LICENSE_LAYER_ORDER.L1 ? (
                  <p className="student-content-note">
                    Insights unlock when your learning plan includes deeper progress guidance.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="student-main-content" aria-label="Student main dashboard container">
          <section
            className={`student-workspace-header${pageScrolled ? " student-workspace-header-compact" : ""}`}
            aria-label="Student workspace context"
          >
            <div className="student-workspace-title-block">
              <h2>{activeRouteLabel}</h2>
              {!pageScrolled ? <p>{activeRouteSummary}</p> : null}
            </div>
          </section>
          {!hasLivePhoto && location.pathname !== "/student/profile" ? (
            <section className="student-live-photo-required-banner" aria-label="Live photo required">
              <div>
                <strong>Live identity photo needed</strong>
                <p>Capture your photo once in profile settings so future exam face verification can use it.</p>
              </div>
              <NavLink to="/student/profile">Open Profile</NavLink>
            </section>
          ) : null}
          <Outlet />
        </section>
      </div>
    </main>
  );
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
        <Route path="dashboard" element={<StudentRouteBoundary label="Getting your latest progress"><StudentDashboardPage /></StudentRouteBoundary>} />
        <Route path="my-tests" element={<StudentRouteBoundary label="Checking your assigned tests"><StudentMyTestsPage /></StudentRouteBoundary>} />
        <Route path="analytics" element={<StudentRouteBoundary label="Preparing your analytics"><StudentPerformancePage /></StudentRouteBoundary>} />
        <Route path="performance" element={<Navigate to="/student/analytics" replace />} />
        <Route path="insights" element={<Navigate to="/student/analytics" replace />} />
        <Route path="discipline" element={<Navigate to="/student/analytics" replace />} />
        <Route path="profile" element={<StudentRouteBoundary label="Opening your account settings"><StudentProfileSettingsPage /></StudentRouteBoundary>} />
      </Route>
      <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
    </Routes>
  );
}

export default App;
