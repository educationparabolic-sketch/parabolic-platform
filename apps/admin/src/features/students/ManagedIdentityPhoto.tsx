import {useLayoutEffect, useRef, useState} from "react";
import type {StudentIdentityPhotoState} from "../../../../../shared/contracts/studentProfile";
import {getPortalApiClient} from "../../../../../shared/services/portalIntegration";
import {parseIdentityMedia, identityMediaUrl} from "../../../../../shared/services/studentProfileContract";

export default function ManagedIdentityPhoto({studentId, state, allowed, pending, onReview}: {
  studentId: string; state: StudentIdentityPhotoState | null; allowed: boolean; pending: boolean;
  onReview: (verified: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  const active = useRef(true);
  const photoId = state?.mediaAvailable ? state.photo.photoId : null;
  useLayoutEffect(() => {
    active.current = true; setPreview(null); setLoading(false);
    return () => { active.current = false; controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); url.current = null; };
  }, []);
  async function load() {
    if (!allowed || !photoId || loading) return;
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null; setPreview(null);
    try {
      const result = await getPortalApiClient("admin").get<unknown>(
        `/admin/students/${encodeURIComponent(studentId)}/identity-photo/${encodeURIComponent(photoId)}/media`,
        {signal: request.signal, handledFailureIsReady: true, retry: {maxAttempts: 1}},
      );
      const media = parseIdentityMedia(result, photoId);
      if (!active.current || request.signal.aborted) return;
      url.current = identityMediaUrl(media); setPreview(url.current);
    } catch {
      if (active.current && !request.signal.aborted) setError("Authorized preview unavailable. Reload the roster or retry.");
    } finally { if (active.current && !request.signal.aborted) setLoading(false); }
  }
  return <div className="admin-student-live-photo-cell">
    <span>{state?.status.replaceAll("_", " ") ?? "Identity photo unavailable"}</span>
    {preview && allowed ? <img src={preview} alt="Authorized identity photo for review" width={100} /> : null}
    {state?.photo ? <small>{new Date(state.photo.capturedAt).toLocaleString()}</small> : null}
    {allowed && photoId ? <button type="button" disabled={loading || pending} onClick={() => void load()}>{loading ? "Loading preview…" : "Open authorized photo"}</button> : null}
    {error ? <span role="alert">{error}</span> : null}
    {allowed && photoId && preview ? <button type="button" disabled={pending} onClick={() => onReview(state?.status !== "verified")}>
      {pending ? "Saving review…" : state?.status === "verified" ? "Mark unverified" : "Verify photo"}
    </button> : null}
    <small>Administrative review; automated face matching unavailable.</small>
  </div>;
}
