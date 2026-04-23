import { createApiClient } from "./apiClient";
import { getFrontendEnvironment } from "./frontendEnvironment";
import { PORTAL_MANIFEST, type PortalKey } from "./portalManifest";
import type { ApiClient } from "../types/apiClient";

const portalApiClientCache = new Map<PortalKey, ApiClient>();

function resolvePortalOriginFromWindow(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.origin;
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function getPortalRoutePrefix(portal: PortalKey): string {
  return PORTAL_MANIFEST[portal].routePrefix;
}

export function getPortalLoginPath(portal: PortalKey): string {
  return PORTAL_MANIFEST[portal].loginPath;
}

export function getPortalDefaultAuthenticatedPath(portal: PortalKey): string {
  return PORTAL_MANIFEST[portal].defaultAuthenticatedPath;
}

export function getPortalBaseUrl(portal: PortalKey): string | null {
  const environment = getFrontendEnvironment();

  if (portal === "exam") {
    return environment.examBaseUrl ?? resolvePortalOriginFromWindow();
  }

  if (portal === "vendor") {
    return environment.vendorBaseUrl ?? resolvePortalOriginFromWindow();
  }

  return environment.portalBaseUrl ?? resolvePortalOriginFromWindow();
}

export function buildPortalUrl(portal: PortalKey, path: string): string {
  const baseUrl = getPortalBaseUrl(portal);
  const normalizedPath = ensureLeadingSlash(path);

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${removeTrailingSlash(baseUrl)}${normalizedPath}`;
}

export function getPortalApiClient(portal: PortalKey): ApiClient {
  const cached = portalApiClientCache.get(portal);
  if (cached) {
    return cached;
  }

  const environment = getFrontendEnvironment();
  const apiBaseUrl = environment.apiBaseUrl && environment.apiBaseUrl.trim().length > 0 ?
    environment.apiBaseUrl :
    "/";

  const client = createApiClient({
    baseUrl: apiBaseUrl,
    defaultHeaders: {
      "X-Parabolic-Portal": portal,
    },
  });

  portalApiClientCache.set(portal, client);
  return client;
}
