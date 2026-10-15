import { useCallback, useEffect, useMemo, useRef } from "react";

// Each selection replaces only its owning read. Unmount (including token/route changes) invalidates every completion.
export function useVendorReadScope() {
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  useEffect(() => {
    const owned = controllers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      owned.forEach(controller => controller.abort());
      owned.clear();
    };
  }, []);
  const begin = useCallback((scope: string) => {
      controllers.current.get(scope)?.abort();
      const controller = new AbortController();
      if (!mounted.current) controller.abort();
      controllers.current.set(scope, controller);
      return { signal: controller.signal, current: () => !controller.signal.aborted };
  }, []);
  return useMemo(() => ({ begin }), [begin]);
}
