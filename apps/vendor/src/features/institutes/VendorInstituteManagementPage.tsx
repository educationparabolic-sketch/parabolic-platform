import { useMemo, useState, type FormEvent } from "react";
import {
  UiForm,
  UiFormField,
  UiStatCard,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  filterInstitutes,
  getVendorInstitutesDataset,
  type VendorInstituteActionType,
  type VendorInstituteLifecycleStatus,
  type VendorInstituteRecord,
  type VendorInstituteSubscriptionStatus,
} from "./vendorInstitutesDataset";

interface InstituteFilters {
  query: string;
  layer: LicenseLayer | "all";
  subscriptionStatus: VendorInstituteSubscriptionStatus | "all";
  lifecycleStatus: VendorInstituteLifecycleStatus | "all";
}

interface LocalActionRecord {
  id: string;
  actionType: VendorInstituteActionType;
  instituteId: string;
  instituteName: string;
  createdAt: string;
  note: string;
}

const LAYER_FILTERS: Array<InstituteFilters["layer"]> = ["all", "L0", "L1", "L2", "L3"];
const SUBSCRIPTION_FILTERS: Array<InstituteFilters["subscriptionStatus"]> = [
  "all",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];
const LIFECYCLE_FILTERS: Array<InstituteFilters["lifecycleStatus"]> = [
  "all",
  "active",
  "watchlist",
  "suspended",
  "archived",
];

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDeleteGuardPhrase(instituteId: string): string {
  return `DELETE ${instituteId}`;
}

