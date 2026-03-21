import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRoutePerfDebugEnabled, measureRoutePerf } from '../lib/route-perf';

describe('route-perf', () => {
  const originalEnv = process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF;
    } else {
      process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF = originalEnv;
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disables route perf logging by default', () => {
    delete process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF;

    expect(isRoutePerfDebugEnabled()).toBe(false);
    expect(measureRoutePerf('default-off', () => 42)).toBe(42);
  });

  it('runs without logging when performance timing is unavailable', () => {
    process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF = '1';
    vi.stubGlobal('performance', undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = measureRoutePerf('no-performance', () => 'ok');

    expect(result).toBe('ok');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('logs measured timings when route perf debug is enabled', () => {
    process.env.NEXT_PUBLIC_DEBUG_ROUTE_PERF = '1';
    vi.stubGlobal('performance', {
      now: vi.fn()
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(17.25),
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = measureRoutePerf('build route graph', () => ({ ok: true }));

    expect(result).toEqual({ ok: true });
    expect(debugSpy).toHaveBeenCalledWith('[route-perf] build route graph: 7.3ms');
  });
});
