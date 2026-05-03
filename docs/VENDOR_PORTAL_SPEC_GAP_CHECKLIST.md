# Vendor Portal Spec Gap Checklist

Purpose: track vendor portal implementation gaps against the reviewed vendor route and portal structure.

Detailed implementation requirements for this checklist live in the corresponding `*_portal_detailed` source file(s) and should be read before implementing any item.

Status values:
- `completed` = implemented closely enough to the reviewed spec
- `partial` = exists in route definitions or page structure, but is not fully mounted or fully wired
- `missing` = not implemented

Priority guide:
- `P0` = structural blocker or access-control gap
- `P1` = important portal-completeness gap
- `P2` = secondary depth, expansion, or operational gap

## Global

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| VEN-GLB-001 | Global | Separate vendor portal app/build | completed | P0 | `apps/vendor` exists as a dedicated frontend |
| VEN-GLB-002 | Global | Vendor login route | completed | P0 | `/vendor/login` is mounted |
| VEN-GLB-003 | Global | Protected vendor route shell | completed | P0 | Authenticated route wrapper is implemented |
| VEN-GLB-004 | Global | Vendor-only role guard | completed | P0 | Non-vendor users redirect to `/unauthorized` |
| VEN-GLB-005 | Global | Unauthorized route for denied vendor access | completed | P1 | `/unauthorized` is mounted |
| VEN-GLB-006 | Global | Vendor route registry aligned to planned route map | partial | P1 | Several planned routes exist in definitions but are not mounted in the app |

## Route Map

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| VEN-RTE-001 | Routes | `/vendor/overview` | completed | P0 | Mounted in `apps/vendor/src/App.tsx` |
| VEN-RTE-002 | Routes | `/vendor/institutes` | completed | P0 | Mounted |
| VEN-RTE-003 | Routes | `/vendor/institutes/:instituteId` | partial | P1 | Present in route definitions, not mounted in the vendor app |
| VEN-RTE-004 | Routes | `/vendor/licensing` | completed | P0 | Mounted |
| VEN-RTE-005 | Routes | `/vendor/calibration` | completed | P0 | Mounted |
| VEN-RTE-006 | Routes | `/vendor/calibration/simulate` | partial | P1 | Present in route definitions, not mounted |
| VEN-RTE-007 | Routes | `/vendor/calibration/history` | partial | P1 | Present in route definitions, not mounted |
| VEN-RTE-008 | Routes | `/vendor/intelligence` | completed | P0 | Mounted |
| VEN-RTE-009 | Routes | `/vendor/revenue` | partial | P1 | Present in route definitions, but no mounted route/page in `App.tsx` |
| VEN-RTE-010 | Routes | `/vendor/system-health` | completed | P0 | Mounted |
| VEN-RTE-011 | Routes | `/vendor/audit` | completed | P0 | Mounted |
| VEN-RTE-012 | Routes | `/vendor/feature-flags` | missing | P1 | No route definition or mounted page found |
| VEN-RTE-013 | Routes | `/vendor/data-export` | missing | P1 | No route definition or mounted page found |
| VEN-RTE-014 | Routes | `/vendor/backups` | missing | P2 | No route definition or mounted page found |

## Suggested Fix Order

1. `P0`
   - VEN-GLB-001 through VEN-GLB-004
   - VEN-RTE-001
   - VEN-RTE-002
   - VEN-RTE-004
   - VEN-RTE-005
   - VEN-RTE-008
   - VEN-RTE-010
   - VEN-RTE-011
2. `P1`
   - VEN-GLB-006
   - VEN-RTE-003
   - VEN-RTE-006
   - VEN-RTE-007
   - VEN-RTE-009
   - VEN-RTE-012
   - VEN-RTE-013
3. `P2`
   - VEN-RTE-014
