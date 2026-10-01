import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  AdminLicenseExternalAction,
  AdminLicenseLayer,
} from "../../../../../shared/contracts/adminLicensing";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import { hasAdminCapability, resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  createLicenseRequestIdempotencyKey,
  fetchLicensingSnapshot,
  getLayerRank,
  isLocalLicensingReadMode,
  submitLicenseUpgradeRequest,
  type AdminLicensePlan,
  type AdminLicensingSnapshot,
} from "./licensingDataset";

type LicensingView = "current" | "usage" | "plans" | "history";

interface PendingLicenseCommand {
  fingerprint: string;
  idempotencyKey: string;
}

const LICENSING_VIEWS: Array<{id: LicensingView; label: string; path: string}> = [
  {id: "current", label: "Current License", path: "/admin/licensing/current"},
  {id: "usage", label: "Usage & Billing", path: "/admin/licensing/usage"},
  {id: "plans", label: "Plans & Upgrade", path: "/admin/licensing/plans"},
  {id: "history", label: "History", path: "/admin/licensing/history"},
];

const LICENSE_LAYERS: readonly AdminLicenseLayer[] = ["L0", "L1", "L2", "L3"];

function resolveView(pathname: string): LicensingView {
  if (pathname.endsWith("/usage")) return "usage";
  if (pathname.endsWith("/plans")) return "plans";
  if (pathname.endsWith("/history")) return "history";
  return "current";
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null || currency === null) return "Unavailable";
  return `${currency.toUpperCase()} ${value.toLocaleString("en-IN")}`;
}

