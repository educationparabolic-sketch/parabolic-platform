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
  getLicenseHistoryForInstitute,
  getVendorInstitutesDataset,
  getWebhookLogsForInstitute,
  type VendorInstituteSubscriptionStatus,
  type VendorLicenseChangeRecord,
  type VendorLicenseWebhookLog,
} from "../institutes/vendorInstitutesDataset";

interface ManualOverrideDraft {
  nextLayer: LicenseLayer;
  nextStatus: VendorInstituteSubscriptionStatus;
  note: string;
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function VendorLicensingPage() {
  const dataset = useMemo(() => getVendorInstitutesDataset(), []);
  const [instituteId, setInstituteId] = useState(dataset.institutes[0]?.id ?? "");
  const [overrideDraft, setOverrideDraft] = useState<ManualOverrideDraft>({
    nextLayer: "L1",
    nextStatus: "active",
    note: "",
  });
  const [overrideFeed, setOverrideFeed] = useState<string[]>([]);

  const selectedInstitute = useMemo(() => {
    return dataset.institutes.find((entry) => entry.id === instituteId) ?? dataset.institutes[0] ?? null;
  }, [dataset.institutes, instituteId]);

  const webhookRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseWebhookLog[];
    }

    return getWebhookLogsForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const historyRows = useMemo(() => {
    if (!selectedInstitute) {
      return [] as VendorLicenseChangeRecord[];
    }

    return getLicenseHistoryForInstitute(dataset, selectedInstitute.id);
  }, [dataset, selectedInstitute]);

  const webhookColumns = useMemo<Array<UiTableColumn<VendorLicenseWebhookLog>>>(() => {
    return [
      {
        id: "receivedAt",
        header: "Received",
        render: (row) => formatDateLabel(row.receivedAt),
      },
      {
        id: "eventType",
        header: "Event",
        render: (row) => row.eventType,
      },
      {
        id: "status",
        header: "Status",
        render: (row) => toTitleCase(row.status),
      },
      {
        id: "summary",
        header: "Summary",
        render: (row) => row.summary,
      },
    ];
  }, []);

  const historyColumns = useMemo<Array<UiTableColumn<VendorLicenseChangeRecord>>>(() => {
    return [
      {
        id: "changedAt",
        header: "Changed",
        render: (row) => formatDateLabel(row.changedAt),
      },
      {
        id: "fromTo",
        header: "Layer Change",
        render: (row) => `${row.fromLayer} -> ${row.toLayer}`,
      },
      {
        id: "billingCycle",
        header: "Billing Cycle",
        render: (row) => row.billingCycle,
      },
      {
        id: "changedBy",
        header: "Changed By",
        render: (row) => row.changedBy,
      },
      {
        id: "reason",
        header: "Reason",
        render: (row) => row.reason,
      },
    ];
  }, []);

  function handleManualOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstitute) {
      return;
    }

    const note = overrideDraft.note.trim() || "Manual override approved by vendor operator.";
    const line = `${new Date().toISOString()} | ${selectedInstitute.instituteName} | ${selectedInstitute.currentLicenseLayer}->${overrideDraft.nextLayer} | ${toTitleCase(overrideDraft.nextStatus)} | ${note}`;

    setOverrideFeed((previous) => [line, ...previous].slice(0, 8));
    setOverrideDraft((previous) => ({ ...previous, note: "" }));
  }

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-licensing-title">
      <p className="vendor-content-eyebrow">Build 137</p>
      <h2 id="vendor-licensing-title">Licensing &amp; Subscription Control</h2>
      <p className="vendor-content-copy">
        Vendor-authoritative licensing control panel with billing visibility, webhook log viewer, and immutable
        change history.
      </p>

      <UiForm
        title="Select institute"
        description="All license changes are vendor-authoritative and scoped to the selected institute."
        submitLabel="Apply selection"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <UiFormField
          label="Institute"
          htmlFor="vendor-licensing-institute"
          helper="Source collection: institutes/{id}/license"
        >
          <select
            id="vendor-licensing-institute"
            value={selectedInstitute?.id ?? ""}
            onChange={(event) => {
              setInstituteId(event.target.value);
            }}
          >
            {dataset.institutes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.instituteName} ({entry.currentLicenseLayer})
              </option>
            ))}
          </select>
        </UiFormField>
      </UiForm>

      {selectedInstitute ? (
        <>
          <div className="vendor-overview-grid">
            <UiStatCard title="Subscription Status" value={toTitleCase(selectedInstitute.subscriptionStatus)} helper="Current lifecycle billing state" />
            <UiStatCard title="Billing Cycle" value={selectedInstitute.billing.billingCycle} helper="Recurring invoice cadence" />
            <UiStatCard title="Next Invoice" value={formatDateLabel(selectedInstitute.billing.nextInvoiceDate)} helper="Next Stripe invoice date" />
            <UiStatCard title="Payment Failures" value={String(selectedInstitute.billing.paymentFailures)} helper="Failures in current billing window" />
            <UiStatCard title="Amount Due" value={`$${selectedInstitute.billing.amountDueUsd.toLocaleString()}`} helper="Outstanding amount visibility" />
            <UiStatCard title="Manual Override" value={selectedInstitute.billing.manualOverrideEnabled ? "Enabled" : "Disabled"} helper="Policy-level override gate" />
          </div>

          <div className="vendor-section-grid">
            <UiForm
              title="Manual override option"
              description="Adjust target layer or status with a vendor note."
              submitLabel="Queue manual override"
              onSubmit={handleManualOverride}
            >
              <UiFormField label="Target layer" htmlFor="vendor-override-layer">
                <select
                  id="vendor-override-layer"
                  value={overrideDraft.nextLayer}
                  onChange={(event) => {
                    setOverrideDraft((previous) => ({ ...previous, nextLayer: event.target.value as LicenseLayer }));
                  }}
                >
                  <option value="L0">L0</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
              </UiFormField>

              <UiFormField label="Target subscription status" htmlFor="vendor-override-status">
                <select
                  id="vendor-override-status"
                  value={overrideDraft.nextStatus}
                  onChange={(event) => {
                    setOverrideDraft((previous) => ({
                      ...previous,
                      nextStatus: event.target.value as VendorInstituteSubscriptionStatus,
                    }));
                  }}
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="suspended">Suspended</option>
                  <option value="canceled">Canceled</option>
                </select>
              </UiFormField>

              <UiFormField
                label="Operator note"
                htmlFor="vendor-override-note"
                helper="Required for deterministic audit payload preparation."
              >
                <input
                  id="vendor-override-note"
                  value={overrideDraft.note}
                  onChange={(event) => {
                    setOverrideDraft((previous) => ({ ...previous, note: event.target.value }));
                  }}
                  placeholder="Manual override reason"
                />
              </UiFormField>
            </UiForm>

            <UiTable
              caption="Manual override queue (local evidence)"
              columns={[
                {
                  id: "line",
                  header: "Queued override",
                  render: (row: string) => row,
                },
              ]}
              rows={overrideFeed}
              rowKey={(row) => row}
              emptyStateText="No manual overrides queued in this session."
            />
          </div>

          <UiTable
            caption="Webhook log viewer"
            columns={webhookColumns}
            rows={webhookRows}
            rowKey={(row) => row.id}
            emptyStateText="No webhook logs found for selected institute."
          />

          <UiTable
            caption="License change history"
            columns={historyColumns}
            rows={historyRows}
            rowKey={(row) => row.id}
            emptyStateText="No license history found for selected institute."
          />
        </>
      ) : (
        <p className="vendor-content-note">No institute data available.</p>
      )}
    </section>
  );
}

export default VendorLicensingPage;
