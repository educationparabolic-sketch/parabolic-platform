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

function StudentPortalHome(props: { onLogout: () => Promise<void> }) {
  const { onLogout } = props;
  const portal = PORTAL_MANIFEST.student;
  const rows = [
    { id: "run-118", test: "Quadratic Drill", accuracy: "82%", discipline: "Stable" },
    { id: "run-119", test: "Electrostatics Sprint", accuracy: "76%", discipline: "Watch" },
    { id: "run-120", test: "Organic Revision", accuracy: "88%", discipline: "Stable" },
    { id: "run-121", test: "Vector Timed Set", accuracy: "79%", discipline: "Improving" },
    { id: "run-122", test: "Wave Practice", accuracy: "85%", discipline: "Stable" },
    { id: "run-123", test: "Probability Set", accuracy: "74%", discipline: "Watch" },
  ];
  const chartData = [
    { label: "Raw %", value: 79 },
    { label: "Accuracy %", value: 83 },
    { label: "Participation", value: 92 },
    { label: "Discipline", value: 77 },
  ];
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 3;
  const pageStart = (page - 1) * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
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
          title="Student Navigation"
          subtitle="Shared navbar component from shared/ui"
          activeItemId="dashboard"
          items={[
            { id: "dashboard", label: "Dashboard", hint: "/student" },
            { id: "tests", label: "My Tests", hint: "/student/my-tests" },
            { id: "performance", label: "Performance", hint: "/student/performance" },
          ]}
        />
        <UiForm
          title="Result Filters"
          description="Shared form and field components"
          submitLabel="Apply Filters"
          onSubmit={handleFilterSubmit}
        >
          <UiFormField label="Academic Window" htmlFor="student-window">
            <select id="student-window" defaultValue="current-year">
              <option value="current-year">Current Year</option>
              <option value="last-run">Last 3 Runs</option>
              <option value="all">All Available</option>
            </select>
          </UiFormField>
          <UiFormField
            label="Search"
            htmlFor="student-search"
            helper="Use test name or run id"
          >
            <input id="student-search" type="text" placeholder="Search test" />
          </UiFormField>
        </UiForm>
        <UiChartContainer
          title="Performance Summary"
          subtitle="Shared chart container component"
          data={chartData}
          maxValue={100}
        />
        <UiTable
          caption="Recent Performance"
          rows={pageRows}
          rowKey={(row) => row.id}
          columns={[
            { id: "test", header: "Test", render: (row) => row.test },
            { id: "accuracy", header: "Accuracy", render: (row) => row.accuracy },
            { id: "discipline", header: "Discipline", render: (row) => row.discipline },
          ]}
        />
        <UiPagination
          page={page}
          pageSize={pageSize}
          totalItems={rows.length}
          onPageChange={setPage}
        />
        <UiModal
          isOpen={isModalOpen}
          title="Filter Draft Saved"
          description="Shared modal dialog component"
          onClose={() => setIsModalOpen(false)}
        >
          <p>Your filter choices are saved in the local UI state for this foundation build.</p>
        </UiModal>
      </section>
    </main>
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
    <main className="portal-shell">
      <section className="portal-card">
        <p className="portal-eyebrow">Build 115</p>
        <h1>Student Login</h1>
        <p className="portal-purpose">
          Firebase-authenticated student access for protected student routes.
        </p>
        <UiForm
          title="Sign In"
          description="Use Firebase credentials configured for this environment"
          submitLabel="Login"
          onSubmit={handleSubmit}
        >
          <UiFormField label="Email" htmlFor="student-login-email">
            <input
              id="student-login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </UiFormField>
          <UiFormField label="Password" htmlFor="student-login-password">
            <input
              id="student-login-password"
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

function StudentProtectedRoute(props: {
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
  usePortalTitle("student");
  const basePath = PORTAL_MANIFEST.student.routePrefix;
  const loginPath = `${basePath}/login`;
  const { signOut } = useAuthProvider();

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route
        element={<StudentLoginPage loginPath={loginPath} protectedPath={basePath} />}
        path={loginPath}
      />
      <Route
        element={(
          <StudentProtectedRoute loginPath={loginPath}>
            <StudentPortalHome onLogout={signOut} />
          </StudentProtectedRoute>
        )}
        path={basePath}
      />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
