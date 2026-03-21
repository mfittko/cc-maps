import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findClosestDestination,
  findClosestDestinationByTrailProximity,
  formatDistance,
  getClickedTrailSection,
  getDestinationsWithinRadius,
  getDistanceInKilometers,
  getTrailSelectionLengthInKilometers,
} from '../lib/map-domain';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'browse-contract');

function readFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function getNearbyPreviewDestinationIds(fixture) {
  return getDestinationsWithinRadius(
    fixture.destinations,
    fixture.referenceCoordinates,
    fixture.radiusKm,
    fixture.selectedDestinationId
  )
    .sort((left, right) => {
      const leftDistance = getDistanceInKilometers(fixture.referenceCoordinates, left.coordinates);
      const rightDistance = getDistanceInKilometers(fixture.referenceCoordinates, right.coordinates);
      return leftDistance - rightDistance;
    })
    .slice(0, fixture.maxPreviews)
    .map((destination) => destination.id);
}

function getTrailDetailSnapshot(feature) {
  const trailType = TRAIL_TYPE_STYLES[feature.properties.trailtypesymbol] || TRAIL_TYPE_STYLES.default;
  const grooming = DESTINATION_PREP_STYLES[feature.properties.prepsymbol] || DESTINATION_PREP_STYLES.default;
  const disciplineLabels = [
    feature.properties.has_classic ? 'Classic' : null,
    feature.properties.has_skating ? 'Skating' : null,
    feature.properties.has_floodlight ? 'Floodlit' : null,
    feature.properties.is_scootertrail ? 'Scooter' : null,
  ].filter(Boolean);

  return {
    trailTypeLabel: trailType.label,
    groomingLabel: grooming.label,
    compactGroomingLabel:
      feature.properties.prepsymbol === 20
        ? '6h'
        : feature.properties.prepsymbol === 30
          ? '>6h'
          : feature.properties.prepsymbol === 40
            ? '>18h'
            : feature.properties.prepsymbol === 50
              ? '>48h'
              : feature.properties.prepsymbol === 60
                ? '>14d'
                : feature.properties.prepsymbol === 70
                  ? 'season'
                  : '?',
    groomingColorHex: grooming.color,
    disciplineLabels,
    warningText: feature.properties.warningtext || null,
    formattedDistance: formatDistance(getTrailSelectionLengthInKilometers(feature)),
  };
}

describe('browse contract fixtures', () => {
  it('defines the fallback destination selection contract from the default Oslo reference', () => {
    const fixture = readFixture('default-destination-fallback.json');

    expect(findClosestDestination(fixture.destinations, fixture.referenceCoordinates)?.id).toBe(
      fixture.expectedDestinationId
    );
  });

  it('defines the current-location trail proximity auto-selection contract', () => {
    const fixture = readFixture('trail-proximity-auto-selection.json');

    expect(
      findClosestDestinationByTrailProximity(
        fixture.destinations,
        fixture.trailsGeoJson,
        fixture.referenceCoordinates,
        fixture.thresholdKm
      )?.id
    ).toBe(fixture.expectedDestinationId);
  });

  it('defines the bounded nearby preview selection contract used by the web browse flow', () => {
    const fixture = readFixture('nearby-preview-selection.json');

    expect(getNearbyPreviewDestinationIds(fixture)).toEqual(fixture.expectedDestinationIds);
  });

  it('defines the web trail-detail categories used for Phase 3 parity', () => {
    const fixture = readFixture('trail-detail-summary.json');

    expect(getTrailDetailSnapshot(fixture.trailFeature)).toEqual(fixture.expected);
  });

  it('defines the whole-feature inspection fallback when deterministic interval selection is unavailable', () => {
    const fixture = readFixture('whole-feature-inspection-fallback.json');
    const selectedFeature = fixture.trailsGeoJson.features[0];

    expect(
      getClickedTrailSection(
        selectedFeature,
        fixture.clickCoordinates,
        fixture.trailsGeoJson,
        fixture.destinations,
        fixture.crossingMatchThresholdKm,
        fixture.trailMatchThresholdKm
      )
    ).toMatchObject({
      feature: {
        properties: {
          id: fixture.expected.featureId,
        },
      },
      segment: fixture.expected.segment,
    });
  });
});