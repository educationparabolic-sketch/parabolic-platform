// Audit already keys/aborts authoritative reads by the full cursor/filter/session
// query. Keep its bounded in-memory Previous trail across cursor navigation only.
export function vendorWorkspaceSearchScope(pathname: string, search: string): string {
  if (pathname !== "/vendor/audit" && pathname !== "/vendor/audit/") return search;
  const filters = new URLSearchParams(search);
  filters.delete("cursor");
  return filters.toString();
}
