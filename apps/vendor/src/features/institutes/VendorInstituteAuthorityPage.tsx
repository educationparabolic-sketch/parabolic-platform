import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  VendorAdministratorCommandIntent,
  VendorInstituteDetail,
  VendorInstituteLifecycleIntent,
  VendorInstituteLifecycleState,
  VendorInstituteListResult,
  VendorInstituteSummary,
  VendorOnboardingCommandIntent,
  VendorOnboardingDetail,
  VendorOnboardingListResult,
  VendorOnboardingStatus,
} from "../../../../../shared/contracts/vendorInstitutes";
import {
  classifyVendorInstituteFailure,
  createVendorIdempotencyKey,
  vendorInstitutesApi,
  type VendorInstituteFailure,
} from "./vendorInstitutesApi";

type View = "directory" | "onboarding";

const LIFECYCLE_FILTERS: Array<VendorInstituteLifecycleState | ""> = [
  "",
  "onboarding",
  "active",
  "suspended",
  "archived",
  "deletion_scheduled",
  "recovery_required",
];

const ONBOARDING_FILTERS: Array<VendorOnboardingStatus | ""> = [
  "",
  "draft",
  "pending_review",
  "information_required",
  "approved",
  "institute_provisioned",
  "awaiting_commercial_authority",
  "ready_for_administrator",
  "setup_in_progress",
  "ready_for_activation",
  "active",
  "rejected",
  "expired",
];

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

function FailurePanel(props: { failure: VendorInstituteFailure; onRetry: () => void }) {
  const { failure, onRetry } = props;
  return (
    <section
      className={`vendor-authority-state vendor-authority-state-${failure.kind}`}
      role="alert"
    >
      <h3>
        {failure.kind === "permission"
          ? "Permission required"
          : failure.kind === "conflict"
            ? "Authoritative conflict"
            : "Institute authority unavailable"}
      </h3>
      <p>{failure.message}</p>
      {failure.requestId ? <small>Request: {failure.requestId}</small> : null}
      <button type="button" onClick={onRetry}>
        Retry authoritative load
      </button>
    </section>
  );
}

function CommercialBoundary() {
  return (
    <aside className="vendor-authority-boundary" aria-label="Commercial authority status">
      <strong>Commercial controls use the registered licensing workspace.</strong>
      <span>
        This institute view keeps its bounded commercial summary read-only. License decisions,
        catalog, subscriptions, invoices, payment confirmation, and provider reconciliation use
        the strict <Link to="/vendor/licensing">licensing and billing workspace</Link>.
      </span>
    </aside>
  );
}

function PropagationBoundary() {
  return (
    <p className="vendor-authority-boundary">
      Institute-wide claim and session propagation is pending BWM-036. This workspace reports only
      the persisted command result.
    </p>
  );
}

