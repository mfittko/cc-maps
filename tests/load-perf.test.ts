import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLoadPerfTimestamp,
  isLoadPerfDebugEnabled,
  logLoadPerf,
  logLoadPerfSince,
  measureAsyncLoadPerf,
  measureLoadPerf,
} from '../lib/load-perf';

describe('load-perf', () => {
  const originalPublicEnv = process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF;
  const originalServerEnv = process.env.DEBUG_LOAD_PERF;

  afterEach(() => {
    if (originalPublicEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF;
    } else {
      process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = originalPublicEnv;
    }

    if (originalServerEnv === undefined) {
      delete process.env.DEBUG_LOAD_PERF;
    } else {
      process.env.DEBUG_LOAD_PERF = originalServerEnv;
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disables load perf logging by default', () => {
    delete process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF;
    delete process.env.DEBUG_LOAD_PERF;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    expect(isLoadPerfDebugEnabled()).toBe(false);
    expect(getLoadPerfTimestamp()).toBeNull();
    expect(measureLoadPerf('default-off', () => 42)).toBe(42);
    logLoadPerf('should stay quiet');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('supports the server-side debug flag', () => {
    delete process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF;
    process.env.DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValue(12),
    });

    expect(isLoadPerfDebugEnabled()).toBe(true);
    expect(getLoadPerfTimestamp()).toBe(12);
  });

  it('returns null when enabled without performance timing support', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', undefined);

    expect(getLoadPerfTimestamp()).toBeNull();
  });

  it('logs simple milestone messages when enabled', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logLoadPerf('home render started');

    expect(debugSpy).toHaveBeenCalledWith('[load-perf] home render started');
  });

  it('logs elapsed milestone timings when enabled', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValue(24.4),
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logLoadPerfSince('destinations ready', 10);

    expect(debugSpy).toHaveBeenCalledWith('[load-perf] destinations ready: 14.4ms');
  });

  it('falls back to a plain milestone log without a start timestamp', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logLoadPerfSince('destinations ready', null);

    expect(debugSpy).toHaveBeenCalledWith('[load-perf] destinations ready');
  });

  it('falls back to a plain milestone log when performance timing is unavailable', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logLoadPerfSince('destinations ready', 10);

    expect(debugSpy).toHaveBeenCalledWith('[load-perf] destinations ready');
  });

  it('measures sync work when enabled', () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(8.5),
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = measureLoadPerf('shape destinations', () => 'ok');

    expect(result).toBe('ok');
    expect(debugSpy).toHaveBeenCalledWith('[load-perf] shape destinations: 5.5ms');
  });

  it('measures async work when enabled', async () => {
    process.env.NEXT_PUBLIC_DEBUG_LOAD_PERF = '1';
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(31.75),
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await measureAsyncLoadPerf('fetch primary trails', async () => 'done');

    expect(result).toBe('done');
    expect(debugSpy).toHaveBeenCalledWith('[load-perf] fetch primary trails: 11.8ms');
  });
});