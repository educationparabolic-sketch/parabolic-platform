import { useState, type FormEvent, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { useAuthProvider } from "../../../shared/services/authProvider";
import { PORTAL_MANIFEST } from "../../../shared/services/portalManifest";
import {
  UiChartContainer,
  UiForm,
  UiFormField,
  UiModal,
  UiNavBar,
  UiPagination,
  UiTable,
} from "../../../shared/ui/components";

function VendorPortalHome(props: { onLogout: () => Promise<void> }) {
  const { onLogout } = props;
  const portal = PORTAL_MANIFEST.vendor;
  const instituteRows = [
    { id: "inst-1", name: "North Ridge", layer: "L2", status: "Active" },
    { id: "inst-2", name: "Summit Academy", layer: "L3", status: "Active" },
    { id: "inst-3", name: "Lakeside School", layer: "L1", status: "Trial" },
    { id: "inst-4", name: "Pioneer Campus", layer: "L2", status: "Suspended" },
  ];
  const chartData = [
    { label: "Active", value: 2 },
    { label: "Trial", value: 1 },
    { label: "Suspended", value: 1 },
  ];
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 2;
  const pageStart = (page - 1) * pageSize;
  const visibleRows = instituteRows.slice(pageStart, pageStart + pageSize);

  function handleVendorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsModalOpen(true);
  }

  return (
    <main className="portal-shell">
      <section className="portal-card">
        <p className="portal-eyebrow">Build 115</p>
        <h1>{portal.name}</h1>
        <p className="portal-purpose">{portal.purpose}</p>
        <button onClick={() => void onLogout()} type="button">Logout</button>
        <UiNavBar
          title="Vendor Navigation"
          subtitle="Shared navbar component"
          activeItemId="overview"
          items={[
            { id: "overview", label: "Overview", hint: "/vendor" },
            { id: "institutes", label: "Institutes", hint: "/vendor/institutes" },
            { id: "licensing", label: "Licensing", hint: "/vendor/licensing" },
          ]}
        />
        <UiForm
          title="Portfolio Filters"
          description="Shared form component"
          submitLabel="Apply"
          onSubmit={handleVendorSubmit}
        >
          <UiFormField label="Plan Layer" htmlFor="vendor-layer">
            <select id="vendor-layer" defaultValue="all">
              <option value="all">All Layers</option>
              <option value="L3">L3</option>
              <option value="L2">L2</option>
              <option value="L1">L1</option>
            </select>
          </UiFormField>
          <UiFormField label="Institute Search" htmlFor="vendor-search">
            <input id="vendor-search" type="text" placeholder="Search institute" />
          </UiFormField>
        </UiForm>
        <UiChartContainer
          title="Institute Status"
          subtitle="Shared chart container component"
          data={chartData}
          maxValue={3}
        />
        <UiTable
          caption="Institute Portfolio"
          rows={visibleRows}
          rowKey={(row) => row.id}
          columns={[
            { id: "name", header: "Institute", render: (row) => row.name },
            { id: "layer", header: "Layer", render: (row) => row.layer },
            { id: "status", header: "Status", render: (row) => row.status },
          ]}
        />
        <UiPagination
          page={page}
          pageSize={pageSize}
          totalItems={instituteRows.length}
          onPageChange={setPage}
        />
        <UiModal
          isOpen={isModalOpen}
          title="Filter Profile Saved"
          description="Shared modal dialog component"
          onClose={() => setIsModalOpen(false)}
        >
          <p>Vendor filter profile has been staged locally for this shared UI build.</p>
        </UiModal>
      </section>
    </main>
  );
}

function VendorLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, clearError } = useAuthProvider();
  const [email, setEmail] = useState("vendor@parabolic.local");
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
    <main className="portal-shell">
      <section className="portal-card">
        <p className="portal-eyebrow">Build 115</p>
        <h1>Vendor Login</h1>
        <p className="portal-purpose">
          Authenticated entry point for vendor portal routes.
        </p>
        <UiForm
          title="Sign In"
          description="Use Firebase credentials configured for this environment"
          submitLabel="Login"
          onSubmit={handleSubmit}
        >
          <UiFormField label="Email" htmlFor="vendor-login-email">
            <input
              id="vendor-login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </UiFormField>
          <UiFormField label="Password" htmlFor="vendor-login-password">
            <input
              id="vendor-login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </UiFormField>
        </UiForm>
        {session.error ? <p role="alert">{session.error}</p> : null}
        <p>
          Protected path: <code>{protectedPath}</code>
        </p>
        <p>
          Login route: <code>{loginPath}</code>
        </p>
      </section>
    </main>
  );
}

function VendorProtectedRoute(props: {
  loginPath: string;
  children: ReactElement;
}) {
  const { loginPath, children } = props;
  const location = useLocation();
  const { session } = useAuthProvider();

  if (session.status === "loading") {
    return (
      <main className="portal-shell">
        <section className="portal-card">
          <p className="portal-eyebrow">Build 115</p>
          <h1>Checking session</h1>
          <p className="portal-purpose">Restoring Firebase authentication state.</p>
        </section>
      </main>
    );
  }

  if (session.status !== "authenticated") {
    return <Navigate replace to={loginPath} state={{ from: location.pathname }} />;
  }

  return children;
}

function App() {
  usePortalTitle("vendor");
  const basePath = PORTAL_MANIFEST.vendor.routePrefix;
  const loginPath = `${basePath}/login`;
  const { signOut } = useAuthProvider();

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route
        element={<VendorLoginPage loginPath={loginPath} protectedPath={basePath} />}
        path={loginPath}
      />
      <Route
        element={(
          <VendorProtectedRoute loginPath={loginPath}>
            <VendorPortalHome onLogout={signOut} />
          </VendorProtectedRoute>
        )}
        path={basePath}
      />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
