import {safeBusinessUrl} from "../../../../../shared/services/managedAssetPolicy";
import { useVendorReadScope } from "../shared/useVendorReadScope";
import { useVendorCapability } from "../../portals/vendorAccess";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  VendorBillingCommunicationIntent,
  VendorInvoiceDetail,
  VendorInvoiceCommandIntent,
  VendorInvoiceListResult,
  VendorLicenseCatalogCommandIntent,
  VendorLicenseCatalogResult,
  VendorLicenseRequestDecisionIntent,
  VendorLicenseRequestDetail,
  VendorLicenseRequestListResult,
  VendorLicensePlanVersion,
  VendorOfflinePaymentCommandIntent,
  VendorOfflinePaymentSummary,
  VendorPaymentEventCommandIntent,
  VendorPaymentEventListResult,
  VendorSubscriptionDetail,
  VendorSubscriptionCommandIntent,
} from "../../../../../shared/contracts/vendorCommercial";
import {
  classifyVendorCommercialFailure,
  createCommercialIdempotencyKey,
  providerFailure,
  vendorCommercialApi,
  type VendorCommercialFailure,
} from "./vendorCommercialApi";

type WorkspaceView = "requests" | "catalog" | "subscriptions" | "invoices" | "events";

function title(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function dateLabel(value: string | null): string {
  if (!value) return "Unavailable";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function CommercialFailurePanel(props: {
  failure: VendorCommercialFailure;
  onRetry: () => void;
}) {
  const { failure, onRetry } = props;
  const heading = failure.kind === "permission"
    ? "Permission required"
    : failure.kind === "validation"
      ? "Commercial validation failed"
      : failure.kind === "conflict"
        ? "Authoritative conflict"
        : failure.kind === "provider_unavailable"
          ? "Payment provider unavailable"
          : "Commercial authority unavailable";
  return (
    <section className={`vendor-authority-state vendor-authority-state-${failure.kind}`} role="alert">
      <h3>{heading}</h3>
      <p>{failure.message}</p>
      {failure.requestId ? <small>Request: {failure.requestId}</small> : null}
      <button type="button" onClick={onRetry}>Retry authoritative load</button>
    </section>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <section className="vendor-authority-state">
      <h3>No {label} available</h3>
      <p>The bounded authoritative query returned no records. No fixture data is substituted.</p>
    </section>
  );
}

function ProviderState({ state, error }: { state: string; error: string | null }) {
  return (
    <span className={`vendor-status vendor-status-${state}`}>
      {title(state)}{error ? ` · ${error}` : ""}
    </span>
  );
}

export default function VendorCommercialAuthorityPage() {
  const readScope = useVendorReadScope();
  const mutationLock = useRef(false);
  const canManage = useVendorCapability("vendor.licenses.manage");
  const [view, setView] = useState<WorkspaceView>("requests");
  const [requests, setRequests] = useState<VendorLicenseRequestListResult | null>(null);
  const [catalog, setCatalog] = useState<VendorLicenseCatalogResult | null>(null);
  const [invoices, setInvoices] = useState<VendorInvoiceListResult | null>(null);
  const [events, setEvents] = useState<VendorPaymentEventListResult | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<VendorLicenseRequestDetail | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoiceDetail | null>(null);
  const [subscription, setSubscription] = useState<VendorSubscriptionDetail | null>(null);
  const [subscriptionInstituteId, setSubscriptionInstituteId] = useState("");
  const [subscriptionAction, setSubscriptionAction] = useState<
    VendorSubscriptionCommandIntent["action"]
  >("sync_provider");
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("");
  const [subscriptionPlanVersionId, setSubscriptionPlanVersionId] = useState("");
  const [subscriptionExtensionDays, setSubscriptionExtensionDays] = useState("7");
  const [invoiceAction, setInvoiceAction] = useState<VendorInvoiceCommandIntent["action"]>(
    "sync_provider",
  );
  const [requestCursorTrail, setRequestCursorTrail] = useState<Array<string | null>>([null]);
  const [invoiceCursorTrail, setInvoiceCursorTrail] = useState<Array<string | null>>([null]);
  const [eventCursorTrail, setEventCursorTrail] = useState<Array<string | null>>([null]);
  const [failure, setFailure] = useState<VendorCommercialFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const [decisionAction, setDecisionAction] = useState<"approve" | "require_payment" | "reject">(
    "approve",
  );
  const [reason, setReason] = useState("");
  const [publishPlanId, setPublishPlanId] = useState("");
  const [publishLayer, setPublishLayer] = useState<"L0" | "L1" | "L2" | "L3">("L0");
  const [publishAmountMinor, setPublishAmountMinor] = useState("0");
  const [publishCurrency, setPublishCurrency] = useState("INR");
  const [offlineReference, setOfflineReference] = useState("");
  const [offlineEvidence, setOfflineEvidence] = useState("");
  const [offlineAmountMinor, setOfflineAmountMinor] = useState("0");
  const authorityReady = Boolean(requests && catalog && invoices && events);
  const presentationAllowed = !failure || ["conflict", "validation", "provider_unavailable"].includes(failure.kind);
  const intentFor = <Intent,>(scope: string, create: () => Intent): Intent => {
    if (!scope) throw new Error("Command scope is required.");
    return create(); // The transport journal owns the first complete intent and exact replay.
  };

  const loadAll = useCallback(async (reconcile = false) => {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setRequests(null); setCatalog(null); setInvoices(null); setEvents(null);
    setSelectedRequest(null); setSelectedInvoice(null); setSubscription(null);
    setFailure(null);
    try {
      const [nextRequests, nextCatalog, nextInvoices, nextEvents] = await Promise.all([
        vendorCommercialApi.listLicenseRequests({ limit: 25 }, ticket.signal),
        vendorCommercialApi.getLicenseCatalog(ticket.signal),
        vendorCommercialApi.listInvoices({ limit: 25 }, ticket.signal),
        vendorCommercialApi.listPaymentEvents({ limit: 25 }, ticket.signal),
      ]);
      if (!ticket.current()) return;
      setRequests(nextRequests);
      setCatalog(nextCatalog);
      setInvoices(nextInvoices);
      setEvents(nextEvents);
      setRequestCursorTrail([null]);
      setInvoiceCursorTrail([null]);
      setEventCursorTrail([null]);
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
      if (reconcile) throw error;
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }, [readScope]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function loadRequest(instituteId: string, requestId: string, reconcile = false) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setSelectedRequest(null);
    setFailure(null);
    try {
      const detail = await vendorCommercialApi.getLicenseRequest(instituteId, requestId, ticket.signal);
      if (ticket.current()) setSelectedRequest(detail);
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
      if (reconcile) throw error;
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  async function loadRequestPage(nextTrail: Array<string | null>) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setFailure(null);
    try {
      const cursor = nextTrail.at(-1);
      const next = await vendorCommercialApi.listLicenseRequests({
        ...(cursor ? { cursor } : {}),
        limit: 25,
      }, ticket.signal);
      if (!ticket.current()) return;
      setRequests(next);
      setRequestCursorTrail(nextTrail);
      setSelectedRequest(null);
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  async function loadInvoice(instituteId: string, invoiceId: string, reconcile = false) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setSelectedInvoice(null);
    setFailure(null);
    try {
      const detail = await vendorCommercialApi.getInvoice(instituteId, invoiceId, ticket.signal);
      if (!ticket.current()) return;
      setSelectedInvoice(detail);
      setOfflineAmountMinor(String(detail.amountDue.amountMinor));
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
      if (reconcile) throw error;
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  async function loadInvoicePage(nextTrail: Array<string | null>) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setFailure(null);
    try {
      const cursor = nextTrail.at(-1);
      const next = await vendorCommercialApi.listInvoices({
        ...(cursor ? { cursor } : {}),
        limit: 25,
      }, ticket.signal);
      if (!ticket.current()) return;
      setInvoices(next);
      setInvoiceCursorTrail(nextTrail);
      setSelectedInvoice(null);
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  async function loadEventPage(nextTrail: Array<string | null>) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setFailure(null);
    try {
      const cursor = nextTrail.at(-1);
      const next = await vendorCommercialApi.listPaymentEvents({
        ...(cursor ? { cursor } : {}),
        limit: 25,
      }, ticket.signal);
      if (!ticket.current()) return;
      setEvents(next);
      setEventCursorTrail(nextTrail);
    } catch (error) {
      if (!ticket.current()) return;
      setFailure(classifyVendorCommercialFailure(error));
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  async function reconcileCommand(
    scope: string,
    run: () => Promise<{
      providerOperation?: VendorInvoiceDetail["providerOperation"];
      reportedFailure?: VendorCommercialFailure;
    }>,
    success: string,
    reload?: () => Promise<void>,
  ) {
    if (!canManage || mutationLock.current || !scope) return;
    mutationLock.current = true;
    setMutating(true);
    setFailure(null);
    setMessage("");
    try {
      const receipt = await run();
      const providerUnavailable = receipt.reportedFailure ??
        providerFailure(receipt.providerOperation ?? null);
      if (reload) await reload();
      else await loadAll(true);
      if (providerUnavailable) {
        setFailure(providerUnavailable);
      } else {
        setMessage(success);
      }
    } catch (error) {
      const classified = classifyVendorCommercialFailure(error);
      if (classified.kind === "conflict" && reload) {
        try {
          await reload();
        } catch {
          // Preserve the original conflict; the visible retry still reloads the full workspace.
        }
      }
      setFailure(classified);
    } finally {
      mutationLock.current = false;
      setMutating(false);
    }
  }

  function decideRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    const scope = `request:${selectedRequest.instituteId}:${selectedRequest.requestId}:${decisionAction}`;
    const intent = intentFor<VendorLicenseRequestDecisionIntent>(scope, () => {
      const metadata = {
        expectedRevision: selectedRequest.revision,
        idempotencyKey: createCommercialIdempotencyKey(),
      };
      return decisionAction === "reject"
        ? { ...metadata, action: "reject", reason: reason.trim() || "Vendor rejected request." }
        : decisionAction === "require_payment"
          ? { ...metadata, action: "require_payment", note: reason.trim() || undefined }
          : { ...metadata, action: "approve", note: reason.trim() || undefined };
    });
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.decideLicenseRequest(
        selectedRequest.instituteId,
        selectedRequest.requestId,
        intent,
      ),
      "Decision persisted; authoritative request state reloaded.",
      async () => {
        await loadAll(true);
        await loadRequest(selectedRequest.instituteId, selectedRequest.requestId, true);
      },
    );
  }

  function publishPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || !publishPlanId.trim()) return;
    const amountMinor = Number(publishAmountMinor);
    const scope = `catalog:publish:${publishPlanId.trim()}`;
    const intent = intentFor<VendorLicenseCatalogCommandIntent>(scope, () => ({
      action: "publish_plan_version",
      billingInterval: "month",
      expectedCatalogRevision: catalog.catalogRevision,
      featureFlags: {
        advancedAnalytics: false,
        customStrategies: false,
        governanceAccess: false,
        whiteLabeling: false,
        yearOverYearAnalytics: false,
      },
      idempotencyKey: createCommercialIdempotencyKey(),
      layer: publishLayer,
      limits: { maxAdministrators: 10, maxStudents: 1000, maxTeachers: 100 },
      planId: publishPlanId.trim(),
      price: { amountMinor, currency: publishCurrency.trim().toUpperCase() },
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandLicenseCatalog(intent),
      "Catalog command reconciled with authoritative provider state.",
    );
  }

  function retirePlan(plan: VendorLicensePlanVersion) {
    if (!catalog) return;
    const scope = `catalog:retire:${plan.versionId}`;
    const intent = intentFor<VendorLicenseCatalogCommandIntent>(scope, () => ({
      action: "retire_plan_version",
      expectedCatalogRevision: catalog.catalogRevision,
      expectedPlanRevision: plan.revision,
      idempotencyKey: createCommercialIdempotencyKey(),
      planId: plan.planId,
      reason: "Vendor retired this immutable plan version.",
      versionId: plan.versionId,
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandLicenseCatalog(intent),
      "Plan retirement reconciled and catalog reloaded.",
    );
  }

  async function loadSubscription(event: FormEvent<HTMLFormElement>) {
    const ticket = readScope.begin("commercial");
    setLoading(true);
    setMessage("");
    setSubscription(null);
    event.preventDefault();
    if (!subscriptionInstituteId.trim()) return;
    setLoading(true);
    setFailure(null);
    try {
      const next = await vendorCommercialApi.getSubscription(subscriptionInstituteId.trim(), ticket.signal);
      if (ticket.current()) setSubscription(next);
    } catch (error) {
      if (!ticket.current()) return;
      setSubscription(null);
      setFailure(classifyVendorCommercialFailure(error));
    } finally {
      if (ticket.current()) setLoading(false);
    }
  }

  function commandSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription) return;
    const scope = `subscription:${subscription.instituteId}:${subscriptionAction}`;
    if (subscriptionAction === "change_plan" &&
      (!subscriptionPlanId.trim() || !subscriptionPlanVersionId.trim())) return;
    const intent = intentFor<VendorSubscriptionCommandIntent>(scope, () => {
      const metadata = {
        expectedRevision: subscription.revision,
        idempotencyKey: createCommercialIdempotencyKey(),
      };
      if (subscriptionAction === "change_plan") {
        return {
          ...metadata,
          action: subscriptionAction,
          effective: "next_billing_cycle",
          planId: subscriptionPlanId.trim(),
          planVersionId: subscriptionPlanVersionId.trim(),
          reason: reason.trim() || "Vendor-authorized plan change.",
        };
      }
      if (subscriptionAction === "extend_trial") {
        return {
          ...metadata,
          action: subscriptionAction,
          extensionDays: Number(subscriptionExtensionDays),
          reason: reason.trim() || "Vendor-authorized trial extension.",
        };
      }
      return {
        ...metadata,
        action: subscriptionAction,
        reason: reason.trim() || "Vendor requested subscription provider reconciliation.",
      };
    });
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandSubscription(subscription.instituteId, intent),
      "Subscription command reconciled and authoritative state reloaded.",
      async () => {
        setSubscription(await vendorCommercialApi.getSubscription(subscription.instituteId));
      },
    );
  }

  function commandInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;
    const scope = `invoice:${selectedInvoice.instituteId}:${selectedInvoice.invoiceId}:${invoiceAction}`;
    const intent = intentFor<VendorInvoiceCommandIntent>(scope, () => ({
      action: invoiceAction,
      expectedRevision: selectedInvoice.revision,
      idempotencyKey: createCommercialIdempotencyKey(),
      reason: reason.trim() || `Vendor requested invoice ${invoiceAction}.`,
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandInvoice(
        selectedInvoice.instituteId,
        selectedInvoice.invoiceId,
        intent,
      ),
      "Invoice command reconciled and authoritative state reloaded.",
      async () => {
        await loadAll(true);
        await loadInvoice(selectedInvoice.instituteId, selectedInvoice.invoiceId, true);
      },
    );
  }

  function communicateInvoice(action: "resend_invoice" | "send_payment_reminder") {
    if (!selectedInvoice) return;
    const scope = `invoice:${selectedInvoice.instituteId}:${selectedInvoice.invoiceId}:${action}`;
    const intent = intentFor<VendorBillingCommunicationIntent>(scope, () => ({
      action,
      expectedRevision: selectedInvoice.revision,
      idempotencyKey: createCommercialIdempotencyKey(),
      reason: reason.trim() || "Vendor-authorized billing communication.",
    }));
    void reconcileCommand(
      scope,
      async () => {
        const receipt = await vendorCommercialApi.communicateInvoice(
          selectedInvoice.instituteId,
          selectedInvoice.invoiceId,
          intent,
        );
        return {
          ...(receipt.deliveryState === "failed_retryable" ? {
            reportedFailure: {
              kind: "provider_unavailable" as const,
              message: "Billing delivery is retryable and was not reported as delivered.",
              requestId: null,
            },
          } : {}),
        };
      },
      "Billing communication persisted; the server receipt reports its authoritative delivery state.",
      () => loadInvoice(selectedInvoice.instituteId, selectedInvoice.invoiceId, true),
    );
  }

  function recordOfflinePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice || !offlineReference.trim() || !offlineEvidence.trim()) return;
    const scope = `invoice:${selectedInvoice.instituteId}:${selectedInvoice.invoiceId}:offline:record`;
    const intent = intentFor<VendorOfflinePaymentCommandIntent>(scope, () => ({
      action: "record",
      amount: {
        amountMinor: Number(offlineAmountMinor),
        currency: selectedInvoice.amountDue.currency,
      },
      evidenceReference: offlineEvidence.trim(),
      expectedRevision: selectedInvoice.revision,
      externalReference: offlineReference.trim(),
      idempotencyKey: createCommercialIdempotencyKey(),
      method: "bank_transfer",
      occurredAt: new Date().toISOString(),
      reason: reason.trim() || "Offline payment submitted for independent verification.",
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandOfflinePayment(
        selectedInvoice.instituteId,
        selectedInvoice.invoiceId,
        intent,
      ),
      "Offline payment recorded as pending verification; invoice was not marked paid.",
      async () => {
        await loadAll(true);
        await loadInvoice(selectedInvoice.instituteId, selectedInvoice.invoiceId, true);
      },
    );
  }

  function reviewOfflinePayment(
    payment: VendorOfflinePaymentSummary,
    action: "verify" | "reject" | "void",
  ) {
    if (!selectedInvoice) return;
    const scope = `invoice:${selectedInvoice.instituteId}:${selectedInvoice.invoiceId}:offline:${payment.offlinePaymentId}:${action}`;
    const intent = intentFor<VendorOfflinePaymentCommandIntent>(scope, () => ({
      action,
      expectedOfflinePaymentRevision: payment.revision,
      expectedRevision: selectedInvoice.revision,
      idempotencyKey: createCommercialIdempotencyKey(),
      offlinePaymentId: payment.offlinePaymentId,
      reason: reason.trim() || `Vendor ${action} review.`,
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.commandOfflinePayment(
        selectedInvoice.instituteId,
        selectedInvoice.invoiceId,
        intent,
      ),
      `Offline payment ${action} state persisted and invoice reloaded.`,
      async () => {
        await loadAll(true);
        await loadInvoice(selectedInvoice.instituteId, selectedInvoice.invoiceId, true);
      },
    );
  }

  function retryEvent(eventId: string, revision: number) {
    const scope = `event:${eventId}:retry`;
    const intent = intentFor<VendorPaymentEventCommandIntent>(scope, () => ({
      action: "retry_reconciliation",
      expectedRevision: revision,
      idempotencyKey: createCommercialIdempotencyKey(),
      reason: "Vendor requested payment-event reconciliation retry.",
    }));
    void reconcileCommand(
      scope,
      () => vendorCommercialApi.retryPaymentEvent(eventId, intent),
      "Reconciliation command persisted. Its server receipt reports the result; the refreshed queue is a bounded page.",
    );
  }

  return (
    <fieldset disabled={mutating} className="vendor-content-card admin-content-card vendor-commercial-page">
      <header className="vendor-licensing-heading">
        <div>
          <p className="vendor-content-eyebrow">Backend-authoritative commercial control</p>
          <h2>Licensing and billing</h2>
          <p>
            Requests, immutable catalog versions, subscriptions, invoices, offline payments, and
            provider events are loaded from registered Vendor APIs. Commands succeed only after an
            authoritative reload.
          </p>
        </div>
        <span className="vendor-result-count">VEN-17–VEN-30</span>
      </header>

      <p className="vendor-authority-boundary">
        Claim propagation is asynchronous; the server receipt reports its current contract state. Provider-backed
        operations display their persisted provider state and never become browser-authored success.
      </p>

      <nav className="vendor-commercial-tabs" aria-label="Commercial workspace sections">
        {(["requests", "catalog", "subscriptions", "invoices", "events"] as WorkspaceView[])
          .map((item) => (
            <button
              key={item}
              type="button"
              aria-current={view === item ? "page" : undefined}
              onClick={() => setView(item)}
            >
              {title(item)}
            </button>
          ))}
      </nav>

      {loading ? (
        <section className="vendor-authority-state" role="status">
          <h3>Loading commercial authority</h3>
          <p>No cached, session-local, or fixture commercial values are shown while loading.</p>
        </section>
      ) : null}
      {failure ? <CommercialFailurePanel failure={failure} onRetry={() => void loadAll()} /> : null}
      {message ? <p className="vendor-authority-success" role="status">{message}</p> : null}

      {!loading && authorityReady && presentationAllowed && view === "requests" ? (
        <section className="vendor-commercial-section">
          <h3>License requests</h3>
          {!requests || requests.items.length === 0 ? <EmptyPanel label="license requests" /> : (
            <div className="vendor-commercial-split">
              <div className="vendor-authority-table-wrap">
                <table className="vendor-authority-table">
                  <caption>{requests.totalMatching} matching requests; first bounded page</caption>
                  <thead><tr><th>Request</th><th>Institute</th><th>Change</th><th>Status</th></tr></thead>
                  <tbody>{requests.items.map((item) => (
                    <tr key={item.requestId}>
                      <td><button type="button" onClick={() => void loadRequest(item.instituteId, item.requestId)}>{item.requestId}</button></td>
                      <td>{item.instituteId}</td>
                      <td>{item.currentLayer} → {item.requestedLayer}</td>
                      <td>{title(item.status)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <nav className="vendor-authority-pagination" aria-label="License request pages">
                  <button
                    type="button"
                    disabled={requestCursorTrail.length === 1}
                    onClick={() => void loadRequestPage(requestCursorTrail.slice(0, -1))}
                  >Previous page</button>
                  <span>Page {requestCursorTrail.length}</span>
                  <button
                    type="button"
                    disabled={!requests.nextCursor}
                    onClick={() => requests.nextCursor && void loadRequestPage([
                      ...requestCursorTrail,
                      requests.nextCursor,
                    ])}
                  >Next page</button>
                </nav>
              </div>
              {selectedRequest ? (
                <form className="vendor-authority-form" onSubmit={decideRequest}>
                  <h4>Request {selectedRequest.requestId}</h4>
                  <p>{selectedRequest.reason}</p>
                  <p>Revision {selectedRequest.revision} · {title(selectedRequest.decisionState)}</p>
                  <label>Decision
                    <select value={decisionAction} onChange={(event) => setDecisionAction(event.target.value as typeof decisionAction)}>
                      <option value="approve">Approve request</option>
                      <option value="require_payment">Require payment</option>
                      <option value="reject">Reject request</option>
                    </select>
                  </label>
                  <label>Decision note or rejection reason
                    <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
                  </label>
                  <button type="submit" disabled={mutating || !canManage || selectedRequest.status === "approved" || selectedRequest.status === "rejected"}>Persist decision and reload</button>
                </form>
              ) : <p>Select a request to load bounded detail and immutable audit references.</p>}
            </div>
          )}
        </section>
      ) : null}

      {!loading && authorityReady && presentationAllowed && view === "catalog" ? (
        <section className="vendor-commercial-section">
          <h3>Immutable license catalog</h3>
          {!catalog || catalog.plans.length === 0 ? <EmptyPanel label="catalog versions" /> : (
            <div className="vendor-authority-table-wrap">
              <table className="vendor-authority-table">
                <caption>Catalog revision {catalog.catalogRevision}</caption>
                <thead><tr><th>Plan/version</th><th>Layer</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{catalog.plans.map((plan) => (
                  <tr key={plan.versionId}>
                    <td>{plan.planId}<small>{plan.versionId}</small></td>
                    <td>{plan.layer}</td>
                    <td>{money(plan.price.amountMinor, plan.price.currency)} / {plan.billingInterval}</td>
                    <td>{title(plan.status)}</td>
                    <td><button type="button" disabled={mutating || !canManage || plan.status === "retired"} onClick={() => retirePlan(plan)}>Retire version</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <form className="vendor-authority-form" onSubmit={publishPlan}>
            <h4>Publish new immutable version</h4>
            <p>This publishes monthly billing with limits of 1,000 students, 100 teachers and 10 administrators. All optional plan features are disabled. Review these terms before publishing.</p>
            <label>Plan ID<input required value={publishPlanId} onChange={(event) => setPublishPlanId(event.target.value)} /></label>
            <label>Layer<select value={publishLayer} onChange={(event) => setPublishLayer(event.target.value as typeof publishLayer)}>{["L0", "L1", "L2", "L3"].map((layer) => <option key={layer}>{layer}</option>)}</select></label>
            <label>Amount in minor units<input inputMode="numeric" value={publishAmountMinor} onChange={(event) => setPublishAmountMinor(event.target.value)} /></label>
            <label>ISO currency<input maxLength={3} value={publishCurrency} onChange={(event) => setPublishCurrency(event.target.value)} /></label>
            <button type="submit" disabled={mutating || !canManage || !catalog || Number(publishAmountMinor) < 0}>Publish through provider and reload</button>
          </form>
        </section>
      ) : null}

      {!loading && authorityReady && presentationAllowed && view === "subscriptions" ? (
        <section className="vendor-commercial-section">
          <h3>Institute subscription</h3>
          <form className="vendor-authority-form" onSubmit={loadSubscription}>
            <label>Institute ID<input required value={subscriptionInstituteId} onChange={(event) => setSubscriptionInstituteId(event.target.value)} /></label>
            <button type="submit">Load authoritative subscription</button>
          </form>
          {subscription ? (
            <article className="vendor-commercial-detail">
              <h4>{subscription.instituteId}</h4>
              <p>{title(subscription.status)} · revision {subscription.revision}</p>
              <p>Plan: {subscription.planId ?? "Not configured"} · provider: {subscription.provider ?? "None"}</p>
              {subscription.providerOperation ? <ProviderState state={subscription.providerOperation.state} error={subscription.providerOperation.lastErrorCode} /> : null}
              <form className="vendor-authority-form" onSubmit={commandSubscription}>
                <label>Command
                  <select value={subscriptionAction} onChange={(event) => setSubscriptionAction(event.target.value as typeof subscriptionAction)}>
                    <option value="sync_provider">Sync provider</option>
                    <option value="change_plan">Change plan</option>
                    <option value="extend_trial">Extend trial</option>
                    <option value="cancel_at_period_end">Cancel at period end</option>
                    <option value="cancel_now">Cancel now</option>
                    <option value="resume">Resume</option>
                  </select>
                </label>
                {subscriptionAction === "change_plan" ? (
                  <>
                    <label>Plan ID<input required value={subscriptionPlanId} onChange={(event) => setSubscriptionPlanId(event.target.value)} /></label>
                    <label>Plan version ID<input required value={subscriptionPlanVersionId} onChange={(event) => setSubscriptionPlanVersionId(event.target.value)} /></label>
                  </>
                ) : null}
                {subscriptionAction === "extend_trial" ? (
                  <label>Extension days<input inputMode="numeric" value={subscriptionExtensionDays} onChange={(event) => setSubscriptionExtensionDays(event.target.value)} /></label>
                ) : null}
                <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
                <button type="submit" disabled={mutating || !canManage || (subscriptionAction === "extend_trial" && Number(subscriptionExtensionDays) < 1)}>Run command and reload</button>
              </form>
            </article>
          ) : <EmptyPanel label="selected subscription" />}
        </section>
      ) : null}

      {!loading && authorityReady && presentationAllowed && view === "invoices" ? (
        <section className="vendor-commercial-section">
          <h3>Invoices and governed payments</h3>
          {!invoices || invoices.items.length === 0 ? <EmptyPanel label="invoices" /> : (
            <div className="vendor-authority-table-wrap">
              <table className="vendor-authority-table">
                <caption>{invoices.totalMatching} matching invoices; first bounded page</caption>
                <thead><tr><th>Invoice</th><th>Institute</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>{invoices.items.map((invoice) => (
                  <tr key={invoice.invoiceId}>
                    <td><button type="button" onClick={() => void loadInvoice(invoice.instituteId, invoice.invoiceId)}>{invoice.invoiceId}</button></td>
                    <td>{invoice.instituteId}</td>
                    <td>{money(invoice.amountDue.amountMinor, invoice.amountDue.currency)}</td>
                    <td>{title(invoice.status)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <nav className="vendor-authority-pagination" aria-label="Invoice pages">
                <button
                  type="button"
                  disabled={invoiceCursorTrail.length === 1}
                  onClick={() => void loadInvoicePage(invoiceCursorTrail.slice(0, -1))}
                >Previous page</button>
                <span>Page {invoiceCursorTrail.length}</span>
                <button
                  type="button"
                  disabled={!invoices.nextCursor}
                  onClick={() => invoices.nextCursor && void loadInvoicePage([
                    ...invoiceCursorTrail,
                    invoices.nextCursor,
                  ])}
                >Next page</button>
              </nav>
            </div>
          )}
          {selectedInvoice ? (
            <div className="vendor-commercial-detail">
              <h4>Invoice {selectedInvoice.invoiceId}</h4>
              <p>{title(selectedInvoice.status)} · revision {selectedInvoice.revision} · due {dateLabel(selectedInvoice.dueAt)}</p>
              {selectedInvoice.providerOperation ? <ProviderState state={selectedInvoice.providerOperation.state} error={selectedInvoice.providerOperation.lastErrorCode} /> : null}
              <form className="vendor-authority-form" onSubmit={commandInvoice}>
                <label>Invoice command
                  <select value={invoiceAction} onChange={(event) => setInvoiceAction(event.target.value as typeof invoiceAction)}>
                    <option value="sync_provider">Sync provider</option>
                    <option value="finalize">Finalize</option>
                    <option value="retry_collection">Retry collection</option>
                    <option value="void">Void</option>
                  </select>
                </label>
                <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
                <button type="submit" disabled={mutating || !canManage}>Run invoice command and reload</button>
              </form>
              <div className="vendor-authority-actions">
                <button type="button" disabled={mutating || !canManage} onClick={() => communicateInvoice("resend_invoice")}>Resend invoice</button>
                <button type="button" disabled={mutating || !canManage} onClick={() => communicateInvoice("send_payment_reminder")}>Send payment reminder</button>
                {selectedInvoice.externalActions.downloadUrl ? <a href={safeBusinessUrl(selectedInvoice.externalActions.downloadUrl)} target="_blank" rel="noreferrer">Authorized invoice download</a> : null}
                {selectedInvoice.externalActions.hostedPaymentUrl ? <a href={safeBusinessUrl(selectedInvoice.externalActions.hostedPaymentUrl)} target="_blank" rel="noreferrer">Provider payment page</a> : null}
              </div>
              <form className="vendor-authority-form" onSubmit={recordOfflinePayment}>
                <h4>Record offline payment</h4>
                <p>Recording creates pending verification only and never marks the invoice paid.</p>
                <label>Amount in minor units<input inputMode="numeric" value={offlineAmountMinor} onChange={(event) => setOfflineAmountMinor(event.target.value)} /></label>
                <label>External reference<input required value={offlineReference} onChange={(event) => setOfflineReference(event.target.value)} /></label>
                <label>Evidence reference<input required value={offlineEvidence} onChange={(event) => setOfflineEvidence(event.target.value)} /></label>
                <button type="submit" disabled={mutating || !canManage || Number(offlineAmountMinor) < 1}>Record pending verification and reload</button>
              </form>
              <h4>Offline-payment reviews</h4>
              {selectedInvoice.offlinePayments.length === 0 ? <EmptyPanel label="offline payments" /> : (
                <ul className="vendor-authority-list">{selectedInvoice.offlinePayments.map((payment) => (
                  <li key={payment.offlinePaymentId}>
                    <strong>{payment.offlinePaymentId} · {title(payment.status)}</strong>
                    <span>{money(payment.amount.amountMinor, payment.amount.currency)} · revision {payment.revision}</span>
                    <div className="vendor-authority-actions">
                      {(["verify", "reject", "void"] as const).map((action) => <button key={action} type="button" disabled={mutating || !canManage || payment.status !== "pending_verification"} onClick={() => reviewOfflinePayment(payment, action)}>{title(action)}</button>)}
                    </div>
                  </li>
                ))}</ul>
              )}
            </div>
          ) : <p>Select an invoice to load provider attempts, offline-payment authority, and backend-issued external actions.</p>}
        </section>
      ) : null}

      {!loading && authorityReady && presentationAllowed && view === "events" ? (
        <section className="vendor-commercial-section">
          <h3>Redacted payment events</h3>
          {!events || events.items.length === 0 ? <EmptyPanel label="payment events" /> : (
            <div className="vendor-authority-table-wrap">
              <table className="vendor-authority-table">
                <caption>{events.totalMatching} matching events; raw provider payload is never exposed</caption>
                <thead><tr><th>Event</th><th>Institute</th><th>Processing</th><th>Reconciliation</th><th>Action</th></tr></thead>
                <tbody>{events.items.map((item) => (
                  <tr key={item.eventId}>
                    <td>{item.eventType}<small>{item.eventId}</small></td>
                    <td>{item.instituteId ?? "Unresolved"}</td>
                    <td>{title(item.processingState)}</td>
                    <td>{title(item.reconciliationState)}</td>
                    <td><button type="button" disabled={mutating || !canManage} onClick={() => retryEvent(item.eventId, item.revision)}>Retry reconciliation</button></td>
                  </tr>
                ))}</tbody>
              </table>
              <nav className="vendor-authority-pagination" aria-label="Payment event pages">
                <button
                  type="button"
                  disabled={eventCursorTrail.length === 1}
                  onClick={() => void loadEventPage(eventCursorTrail.slice(0, -1))}
                >Previous page</button>
                <span>Page {eventCursorTrail.length}</span>
                <button
                  type="button"
                  disabled={!events.nextCursor}
                  onClick={() => events.nextCursor && void loadEventPage([
                    ...eventCursorTrail,
                    events.nextCursor,
                  ])}
                >Next page</button>
              </nav>
            </div>
          )}
        </section>
      ) : null}
    </fieldset>
  );
}
