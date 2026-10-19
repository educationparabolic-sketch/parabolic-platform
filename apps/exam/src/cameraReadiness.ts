/** Local readiness only. No frames, identity decisions, storage or uploads. */
export const CAMERA_NOTICE =
  "Use this camera for a local readiness preview during this exam. No camera images or audio are uploaded or recorded. This does not verify your identity or track your gaze. You may stop the camera at any time; readiness must pass again to continue.";
export type CameraState = "pending" | "requesting" | "passed" | "failed";
export class CameraReadiness {
  private serial = 0;
  private stream: MediaStream | null = null;
  private preview: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ready = false;
  private consent = false;
  private current: () => boolean;
  private changed: (state: CameraState, stream: MediaStream | null) => void;
  private observe: (type: "CAMERA_READY" | "CAMERA_DENIED" | "CAMERA_LOST") => void;
  constructor(
    current: () => boolean,
    changed: CameraReadiness["changed"],
    observe: CameraReadiness["observe"],
  ) {
    this.current = current;
    this.changed = changed;
    this.observe = observe;
  }
  isReady = () => this.ready && this.consent && this.current() && this.usable();
  private usable() {
    const tracks = this.stream?.getVideoTracks() ?? [];
    return (
      tracks.length > 0 &&
      tracks.every((t) => t.readyState === "live" && t.enabled && !t.muted) &&
      !!this.preview &&
      this.preview.readyState >= 2 &&
      this.preview.videoWidth > 0 &&
      this.preview.videoHeight > 0
    );
  }
  stop = (notify = true) => {
    ++this.serial;
    this.ready = false;
    this.consent = false;
    clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.preview) {
      this.preview.pause();
      this.preview.srcObject = null;
      this.preview = null;
    }
    if (notify) this.changed("pending", null);
  };
  private lost = () => {
    if (!this.ready) return;
    this.stop();
    this.changed("failed", null);
    this.observe("CAMERA_LOST");
  };
  /** Called only by the disclosed positive consent action. */
  start = async () => {
    this.stop();
    if (!this.current()) return;
    const ticket = this.serial;
    this.consent = true;
    this.changed("requesting", null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (ticket !== this.serial || !this.current()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.preview = video;
      const lost = () => {
        if (ticket === this.serial && this.stream === stream) this.lost();
      };
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener("ended", lost);
        t.addEventListener("mute", lost);
      });
      // play() may remain pending while permission/navigation changes. Polling is fenced too.
      void video.play().catch(() => undefined);
      const started = Date.now();
      this.timer = setInterval(() => {
        if (ticket !== this.serial) return;
        if (!this.current()) {
          this.stop();
          return;
        }
        if (this.ready) {
          if (!this.usable()) this.lost();
          return;
        }
        if (this.usable()) {
          this.ready = true;
          this.changed("passed", stream);
          this.observe("CAMERA_READY");
        } else if (
          Date.now() - started >= 10000 ||
          stream.getVideoTracks().some((t) => t.readyState === "ended")
        ) {
          this.stop();
          this.changed("failed", null);
          this.observe("CAMERA_DENIED");
        }
      }, 100);
    } catch {
      if (ticket !== this.serial || !this.current()) return;
      this.stop();
      this.changed("failed", null);
      this.observe("CAMERA_DENIED");
    }
  };
}
