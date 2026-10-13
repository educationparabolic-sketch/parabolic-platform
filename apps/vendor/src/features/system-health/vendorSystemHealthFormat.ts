import type { VendorHealthUnavailableReason } from "../../../../../shared/contracts/vendorAuditHealth";

export const queueSources = [["failureRecovery", "Failure recovery"], ["emailDelivery", "Email delivery"], ["stripeReconciliation", "Stripe reconciliation"], ["calibrationOperations", "Calibration operations"]] as const;
export const unavailableLabels = [["cloudMonitoring", "Cloud monitoring"], ["errorReporting", "Error reporting"], ["costAndUsage", "Cost, bandwidth, Firestore and Functions usage"], ["latencyAndErrorMetrics", "Latency and error metrics"], ["frontendTelemetry", "Frontend telemetry"], ["deploymentHistory", "Deployment history"]] as const;
export function unavailableReason(reason: VendorHealthUnavailableReason): string {
  return {not_configured: "Runtime identity is not configured", no_durable_source: "No durable source is available",
    adapter_not_implemented: "A reviewed monitoring adapter is not available", source_limit_exceeded: "Source exceeds the 1,000-record exact-count limit",
    source_unavailable: "Source is unreadable or contains invalid authority"}[reason];
}
