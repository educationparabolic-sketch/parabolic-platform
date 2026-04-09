import { useState, type FormEvent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
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

function StudentPortalHome() {
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
        <p className="portal-eyebrow">Build 113</p>
        <h1>{portal.name}</h1>
        <p className="portal-purpose">{portal.purpose}</p>
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

function App() {
  usePortalTitle("student");
  const basePath = PORTAL_MANIFEST.student.routePrefix;

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route element={<StudentPortalHome />} path={basePath} />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
