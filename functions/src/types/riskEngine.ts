export interface RiskEngineContext {
  eventId?: string;
  instituteId: string;
  studentId: string;
  yearId: string;
}

export const DEFAULT_RISK_MODEL_VERSION = "risk_v1";

export type StudentRiskState =
  "Stable" |
  "Drift-Prone" |
  "Impulsive" |
  "Overextended" |
  "Volatile";

export interface RiskEngineResult {
  idempotent: boolean;
  reason?:
    "already_processed" |
    "deleted" |
    "missing_upstream_marker";
  studentYearMetricsPath: string;
  triggered: boolean;
}
