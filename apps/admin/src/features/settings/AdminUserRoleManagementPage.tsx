import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  removeUserAccess,
  resetUserPassword,
  upsertUserAccess,
  type AdminSettingsSnapshot,
  type StaffAccessRecord,
  type StaffRole,
  type StaffStatus,
} from "./settingsDataset";

const SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

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

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [userDraft, setUserDraft] = useState<UserDraft>(DEFAULT_USER_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setInlineMessage(message);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchSettingsSnapshot(SETTINGS_INSTITUTE_ID);
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
  }, [applySnapshot]);

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

  async function handleUpsert(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canEditUsers) {
      setInlineMessage("Director access is read-only for user and role changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await upsertUserAccess(SETTINGS_INSTITUTE_ID, userDraft);
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
      const nextSnapshot = await removeUserAccess(SETTINGS_INSTITUTE_ID, userId);
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
      const nextSnapshot = await resetUserPassword(SETTINGS_INSTITUTE_ID, userId);
      applySnapshot(nextSnapshot, `Password reset request logged for ${userId}.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Password reset request failed.";
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

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/settings/profile">Institute Profile</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/academic-year">Academic Year</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/execution-policy">Execution Policy</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/security">Security & Access</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/data">Data & Archive</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/settings/system">System Configuration</NavLink>
      </p>

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
