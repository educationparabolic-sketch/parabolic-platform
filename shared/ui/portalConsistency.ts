import type { LicenseLayer } from "../types/portalRouting";

export interface PortalNavigationItem {
  path: string;
  label: string;
  summary: string;
  minimumLicenseLayer?: LicenseLayer;
}

export const ADMIN_PRIMARY_NAVIGATION: PortalNavigationItem[] = [
  {
    path: "/admin/overview",
    label: "Overview",
    summary: "Operational and executive snapshot for current institute performance.",
  },
  {
    path: "/admin/students",
    label: "Students",
    summary: "Student onboarding, lifecycle controls, and profile operations.",
  },
  {
    path: "/admin/question-bank",
    label: "Question Bank",
    summary: "Question inventory, package upload, and content governance.",
  },
  {
    path: "/admin/tests",
    label: "Tests",
    summary: "Template generation, publishing, and test structure controls.",
  },
  {
    path: "/admin/assignments",
    label: "Assignments",
    summary: "Run scheduling, assignment status monitoring, and delivery controls.",
  },
  {
    path: "/admin/analytics",
    label: "Analytics",
    summary: "Summary-only analytics dashboards for outcomes and distributions.",
  },
  {
    path: "/admin/insights",
    label: "Insights",
    summary: "Behavioral insights and intervention planning for eligible layers.",
  },
  {
    path: "/admin/governance",
    label: "Governance",
    summary: "L3 institutional governance and structural oversight workspace.",
  },
  {
    path: "/admin/licensing",
    label: "Licensing",
    summary: "License plan, feature matrix, usage, and upgrade controls.",
  },
  {
    path: "/admin/settings",
    label: "Settings",
    summary: "Institute profile, policy, security, and system configuration controls.",
  },
];

export const STUDENT_PRIMARY_NAVIGATION: PortalNavigationItem[] = [
  {
    path: "/student/dashboard",
    label: "Dashboard",
    summary: "Landing view for student progress highlights and upcoming assessments.",
  },
  {
    path: "/student/my-tests",
    label: "My Tests",
    summary: "Assigned, active, and completed test navigation for the student account.",
  },
  {
    path: "/student/performance",
    label: "Performance",
    summary: "Summary-level performance trends based on analytics collections.",
  },
  {
    path: "/student/insights",
    label: "Insights",
    summary: "Behavioral insight space for interpreted performance indicators.",
    minimumLicenseLayer: "L1",
  },
  {
    path: "/student/profile",
    label: "Profile",
    summary: "Student-managed profile and account settings workspace.",
  },
];

export const VENDOR_PRIMARY_NAVIGATION: PortalNavigationItem[] = [
  {
    path: "/vendor/overview",
    label: "Overview",
    summary: "Executive platform snapshot using aggregated vendor metrics.",
  },
  {
    path: "/vendor/institutes",
    label: "Institutes",
    summary: "Cross-institute management and lifecycle governance.",
  },
  {
    path: "/vendor/licensing",
    label: "Licensing",
    summary: "Vendor-authoritative subscription and layer controls.",
  },
  {
    path: "/vendor/calibration",
    label: "Calibration",
    summary: "Global calibration parameters, simulation, and rollout controls.",
  },
  {
    path: "/vendor/intelligence",
    label: "Intelligence",
    summary: "Cross-institute intelligence and macro behavioral trends.",
  },
  {
    path: "/vendor/system-health",
    label: "System Health",
    summary: "Platform runtime status, cost monitoring, and operational checks.",
  },
  {
    path: "/vendor/audit",
    label: "Audit",
    summary: "Immutable vendor activity and governance events.",
  },
];

export function findActivePortalNavigationItem(
  items: readonly PortalNavigationItem[],
  pathname: string,
): PortalNavigationItem | undefined {
  return items.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}
