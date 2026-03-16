import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

const DEFAULT_CENTER = [10.7522, 59.9139];
const DESTINATIONS_SOURCE_ID = 'destinations';
const DESTINATIONS_LAYER_ID = 'destinations-layer';
const TRAILS_SOURCE_ID = 'trails';
const TRAILS_LAYER_ID = 'trails-layer';

const trailLegendItems = Object.entries(TRAIL_TYPE_STYLES)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => ({ code: Number(key), ...value }));

function buildMatchExpression(propertyName, styles) {
  const expression = ['match', ['coalesce', ['to-number', ['get', propertyName]], -1]];

  Object.entries(styles).forEach(([key, value]) => {
    if (key === 'default') {
      return;
    }

    expression.push(Number(key), value.color);
  });

  expression.push(styles.default.color);

  return expression;
}

function extendBounds(bounds, coordinates) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend(coordinates);
    return;
  }

  coordinates.forEach((coordinateSet) => extendBounds(bounds, coordinateSet));
}

function fitMapToGeoJson(map, geojson, fallbackCenter) {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoordinates = false;

  geojson.features.forEach((feature) => {
    if (!feature.geometry?.coordinates) {
      return;
    }

    extendBounds(bounds, feature.geometry.coordinates);
    hasCoordinates = true;
  });

  if (hasCoordinates) {
    map.fitBounds(bounds, { padding: 48, duration: 900, maxZoom: 12 });
    return;
  }

  if (fallbackCenter) {
    map.flyTo({ center: fallbackCenter, zoom: 11, duration: 900 });
  }
}

function getDestinationSummary(feature) {
  return {
    id: String(feature.properties.id),
    name: feature.properties.name,
    prepSymbol: feature.properties.prepsymbol,
    coordinates: feature.geometry?.coordinates || DEFAULT_CENTER,
  };
}

