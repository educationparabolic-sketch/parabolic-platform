import {useEffect, useMemo, useState} from "react";
import {NavLink, useLocation} from "react-router-dom";
import {useAuthProvider} from "../../../../../shared/services/authProvider";
import {UiTable, type UiTableColumn} from "../../../../../shared/ui/components";
import {resolveAdminAccessContext} from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  hasLayerAccess,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
  type LicensingFeatureRow,
  type LicensingHistoryEntry,
} from "./licensingDataset";

const LICENSING_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

interface LicensingSection {
  id: string;
  title: string;
  route: string;
}

const LICENSING_SECTIONS: LicensingSection[] = [
  {id: "current", route: "/admin/licensing/current", title: "Current Plan"},
  {id: "features", route: "/admin/licensing/features", title: "Feature Matrix"},
  {id: "eligibility", route: "/admin/licensing/eligibility", title: "Eligibility Progress"},
  {id: "usage", route: "/admin/licensing/usage", title: "Usage & Billing"},
  {id: "upgrade", route: "/admin/licensing/upgrade-preview", title: "Upgrade Preview"},
  {id: "history", route: "/admin/licensing/history", title: "License History"},
];

function sectionFromPath(pathname: string): string {
  const matched = LICENSING_SECTIONS.find((section) => pathname.startsWith(section.route));
  return matched?.id ?? "current";
}

