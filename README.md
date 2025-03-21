# Mapbox Polygon Analyzer

A React application that allows users to analyze map data within drawn polygons using Mapbox GL JS.

## Features

- Draw polygons on a map to select areas
- Display OpenStreetMap data within the selected area
- Toggle between 2D and 3D views
- Search for locations using the geocoder
- Display detailed information on map features

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) to view it in your browser

## Configuration

You can configure your own Mapbox token in the `App.js` file:

```js
const mapboxToken = 'YOUR_MAPBOX_TOKEN';
```

## Dependencies

- React
- Mapbox GL JS
- Mapbox GL Draw
- Mapbox GL Geocoder
- Turf.js