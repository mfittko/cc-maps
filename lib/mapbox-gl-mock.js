class MockSource {
  constructor(data) {
    this.data = data;
  }

  setData(data) {
    this.data = data;
  }
}

class MockControl {
  constructor() {
    this.handlers = new Map();
  }

  on(eventName, handler) {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  off(eventName, handler) {
    const handlers = this.handlers.get(eventName) || [];
    this.handlers.set(
      eventName,
      handlers.filter((candidate) => candidate !== handler)
    );
  }
}

class MockLngLatBounds {
  constructor() {
    this.minLng = Number.POSITIVE_INFINITY;
    this.minLat = Number.POSITIVE_INFINITY;
    this.maxLng = Number.NEGATIVE_INFINITY;
    this.maxLat = Number.NEGATIVE_INFINITY;
  }

  extend(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return this;
    }

    this.minLng = Math.min(this.minLng, coordinates[0]);
    this.minLat = Math.min(this.minLat, coordinates[1]);
    this.maxLng = Math.max(this.maxLng, coordinates[0]);
    this.maxLat = Math.max(this.maxLat, coordinates[1]);
    return this;
  }

  getCenter() {
    return {
      lng: (this.minLng + this.maxLng) / 2,
      lat: (this.minLat + this.maxLat) / 2,
    };
  }
}

class MockMap {
  constructor(options = {}) {
    this.center = {
      lng: options.center?.[0] ?? 0,
      lat: options.center?.[1] ?? 0,
    };
    this.zoom = options.zoom ?? 0;
    this.sources = new Map();
    this.layers = new Map();
    this.handlers = new Map();
    this.canvas = {
      style: {},
    };
    this.terrain = null;

    setTimeout(() => {
      this.emit('load');
      this.emit('idle');
    }, 0);
  }

  emit(eventName, eventPayload) {
    const handlers = this.handlers.get(eventName) || [];
    handlers.forEach((handler) => handler(eventPayload));
  }

  addControl() {}

  addSource(id, source) {
    this.sources.set(id, new MockSource(source?.data));
  }

  getSource(id) {
    return this.sources.get(id) || null;
  }

  addLayer(layer) {
    this.layers.set(layer.id, {
      ...layer,
      paint: { ...(layer.paint || {}) },
      layout: { ...(layer.layout || {}) },
    });
  }

  getLayer(id) {
    return this.layers.get(id) || null;
  }

  removeLayer(id) {
    this.layers.delete(id);
  }

  moveLayer() {}

  on(eventName, layerIdOrHandler, maybeHandler) {
    const handler = typeof layerIdOrHandler === 'function' ? layerIdOrHandler : maybeHandler;
    if (typeof handler !== 'function') {
      return;
    }

    const key =
      typeof layerIdOrHandler === 'string' ? `${eventName}:${layerIdOrHandler}` : eventName;
    const handlers = this.handlers.get(key) || [];
    handlers.push(handler);
    this.handlers.set(key, handlers);
  }

  once(eventName, handler) {
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      handler(...args);
    };

    this.on(eventName, wrapped);
  }

  off(eventName, layerIdOrHandler, maybeHandler) {
    const handler = typeof layerIdOrHandler === 'function' ? layerIdOrHandler : maybeHandler;
    const key =
      typeof layerIdOrHandler === 'string' ? `${eventName}:${layerIdOrHandler}` : eventName;
    const handlers = this.handlers.get(key) || [];
    this.handlers.set(
      key,
      handlers.filter((candidate) => candidate !== handler)
    );
  }

  getCanvas() {
    return this.canvas;
  }

  getStyle() {
    return {
      layers: [...this.layers.values()],
    };
  }

  setPaintProperty(layerId, property, value) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.paint[property] = value;
    }
  }

  setLayoutProperty(layerId, property, value) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.layout[property] = value;
    }
  }

  setFog() {}

  setTerrain(terrain) {
    this.terrain = terrain;
  }

  getTerrain() {
    return this.terrain;
  }

  easeTo(options = {}) {
    this.updateCamera(options);
  }

  flyTo(options = {}) {
    this.updateCamera(options);
  }

  jumpTo(options = {}) {
    this.updateCamera(options);
  }

  fitBounds(bounds, options = {}) {
    const center = typeof bounds?.getCenter === 'function' ? bounds.getCenter() : this.center;
    this.center = center;
    if (typeof options.maxZoom === 'number') {
      this.zoom = options.maxZoom;
    }
    this.emit('moveend');
  }

  updateCamera(options) {
    if (Array.isArray(options.center)) {
      this.center = {
        lng: options.center[0],
        lat: options.center[1],
      };
    }

    if (typeof options.zoom === 'number') {
      this.zoom = options.zoom;
    }

    this.emit('moveend');
  }

  getCenter() {
    return this.center;
  }

  getZoom() {
    return this.zoom;
  }

  queryTerrainElevation() {
    return 0;
  }

  remove() {
    this.handlers.clear();
  }
}

const mockMapboxGl = {
  Map: MockMap,
  NavigationControl: class {},
  GeolocateControl: MockControl,
  LngLatBounds: MockLngLatBounds,
  accessToken: '',
};

export default mockMapboxGl;
