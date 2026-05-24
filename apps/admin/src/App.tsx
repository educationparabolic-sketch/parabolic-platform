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
import {
  getPortalDefaultAuthenticatedPath,
  getPortalLoginPath,
} from "../../../shared/services/portalIntegration";
import {
  ADMIN_PRIMARY_NAVIGATION,
  findActivePortalNavigationItem,
} from "../../../shared/ui/portalConsistency";
import { UiRouteLoading } from "../../../shared/ui/components";
import {
  evaluateAdminRoutePermissions,
  getVisibleAdminRoutes,
  matchAdminRoute,
  resolveAdminRouteMountPath,
} from "./portals/adminRoutes";
import { resolveAdminAccessContext } from "./portals/adminAccess";
import "./App.css";

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

const AdminAnalyticsDashboardPage = lazy(() => import("./features/analytics/AdminAnalyticsDashboardPage"));
const AdminAnalyticsLandingPage = lazy(() => import("./features/analytics/AdminAnalyticsLandingPage"));
const AdminAnalyticsTrendsPage = lazy(() => import("./features/analytics/AdminAnalyticsTrendsPage"));
const AdminTemplateAnalyticsPage = lazy(() => import("./features/analytics/AdminTemplateAnalyticsPage"));
const BatchAnalyticsDashboardPage = lazy(() => import("./features/analytics/BatchAnalyticsDashboardPage"));
const AdminGovernanceLandingPage = lazy(() => import("./features/analytics/AdminGovernanceLandingPage"));
const GovernanceMonitoringDashboardPage = lazy(() => import("./features/analytics/GovernanceMonitoringDashboardPage"));
const RiskInsightsDashboardPage = lazy(() => import("./features/analytics/RiskInsightsDashboardPage"));
const AdminAssignmentLiveRunPage = lazy(() => import("./features/assignments/AdminAssignmentLiveRunPage"));
const AdminAssignmentsLandingPage = lazy(() => import("./features/assignments/AdminAssignmentsLandingPage"));
const AdminAssignmentsLivePage = lazy(() => import("./features/assignments/AdminAssignmentsLivePage"));
const AssignmentManagementPage = lazy(() => import("./features/assignments/AssignmentManagementPage"));
const AdminExecutionSignalsPage = lazy(() => import("./features/insights/AdminExecutionSignalsPage"));
const AdminInsightsLandingPage = lazy(() => import("./features/insights/AdminInsightsLandingPage"));
const AdminMonthlySummaryPage = lazy(() => import("./features/insights/AdminMonthlySummaryPage"));
const AdminRiskOverviewPage = lazy(() => import("./features/insights/AdminRiskOverviewPage"));
const AdminPatternAlertsPage = lazy(() => import("./features/insights/AdminPatternAlertsPage"));
const InterventionToolsPage = lazy(() => import("./features/insights/InterventionToolsPage"));
const StudentIntelligencePage = lazy(() => import("./features/insights/StudentIntelligencePage"));
const AdminCurrentLicensePage = lazy(() => import("./features/licensing/AdminCurrentLicensePage"));
const AdminLicenseFeaturesPage = lazy(() => import("./features/licensing/AdminLicenseFeaturesPage"));
const AdminLicensingLandingPage = lazy(() => import("./features/licensing/AdminLicensingLandingPage"));
const AdminLicensingEligibilityPage = lazy(() => import("./features/licensing/AdminLicensingEligibilityPage"));
const AdminLicenseHistoryPage = lazy(() => import("./features/licensing/AdminLicenseHistoryPage"));
const AdminLicenseUpgradePreviewPage = lazy(() => import("./features/licensing/AdminLicenseUpgradePreviewPage"));
const AdminLicensingUsagePage = lazy(() => import("./features/licensing/AdminLicensingUsagePage"));
const AdminOverviewPage = lazy(() => import("./features/overview/AdminOverviewPage"));
const AdminStudentsLandingPage = lazy(() => import("./features/students/AdminStudentsLandingPage"));
const AdminDataArchiveControlsPage = lazy(() => import("./features/settings/AdminDataArchiveControlsPage"));
const AdminExecutionPolicyPage = lazy(() => import("./features/settings/AdminExecutionPolicyPage"));
const AdminAcademicYearPage = lazy(() => import("./features/settings/AdminAcademicYearPage"));
const AdminInstituteProfilePage = lazy(() => import("./features/settings/AdminInstituteProfilePage"));
const AdminSettingsLandingPage = lazy(() => import("./features/settings/AdminSettingsLandingPage"));
const AdminSecurityAccessPage = lazy(() => import("./features/settings/AdminSecurityAccessPage"));
const AdminSystemConfigurationPage = lazy(() => import("./features/settings/AdminSystemConfigurationPage"));
const AdminUserRoleManagementPage = lazy(() => import("./features/settings/AdminUserRoleManagementPage"));
const AdminQuestionBankLandingPage = lazy(() => import("./features/tests/AdminQuestionBankLandingPage"));
const AdminQuestionBankDistributionPage = lazy(() => import("./features/tests/AdminQuestionBankDistributionPage"));
const AdminQuestionBankArchiveVersionsPage = lazy(() => import("./features/tests/AdminQuestionBankArchiveVersionsPage"));
const AdminQuestionBankLibraryPage = lazy(() => import("./features/tests/AdminQuestionBankLibraryPage"));
const AdminQuestionBankTagManagementPage = lazy(() => import("./features/tests/AdminQuestionBankTagManagementPage"));
const AdminQuestionBankValidationLogsPage = lazy(() => import("./features/tests/AdminQuestionBankValidationLogsPage"));
const AdminTestsLandingPage = lazy(() => import("./features/tests/AdminTestsLandingPage"));
const AdminTestTemplateAnalyticsDetailPage = lazy(() => import("./features/tests/AdminTestTemplateAnalyticsDetailPage"));
const AdminTestTemplateDetailPage = lazy(() => import("./features/tests/AdminTestTemplateDetailPage"));
const StudentManagementPage = lazy(() => import("./features/students/StudentManagementPage"));
const StudentProfilePage = lazy(() => import("./features/students/StudentProfilePage"));
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

