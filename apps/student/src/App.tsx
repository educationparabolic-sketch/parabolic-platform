import { useMemo, useState, type FormEvent, type ReactElement } from "react";
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
import type { LicenseLayer } from "../../../shared/types/portalRouting";
import { UiNavBar } from "../../../shared/ui/components";
import StudentDashboardPage from "./features/dashboard/StudentDashboardPage";
import StudentInsightsPage from "./features/insights/StudentInsightsPage";
import StudentMyTestsPage from "./features/my-tests/StudentMyTestsPage";
import StudentPerformancePage from "./features/performance/StudentPerformancePage";
import StudentProfileSettingsPage from "./features/profile/StudentProfileSettingsPage";
import "./App.css";

interface StudentNavItem {
  path: string;
  label: string;
  summary: string;
  minimumLicenseLayer?: LicenseLayer;
}

const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  {
    path: "/student/dashboard",
    label: "Dashboard",
    summary: "Landing view for student progress highlights and upcoming assessments.",
  },
  {
    path: "/student/my-tests",
    label: "My Tests",
    summary: "Assigned, active, and completed test navigation for the student account.",
  },
  {
    path: "/student/performance",
    label: "Performance",
    summary: "Summary-level performance trends based on analytics collections.",
  },
  {
    path: "/student/insights",
    label: "Insights",
    summary: "Behavioral insight space for interpreted performance indicators.",
    minimumLicenseLayer: "L1",
  },
  {
    path: "/student/profile",
    label: "Profile",
    summary: "Student-managed profile and account settings workspace.",
  },
];

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

function decodeLicenseLayerFromToken(idToken: string | null): LicenseLayer | null {
  if (!idToken) {
    return null;
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const candidate = typeof payload.licenseLayer === "string" ? payload.licenseLayer.trim().toUpperCase() : "";
    if (candidate === "L0" || candidate === "L1" || candidate === "L2" || candidate === "L3") {
      return candidate;
    }
  } catch {
    return null;
  }

  return null;
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
  const navigate = useNavigate();
  const { session, signOut } = useAuthProvider();
  const activeLicenseLayer = decodeLicenseLayerFromToken(session.idToken) ?? "L0";

  const visibleNavItems = useMemo(() => {
    return STUDENT_NAV_ITEMS.filter((item) => {
      if (!item.minimumLicenseLayer) {
        return true;
      }

      return LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER[item.minimumLicenseLayer];
    });
  }, [activeLicenseLayer]);

  const activeRoute = STUDENT_NAV_ITEMS.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  );

  return (
    <main className="student-page-shell">
      <header className="student-topbar" aria-label="Student top navigation bar">
        <div className="student-topbar-branding">
          <p>Portal</p>
          <h1>Student Portal</h1>
        </div>
        <UiNavBar
          title="Student Routes"
          subtitle="Shared top navigation"
          activeItemId={activeRoute?.path}
          items={visibleNavItems.map((item) => ({
            id: item.path,
            label: item.label,
            hint: item.summary,
            onClick: () => navigate(item.path),
          }))}
        />
        <button
          type="button"
          className="student-signout-button"
          onClick={() => {
            void signOut();
          }}
          disabled={session.status !== "authenticated"}
        >
          Sign out
        </button>
      </header>

      <div className="student-layout-grid">
        <aside className="student-sidebar" aria-label="Student sidebar menu">
          <p className="student-content-eyebrow">Route Menu</p>
          <h2>{activeRoute?.label ?? "Student"}</h2>
          <p className="student-sidebar-copy">
            {activeRoute?.summary ?? "Student route selection and contextual section guidance."}
          </p>
          <ul className="student-sidebar-list">
            {visibleNavItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ?
                      "student-sidebar-link student-sidebar-link-active" :
                      "student-sidebar-link"
                  }
                >
                  <strong>{item.label}</strong>
                  <small>{item.summary}</small>
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="student-content-note">
            Data flow: Session Submitted to runAnalytics updated to studentYearMetrics updated to Student
            Portal summary refresh.
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
        </aside>

        <section className="student-main-content" aria-label="Student main dashboard container">
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
  const { session } = useAuthProvider();
  const location = useLocation();

  const activeLicenseLayer = decodeLicenseLayerFromToken(session.idToken) ?? "L0";
  const hasAccess = LICENSE_LAYER_ORDER[activeLicenseLayer] >= LICENSE_LAYER_ORDER[minimumLicenseLayer];

  if (!hasAccess) {
    return <Navigate replace to={fallbackPath} state={{ from: location.pathname }} />;
  }

  return children;
}

function App() {
  usePortalTitle("student");

  const loginPath = "/student/login";
  const protectedDefaultPath = "/student/dashboard";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path="/student" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route
        path={loginPath}
        element={<StudentLoginPage loginPath={loginPath} protectedPath={protectedDefaultPath} />}
      />
      <Route
        path="/student"
        element={(
          <StudentProtectedRoute loginPath={loginPath}>
            <StudentLayout />
          </StudentProtectedRoute>
        )}
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={<StudentDashboardPage />}
        />
        <Route
          path="my-tests"
          element={<StudentMyTestsPage />}
        />
        <Route
          path="performance"
          element={<StudentPerformancePage />}
        />
        <Route
          path="insights"
          element={(
            <StudentLicenseRoute minimumLicenseLayer="L1" fallbackPath="/student/dashboard">
              <StudentInsightsPage />
            </StudentLicenseRoute>
          )}
        />
        <Route
          path="profile"
          element={<StudentProfileSettingsPage />}
        />
      </Route>
      <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
    </Routes>
  );
}

export default App;
