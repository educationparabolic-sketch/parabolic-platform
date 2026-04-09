import type { PortalDefinition } from "../services/portalManifest";

export interface PortalMetaRow {
  label: string;
  value: string;
}

export function getPortalMetaRows(portal: PortalDefinition): PortalMetaRow[] {
  return [
    {
      label: "Domain",
      value: portal.domain,
    },
    {
      label: "Route Prefix",
      value: portal.routePrefix,
    },
  ];
}
