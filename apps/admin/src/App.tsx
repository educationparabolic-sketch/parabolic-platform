import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  DEFAULT_ROUTE_BY_ROLE,
  LICENSE_LAYER_ORDER,
  PORTAL_DOMAINS,
  ROUTE_FAMILIES,
  type LicenseLayer,
  type PortalDomainKey,
  type PortalRole,
  type RouteAccessDecision,
  type RoutingSessionContext,
} from "../../../shared/types/portalRouting";

type RouteFamily = (typeof ROUTE_FAMILIES)[number]["family"];

interface NavigationState {
  family: RouteFamily;
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
}

interface PortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

const AdminPortalShell = lazy(() => import("./portals/AdminPortalShell.tsx"));
const StudentPortalShell = lazy(() => import("./portals/StudentPortalShell.tsx"));
const ExamPortalShell = lazy(() => import("./portals/ExamPortalShell.tsx"));
const VendorPortalShell = lazy(() => import("./portals/VendorPortalShell.tsx"));

const DEFAULT_SESSION: RoutingSessionContext = {
  isAuthenticated: false,
  role: null,
  licenseLayer: null,
  instituteActive: true,
  isSuspended: false,
};

const STORAGE_KEY = "parabolic-build-66-session";

function normalizePathname(pathname: string): string {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }

  return pathname.length > 1 && pathname.endsWith("/") ?
    pathname.slice(0, -1) :
    pathname;
}

function resolveActiveDomain(hostname: string): PortalDomainKey {
  const normalizedHostname = hostname.toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname.endsWith(".localhost")
  ) {
    return "development";
  }

  const matchedDomain = Object.values(PORTAL_DOMAINS).find((domain) =>
    domain.hostname === normalizedHostname,
  );

  return matchedDomain?.key ?? "marketing";
}

function resolveRouteFamily(pathname: string): RouteFamily {
  const normalizedPathname = normalizePathname(pathname);
  const matchedFamily = ROUTE_FAMILIES.find((family) =>
    normalizedPathname === family.matchPrefix ||
    normalizedPathname.startsWith(`${family.matchPrefix}/`),
  );

  return matchedFamily?.family ?? "public";
}

function determineNavigationState(pathname: string, hostname: string): NavigationState {
  const family = resolveRouteFamily(pathname);
  const routeFamily = ROUTE_FAMILIES.find((entry) => entry.family === family);
  const activeDomain = resolveActiveDomain(hostname);

  return {
    family,
    pathname: normalizePathname(pathname),
    activeDomain,
    canonicalDomain: routeFamily?.canonicalDomain ?? "marketing",
  };
}

function buildCanonicalUrl(pathname: string, domain: PortalDomainKey): string {
  const canonicalHostname = PORTAL_DOMAINS[domain].hostname;
  return `https://${canonicalHostname}${normalizePathname(pathname)}`;
}

function evaluateRouteAccess(
  navigationState: NavigationState,
  session: RoutingSessionContext,
): RouteAccessDecision {
  const { family, pathname, activeDomain } = navigationState;

  if (family === "public") {
    return {
      allowed: false,
      redirectTo: session.isAuthenticated && session.role ?
        DEFAULT_ROUTE_BY_ROLE[session.role] :
        "/login",
      reason: null,
    };
  }

  if (family === "login" || family === "unauthorized") {
    return { allowed: true, redirectTo: null, reason: null };
  }

  const routeFamily = ROUTE_FAMILIES.find((entry) => entry.family === family);
  if (!routeFamily) {
    return { allowed: false, redirectTo: "/unauthorized", reason: "unauthorized" };
  }

  if (activeDomain !== "development" && activeDomain !== routeFamily.canonicalDomain) {
    return {
      allowed: false,
      redirectTo: buildCanonicalUrl(pathname, routeFamily.canonicalDomain),
      reason: "invalid_domain",
    };
  }

  if (routeFamily.requiresAuthentication && !session.isAuthenticated) {
    return { allowed: false, redirectTo: "/login", reason: "unauthenticated" };
  }

  if (session.isSuspended) {
    return { allowed: false, redirectTo: "/unauthorized", reason: "suspended_account" };
  }

  if (!session.instituteActive && family !== "vendor") {
    return { allowed: false, redirectTo: "/unauthorized", reason: "inactive_institute" };
  }

  if (session.role && !routeFamily.allowedRoles.includes(session.role)) {
    return { allowed: false, redirectTo: "/unauthorized", reason: "unauthorized" };
  }

  if (pathname === "/admin/governance") {
    if (session.role !== "director") {
      return { allowed: false, redirectTo: "/unauthorized", reason: "unauthorized" };
    }

    if (!session.licenseLayer || LICENSE_LAYER_ORDER[session.licenseLayer] < LICENSE_LAYER_ORDER.L3) {
      return { allowed: false, redirectTo: "/admin/overview", reason: "license_restricted" };
    }
  }

  if (family === "student" && pathname === "/student/discipline") {
    if (!session.licenseLayer || LICENSE_LAYER_ORDER[session.licenseLayer] < LICENSE_LAYER_ORDER.L2) {
      return { allowed: false, redirectTo: "/student/dashboard", reason: "license_restricted" };
    }
  }

  if (family === "student" && pathname === "/student/insights") {
    if (!session.licenseLayer || LICENSE_LAYER_ORDER[session.licenseLayer] < LICENSE_LAYER_ORDER.L1) {
      return { allowed: false, redirectTo: "/student/dashboard", reason: "license_restricted" };
    }
  }

  return { allowed: true, redirectTo: null, reason: null };
}

