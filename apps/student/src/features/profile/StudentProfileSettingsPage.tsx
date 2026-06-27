import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getFirebaseAuth } from "../../../../../shared/services/firebaseClient";
import { isStudentDebugMode } from "../../services/studentDebugMode";

interface StudentProfileSettings {
  name: string;
  email: string;
  batch: string;
  academicYear: string;
}

interface StudentLivePhotoRecord {
  photoDataUrl: string;
  capturedAtIso: string;
  verificationStatus: "unverified" | "verified";
}

interface JwtLikePayload {
  name?: string;
  email?: string;
  sub?: string;
  batch?: string;
  academicYear?: string;
}

function initialsForName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "SP";
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

function livePhotoStorageKey(email: string): string {
  return `student-live-photo:${email.toLowerCase()}`;
}

function readLivePhoto(email: string): StudentLivePhotoRecord | null {
  try {
    const rawRecord = window.localStorage.getItem(livePhotoStorageKey(email));
    if (!rawRecord) {
      return null;
    }

    const parsed = JSON.parse(rawRecord) as Partial<StudentLivePhotoRecord>;
    if (typeof parsed.photoDataUrl !== "string" || !parsed.photoDataUrl.startsWith("data:image/")) {
      return null;
    }

    return {
      photoDataUrl: parsed.photoDataUrl,
      capturedAtIso: typeof parsed.capturedAtIso === "string" ? parsed.capturedAtIso : new Date().toISOString(),
      verificationStatus: parsed.verificationStatus === "verified" ? "verified" : "unverified",
    };
  } catch {
    return null;
  }
}

function writeLivePhoto(email: string, record: StudentLivePhotoRecord): void {
  try {
    window.localStorage.setItem(livePhotoStorageKey(email), JSON.stringify(record));
  } catch {
    // Local preview persistence can fail in private browsing or storage-restricted contexts.
  }
}

