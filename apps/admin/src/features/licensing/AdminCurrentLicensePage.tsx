import { useEffect, useMemo, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchLicensingSnapshot,
  hasLayerAccess,
  isLocalLicensingReadMode,
  resolveLayerBadge,
  type AdminLicensingSnapshot,
  type CapabilityState,
} from "./licensingDataset";
import LicensingWorkspaceNav from "./LicensingWorkspaceNav";

interface LicenseObjectRow {
  field: string;
  value: string;
  contract: string;
}

interface EnforcementRow {
  capability: string;
  flag: string;
  requiredLayer: string;
  currentState: CapabilityState;
  rejection: string;
}

interface RestrictionRow {
  restrictedAction: string;
  instituteMessage: string;
  authority: string;
}

const licenseObjectColumns: UiTableColumn<LicenseObjectRow>[] = [
  {
    header: "License Field",
    id: "field",
    render: (row) => row.field,
  },
  {
    header: "Current Value",
    id: "value",
    render: (row) => row.value,
  },
  {
    header: "Contract",
    id: "contract",
    render: (row) => row.contract,
  },
];

const enforcementColumns: UiTableColumn<EnforcementRow>[] = [
  {
    header: "Capability",
    id: "capability",
    render: (row) => row.capability,
  },
  {
    header: "Backend Enforcement",
    id: "flag",
    render: (row) => row.flag,
  },
  {
    header: "Required Layer",
    id: "requiredLayer",
    render: (row) => row.requiredLayer,
  },
  {
    header: "Current State",
    id: "currentState",
    render: (row) => (
      <span className={`admin-licensing-feature-state admin-licensing-feature-state-${row.currentState}`}>
        {row.currentState === "enabled" ? "Enabled" : "Locked"}
      </span>
    ),
  },
  {
    header: "Graceful Rejection",
    id: "rejection",
    render: (row) => row.rejection,
  },
];

const restrictionColumns: UiTableColumn<RestrictionRow>[] = [
  {
    header: "Institute Cannot",
    id: "restrictedAction",
    render: (row) => row.restrictedAction,
  },
  {
    header: "Restriction Message",
    id: "instituteMessage",
    render: (row) => row.instituteMessage,
  },
  {
    header: "Authority",
    id: "authority",
    render: (row) => row.authority,
  },
];

function resolveFeatureState(
  snapshot: AdminLicensingSnapshot,
  feature: string,
): CapabilityState {
  return snapshot.featureMatrix.find((row) => row.feature === feature)?.layers[snapshot.currentPlan.currentLayer] ?? "locked";
}