function formatDate(value: string | null): string {
  if (value === null) return "Unavailable";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function displayCount(value: number | null): string {
  return value === null ? "Unavailable" : value.toLocaleString("en-IN");
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function utilization(value: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, Math.round((value / limit) * 100));
}

function planLabel(plan: AdminLicensePlan): string {
  return plan.name ?? `${plan.layer} plan ${plan.planId}`;
}

function capabilityLockLabel(lockReason: string | null): string {
  if (lockReason === null) return "Enabled";
  return humanize(lockReason);
}

function actionLabel(action: AdminLicenseExternalAction["action"]): string {
  return {
    billing_history: "Open Billing History",
    contact_support: "Contact Vendor Support",
    invoice_download: "Open Provider Invoices",
    payment_method: "Manage Payment Method",
  }[action];
}

function AdminLicensingWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const {session} = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const fixtureMode = isLocalLicensingReadMode();
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadMessage, setLoadMessage] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingCommand = useRef<PendingLicenseCommand | null>(null);
  const activeView = resolveView(location.pathname);

  const reloadSnapshot = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError("");
    setLoadMessage("");
    setSnapshot(null);
    try {
      const nextSnapshot = await fetchLicensingSnapshot();
      setSnapshot(nextSnapshot);
      const firstUpgrade = nextSnapshot.plans.find(
        (plan) => getLayerRank(plan.layer) > getLayerRank(nextSnapshot.currentLicense.layer),
      );
      setSelectedPlanId((currentSelection) =>
        nextSnapshot.plans.some((plan) => plan.planId === currentSelection) ?
          currentSelection : firstUpgrade?.planId ?? nextSnapshot.currentLicense.planId,
      );
      setLoadMessage(`Authoritative license loaded as of ${formatTimestamp(nextSnapshot.asOf)}.`);
    } catch (error) {
      setLoadError(
        error instanceof ApiClientError || error instanceof Error ?
          error.message : "Unable to load authoritative license data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSnapshot();
  }, [reloadSnapshot]);

  const current = snapshot?.currentLicense ?? null;
  const usage = snapshot?.usage ?? null;
  const currentPlan = snapshot?.plans.find((plan) => plan.planId === current?.planId) ?? null;
  const selectedPlan = snapshot?.plans.find((plan) => plan.planId === selectedPlanId) ??
    currentPlan;
  const upgradePlans = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.plans.filter(
      (plan) => getLayerRank(plan.layer) > getLayerRank(snapshot.currentLicense.layer),
    );
  }, [snapshot]);
  const openRequest = snapshot?.requests.openRequestId ?
    snapshot.requests.items.find(
      (request) => request.requestId === snapshot.requests.openRequestId,
    ) ?? null : null;
  const hasUpgradeCapability = hasAdminCapability(
    "admin.license.upgrade_request",
    accessContext,
  );
  const canSubmitUpgrade = !fixtureMode && hasUpgradeCapability && current?.state === "active";
  const studentUtilization = usage ?
    utilization(usage.activeStudentCount, usage.activeStudentLimit) : null;

  function updateSelectedPlan(planId: string): void {
    pendingCommand.current = null;
    setSelectedPlanId(planId);
    setRequestMessage("");
  }

  function updateRequestReason(reason: string): void {
    pendingCommand.current = null;
    setRequestReason(reason);
    setRequestMessage("");
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!snapshot || !selectedPlan || !canSubmitUpgrade) return;
    const normalizedReason = requestReason.trim();
    if (normalizedReason.length < 15 || normalizedReason.length > 1000) {
      setRequestMessage("Describe the operational reason in 15 to 1000 characters.");
      return;
    }
    if (!upgradePlans.some((plan) => plan.planId === selectedPlan.planId)) {
      setRequestMessage("Select a published plan above the current license layer.");
      return;
    }
    const requestKind = selectedPlan.layer === "L3" ? "evaluation" : "upgrade";
    const fingerprint = JSON.stringify({
      expectedLicenseVersion: snapshot.currentLicense.licenseVersion,
      reason: normalizedReason,
      requestKind,
      requestedPlanId: selectedPlan.planId,
    });
    if (pendingCommand.current?.fingerprint !== fingerprint) {
      pendingCommand.current = {
        fingerprint,
        idempotencyKey: createLicenseRequestIdempotencyKey(),
      };
    }
    setIsSubmitting(true);
    setRequestMessage("");
    try {
      const result = await submitLicenseUpgradeRequest({
        expectedLicenseVersion: snapshot.currentLicense.licenseVersion,
        idempotencyKey: pendingCommand.current.idempotencyKey,
        reason: normalizedReason,
        requestKind,
        requestedPlanId: selectedPlan.planId,
      });
      setSnapshot(result.snapshot);
      setRequestReason("");
      pendingCommand.current = null;
      setRequestMessage(
        result.receipt.disposition === "replayed" ?
          "The existing request was confirmed by authoritative reload." :
          "The request was submitted and confirmed by authoritative reload.",
      );
    } catch (error) {
      setRequestMessage(
        error instanceof ApiClientError || error instanceof Error ?
          error.message : "Unable to submit the licensing request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card admin-license-page" aria-labelledby="admin-license-title">
      <header className="admin-license-heading">
        <div>
          <p className="admin-content-eyebrow">Institute subscription</p>
          <h2 id="admin-license-title">License</h2>
          <p>Review server-authoritative entitlement, usage, billing, requests, and history.</p>
        </div>
        {current ? (
          <div className={`admin-license-posture admin-license-posture-${current.state}`}>
            <span>License state</span>
            <strong>{humanize(current.state)}</strong>
            <small>
              {current.planId} · expiry {formatDate(current.expiryDate)}
            </small>
          </div>
        ) : (
          <div className="admin-license-posture">
            <span>License state</span>
            <strong>Unavailable</strong>
            <small>No local license authority is displayed.</small>
          </div>
        )}
      </header>

      <nav className="admin-license-tabs" aria-label="License workspaces">
        {LICENSING_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={activeView === view.id ? "admin-license-tab-active" : ""}
            onClick={() => navigate(view.path)}
          >
            {view.label}
            {view.id === "plans" && openRequest ? <span>1</span> : null}
          </button>
        ))}
      </nav>

      <p className="admin-license-load-state" aria-live="polite">
        {isLoading ? "Loading authoritative license state..." : loadMessage || loadError}
      </p>

      {isLoading ? (
        <section className="admin-license-authority-note">
          <strong>Loading</strong>
          <p>No cached or fixture licensing values are shown while authority is loading.</p>
        </section>
      ) : null}

      {!isLoading && (!snapshot || loadError) ? (
        <section className="admin-license-authority-note" role="alert">
          <strong>Authoritative licensing data unavailable</strong>
          <p>{loadError || "The licensing snapshot could not be validated."}</p>
          <button type="button" className="admin-primary-link" onClick={() => void reloadSnapshot()}>
            Retry Authoritative Load
          </button>
        </section>
      ) : null}

      {snapshot && current && !isLoading && !loadError ? (
        <>
          {activeView === "current" ? (
            <div className="admin-license-view">
              <section className="admin-license-section-heading">
                <div>
                  <h3>Current license</h3>
                  <p>{current.instituteName} · Vendor-assigned and read-only</p>
                </div>
                <span className="admin-license-plan-badge">{current.planId}</span>
              </section>

              <div className="admin-license-summary">
                <UiStatCard title="License Layer" value={current.layer} helper={current.planName ?? current.planId} />
                <UiStatCard title="License State" value={humanize(current.state)} helper={`Version ${current.licenseVersion}`} />
                <UiStatCard title="Active Students" value={usage ? displayCount(usage.activeStudentCount) : "Unavailable"} helper={usage ? `Cycle ${usage.cycleId}` : "No authoritative usage cycle"} />
                <UiStatCard title="Expiry" value={formatDate(current.expiryDate)} helper={current.renewalDate ? `Renewal ${formatDate(current.renewalDate)}` : "Renewal unavailable"} />
              </div>

              <div className="admin-license-current-grid">
                <section className="admin-license-parameters" aria-labelledby="license-parameters-title">
                  <header>
                    <h3 id="license-parameters-title">Vendor-controlled parameters</h3>
                    <p>Missing source values remain unavailable.</p>
                  </header>
                  <dl>
                    <div><dt>Active student limit</dt><dd>{displayCount(current.activeStudentLimit)}</dd></div>
                    <div><dt>Concurrency limit</dt><dd>{displayCount(current.concurrencyLimit)}</dd></div>
                    <div><dt>Billing cycle</dt><dd>{humanize(current.billingCycle)}</dd></div>
                    <div><dt>Grace deadline</dt><dd>{formatDate(current.gracePeriodEndsAt)}</dd></div>
                  </dl>
                </section>

                <section className="admin-license-contract" aria-labelledby="license-contract-title">
                  <header>
                    <h3 id="license-contract-title">Subscription term</h3>
                    <p>Current validity from the authoritative license document.</p>
                  </header>
                  <dl>
                    <div><dt>Plan</dt><dd>{current.planName ?? current.planId}</dd></div>
                    <div><dt>Layer</dt><dd>{current.layer}</dd></div>
                    <div><dt>Start date</dt><dd>{formatDate(current.startDate)}</dd></div>
                    <div><dt>Expiry date</dt><dd>{formatDate(current.expiryDate)}</dd></div>
                  </dl>
                  <button type="button" className="admin-primary-link" onClick={() => navigate("/admin/licensing/plans")}>
                    Review Published Plans
                  </button>
                </section>
              </div>

              <section className="admin-license-authority-note">
                <strong>Vendor authority</strong>
                <p>Institute users can inspect persisted authority. Only the Vendor workflow may change entitlements, pricing, payment, or request decisions.</p>
              </section>
            </div>
          ) : null}

          {activeView === "usage" ? (
            <div className="admin-license-view">
              <section className="admin-license-section-heading">
                <div>
                  <h3>Usage &amp; billing</h3>
                  <p>Persisted current-cycle usage and billing records for {current.planId}.</p>
                </div>
                <span className="admin-license-plan-badge">{humanize(current.billingCycle)}</span>
              </section>

              {usage ? (
                <>
                  <div className="admin-license-summary">
                    <UiStatCard title="Active Students" value={displayCount(usage.activeStudentCount)} helper={`Limit ${displayCount(usage.activeStudentLimit)}`} />
                    <UiStatCard title="Assigned Students" value={displayCount(usage.assignedStudentCount)} helper={`Peak ${displayCount(usage.peakStudentUsage)}`} />
                    <UiStatCard title="Session Executions" value={displayCount(usage.sessionExecutionVolume)} helper={`Cycle ${usage.cycleId}`} />
                    <UiStatCard title="Assignments Created" value={displayCount(usage.assignmentsCreated)} helper={`Updated ${formatTimestamp(usage.updatedAt)}`} />
                  </div>

                  <div className="admin-license-usage-grid">
                    <section className="admin-license-utilization" aria-labelledby="license-utilization-title">
                      <header><h3 id="license-utilization-title">Student utilization</h3><p>Persisted usage against the recorded student limit.</p></header>
                      {studentUtilization === null ? (
                        <p className="admin-license-empty">Student utilization is unavailable because no authoritative limit is present.</p>
                      ) : (
                        <div className="admin-license-meter">
                          <span><strong>Active students</strong><small>{usage.activeStudentCount} / {usage.activeStudentLimit}</small></span>
                          <div><i style={{width: `${studentUtilization}%`}} /></div>
                          <small>{studentUtilization}% utilized</small>
                        </div>
                      )}
                    </section>

                    <section className="admin-license-billing-summary" aria-labelledby="billing-summary-title">
                      <header><h3 id="billing-summary-title">Persisted billing projection</h3><p>No browser calculation is applied.</p></header>
                      <strong>{formatCurrency(usage.projectedInvoiceAmount, usage.projectedInvoiceCurrency)}</strong>
                      <dl>
                        <div><dt>Pricing plan</dt><dd>{usage.pricingPlanId ?? "Unavailable"}</dd></div>
                        <div><dt>Tier compliant</dt><dd>{usage.billingTierCompliant ? "Yes" : "No"}</dd></div>
                        <div><dt>Approaching limit</dt><dd>{usage.approachingLimit ? "Yes" : "No"}</dd></div>
                        <div><dt>Over limit</dt><dd>{usage.overLimit ? "Yes" : "No"}</dd></div>
                      </dl>
                    </section>
                  </div>
                </>
              ) : (
                <section className="admin-license-authority-note">
                  <strong>Usage unavailable</strong>
                  <p>No authoritative usage cycle exists for this institute.</p>
                </section>
              )}

              <section className="admin-license-invoices" aria-labelledby="license-invoices-title">
                <header>
                  <div><h3 id="license-invoices-title">Billing records</h3><p>Read-only provider-backed records. The browser does not generate invoices.</p></div>
                  <div className="admin-license-invoice-actions">
                    {snapshot.externalActions.map((action) => (
                      <a key={action.action} className="admin-primary-link" href={action.url} target="_blank" rel="noreferrer">
                        {actionLabel(action.action)}
                      </a>
                    ))}
                  </div>
                </header>
                {snapshot.billing.items.length === 0 ? (
                  <p className="admin-license-empty">No billing records are available.</p>
                ) : (
                  <div className="admin-license-table-scroll">
                    <table>
                      <thead><tr><th>Invoice</th><th>Period</th><th>Recorded</th><th>Amount paid</th><th>Status</th></tr></thead>
                      <tbody>
                        {snapshot.billing.items.map((invoice) => (
                          <tr key={invoice.invoiceId}>
                            <td><code>{invoice.invoiceId}</code></td>
                            <td>{formatDate(invoice.billingPeriodStart)} – {formatDate(invoice.billingPeriodEnd)}</td>
                            <td>{formatTimestamp(invoice.createdAt)}</td>
                            <td>{formatCurrency(invoice.amountPaid, invoice.currency)}</td>
                            <td><span className={`admin-license-status admin-license-status-${invoice.status}`}>{humanize(invoice.status)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {snapshot.billing.nextCursor ? <p className="admin-license-empty">Additional billing records exist; this bounded view shows the newest 25.</p> : null}
              </section>
            </div>
          ) : null}

          {activeView === "plans" ? (
            <div className="admin-license-view">
              <section className="admin-license-section-heading">
                <div><h3>Published plans &amp; request</h3><p>Compare the bounded Vendor-published catalog and submit higher-layer intent.</p></div>
                {openRequest ? <span className="admin-license-status admin-license-status-pending">Request pending</span> : null}
              </section>

              {snapshot.plans.length === 0 ? (
                <section className="admin-license-authority-note"><strong>Plan catalog unavailable</strong><p>No published plans were returned.</p></section>
              ) : (
                <div className="admin-license-plan-layout">
                  <section className="admin-license-plan-selector" aria-labelledby="plan-selector-title">
                    <header><h3 id="plan-selector-title">Published plans</h3><p>Prices and limits are read-only.</p></header>
                    <div>
                      {snapshot.plans.map((plan) => (
                        <button key={plan.planId} type="button" className={selectedPlan?.planId === plan.planId ? "admin-license-plan-selected" : ""} onClick={() => updateSelectedPlan(plan.planId)}>
                          <span><strong>{planLabel(plan)}</strong><small>{plan.planId === current.planId ? "Current plan" : formatCurrency(plan.basePriceMonthly, plan.currency)}</small></span>
                          <span>{plan.layer} · {displayCount(plan.concurrencyLimit)} concurrent</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {selectedPlan ? (
                    <section className="admin-license-plan-detail" aria-labelledby="plan-detail-title">
                      <header><div><p className="admin-content-eyebrow">Selected plan</p><h3 id="plan-detail-title">{planLabel(selectedPlan)}</h3></div><span className="admin-license-plan-badge">{selectedPlan.layer}</span></header>
                      <dl>
                        <div><dt>Monthly base price</dt><dd>{formatCurrency(selectedPlan.basePriceMonthly, selectedPlan.currency)}</dd></div>
                        <div><dt>Per student</dt><dd>{formatCurrency(selectedPlan.pricePerStudent, selectedPlan.currency)}</dd></div>
                        <div><dt>Student limit</dt><dd>{displayCount(selectedPlan.activeStudentLimit)}</dd></div>
                        <div><dt>Concurrency limit</dt><dd>{displayCount(selectedPlan.concurrencyLimit)}</dd></div>
                        <div><dt>Monthly sessions</dt><dd>{displayCount(selectedPlan.monthlySessionExecutionLimit)}</dd></div>
                      </dl>
                      {selectedPlan.planId === current.planId ? (
                        <p className="admin-license-plan-message">This is the institute’s current plan.</p>
                      ) : getLayerRank(selectedPlan.layer) <= getLayerRank(current.layer) ? (
                        <p className="admin-license-plan-message">Only a published plan above the current license layer can be requested here.</p>
                      ) : openRequest ? (
                        <div className="admin-license-open-request">
                          <strong>Request already under review</strong>
                          <p>{openRequest.requestedPlanId} · {humanize(openRequest.status)}</p>
                          <small>{openRequest.decisionNote ?? "No Vendor decision note is available."}</small>
                        </div>
                      ) : !canSubmitUpgrade ? (
                        <p className="admin-license-plan-message">
                          {accessContext.role === "director" ? "Directors have read-only licensing access." : current.state !== "active" ? "Requests are unavailable unless the current license is active." : fixtureMode ? "Requests are unavailable while fixture mode is active." : "Your current role and license do not grant upgrade-request capability."}
                        </p>
                      ) : (
                        <form className="admin-license-request-form" onSubmit={submitRequest}>
                          <UiFormField label={selectedPlan.layer === "L3" ? "Reason for evaluation" : "Reason for upgrade"} htmlFor="admin-license-request-reason" helper="Provide 15 to 1000 characters. L3 plans are submitted as evaluations.">
                            <textarea id="admin-license-request-reason" rows={4} minLength={15} maxLength={1000} value={requestReason} onChange={(event) => updateRequestReason(event.target.value)} />
                          </UiFormField>
                          <button type="submit" className="admin-primary-link" disabled={isSubmitting || !upgradePlans.some((plan) => plan.planId === selectedPlan.planId)}>
                            {isSubmitting ? "Submitting..." : selectedPlan.layer === "L3" ? "Submit Evaluation Request" : "Submit Upgrade Request"}
                          </button>
                        </form>
                      )}
                      {requestMessage ? <p className="admin-license-request-message" role="status">{requestMessage}</p> : null}
                    </section>
                  ) : null}
                </div>
              )}

              <section className="admin-license-capabilities" aria-labelledby="license-capabilities-title">
                <header><h3 id="license-capabilities-title">L0–L3 capability authority</h3><p>Cells are projected by the backend from layer and feature policy.</p></header>
                <div className="admin-license-table-scroll">
                  <table>
                    <thead><tr><th>Capability</th>{LICENSE_LAYERS.map((layer) => <th key={layer}>{layer}</th>)}<th>Current</th></tr></thead>
                    <tbody>
                      {snapshot.capabilities.map((capability) => (
                        <tr key={capability.capabilityId}>
                          <td><strong>{capability.label}</strong><small>{capability.description}</small></td>
                          {LICENSE_LAYERS.map((layer) => <td key={layer}>{humanize(capability.layers[layer])}</td>)}
                          <td>{capabilityLockLabel(capability.lockReason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {activeView === "history" ? (
            <div className="admin-license-view">
              <section className="admin-license-section-heading">
                <div><h3>License history</h3><p>Bounded Vendor decisions and institute requests.</p></div>
                <span className="admin-license-plan-badge">{snapshot.history.items.length + snapshot.requests.items.length} records</span>
              </section>
              <div className="admin-license-history-grid">
                <section className="admin-license-history-panel" aria-labelledby="plan-history-title">
                  <header><h3 id="plan-history-title">License changes</h3><p>Immutable changes applied by the Vendor authority.</p></header>
                  <div>
                    {snapshot.history.items.map((entry) => (
                      <article key={entry.entryId}><span className="admin-license-history-marker" /><div><time>{formatTimestamp(entry.timestamp)}</time><strong>{entry.previousLayer} to {entry.newLayer}</strong><p>{entry.reason}</p><small>{entry.changedBy} · {entry.billingPlan}</small></div></article>
                    ))}
                    {snapshot.history.items.length === 0 ? <p className="admin-license-empty">No license history records are available.</p> : null}
                    {snapshot.history.nextCursor ? <p className="admin-license-empty">Additional history exists; this bounded view shows the newest 25.</p> : null}
                  </div>
                </section>
                <section className="admin-license-history-panel" aria-labelledby="request-history-title">
                  <header><h3 id="request-history-title">Licensing requests</h3><p>Requests submitted by institute administrators.</p></header>
                  <div>
                    {snapshot.requests.items.map((request) => (
                      <article key={request.requestId}><span className="admin-license-history-marker" /><div><time>{formatTimestamp(request.submittedAt)}</time><strong>{humanize(request.requestKind)} · {request.requestedPlanId}</strong><p>{request.reason}</p><small>{humanize(request.status)}{request.decisionNote ? ` · ${request.decisionNote}` : ""}</small></div></article>
                    ))}
                    {snapshot.requests.items.length === 0 ? <p className="admin-license-empty">No licensing requests are available.</p> : null}
                    {snapshot.requests.nextCursor ? <p className="admin-license-empty">Additional requests exist; this bounded view shows the newest 25.</p> : null}
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          <footer className="admin-license-boundary">
            <div><strong>Institute visibility, Vendor authority</strong><span>Identity is derived by the server. Admins may submit higher-layer intent; Directors remain read-only.</span></div>
            <code>{current.instituteId} · {current.licenseVersion}</code>
          </footer>
        </>
      ) : null}
    </section>
  );
}

export default AdminLicensingWorkspace;
