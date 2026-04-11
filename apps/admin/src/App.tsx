import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { useAuthProvider } from "../../../shared/services/authProvider";
import AdminAnalyticsDashboardPage from "./features/analytics/AdminAnalyticsDashboardPage";
import BatchAnalyticsDashboardPage from "./features/analytics/BatchAnalyticsDashboardPage";
import GovernanceMonitoringDashboardPage from "./features/analytics/GovernanceMonitoringDashboardPage";
import RiskInsightsDashboardPage from "./features/analytics/RiskInsightsDashboardPage";
import AssignmentManagementPage from "./features/assignments/AssignmentManagementPage";
import StudentManagementPage from "./features/students/StudentManagementPage";
import TestTemplateManagementPage from "./features/tests/TestTemplateManagementPage";
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

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    path: "/admin/overview",
    label: "Overview",
    summary: "Operational institute snapshot and core portal landing context.",
  },
  {
    path: "/admin/students",
    label: "Students",
    summary: "Student roster and lifecycle navigation workspace.",
  },
  {
    path: "/admin/tests",
    label: "Tests",
    summary: "Template creation and test management entry point.",
  },
  {
    path: "/admin/assignments",
    label: "Assignments",
    summary: "Assignment planning and run participation controls.",
  },
  {
    path: "/admin/analytics",
    label: "Analytics",
    summary: "Summary-level performance and participation dashboards.",
  },
  {
    path: "/admin/governance",
    label: "Governance",
    summary: "Institutional stability and execution quality monitoring.",
  },
  {
    path: "/admin/settings",
    label: "Settings",
    summary: "Institute-level configuration and account controls.",
  },
];

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

  const activeItem = ADMIN_NAV_ITEMS.find((item) =>
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
              {ADMIN_NAV_ITEMS.map((item) => (
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

function App() {
  usePortalTitle("admin");

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />

      <Route path="/admin" element={<AdminLayout />}>
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
          path="settings"
          element={
            <AdminSectionPage
              title="Settings"
              summary="Manage institute-level configuration options and portal behavior in a dedicated settings route."
            />
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
