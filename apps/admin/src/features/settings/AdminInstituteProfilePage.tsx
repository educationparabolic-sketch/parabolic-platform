import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  updateInstituteProfile,
  type AdminSettingsSnapshot,
  type InstituteProfileSettings,
} from "./settingsDataset";
import SettingsWorkspaceNav from "./SettingsWorkspaceNav";

const SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";

function AdminInstituteProfilePage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const canEditProfile = !isDirector;

  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [profileForm, setProfileForm] = useState<InstituteProfileSettings>(FALLBACK_SNAPSHOT.profile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const applySnapshot = useCallback((nextSnapshot: AdminSettingsSnapshot, message: string) => {
    setSnapshot(nextSnapshot);
    setProfileForm(nextSnapshot.profile);
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
            "Local read mode: deterministic institute profile snapshot loaded." :
            "Institute profile loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load institute profile.";
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canEditProfile) {
      setInlineMessage("Director access is read-only for institute profile changes.");
      return;
    }

    setIsSubmitting(true);
    setInlineMessage(null);

    try {
      const nextSnapshot = await updateInstituteProfile(SETTINGS_INSTITUTE_ID, profileForm);
      applySnapshot(nextSnapshot, "Institute profile updated via secured admin settings API.");
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Institute profile update failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-institute-profile-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-institute-profile-title">Dedicated Institute Profile Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates institute identity and operational metadata instead of collapsing that
        drill-down back into the shared settings workspace.
      </p>

      <SettingsWorkspaceNav />

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading institute profile..." : inlineMessage ?? "Institute profile workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Profile edits are operational-only and do not rewrite historical analytics.
      </p>

      <div className="admin-analytics-run-detail-header">
        <div>
          <h3>{snapshot.profile.instituteName}</h3>
          <p>
            Default exam type {snapshot.profile.defaultExamType} · Time zone {snapshot.profile.timeZone}
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">
          Route: /admin/settings/profile
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Institute Name</p>
          <h3>{profileForm.instituteName}</h3>
          <small>Primary institute identity</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Time Zone</p>
          <h3>{profileForm.timeZone}</h3>
          <small>Operational timezone setting</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Academic Year Format</p>
          <h3>{profileForm.academicYearFormat}</h3>
          <small>Display convention only</small>
        </article>
      </div>

      <form className="ui-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="ui-form-content">
          <fieldset disabled={!canEditProfile || isSubmitting}>
            <div className="admin-settings-grid-two">
              <label>
                Institute Name
                <input
                  value={profileForm.instituteName}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      instituteName: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Logo Reference
                <input
                  value={profileForm.logoReference}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      logoReference: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Contact Email
                <input
                  type="email"
                  value={profileForm.contactEmail}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      contactEmail: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Contact Phone
                <input
                  value={profileForm.contactPhone}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      contactPhone: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Time Zone
                <input
                  value={profileForm.timeZone}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      timeZone: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Default Exam Type
                <input
                  value={profileForm.defaultExamType}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      defaultExamType: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
              <label>
                Academic Year Format
                <input
                  value={profileForm.academicYearFormat}
                  onChange={(event) => {
                    setProfileForm((current) => ({
                      ...current,
                      academicYearFormat: event.target.value,
                    }));
                  }}
                  required
                />
              </label>
            </div>
          </fieldset>
        </div>
        <div className="ui-form-actions">
          <button type="submit" disabled={!canEditProfile || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminInstituteProfilePage;
