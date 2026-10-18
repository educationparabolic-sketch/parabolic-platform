import {useLayoutEffect, useRef, useState, type FormEvent} from "react";
import {sendPasswordResetEmail} from "firebase/auth";
import {useAuthProvider} from "../../../../../shared/services/authProvider";
import {getFirebaseAuth} from "../../../../../shared/services/firebaseClient";
import {identityMediaUrl} from "../../../../../shared/services/studentProfileContract";
import {studentProfileApi} from "../../services/studentProfileApi";
import {useStudentProfile} from "../../services/studentProfileContext";

export default function StudentProfileSettingsPage() {
  const {session, signOut} = useAuthProvider();
  const state = useStudentProfile();
  const {profile, busy, pending, restricted} = state;
  const [consent, setConsent] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<{photoId: string; url: string} | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(Symbol());
  const photoId = profile?.identityPhoto.mediaAvailable ? profile.identityPhoto.photo.photoId : null;
  const canCapture = Boolean(profile && !busy && !pending && !restricted);
  function stopCamera() {
    generation.current = Symbol();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraReady(false); setCameraStarting(false);
  }
  useLayoutEffect(() => {
    return () => {
      stopCamera(); setDraft(null); setConsent(false);
    };
  }, []);
  useLayoutEffect(() => {
    if (!canCapture || !consent) {
      stopCamera(); setDraft(null);
    }
  }, [canCapture, consent]);
  useLayoutEffect(() => {
    setPreview(null); setMediaError(null);
    if (!photoId) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void studentProfileApi.media(photoId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      objectUrl = identityMediaUrl(result);
      setPreview({photoId, url: objectUrl}); setMediaError(null);
    }).catch(() => {
      if (!controller.signal.aborted) { setPreview(null); setMediaError("The current photo cannot be displayed. Reload current status to retry."); }
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoId]);
  async function startCamera() {
    if (!canCapture || !consent) return;
    stopCamera(); const stamp = generation.current;
    setDraft(null); setCameraStarting(true); setNotice(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const next = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: "user", width: {ideal: 960}, height: {ideal: 720}}});
      if (generation.current !== stamp) { next.getTracks().forEach((track) => track.stop()); return; }
      stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      if (generation.current === stamp) { setCameraReady(true); setCameraStarting(false); }
    } catch {
      if (generation.current === stamp) { stopCamera(); setNotice("Camera unavailable or permission denied. Check browser and site permissions, then retry. No photo has been enrolled by opening the camera."); }
    }
  }
  function capture() {
    const source = video.current;
    if (!source || !stream.current || !source.videoWidth || !source.videoHeight || !profile) return;
    const scale = Math.min(1, 1280 / source.videoWidth, 1280 / source.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(source.videoWidth * scale); canvas.height = Math.floor(source.videoHeight * scale);
    if (Math.min(canvas.width, canvas.height) < profile.photoPolicy.minimumImageDimension) { setNotice("The camera image is too small. Try another camera."); return; }
    const context = canvas.getContext("2d");
    if (!context) { setNotice("Unable to capture an image."); return; }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
    canvas.width = 0; canvas.height = 0; stopCamera();
    if (!base64 || base64.length > profile.photoPolicy.maxEncodedCharacters) { setNotice("The captured image is too large. Try again."); return; }
    setDraft(base64); setNotice("Captured in memory only. Enroll the photo to request administrative review.");
  }
  async function passwordReset(event: FormEvent) {
    event.preventDefault();
    if (!profile || resetting) return;
    setResetting(true);
    try { await sendPasswordResetEmail(getFirebaseAuth(), profile.email); setNotice("Password reset email requested."); }
    catch { setNotice("Password reset could not be requested. Retry later."); }
    finally { setResetting(false); }
  }
  const status = profile?.identityPhoto.status;
  return <section className="student-content-card student-profile-page" aria-labelledby="student-profile-title">
    <h2 id="student-profile-title">Profile</h2>
    <div role="status" aria-live="polite">
      {state.loading ? <p>Loading your profile…</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.notice ? <p>{state.notice}</p> : null}
      {notice ? <p>{notice}</p> : null}
    </div>
    <button type="button" onClick={() => void state.reload()} disabled={busy || restricted}>Reload current status</button>
    {pending ? <button type="button" disabled={busy || (restricted && pending !== "withdraw")} onClick={() => void state.retry()}>
      {busy ? "Submitting…" : `Retry original ${pending} request`}
    </button> : null}
    {profile ? <>
      <section className="student-profile-section" aria-labelledby="student-profile-account-info">
        <h3 id="student-profile-account-info">Student Details</h3>
        <dl className="student-profile-grid">
          <div><dt>Name</dt><dd>{profile.fullName}</dd></div>
          <div><dt>Email</dt><dd>{profile.email}</dd></div>
          <div><dt>Batch</dt><dd>{profile.batch?.name ?? "No batch assigned"}</dd></div>
          <div><dt>Academic year</dt><dd>{profile.academicYear?.name ?? "No operational academic year"}</dd></div>
        </dl>
      </section>
      <section className="student-profile-section" aria-labelledby="student-profile-photo">
        <h3 id="student-profile-photo">Identity photo</h3>
        <p>Current server status: <strong>{status?.replaceAll("_", " ")}</strong></p>
        <p>An Admin reviews this enrollment. Automated face matching and liveness verification are unavailable.</p>
        {photoId && preview?.photoId === photoId ? <img src={preview.url} alt="Current enrolled identity photo" width={160} /> : <p>No authorized preview loaded.</p>}
        {photoId && mediaError ? <p role="alert">{mediaError}</p> : null}
        {profile.identityPhoto.photo ? <p>Captured {new Date(profile.identityPhoto.photo.capturedAt).toLocaleString()}. Retention ends {new Date(profile.identityPhoto.photo.expiresAt).toLocaleString()}.</p> : null}
        <p>With consent, your institute retains this photo for {profile.photoPolicy.retentionDays} days for human identity-photo review. Only you and authorized institute Admins can request media. Replacement resets review and revokes the old image. Withdrawal revokes access immediately; physical deletion may remain pending and targets {profile.photoPolicy.deletionTargetHours} hours. Operational audit records remain.</p>
        <label><input type="checkbox" checked={consent} disabled={busy || Boolean(pending)} onChange={(event) => { setConsent(event.target.checked); setDraft(null); }} />
          I consent to identity-photo enrollment under policy {profile.photoPolicy.policyVersion}.
        </label>
        <div className="student-live-photo-camera"><video ref={video} autoPlay muted playsInline aria-label="Identity camera preview" /></div>
        <div className="student-profile-actions">
          <button type="button" disabled={!canCapture || !consent || cameraStarting} onClick={() => void startCamera()}>{cameraStarting ? "Starting camera…" : "Open camera"}</button>
          <button type="button" disabled={!cameraReady || !canCapture} onClick={capture}>Capture photo</button>
          <button type="button" onClick={stopCamera} disabled={!cameraReady && !cameraStarting}>Stop camera</button>
          <button type="button" disabled={!draft || !consent || !canCapture} onClick={() => {
            if (!draft) return; const bytes = draft; setDraft(null); setConsent(false); stopCamera(); void state.enroll(bytes);
          }}>{profile.identityPhoto.photo ? "Enroll replacement" : "Enroll photo"}</button>
        </div>
        {draft ? <p>One captured image is ready in memory. It is not enrolled or verified.</p> : null}
      </section>
      <form onSubmit={passwordReset}><h3>Account access</h3><button type="submit" disabled={resetting || busy}>Reset password</button></form>
    </> : !state.loading ? <p>Profile and media are unavailable. No identity status can be inferred from this browser. Contact your institute Admin if you cannot retrieve the version needed to withdraw an existing enrollment.</p> : null}
    <section className="student-profile-section" aria-labelledby="student-photo-privacy">
      <h3 id="student-photo-privacy">Photo privacy</h3>
      <button type="button" disabled={!state.privacyAvailable || busy || Boolean(pending)} onClick={() => { stopCamera(); setDraft(null); setConsent(false); void state.withdraw(); }}>Withdraw consent and request deletion</button>
      <button type="button" disabled={busy || !state.canCheckDeletion} onClick={() => void state.checkDeletion()}>Check deletion status</button>
      {state.lifecycle ? <p role="status">Last withdrawn photo physical deletion: {state.lifecycle.state.replaceAll("_", " ")}{state.lifecycle.state === "deleted" ? ` at ${state.lifecycle.deletedAt}` : ". Not yet confirmed complete."}</p> : null}
    </section>
    <button type="button" onClick={() => { stopCamera(); setDraft(null); void signOut(); }} disabled={session.status !== "authenticated"}>Sign out</button>
  </section>;
}
