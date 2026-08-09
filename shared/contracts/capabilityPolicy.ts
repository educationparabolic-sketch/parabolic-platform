import type { LicenseFeatureFlags } from "../types/globalPortalState";
import type { LicenseLayer, PortalRole } from "../types/portalRouting";

export const LICENSE_FEATURE_FLAG_NAMES = [
  "riskOverview",
  "controlledMode",
  "adaptivePhase",
  "governanceAccess",
  "hardMode",
] as const satisfies readonly (keyof LicenseFeatureFlags)[];

export type LicenseFeatureFlagName = (typeof LICENSE_FEATURE_FLAG_NAMES)[number];

export interface CapabilityPolicyDefinition {
  allowedRoles: readonly PortalRole[];
  minimumLicenseLayer: LicenseLayer | null;
  requiredFeatureFlags: readonly LicenseFeatureFlagName[];
  roleMinimumLicenseLayers?: Readonly<Partial<Record<PortalRole, LicenseLayer>>>;
}

export const CAPABILITY_MATRIX = {
  "portal.admin.access": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "portal.student.access": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "portal.exam.access": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "portal.vendor.access": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "admin.overview.read": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.students.read": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.students.manage": {
    allowedRoles: ["admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.question_bank.read": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.question_bank.manage": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.tests.read": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.tests.manage": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.assignments.read": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.assignments.manage": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.analytics.read": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.analytics.advanced": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.insights.read": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L1",
    requiredFeatureFlags: ["riskOverview"],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.interventions.manage": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L1",
    requiredFeatureFlags: ["riskOverview"],
  },
  "admin.governance.read": {
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    requiredFeatureFlags: ["governanceAccess"],
  },
  "admin.governance.export": {
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    requiredFeatureFlags: ["governanceAccess"],
  },
  "admin.settings.read": {
    allowedRoles: ["admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.settings.manage": {
    allowedRoles: ["admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.license.read": {
    allowedRoles: ["admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.license.upgrade_request": {
    allowedRoles: ["admin"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "admin.support.manage": {
    allowedRoles: ["teacher", "admin", "director"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
    roleMinimumLicenseLayers: { director: "L3" },
  },
  "admin.mode.controlled.configure": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["controlledMode"],
  },
  "admin.mode.adaptive.configure": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["adaptivePhase"],
  },
  "admin.mode.hard.configure": {
    allowedRoles: ["teacher", "admin"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["hardMode"],
  },
  "student.dashboard.read": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "student.assignments.read": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "student.analytics.read": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "student.analytics.advanced": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: [],
  },
  "student.insights.read": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L1",
    requiredFeatureFlags: ["riskOverview"],
  },
  "student.discipline.read": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: [],
  },
  "student.profile.manage_own": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "student.solutions.read_current_year": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "exam.session.start": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "exam.session.answer": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "exam.session.submit": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L0",
    requiredFeatureFlags: [],
  },
  "exam.mode.controlled.execute": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["controlledMode"],
  },
  "exam.mode.adaptive.execute": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["adaptivePhase"],
  },
  "exam.mode.hard.execute": {
    allowedRoles: ["student"],
    minimumLicenseLayer: "L2",
    requiredFeatureFlags: ["hardMode"],
  },
  "vendor.overview.read": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.institutes.read": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.institutes.manage_lifecycle": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.licenses.manage": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.calibration.manage": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.intelligence.read": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.system_health.read": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
  "vendor.audit.read": {
    allowedRoles: ["vendor"],
    minimumLicenseLayer: null,
    requiredFeatureFlags: [],
  },
} as const satisfies Record<string, CapabilityPolicyDefinition>;

export type PortalCapability = keyof typeof CAPABILITY_MATRIX;
