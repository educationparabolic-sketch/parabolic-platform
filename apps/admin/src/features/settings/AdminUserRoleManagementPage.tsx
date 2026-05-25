import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  removeUserAccess,
  resolveAdminInstituteId,
  resetUserPassword,
  upsertUserAccess,
  type AdminSettingsSnapshot,
  type StaffAccessRecord,
  type StaffRole,
  type StaffStatus,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

interface UserDraft {
  userId: string;
  displayName: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
}

const DEFAULT_USER_DRAFT: UserDraft = {
  displayName: "",
  email: "",
  role: "teacher",
  status: "active",
  userId: "",
};

function toLocalDatetime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16);
}

function AdminUserRoleManagementPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditUsers = !isDirector;
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [userDraft, setUserDraft] = useState<UserDraft>(DEFAULT_USER_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [selectedActionUserId, setSelectedActionUserId] = useState(FALLBACK_SNAPSHOT.users[0]?.userId ?? "");
  const [selectedActionRole, setSelectedActionRole] = useState<StaffRole>(FALLBACK_SNAPSHOT.users[0]?.role ?? "teacher");

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setSelectedActionUserId((currentValue) => {
      if (nextSnapshot.users.some((user) => user.userId === currentValue)) {
        return currentValue;
      }
      return nextSnapshot.users[0]?.userId ?? "";
    });
    setInlineMessage(message);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchSettingsSnapshot(settingsInstituteId);
        if (!isMounted) {
          return;
        }

        applySnapshot(
          nextSnapshot,
          isLocalSettingsReadMode() ?
            "Local read mode: deterministic user and role snapshot loaded." :
            "User and role settings loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load user and role settings.";
        applySnapshot(FALLBACK_SNAPSHOT, `${reason} Falling back to deterministic Build 125 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [applySnapshot, settingsInstituteId]);

  const userColumns = useMemo<UiTableColumn<StaffAccessRecord>[]>(
    () => [
      {
        id: "user",
        header: "User",
        render: (user) => (
          <div className="admin-risk-student-cell">
            <strong>{user.displayName}</strong>
            <small>{user.userId}</small>
          </div>
        ),
      },
      {
        id: "email",
        header: "Email",
        render: (user) => user.email,
      },
      {
        id: "role",
        header: "Role",
        render: (user) => user.role,
      },
      {
        id: "status",
        header: "Status",
        render: (user) => user.status,
      },
      {
        id: "updatedAt",
        header: "Updated",
        render: (user) => toLocalDatetime(user.updatedAt),
      },
    ],
    [],
  );
  const selectedActionUser = useMemo(
    () => snapshot.users.find((user) => user.userId === selectedActionUserId) ?? snapshot.users[0] ?? null,
    [selectedActionUserId, snapshot.users],
  );

  useEffect(() => {
    if (selectedActionUser) {
      setSelectedActionRole(selectedActionUser.role);
    }
  }, [selectedActionUser]);

  async function handleUpsert(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for user and role changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await upsertUserAccess(settingsInstituteId, userDraft);
      applySnapshot(nextSnapshot, `User ${userDraft.userId} access updated.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "User access update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(): Promise<void> {
    const userId = userDraft.userId.trim();
    if (!userId) {
      return;
    }

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for user removal.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await removeUserAccess(settingsInstituteId, userId);
      applySnapshot(nextSnapshot, `User ${userId} removed from institute role registry.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "User removal failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset(): Promise<void> {
    const userId = userDraft.userId.trim();
    if (!userId) {
      return;
    }

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for password reset requests.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await resetUserPassword(settingsInstituteId, userId);
      applySnapshot(nextSnapshot, `Password reset request logged for ${userId}.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Password reset request failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExplicitRoleChange(): Promise<void> {
    if (!selectedActionUser) {
      return;
    }

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for role change requests.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await upsertUserAccess(settingsInstituteId, {
        ...selectedActionUser,
        role: selectedActionRole,
      });
      applySnapshot(nextSnapshot, `Role change logged for ${selectedActionUser.userId}: ${selectedActionUser.role} to ${selectedActionRole}.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Role change request failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExplicitSuspendUser(): Promise<void> {
    if (!selectedActionUser) {
      return;
    }

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for suspend-user requests.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await upsertUserAccess(settingsInstituteId, {
        ...selectedActionUser,
        status: "suspended",
      });
      applySnapshot(nextSnapshot, `Suspend-user request logged for ${selectedActionUser.userId}.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Suspend-user request failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-user-role-management-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-user-role-management-title">Dedicated User & Role Management Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates user provisioning, role changes, removal, and password reset requests
        instead of collapsing that drill-down back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading user and role settings..." : inlineMessage ?? "User and role management workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Mutations are audit-backed and routed through secured settings APIs.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>Institute Access Registry</h3>
          <p>
            User access state covers admin, teacher, director, and support roles with immutable audit on mutation.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/users
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Total Users</p>
          <h3>{snapshot.users.length}</h3>
          <small>Current institute access records</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Admins</p>
          <h3>{snapshot.users.filter((user) => user.role === "admin").length}</h3>
          <small>Full operations access</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Suspended</p>
          <h3>{snapshot.users.filter((user) => user.status === "suspended").length}</h3>
          <small>Inactive access records</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Current Capability Roles</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Admin</p>
            <h4>Operational owner</h4>
            <p>Can manage tests, assignments, analytics, and institute settings.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Teacher</p>
            <h4>Academic operator</h4>
            <p>Can generate tests and assign workflows with limited analytics visibility.</p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Director</p>
            <h4>Read-only strategic view</h4>
            <p>Can review analytics and governance but not mutate institute settings here.</p>
          </article>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Explicit User Action Set</h3>
        <p className="admin-content-copy">
          Add user, remove user, password reset, change role, and suspend-user requests are separated here so each
          mutation has a clear audit intent before it is sent to the secured settings API.
        </p>
        <div className="admin-settings-user-action-panel">
          <label>
            Selected User
            <select
              value={selectedActionUser?.userId ?? ""}
              disabled={!canEditUsers || isSubmitting || snapshot.users.length === 0}
              onChange={(event) => {
                setSelectedActionUserId(event.target.value);
              }}
            >
              {snapshot.users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.displayName} ({user.userId})
                </option>
              ))}
            </select>
          </label>
          <label>
            Change Role To
            <select
              value={selectedActionRole}
              disabled={!canEditUsers || isSubmitting || !selectedActionUser}
              onChange={(event) => {
                setSelectedActionRole(event.target.value as StaffRole);
              }}
            >
              <option value="admin">admin</option>
              <option value="teacher">teacher</option>
              <option value="director">director</option>
              <option value="support">support</option>
            </select>
          </label>
          <div className="admin-settings-action-summary">
            <span>Current access</span>
            <strong>
              {selectedActionUser ?
                `${selectedActionUser.role} / ${selectedActionUser.status}` :
                "No user selected"}
            </strong>
          </div>
          <button
            type="button"
            className="admin-compact-button"
            disabled={!canEditUsers || isSubmitting || !selectedActionUser || selectedActionUser.role === selectedActionRole}
            onClick={() => {
              void handleExplicitRoleChange();
            }}
          >
            Change Role
          </button>
          <button
            type="button"
            className="admin-compact-button"
            disabled={!canEditUsers || isSubmitting || !selectedActionUser || selectedActionUser.status === "suspended"}
            onClick={() => {
              void handleExplicitSuspendUser();
            }}
          >
            Suspend User
          </button>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>User Registry</h3>
        <UiTable
          caption="Settings users table"
          columns={userColumns}
          rows={snapshot.users}
          rowKey={(user) => user.userId}
          emptyStateText="No users configured."
        />
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleUpsert(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditUsers || isSubmitting}>
            <div className="admin-settings-grid-two">
              <label>
                User ID
                <input
                  value={userDraft.userId}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      userId: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Display Name
                <input
                  value={userDraft.displayName}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Role
                <select
                  value={userDraft.role}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      role: event.target.value as StaffRole,
                    }));
                  }}
                >
                  <option value="admin">admin</option>
                  <option value="teacher">teacher</option>
                  <option value="director">director</option>
                  <option value="support">support</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={userDraft.status}
                  onChange={(event) => {
                    setUserDraft((current) => ({
                      ...current,
                      status: event.target.value as StaffStatus,
                    }));
                  }}
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </label>
            </div>
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditUsers || isSubmitting}>
            {isSubmitting ? "Saving..." : "Upsert User"}
          </button>
        </div>
      </form>

      <div className="admin-settings-user-actions">
        <button
          type="button"
          className="admin-compact-button"
          disabled={!canEditUsers || isSubmitting || userDraft.userId.trim().length === 0}
          onClick={() => {
            void handleRemove();
          }}
        >
          Remove User
        </button>
        <button
          type="button"
          className="admin-compact-button"
          disabled={!canEditUsers || isSubmitting || userDraft.userId.trim().length === 0}
          onClick={() => {
            void handlePasswordReset();
          }}
        >
          Reset Password
        </button>
      </div>
    </section>
  );
}

export default AdminUserRoleManagementPage;