function loadStoredSession(): RoutingSessionContext {
  if (typeof window === "undefined") {
    return DEFAULT_SESSION;
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (!storedValue) {
    return DEFAULT_SESSION;
  }

  try {
    return {
      ...DEFAULT_SESSION,
      ...(JSON.parse(storedValue) as Partial<RoutingSessionContext>),
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

function LoginPage(props: {
  session: RoutingSessionContext;
  onAuthenticate: (role: PortalRole) => void;
  onLicenseLayerChange: (licenseLayer: LicenseLayer) => void;
  onInstituteActiveChange: (value: boolean) => void;
  onSuspendedChange: (value: boolean) => void;
  onLogout: () => void;
}) {
  const { session, onAuthenticate, onLicenseLayerChange, onInstituteActiveChange, onSuspendedChange, onLogout } =
    props;

  return (
    <section className="surface">
      <p className="eyebrow">Build 66</p>
      <h1>Multi-Portal Routing Framework</h1>
      <p className="lede">
        Login and unauthorized flows are now centralized so role, license, institute state,
        and suspension checks can resolve to the correct portal family before feature routes are
        added in later builds.
      </p>
      <div className="controls-grid">
        <label>
          <span>License Layer</span>
          <select
            value={session.licenseLayer ?? "L0"}
            onChange={(event) => onLicenseLayerChange(event.target.value as LicenseLayer)}
          >
            <option value="L0">L0</option>
            <option value="L1">L1</option>
            <option value="L2">L2</option>
            <option value="L3">L3</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input
            checked={session.instituteActive}
            type="checkbox"
            onChange={(event) => onInstituteActiveChange(event.target.checked)}
          />
          <span>Institute active</span>
        </label>
        <label className="checkbox-field">
          <input
            checked={session.isSuspended}
            type="checkbox"
            onChange={(event) => onSuspendedChange(event.target.checked)}
          />
          <span>Account suspended</span>
        </label>
      </div>
      <div className="role-grid">
        <button onClick={() => onAuthenticate("student")}>Continue as Student</button>
        <button onClick={() => onAuthenticate("teacher")}>Continue as Teacher</button>
        <button onClick={() => onAuthenticate("admin")}>Continue as Admin</button>
        <button onClick={() => onAuthenticate("director")}>Continue as Director</button>
        <button onClick={() => onAuthenticate("vendor")}>Continue as Vendor</button>
      </div>
      {session.isAuthenticated ? (
        <button className="ghost-button" onClick={onLogout}>Clear Session</button>
      ) : null}
    </section>
  );
}

function UnauthorizedPage(props: {
  decision: RouteAccessDecision;
  pathname: string;
  canonicalHostname: string;
}) {
  const { decision, pathname, canonicalHostname } = props;

  return (
    <section className="surface">
      <p className="eyebrow">Access Blocked</p>
      <h1>Unauthorized Route</h1>
      <p className="lede">
        The current route failed guard evaluation with reason
        {" "}
        <strong>{decision.reason ?? "unknown"}</strong>.
      </p>
      <dl className="meta-grid">
        <div>
          <dt>Path</dt>
          <dd>{pathname}</dd>
        </div>
        <div>
          <dt>Canonical Host</dt>
          <dd>{canonicalHostname}</dd>
        </div>
        <div>
          <dt>Redirect</dt>
          <dd>{decision.redirectTo ?? "None"}</dd>
        </div>
      </dl>
    </section>
  );
}

function RouteFrame(props: {
  session: RoutingSessionContext;
  navigationState: NavigationState;
  onNavigate: (pathname: string, replace?: boolean) => void;
  onLogout: () => void;
}) {
  const { session, navigationState, onNavigate, onLogout } = props;
  const canonicalHostname = PORTAL_DOMAINS[navigationState.canonicalDomain].hostname;
  const commonProps: PortalShellProps = {
    pathname: navigationState.pathname,
    activeDomain: navigationState.activeDomain,
    canonicalDomain: navigationState.canonicalDomain,
    canonicalHostname,
  };

  let portalComponent = <AdminPortalShell {...commonProps} />;

  switch (navigationState.family) {
  case "student":
    portalComponent = <StudentPortalShell {...commonProps} />;
    break;
  case "exam":
    portalComponent = <ExamPortalShell {...commonProps} />;
    break;
  case "vendor":
    portalComponent = <VendorPortalShell {...commonProps} />;
    break;
  case "admin":
  default:
    portalComponent = <AdminPortalShell {...commonProps} />;
    break;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Routing Runtime</p>
          <h1>Parabolic Platform</h1>
        </div>
        <div className="session-pill">
          <span>{session.role ?? "guest"}</span>
          <span>{session.licenseLayer ?? "L0"}</span>
          <button className="ghost-button" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <nav className="path-nav">
        <button onClick={() => onNavigate("/admin/overview")}>Admin</button>
        <button onClick={() => onNavigate("/student/dashboard")}>Student</button>
        <button onClick={() => onNavigate("/session/demo-session")}>Exam</button>
        <button onClick={() => onNavigate("/vendor/overview")}>Vendor</button>
      </nav>
      <Suspense fallback={<section className="surface">Loading route family…</section>}>
        {portalComponent}
      </Suspense>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<RoutingSessionContext>(() => loadStoredSession());
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePathname(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  const navigationState = useMemo(
    () => determineNavigationState(pathname, window.location.hostname),
    [pathname],
  );

  const decision = useMemo(
    () => evaluateRouteAccess(navigationState, session),
    [navigationState, session],
  );

  useEffect(() => {
    if (!decision.allowed && decision.redirectTo) {
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (decision.redirectTo !== currentUrl) {
        window.location.replace(decision.redirectTo);
      }
    }
  }, [decision]);

  function navigate(nextPathname: string, replace = false) {
    const normalizedPathname = normalizePathname(nextPathname);
    if (replace) {
      window.history.replaceState({}, "", normalizedPathname);
    } else {
      window.history.pushState({}, "", normalizedPathname);
    }
    setPathname(normalizedPathname);
  }

  function updateSession(nextSession: RoutingSessionContext) {
    setSession(nextSession);
  }

  function handleAuthenticate(role: PortalRole) {
    const licenseLayer = role === "director" ? "L3" : (session.licenseLayer ?? "L0");
    const nextSession: RoutingSessionContext = {
      ...session,
      isAuthenticated: true,
      role,
      licenseLayer,
    };

    updateSession(nextSession);
    navigate(DEFAULT_ROUTE_BY_ROLE[role], true);
  }

  function handleLogout() {
    updateSession(DEFAULT_SESSION);
    navigate("/login", true);
  }

  if (navigationState.family === "login") {
    return (
      <main className="page-shell">
        <LoginPage
          session={session}
          onAuthenticate={handleAuthenticate}
          onInstituteActiveChange={(value) => updateSession({...session, instituteActive: value})}
          onLicenseLayerChange={(licenseLayer) => updateSession({...session, licenseLayer})}
          onSuspendedChange={(value) => updateSession({...session, isSuspended: value})}
          onLogout={handleLogout}
        />
      </main>
    );
  }

  if (navigationState.family === "unauthorized") {
    return (
      <main className="page-shell">
        <UnauthorizedPage
          canonicalHostname={PORTAL_DOMAINS[navigationState.canonicalDomain].hostname}
          decision={decision}
          pathname={navigationState.pathname}
        />
      </main>
    );
  }

  if (!decision.allowed) {
    return null;
  }

  return (
    <main className="page-shell">
      <RouteFrame
        navigationState={navigationState}
        onLogout={handleLogout}
        onNavigate={navigate}
        session={session}
      />
    </main>
  );
}

export default App;
