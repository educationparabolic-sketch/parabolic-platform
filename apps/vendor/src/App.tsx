import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
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
  getPortalRoutePrefix,
} from "../../../shared/services/portalIntegration";
import {
  VENDOR_PRIMARY_NAVIGATION,
  findActivePortalNavigationItem,
} from "../../../shared/ui/portalConsistency";
import { UiRouteLoading } from "../../../shared/ui/components";
import { getVisibleVendorRoutes, matchVendorRoute } from "../../admin/src/portals/vendorRoutes";
import { resolveVendorAccessContext } from "./portals/vendorAccess";
import VendorPlaceholderPage from "./features/shared/VendorPlaceholderPage";
import { VendorLicenseRequestsProvider } from "./features/institutes/VendorLicenseRequestsContext";
import { useVendorLicenseRequests } from "./features/institutes/vendorLicenseRequestsStore";
import "./App.css";

const VendorAuditActivityLogsPage = lazy(
  () => import("./features/audit/VendorAuditActivityLogsPage"),
);
const VendorCalibrationManagementPage = lazy(
  () => import("./features/calibration/VendorCalibrationManagementPage"),
);
const VendorIntelligenceDashboardPage = lazy(
  () => import("./features/intelligence/VendorIntelligenceDashboardPage"),
);
const VendorInstituteManagementPage = lazy(
  () => import("./features/institutes/VendorInstituteManagementPage"),
);
const VendorLicensingPage = lazy(() => import("./features/licensing/VendorLicensingPage"));
const VendorOverviewPage = lazy(() => import("./features/overview/VendorOverviewPage"));
const VendorSystemHealthDashboardPage = lazy(
  () => import("./features/system-health/VendorSystemHealthDashboardPage"),
);

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

const VENDOR_SIDEBAR_STORAGE_KEY = "vendor-sidebar-collapsed";

const VENDOR_NAV_GROUPS = [
  {
    id: "intelligence",
    label: "Intelligence",
    paths: ["/vendor/overview", "/vendor/intelligence"],
  },
  {
    id: "operations",
    label: "Operations",
    paths: ["/vendor/institutes", "/vendor/licensing", "/vendor/audit"],
  },
  {
    id: "controls",
    label: "Controls",
    paths: ["/vendor/calibration", "/vendor/system-health"],
  },
] as const;

type VendorVisibleNavItem = {
  path: string;
  label: string;
  summary: string;
  groupId: string;
};

function resolveVendorNavGroupId(path: string): string {
  return (
    VENDOR_NAV_GROUPS.find((group) => group.paths.some((groupPath) => groupPath === path))?.id ??
    "other"
  );
}

