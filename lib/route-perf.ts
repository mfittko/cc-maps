const ROUTE_PERF_PREFIX = '[route-perf]';

export function isRoutePerfDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF === '1';
}

export function measureRoutePerf<T>(label: string, compute: () => T): T {
  if (!isRoutePerfDebugEnabled() || typeof performance === 'undefined') {
    return compute();
  }

  const startedAt = performance.now();
  const result = compute();
  const durationMs = performance.now() - startedAt;

  console.debug(`${ROUTE_PERF_PREFIX} ${label}: ${durationMs.toFixed(1)}ms`);

  return result;
}