function VendorInstituteManagementPage() {
  const dataset = useMemo(() => getVendorInstitutesDataset(), []);
  const [filters, setFilters] = useState<InstituteFilters>({
    query: "",
    layer: "all",
    subscriptionStatus: "all",
    lifecycleStatus: "all",
  });
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>(dataset.institutes[0]?.id ?? "");
  const [actionNote, setActionNote] = useState<string>("");
  const [deleteGuardInput, setDeleteGuardInput] = useState<string>("");
  const [actionFeed, setActionFeed] = useState<LocalActionRecord[]>([]);

  const filteredInstitutes = useMemo(() => {
    return filterInstitutes(dataset.institutes, filters);
  }, [dataset.institutes, filters]);

  const selectedInstitute = useMemo(() => {
    if (filteredInstitutes.length === 0) {
      return null;
    }

    return (
      filteredInstitutes.find((institute) => institute.id === selectedInstituteId) ?? filteredInstitutes[0]
    );
  }, [filteredInstitutes, selectedInstituteId]);

  const layerOverview = useMemo(() => {
    const totals: Record<LicenseLayer, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };

    for (const institute of filteredInstitutes) {
      totals[institute.currentLicenseLayer] += 1;
    }

    return totals;
  }, [filteredInstitutes]);

  const activitySnapshot = useMemo(() => {
    return filteredInstitutes.reduce(
      (accumulator, institute) => {
        return {
          activeStudents: accumulator.activeStudents + institute.activeStudentCount,
          monthlyUsage: accumulator.monthlyUsage + institute.monthlyUsage,
          monthlyRuns: accumulator.monthlyRuns + institute.activityMetrics.monthlyTestRuns,
        };
      },
      { activeStudents: 0, monthlyUsage: 0, monthlyRuns: 0 },
    );
  }, [filteredInstitutes]);

  const tableColumns = useMemo<Array<UiTableColumn<VendorInstituteRecord>>>(() => {
    return [
      {
        id: "institute",
        header: "Institute",
        render: (row) => (
          <button
            type="button"
            className="vendor-link-button"
            onClick={() => {
              setSelectedInstituteId(row.id);
            }}
          >
            {row.instituteName}
          </button>
        ),
      },
      {
        id: "layer",
        header: "License Layer",
        render: (row) => row.currentLicenseLayer,
      },
      {
        id: "activeStudents",
        header: "Active Students",
        render: (row) => row.activeStudentCount.toLocaleString(),
      },
      {
        id: "subscription",
        header: "Subscription Status",
        render: (row) => toTitleCase(row.subscriptionStatus),
      },
      {
        id: "monthlyUsage",
        header: "Monthly Usage %",
        render: (row) => `${row.monthlyUsage}%`,
      },
      {
        id: "lastActive",
        header: "Last Active",
        render: (row) => formatDateLabel(row.lastActiveDate),
      },
    ];
  }, []);

  function queueAction(actionType: VendorInstituteActionType, note: string) {
    if (!selectedInstitute) {
      return;
    }

    const action: LocalActionRecord = {
      id: `${Date.now()}-${actionType}`,
      actionType,
      instituteId: selectedInstitute.id,
      instituteName: selectedInstitute.instituteName,
      createdAt: new Date().toISOString(),
      note,
    };

    setActionFeed((previous) => [action, ...previous].slice(0, 12));
    setActionNote("");
  }

  function handleActionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    queueAction("ViewInstitute", actionNote.trim() || "Viewed institute profile and metrics.");
  }

  const deleteGuardExpected = selectedInstitute ? buildDeleteGuardPhrase(selectedInstitute.id) : "";
  const isDeleteGuardReady = deleteGuardExpected.length > 0 && deleteGuardInput.trim() === deleteGuardExpected;

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-institutes-title">
      <p className="vendor-content-eyebrow">Build 137</p>
      <h2 id="vendor-institutes-title">Institutes Management</h2>
      <p className="vendor-content-copy">
        Vendor-authoritative institute lifecycle and licensing workspace sourced from the <code>institutes</code>{" "}
        collection.
      </p>

      <div className="vendor-overview-grid">
        <UiStatCard title="Filtered Institutes" value={String(filteredInstitutes.length)} helper="Current table result set" />
        <UiStatCard title="Active Students" value={activitySnapshot.activeStudents.toLocaleString()} helper="Cross-institute active learners" />
        <UiStatCard title="Monthly Test Runs" value={activitySnapshot.monthlyRuns.toLocaleString()} helper="Latest aggregated monthly run count" />
        <UiStatCard title="Layer L0" value={String(layerOverview.L0)} helper="Operational layer institutes" />
        <UiStatCard title="Layer L1" value={String(layerOverview.L1)} helper="Diagnostic layer institutes" />
        <UiStatCard title="Layer L2" value={String(layerOverview.L2)} helper="Controlled layer institutes" />
        <UiStatCard title="Layer L3" value={String(layerOverview.L3)} helper="Governance layer institutes" />
        <UiStatCard title="Average Monthly Usage" value={`${Math.round(activitySnapshot.monthlyUsage / Math.max(filteredInstitutes.length, 1))}%`} helper="Usage pressure across filtered set" />
      </div>

      <div className="vendor-section-grid">
        <UiForm
          title="Search and filtering"
          description="Filter institute rows by name, layer, subscription, and lifecycle state."
          submitLabel="Apply filters"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <UiFormField label="Search" htmlFor="vendor-institute-query" helper="Matches institute name, id, layer, or billing status.">
            <input
              id="vendor-institute-query"
              value={filters.query}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, query: event.target.value }));
              }}
              placeholder="Search institutes"
            />
          </UiFormField>

          <UiFormField label="License layer" htmlFor="vendor-institute-layer">
            <select
              id="vendor-institute-layer"
              value={filters.layer}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, layer: event.target.value as InstituteFilters["layer"] }));
              }}
            >
              {LAYER_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All layers" : option}
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="Subscription status" htmlFor="vendor-institute-subscription">
            <select
              id="vendor-institute-subscription"
              value={filters.subscriptionStatus}
              onChange={(event) => {
                setFilters((previous) => ({
                  ...previous,
                  subscriptionStatus: event.target.value as InstituteFilters["subscriptionStatus"],
                }));
              }}
            >
              {SUBSCRIPTION_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All subscriptions" : toTitleCase(option)}
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="Lifecycle status" htmlFor="vendor-institute-lifecycle">
            <select
              id="vendor-institute-lifecycle"
              value={filters.lifecycleStatus}
              onChange={(event) => {
                setFilters((previous) => ({
                  ...previous,
                  lifecycleStatus: event.target.value as InstituteFilters["lifecycleStatus"],
                }));
              }}
            >
              {LIFECYCLE_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All lifecycle states" : toTitleCase(option)}
                </option>
              ))}
            </select>
          </UiFormField>
        </UiForm>

        <UiForm
          title="Institute profile view"
          description="Inspect selected institute profile, license layer, and activity metrics before lifecycle actions."
          submitLabel="Log ViewInstitute"
          onSubmit={handleActionSubmit}
          footer={
            <button
              type="button"
              onClick={() => {
                setFilters({ query: "", layer: "all", subscriptionStatus: "all", lifecycleStatus: "all" });
              }}
            >
              Reset filters
            </button>
          }
        >
          {selectedInstitute ? (
            <>
              <p className="vendor-profile-title">
                <strong>{selectedInstitute.instituteName}</strong> <span>({selectedInstitute.id})</span>
              </p>
              <p className="vendor-profile-detail">
                License Layer: <strong>{selectedInstitute.currentLicenseLayer}</strong> | Subscription:{" "}
                <strong>{toTitleCase(selectedInstitute.subscriptionStatus)}</strong> | Payment:{" "}
                <strong>{selectedInstitute.paymentStatus}</strong>
              </p>
              <p className="vendor-profile-detail">
                Activity: {selectedInstitute.activityMetrics.monthlyTestRuns.toLocaleString()} monthly runs, discipline index{" "}
                {selectedInstitute.activityMetrics.averageDisciplineIndex}, high-risk students{" "}
                {selectedInstitute.activityMetrics.highRiskStudents.toLocaleString()}.
              </p>
              <UiFormField label="Action note" htmlFor="vendor-action-note" helper="Stored locally for deterministic workflow evidence.">
                <input
                  id="vendor-action-note"
                  value={actionNote}
                  onChange={(event) => {
                    setActionNote(event.target.value);
                  }}
                  placeholder="Reason or operator note"
                />
              </UiFormField>
            </>
          ) : (
            <p className="vendor-content-note">No institute matches the selected filters.</p>
          )}
        </UiForm>
      </div>

      <UiTable
        caption="Institute listing table"
        columns={tableColumns}
        rows={filteredInstitutes}
        rowKey={(row) => row.id}
        emptyStateText="No institutes matched the selected filters."
      />

      <div className="vendor-section-grid vendor-section-grid-actions">
        <section className="ui-form-card" aria-label="Institute lifecycle actions">
          <header className="ui-form-header">
            <h3>Lifecycle and license actions</h3>
            <p>
              Actions follow vendor authority for institute lifecycle and license transitions. Delete is hard-guarded.
            </p>
          </header>
          <div className="vendor-action-buttons">
            <button type="button" onClick={() => queueAction("SuspendInstitute", actionNote || "Suspension requested by vendor control plane.")}>SuspendInstitute</button>
            <button type="button" onClick={() => queueAction("UpgradeLicense", actionNote || "License upgraded from vendor licensing control.")}>UpgradeLicense</button>
            <button type="button" onClick={() => queueAction("DowngradeLicense", actionNote || "License downgraded from vendor licensing control.")}>DowngradeLicense</button>
            <button type="button" onClick={() => queueAction("ExtendLicense", actionNote || "License window extended by vendor authorization.")}>ExtendLicense</button>
            <button type="button" onClick={() => queueAction("ForceArchive", actionNote || "Archive workflow initiated by vendor operator.")}>ForceArchive</button>
          </div>
          <label className="vendor-delete-guard" htmlFor="vendor-delete-guard-input">
            <span>
              Hard guard for DeleteInstitute. Type <code>{deleteGuardExpected || "DELETE <instituteId>"}</code>.
            </span>
            <input
              id="vendor-delete-guard-input"
              value={deleteGuardInput}
              onChange={(event) => {
                setDeleteGuardInput(event.target.value);
              }}
              placeholder="DELETE institute_id"
            />
          </label>
          <button
            type="button"
            className="vendor-danger-button"
            disabled={!isDeleteGuardReady}
            onClick={() => {
              queueAction("DeleteInstitute", actionNote || "Hard-guard delete request logged for manual approval.");
              setDeleteGuardInput("");
            }}
          >
            DeleteInstitute (hard-guard protected)
          </button>
        </section>

        <UiTable
          caption="Recent local action queue"
          columns={[
            {
              id: "time",
              header: "Timestamp",
              render: (row: LocalActionRecord) => formatDateLabel(row.createdAt),
            },
            {
              id: "action",
              header: "Action",
              render: (row: LocalActionRecord) => row.actionType,
            },
            {
              id: "institute",
              header: "Institute",
              render: (row: LocalActionRecord) => row.instituteName,
            },
            {
              id: "note",
              header: "Note",
              render: (row: LocalActionRecord) => row.note,
            },
          ]}
          rows={actionFeed}
          rowKey={(row) => row.id}
          emptyStateText="No actions queued yet."
        />
      </div>
    </section>
  );
}

export default VendorInstituteManagementPage;
