import { describe, expect, it } from 'vitest';
import { createRoutePlan } from '../lib/route-plan';
import { shouldInitializeEmptyPlanningRoute } from '../hooks/useRoutePlanSync';

describe('useRoutePlanSync regression guards', () => {
  it('allows empty planning initialization only when no persisted route is waiting to hydrate', () => {
    expect(
      shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: true,
        shouldOpenPlanningFromUrl: true,
        persistedRoutePlan: null,
        selectedDestinationId: '10084',
        isPlanning: false,
      })
    ).toBe(true);
  });

  it('blocks empty planning initialization when a route from the URL or storage is pending hydration', () => {
    expect(
      shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: true,
        shouldOpenPlanningFromUrl: true,
        persistedRoutePlan: createRoutePlan('10084', ['edge-a'], ['10084', '10085']),
        selectedDestinationId: '10084',
        isPlanning: false,
      })
    ).toBe(false);
  });

  it('blocks empty planning initialization when initialization prerequisites are incomplete', () => {
    expect(
      shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: false,
        shouldOpenPlanningFromUrl: true,
        persistedRoutePlan: null,
        selectedDestinationId: '10084',
        isPlanning: false,
      })
    ).toBe(false);

    expect(
      shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: true,
        shouldOpenPlanningFromUrl: true,
        persistedRoutePlan: null,
        selectedDestinationId: '',
        isPlanning: false,
      })
    ).toBe(false);

    expect(
      shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: true,
        shouldOpenPlanningFromUrl: true,
        persistedRoutePlan: null,
        selectedDestinationId: '10084',
        isPlanning: true,
      })
    ).toBe(false);
  });
});