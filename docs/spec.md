# Cross-Country maps Specification

## Overview

This document describes the architecture, API integration, and data model for `Cross-Country maps` (`cc-maps`), a web application that displays cross-country ski trails on an interactive map. The application is designed as a **Progressive Web App** (PWA) built with Next.js and **Mapbox GL JS**. It targets iPhone users (Safari) but is fully responsive and works on any modern browser. The app uses the public **Sporet** ArcGIS REST service to fetch trail geometries and destination metadata, and overlays them on a Mapbox base map. User location is obtained via the browser's Geolocation API.

The Sporet service is hosted at `https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer`.  This service exposes several layers, including points for destinations, trails, points of interest and transport stops.  Each layer supports queries in JSON, GeoJSON or PBF formats【39541456764800†L83-L85】.

### Features

* **Interactive map** – A full‑screen vector map rendered via Mapbox GL JS.  Users can pan and zoom and switch between map styles.
* **Trail overlay** – Cross‑country trails are fetched from the Sporet API and drawn on the map.  Trails are coloured according to their type (machine‑groomed, scooter trail, historical etc.).
* **Destinations** – Ski destinations (e.g., Sjusjøen, Nordseter) are displayed as points.  Clicking a destination zooms to its trails.
* **Points of interest (POI)** – Optional layer showing facilities like cabins, cafés, car parks and webcams.
* **Transport stops** – Bus/train/tram stops near trailheads can be displayed.
* **Geolocation** – The app requests the user’s location and displays it on the map.  PWAs on iOS can access geolocation in the foreground【172738025638201†L350-L352】 but cannot run background location or geofencing【172738025638201†L474-L478】.

## Architecture

The app uses a modular Next.js structure:

| Layer | Description |
| --- | --- |
| **Presentation** | React components render the map and UI.  The `pages/index.js` file initialises a Mapbox map and loads trail data from `/api/trails`. |
| **API Proxy** | Next.js API route (`pages/api/trails.js`) proxies requests to the Sporet REST API.  This keeps API keys off the client and allows filtering by destination ID. |
| **Data Source** | The Sporet REST service provides GeoJSON for trails and destinations.  Each layer accepts query parameters such as `where`, `outFields` and `f=geojson`.  Supported formats include JSON, GeoJSON and PBF【39541456764800†L83-L85】. |
| **Styling** | Trail segments are styled based on the `trailtypesymbol` field.  Destination points are styled based on the `prepsymbol` field. |

### Environment Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox access token.  Required for loading Mapbox styles. |
| `SPORET_API_BASE_URL` | Base URL for the Sporet API (defaults to the public service). |

## Sporet API Documentation

### Base URL

```
https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer
```

All endpoints documented below are relative to this base URL.  Each layer exposes a `query` operation.  Common query parameters:

| Parameter | Description |
| --- | --- |
| `where` | SQL‑like expression to filter records.  Use `1=1` to return all features.  For example, `destinationid=123`. |
| `outFields` | Comma‑separated list of field names to include in the response.  Use `*` to include all fields. |
| `returnGeometry` | `true` to include the feature geometry. |
| `f` | Output format: `json`, `geojson`, or `pbf`.  The service supports JSON, GeoJSON and PBF【39541456764800†L83-L85】. |

### Layer 6 – `Loypetype` (Cross‑Country Trails)