function resolveVendorNavShortLabel(label: string): string {
  return label
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function VendorSidebarNavigation(props: {
  activePath?: string;
  collapsed: boolean;
  compact: boolean;
  items: VendorVisibleNavItem[];
  onCloseMobile: () => void;
  onSignOut: () => void;
  onToggleCollapsed: () => void;
  pathname: string;
  requestCount: number;
  role: string | null;
  sessionStatus: string;
}) {
  const {
    activePath,
    collapsed,
    compact,
    items,
    onCloseMobile,
    onSignOut,
    onToggleCollapsed,
    pathname,
    requestCount,
    role,
    sessionStatus,
  } = props;
  const sections = useMemo(() => {
    const groupedItems = new Map<string, VendorVisibleNavItem[]>();

    for (const item of items) {
      const existingItems = groupedItems.get(item.groupId) ?? [];
      existingItems.push(item);
      groupedItems.set(item.groupId, existingItems);
    }

    return VENDOR_NAV_GROUPS.map((group) => ({
      ...group,
      items: groupedItems.get(group.id) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <div className="admin-sidebar-panel">
      <header className={`admin-sidebar-header${compact ? " admin-sidebar-header-compact" : ""}`}>
        <div className="admin-sidebar-brand">
          <p className="admin-sidebar-eyebrow">Parabolic Platform</p>
          <h1>Vendor Control</h1>
          {!collapsed ? (
            <p className="admin-sidebar-copy">
              Cross-institute operations with routed, vendor-only workspaces.
            </p>
          ) : null}
          {!collapsed ? (
            <div className="admin-sidebar-meta">
              <p className="admin-sidebar-path" title={pathname}>
                {pathname}
              </p>
              <div className="admin-sidebar-session">
                <span>Status: {sessionStatus}</span>
                {role ? <span>Role: {role}</span> : null}
                <span>Scope: Global vendor domain</span>
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
          <nav className="admin-sidebar-nav" aria-label="Vendor navigation">
            {sections.map((section) => (
              <section
                key={section.id}
                className="admin-sidebar-section"
                aria-labelledby={`vendor-nav-section-${section.id}`}
              >
                <div className="admin-sidebar-section-header">
                  <h2 id={`vendor-nav-section-${section.id}`}>
                    {collapsed ? section.label.slice(0, 1) : section.label}
                  </h2>
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
                        {resolveVendorNavShortLabel(item.label)}
                      </span>
                      <span className="admin-sidebar-link-copy">
                        <span className="admin-sidebar-link-label">{item.label}</span>
                        {!collapsed ? <small>{item.summary}</small> : null}
                      </span>
                      {item.path === "/vendor/institutes" && requestCount > 0 ? (
                        <span
                          className="vendor-nav-request-count"
                          aria-label={`${requestCount} open license requests`}
                        >
                          {requestCount}
                        </span>
                      ) : null}
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
    <main className="admin-page-shell admin-page-shell-login">
      <section className="admin-content-card admin-login-card" aria-labelledby="vendor-login-title">
        <p className="admin-content-eyebrow">Build 136</p>
        <h1 id="vendor-login-title">Vendor Login</h1>
        <p className="admin-content-copy">
          Vendor-only sign-in route for the global platform control surface.
        </p>
        <form className="admin-login-form" onSubmit={handleSubmit}>
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

          <button type="submit" className="admin-primary-link">
            Login
          </button>
        </form>

        {session.error ? (
          <p className="vendor-login-error" role="alert">
            {session.error}
          </p>
        ) : null}

        <p className="admin-login-meta">
          Login route: <code>{loginPath}</code>
        </p>
      </section>
    </main>
  );
}

function VendorUnauthorizedPage() {
  return (
    <main className="admin-page-shell admin-page-shell-login">
      <section
        className="admin-content-card admin-login-card"
        aria-labelledby="vendor-unauthorized-title"
      >
        <p className="admin-content-eyebrow">Access Guard</p>
        <h1 id="vendor-unauthorized-title">Vendor role required</h1>
        <p className="admin-content-copy">
          This portal is restricted to authenticated users with the <code>vendor</code> role claim.
        </p>
      </section>
    </main>
  );
}

function VendorProtectedRoute(props: { loginPath: string; children: ReactElement }) {
  const { loginPath, children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="admin-page-shell admin-page-shell-login">
        <section
          className="admin-content-card admin-login-card"
          aria-labelledby="vendor-loading-title"
        >
          <p className="admin-content-eyebrow">Build 136</p>
          <h1 id="vendor-loading-title">Checking session</h1>
          <p className="admin-content-copy">Restoring authentication context for vendor routes.</p>
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
  const {
    requests: licenseRequests,
    openRequestCount,
    unreadRequestIds,
    markRequestRead,
    markAllRequestsRead,
    billingAlerts,
    unreadBillingAlertIds,
    markBillingAlertRead,
    markAllBillingAlertsRead,
    onboardingRecords,
    unreadOnboardingIds,
    markOnboardingRead,
    markAllOnboardingRead,
  } = useVendorLicenseRequests();
  const onboardingAttentionRecords = onboardingRecords.filter((record) =>
    [
      "pending_review",
      "approved",
      "commercial_configured",
      "awaiting_acceptance",
      "awaiting_payment",
      "payment_received",
      "trial_terms_accepted",
      "administrator_invited",
      "setup_in_progress",
      "ready_for_activation",
      "expired",
    ].includes(record.status),
  );
  const unreadNotificationCount =
    unreadRequestIds.length + unreadBillingAlertIds.length + unreadOnboardingIds.length;
  const attentionItemCount =
    openRequestCount + billingAlerts.length + onboardingAttentionRecords.length;
  const accessContext = resolveVendorAccessContext(session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(VENDOR_SIDEBAR_STORAGE_KEY) === "true";
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [pageScrolled, setPageScrolled] = useState(false);
  const visibleRoutes = useMemo(
    () => getVisibleVendorRoutes(accessContext.role),
    [accessContext.role],
  );
  const matchedRoute = useMemo(() => matchVendorRoute(location.pathname), [location.pathname]);

  const activeItem = useMemo(() => {
    return findActivePortalNavigationItem(VENDOR_PRIMARY_NAVIGATION, location.pathname);
  }, [location.pathname]);
  const navItems = useMemo<VendorVisibleNavItem[]>(() => {
    return VENDOR_PRIMARY_NAVIGATION.filter((item) =>
      visibleRoutes.some((route) => route.path === item.path),
    ).map((item) => ({
      path: item.path,
      label: item.label,
      summary: item.summary,
      groupId: resolveVendorNavGroupId(item.path),
    }));
  }, [visibleRoutes]);
  const pageTitle = matchedRoute?.definition.title ?? activeItem?.label ?? "Vendor";
  const pageDescription =
    matchedRoute?.definition.description ?? activeItem?.summary ?? "Vendor-only routed workspace.";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(VENDOR_SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
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
          id="vendor-sidebar"
          className={`admin-sidebar${sidebarCollapsed ? " admin-sidebar-collapsed" : ""}${mobileNavOpen ? " admin-sidebar-open" : ""}`}
        >
          <VendorSidebarNavigation
            activePath={activeItem?.path}
            collapsed={sidebarCollapsed}
            compact={sidebarHeaderCompact}
            items={navItems}
            onCloseMobile={() => {
              setMobileNavOpen(false);
            }}
            onSignOut={() => {
              void signOut();
            }}
            onToggleCollapsed={() => {
              setSidebarCollapsed((currentValue) => !currentValue);
            }}
            pathname={location.pathname}
            requestCount={openRequestCount}
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
                  aria-controls="vendor-sidebar"
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

            <div className="vendor-notification-control">
              <button
                type="button"
                className="vendor-notification-button"
                aria-expanded={notificationPanelOpen}
                aria-controls="vendor-notification-panel"
                onClick={() => setNotificationPanelOpen((current) => !current)}
              >
                Notifications
                {unreadNotificationCount > 0 ? (
                  <span aria-label={`${unreadNotificationCount} unread notifications`}>
                    {unreadNotificationCount}
                  </span>
                ) : null}
              </button>

              {notificationPanelOpen ? (
                <section
                  id="vendor-notification-panel"
                  className="vendor-notification-panel"
                  aria-label="Vendor notifications"
                >
                  <header>
                    <div>
                      <h3>Notifications</h3>
                      <p>{attentionItemCount} items need attention</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        markAllRequestsRead();
                        markAllBillingAlertsRead();
                        markAllOnboardingRead();
                      }}
                    >
                      Mark all read
                    </button>
                  </header>
                  <div className="vendor-notification-list">
                    {licenseRequests
                      .filter(
                        (request) =>
                          request.status === "pending" || request.status === "payment_required",
                      )
                      .map((request) => (
                        <button
                          key={request.id}
                          type="button"
                          className={
                            unreadRequestIds.includes(request.id)
                              ? "vendor-notification-item vendor-notification-item-unread"
                              : "vendor-notification-item"
                          }
                          onClick={() => {
                            markRequestRead(request.id);
                            setNotificationPanelOpen(false);
                            navigate(`/vendor/institutes?view=requests&request=${request.id}`);
                          }}
                        >
                          <span>
                            <strong>{request.instituteName}</strong>
                            <small>
                              Requests {request.requestedPlanId} from {request.currentPlanId}
                            </small>
                          </span>
                          <time>{request.submittedAt.slice(0, 10)}</time>
                        </button>
                      ))}
                    {onboardingAttentionRecords.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        className={
                          unreadOnboardingIds.includes(record.id)
                            ? "vendor-notification-item vendor-notification-item-unread"
                            : "vendor-notification-item"
                        }
                        onClick={() => {
                          markOnboardingRead(record.id);
                          setNotificationPanelOpen(false);
                          navigate(`/vendor/institutes?view=onboarding&onboarding=${record.id}`);
                        }}
                      >
                        <span>
                          <strong>{record.instituteName}</strong>
                          <small>Onboarding: {record.status.replaceAll("_", " ")}</small>
                        </span>
                        <time>{record.submittedAt.slice(0, 10)}</time>
                      </button>
                    ))}
                    {billingAlerts.map((alert) => (
                      <button
                        key={alert.id}
                        type="button"
                        className={
                          unreadBillingAlertIds.includes(alert.id)
                            ? "vendor-notification-item vendor-notification-item-unread"
                            : "vendor-notification-item"
                        }
                        onClick={() => {
                          markBillingAlertRead(alert.id);
                          setNotificationPanelOpen(false);
                          navigate(
                            `/vendor/institutes?institute=${alert.instituteId}&tab=activity&invoice=${alert.invoiceId}`,
                          );
                        }}
                      >
                        <span>
                          <strong>{alert.title}</strong>
                          <small>{alert.message}</small>
                        </span>
                        <time>{alert.createdAt.slice(0, 10)}</time>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="vendor-notification-view-all"
                    onClick={() => {
                      setNotificationPanelOpen(false);
                      navigate("/vendor/institutes?view=requests");
                    }}
                  >
                    Open license requests
                  </button>
                </section>
              ) : null}
            </div>
          </header>

          <section className="admin-content-container" aria-label="Vendor main content container">
            <Outlet />
          </section>
        </div>
      </div>
    </main>
  );
}

function renderVendorPlaceholder(title: string, description: string, note: string) {
  return <VendorPlaceholderPage title={title} description={description} note={note} />;
}

function App() {
  usePortalTitle("vendor");

  const basePath = getPortalRoutePrefix("vendor");
  const loginPath = getPortalLoginPath("vendor");
  const protectedDefaultPath = getPortalDefaultAuthenticatedPath("vendor");

  return (
    <VendorLicenseRequestsProvider>
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
          element={
            <VendorProtectedRoute loginPath={loginPath}>
              <VendorRoleGuard>
                <VendorLayout />
              </VendorRoleGuard>
            </VendorProtectedRoute>
          }
        >
          <Route
            path="overview"
            element={
              <VendorRouteBoundary label="Loading overview">
                <VendorOverviewPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="institutes"
            element={
              <VendorRouteBoundary label="Loading institutes">
                <VendorInstituteManagementPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="institutes/:instituteId"
            element={renderVendorPlaceholder(
              "Institute Detail",
              "Institute-specific drill-in route for tenant health, licensing posture, and operational review.",
              "Route shell is now mounted for planned route-map parity. Detailed institute-level workflow panels can be layered in without changing the route contract.",
            )}
          />
          <Route
            path="licensing"
            element={
              <VendorRouteBoundary label="Loading licensing">
                <VendorLicensingPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="calibration"
            element={
              <VendorRouteBoundary label="Loading calibration">
                <VendorCalibrationManagementPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="calibration/simulate"
            element={renderVendorPlaceholder(
              "Calibration Simulation",
              "Dedicated simulation route for testing calibration changes against summary-only historical vendor datasets before rollout.",
              "This mounted shell preserves the simulation route contract while the deeper scenario workspace continues to live in the main calibration surface.",
            )}
          />
          <Route
            path="calibration/history"
            element={renderVendorPlaceholder(
              "Calibration History",
              "Historical calibration timeline route for reviewing prior versions, activation dates, and rollback posture.",
              "This route is mounted so the vendor route registry matches the planned map, while detailed history tooling can be expanded in a later vendor build.",
            )}
          />
          <Route
            path="intelligence"
            element={
              <VendorRouteBoundary label="Loading intelligence">
                <VendorIntelligenceDashboardPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="system-health"
            element={
              <VendorRouteBoundary label="Loading system health">
                <VendorSystemHealthDashboardPage />
              </VendorRouteBoundary>
            }
          />
          <Route
            path="audit"
            element={
              <VendorRouteBoundary label="Loading audit">
                <VendorAuditActivityLogsPage />
              </VendorRouteBoundary>
            }
          />
          <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
        </Route>

        <Route path="*" element={<Navigate to={protectedDefaultPath} replace />} />
      </Routes>
    </VendorLicenseRequestsProvider>
  );
}

export default App;
