import type { VendorIntelligenceMoney } from "../../../../../shared/contracts/vendorIntelligence";

export function formatIntelligenceNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unavailable" : value.toLocaleString("en-IN");
}
export function formatIntelligenceMoney(value: VendorIntelligenceMoney | null | undefined): string {
  if (!value) return "Unavailable";
  const formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: value.currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(value.amountMinor / 10 ** digits);
}
