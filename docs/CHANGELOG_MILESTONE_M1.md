# Changelog Milestone M1

## Summary
Aligned the admin route registry with the mounted router by making registry-only admin subroutes resolve to canonical mounted pages and by adding an in-layout admin not-found fallback for unknown `/admin/*` paths.

## Changed Files
- apps/admin/src/App.tsx
- apps/admin/src/portals/adminRoutes.ts
- docs/MASTER_STATUS.md
- docs/ROUTE_API_MATRIX.md
- docs/MISSING_ITEMS_CHECKLIST.md

## APIs Changed
- No backend API contracts changed.
- Frontend routing contract changed: known admin registry paths without dedicated pages now redirect to a canonical mounted admin route instead of rendering an empty outlet.

## Tests Run
- `cd apps/admin && npm run build`
  - Status: PASS
- `cd apps/admin && npm run test`
  - Status: NOT AVAILABLE
  - Notes: `apps/admin/package.json` does not define a `test` script.
- `cd apps/admin && npm run preview -- --host 127.0.0.1 --port 4173`
  - Status: PASS
  - Notes: Used to serve the built admin app for route verification.
- `cd apps/admin && timeout 60s node --input-type=module -e '...Playwright route verification...'`
  - Status: PASS
  - Notes: Verified authenticated route outcomes for `/admin/analytics/run/demo-run -> /admin/analytics`, `/admin/students/bulk-upload -> /admin/students`, and `/admin/analytics -> /admin/analytics`.

## Elevated Permission
- Required: yes
- Granted: yes
- Commands requiring elevation:
  - `cd apps/admin && npm run preview -- --host 127.0.0.1 --port 4173`
  - `cd apps/admin && timeout 60s node --input-type=module -e '...Playwright route verification...'`
- Reason: local preview binding and browser-to-localhost verification were blocked in the sandbox.

## Residual Risks
- Redirect alignment is in place, but dedicated pages for student upload/detail, test detail/create, assignment live/create, and dynamic analytics are still not implemented.
- Admin login defaults in the UI (`admin@parabolic.local` / `demo-password`) do not match the local fallback preview credentials (`admin.test@parabolic.local` / `Parabolic#Test115`), which can confuse manual local verification.
- `apps/admin` still lacks a first-class automated `npm test` suite for router behavior.

## Next-Step Handoff
- Start `M2` with `MI-002` student ingestion backend work.
- Keep the new redirect behavior as the temporary contract until dedicated student/test/assignment/analytics pages are implemented.
- Consider adding a proper admin router test suite once the app gets a supported `test` script.