export default function Home() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [destinationsStatus, setDestinationsStatus] = useState('idle');
  const [trailsStatus, setTrailsStatus] = useState('idle');
  const [requestError, setRequestError] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [destinationsGeoJson, setDestinationsGeoJson] = useState(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [selectedTrail, setSelectedTrail] = useState(null);

  const selectedDestination =
    destinations.find((destination) => destination.id === selectedDestinationId) || null;

  useEffect(() => {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!accessToken) {
      setMapError('Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to load the map.');
      return undefined;
    }

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: DEFAULT_CENTER,
      zoom: 7,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right'
    );

    map.on('load', () => {
      setMapReady(true);
    });

    map.on('error', (event) => {
      if (event?.error?.message) {
        setMapError(event.error.message);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }

    let isCancelled = false;

    async function loadDestinations() {
      setDestinationsStatus('loading');
      setRequestError('');

      try {
        const response = await fetch('/api/destinations');

        if (!response.ok) {
          throw new Error('Failed to fetch destinations');
        }

        const geojson = await response.json();

        if (isCancelled) {
          return;
        }

        const destinationOptions = geojson.features
          .map(getDestinationSummary)
          .sort((left, right) => left.name.localeCompare(right.name));

        setDestinations(destinationOptions);
        setDestinationsGeoJson(geojson);
        setDestinationsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setDestinationsStatus('error');
        setRequestError(error.message);
      }
    }

    loadDestinations();

    return () => {
      isCancelled = true;
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !destinationsGeoJson) {
      return undefined;
    }

    if (map.getSource(DESTINATIONS_SOURCE_ID)) {
      map.getSource(DESTINATIONS_SOURCE_ID).setData(destinationsGeoJson);
      return undefined;
    }

    map.addSource(DESTINATIONS_SOURCE_ID, {
      type: 'geojson',
      data: destinationsGeoJson,
    });

    map.addLayer({
      id: DESTINATIONS_LAYER_ID,
      type: 'circle',
      source: DESTINATIONS_SOURCE_ID,
      paint: {
        'circle-color': buildMatchExpression('prepsymbol', DESTINATION_PREP_STYLES),
        'circle-radius': 6,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    const handleDestinationClick = (event) => {
      const feature = event.features?.[0];

      if (!feature?.properties?.id) {
        return;
      }

      setSelectedDestinationId(String(feature.properties.id));
      setSelectedTrail(null);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
    map.on('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);

    return () => {
      if (!map.getLayer(DESTINATIONS_LAYER_ID)) {
        return;
      }

      map.off('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
      map.off('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);
    };
  }, [mapReady, destinationsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !selectedDestinationId) {
      return undefined;
    }

    let isCancelled = false;

    async function loadTrails() {
      setTrailsStatus('loading');
      setRequestError('');

      try {
        const response = await fetch(`/api/trails?destinationid=${selectedDestinationId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch trails for the selected destination');
        }

        const geojson = await response.json();

        if (isCancelled) {
          return;
        }

        if (map.getSource(TRAILS_SOURCE_ID)) {
          map.getSource(TRAILS_SOURCE_ID).setData(geojson);
        } else {
          map.addSource(TRAILS_SOURCE_ID, {
            type: 'geojson',
            data: geojson,
          });

          map.addLayer({
            id: TRAILS_LAYER_ID,
            type: 'line',
            source: TRAILS_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': buildMatchExpression('trailtypesymbol', TRAIL_TYPE_STYLES),
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
              'line-opacity': 0.85,
            },
          });

          map.on('click', TRAILS_LAYER_ID, (event) => {
            const feature = event.features?.[0];

            if (!feature?.properties) {
              return;
            }

            setSelectedTrail(feature.properties);
          });

          map.on('mouseenter', TRAILS_LAYER_ID, () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', TRAILS_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
          });
        }

        fitMapToGeoJson(map, geojson, selectedDestination?.coordinates || DEFAULT_CENTER);
        setTrailsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setTrailsStatus('error');
        setRequestError(error.message);
      }
    }

    loadTrails();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, selectedDestinationId, selectedDestination]);

  return (
    <div className="page-shell">
      <aside className="control-panel">
        <p className="eyebrow">cc-maps</p>
        <h1>Cross-Country maps</h1>
        <p className="panel-copy">
          Browse active ski destinations first, then load trails on demand for a selected area.
        </p>

        <label className="field-label" htmlFor="destination-select">
          Destination
        </label>
        <select
          id="destination-select"
          className="select-input"
          value={selectedDestinationId}
          onChange={(event) => {
            setSelectedDestinationId(event.target.value);
            setSelectedTrail(null);
          }}
          disabled={destinationsStatus !== 'success'}
        >
          <option value="">Choose a ski area</option>
          {destinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.name}
            </option>
          ))}
        </select>

        <div className="status-stack">
          {mapError ? <p className="status-card status-error">{mapError}</p> : null}
          {destinationsStatus === 'loading' ? (
            <p className="status-card">Loading destinations...</p>
          ) : null}
          {trailsStatus === 'loading' ? <p className="status-card">Loading trails...</p> : null}
          {requestError ? <p className="status-card status-error">{requestError}</p> : null}
          {destinationsStatus === 'success' && destinations.length === 0 ? (
            <p className="status-card">No active destinations were returned by the API.</p>
          ) : null}
        </div>

        {selectedDestination ? (
          <section className="detail-card">
            <p className="detail-label">Selected destination</p>
            <h2>{selectedDestination.name}</h2>
            <p>
              {DESTINATION_PREP_STYLES[selectedDestination.prepSymbol]?.label ||
                DESTINATION_PREP_STYLES.default.label}
            </p>
          </section>
        ) : null}

        <section className="detail-card">
          <p className="detail-label">Trail legend</p>
          <ul className="legend-list">
            {trailLegendItems.map((item) => (
              <li key={item.code} className="legend-item">
                <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {selectedTrail ? (
          <section className="detail-card">
            <p className="detail-label">Trail details</p>
            <h2>
              {TRAIL_TYPE_STYLES[selectedTrail.trailtypesymbol]?.label ||
                TRAIL_TYPE_STYLES.default.label}
            </h2>
            <p>
              Classic: {selectedTrail.has_classic ? 'Yes' : 'No'} · Skating:{' '}
              {selectedTrail.has_skating ? 'Yes' : 'No'}
            </p>
            {selectedTrail.warningtext ? <p>{selectedTrail.warningtext}</p> : null}
          </section>
        ) : null}
      </aside>

      <main className="map-stage">
        <div ref={mapContainer} className="map-container" />
      </main>

      <style jsx>{`
        .page-shell {
          position: relative;
          height: 100vh;
          overflow: hidden;
          background: linear-gradient(145deg, #ebf4ef 0%, #dfe8ef 100%);
        }

        .control-panel {
          position: absolute;
          top: 1rem;
          left: 1rem;
          z-index: 1;
          width: min(340px, calc(100% - 2rem));
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          padding: 1rem;
          border: 1px solid rgba(29, 50, 42, 0.1);
          border-radius: 20px;
          background: rgba(250, 252, 250, 0.92);
          box-shadow: 0 24px 48px rgba(47, 74, 61, 0.16);
          backdrop-filter: blur(14px);
        }

        .eyebrow,
        .detail-label {
          margin: 0 0 0.35rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #567261;
        }

        h1,
        h2,
        p {
          margin: 0;
        }

        h1 {
          font-size: 1.8rem;
          line-height: 1.05;
          color: #18352b;
        }

        h2 {
          font-size: 1rem;
          color: #163127;
        }

        .panel-copy {
          margin-top: 0.7rem;
          color: #385445;
          line-height: 1.5;
          max-width: 28ch;
        }

        .field-label {
          display: block;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: #234236;
        }

        .select-input {
          width: 100%;
          padding: 0.85rem 0.9rem;
          border: 1px solid #c7d6cc;
          border-radius: 12px;
          background: #ffffff;
          color: #143126;
          font: inherit;
        }

        .status-stack {
          display: grid;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .status-card,
        .detail-card {
          margin-top: 0.75rem;
          padding: 0.75rem 0.85rem;
          border-radius: 14px;
          background: #f3f7f3;
          color: #284638;
        }

        .detail-card :global(p + p) {
          margin-top: 0.25rem;
        }

        .status-error {
          background: #fff0f0;
          color: #8d2d2d;
        }

        .legend-list {
          display: grid;
          gap: 0.55rem;
          margin: 0.75rem 0 0;
          padding: 0;
          list-style: none;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .legend-swatch {
          width: 0.95rem;
          height: 0.95rem;
          border-radius: 999px;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
        }

        .map-stage,
        .map-container {
          width: 100%;
          height: 100vh;
        }

        @media (max-width: 840px) {
          .control-panel {
            width: min(320px, calc(100% - 2rem));
          }
        }

        @media (max-width: 640px) {
          .control-panel {
            top: auto;
            right: 0.75rem;
            bottom: 0.75rem;
            left: 0.75rem;
            width: auto;
            max-height: min(44vh, 360px);
            padding: 0.85rem;
            border-radius: 18px;
          }

          h1 {
            font-size: 1.45rem;
          }

          .panel-copy {
            margin-top: 0.45rem;
            font-size: 0.95rem;
            line-height: 1.35;
            max-width: none;
          }

          .field-label {
            margin-top: 0.75rem;
          }

          .select-input {
            padding: 0.75rem 0.85rem;
          }

          .detail-card,
          .status-card {
            margin-top: 0.6rem;
            padding: 0.7rem 0.8rem;
          }

          .legend-list {
            gap: 0.4rem;
            margin-top: 0.55rem;
          }
        }
      `}</style>
    </div>
  );
}