function toLocalDatetime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function AdminLicensingConfigurationPage() {
  const location = useLocation();
  const {session} = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const activeSection = sectionFromPath(location.pathname);

  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchLicensingSnapshot(LICENSING_INSTITUTE_ID);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalLicensingReadMode() ?
            "Local read mode: deterministic licensing snapshot loaded." :
            "Licensing loaded from secured backend API. Licensing controls remain vendor-authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load licensing snapshot.";
        setSnapshot(FALLBACK_SNAPSHOT);
        setInlineMessage(`${reason} Falling back to deterministic Build 125 licensing fixtures.`);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const currentPlan = snapshot.currentPlan;
  const featureColumns = useMemo<UiTableColumn<LicensingFeatureRow>[]>(
    () => [
      {
        id: "feature",
        header: "Feature",
        render: (row) => (
          <div className="admin-settings-cell-stack">
            <strong>{row.feature}</strong>
            <small>{row.description}</small>
          </div>
        ),
      },
      {
        id: "l0",
        header: "L0",
        render: (row) => row.layers.L0 === "enabled" ? "Enabled" : "Locked",
      },
      {
        id: "l1",
        header: "L1",
        render: (row) => row.layers.L1 === "enabled" ? "Enabled" : "Locked",
      },
      {
        id: "l2",
        header: "L2",
        render: (row) => row.layers.L2 === "enabled" ? "Enabled" : "Locked",
      },
      {
        id: "l3",
        header: "L3",
        render: (row) => row.layers.L3 === "enabled" ? "Enabled" : "Locked",
      },
    ],
    [],
  );

  const historyColumns = useMemo<UiTableColumn<LicensingHistoryEntry>[]>(
    () => [
      {
        id: "time",
        header: "Timestamp",
        render: (entry) => toLocalDatetime(entry.timestamp),
      },
      {
        id: "transition",
        header: "Layer Change",
        render: (entry) => `${entry.previousLayer} -> ${entry.newLayer}`,
      },
      {
        id: "billing",
        header: "Billing Change",
        render: (entry) => entry.billingChange,
      },
      {
        id: "reason",
        header: "Reason",
        render: (entry) => entry.reason,
      },
      {
        id: "actor",
        header: "Actor",
        render: (entry) => entry.actor,
      },
    ],
    [],
  );

  const attemptsRemaining = Math.max(
    0,
    currentPlan.attemptsQuotaThisMonth - currentPlan.attemptsUsedThisMonth,
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-licensing-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-licensing-title">Commercial Authority & Capability Governance</h2>
      <p className="admin-content-copy">
        Licensing governs feature access, enforcement activation, visibility, usage boundaries, and billing eligibility.
        License mutations are vendor-authoritative and backend-enforced.
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading licensing snapshot..." : inlineMessage ?? "Licensing workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <nav className="admin-settings-tab-grid" aria-label="Licensing sections">
        {LICENSING_SECTIONS.map((section) => (
          <NavLink
            key={section.id}
            to={section.route}
            className={({isActive}) =>
              isActive ?
                "admin-settings-tab admin-settings-tab-active" :
                "admin-settings-tab"
            }
          >
            {section.title}
          </NavLink>
        ))}
      </nav>

      {activeSection === "current" ? (
        <section className="admin-settings-section" aria-label="Current licensing plan">
          <h3>Current Plan</h3>
          <p>
            License object is vendor-controlled and loaded from secured backend. Endpoint checks must enforce
            feature flags server-side.
          </p>
          <div className="admin-settings-grid-three">
            <div className="admin-settings-layer-card">
              <p><strong>Current Layer:</strong> {currentPlan.currentLayer}</p>
              <p><strong>Layer Badge:</strong> {resolveLayerBadge(currentPlan.currentLayer)}</p>
              <p><strong>Plan Name:</strong> {currentPlan.planName}</p>
            </div>
            <div className="admin-settings-layer-card">
              <p><strong>Start Date:</strong> {currentPlan.licenseStartDate}</p>
              <p><strong>Expiry Date:</strong> {currentPlan.expiryDate}</p>
              <p><strong>Renewal Date:</strong> {currentPlan.renewalDate}</p>
            </div>
            <div className="admin-settings-layer-card">
              <p><strong>Billing Cycle:</strong> {currentPlan.billingCycle}</p>
              <p><strong>Active Students:</strong> {currentPlan.activeStudentCount}</p>
              <p><strong>Max Students:</strong> {currentPlan.maxStudentLimit}</p>
              <p><strong>Concurrency Limit:</strong> {currentPlan.concurrencyLimit}</p>
              <p><strong>Attempts Used:</strong> {currentPlan.attemptsUsedThisMonth}</p>
              <p><strong>Attempts Remaining:</strong> {attemptsRemaining}</p>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "features" ? (
        <section className="admin-settings-section" aria-label="Feature entitlement matrix">
          <h3>Feature Matrix</h3>
          <p>
            Locked features stay read-only with non-invasive messaging. Visibility does not replace backend
            license enforcement.
          </p>
          <UiTable
            caption="License feature matrix by layer"
            columns={featureColumns}
            rows={snapshot.featureMatrix}
            rowKey={(row) => row.feature}
            emptyStateText="No entitlement rows available."
          />
        </section>
      ) : null}

      {activeSection === "eligibility" ? (
        <section className="admin-settings-section" aria-label="Eligibility progress">
          <h3>Eligibility Progress</h3>
          <p>
            Eligibility indicates readiness only. Upgrade decisions remain vendor-approved and not self-service.
          </p>
          <div className="admin-licensing-eligibility-grid">
            {snapshot.eligibilityProgress.map((stage) => {
              const progressValue = percent(stage.progressCurrent, stage.progressTarget);

              return (
                <article key={stage.stage} className="admin-settings-layer-card">
                  <p><strong>{stage.label}</strong></p>
                  <p>Status: {stage.status.replace("_", " ")}</p>
                  <p>{stage.summary}</p>
                  <p>{stage.progressCurrent} / {stage.progressTarget} complete ({progressValue}%)</p>
                  <div className="admin-licensing-progress-track" aria-hidden="true">
                    <span className="admin-licensing-progress-fill" style={{width: `${progressValue}%`}} />
                  </div>
                  <ul className="admin-licensing-checklist">
                    {stage.checklist.map((item) => (
                      <li key={item.id}>{item.met ? "PASS" : "PENDING"}: {item.label}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeSection === "usage" ? (
        <section className="admin-settings-section" aria-label="Usage and billing visibility">
          <h3>Usage & Billing</h3>
          <p>
            Usage metrics are vendor-accounted. Billing actions redirect to vendor systems and do not mutate
            institute-side license records.
          </p>
          <div className="admin-settings-grid-three">
            <div className="admin-settings-layer-card">
              <p><strong>Active Students:</strong> {snapshot.usageAndBilling.activeStudents}</p>
              <p><strong>Max Students Allowed:</strong> {snapshot.usageAndBilling.maxStudentsAllowed}</p>
              <p><strong>Remaining Student Slots:</strong> {snapshot.usageAndBilling.remainingStudentSlots}</p>
            </div>
            <div className="admin-settings-layer-card">
              <p><strong>Attempts Used:</strong> {snapshot.usageAndBilling.attemptsUsed}</p>
              <p><strong>Attempts Remaining:</strong> {snapshot.usageAndBilling.attemptsRemaining}</p>
              <p><strong>Peak Concurrency:</strong> {snapshot.usageAndBilling.peakConcurrency}</p>
              <p><strong>Max Concurrent Allowed:</strong> {snapshot.usageAndBilling.maxConcurrentAllowed}</p>
            </div>
            <div className="admin-settings-layer-card">
              <p><strong>Estimated Current Bill:</strong> {snapshot.usageAndBilling.estimatedCurrentBill}</p>
              <p><strong>Next Billing Date:</strong> {snapshot.usageAndBilling.nextBillingDate}</p>
              <div className="admin-licensing-action-grid">
                <a className="admin-primary-link" href={snapshot.usageAndBilling.actions.downloadInvoiceUrl} target="_blank" rel="noreferrer">Download Invoice</a>
                <a className="admin-primary-link" href={snapshot.usageAndBilling.actions.viewBillingHistoryUrl} target="_blank" rel="noreferrer">View Billing History</a>
                <a className="admin-primary-link" href={snapshot.usageAndBilling.actions.updatePaymentMethodUrl} target="_blank" rel="noreferrer">Update Payment Method</a>
                <a className="admin-primary-link" href={snapshot.usageAndBilling.actions.contactSupportUrl} target="_blank" rel="noreferrer">Contact Support</a>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "upgrade" ? (
        <section className="admin-settings-section" aria-label="Upgrade preview">
          <h3>Upgrade Preview</h3>
          <p>
            Preview is strategic visibility only. Direct layer switching is blocked; vendor approval is required.
          </p>
          <div className="admin-settings-grid-three">
            {snapshot.upgradePreview.previewCards.map((card) => (
              <article key={card} className="admin-settings-layer-card admin-licensing-preview-card">
                <p><strong>Preview</strong></p>
                <p>{card}</p>
              </article>
            ))}
          </div>
          <div className="admin-settings-inline-controls">
            <a className="admin-primary-link" href={snapshot.upgradePreview.requestUpgradeUrl} target="_blank" rel="noreferrer">Request Upgrade</a>
            <a className="admin-primary-link" href={snapshot.upgradePreview.scheduleEvaluationUrl} target="_blank" rel="noreferrer">Schedule Evaluation</a>
          </div>
          <p className="admin-settings-inline-note">
            Required layer unlocks: RiskOverview ({hasLayerAccess(currentPlan.currentLayer, "L1") ? "active" : "requires L1"}),
            ControlledMode ({hasLayerAccess(currentPlan.currentLayer, "L2") ? "active" : "requires L2"}),
            GovernanceDashboard ({hasLayerAccess(currentPlan.currentLayer, "L3") ? "active" : "requires L3"}).
          </p>
        </section>
      ) : null}

      {activeSection === "history" ? (
        <section className="admin-settings-section" aria-label="License history timeline">
          <h3>License History</h3>
          <p>
            History is immutable and audit-only under institutes/{"{id}"}/licenseHistory/{"{eventId}"}.
          </p>
          <UiTable
            caption="Immutable license history timeline"
            columns={historyColumns}
            rows={snapshot.licenseHistory}
            rowKey={(row) => row.eventId}
            emptyStateText="No license history entries available."
          />
        </section>
      ) : null}
    </section>
  );
}

export default AdminLicensingConfigurationPage;
