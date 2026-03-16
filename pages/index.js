import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

// The main page renders a full‑screen Mapbox GL JS map.
// It reads the Mapbox access token from the NEXT_PUBLIC_MAPBOX_TOKEN
// environment variable.  When the map loads it fetches cross‑country
// trail data from the `/api/trails` endpoint (see pages/api/trails.js).
// The trails layer is added as a GeoJSON source and styled as red lines.

export default function Home() {
  const mapContainer = useRef(null);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [10.7522, 59.9139], // default to Oslo
      zoom: 8,
    });

    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      })
    );

    map.on('load', async () => {
      try {
        const res = await fetch('/api/trails');
        if (!res.ok) throw new Error('Failed to fetch trails');
        const geojson = await res.json();
        map.addSource('trails', {
          type: 'geojson',
          data: geojson,
        });
        map.addLayer({
          id: 'trails-layer',
          type: 'line',
          source: 'trails',
          paint: {
            'line-color': '#d33682',
            'line-width': 2,
          },
        });
      } catch (err) {
        // console the error in development but avoid crashing in production
        console.error(err);
      }
    });

    return () => map.remove();
  }, []);

  return (
    <div style={{ height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}