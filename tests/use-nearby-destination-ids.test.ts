import { describe, expect, it } from 'vitest';
import { getNearbyDestinationReferenceCoordinates } from '../hooks/useNearbyDestinationIds';

describe('getNearbyDestinationReferenceCoordinates', () => {
  const selectedDestination = {
    id: '1',
    name: 'Sjusjoen',
    coordinates: [10.75, 61.15] as [number, number],
  };

  it('uses the selected destination while planning', () => {
    expect(
      getNearbyDestinationReferenceCoordinates({
        mapView: {
          longitude: 10.9,
          latitude: 61.4,
          zoom: 11,
        },
        selectedDestination,
        isPlanning: true,
      })
    ).toEqual(selectedDestination.coordinates);
  });

  it('uses the live map center outside planning', () => {
    expect(
      getNearbyDestinationReferenceCoordinates({
        mapView: {
          longitude: 10.9,
          latitude: 61.4,
          zoom: 11,
        },
        selectedDestination,
        isPlanning: false,
      })
    ).toEqual([10.9, 61.4]);
  });

  it('falls back to the selected destination when the map view is missing', () => {
    expect(
      getNearbyDestinationReferenceCoordinates({
        mapView: null,
        selectedDestination,
        isPlanning: false,
      })
    ).toEqual(selectedDestination.coordinates);
  });

  it('returns null without a selected destination', () => {
    expect(
      getNearbyDestinationReferenceCoordinates({
        mapView: null,
        selectedDestination: null,
        isPlanning: true,
      })
    ).toBeNull();
  });
});