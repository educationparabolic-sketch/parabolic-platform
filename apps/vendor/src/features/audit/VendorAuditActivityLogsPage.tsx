import { useMemo, useState } from "react";
import {
  UiForm,
  UiFormField,
  UiStatCard,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  getCalibrationAuditRecords,
  getVendorCalibrationDataset,
  type VendorCalibrationAuditRecord,
} from "../calibration/vendorCalibrationDataset";

interface AuditFilters {
  query: string;
  actionType: "all" | VendorCalibrationAuditRecord["actionType"];
  eventScope: "all" | VendorCalibrationAuditRecord["eventScope"];
}

const ACTION_FILTERS: AuditFilters["actionType"][] = [
  "all",
  "CalibrationPush",
  "ManualOverride",
  "SimulationExecuted",
  "RollbackQueued",
  "RollbackApplied",
];

const SCOPE_FILTERS: AuditFilters["eventScope"][] = ["all", "Global", "SelectedInstitutes"];

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function filterRecords(records: VendorCalibrationAuditRecord[], filters: AuditFilters) {
  const query = filters.query.trim().toLowerCase();

  return records.filter((entry) => {
    if (filters.actionType !== "all" && entry.actionType !== filters.actionType) {
      return false;
    }

    if (filters.eventScope !== "all" && entry.eventScope !== filters.eventScope) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      entry.id,
      entry.actionType,
      entry.actorUid,
      entry.targetId,
      entry.calibrationVersionId,
      entry.note,
      entry.instituteIds.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function VendorAuditActivityLogsPage() {
  const dataset = useMemo(() => getVendorCalibrationDataset(), []);
  const [filters, setFilters] = useState<AuditFilters>({
    query: "",
    actionType: "all",
    eventScope: "all",
  });

  const records = useMemo(() => {
    return getCalibrationAuditRecords(dataset);
  }, [dataset]);

  const filteredRecords = useMemo(() => {
    return filterRecords(records, filters);
  }, [records, filters]);

  const actionDistribution = useMemo(() => {
    return filteredRecords.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.actionType] = (accumulator[entry.actionType] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [filteredRecords]);

  const columns = useMemo<Array<UiTableColumn<VendorCalibrationAuditRecord>>>(() => {
    return [
      {
        id: "createdAt",
        header: "Timestamp",
        render: (row) => formatDateLabel(row.createdAt),
      },
      {
        id: "actorUid",
        header: "Actor",
        render: (row) => row.actorUid,
      },
      {
        id: "actionType",
        header: "Action",
        render: (row) => row.actionType,
      },
      {
        id: "eventScope",
        header: "Scope",
        render: (row) => row.eventScope,
      },
      {
        id: "targetId",
        header: "Target",
        render: (row) => row.targetId,
      },
      {
        id: "calibrationVersionId",
        header: "Version",
        render: (row) => row.calibrationVersionId,
      },
      {
        id: "instituteIds",
        header: "Institute Targets",
        render: (row) => (row.instituteIds.length > 0 ? row.instituteIds.join(", ") : "Global"),
      },
      {
        id: "note",
        header: "Note",
        render: (row) => row.note,
      },
    ];
  }, []);

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-audit-title">
      <p className="vendor-content-eyebrow">Build 138</p>
      <h2 id="vendor-audit-title">Audit &amp; Activity Logs</h2>
      <p className="vendor-content-copy">
        Immutable append-only vendor governance log for calibration pushes, overrides, simulations, and rollback
        actions.
      </p>

      <div className="vendor-overview-grid">
        <UiStatCard title="Filtered Events" value={String(filteredRecords.length)} helper="Current audit result set" />
        <UiStatCard title="CalibrationPush" value={String(actionDistribution.CalibrationPush ?? 0)} helper="Deployment events" />
        <UiStatCard title="ManualOverride" value={String(actionDistribution.ManualOverride ?? 0)} helper="Override actions" />
        <UiStatCard title="SimulationExecuted" value={String(actionDistribution.SimulationExecuted ?? 0)} helper="Simulation traces" />
        <UiStatCard title="RollbackQueued" value={String(actionDistribution.RollbackQueued ?? 0)} helper="Pending rollback requests" />
        <UiStatCard title="RollbackApplied" value={String(actionDistribution.RollbackApplied ?? 0)} helper="Completed rollback operations" />
      </div>

      <UiForm
        title="Audit filters"
        description="Filter immutable activity events by action type, scope, and free-text search."
        submitLabel="Apply filters"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        footer={
          <button
            type="button"
            onClick={() => {
              setFilters({ query: "", actionType: "all", eventScope: "all" });
            }}
          >
            Reset filters
          </button>
        }
      >
        <UiFormField label="Search" htmlFor="vendor-audit-query" helper="Matches actor, target, version, and note fields.">
          <input
            id="vendor-audit-query"
            value={filters.query}
            onChange={(event) => {
              setFilters((previous) => ({ ...previous, query: event.target.value }));
            }}
            placeholder="Search audit logs"
          />
        </UiFormField>

        <UiFormField label="Action type" htmlFor="vendor-audit-action-type">
          <select
            id="vendor-audit-action-type"
            value={filters.actionType}
            onChange={(event) => {
              setFilters((previous) => ({
                ...previous,
                actionType: event.target.value as AuditFilters["actionType"],
              }));
            }}
          >
            {ACTION_FILTERS.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "all" ? "All actions" : entry}
              </option>
            ))}
          </select>
        </UiFormField>

        <UiFormField label="Event scope" htmlFor="vendor-audit-scope">
          <select
            id="vendor-audit-scope"
            value={filters.eventScope}
            onChange={(event) => {
              setFilters((previous) => ({
                ...previous,
                eventScope: event.target.value as AuditFilters["eventScope"],
              }));
            }}
          >
            {SCOPE_FILTERS.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "all" ? "All scopes" : entry}
              </option>
            ))}
          </select>
        </UiFormField>
      </UiForm>

      <UiTable
        caption="Immutable vendor audit activity"
        columns={columns}
        rows={filteredRecords}
        rowKey={(row) => row.id}
        emptyStateText="No audit events matched the selected filters."
      />

      <section className="vendor-boundary-note">
        <p>Audit guarantees enforced for Build 138:</p>
        <ul>
          <li>Append-only immutable records for calibration workflows.</li>
          <li>Timestamped actor-attributed events for pushes and overrides.</li>
          <li>No mutation of historical metrics or raw-session recomputation traces.</li>
        </ul>
      </section>
    </section>
  );
}

export default VendorAuditActivityLogsPage;
