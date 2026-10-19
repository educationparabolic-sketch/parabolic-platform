/** No Firebase, monitoring, router or UI imports may enter this module. */
export interface LaunchMetadata {
  status: "launch" | "none" | "invalid";
  sessionId: string | null;
  devMock: boolean;
}

export function captureLaunch(href: string, replace: (path: string) => void, allowDevMock = false) {
  const url = new URL(href);
  const match = /^\/session\/([A-Za-z0-9_-]{1,200})$/u.exec(url.pathname);
  const sessionId = match?.[1] ?? null;
  let credential: string | null = null;
  const metadata: LaunchMetadata = {status: "none", sessionId, devMock: false};
  try {
    const query = url.searchParams;
    if (allowDevMock && sessionId && query.getAll("token").length === 1 &&
        query.get("token") === "dev" && !url.hash &&
        [...query.keys()].every((key) => ["token", "mode", "faceGaze"].includes(key))) {
      metadata.status = "launch";
      metadata.devMock = true;
    } else if (url.search || url.hash) {
      const fragment = /^#launch=([^&]+)$/u.exec(url.hash);
      if (!sessionId || url.search || !fragment) throw new Error("Invalid launch.");
      credential = decodeURIComponent(fragment[1]);
      if (!credential || credential.length > 8192 || /\s/u.test(credential)) throw new Error("Invalid launch.");
      metadata.status = "launch";
    }
  } catch {
    credential = null;
    metadata.status = "invalid";
  }
  // Scrub rejected material too, including unknown paths and history state.
  const devQuery = new URLSearchParams();
  if (metadata.devMock) {
    for (const key of ["mode", "faceGaze"]) {
      const value = url.searchParams.get(key);
      if (value !== null) devQuery.set(key, value);
    }
  }
  replace(`${sessionId ? url.pathname : "/"}${devQuery.size ? `?${devQuery}` : ""}`);
  return {
    metadata: Object.freeze(metadata),
    takeCredential(): string | null {
      const value = credential;
      credential = null;
      return value;
    },
  };
}

let launch: ReturnType<typeof captureLaunch> | undefined;

export function initializeLaunchBootstrap(allowDevMock: boolean): void {
  if (launch) return;
  launch = captureLaunch(window.location.href, (path) => {
    window.history.replaceState(null, "", path);
  }, allowDevMock);
  // A pasted fragment can also cause same-document navigation. Scrub it without
  // exchanging it or replacing the current document's ownership authority.
  const scrubNavigation = () => {
    if (window.location.hash || (!allowDevMock && window.location.search) ||
        /[?&](?:token|launch|launchCredential)=/iu.test(window.location.search)) {
      captureLaunch(window.location.href, (path) => window.history.replaceState(null, "", path));
    }
  };
  window.addEventListener("hashchange", scrubNavigation);
  window.addEventListener("popstate", scrubNavigation);
}

export function getLaunchMetadata(): LaunchMetadata {
  return launch?.metadata ?? {status: "invalid", sessionId: null, devMock: false};
}

export function takeLaunchCredential(): string | null {
  return launch?.takeCredential() ?? null;
}