* **ID:** 6
* **Type:** Feature layer (polyline)
* **Purpose:** Contains polyline geometries representing ski trails.  Each record includes metadata about trail grooming and preparation.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `id` | OID | Unique identifier. |
| `destinationid` | Integer | Identifier linking the trail to a destination. |
| `has_classic` | SmallInteger | Whether the trail is prepared for classic skiing【28482976104215†L121-L129】.  `1` means yes. |
| `has_skating` | SmallInteger | Whether the trail is prepared for skating【28482976104215†L121-L129】. |
| `has_floodlight` | SmallInteger | Floodlit trail flag【28482976104215†L121-L129】. |
| `is_scootertrail` | SmallInteger | Indicates scooter‑prepared trail【28482976104215†L124-L129】. |
| `prepsymbol` | Integer | Code for the last preparation time; see Destinations table below. |
| `trailtypesymbol` | Integer | Trail type symbol used for styling; values include `20` (Lysløype), `30` (Maskinpreparert), `40` (Scooter) and `50` (Historiske)【28482976104215†L63-L86】. |
| `shape` | Geometry | Polyline geometry in EPSG:25833. |
| `st_length(shape)` | Double | Length of the polyline (metres). |
| `orgid_prepby` | Integer | ID of the organisation that prepared the trail. |
| `warningtext` | String | Free‑text warnings about trail conditions【28482976104215†L121-L135】. |

* **Example Request**

Retrieve all trails for destination `destinationid=12` as GeoJSON:

```
GET /6/query?where=destinationid=12&outFields=*&returnGeometry=true&f=geojson
```

### Layer 4 – `Destinasjoner_prep` (Ski Destinations)

* **ID:** 4
* **Type:** Feature layer (point)
* **Purpose:** Provides ski destinations with last preparation status.  Each point corresponds to a ski area such as Sjusjøen or Nordseter.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `id` | OID | Unique identifier. |
| `name` | String | Name of the destination (e.g., “Sjusjøen”)【36782349804530†L6-L17】. |
| `description` | String | Optional description. |
| `is_active` | SmallInteger | Indicates whether the destination is active【36782349804530†L169-L177】. |
| `datasource` | String | Source of the data. |
| `datasource_itemid` | String | Item identifier in the source system. |
| `createdtime` / `modifiedtime` | Date | Timestamps. |
| `prepsymbol` | Integer | Preparation code indicating how recently the destination was groomed.  Codes correspond to the following labels【36782349804530†L68-L123】:
  * `20` – prepared within the last 6 hours (colour: bright green).
  * `30` – prepared more than 6 hours ago (dark green).
  * `40` – prepared more than 18 hours ago (orange).
  * `50` – prepared more than 48 hours ago (purple).
  * `60` – prepared more than 14 days ago (red).
  * `70` – not prepared this season (grey).
| `shape` | Geometry | Point geometry in EPSG:25833【36782349804530†L46-L52】.

* **Example Request**

```
GET /4/query?where=name='Sjusjøen'&outFields=id,name,prepsymbol&returnGeometry=true&f=geojson
```

### Layer 11 – `Destinasjoner_singel` (Single Destinations)

* **ID:** 11
* **Type:** Feature layer (point)
* **Purpose:** Contains a simplified list of destination names and coordinates.  Useful for labelling the map.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `id` | OID | Unique identifier. |
| `name` | String | Destination name【459529202538453†L6-L16】. |
| `shape` | Geometry | Point geometry【459529202538453†L14-L16】.

* **Example Request**

```
GET /11/query?where=1=1&outFields=id,name&returnGeometry=true&f=geojson
```

### Layer 2 – `POIer` (Points of Interest)

* **ID:** 2
* **Type:** Feature layer (point)
* **Purpose:** Provides points of interest such as cafés, cabins, parking areas, viewpoints and webcams.  The `poitypeid` field identifies the category.  Examples of codes include `CAF` (Servering), `PAR` (Parkering), `LAN` (Langrennsarena), `ANE` (Weather station) and many others【695448668849479†L63-L153】.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `id` | OID | Unique identifier【695448668849479†L210-L214】. |
| `poitypeid` | String | Two– or three–character code defining the POI category【695448668849479†L56-L100】. |
| `name` | String | Name of the POI (not explicitly listed but implied). |
| `shape` | Geometry | Point geometry【695448668849479†L14-L16】.

* **Example Request**

```
GET /2/query?where=poitypeid='CAF'&outFields=id,poitypeid,name&returnGeometry=true&f=geojson
```

### Layer 8 – `Holdeplasser` (Transport Stops)

