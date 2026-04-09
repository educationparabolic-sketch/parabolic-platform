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

function ExamPortalHome() {
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
        <p className="portal-eyebrow">Build 113</p>
        <h1>{portal.name}</h1>
        <p className="portal-purpose">{portal.purpose}</p>
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
          <p>Exam entry simulation is complete for Build 113 shared UI foundation.</p>
        </UiModal>
      </section>
    </main>
  );
}

function App() {
  usePortalTitle("exam");
  const basePath = PORTAL_MANIFEST.exam.routePrefix;

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route element={<ExamPortalHome />} path={basePath} />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
