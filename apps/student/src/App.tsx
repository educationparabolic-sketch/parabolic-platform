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
import StudentDashboardPage from "./features/dashboard/StudentDashboardPage";
import "./App.css";

interface StudentNavItem {
  path: string;
  label: string;
  summary: string;
}

interface StudentSectionPageProps {
  title: string;
  summary: string;
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
  },
  {
    path: "/student/profile",
    label: "Profile",
    summary: "Student-managed profile and account settings workspace.",
  },
];

function StudentSectionPage({ title, summary }: StudentSectionPageProps) {
  return (
    <section className="student-content-card" aria-labelledby="student-content-title">
      <p className="student-content-eyebrow">Student Portal</p>
      <h2 id="student-content-title">{title}</h2>
      <p className="student-content-copy">{summary}</p>
      <p className="student-content-note">
        Build 126 establishes the student layout shell, authenticated route protection, and route-based
        rendering containers for this section.
      </p>
    </section>
  );
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

  const activeRoute = STUDENT_NAV_ITEMS.find((item) => location.pathname === item.path);

  return (
    <main className="student-page-shell">
      <header className="student-topbar" aria-label="Student top navigation bar">
        <div className="student-topbar-branding">
          <p>Portal</p>
          <h1>Student Portal</h1>
        </div>
        <nav aria-label="Student top route navigation">
          <ul className="student-top-nav-list">
            {STUDENT_NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "student-top-nav-link student-top-nav-link-active" : "student-top-nav-link"
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
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
            {STUDENT_NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "student-sidebar-link student-sidebar-link-active" : "student-sidebar-link"
                  }
                >
                  <strong>{item.label}</strong>
                  <small>{item.summary}</small>
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        <section className="student-main-content" aria-label="Student main dashboard container">
          <Outlet />
        </section>
      </div>
    </main>
  );
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
          element={
            <StudentSectionPage
              title="My Tests"
              summary="Assignment-centric workspace for student test availability, in-progress attempts, and completed outcomes."
            />
          }
        />
        <Route
          path="performance"
          element={
            <StudentSectionPage
              title="Performance"
              summary="Route shell for student performance trends backed by summary analytics collections."
            />
          }
        />
        <Route
          path="insights"
          element={
            <StudentSectionPage
              title="Insights"
              summary="Behavioral insight route container for interpreted student performance signals."
            />
          }
        />
        <Route
          path="profile"
          element={
            <StudentSectionPage
              title="Profile"
              summary="Student profile and account settings route container for personal details management."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
    </Routes>
  );
}

export default App;
