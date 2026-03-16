import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import {
  FaCircleInfo,
  FaLayerGroup,
  FaLocationDot,
  FaMountain,
  FaPersonSkiingNordic,
  FaSnowflake,
  FaXmark,
} from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

const DEFAULT_CENTER = [10.7522, 59.9139];
const WINTER_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';
const DESTINATIONS_SOURCE_ID = 'destinations';
const DESTINATIONS_LAYER_ID = 'destinations-layer';
const TRAILS_SOURCE_ID = 'trails';
const TRAILS_LAYER_ID = 'trails-layer';
const DEM_SOURCE_ID = 'mapbox-dem';
const BUILDINGS_LAYER_ID = '3d-buildings';

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

function setLayerPaintIfPresent(map, layerId, property, value) {
  const layer = map.getLayer(layerId);

  if (!layer) {
    return;
  }

  try {
    map.setPaintProperty(layerId, property, value);
  } catch (error) {
    console.warn(`Skipped winter paint override for ${layerId}.${property}`, error);
  }
}

function applyWinterBasemap(map) {
  const layers = map.getStyle().layers || [];

  layers.forEach((layer) => {
    const layerId = layer.id;

    if (layer.type === 'background') {
      setLayerPaintIfPresent(map, layerId, 'background-color', '#eef4f8');
    }

    if (layer.type === 'fill' && /(park|forest|wood|grass|landuse|nature|wetland)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', '#e7eff2');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', 0.85);
    }

    if (layer.type === 'fill' && /(snow|glacier|ice|water)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', layerId.includes('water') ? '#c8dced' : '#f7fbfe');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', layerId.includes('water') ? 0.9 : 0.95);
    }

    if (layer.type === 'line' && /(contour|terrain|hillshade)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#b7c6cf');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.45);
    }

    if (layer.type === 'line' && /(path|road|street|track)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#ffffff');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.5);
    }
  });

  if (map.getLayer('hillshade')) {
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-highlight-color', '#f8fbfd');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-shadow-color', '#b9cad5');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-accent-color', '#d9e6ee');
  }

  map.setFog({
    color: '#f5f8fb',
    'high-color': '#e5eef5',
    'horizon-blend': 0.04,
    'space-color': '#edf3f8',
    'star-intensity': 0,
  });
}