function DirectoryTable(props: { rows: VendorInstituteSummary[] }) {
  return (
    <div className="vendor-authority-table-wrap">
      <table className="vendor-authority-table">
        <caption>Authoritative Vendor institute directory</caption>
        <thead>
          <tr>
            <th>Institute</th>
            <th>Lifecycle</th>
            <th>License</th>
            <th>Active students</th>
            <th>Primary administrator</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.instituteId}>
              <td>
                <Link to={`/vendor/institutes/${encodeURIComponent(row.instituteId)}`}>
                  {row.registeredName}
                </Link>
                <small>{row.instituteId}</small>
              </td>
              <td>
                <span className={`vendor-status vendor-status-${row.lifecycleState}`}>
                  {title(row.lifecycleState)}
                </span>
              </td>
              <td>
                {row.commercial.authorityState === "available"
                  ? `${row.commercial.licenseLayer ?? "—"} · ${row.commercial.licenseState ?? "—"}`
                  : title(row.commercial.authorityState)}
              </td>
              <td>{row.aggregate.activeStudentCount?.toLocaleString("en-IN") ?? "Unavailable"}</td>
              <td>
                {row.primaryAdministrator
                  ? `${row.primaryAdministrator.displayName} · ${title(row.primaryAdministrator.status)}`
                  : "Not configured"}
              </td>
              <td>{dateLabel(row.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InstituteDirectory() {
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [lifecycleState, setLifecycleState] = useState<VendorInstituteLifecycleState | "">("");
  const [licenseLayer, setLicenseLayer] = useState<"" | "L0" | "L1" | "L2" | "L3">("");
  const [cursorTrail, setCursorTrail] = useState<Array<string | null>>([null]);
  const [result, setResult] = useState<VendorInstituteListResult | null>(null);
  const [failure, setFailure] = useState<VendorInstituteFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const cursor = cursorTrail[cursorTrail.length - 1] ?? undefined;

  useEffect(() => {
    let active = true;
    const loadDirectory = async () => {
      setLoading(true);
      setFailure(null);
      try {
        const nextResult = await vendorInstitutesApi.listInstitutes({
          ...(cursor ? { cursor } : {}),
          ...(lifecycleState ? { lifecycleState } : {}),
          ...(licenseLayer ? { licenseLayer } : {}),
          ...(query ? { query } : {}),
          limit: 20,
        });
        if (active) setResult(nextResult);
      } catch (error) {
        if (active) {
          setResult(null);
          setFailure(classifyVendorInstituteFailure(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDirectory();
    return () => {
      active = false;
    };
  }, [cursor, lifecycleState, licenseLayer, query, reloadKey]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursorTrail([null]);
    setQuery(queryDraft.trim());
  }

  function clearFilters() {
    setQueryDraft("");
    setQuery("");
    setLifecycleState("");
    setLicenseLayer("");
    setCursorTrail([null]);
  }

  return (
    <div className="vendor-authority-stack">
      <CommercialBoundary />
      <form className="vendor-authority-filters" onSubmit={applyFilters}>
        <label>
          Search
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Name, ID, or contact"
          />
        </label>
        <label>
          Lifecycle
          <select
            value={lifecycleState}
            onChange={(event) => {
              setLifecycleState(event.target.value as VendorInstituteLifecycleState | "");
              setCursorTrail([null]);
            }}
          >
            {LIFECYCLE_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? title(value) : "All lifecycle states"}
              </option>
            ))}
          </select>
        </label>
        <label>
          License layer
          <select
            value={licenseLayer}
            onChange={(event) => {
              setLicenseLayer(event.target.value as typeof licenseLayer);
              setCursorTrail([null]);
            }}
          >
            <option value="">All layers</option>
            <option value="L0">L0</option>
            <option value="L1">L1</option>
            <option value="L2">L2</option>
            <option value="L3">L3</option>
          </select>
        </label>
        <div>
          <button type="submit">Apply filters</button>
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </form>

      {loading ? (
        <section className="vendor-authority-state" role="status">
          <h3>Loading institutes</h3>
          <p>No cached or fixture institute values are shown while authority is loading.</p>
        </section>
      ) : null}
      {!loading && failure ? (
        <FailurePanel failure={failure} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}
      {!loading && !failure && result?.items.length === 0 ? (
        <section className="vendor-authority-state">
          <h3>No institutes match</h3>
          <p>
            Change the bounded filters or create an institute from an approved onboarding record.
          </p>
        </section>
      ) : null}
      {!loading && !failure && result && result.items.length > 0 ? (
        <>
          <div className="vendor-authority-summary">
            <strong>{result.totalMatching.toLocaleString("en-IN")} matching institutes</strong>
            <span>Page size: up to 20</span>
          </div>
          <DirectoryTable rows={result.items} />
          <nav className="vendor-authority-pagination" aria-label="Institute directory pages">
            <button
              type="button"
              disabled={cursorTrail.length === 1}
              onClick={() => setCursorTrail((current) => current.slice(0, -1))}
            >
              Previous page
            </button>
            <span>Page {cursorTrail.length}</span>
            <button
              type="button"
              disabled={!result.nextCursor}
              onClick={() =>
                result.nextCursor && setCursorTrail((current) => [...current, result.nextCursor])
              }
            >
              Next page
            </button>
          </nav>
        </>
      ) : null}
    </div>
  );
}

function availableLifecycleActions(
  detail: VendorInstituteDetail,
): VendorInstituteLifecycleIntent["action"][] {
  if (detail.lifecycleState === "active") return ["suspend", "archive"];
  if (detail.lifecycleState === "suspended") return ["restore", "archive"];
  if (detail.lifecycleState === "onboarding") return ["archive"];
  if (detail.lifecycleState === "archived") return ["schedule_deletion"];
  if (detail.lifecycleState === "deletion_scheduled") return ["cancel_deletion", "execute_purge"];
  if (detail.lifecycleState === "recovery_required") return ["retry_purge"];
  return [];
}

function InstituteDetailView({ instituteId }: { instituteId: string }) {
  const [detail, setDetail] = useState<VendorInstituteDetail | null>(null);
  const [failure, setFailure] = useState<VendorInstituteFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [vendorAccountReference, setVendorAccountReference] = useState("");
  const [lifecycleAction, setLifecycleAction] = useState<
    VendorInstituteLifecycleIntent["action"] | ""
  >("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [administratorName, setAdministratorName] = useState("");
  const [administratorEmail, setAdministratorEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const nextDetail = await vendorInstitutesApi.getInstitute(instituteId);
      setDetail(nextDetail);
      setRegisteredName(nextDetail.profile.registeredName);
      setVendorAccountReference(nextDetail.profile.vendorAccountReference ?? "");
      setLifecycleAction(availableLifecycleActions(nextDetail)[0] ?? "");
    } catch (error) {
      setDetail(null);
      setFailure(classifyVendorInstituteFailure(error));
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcileMutation(run: () => Promise<unknown>, successMessage: string) {
    setMutating(true);
    setFailure(null);
    setMessage("");
    try {
      await run();
      await load();
      setMessage(successMessage);
    } catch (error) {
      setFailure(classifyVendorInstituteFailure(error));
    } finally {
      setMutating(false);
    }
  }

  function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !registeredName.trim()) return;
    void reconcileMutation(
      () =>
        vendorInstitutesApi.updateInstitute(instituteId, {
          expectedRevision: detail.revision,
          idempotencyKey: createVendorIdempotencyKey(),
          profile: {
            registeredName: registeredName.trim(),
            vendorAccountReference: vendorAccountReference.trim() || null,
          },
        }),
      "Profile saved and reloaded from authoritative state.",
    );
  }

  function transitionLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !lifecycleAction) return;
    const metadata = {
      expectedRevision: detail.revision,
      idempotencyKey: createVendorIdempotencyKey(),
    };
    let intent: VendorInstituteLifecycleIntent;
    if (lifecycleAction === "schedule_deletion") {
      if (confirmation.trim() !== instituteId) return;
      intent = {
        ...metadata,
        action: lifecycleAction,
        confirmInstituteId: confirmation.trim(),
        reason: reason.trim() || "Vendor-approved deletion schedule.",
      };
    } else if (lifecycleAction === "execute_purge" || lifecycleAction === "retry_purge") {
      if (confirmation.trim() !== instituteId) return;
      intent = { ...metadata, action: lifecycleAction, confirmInstituteId: confirmation.trim() };
    } else {
      intent = {
        ...metadata,
        action: lifecycleAction,
        reason: reason.trim() || `Vendor-approved ${lifecycleAction}.`,
      } as VendorInstituteLifecycleIntent;
    }
    void reconcileMutation(
      () => vendorInstitutesApi.transitionInstitute(instituteId, intent),
      "Lifecycle command persisted and authoritative detail reloaded.",
    );
  }

  function administratorCommand(
    action: VendorAdministratorCommandIntent["action"],
    targetUserIdOverride?: string,
  ) {
    if (!detail) return;
    const metadata = {
      expectedRevision: detail.settingsRevision,
      idempotencyKey: createVendorIdempotencyKey(),
    };
    let intent: VendorAdministratorCommandIntent;
    if (action === "invite_primary" || action === "propose_primary_replacement") {
      if (!administratorName.trim() || !administratorEmail.trim()) return;
      intent = {
        ...metadata,
        action,
        administrator: { displayName: administratorName.trim(), email: administratorEmail.trim() },
      };
    } else {
      const targetUserId = targetUserIdOverride ?? detail.primaryAdministrator?.userId;
      if (!targetUserId) return;
      intent = { ...metadata, action, targetUserId };
    }
    void reconcileMutation(
      () => vendorInstitutesApi.commandAdministrator(instituteId, intent),
      "Administrator command persisted and authoritative detail reloaded.",
    );
  }

  if (loading)
    return (
      <section className="vendor-authority-state" role="status">
        <h3>Loading institute detail</h3>
        <p>No fixture detail is substituted.</p>
      </section>
    );
  if (failure && !detail) return <FailurePanel failure={failure} onRetry={() => void load()} />;
  if (!detail)
    return (
      <section className="vendor-authority-state">
        <h3>Institute not found</h3>
        <p>The authoritative service returned no detail.</p>
      </section>
    );

  const actions = availableLifecycleActions(detail);
  const primary = detail.primaryAdministrator;
  const pendingAdministrator =
    detail.administrators.find((administrator) => administrator.status === "invitation_pending") ??
    null;
  const administratorActions: VendorAdministratorCommandIntent["action"][] =
    primary && primary.status !== "invitation_pending"
      ? [
          "reset_primary_access",
          ...(primary.status === "suspended"
            ? (["restore_primary_access"] as const)
            : (["suspend_primary_access"] as const)),
        ]
      : [];
  const pendingAdministratorActions: VendorAdministratorCommandIntent["action"][] =
    pendingAdministrator
      ? ["resend_primary_invitation", "revoke_primary_invitation", "activate_primary_replacement"]
      : [];

  return (
    <div className="vendor-authority-stack">
      <div className="vendor-authority-back">
        <Link to="/vendor/institutes">← Institute directory</Link>
      </div>
      <header className="vendor-authority-detail-header">
        <div>
          <p className="vendor-content-eyebrow">Authoritative institute</p>
          <h2>{detail.registeredName}</h2>
          <p>
            {detail.instituteId} · revision {detail.revision}
          </p>
        </div>
        <span className={`vendor-status vendor-status-${detail.lifecycleState}`}>
          {title(detail.lifecycleState)}
        </span>
      </header>
      {failure ? <FailurePanel failure={failure} onRetry={() => void load()} /> : null}
      {message ? (
        <p className="vendor-authority-success" role="status">
          {message}
        </p>
      ) : null}
      <CommercialBoundary />
      <section className="vendor-authority-grid">
        <article>
          <h3>Operational authority</h3>
          <dl>
            <div>
              <dt>Access</dt>
              <dd>{title(detail.accessStatus)}</dd>
            </div>
            <div>
              <dt>Students</dt>
              <dd>
                {detail.aggregate.activeStudentCount?.toLocaleString("en-IN") ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Monthly runs</dt>
              <dd>{detail.aggregate.monthlyTestRuns?.toLocaleString("en-IN") ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Aggregate as of</dt>
              <dd>{dateLabel(detail.aggregate.aggregateAsOf)}</dd>
            </div>
          </dl>
        </article>
        <article>
          <h3>Deletion authority</h3>
          <dl>
            <div>
              <dt>Stage</dt>
              <dd>{title(detail.deletion.stage)}</dd>
            </div>
            <div>
              <dt>Scheduled</dt>
              <dd>{dateLabel(detail.deletion.scheduledAt)}</dd>
            </div>
            <div>
              <dt>Eligible</dt>
              <dd>{dateLabel(detail.deletion.eligibleAt)}</dd>
            </div>
            <div>
              <dt>Last error</dt>
              <dd>{detail.deletion.lastErrorCode ?? "None"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <form className="vendor-authority-form" onSubmit={updateProfile}>
        <h3>Vendor-owned profile</h3>
        <label>
          Registered name
          <input
            required
            maxLength={160}
            value={registeredName}
            onChange={(event) => setRegisteredName(event.target.value)}
          />
        </label>
        <label>
          Vendor account reference
          <input
            maxLength={120}
            value={vendorAccountReference}
            onChange={(event) => setVendorAccountReference(event.target.value)}
          />
        </label>
        <button type="submit" disabled={mutating}>
          Save and reload
        </button>
      </form>

      <form className="vendor-authority-form" onSubmit={transitionLifecycle}>
        <h3>Lifecycle command</h3>
        {actions.length === 0 ? (
          <p>No browser-issued lifecycle command is legal in the current state.</p>
        ) : (
          <>
            <label>
              Action
              <select
                value={lifecycleAction}
                onChange={(event) =>
                  setLifecycleAction(event.target.value as typeof lifecycleAction)
                }
              >
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {title(action)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
              />
            </label>
            {lifecycleAction === "schedule_deletion" ||
            lifecycleAction === "execute_purge" ||
            lifecycleAction === "retry_purge" ? (
              <label>
                Type institute ID to confirm
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={instituteId}
                />
              </label>
            ) : null}
            <button type="submit" disabled={mutating}>
              Run command and reload
            </button>
          </>
        )}
      </form>
      <PropagationBoundary />

      <section className="vendor-authority-form">
        <h3>Primary administrator</h3>
        {primary ? (
          <div className="vendor-authority-admin">
            <p>
              <strong>{primary.displayName}</strong>
              <br />
              {primary.email}
              <br />
              {title(primary.status)} · invitation {title(primary.invitationStatus)}
            </p>
            <div className="vendor-authority-actions">
              {administratorActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={mutating}
                  onClick={() => administratorCommand(action)}
                >
                  {title(action)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p>No active primary administrator is authoritative for this institute.</p>
        )}
        {pendingAdministrator ? (
          <div className="vendor-authority-admin">
            <p>
              <strong>Pending authority: {pendingAdministrator.displayName}</strong>
              <br />
              {pendingAdministrator.email}
              <br />
              Invitation {title(pendingAdministrator.invitationStatus)}
            </p>
            <div className="vendor-authority-actions">
              {pendingAdministratorActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={mutating}
                  onClick={() => administratorCommand(action, pendingAdministrator.userId)}
                >
                  {title(action)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label>
          Administrator name
          <input
            value={administratorName}
            onChange={(event) => setAdministratorName(event.target.value)}
          />
        </label>
        <label>
          Administrator email
          <input
            type="email"
            value={administratorEmail}
            onChange={(event) => setAdministratorEmail(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={
            mutating ||
            Boolean(pendingAdministrator) ||
            !administratorName.trim() ||
            !administratorEmail.trim()
          }
          onClick={() =>
            administratorCommand(primary ? "propose_primary_replacement" : "invite_primary")
          }
        >
          {primary ? "Propose replacement" : "Invite primary administrator"}
        </button>
        <p>
          Invitation delivery and Auth reconciliation are server-owned; this page never fabricates
          acceptance or credentials.
        </p>
      </section>

      <section>
        <h3>Bounded administrators</h3>
        {detail.administrators.length === 0 ? (
          <p className="vendor-authority-state">No administrator records are available.</p>
        ) : (
          <ul className="vendor-authority-list">
            {detail.administrators.map((administrator) => (
              <li key={administrator.userId}>
                <strong>{administrator.displayName}</strong>
                <span>
                  {administrator.email} · {title(administrator.role)} ·{" "}
                  {title(administrator.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function onboardingActions(
  status: VendorOnboardingStatus,
): VendorOnboardingCommandIntent["action"][] {
  if (status === "draft" || status === "information_required")
    return ["submit", "update_application", "expire"];
  if (status === "pending_review") return ["approve", "request_information", "reject", "expire"];
  if (status === "institute_provisioned") return ["verify_profile"];
  if (status === "awaiting_commercial_authority" || status === "ready_for_administrator")
    return ["reconcile_prerequisites"];
  if (status === "setup_in_progress") return ["complete_initial_settings"];
  if (status === "ready_for_activation") return ["activate"];
  return [];
}

function OnboardingWorkspace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("onboarding");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<VendorOnboardingStatus | "">("");
  const [cursorTrail, setCursorTrail] = useState<Array<string | null>>([null]);
  const cursor = cursorTrail[cursorTrail.length - 1] ?? undefined;
  const [listResult, setListResult] = useState<VendorOnboardingListResult | null>(null);
  const [detail, setDetail] = useState<VendorOnboardingDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [failure, setFailure] = useState<VendorInstituteFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const [commandNote, setCommandNote] = useState("");
  const [showCreate, setShowCreate] = useState(searchParams.get("mode") === "new");
  const [application, setApplication] = useState({
    registeredName: "",
    instituteType: "School",
    location: "",
    timezone: "Asia/Kolkata",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    expectedStudents: "",
    expectedConcurrentStudents: "",
    expectedExamSessionsPerMonth: "",
  });

  const loadDetail = useCallback(async (onboardingId: string) => {
    setDetailLoading(true);
    setFailure(null);
    try {
      setDetail(await vendorInstitutesApi.getOnboarding(onboardingId, { eventsLimit: 25 }));
    } catch (error) {
      setDetail(null);
      setFailure(classifyVendorInstituteFailure(error));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadOnboarding = async () => {
      setListLoading(true);
      setFailure(null);
      try {
        const result = await vendorInstitutesApi.listOnboarding({
          ...(cursor ? { cursor } : {}),
          ...(query ? { query } : {}),
          ...(status ? { status } : {}),
          limit: 20,
        });
        if (active) setListResult(result);
      } catch (error) {
        if (active) {
          setListResult(null);
          setFailure(classifyVendorInstituteFailure(error));
        }
      } finally {
        if (active) setListLoading(false);
      }
    };
    void loadOnboarding();
    return () => {
      active = false;
    };
  }, [cursor, query, reloadKey, status]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [loadDetail, reloadKey, selectedId]);

  async function reconcile(run: () => Promise<unknown>, success: string) {
    setMutating(true);
    setFailure(null);
    setMessage("");
    try {
      await run();
      setReloadKey((value) => value + 1);
      if (selectedId) await loadDetail(selectedId);
      setMessage(success);
    } catch (error) {
      setFailure(classifyVendorInstituteFailure(error));
    } finally {
      setMutating(false);
    }
  }

  function createOnboarding(saveAs: "draft" | "pending_review") {
    const numeric = [
      application.expectedStudents,
      application.expectedConcurrentStudents,
      application.expectedExamSessionsPerMonth,
    ].map((value) => Number.parseInt(value, 10));
    if (
      !application.registeredName.trim() ||
      numeric.some((value) => !Number.isFinite(value) || value < 0)
    )
      return;
    setMutating(true);
    setFailure(null);
    setMessage("");
    void vendorInstitutesApi
      .createOnboarding({
        idempotencyKey: createVendorIdempotencyKey(),
        saveAs,
        application: {
          registeredName: application.registeredName.trim(),
          instituteType: application.instituteType.trim(),
          location: application.location.trim(),
          timezone: application.timezone.trim(),
          primaryContactName: application.primaryContactName.trim(),
          primaryContactEmail: application.primaryContactEmail.trim(),
          primaryContactPhone: application.primaryContactPhone.trim(),
          expectedStudents: numeric[0],
          expectedConcurrentStudents: numeric[1],
          expectedExamSessionsPerMonth: numeric[2],
        },
      })
      .then(async (receipt) => {
        setSearchParams({ view: "onboarding", onboarding: receipt.onboarding.onboardingId });
        setShowCreate(false);
        setReloadKey((value) => value + 1);
        await loadDetail(receipt.onboarding.onboardingId);
        setMessage("Onboarding created and reloaded from authoritative state.");
      })
      .catch((error: unknown) => setFailure(classifyVendorInstituteFailure(error)))
      .finally(() => setMutating(false));
  }

  function runOnboardingCommand(action: VendorOnboardingCommandIntent["action"]) {
    if (!detail) return;
    const metadata = {
      expectedRevision: detail.revision,
      idempotencyKey: createVendorIdempotencyKey(),
    };
    let intent: VendorOnboardingCommandIntent;
    if (action === "reject")
      intent = {
        ...metadata,
        action,
        reason: commandNote.trim() || "Vendor rejected the application.",
      };
    else if (
      action === "submit" ||
      action === "approve" ||
      action === "request_information" ||
      action === "expire"
    )
      intent = {
        ...metadata,
        action,
        note: commandNote.trim() || `Vendor ${title(action).toLowerCase()} command.`,
      };
    else if (action === "update_application")
      intent = { ...metadata, action, application: detail.application };
    else intent = { ...metadata, action };
    void reconcile(
      () => vendorInstitutesApi.commandOnboarding(detail.onboardingId, intent),
      "Onboarding command persisted and authoritative state reloaded.",
    );
  }

  function provisionInstitute() {
    if (!detail || detail.status !== "approved") return;
    setMutating(true);
    setFailure(null);
    setMessage("");
    void vendorInstitutesApi
      .createInstitute({
        onboardingId: detail.onboardingId,
        expectedOnboardingRevision: detail.revision,
        idempotencyKey: createVendorIdempotencyKey(),
      })
      .then((receipt) => {
        navigate(`/vendor/institutes/${encodeURIComponent(receipt.institute.instituteId)}`);
      })
      .catch((error: unknown) => setFailure(classifyVendorInstituteFailure(error)))
      .finally(() => setMutating(false));
  }

  const actions = detail ? onboardingActions(detail.status) : [];

  return (
    <div className="vendor-authority-stack">
      <CommercialBoundary />
      <div className="vendor-authority-toolbar">
        <button type="button" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? "Close application form" : "New onboarding application"}
        </button>
      </div>
      {showCreate ? (
        <form
          className="vendor-authority-form vendor-authority-create"
          onSubmit={(event) => {
            event.preventDefault();
            createOnboarding("pending_review");
          }}
        >
          <h3>Non-commercial onboarding application</h3>
          <label>
            Registered name
            <input
              required
              value={application.registeredName}
              onChange={(event) =>
                setApplication((current) => ({ ...current, registeredName: event.target.value }))
              }
            />
          </label>
          <label>
            Institute type
            <input
              required
              value={application.instituteType}
              onChange={(event) =>
                setApplication((current) => ({ ...current, instituteType: event.target.value }))
              }
            />
          </label>
          <label>
            Location
            <input
              required
              value={application.location}
              onChange={(event) =>
                setApplication((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label>
            Timezone
            <input
              required
              value={application.timezone}
              onChange={(event) =>
                setApplication((current) => ({ ...current, timezone: event.target.value }))
              }
            />
          </label>
          <label>
            Primary contact name
            <input
              required
              value={application.primaryContactName}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  primaryContactName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Primary contact email
            <input
              required
              type="email"
              value={application.primaryContactEmail}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  primaryContactEmail: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Primary contact phone
            <input
              required
              value={application.primaryContactPhone}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  primaryContactPhone: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Expected students
            <input
              required
              type="number"
              min="0"
              value={application.expectedStudents}
              onChange={(event) =>
                setApplication((current) => ({ ...current, expectedStudents: event.target.value }))
              }
            />
          </label>
          <label>
            Expected concurrent students
            <input
              required
              type="number"
              min="0"
              value={application.expectedConcurrentStudents}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  expectedConcurrentStudents: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Expected exam sessions/month
            <input
              required
              type="number"
              min="0"
              value={application.expectedExamSessionsPerMonth}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  expectedExamSessionsPerMonth: event.target.value,
                }))
              }
            />
          </label>
          <div>
            <button type="button" disabled={mutating} onClick={() => createOnboarding("draft")}>
              Save draft
            </button>
            <button type="submit" disabled={mutating}>
              Submit for review
            </button>
          </div>
          <p>Commercial plan, proposal, invoice, and payment fields are intentionally absent.</p>
        </form>
      ) : null}

      <form
        className="vendor-authority-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(queryDraft.trim());
          setCursorTrail([null]);
        }}
      >
        <label>
          Search
          <input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setCursorTrail([null]);
            }}
          >
            {ONBOARDING_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? title(value) : "All statuses"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      {failure ? (
        <FailurePanel failure={failure} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}
      {message ? (
        <p className="vendor-authority-success" role="status">
          {message}
        </p>
      ) : null}
      {listLoading ? (
        <section className="vendor-authority-state" role="status">
          <h3>Loading onboarding</h3>
          <p>No fixture applications are substituted.</p>
        </section>
      ) : null}
      {!listLoading && !failure && listResult?.items.length === 0 ? (
        <section className="vendor-authority-state">
          <h3>No onboarding records match</h3>
          <p>Create an application or change the bounded filters.</p>
        </section>
      ) : null}
      {!listLoading && listResult && listResult.items.length > 0 ? (
        <div className="vendor-authority-split">
          <section>
            <h3>{listResult.totalMatching} onboarding records</h3>
            <ul className="vendor-authority-list">
              {listResult.items.map((item) => (
                <li key={item.onboardingId}>
                  <button
                    type="button"
                    className={selectedId === item.onboardingId ? "vendor-authority-selected" : ""}
                    onClick={() =>
                      setSearchParams({ view: "onboarding", onboarding: item.onboardingId })
                    }
                  >
                    <strong>{item.registeredName}</strong>
                    <span>
                      {title(item.status)} · revision {item.revision}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <nav className="vendor-authority-pagination">
              <button
                type="button"
                disabled={cursorTrail.length === 1}
                onClick={() => setCursorTrail((current) => current.slice(0, -1))}
              >
                Previous
              </button>
              <span>Page {cursorTrail.length}</span>
              <button
                type="button"
                disabled={!listResult.nextCursor}
                onClick={() =>
                  listResult.nextCursor &&
                  setCursorTrail((current) => [...current, listResult.nextCursor])
                }
              >
                Next
              </button>
            </nav>
          </section>
          <section className="vendor-authority-onboarding-detail">
            {detailLoading ? (
              <p role="status">Loading selected application…</p>
            ) : !detail ? (
              <p>Select an onboarding record to inspect authoritative detail.</p>
            ) : (
              <>
                <header>
                  <h3>{detail.registeredName}</h3>
                  <span className={`vendor-status vendor-status-${detail.status}`}>
                    {title(detail.status)}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>Contact</dt>
                    <dd>
                      {detail.application.primaryContactName}
                      <br />
                      {detail.primaryContactEmail}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {detail.application.location} · {detail.application.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt>Commercial readiness</dt>
                    <dd>{title(detail.commercialReadiness)} (read only)</dd>
                  </div>
                  <div>
                    <dt>Institute</dt>
                    <dd>{detail.instituteId ?? "Not provisioned"}</dd>
                  </div>
                </dl>
                {detail.activationBlockers.length ? (
                  <p>
                    <strong>Activation blockers:</strong>{" "}
                    {detail.activationBlockers.map(title).join(", ")}
                  </p>
                ) : (
                  <p>No server-derived activation blockers.</p>
                )}
                <label>
                  Command note/reason
                  <textarea
                    value={commandNote}
                    onChange={(event) => setCommandNote(event.target.value)}
                    maxLength={500}
                  />
                </label>
                <div className="vendor-authority-actions">
                  {actions.map((action) => (
                    <button
                      type="button"
                      key={action}
                      disabled={mutating}
                      onClick={() => runOnboardingCommand(action)}
                    >
                      {title(action)}
                    </button>
                  ))}
                  {detail.status === "approved" ? (
                    <button type="button" disabled={mutating} onClick={provisionInstitute}>
                      Create institute
                    </button>
                  ) : null}
                </div>
                {actions.length === 0 && detail.status !== "approved" ? (
                  <p>No browser-issued transition is legal in this state.</p>
                ) : null}
                <h4>Authoritative events</h4>
                {detail.events.items.length ? (
                  <ol className="vendor-authority-events">
                    {detail.events.items.map((event) => (
                      <li key={event.eventId}>
                        <strong>{title(event.type)}</strong>
                        <span>{event.summary}</span>
                        <time>{dateLabel(event.occurredAt)}</time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No events are available.</p>
                )}
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function VendorInstituteAuthorityPage() {
  const { instituteId } = useParams<{ instituteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: View = requestedView === "onboarding" ? "onboarding" : "directory";
  const decodedInstituteId = useMemo(
    () => (instituteId ? decodeURIComponent(instituteId) : null),
    [instituteId],
  );

  return (
    <section
      className="vendor-content-card admin-content-card vendor-institutes-page"
      aria-labelledby="vendor-institutes-title"
    >
      <header className="vendor-institutes-heading">
        <div>
          <p className="vendor-content-eyebrow admin-content-eyebrow">Institute authority</p>
          <h1 id="vendor-institutes-title">
            {decodedInstituteId ? "Institute detail" : "Institutes"}
          </h1>
          <p className="vendor-content-copy admin-content-copy">
            Secured Vendor reads and commands reconcile from server authority after every mutation.
          </p>
        </div>
        {!decodedInstituteId ? (
          <div className="vendor-institute-view-switch" role="tablist" aria-label="Institute views">
            <button
              type="button"
              role="tab"
              aria-selected={view === "directory"}
              className={view === "directory" ? "vendor-institute-view-active" : ""}
              onClick={() => setSearchParams({})}
            >
              Directory
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "onboarding"}
              className={view === "onboarding" ? "vendor-institute-view-active" : ""}
              onClick={() => setSearchParams({ view: "onboarding" })}
            >
              Onboarding
            </button>
            <button type="button" disabled title="BWM-035 owns commercial license requests">
              License requests unavailable
            </button>
          </div>
        ) : null}
      </header>
      {decodedInstituteId ? (
        <InstituteDetailView instituteId={decodedInstituteId} />
      ) : view === "onboarding" ? (
        <OnboardingWorkspace />
      ) : (
        <InstituteDirectory />
      )}
    </section>
  );
}