function StudentProfileSettingsPage() {
  const { session, signOut } = useAuthProvider();
  const debugMode = isStudentDebugMode();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [livePhoto, setLivePhoto] = useState<StudentLivePhotoRecord | null>(null);

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

  const profileInitials = useMemo(() => initialsForName(profile.name), [profile.name]);
  const livePhotoStatus = livePhoto?.verificationStatus === "verified" ? "verified" : "unverified";

  useEffect(() => {
    setLivePhoto(readLivePhoto(profile.email));
  }, [profile.email]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.srcObject = cameraStream;
    }

    return () => {
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

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

  async function startLiveCamera() {
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("Camera capture is not available in this browser.");
      return;
    }

    setIsCameraStarting(true);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      });
      setCameraStream((currentStream) => {
        currentStream?.getTracks().forEach((track) => track.stop());
        return nextStream;
      });
      setNotice("Camera ready. Capture your live identity photo when your face is centered.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Camera permission was denied.";
      setNotice(reason);
    } finally {
      setIsCameraStarting(false);
    }
  }

  function captureLivePhoto() {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!videoElement || !canvasElement || !cameraStream) {
      setNotice("Start the camera before capturing your live photo.");
      return;
    }

    const width = videoElement.videoWidth || 960;
    const height = videoElement.videoHeight || 720;
    canvasElement.width = width;
    canvasElement.height = height;

    const context = canvasElement.getContext("2d");
    if (!context) {
      setNotice("Unable to prepare the live photo capture canvas.");
      return;
    }

    context.drawImage(videoElement, 0, 0, width, height);
    const nextRecord: StudentLivePhotoRecord = {
      photoDataUrl: canvasElement.toDataURL("image/jpeg", 0.88),
      capturedAtIso: new Date().toISOString(),
      verificationStatus: "unverified",
    };
    writeLivePhoto(profile.email, nextRecord);
    setLivePhoto(nextRecord);
    setNotice("Live photo captured. It will show as unverified until an admin verifies it.");
  }

  function stopLiveCamera() {
    setCameraStream((currentStream) => {
      currentStream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }

  return (
    <section className="student-content-card student-profile-page" aria-labelledby="student-profile-title">
      {debugMode ? <p className="student-content-eyebrow">Build 128</p> : null}
      <div className="student-profile-hero">
        <div className="student-profile-avatar" aria-hidden="true">
          {profileInitials}
        </div>
        <div className="student-profile-title-block">
          <h2 id="student-profile-title">Profile</h2>
          <p>{profile.name}</p>
        </div>
        <span className={`student-live-photo-status student-live-photo-status-${livePhotoStatus}`}>
          {livePhotoStatus === "verified" ? "Live photo verified" : "Live photo unverified"}
        </span>
      </div>

      <div className="student-profile-panel">
        <section className="student-profile-section" aria-labelledby="student-profile-account-info">
          <div className="student-section-heading">
            <h3 id="student-profile-account-info">Student Details</h3>
          </div>
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
        </section>

        <section className="student-profile-section" aria-labelledby="student-profile-live-photo">
          <div className="student-section-heading">
            <h3 id="student-profile-live-photo">Live Identity Photo</h3>
            <p>Used for exam identity checks when verification guard is enabled.</p>
          </div>
          <div className="student-live-photo-panel">
            <div className="student-live-photo-identity-card">
              <div className="student-live-photo-preview">
                {livePhoto ? (
                  <img src={livePhoto.photoDataUrl} alt="Student live identity capture" />
                ) : (
                  <span>No photo</span>
                )}
              </div>
              <div className="student-live-photo-summary">
                <span className={`student-live-photo-status student-live-photo-status-${livePhotoStatus}`}>
                  {livePhotoStatus === "verified" ? "Verified" : "Unverified"}
                </span>
                <small>
                  {livePhoto ? new Date(livePhoto.capturedAtIso).toLocaleString() : "Capture pending"}
                </small>
              </div>
            </div>
            <div className="student-live-photo-details">
              <div className="student-live-photo-camera">
                {cameraStream ? (
                  <video ref={videoRef} autoPlay muted playsInline />
                ) : (
                  <div className="student-live-photo-camera-placeholder">
                    <strong>Camera off</strong>
                    <span>Open camera to update your live photo.</span>
                  </div>
                )}
                <canvas ref={canvasRef} aria-hidden="true" />
              </div>
              <div className="student-profile-actions">
                <button type="button" onClick={startLiveCamera} disabled={isCameraStarting}>
                  {isCameraStarting ? "Starting Camera..." : cameraStream ? "Restart Camera" : "Open Camera"}
                </button>
                <button type="button" onClick={captureLivePhoto} disabled={!cameraStream}>
                  Capture Live Photo
                </button>
                {cameraStream ? (
                  <button type="button" onClick={stopLiveCamera}>
                    Stop Camera
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="student-profile-section" aria-labelledby="student-profile-password">
          <div className="student-section-heading">
            <h3 id="student-profile-password">Account Access</h3>
            <p>Password reset and sign-out controls.</p>
          </div>
          <div className="student-profile-access-grid">
            <form className="student-profile-access-card" onSubmit={handlePasswordReset}>
              <div>
                <strong>Password</strong>
                <span>{profile.email}</span>
              </div>
              <button type="submit" disabled={isSendingReset || session.status !== "authenticated"}>
                {isSendingReset ? "Sending..." : "Reset Password"}
              </button>
            </form>
            <div className="student-profile-access-card">
              <div>
                <strong>Current Session</strong>
                <span>{session.status === "authenticated" ? "Signed in" : "Not authenticated"}</span>
              </div>
              <button
                type="button"
                className="student-profile-logout-button"
                disabled={session.status !== "authenticated"}
                onClick={() => {
                  void signOut();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </section>
      </div>

      {notice ? <p className="student-profile-notice">{notice}</p> : null}
    </section>
  );
}

export default StudentProfileSettingsPage;