function applyThreeDimensionalMode(map, isEnabled) {
  if (!map.getSource(DEM_SOURCE_ID)) {
    map.addSource(DEM_SOURCE_ID, {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  if (isEnabled) {
    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1.2 });
    map.setFog({
      color: '#f2f6fb',
      'high-color': '#d9e8f7',
      'horizon-blend': 0.05,
      'space-color': '#edf4fb',
      'star-intensity': 0,
    });

    if (!map.getLayer(BUILDINGS_LAYER_ID)) {
      const labelLayer = map
        .getStyle()
        .layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field']);

      map.addLayer(
        {
          id: BUILDINGS_LAYER_ID,
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', ['get', 'extrude'], 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#dbe7ef',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.45,
          },
        },
        labelLayer?.id
      );
    }

    map.easeTo({ pitch: 58, bearing: 18, duration: 900 });
    return;
  }

  if (map.getLayer(BUILDINGS_LAYER_ID)) {
    map.removeLayer(BUILDINGS_LAYER_ID);
  }

  map.setTerrain(null);
  map.setFog(null);
  map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
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
  const [isThreeDimensional, setIsThreeDimensional] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);

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
      style: WINTER_STYLE_URL,
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
      try {
        applyWinterBasemap(map);
      } catch (error) {
        console.error('Failed to apply winter basemap styling', error);
      }

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
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    applyThreeDimensionalMode(map, isThreeDimensional);
  }, [mapReady, isThreeDimensional]);

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
      <aside className={`control-panel${isPanelCollapsed ? ' control-panel-collapsed' : ''}`}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">cc-maps</p>
            <h1>Cross-Country maps</h1>
          </div>
          <button
            type="button"
            className="panel-collapse-button"
            onClick={() => setIsPanelCollapsed((current) => !current)}
            aria-expanded={!isPanelCollapsed}
            aria-controls="control-panel-body"
          >
            {isPanelCollapsed ? 'Open' : 'Minimize'}
          </button>
        </div>

        {!isPanelCollapsed ? (
          <div id="control-panel-body">
            <div className="quick-actions">
              <button
                type="button"
                className="icon-chip"
                onClick={() => setIsInfoPanelOpen(true)}
                aria-label="Open info panel"
              >
                <FaCircleInfo />
                <span>Info</span>
              </button>
              <label className="icon-toggle" htmlFor="three-d-toggle">
                <span className="icon-toggle-copy">
                  <FaMountain />
                  <span>3D</span>
                </span>
                <input
                  id="three-d-toggle"
                  type="checkbox"
                  checked={isThreeDimensional}
                  onChange={(event) => setIsThreeDimensional(event.target.checked)}
                />
              </label>
            </div>

            <label className="field-label" htmlFor="destination-select">
              <span className="field-label-content">
                <FaLocationDot />
                <span>Destination</span>
              </span>
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
              <section className="detail-card detail-card-compact">
                <p className="detail-label">Selected destination</p>
                <h2>{selectedDestination.name}</h2>
                <p>
                  {DESTINATION_PREP_STYLES[selectedDestination.prepSymbol]?.label ||
                    DESTINATION_PREP_STYLES.default.label}
                </p>
              </section>
            ) : null}

            <section className="detail-card detail-card-compact">
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
              <section className="detail-card detail-card-compact">
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
          </div>
        ) : selectedDestination ? (
          <div className="panel-collapsed-summary">
            <p className="detail-label">Destination</p>
            <p>{selectedDestination.name}</p>
          </div>
        ) : null}
      </aside>

      {isInfoPanelOpen ? (
        <aside className="info-panel" aria-label="Map information">
          <div className="info-panel-header">
            <div>
              <p className="eyebrow">Guide</p>
              <h2 className="info-title">How to use the map</h2>
            </div>
            <button
              type="button"
              className="info-close-button"
              onClick={() => setIsInfoPanelOpen(false)}
              aria-label="Close info panel"
            >
              <FaXmark />
            </button>
          </div>

          <div className="info-list">
            <section className="info-item">
              <FaPersonSkiingNordic className="info-icon" />
              <div>
                <p className="detail-label">Browse</p>
                <p>Pick a ski area from the destination menu or tap a destination marker on the map.</p>
              </div>
            </section>

            <section className="info-item">
              <FaSnowflake className="info-icon" />
              <div>
                <p className="detail-label">Winter mode</p>
                <p>The base map is winter-styled by default. Turn on 3D only when you want terrain depth.</p>
              </div>
            </section>

            <section className="info-item">
              <FaLayerGroup className="info-icon" />
              <div>
                <p className="detail-label">Trail colors</p>
                <p>Blue is floodlit, green is machine groomed, orange is scooter, and purple is historic.</p>
              </div>
            </section>
          </div>
        </aside>
      ) : null}

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

        .control-panel-collapsed {
          width: auto;
          max-width: min(260px, calc(100% - 2rem));
        }

        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .panel-collapse-button {
          border: 0;
          border-radius: 999px;
          background: #dfeae2;
          color: #1d4236;
          padding: 0.45rem 0.7rem;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
        }

        .panel-collapse-button:hover {
          background: #d2e2d7;
        }

        .panel-collapsed-summary {
          margin-top: 0.6rem;
          color: #284638;
          font-size: 0.92rem;
        }

        .quick-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin-top: 0.75rem;
        }

        .icon-chip,
        .icon-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 999px;
          padding: 0.55rem 0.75rem;
          background: #eef4ef;
          color: #1f4235;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .icon-chip {
          border: 0;
          cursor: pointer;
        }

        .icon-toggle {
          justify-content: space-between;
          flex: 1;
        }

        .icon-toggle-copy,
        .field-label-content {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }

        .icon-toggle input {
          width: 1rem;
          height: 1rem;
          margin: 0;
          accent-color: #1f7f59;
        }

        .info-panel {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 1;
          width: min(320px, calc(100% - 2rem));
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          padding: 1rem;
          border: 1px solid rgba(29, 50, 42, 0.1);
          border-radius: 20px;
          background: rgba(252, 253, 251, 0.94);
          box-shadow: 0 24px 48px rgba(47, 74, 61, 0.14);
          backdrop-filter: blur(14px);
        }

        .info-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .info-title {
          font-size: 1.15rem;
        }

        .info-close-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border: 0;
          border-radius: 999px;
          background: #eef3ee;
          color: #234236;
          cursor: pointer;
        }

        .info-list {
          display: grid;
          gap: 0.85rem;
          margin-top: 1rem;
        }

        .info-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          align-items: flex-start;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(35, 66, 54, 0.08);
          color: #2a4639;
        }

        .info-item:first-child {
          padding-top: 0;
          border-top: 0;
        }

        .info-icon {
          margin-top: 0.1rem;
          font-size: 1rem;
          color: #2f6d58;
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

        .detail-card-compact p:last-of-type {
          margin-top: 0.35rem;
        }

        .detail-card :global(p + p) {
          margin-top: 0.25rem;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 0.75rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #234236;
        }

        .toggle-row input {
          width: 1.1rem;
          height: 1.1rem;
          accent-color: #1f7f59;
          flex: 0 0 auto;
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

          .info-panel {
            top: auto;
            right: 1rem;
            bottom: 1rem;
          }
        }

        @media (max-width: 640px) {
          .control-panel {
            top: auto;
            right: 0.75rem;
            bottom: 0.75rem;
            left: 0.75rem;
            width: auto;
            max-height: min(40vh, 320px);
            padding: 0.75rem 0.8rem;
            border: 1px solid rgba(29, 50, 42, 0.08);
            border-radius: 14px;
            background: rgba(248, 251, 248, 0.84);
            box-shadow: 0 10px 24px rgba(47, 74, 61, 0.1);
            backdrop-filter: blur(10px);
          }

          .control-panel-collapsed {
            max-width: calc(100% - 1.5rem);
          }

          .info-panel {
            right: 0.75rem;
            bottom: 0.75rem;
            left: 0.75rem;
            width: auto;
            max-height: min(42vh, 340px);
            padding: 0.8rem;
            border-radius: 14px;
          }

          h1 {
            font-size: 1.2rem;
            letter-spacing: -0.02em;
          }

          .panel-copy {
            margin-top: 0.3rem;
            font-size: 0.84rem;
            line-height: 1.25;
            max-width: none;
          }

          .eyebrow,
          .detail-label {
            margin-bottom: 0.2rem;
            font-size: 0.62rem;
            letter-spacing: 0.12em;
          }

          .field-label {
            margin-top: 0.6rem;
            margin-bottom: 0.3rem;
            font-size: 0.78rem;
          }

          .quick-actions {
            margin-top: 0.55rem;
            gap: 0.45rem;
          }

          .icon-chip,
          .icon-toggle {
            padding: 0.45rem 0.6rem;
            font-size: 0.76rem;
          }

          .select-input {
            padding: 0.68rem 0.75rem;
            border-radius: 10px;
            font-size: 0.9rem;
          }

          .detail-card,
          .status-card {
            margin-top: 0.45rem;
            padding: 0.55rem 0;
            border-radius: 0;
            background: transparent;
            border-top: 1px solid rgba(35, 66, 54, 0.08);
          }

          .legend-list {
            gap: 0.3rem;
            margin-top: 0.4rem;
          }

          .legend-item {
            gap: 0.5rem;
            font-size: 0.84rem;
          }

          .legend-swatch {
            width: 0.8rem;
            height: 0.8rem;
          }

          .toggle-row {
            margin-top: 0.55rem;
            font-size: 0.82rem;
            font-weight: 500;
          }

          .toggle-row input {
            width: 1rem;
            height: 1rem;
          }

          .info-title {
            font-size: 1rem;
          }

          .info-item {
            gap: 0.6rem;
          }

          .info-icon {
            font-size: 0.92rem;
          }

          .panel-collapse-button {
            padding: 0.35rem 0.6rem;
            font-size: 0.74rem;
          }

          h2 {
            font-size: 0.92rem;
          }

          p,
          .status-card,
          .detail-card {
            font-size: 0.82rem;
            line-height: 1.3;
          }
        }
      `}</style>
    </div>
  );
}