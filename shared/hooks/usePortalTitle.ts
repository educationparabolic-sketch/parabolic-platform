import type { PortalKey } from "../services/portalManifest";
import { PORTAL_MANIFEST } from "../services/portalManifest";

export function usePortalTitle(portal: PortalKey): void {
  if (typeof document !== "undefined") {
    const portalName = PORTAL_MANIFEST[portal]?.name ?? "Parabolic Platform";
    document.title = `${portalName} | Parabolic Platform`;
  }
}
