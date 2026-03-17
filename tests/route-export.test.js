import { describe, expect, it } from 'vitest';
import { createGpxFileName, createGpxFromRouteFeatures } from '../lib/route-export.js';

describe('route-export', () => {
  it('returns an empty string when there are not enough route coordinates', () => {
    expect(createGpxFromRouteFeatures(null)).toBe('');
    expect(
      createGpxFromRouteFeatures([
        {
          geometry: {
            type: 'LineString',
            coordinates: [[10.75, 59.91]],
          },
        },
      ])
    ).toBe('');
  });

  it('serializes ordered route coordinates into a GPX track', () => {
    const gpx = createGpxFromRouteFeatures([
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.75, 59.91],
            [10.76, 59.91],
          ],
        },
      },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.76, 59.91],
            [10.77, 59.92],
          ],
        },
      },
    ], { name: 'Nordmarka loop' });

    expect(gpx).toContain('<name>Nordmarka loop</name>');
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<trkpt /g)).toHaveLength(4);
    expect(gpx).toContain('<trkpt lat="59.91" lon="10.75"></trkpt>');
    expect(gpx).toContain('<trkpt lat="59.92" lon="10.77"></trkpt>');
  });

  it('preserves route section boundaries as separate GPX track segments', () => {
    const gpx = createGpxFromRouteFeatures([
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.75, 59.91],
            [10.76, 59.91],
          ],
        },
      },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.76, 59.91],
            [10.77, 59.92],
          ],
        },
      },
    ]);

    expect(gpx).toContain([
      '<trkseg>',
      '      <trkpt lat="59.91" lon="10.75"></trkpt>',
      '      <trkpt lat="59.91" lon="10.76"></trkpt>',
      '    </trkseg>',
      '    <trkseg>',
      '      <trkpt lat="59.91" lon="10.76"></trkpt>',
      '      <trkpt lat="59.92" lon="10.77"></trkpt>',
      '    </trkseg>',
    ].join('\n'));
  });

  it('escapes route names in the generated XML', () => {
    const gpx = createGpxFromRouteFeatures(
      [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.75, 59.91],
              [10.76, 59.91],
            ],
          },
        },
      ],
      { name: 'A&B <route>' }
    );

    expect(gpx).toContain('<name>A&amp;B &lt;route&gt;</name>');
  });

  it('ignores unsupported or malformed feature geometry', () => {
    const gpx = createGpxFromRouteFeatures([
      { geometry: { type: 'Point', coordinates: [10.75, 59.91] } },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.75, 59.91],
            [10.76, 59.91],
          ],
        },
      },
      { geometry: { type: 'LineString', coordinates: null } },
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.76, 59.91],
            [10.77, 59.91],
          ],
        },
      },
    ]);

    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<trkpt /g)).toHaveLength(4);
  });

  it('creates a stable download file name', () => {
    expect(createGpxFileName('Nordmarka Route 7')).toBe('nordmarka-route-7.gpx');
    expect(createGpxFileName('  ')).toBe('cc-maps-route.gpx');
  });
});