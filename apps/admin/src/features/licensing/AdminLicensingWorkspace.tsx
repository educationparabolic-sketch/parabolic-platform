import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  getPlanRank,
  isLocalLicensingReadMode,
  levelIncludes,
  submitLicenseUpgradeRequest,
  type AdminLicensePlan,
  type AdminLicensePlanId,
  type AdminLicenseInvoice,
  type AdminLicensingSnapshot,
} from "./licensingDataset";

type LicensingView = "current" | "usage" | "plans" | "history";

const LICENSING_VIEWS: Array<{ id: LicensingView; label: string; path: string }> = [
  { id: "current", label: "Current License", path: "/admin/licensing/current" },
  { id: "usage", label: "Usage & Billing", path: "/admin/licensing/usage" },
  { id: "plans", label: "Plans & Upgrade", path: "/admin/licensing/plans" },
  { id: "history", label: "History", path: "/admin/licensing/history" },
];

function resolveView(pathname: string): LicensingView {
  if (pathname.endsWith("/usage")) return "usage";
  if (pathname.endsWith("/plans")) return "plans";
  if (pathname.endsWith("/history")) return "history";
  return "current";
}

function formatCurrency(value: number): string {
  return `INR ${value.toLocaleString("en-IN")}`;
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function utilization(value: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}

function planLabel(plan: AdminLicensePlan): string {
  return plan.id === "TRIAL" ? "Trial" : `${plan.level} ${plan.tier}`;
}

function escapeInvoiceValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildInvoiceDocument(
  invoice: AdminLicenseInvoice,
  snapshot: AdminLicensingSnapshot,
): string {
  const current = snapshot.currentLicense;
  const studentCharge = snapshot.usage.activeStudents * current.perStudentFeeInr;
  const status = humanize(invoice.status);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeInvoiceValue(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6f9; color: #203b5c; font: 14px Arial, sans-serif; }
    main { width: min(820px, calc(100% - 32px)); margin: 32px auto; background: #fff; border: 1px solid #d7e0ea; padding: 36px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1b5fc2; padding-bottom: 22px; }
    h1 { margin: 0; color: #143764; font-size: 28px; }
    h2 { margin: 4px 0 0; color: #143764; font-size: 18px; }
    p { margin: 5px 0; color: #587093; }
    .meta { text-align: right; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; margin: 26px 0; }
    .panel { border: 1px solid #d7e0ea; padding: 15px; }
    .panel strong { display: block; margin-bottom: 8px; color: #143764; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #d7e0ea; padding: 12px 8px; text-align: left; }
    th:last-child, td:last-child { text-align: right; }
    tfoot td { border-bottom: 0; color: #143764; font-size: 17px; font-weight: 700; }
    .status { display: inline-block; margin-top: 12px; border: 1px solid #d7e0ea; padding: 6px 9px; font-weight: 700; }
    footer { margin-top: 30px; border-top: 1px solid #d7e0ea; padding-top: 16px; color: #6a7f99; font-size: 12px; }
    button { border: 0; background: #184b90; color: #fff; cursor: pointer; padding: 9px 13px; font: inherit; font-weight: 700; }
    @media print { body { background: #fff; } main { width: 100%; margin: 0; border: 0; padding: 20px; } button { display: none; } }
    @media (max-width: 600px) { header { flex-direction: column; } .meta { text-align: left; } .grid { grid-template-columns: 1fr; } main { padding: 22px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Parabolic Platform</h1><p>Institute subscription invoice</p></div>
      <div class="meta"><h2>${escapeInvoiceValue(invoice.invoiceNumber)}</h2><p>${escapeInvoiceValue(invoice.billingPeriod)}</p><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
    </header>
    <section class="grid">
      <div class="panel"><strong>Billed to</strong><p>${escapeInvoiceValue(current.instituteName)}</p><p>${escapeInvoiceValue(current.instituteId)}</p></div>
      <div class="panel"><strong>Invoice details</strong><p>Issued: ${escapeInvoiceValue(formatDate(invoice.issuedAt))}</p><p>Due: ${escapeInvoiceValue(formatDate(invoice.dueAt))}</p><p>Plan: ${escapeInvoiceValue(current.planId)} (${escapeInvoiceValue(current.billingCycle)})</p><span class="status">${escapeInvoiceValue(status)}</span></div>
    </section>
    <table>
      <thead><tr><th>Description</th><th>Calculation</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>License base fee</td><td>${escapeInvoiceValue(current.planId)}</td><td>${escapeInvoiceValue(formatCurrency(current.baseFeeInr))}</td></tr>
        <tr><td>Active student charge</td><td>${snapshot.usage.activeStudents} x ${escapeInvoiceValue(formatCurrency(current.perStudentFeeInr))}</td><td>${escapeInvoiceValue(formatCurrency(studentCharge))}</td></tr>
      </tbody>
      <tfoot><tr><td colspan="2">Invoice total</td><td>${escapeInvoiceValue(formatCurrency(invoice.amountInr))}</td></tr></tfoot>
    </table>
    <footer>This invoice is supplied from the vendor-authoritative billing record. Contact vendor billing for payment reconciliation or corrections.</footer>
  </main>
</body>
</html>`;
}

function AdminLicensingWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuthProvider();
  const instituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<AdminLicensePlanId>("L2-T3");
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeView = resolveView(location.pathname);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setIsLoading(true);
      try {
        const nextSnapshot = await fetchLicensingSnapshot(instituteId);
        if (!mounted) return;
        setSnapshot(nextSnapshot);
        const upgradePlan = nextSnapshot.plans
          .filter(
            (plan) =>
              plan.availability === "available" &&
              getPlanRank(plan) >
                getPlanRank(
                  nextSnapshot.plans.find(
                    (entry) => entry.id === nextSnapshot.currentLicense.planId,
                  ) ?? nextSnapshot.plans[1],
                ),
          )
          .at(0);
        if (upgradePlan) setSelectedPlanId(upgradePlan.id);
        setLoadMessage(
          isLocalLicensingReadMode()
            ? "Local vendor-aligned license snapshot loaded."
            : "License state loaded from the secured vendor-authoritative API.",
        );
      } catch (error) {
        if (!mounted) return;
        setSnapshot(FALLBACK_SNAPSHOT);
        setLoadMessage(
          `${error instanceof ApiClientError ? error.message : "Unable to load license state."} Showing the last available snapshot.`,
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [instituteId]);

  const current = snapshot.currentLicense;
  const usage = snapshot.usage;
  const currentPlan =
    snapshot.plans.find((plan) => plan.id === current.planId) ?? snapshot.plans[0];
  const selectedPlan = snapshot.plans.find((plan) => plan.id === selectedPlanId) ?? currentPlan;
  const upgradePlans = snapshot.plans.filter(
    (plan) =>
      plan.availability === "available" &&
      currentPlan &&
      getPlanRank(plan) > getPlanRank(currentPlan),
  );
  const openRequest = snapshot.upgradeRequests.find((request) =>
    ["pending", "payment_required"].includes(request.status),
  );
  const concurrencyPercent = utilization(
    usage.peakConcurrentStudents,
    current.maxConcurrentStudents,
  );
  const sessionPercent = utilization(usage.examSessionsThisMonth, current.maxExamSessionsPerMonth);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan || selectedPlan.id === "TRIAL") return;
    if (requestReason.trim().length < 15) {
      setRequestMessage("Describe the operational reason in at least 15 characters.");
      return;
    }
    setIsSubmitting(true);
    setRequestMessage("");
    try {
      const request = await submitLicenseUpgradeRequest({
        instituteId: current.instituteId,
        currentPlanId: current.planId,
        requestedPlanId: selectedPlan.id,
        requestedBy: session.user?.email ?? "institute.admin",
        reason: requestReason.trim(),
      });
      setSnapshot((previous) => ({
        ...previous,
        upgradeRequests: [request, ...previous.upgradeRequests],
      }));
      setRequestReason("");
      setRequestMessage("Upgrade request submitted for vendor review.");
    } catch (error) {
      setRequestMessage(
        error instanceof Error ? error.message : "Unable to submit upgrade request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function viewInvoice(invoice: AdminLicenseInvoice) {
    const documentBlob = new Blob([buildInvoiceDocument(invoice, snapshot)], {
      type: "text/html;charset=utf-8",
    });
    const documentUrl = URL.createObjectURL(documentBlob);
    const invoiceWindow = window.open(documentUrl, "_blank");
    if (!invoiceWindow) {
      URL.revokeObjectURL(documentUrl);
      setInvoiceActionMessage("The invoice view was blocked. Allow pop-ups and try again.");
      return;
    }
    invoiceWindow.opener = null;
    setInvoiceActionMessage(`${invoice.invoiceNumber} opened in a new tab.`);
    window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60_000);
  }

  function downloadInvoice(invoice: AdminLicenseInvoice) {
    const documentBlob = new Blob([buildInvoiceDocument(invoice, snapshot)], {
      type: "text/html;charset=utf-8",
    });
    const documentUrl = URL.createObjectURL(documentBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = documentUrl;
    downloadLink.download = `${invoice.invoiceNumber}.html`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(documentUrl);
    setInvoiceActionMessage(`${invoice.invoiceNumber} downloaded.`);
  }

  return (
    <section
      className="admin-content-card admin-license-page"
      aria-labelledby="admin-license-title"
    >
      <header className="admin-license-heading">
        <div>
          <p className="admin-content-eyebrow">Institute subscription</p>
          <h2 id="admin-license-title">License</h2>
          <p>Review the vendor-assigned plan, monitor usage, and request a plan change.</p>
        </div>
        <div
          className={`admin-license-posture admin-license-posture-${current.subscriptionStatus}`}
        >
          <span>Subscription status</span>
          <strong>{humanize(current.subscriptionStatus)}</strong>
          <small>
            {current.planId} expires {formatDate(current.expiryDate)}
          </small>
        </div>
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

      <p className="admin-license-load-state">
        {isLoading ? "Loading license state..." : loadMessage}
      </p>

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
            <UiStatCard title="License Layer" value={current.level} helper={current.tier} />
            <UiStatCard
              title="Active Students"
              value={usage.activeStudents.toLocaleString("en-IN")}
              helper={`${formatCurrency(current.perStudentFeeInr)} per active student`}
            />
            <UiStatCard
              title="Concurrent Limit"
              value={current.maxConcurrentStudents.toLocaleString("en-IN")}
              helper={`Peak this month ${usage.peakConcurrentStudents}`}
            />
            <UiStatCard
              title="Exam Sessions"
              value={String(current.maxExamSessionsPerMonth)}
              helper={`${usage.examSessionsThisMonth} used this month`}
            />
          </div>

          <div className="admin-license-current-grid">
            <section
              className="admin-license-parameters"
              aria-labelledby="license-parameters-title"
            >
              <header>
                <h3 id="license-parameters-title">Vendor-controlled parameters</h3>
                <p>These values cannot be edited from the institute portal.</p>
              </header>
              <dl>
                <div>
                  <dt>Base fee</dt>
                  <dd>{formatCurrency(current.baseFeeInr)}</dd>
                </div>
                <div>
                  <dt>Per student fee</dt>
                  <dd>{formatCurrency(current.perStudentFeeInr)}</dd>
                </div>
                <div>
                  <dt>Maximum concurrent students</dt>
                  <dd>{current.maxConcurrentStudents}</dd>
                </div>
                <div>
                  <dt>Maximum exam sessions per month</dt>
                  <dd>{current.maxExamSessionsPerMonth}</dd>
                </div>
              </dl>
            </section>

            <section className="admin-license-contract" aria-labelledby="license-contract-title">
              <header>
                <h3 id="license-contract-title">Subscription term</h3>
                <p>Current validity and billing arrangement.</p>
              </header>
              <dl>
                <div>
                  <dt>Plan</dt>
                  <dd>{current.planId}</dd>
                </div>
                <div>
                  <dt>Billing cycle</dt>
                  <dd>{current.billingCycle}</dd>
                </div>
                <div>
                  <dt>Start date</dt>
                  <dd>{formatDate(current.licenseStartDate)}</dd>
                </div>
                <div>
                  <dt>Expiry date</dt>
                  <dd>{formatDate(current.expiryDate)}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="admin-primary-link"
                onClick={() => navigate("/admin/licensing/plans")}
              >
                Review Upgrade Options
              </button>
            </section>
          </div>

          <section className="admin-license-authority-note">
            <strong>Vendor authority</strong>
            <p>
              Plan fees, capacity limits, session limits, license dates, and final plan changes are
              controlled by the vendor. Institute admins may submit a request but cannot activate a
              plan themselves.
            </p>
          </section>
        </div>
      ) : null}

      {activeView === "usage" ? (
        <div className="admin-license-view">
          <section className="admin-license-section-heading">
            <div>
              <h3>Usage &amp; billing</h3>
              <p>Current-cycle usage against the limits assigned to {current.planId}.</p>
            </div>
            <span className="admin-license-plan-badge">{current.billingCycle}</span>
          </section>

          <div className="admin-license-summary">
            <UiStatCard
              title="Active Students"
              value={String(usage.activeStudents)}
              helper="Billable this cycle"
            />
            <UiStatCard
              title="Peak Concurrent"
              value={String(usage.peakConcurrentStudents)}
              helper={`of ${current.maxConcurrentStudents}`}
            />
            <UiStatCard
              title="Exam Sessions"
              value={String(usage.examSessionsThisMonth)}
              helper={`of ${current.maxExamSessionsPerMonth}`}
            />
            <UiStatCard
              title="Monthly Test Runs"
              value={usage.monthlyTestRuns.toLocaleString("en-IN")}
              helper="Operational usage"
            />
          </div>

          <div className="admin-license-usage-grid">
            <section
              className="admin-license-utilization"
              aria-labelledby="license-utilization-title"
            >
              <header>
                <h3 id="license-utilization-title">Capacity utilization</h3>
                <p>Monthly peak and session consumption.</p>
              </header>
              <div>
                <div className="admin-license-meter">
                  <span>
                    <strong>Concurrent students</strong>
                    <small>
                      {usage.peakConcurrentStudents} / {current.maxConcurrentStudents}
                    </small>
                  </span>
                  <div>
                    <i style={{ width: `${concurrencyPercent}%` }} />
                  </div>
                  <small>{concurrencyPercent}% utilized</small>
                </div>
                <div className="admin-license-meter">
                  <span>
                    <strong>Exam sessions</strong>
                    <small>
                      {usage.examSessionsThisMonth} / {current.maxExamSessionsPerMonth}
                    </small>
                  </span>
                  <div>
                    <i style={{ width: `${sessionPercent}%` }} />
                  </div>
                  <small>{sessionPercent}% utilized</small>
                </div>
              </div>
            </section>

            <section
              className="admin-license-billing-summary"
              aria-labelledby="billing-summary-title"
            >
              <header>
                <h3 id="billing-summary-title">Current billing estimate</h3>
                <p>Vendor-calculated from the active student count.</p>
              </header>
              <strong>{formatCurrency(usage.estimatedCurrentChargeInr)}</strong>
              <dl>
                <div>
                  <dt>Base fee</dt>
                  <dd>{formatCurrency(current.baseFeeInr)}</dd>
                </div>
                <div>
                  <dt>Student charge</dt>
                  <dd>{formatCurrency(usage.activeStudents * current.perStudentFeeInr)}</dd>
                </div>
              </dl>
              <small>Final invoice and payment status remain vendor-authoritative.</small>
            </section>
          </div>

          <section className="admin-license-invoices" aria-labelledby="license-invoices-title">
            <header>
              <div>
                <h3 id="license-invoices-title">Invoices</h3>
                <p>Read-only billing records supplied by the vendor.</p>
              </div>
              <button
                type="button"
                className="admin-primary-link"
                onClick={() => navigate("/admin/help")}
              >
                Contact Vendor Billing
              </button>
            </header>
            <div className="admin-license-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Period</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <code>{invoice.invoiceNumber}</code>
                      </td>
                      <td>{invoice.billingPeriod}</td>
                      <td>{formatDate(invoice.issuedAt)}</td>
                      <td>{formatDate(invoice.dueAt)}</td>
                      <td>{formatCurrency(invoice.amountInr)}</td>
                      <td>
                        <span
                          className={`admin-license-status admin-license-status-${invoice.status}`}
                        >
                          {humanize(invoice.status)}
                        </span>
                      </td>
                      <td>
                        <div className="admin-license-invoice-actions">
                          <button type="button" onClick={() => viewInvoice(invoice)}>
                            View
                          </button>
                          <button type="button" onClick={() => downloadInvoice(invoice)}>
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invoiceActionMessage ? (
              <p className="admin-license-invoice-message" role="status">
                {invoiceActionMessage}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeView === "plans" ? (
        <div className="admin-license-view">
          <section className="admin-license-section-heading">
            <div>
              <h3>Plans &amp; upgrade request</h3>
              <p>Compare published vendor plans and request a change for review.</p>
            </div>
            {openRequest ? (
              <span className="admin-license-status admin-license-status-pending">
                Request pending
              </span>
            ) : null}
          </section>

          <section className="admin-license-trial-note">
            <strong>Trial plan</strong>
            <span>
              Trial is available only during onboarding, lasts exactly one calendar month, and uses
              L0 Tier 1 limits. Existing institutes cannot switch back to Trial.
            </span>
          </section>

          <div className="admin-license-plan-layout">
            <section className="admin-license-plan-selector" aria-labelledby="plan-selector-title">
              <header>
                <h3 id="plan-selector-title">Published plans</h3>
                <p>Fees and limits are read-only.</p>
              </header>
              <div>
                {snapshot.plans
                  .filter((plan) => plan.id !== "TRIAL")
                  .map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={selectedPlan?.id === plan.id ? "admin-license-plan-selected" : ""}
                      onClick={() => setSelectedPlanId(plan.id)}
                    >
                      <span>
                        <strong>{planLabel(plan)}</strong>
                        <small>
                          {plan.id === current.planId
                            ? "Current plan"
                            : formatCurrency(plan.baseFeeInr)}
                        </small>
                      </span>
                      <span>{plan.maxConcurrentStudents} concurrent</span>
                    </button>
                  ))}
              </div>
            </section>

            {selectedPlan ? (
              <section className="admin-license-plan-detail" aria-labelledby="plan-detail-title">
                <header>
                  <div>
                    <p className="admin-content-eyebrow">Selected plan</p>
                    <h3 id="plan-detail-title">{planLabel(selectedPlan)}</h3>
                  </div>
                  <span className="admin-license-plan-badge">{selectedPlan.id}</span>
                </header>
                <dl>
                  <div>
                    <dt>Base fee</dt>
                    <dd>{formatCurrency(selectedPlan.baseFeeInr)}</dd>
                  </div>
                  <div>
                    <dt>Per student fee</dt>
                    <dd>{formatCurrency(selectedPlan.perStudentFeeInr)}</dd>
                  </div>
                  <div>
                    <dt>Concurrent students</dt>
                    <dd>{selectedPlan.maxConcurrentStudents}</dd>
                  </div>
                  <div>
                    <dt>Exam sessions / month</dt>
                    <dd>{selectedPlan.maxExamSessionsPerMonth}</dd>
                  </div>
                </dl>
                {selectedPlan.id === current.planId ? (
                  <p className="admin-license-plan-message">
                    This is the institute’s current plan.
                  </p>
                ) : getPlanRank(selectedPlan) <= getPlanRank(currentPlan) ? (
                  <p className="admin-license-plan-message">
                    Downgrades require a direct vendor discussion and cannot be requested here.
                  </p>
                ) : openRequest ? (
                  <div className="admin-license-open-request">
                    <strong>Request already under review</strong>
                    <p>
                      {openRequest.requestedPlanId} · {humanize(openRequest.status)}
                    </p>
                    <small>{openRequest.vendorNote}</small>
                  </div>
                ) : (
                  <form className="admin-license-request-form" onSubmit={submitRequest}>
                    <UiFormField
                      label="Reason for upgrade"
                      htmlFor="admin-license-request-reason"
                      helper="Explain the expected concurrency, exam-session, or capability requirement."
                    >
                      <textarea
                        id="admin-license-request-reason"
                        rows={4}
                        value={requestReason}
                        onChange={(event) => setRequestReason(event.target.value)}
                      />
                    </UiFormField>
                    <button
                      type="submit"
                      className="admin-primary-link"
                      disabled={
                        isSubmitting || !upgradePlans.some((plan) => plan.id === selectedPlan.id)
                      }
                    >
                      {isSubmitting ? "Submitting..." : "Submit Upgrade Request"}
                    </button>
                  </form>
                )}
                {requestMessage ? (
                  <p className="admin-license-request-message" role="status">
                    {requestMessage}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          <section
            className="admin-license-capabilities"
            aria-labelledby="license-capabilities-title"
          >
            <header>
              <h3 id="license-capabilities-title">Capability comparison</h3>
              <p>Capability visibility follows the assigned license layer.</p>
            </header>
            <div className="admin-license-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>L0</th>
                    <th>L1</th>
                    <th>L2</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.capabilities.map((capability) => (
                    <tr key={capability.id}>
                      <td>
                        <strong>{capability.label}</strong>
                        <small>{capability.description}</small>
                      </td>
                      {(["L0", "L1", "L2"] as const).map((level) => (
                        <td key={level}>
                          {levelIncludes(level, capability.minimumLevel) ? "Included" : "Locked"}
                        </td>
                      ))}
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
            <div>
              <h3>License history</h3>
              <p>Vendor decisions and institute requests retained as read-only records.</p>
            </div>
            <span className="admin-license-plan-badge">
              {snapshot.licenseHistory.length + snapshot.upgradeRequests.length} events
            </span>
          </section>

          <div className="admin-license-history-grid">
            <section className="admin-license-history-panel" aria-labelledby="plan-history-title">
              <header>
                <h3 id="plan-history-title">Plan changes</h3>
                <p>Changes applied by the vendor.</p>
              </header>
              <div>
                {snapshot.licenseHistory.map((entry) => (
                  <article key={entry.id}>
                    <span className="admin-license-history-marker" />
                    <div>
                      <time>{formatTimestamp(entry.timestamp)}</time>
                      <strong>
                        {entry.previousPlanId} to {entry.newPlanId}
                      </strong>
                      <p>{entry.reason}</p>
                      <small>
                        {entry.actor} · {entry.billingCycle}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section
              className="admin-license-history-panel"
              aria-labelledby="request-history-title"
            >
              <header>
                <h3 id="request-history-title">Upgrade requests</h3>
                <p>Requests submitted by institute administrators.</p>
              </header>
              <div>
                {snapshot.upgradeRequests.map((request) => (
                  <article key={request.id}>
                    <span className="admin-license-history-marker" />
                    <div>
                      <time>{formatTimestamp(request.submittedAt)}</time>
                      <strong>Requested {request.requestedPlanId}</strong>
                      <p>{request.reason}</p>
                      <small>
                        {humanize(request.status)} · {request.vendorNote}
                      </small>
                    </div>
                  </article>
                ))}
                {snapshot.upgradeRequests.length === 0 ? (
                  <p className="admin-license-empty">No upgrade requests have been submitted.</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <footer className="admin-license-boundary">
        <div>
          <strong>Institute visibility, vendor authority</strong>
          <span>
            Admins can review usage and submit requests. Only the vendor can publish parameters,
            approve changes, extend dates, or alter subscription status.
          </span>
        </div>
        <code>institutes/{current.instituteId}/license</code>
      </footer>
    </section>
  );
}

export default AdminLicensingWorkspace;