const ADMIN_SIDEBAR_STORAGE_KEY = "admin-sidebar-collapsed";

const ADMIN_NAV_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    paths: ["/admin/overview"],
  },
  {
    id: "operations",
    label: "Operations",
    paths: ["/admin/students", "/admin/question-bank", "/admin/tests", "/admin/assignments"],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    paths: ["/admin/analytics", "/admin/insights", "/admin/governance"],
  },
  {
    id: "configuration",
    label: "Configuration",
    paths: ["/admin/licensing", "/admin/settings"],
  },
] as const;

type AdminVisibleNavItem = {
  path: string;
  label: string;
  summary: string;
  groupId: string;
};

function resolveAdminNavGroupId(path: string): string {
  return ADMIN_NAV_GROUPS.find((group) => group.paths.some((groupPath) => groupPath === path))?.id ?? "other";
}

function resolveAdminNavShortLabel(label: string): string {
  return label
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AdminSidebarNavigation(props: {
  activePath?: string;
  collapsed: boolean;
  items: AdminVisibleNavItem[];
  compact: boolean;
  licenseLayer: string | null;
  pathname: string;
  onCloseMobile: () => void;
  onSignOut: () => void;
  onToggleCollapsed: () => void;
  role: string | null;
  sessionStatus: string;
}) {
  const {
    activePath,
    collapsed,
    compact,
    items,
    licenseLayer,
    onCloseMobile,
    onSignOut,
    onToggleCollapsed,
    pathname,
    role,
    sessionStatus,
  } = props;
  const sections = useMemo(() => {
    const groupedItems = new Map<string, AdminVisibleNavItem[]>();

    for (const item of items) {
      const existingItems = groupedItems.get(item.groupId) ?? [];
      existingItems.push(item);
      groupedItems.set(item.groupId, existingItems);
    }

    return ADMIN_NAV_GROUPS.map((group) => ({
      ...group,
      items: groupedItems.get(group.id) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <div className="admin-sidebar-panel">
      <header className={`admin-sidebar-header${compact ? " admin-sidebar-header-compact" : ""}`}>
        <div className="admin-sidebar-brand">
          <p className="admin-sidebar-eyebrow">Parabolic Platform</p>
          <h1>Admin Console</h1>
          {!collapsed ? <p className="admin-sidebar-copy">Institute operations with routed, permission-aware workspaces.</p> : null}
          {!collapsed ? (
            <div className="admin-sidebar-meta">
              <p className="admin-sidebar-path" title={pathname}>{pathname}</p>
              <div className="admin-sidebar-session">
                <span>Status: {sessionStatus}</span>
                {role ? <span>Role: {role}</span> : null}
                {licenseLayer ? <span>Layer: {licenseLayer}</span> : null}
              </div>
              <button
                type="button"
                className="admin-signout-button admin-sidebar-signout-button"
                onClick={onSignOut}
                disabled={sessionStatus !== "authenticated"}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
        <div className="admin-sidebar-actions">
          <button
            type="button"
            className="admin-sidebar-icon-button admin-sidebar-mobile-close"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
          >
            Close
          </button>
          <button
            type="button"
            className="admin-sidebar-icon-button admin-sidebar-collapse-button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? ">>" : "<<"}
          </button>
        </div>
      </header>

      <div className="admin-sidebar-body">
        <div className="admin-sidebar-nav-scroll">
          <nav className="admin-sidebar-nav" aria-label="Admin navigation">
            {sections.map((section) => (
              <section key={section.id} className="admin-sidebar-section" aria-labelledby={`admin-nav-section-${section.id}`}>
                <div className="admin-sidebar-section-header">
                  <h2 id={`admin-nav-section-${section.id}`}>{collapsed ? section.label.slice(0, 1) : section.label}</h2>
                </div>
                <div className="admin-sidebar-section-items">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `admin-sidebar-link${isActive ? " admin-sidebar-link-active" : ""}`
                      }
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? `${item.label}: ${item.summary}` : undefined}
                      onClick={onCloseMobile}
                    >
                      <span className="admin-sidebar-link-badge" aria-hidden="true">
                        {resolveAdminNavShortLabel(item.label)}
                      </span>
                      <span className="admin-sidebar-link-copy">
                        <span className="admin-sidebar-link-label">{item.label}</span>
                        {!collapsed ? <small>{item.summary}</small> : null}
                      </span>
                      <span
                        className="admin-sidebar-link-indicator"
                        aria-hidden="true"
                        data-active={item.path === activePath ? "true" : "false"}
                      />
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

function AdminLayout() {
  const location = useLocation();
  const { session, signOut } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true";
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pageScrolled, setPageScrolled] = useState(false);
  const visibleRoutes = useMemo(() => {
    return getVisibleAdminRoutes(accessContext.role, accessContext.licenseLayer);
  }, [accessContext.licenseLayer, accessContext.role]);
  const matchedRoute = useMemo(() => matchAdminRoute(location.pathname), [location.pathname]);
  const visibleNavItems = useMemo(() => {
    return ADMIN_PRIMARY_NAVIGATION.filter((item) =>
      visibleRoutes.some((route) => route.path === item.path),
    );
  }, [visibleRoutes]);

  const activeItem = useMemo(() => {
    return findActivePortalNavigationItem(visibleNavItems, location.pathname);
  }, [location.pathname, visibleNavItems]);
  const navItems = useMemo<AdminVisibleNavItem[]>(() => {
    return visibleNavItems.map((item) => {
      return {
        path: item.path,
        label: item.label,
        summary: item.summary,
        groupId: resolveAdminNavGroupId(item.path),
      };
    });
  }, [visibleNavItems, visibleRoutes]);
  const pageTitle = matchedRoute?.definition.title ?? activeItem?.label ?? "Admin";
  const pageDescription = matchedRoute?.definition.description ?? activeItem?.summary ?? "Permission-aware admin workspace.";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      setPageScrolled(window.scrollY > 48);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1025px)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileNavOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const sidebarHeaderCompact = pageScrolled;

  return (
    <main className="admin-page-shell">
      <div className={`admin-layout-grid${sidebarCollapsed ? " admin-layout-grid-collapsed" : ""}`}>
        <button
          type="button"
          className={`admin-sidebar-backdrop${mobileNavOpen ? " admin-sidebar-backdrop-visible" : ""}`}
          onClick={() => {
            setMobileNavOpen(false);
          }}
          aria-label="Close navigation menu"
        />
        <aside
          id="admin-sidebar"
          className={`admin-sidebar${sidebarCollapsed ? " admin-sidebar-collapsed" : ""}${mobileNavOpen ? " admin-sidebar-open" : ""}`}
        >
          <AdminSidebarNavigation
            activePath={activeItem?.path}
            collapsed={sidebarCollapsed}
            compact={sidebarHeaderCompact}
            items={navItems}
            licenseLayer={accessContext.licenseLayer}
            pathname={location.pathname}
            onCloseMobile={() => {
              setMobileNavOpen(false);
            }}
            onSignOut={() => {
              void signOut();
            }}
            onToggleCollapsed={() => {
              setSidebarCollapsed((currentValue) => !currentValue);
            }}
            role={accessContext.role}
            sessionStatus={session.status}
          />
        </aside>

        <div className="admin-main-area">
          <header className="admin-topbar admin-topbar-compact">
            <div className="admin-topbar-leading">
              <div className="admin-topbar-actions">
                <button
                  type="button"
                  className="admin-topbar-menu-button"
                  onClick={() => {
                    setMobileNavOpen((currentValue) => !currentValue);
                  }}
                  aria-label="Toggle navigation menu"
                  aria-controls="admin-sidebar"
                  aria-expanded={mobileNavOpen}
                >
                  Menu
                </button>
                <button
                  type="button"
                  className="admin-topbar-collapse-toggle"
                  onClick={() => {
                    setSidebarCollapsed((currentValue) => !currentValue);
                  }}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {sidebarCollapsed ? "Expand nav" : "Collapse nav"}
                </button>
              </div>

              <div className="admin-topbar-title-block">
                <h2>{pageTitle}</h2>
                <p className="admin-topbar-description">{pageDescription}</p>
              </div>
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

function AdminRouteResolutionPage() {
  const location = useLocation();
  const mountedPath = resolveAdminRouteMountPath(location.pathname);

  if (mountedPath && mountedPath !== location.pathname) {
    return <Navigate replace to={mountedPath} />;
  }

  return <NotFoundPage />;
}

function App() {
  usePortalTitle("admin");
  const loginPath = getPortalLoginPath("admin");
  const protectedDefaultPath = getPortalDefaultAuthenticatedPath("admin");

  return (
    <Routes>
      <Route path="/" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path="/admin" element={<Navigate to={protectedDefaultPath} replace />} />
      <Route path="/admin/login" element={<Navigate replace to={loginPath} />} />
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
          element={<AdminRouteBoundary label="Loading students landing"><AdminStudentsLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/list"
          element={<AdminRouteBoundary label="Loading students"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/bulk-upload"
          element={<AdminRouteBoundary label="Loading bulk upload"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/lifecycle"
          element={<AdminRouteBoundary label="Loading lifecycle"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/batches"
          element={<AdminRouteBoundary label="Loading batch management"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/archive"
          element={<AdminRouteBoundary label="Loading archive"><StudentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="students/:studentId"
          element={<AdminRouteBoundary label="Loading student profile"><StudentProfilePage /></AdminRouteBoundary>}
        />
        <Route path="students/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="question-bank"
          element={<AdminRouteBoundary label="Loading question bank"><AdminQuestionBankLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/upload-package"
          element={<AdminRouteBoundary label="Loading question bank upload"><QuestionBankManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/library"
          element={<AdminRouteBoundary label="Loading question library"><AdminQuestionBankLibraryPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/distribution"
          element={<AdminRouteBoundary label="Loading question distribution"><AdminQuestionBankDistributionPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/archive"
          element={<AdminRouteBoundary label="Loading archive and versions"><AdminQuestionBankArchiveVersionsPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/tags"
          element={<AdminRouteBoundary label="Loading question bank tags"><AdminQuestionBankTagManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="question-bank/validation-logs"
          element={<AdminRouteBoundary label="Loading validation logs"><AdminQuestionBankValidationLogsPage /></AdminRouteBoundary>}
        />
        <Route path="question-bank/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="tests"
          element={<AdminRouteBoundary label="Loading tests landing"><AdminTestsLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/create"
          element={<AdminRouteBoundary label="Loading create test"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/library"
          element={<AdminRouteBoundary label="Loading test library"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/analytics"
          element={<AdminRouteBoundary label="Loading template analytics"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/analytics/:testId"
          element={<AdminRouteBoundary label="Loading template analytics"><AdminTestTemplateAnalyticsDetailPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/distribution"
          element={<AdminRouteBoundary label="Loading distribution review"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/settings"
          element={<AdminRouteBoundary label="Loading template settings"><TestTemplateManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="tests/:testId"
          element={<AdminRouteBoundary label="Loading test detail"><AdminTestTemplateDetailPage /></AdminRouteBoundary>}
        />
        <Route path="tests/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="assignments"
          element={<AdminRouteBoundary label="Loading assignments landing"><AdminAssignmentsLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/create"
          element={<AdminRouteBoundary label="Loading create assignment"><AssignmentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/list"
          element={<AdminRouteBoundary label="Loading assignment list"><AssignmentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/live"
          element={<AdminRouteBoundary label="Loading assignment live monitor"><AdminAssignmentsLivePage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/live/:runId"
          element={<AdminRouteBoundary label="Loading assignment live monitor"><AdminAssignmentLiveRunPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/history"
          element={<AdminRouteBoundary label="Loading assignment history"><AssignmentManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="assignments/bulk"
          element={<AdminRouteBoundary label="Loading assignment bulk operations"><AssignmentManagementPage /></AdminRouteBoundary>}
        />
        <Route path="assignments/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="analytics"
          element={<AdminRouteBoundary label="Loading analytics landing"><AdminAnalyticsLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/overview"
          element={<AdminRouteBoundary label="Loading analytics overview"><AdminAnalyticsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/run/:runId"
          element={<AdminRouteBoundary label="Loading run analytics"><AdminAnalyticsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/student/:studentId"
          element={<AdminRouteBoundary label="Loading student analytics"><AdminAnalyticsDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/template/:testId"
          element={<AdminRouteBoundary label="Loading template analytics"><AdminTemplateAnalyticsPage /></AdminRouteBoundary>}
        />
        <Route
          path="analytics/trends"
          element={<AdminRouteBoundary label="Loading analytics trends"><AdminAnalyticsTrendsPage /></AdminRouteBoundary>}
        />
        <Route path="analytics/*" element={<AdminRouteResolutionPage />} />
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
          element={<AdminRouteBoundary label="Loading governance landing"><AdminGovernanceLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/stability"
          element={<AdminRouteBoundary label="Loading governance stability"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/integrity"
          element={<AdminRouteBoundary label="Loading governance integrity"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/override-audit"
          element={<AdminRouteBoundary label="Loading governance override audit"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/batch-risk"
          element={<AdminRouteBoundary label="Loading governance batch risk"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/trends"
          element={<AdminRouteBoundary label="Loading governance trends"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route
          path="governance/reports"
          element={<AdminRouteBoundary label="Loading governance reports"><GovernanceMonitoringDashboardPage /></AdminRouteBoundary>}
        />
        <Route path="governance/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="insights/interventions"
          element={<AdminRouteBoundary label="Loading interventions"><InterventionToolsPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/student/:studentId"
          element={<AdminRouteBoundary label="Loading student intelligence"><StudentIntelligencePage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/patterns"
          element={<AdminRouteBoundary label="Loading insight patterns"><AdminPatternAlertsPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/execution"
          element={<AdminRouteBoundary label="Loading execution insights"><AdminExecutionSignalsPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/monthly-summary"
          element={<AdminRouteBoundary label="Loading monthly summaries"><AdminMonthlySummaryPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights/risk"
          element={<AdminRouteBoundary label="Loading risk overview"><AdminRiskOverviewPage /></AdminRouteBoundary>}
        />
        <Route
          path="insights"
          element={<AdminRouteBoundary label="Loading insights"><AdminInsightsLandingPage /></AdminRouteBoundary>}
        />
        <Route path="insights/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="licensing"
          element={<AdminRouteBoundary label="Loading licensing"><AdminLicensingLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/current"
          element={<AdminRouteBoundary label="Loading current license"><AdminCurrentLicensePage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/features"
          element={<AdminRouteBoundary label="Loading feature matrix"><AdminLicenseFeaturesPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/eligibility"
          element={<AdminRouteBoundary label="Loading eligibility"><AdminLicensingEligibilityPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/usage"
          element={<AdminRouteBoundary label="Loading usage"><AdminLicensingUsagePage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/upgrade-preview"
          element={<AdminRouteBoundary label="Loading upgrade preview"><AdminLicenseUpgradePreviewPage /></AdminRouteBoundary>}
        />
        <Route
          path="licensing/history"
          element={<AdminRouteBoundary label="Loading license history"><AdminLicenseHistoryPage /></AdminRouteBoundary>}
        />
        <Route path="licensing/*" element={<AdminRouteResolutionPage />} />
        <Route
          path="settings"
          element={<AdminRouteBoundary label="Loading settings"><AdminSettingsLandingPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/profile"
          element={<AdminRouteBoundary label="Loading settings"><AdminInstituteProfilePage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/academic-year"
          element={<AdminRouteBoundary label="Loading academic year settings"><AdminAcademicYearPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/execution-policy"
          element={<AdminRouteBoundary label="Loading execution policy"><AdminExecutionPolicyPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/users"
          element={<AdminRouteBoundary label="Loading user settings"><AdminUserRoleManagementPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/security"
          element={<AdminRouteBoundary label="Loading security settings"><AdminSecurityAccessPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/data"
          element={<AdminRouteBoundary label="Loading data settings"><AdminDataArchiveControlsPage /></AdminRouteBoundary>}
        />
        <Route
          path="settings/system"
          element={<AdminRouteBoundary label="Loading system settings"><AdminSystemConfigurationPage /></AdminRouteBoundary>}
        />
        <Route path="settings/*" element={<AdminRouteResolutionPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