function AdminCurrentLicensePage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const licensingInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminLicensingSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchLicensingSnapshot(licensingInstituteId);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalLicensingReadMode() ?
            "Local read mode: deterministic current-license snapshot loaded." :
            "Current license loaded from secured backend API. Vendor controls remain authoritative.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load current license.";
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
  }, [licensingInstituteId]);

  const currentPlan = snapshot.currentPlan;
  const attemptsRemaining = Math.max(
    0,
    currentPlan.attemptsQuotaThisMonth - currentPlan.attemptsUsedThisMonth,
  );
  const licenseObjectRows: LicenseObjectRow[] = [
    {
      contract: "Vendor-signed commercial layer; institute-side edits are not accepted.",
      field: "currentLayer",
      value: `${currentPlan.currentLayer} (${resolveLayerBadge(currentPlan.currentLayer)})`,
    },
    {
      contract: "Displayed from the authoritative license document.",
      field: "planName",
      value: currentPlan.planName,
    },
    {
      contract: "Controls renewal and billing visibility; commercial changes remain vendor-side.",
      field: "billingCycle",
      value: currentPlan.billingCycle,
    },
    {
      contract: "License validity window used by protected backend routes.",
      field: "startDate / expiryDate",
      value: `${currentPlan.licenseStartDate} to ${currentPlan.expiryDate}`,
    },
    {
      contract: "MaxStudents ceiling enforced by vendor validation and backend limits.",
      field: "maxStudents",
      value: String(currentPlan.maxStudentLimit),
    },
    {
      contract: "Concurrent execution ceiling enforced outside UI state.",
      field: "maxConcurrent",
      value: String(currentPlan.concurrencyLimit),
    },
    {
      contract: "Eligibility is readiness only; it does not mutate currentLayer.",
      field: "eligibilityFlags",
      value: snapshot.eligibilityProgress.map((stage) => `${stage.stage}:${stage.status}`).join(", "),
    },
    {
      contract: "Backend feature flags gate protected routes even when preview UI is visible.",
      field: "featureFlags",
      value: `${snapshot.featureMatrix.filter((row) => row.layers[currentPlan.currentLayer] === "enabled").length} enabled / ${snapshot.featureMatrix.length} total`,
    },
    {
      contract: "Tiny HOT payload, cached short-term and refreshed periodically.",
      field: "status",
      value: "Active",
    },
  ];
  const enforcementRows: EnforcementRow[] = [
    {
      capability: "Controlled Mode",
      currentState: resolveFeatureState(snapshot, "ControlledMode"),
      flag: "Reject if !featureFlags.controlledMode",
      rejection: 'FeatureNotLicensed with requiredLayer "L2"; UI keeps control disabled.',
      requiredLayer: "L2",
    },
    {
      capability: "Governance Dashboard",
      currentState: resolveFeatureState(snapshot, "GovernanceDashboard"),
      flag: "Reject if !featureFlags.governanceAccess",
      rejection: 'FeatureNotLicensed with requiredLayer "L3"; UI shows governance preview only.',
      requiredLayer: "L3",
    },
    {
      capability: "Hard Mode",
      currentState: resolveFeatureState(snapshot, "HardMode"),
      flag: "Reject if !featureFlags.hardMode",
      rejection: 'FeatureNotLicensed with requiredLayer "L2"; assignment controls stay unavailable.',
      requiredLayer: "L2",
    },
    {
      capability: "Adaptive Phase",
      currentState: resolveFeatureState(snapshot, "AdaptivePhase"),
      flag: "Reject if !featureFlags.adaptivePhase",
      rejection: 'FeatureNotLicensed with requiredLayer "L2"; phase orchestration remains locked.',
      requiredLayer: "L2",
    },
  ];
  const restrictionRows: RestrictionRow[] = [
    {
      authority: "Vendor control sheet plus server-side validation.",
      instituteMessage: "License document is immutable from institute-side admin flows.",
      restrictedAction: "Modify license doc",
    },
    {
      authority: "Vendor-accounted license limits.",
      instituteMessage: "Student ceilings cannot be increased inside this portal.",
      restrictedAction: "Increase maxStudents",
    },
    {
      authority: "Backend middleware and vendor limits.",
      instituteMessage: "Concurrency and attempt ceilings cannot be disabled by UI changes.",
      restrictedAction: "Disable limits",
    },
    {
      authority: "Protected endpoints enforce capability flags server-side.",
      instituteMessage: "Feature preview visibility never bypasses backend flags.",
      restrictedAction: "Bypass feature flags",
    },
    {
      authority: "Vendor review and immutable eligibility snapshots.",
      instituteMessage: "Eligibility can be viewed, not edited into an upgrade.",
      restrictedAction: "Modify eligibility",
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-current-license-title">
      <p className="admin-content-eyebrow">Licensing & Entitlements</p>
      <h2 id="admin-current-license-title">Dedicated Current Plan Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates the institute’s live capability state instead of collapsing that drill-down
        back into the shared licensing workspace.
      </p>

      <LicensingWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading current license..." : inlineMessage ?? "Current license workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentPlan.currentLayer} ({resolveLayerBadge(currentPlan.currentLayer)}).
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{currentPlan.planName}</h3>
          <p>
            Start {currentPlan.licenseStartDate} · Renewal {currentPlan.renewalDate} · Expiry {currentPlan.expiryDate}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/licensing/current
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Current Layer</p>
          <h3>{currentPlan.currentLayer}</h3>
          <small>{resolveLayerBadge(currentPlan.currentLayer)}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Students</p>
          <h3>{currentPlan.activeStudentCount}</h3>
          <small>Max allowed {currentPlan.maxStudentLimit}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Attempts Remaining</p>
          <h3>{attemptsRemaining}</h3>
          <small>Used {currentPlan.attemptsUsedThisMonth}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Concurrency Limit</p>
          <h3>{currentPlan.concurrencyLimit}</h3>
          <small>Vendor-enforced operational ceiling</small>
        </article>
      </div>

      <div className="admin-settings-grid-three">
        <article className="admin-settings-layer-card">
          <p><strong>Plan Name:</strong> {currentPlan.planName}</p>
          <p><strong>Billing Cycle:</strong> {currentPlan.billingCycle}</p>
          <p><strong>Current Layer:</strong> {currentPlan.currentLayer}</p>
          <p><strong>Layer Badge:</strong> {resolveLayerBadge(currentPlan.currentLayer)}</p>
        </article>
        <article className="admin-settings-layer-card">
          <p><strong>License Start Date:</strong> {currentPlan.licenseStartDate}</p>
          <p><strong>Expiry Date:</strong> {currentPlan.expiryDate}</p>
          <p><strong>Renewal Date:</strong> {currentPlan.renewalDate}</p>
        </article>
        <article className="admin-settings-layer-card">
          <p><strong>Active Student Count:</strong> {currentPlan.activeStudentCount}</p>
          <p><strong>Max Student Limit:</strong> {currentPlan.maxStudentLimit}</p>
          <p><strong>Attempts Used This Month:</strong> {currentPlan.attemptsUsedThisMonth}</p>
          <p><strong>Attempts Quota This Month:</strong> {currentPlan.attemptsQuotaThisMonth}</p>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Single source of truth</p>
          <h4>Server-signed license object</h4>
          <p>
            The institute license document remains vendor-controlled, optionally signed, cached short-term after
            login, and refreshed periodically.
          </p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Backend enforcement</p>
          <h4>No UI-only unlocks</h4>
          <p>Protected endpoints must reject missing license capabilities server-side instead of trusting UI state.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Current restriction posture</p>
          <h4>{hasLayerAccess(currentPlan.currentLayer, "L3") ? "Full governance layer active" : "Institute-side restrictions active"}</h4>
          <p>
            Locked capabilities return a FeatureNotLicensed-style response with the required layer so the UI can
            explain the restriction without exposing mutation controls.
          </p>
        </article>
      </div>

      <UiTable
        caption="Final license object model"
        columns={licenseObjectColumns}
        rows={licenseObjectRows}
        rowKey={(row) => row.field}
        emptyStateText="No license object fields available."
      />

      <UiTable
        caption="Backend enforcement matrix"
        columns={enforcementColumns}
        rows={enforcementRows}
        rowKey={(row) => row.capability}
        emptyStateText="No enforcement rows available."
      />

      <UiTable
        caption="Institute-side license restriction messages"
        columns={restrictionColumns}
        rows={restrictionRows}
        rowKey={(row) => row.restrictedAction}
        emptyStateText="No license restriction rows available."
      />

      <p className="admin-settings-inline-note">
        Storage alignment: license is a frequently read HOT document, licenseHistory is WARM audit data, and
        billing logs remain vendor-side only.
      </p>
    </section>
  );
}

export default AdminCurrentLicensePage;
