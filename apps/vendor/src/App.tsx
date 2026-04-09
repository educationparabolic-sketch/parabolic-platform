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

function VendorPortalHome() {
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
        <p className="portal-eyebrow">Build 113</p>
        <h1>{portal.name}</h1>
        <p className="portal-purpose">{portal.purpose}</p>
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

function App() {
  usePortalTitle("vendor");
  const basePath = PORTAL_MANIFEST.vendor.routePrefix;

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route element={<VendorPortalHome />} path={basePath} />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
