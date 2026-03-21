import { describe, expect, it } from 'vitest';
import {
  getPreviewTrailCollectionScopeKey,
  getPrimaryTrailCollectionScopeKey,
} from '../hooks/useTrailCollections';

describe('useTrailCollections regression guards', () => {
  it('keeps the primary load scope stable for unchanged destination sets', () => {
    const firstScopeKey = getPrimaryTrailCollectionScopeKey({
      mapReady: true,
      selectedDestinationId: '10084',
      primaryDestinationIdsKey: '10084,10085',
    });
    const secondScopeKey = getPrimaryTrailCollectionScopeKey({
      mapReady: true,
      selectedDestinationId: '10084',
      primaryDestinationIdsKey: '10084,10085',
    });

    expect(firstScopeKey).toBe('10084:10084,10085');
    expect(secondScopeKey).toBe(firstScopeKey);
  });

  it('changes the primary load scope when the selected destination set really changes', () => {
    expect(
      getPrimaryTrailCollectionScopeKey({
        mapReady: true,
        selectedDestinationId: '10084',
        primaryDestinationIdsKey: '10084,10085',
      })
    ).not.toBe(
      getPrimaryTrailCollectionScopeKey({
        mapReady: true,
        selectedDestinationId: '10084',
        primaryDestinationIdsKey: '10084,10086',
      })
    );
  });

  it('keeps the preview load scope stable for unchanged preview destination sets', () => {
    const firstScopeKey = getPreviewTrailCollectionScopeKey({
      mapReady: true,
      previewDestinationIdsKey: '10085,10086',
    });
    const secondScopeKey = getPreviewTrailCollectionScopeKey({
      mapReady: true,
      previewDestinationIdsKey: '10085,10086',
    });

    expect(firstScopeKey).toBe('10085,10086');
    expect(secondScopeKey).toBe(firstScopeKey);
  });

  it('collapses disabled or empty scopes so preview loading does not rerun unnecessarily', () => {
    expect(
      getPreviewTrailCollectionScopeKey({
        mapReady: false,
        previewDestinationIdsKey: '10085,10086',
      })
    ).toBe('');

    expect(
      getPrimaryTrailCollectionScopeKey({
        mapReady: true,
        selectedDestinationId: '',
        primaryDestinationIdsKey: '10084',
      })
    ).toBe('');
  });
});