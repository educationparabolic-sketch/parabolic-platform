import { useEffect, useState } from "react";
import type { VendorIntelligenceQuery } from "../../../../../shared/contracts/vendorIntelligence";
import { classifyIntelligenceFailure, vendorIntelligenceApi, type IntelligenceFailure } from "./vendorIntelligenceApi";
import { assertIntelligenceSelection } from "./vendorIntelligenceResponse";

export interface IntelligenceSnapshot {
  readiness: Awaited<ReturnType<typeof vendorIntelligenceApi.readiness>>;
  revenue: Awaited<ReturnType<typeof vendorIntelligenceApi.revenue>>;
  layers: Awaited<ReturnType<typeof vendorIntelligenceApi.layers>>;
  churn: Awaited<ReturnType<typeof vendorIntelligenceApi.churn>>;
  forecast: Awaited<ReturnType<typeof vendorIntelligenceApi.forecast>>;
}
type State = { key: string; data: IntelligenceSnapshot | null; failure: IntelligenceFailure | null; loading: boolean };

export function useVendorIntelligence(query: VendorIntelligenceQuery = {}, enabled = true) {
  const { asOfMonth, windowMonths = 6 } = query;
  const [attempt, setAttempt] = useState(0);
  const key = `${asOfMonth ?? "latest"}|${windowMonths}|${attempt}|${enabled}`;
  const [state, setState] = useState<State>({ key: "", data: null, failure: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) return () => controller.abort();
    const selected: VendorIntelligenceQuery = { ...(asOfMonth ? { asOfMonth } : {}), windowMonths };
    const run = async () => {
      // Promise boundary keeps state transitions out of the synchronous effect.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key, data: null, failure: null, loading: true });
      try {
        const [readiness, revenue, layers, churn, forecast] = await Promise.all([
          vendorIntelligenceApi.readiness(selected, controller.signal),
          vendorIntelligenceApi.revenue(selected, controller.signal),
          vendorIntelligenceApi.layers(selected, controller.signal),
          vendorIntelligenceApi.churn(selected, controller.signal),
          vendorIntelligenceApi.forecast(selected, controller.signal),
        ]);
        const data = { readiness, revenue, layers, churn, forecast };
        assertIntelligenceSelection(Object.values(data), selected);
        if (!controller.signal.aborted) setState({ key, data, failure: null, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, data: null, failure: classifyIntelligenceFailure(error), loading: false });
      }
    };
    void run();
    return () => controller.abort();
  }, [asOfMonth, windowMonths, key, enabled]);
  const visible = state.key === key ? state : { key, data: null, failure: null, loading: enabled };
  return { ...visible, retry: () => setAttempt((value) => value + 1) };
}
