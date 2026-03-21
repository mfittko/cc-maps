const LOAD_PERF_PREFIX = '[load-perf]';

function hasPerformanceTiming() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function';
}

export function isLoadPerfDebugEnabled() {
  return (
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF === '1' ||
    process.env.DEBUG_LOAD_PERF === '1'
  );
}

export function getLoadPerfTimestamp() {
  if (!isLoadPerfDebugEnabled() || !hasPerformanceTiming()) {
    return null;
  }

  return performance.now();
}

export function logLoadPerf(label: string) {
  if (!isLoadPerfDebugEnabled()) {
    return;
  }

  console.debug(`${LOAD_PERF_PREFIX} ${label}`);
}

export function logLoadPerfSince(label: string, startedAt: number | null) {
  if (!isLoadPerfDebugEnabled()) {
    return;
  }

  if (startedAt === null || !hasPerformanceTiming()) {
    console.debug(`${LOAD_PERF_PREFIX} ${label}`);
    return;
  }

  const durationMs = performance.now() - startedAt;
  console.debug(`${LOAD_PERF_PREFIX} ${label}: ${durationMs.toFixed(1)}ms`);
}

export function measureLoadPerf<T>(label: string, compute: () => T): T {
  const startedAt = getLoadPerfTimestamp();

  try {
    return compute();
  } finally {
    logLoadPerfSince(label, startedAt);
  }
}

export async function measureAsyncLoadPerf<T>(label: string, compute: () => Promise<T>) {
  const startedAt = getLoadPerfTimestamp();

  try {
    return await compute();
  } finally {
    logLoadPerfSince(label, startedAt);
  }
}