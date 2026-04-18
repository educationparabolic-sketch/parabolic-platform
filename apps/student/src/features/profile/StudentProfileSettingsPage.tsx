import { useMemo, useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getFirebaseAuth } from "../../../../../shared/services/firebaseClient";

interface StudentProfileSettings {
  name: string;
  email: string;
  batch: string;
  academicYear: string;
}

interface JwtLikePayload {
  name?: string;
  email?: string;
  sub?: string;
  batch?: string;
  academicYear?: string;
}

function decodePayload(idToken: string | null): JwtLikePayload {
  if (!idToken) {
    return {};
  }

  const parts = idToken.split(".");
  if (parts.length < 2) {
    return {};
  }

  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
    const decoded = atob(encoded + padding);
    return JSON.parse(decoded) as JwtLikePayload;
  } catch {
    return {};
  }
}

function StudentProfileSettingsPage() {
  const { session, signOut } = useAuthProvider();
  const [notice, setNotice] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const profile = useMemo<StudentProfileSettings>(() => {
    const tokenPayload = decodePayload(session.idToken);
    const email = session.user?.email ?? tokenPayload.email ?? tokenPayload.sub ?? "student@parabolic.local";
    const name = session.user?.displayName ?? tokenPayload.name ?? "Student";

    return {
      name,
      email,
      batch: tokenPayload.batch ?? "Batch A",
      academicYear: tokenPayload.academicYear ?? "2026",
    };
  }, [session.idToken, session.user?.displayName, session.user?.email]);

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!profile.email) {
      setNotice("Unable to send reset link because no student email was found in the session.");
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), profile.email);
      setNotice(`Password reset link sent to ${profile.email}.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Password reset failed.";
      setNotice(reason);
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <section className="student-content-card student-profile-page" aria-labelledby="student-profile-title">
      <p className="student-content-eyebrow">Build 128</p>
      <h2 id="student-profile-title">Profile & Settings</h2>
      <p className="student-content-copy">
        Manage account-level details and security actions without exposing performance-edit controls.
      </p>

      <div className="student-profile-grid" role="list" aria-label="Student profile attributes">
        <article className="student-profile-field" role="listitem">
          <h3>Name</h3>
          <p>{profile.name}</p>
        </article>
        <article className="student-profile-field" role="listitem">
          <h3>Email</h3>
          <p>{profile.email}</p>
        </article>
        <article className="student-profile-field" role="listitem">
          <h3>Batch</h3>
          <p>{profile.batch}</p>
        </article>
        <article className="student-profile-field" role="listitem">
          <h3>Academic Year</h3>
          <p>{profile.academicYear}</p>
        </article>
      </div>

      <div className="student-content-note">
        Performance and assessment analytics are read-only in this section. Profile actions are limited to
        account security and session control.
      </div>

      <form className="student-profile-actions" onSubmit={handlePasswordReset}>
        <button type="submit" disabled={isSendingReset || session.status !== "authenticated"}>
          {isSendingReset ? "Sending reset link..." : "Change Password"}
        </button>
        <button
          type="button"
          className="student-profile-logout-button"
          disabled={session.status !== "authenticated"}
          onClick={() => {
            void signOut();
          }}
        >
          Logout
        </button>
      </form>

      {notice ? <p className="student-profile-notice">{notice}</p> : null}
    </section>
  );
}

export default StudentProfileSettingsPage;
