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

function ExamPortalHome(props: { onLogout: () => Promise<void> }) {
  const { onLogout } = props;
  const portal = PORTAL_MANIFEST.exam;
  const checkpoints = [
    { id: "cp-1", step: "Token Validation", status: "Ready", owner: "Guard" },
    { id: "cp-2", step: "Session Snapshot", status: "Ready", owner: "Runtime" },
    { id: "cp-3", step: "Template Snapshot", status: "Ready", owner: "Runtime" },
    { id: "cp-4", step: "Clock Sync", status: "Pending", owner: "Timing Engine" },
  ];
  const chartData = [
    { label: "Boot Ready", value: 3 },
    { label: "Pending", value: 1 },
    { label: "Blocked", value: 0 },
  ];
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 2;
  const pageStart = (page - 1) * pageSize;
  const visibleRows = checkpoints.slice(pageStart, pageStart + pageSize);

  function handleConfigSubmit(event: FormEvent<HTMLFormElement>) {
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
          title="Exam Navigation"
          subtitle="Shared navbar component"
          activeItemId="session"
          items={[
            { id: "session", label: "Session", hint: "/session" },
            { id: "integrity", label: "Integrity", hint: "Guard checks" },
            { id: "submit", label: "Submit", hint: "Finalization" },
          ]}
        />
        <UiForm
          title="Runtime Bootstrap"
          description="Shared form component for exam entry options"
          submitLabel="Validate Entry"
          onSubmit={handleConfigSubmit}
        >
          <UiFormField label="Session Id" htmlFor="exam-session-id">
            <input id="exam-session-id" type="text" defaultValue="demo-session" />
          </UiFormField>
          <UiFormField label="Token" htmlFor="exam-token">
            <input id="exam-token" type="text" defaultValue="demo-exam-token" />
          </UiFormField>
        </UiForm>
        <UiChartContainer
          title="Bootstrap State"
          subtitle="Shared chart container component"
          data={chartData}
          maxValue={4}
        />
        <UiTable
          caption="Execution Checkpoints"
          rows={visibleRows}
          rowKey={(row) => row.id}
          columns={[
            { id: "step", header: "Step", render: (row) => row.step },
            { id: "status", header: "Status", render: (row) => row.status },
            { id: "owner", header: "Owner", render: (row) => row.owner },
          ]}
        />
        <UiPagination
          page={page}
          pageSize={pageSize}
          totalItems={checkpoints.length}
          onPageChange={setPage}
        />
        <UiModal
          isOpen={isModalOpen}
          title="Entry Validation Simulated"
          description="Shared modal dialog component"
          onClose={() => setIsModalOpen(false)}
        >
          <p>Exam entry simulation is complete for Build 115 authentication integration.</p>
        </UiModal>
      </section>
    </main>
  );
}

function ExamLoginPage(props: { loginPath: string; protectedPath: string }) {
  const { loginPath, protectedPath } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, clearError } = useAuthProvider();
  const [email, setEmail] = useState("exam@parabolic.local");
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
        <h1>Exam Login</h1>
        <p className="portal-purpose">
          Authenticated access gate for exam runtime shell routes.
        </p>
        <UiForm
          title="Sign In"
          description="Use Firebase credentials configured for this environment"
          submitLabel="Login"
          onSubmit={handleSubmit}
        >
          <UiFormField label="Email" htmlFor="exam-login-email">
            <input
              id="exam-login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </UiFormField>
          <UiFormField label="Password" htmlFor="exam-login-password">
            <input
              id="exam-login-password"
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

function ExamProtectedRoute(props: {
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
  usePortalTitle("exam");
  const basePath = PORTAL_MANIFEST.exam.routePrefix;
  const loginPath = `${basePath}/login`;
  const { signOut } = useAuthProvider();

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route
        element={<ExamLoginPage loginPath={loginPath} protectedPath={basePath} />}
        path={loginPath}
      />
      <Route
        element={(
          <ExamProtectedRoute loginPath={loginPath}>
            <ExamPortalHome onLogout={signOut} />
          </ExamProtectedRoute>
        )}
        path={basePath}
      />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