* **ID:** 8
* **Type:** Feature layer (point)
* **Purpose:** Contains public transport stops near the ski areas.  The `stoptypename` field indicates the transport mode (e.g., Bus, Train, Subway or Tram)【299601240956758†L63-L82】.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `objectid` | OID | Unique identifier【299601240956758†L119-L128】. |
| `stopid` | Integer | Stop identifier【299601240956758†L121-L123】. |
| `placeid` | Integer | Place identifier【299601240956758†L123-L124】. |
| `name` | String | Name of the stop【299601240956758†L124-L125】. |
| `shortname` | String | Abbreviated name【299601240956758†L124-L125】. |
| `stoptypename` | String | Type of stop (Bus, Train, Subway or Tram)【299601240956758†L63-L82】. |
| `shape` | Geometry | Point geometry【299601240956758†L14-L16】.

* **Example Request**

```
GET /8/query?where=stoptypename='Bus'&outFields=objectid,name,stoptypename&returnGeometry=true&f=geojson
```

### Layer 13 – `Infopoint` (Warnings)

* **ID:** 13
* **Type:** Feature layer (point)
* **Purpose:** Contains warning messages associated with trail segments.  Each record includes a `segmentid` and free‑text `warningtext`【438880429793609†L92-L103】.
* **Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `segmentid` | Integer | Identifier of the trail segment【438880429793609†L98-L101】. |
| `warningtext` | String | Text describing the warning or closure【438880429793609†L98-L103】. |
| `shape` | Geometry | Point geometry. |
| `ESRI_OID` | OID | Unique ID assigned by the server【438880429793609†L100-L104】. |

* **Example Request**

```
GET /13/query?where=1=1&outFields=segmentid,warningtext&returnGeometry=false&f=json
```

## Application Workflow

1. **Map initialisation:** On page load the client initialises a Mapbox map with the user’s preferred style.  The map loads within a full‑height container to maximise screen real estate on the iPhone.
2. **User location:** A Geolocate control requests permission to access the device’s GPS.  If granted, the user’s current position is displayed as a blue dot.  This uses the browser’s `navigator.geolocation` API (supported in PWAs on iOS【172738025638201†L350-L352】).
3. **Loading destinations:** The client queries the `Destinasjoner_prep` layer to retrieve all active destinations along with their preparation status and coordinates.  A marker or symbol is drawn for each destination.  Markers are coloured based on the `prepsymbol` code described above.
4. **Selecting a destination:** When the user selects a destination, the app calls the `/api/trails` endpoint with the corresponding `destinationid`.  The API proxy constructs a query against layer 6 and returns the trail GeoJSON.  The client then adds this data as a new Mapbox layer on the map.
5. **Displaying POIs and stops:** Optionally, the client can query layers 2 (POIer) and 8 (Holdeplasser) and overlay the results.  Each POI category can be styled with a distinct icon or symbol.
6. **Warnings:** The app periodically queries layer 13 for infopoints (warnings) and displays callouts on the map when relevant.

## Running the App

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxYourMapboxAccessTokenxxx
SPORET_API_BASE_URL=https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.  When testing on an iPhone, you can run the server on your machine and access it via your local network.

## Notes on iOS PWA behaviour

* PWAs on iOS support geolocation and camera/microphone access【172738025638201†L350-L352】, but they do **not** support background location or geofencing【172738025638201†L474-L478】.  The application therefore requests location only when the map is in the foreground.
* Offline caching should be implemented via a service worker.  Note that Safari may evict stored data if the device is low on space【172738025638201†L456-L470】.
* Because Safari on iOS does not display an automatic “Add to Home Screen” prompt【172738025638201†L376-L387】, provide clear instructions in the UI for users who wish to install the app on their home screen.

## Appendix: Additional Layers

The Sporet service also includes a `Sykkelveier` (cycling trails) layer (ID 5) and other layers not documented here.  These can be integrated similarly by examining their fields and using the same `query` operation.