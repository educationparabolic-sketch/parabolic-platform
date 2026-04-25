import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuthProvider } from "./authProvider";
import { getFrontendEnvironment } from "./frontendEnvironment";
import type { AuthSession } from "../types/authProvider";
import type {
  BackendLicensedCapability,
  GlobalPortalState,
  GlobalRolloutFeatureFlags,
  LicenseEligibilityFlags,
  LicenseFeatureFlags,
  LicenseObjectModel,
} from "../types/globalPortalState";
import type { LicenseLayer, PortalRole } from "../types/portalRouting";
import type { PortalKey } from "./portalManifest";

const GlobalPortalStateContext = createContext<GlobalPortalState | null>(null);

const EMPTY_ELIGIBILITY_FLAGS: LicenseEligibilityFlags = {
  l1Eligible: false,
  l2Eligible: false,
  l3Eligible: false,
};

const EMPTY_LICENSE_FEATURE_FLAGS: LicenseFeatureFlags = {
  riskOverview: false,
  controlledMode: false,
  adaptivePhase: false,
  governanceAccess: false,
  hardMode: false,
};

const EMPTY_GLOBAL_FEATURE_FLAGS: GlobalRolloutFeatureFlags = {
  enableBetaFeatures: false,
  enableExperimentalRiskEngine: false,
  enableNewUi: false,
  rolloutPercentage: 0,
};

function normalizePortalRole(value: unknown): PortalRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "student" ||
    normalized === "teacher" ||
    normalized === "admin" ||
    normalized === "director" ||
    normalized === "vendor"
  ) {
    return normalized;
  }

  return null;
}

function normalizeLicenseLayer(value: unknown): LicenseLayer | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "L0" || normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return null;
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function resolveLicenseFeatureFlags(claims: Record<string, unknown> | null): LicenseFeatureFlags {
  const directFlags = readRecord(claims?.featureFlags);
  const nestedLicenseFlags = readRecord(readRecord(claims?.license)?.featureFlags);
  const source = directFlags ?? nestedLicenseFlags;

  if (!source) {
    return EMPTY_LICENSE_FEATURE_FLAGS;
  }

  return {
    riskOverview: readBoolean(source.riskOverview),
    controlledMode: readBoolean(source.controlledMode),
    adaptivePhase: readBoolean(source.adaptivePhase),
    governanceAccess: readBoolean(source.governanceAccess),
    hardMode: readBoolean(source.hardMode),
  };
}

function resolveLicenseEligibilityFlags(claims: Record<string, unknown> | null): LicenseEligibilityFlags {
  const directFlags = readRecord(claims?.eligibilityFlags);
  const nestedLicenseFlags = readRecord(readRecord(claims?.license)?.eligibilityFlags);
  const source = directFlags ?? nestedLicenseFlags;

  if (!source) {
    return EMPTY_ELIGIBILITY_FLAGS;
  }

  return {
    l1Eligible: readBoolean(source.l1Eligible),
    l2Eligible: readBoolean(source.l2Eligible),
    l3Eligible: readBoolean(source.l3Eligible),
  };
}

function resolveLicenseObjectModel(claims: Record<string, unknown> | null): LicenseObjectModel {
  const licenseClaims = readRecord(claims?.license);
  const featureFlags = resolveLicenseFeatureFlags(claims);
  const eligibilityFlags = resolveLicenseEligibilityFlags(claims);

  return {
    currentLayer:
      normalizeLicenseLayer(claims?.licenseLayer) ??
      normalizeLicenseLayer(licenseClaims?.currentLayer) ??
      null,
    planName: readString(licenseClaims?.planName ?? claims?.planName),
    billingCycle: readString(licenseClaims?.billingCycle ?? claims?.billingCycle),
    startDate: readString(licenseClaims?.startDate ?? claims?.startDate),
    expiryDate: readString(licenseClaims?.expiryDate ?? claims?.expiryDate),
    maxStudents: readNumber(licenseClaims?.maxStudents ?? claims?.maxStudents),
    maxConcurrent: readNumber(licenseClaims?.maxConcurrent ?? claims?.maxConcurrent),
    eligibilityFlags,
    featureFlags,
    status: readString(licenseClaims?.status ?? claims?.licenseStatus),
  };
}

function toRolloutPercentage(source: Record<string, unknown> | null): number {
  if (!source) {
    return 0;
  }

  const raw = source.setRolloutPercentage;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(raw)));
}

function resolveGlobalFeatureFlags(claims: Record<string, unknown> | null): GlobalRolloutFeatureFlags {
  const directFlags = readRecord(claims?.globalFeatureFlags);
  const nestedFlags = readRecord(readRecord(claims?.license)?.globalFeatureFlags);
  const source = directFlags ?? nestedFlags;

  if (!source) {
    return EMPTY_GLOBAL_FEATURE_FLAGS;
  }

  return {
    enableBetaFeatures: readBoolean(source.enableBetaFeatures),
    enableExperimentalRiskEngine: readBoolean(source.enableExperimentalRiskEngine),
    enableNewUi: readBoolean(source.enableNewUi),
    rolloutPercentage: toRolloutPercentage(source),
  };
}

function isCapabilityLicensed(capability: BackendLicensedCapability, flags: LicenseFeatureFlags): boolean {
  switch (capability) {
    case "ControlledMode":
      return flags.controlledMode;
    case "GovernanceDashboard":
      return flags.governanceAccess;
    case "HardMode":
      return flags.hardMode;
    case "AdaptivePhase":
      return flags.adaptivePhase;
    default:
      return false;
  }
}

export function resolveGlobalPortalState(input: {
  portal: PortalKey;
  session: AuthSession;
}): GlobalPortalState {
  const { portal, session } = input;
  const claims = decodeIdTokenClaims(session.idToken);
  const role = normalizePortalRole(claims?.role ?? claims?.userRole);
  const license = resolveLicenseObjectModel(claims);
  const globalFeatureFlags = resolveGlobalFeatureFlags(claims);
  const licenseLayer = license.currentLayer;

  return {
    portal,
    authStatus: session.status,
    isAuthenticated: session.status === "authenticated",
    role,
    licenseLayer,
    license,
    globalFeatureFlags,
    permissions: {
      canAccessAdminPortal: role === "teacher" || role === "admin" || role === "director",
      canAccessStudentPortal: role === "student",
      canAccessVendorPortal: role === "vendor",
      canAccessExamPortal: role === "student",
      canUseControlledMode: isCapabilityLicensed("ControlledMode", license.featureFlags),
      canAccessGovernanceDashboard: isCapabilityLicensed("GovernanceDashboard", license.featureFlags),
      canUseHardMode: isCapabilityLicensed("HardMode", license.featureFlags),
      canUseAdaptivePhase: isCapabilityLicensed("AdaptivePhase", license.featureFlags),
    },
    environment: getFrontendEnvironment(),
    idToken: session.idToken,
  };
}

interface GlobalPortalStateProviderProps {
  children: ReactNode;
  portalKey: PortalKey;
}

export function GlobalPortalStateProvider(props: GlobalPortalStateProviderProps) {
  const { children, portalKey } = props;
  const { session } = useAuthProvider();

  const globalState = useMemo(() => {
    return resolveGlobalPortalState({ portal: portalKey, session });
  }, [portalKey, session]);

  return <GlobalPortalStateContext.Provider value={globalState}>{children}</GlobalPortalStateContext.Provider>;
}

export function useGlobalPortalState(): GlobalPortalState {
  const value = useContext(GlobalPortalStateContext);

  if (!value) {
    throw new Error("useGlobalPortalState must be used inside GlobalPortalStateProvider.");
  }

  return value;
}
