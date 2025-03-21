import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as turf from '@turf/turf';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MapboxPolygonAnalyzer.css';

// Remove the worker class code which causes issues
// mapboxgl.workerClass = require('mapbox-gl/dist/mapbox-gl-csp-worker').default;

const MapboxPolygonAnalyzer = ({ mapboxToken }) => {
  // State variables
  const [map, setMap] = useState(null);
  const [draw, setDraw] = useState(null);
  const [osmFeatures, setOsmFeatures] = useState([]);
  const [trafficSigns, setTrafficSigns] = useState([]);
  const [is3DMode, setIs3DMode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Refs
  const mapContainer = useRef(null);
  
  // Layer configuration
  const layerConfig = {
    osmPoints: {
      circleRadius: 4,
      circleColor: '#0000ff',
      circleOpacity: 0.8
    },
    osmLines: {
      lineColor: '#00ff00',
      lineWidth: 2,
      lineOpacity: 0.8
    },
    trafficSigns: {
      iconSize: 0.5,
      textColor: '#ff0000',
      textSize: 12
    }
  };

  // First, create function references
  const processOSMDataRef = useRef(null);
  const fetchOSMDataRef = useRef(null);
  const zoomToFeaturesRef = useRef(null);
  
  // Define all functions with proper references
  processOSMDataRef.current = (osmData, polygon) => {
    const nodesById = {};
    osmData.elements
      .filter(el => el.type === 'node')
      .forEach(node => {
        nodesById[node.id] = [node.lon, node.lat];
      });
    
    const features = [];
    osmData.elements
      .filter(el => el.type === 'node')
      .forEach(node => {
        const point = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [node.lon, node.lat]
          },
          properties: node.tags || {}
        };
        if (turf.booleanPointInPolygon(point.geometry.coordinates, polygon)) {
          features.push(point);
        }
      });
    
    osmData.elements
      .filter(el => el.type === 'way')
      .forEach(way => {
        const coordinates = way.nodes
          .map(nodeId => nodesById[nodeId])
          .filter(coord => coord);
        if (coordinates.length >= 2) {
          const lineString = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            },
            properties: way.tags || {}
          };
          if (turf.booleanIntersects(polygon, lineString)) {
            features.push(lineString);
          }
        }
      });
    
    return features;
  };
  
  zoomToFeaturesRef.current = () => {
    if (!map) return;
    
    const allFeatures = [...osmFeatures, ...trafficSigns];
    if (allFeatures.length) {
      const bounds = new mapboxgl.LngLatBounds();
      allFeatures.forEach(feature => {
        if (feature.geometry.type === 'Point') {
          bounds.extend(feature.geometry.coordinates);
        } else {
          feature.geometry.coordinates.forEach(coord => bounds.extend(coord));
        }
      });
      map.fitBounds(bounds, { padding: 50, pitch: is3DMode ? 60 : 0 });
    }
  };
  
  fetchOSMDataRef.current = async (polygon) => {
    if (!map) return;
    
    const bbox = turf.bbox(polygon);
    const query = `
      [out:json];
      (
        node(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        way(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        relation(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
      );
      out body;
      >;
      out skel qt;
    `;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });
    const osmData = await response.json();
    const processedFeatures = processOSMDataRef.current(osmData, polygon);
    
    setOsmFeatures(processedFeatures);
    
    if (map.getSource('osm-data')) {
      map.getSource('osm-data').setData({
        type: 'FeatureCollection',
        features: processedFeatures
      });
    }
  };
  
  // Handle polygon changes using the refs
  const handlePolygonChange = async (e) => {
    if (!map || !draw) return;
    
    const data = draw.getAll();
    if (!data.features.length) return;
    
    setLoading(true);
    
    try {
      await Promise.all([
        fetchOSMDataRef.current(data.features[0].geometry),
        // fetchMapillarySigns(data.features[0].geometry)
      ]);
      zoomToFeaturesRef.current();
    } catch (error) {
      console.error('Error processing data:', error);
      alert('Error loading data. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Other functions without circular dependencies
  const add3DToggleControl = useCallback((mapInstance) => {
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Toggle 3D';
    toggleButton.className = 'mapboxgl-ctrl-icon';
    toggleButton.style.padding = '5px';
    toggleButton.onclick = () => {
      const newMode = !is3DMode;
      setIs3DMode(newMode);
      mapInstance.easeTo({
        pitch: newMode ? 60 : 0,
        bearing: newMode ? 45 : 0,
        duration: 1000
      });
    };
    
    const customControl = {
      onAdd: () => {
        const div = document.createElement('div');
        div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        div.appendChild(toggleButton);
        return div;
      },
      onRemove: () => {}
    };
    
    mapInstance.addControl(customControl, 'top-right');
  }, [is3DMode, setIs3DMode]);
  
  const initializeLayers = useCallback((mapInstance) => {
    try {
      // Add 3D buildings layer
      mapInstance.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#aaa',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base_height'],
          'fill-extrusion-opacity': 0.6
        }
      });
      
      // Traffic signs source and layer
      mapInstance.addSource('traffic-signs', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      mapInstance.addLayer({
        id: 'traffic-signs-layer',
        type: 'symbol',
        source: 'traffic-signs',
        layout: {
          'icon-image': 'traffic-sign',
          'icon-size': layerConfig.trafficSigns.iconSize,
          'text-field': '{name}',
          'text-offset': [0, 1.5],
          'text-size': layerConfig.trafficSigns.textSize
        },
        paint: {
          'text-color': layerConfig.trafficSigns.textColor
        }
      });
      
      mapInstance.loadImage('https://cdn-icons-png.flaticon.com/512/3405/3405978.png', (error, image) => {
        if (error) console.error('Error loading icon:', error);
        else mapInstance.addImage('traffic-sign', image);
      });
      
      // OSM data source and layers
      mapInstance.addSource('osm-data', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      mapInstance.addLayer({
        id: 'osm-points-layer',
        type: 'circle',
        source: 'osm-data',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': layerConfig.osmPoints.circleRadius,
          'circle-color': layerConfig.osmPoints.circleColor,
          'circle-opacity': layerConfig.osmPoints.circleOpacity
        }
      });
      mapInstance.addLayer({
        id: 'osm-lines-layer',
        type: 'line',
        source: 'osm-data',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': layerConfig.osmLines.lineColor,
          'line-width': layerConfig.osmLines.lineWidth,
          'line-opacity': layerConfig.osmLines.lineOpacity
        }
      });
    } catch (error) {
      console.error('Error initializing map layers:', error);
    }
  }, [layerConfig]);
  
  const showPopup = useCallback((e) => {
    if (!map) return;
    
    const features = e.features;
    if (features.length) {
      const feature = features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      const popupContent = feature.layer.id === 'traffic-signs-layer'
        ? `<h3>Traffic Sign</h3><p>${props.name || 'Unknown'}</p>`
        : `<h3>OSM Node</h3><pre>${JSON.stringify(props, null, 2)}</pre>`;
      
      new mapboxgl.Popup()
        .setLngLat(coords)
        .setHTML(popupContent)
        .addTo(map);
    }
  }, [map]);

  // Initialize map when component mounts
  useEffect(() => {
    if (mapContainer.current && !map) {
      // Set Mapbox token
      mapboxgl.accessToken = mapboxToken || 'pk.eyJ1Ijoic2FlZWRrcmEiLCJhIjoiY203OWw3NjQyMDZqYjJrcG9oZ2g4aDlidCJ9.KFDRNLhWPT8jdM7TqyhReg';
      
      // Create map instance
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-117.75075, 33.65335],
        zoom: 17,
        pitch: 45,
        bearing: 0,
        projection: 'globe'
      });
      
      // Initialize drawing controls
      const drawInstance = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'draw_polygon'
      });
      
      // Add navigation and fullscreen controls
      mapInstance.addControl(new mapboxgl.NavigationControl());
      mapInstance.addControl(new mapboxgl.FullscreenControl());
      
      // Add geocoder for location search - safer initialization
      try {
        const geocoder = new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl
        });
        mapInstance.addControl(geocoder, 'top-left');
      } catch (err) {
        console.error("Error adding geocoder:", err);
      }
      
      // Add drawing controls
      mapInstance.addControl(drawInstance);
      
      // Set state variables
      setMap(mapInstance);
      setDraw(drawInstance);
      
      // Add 3D toggle control
      add3DToggleControl(mapInstance);
      
      // Initialize map layers when map loads
      mapInstance.on('load', () => {
        initializeLayers(mapInstance);
      });
      
      // Clean up on unmount
      return () => {
        mapInstance.remove();
      };
    }
  }, [mapContainer, map, mapboxToken, add3DToggleControl, initializeLayers]);
  
  // Set up event listeners after map and draw are initialized
  useEffect(() => {
    if (map && draw) {
      // Event listeners for polygon changes
      const handlePolygonChangeWrapper = (e) => handlePolygonChange(e);
      const showPopupWrapper = (e) => showPopup(e);
      
      map.on('draw.create', handlePolygonChangeWrapper);
      map.on('draw.delete', handlePolygonChangeWrapper);
      map.on('draw.update', handlePolygonChangeWrapper);
      
      // Click handlers for popups
      map.on('click', 'traffic-signs-layer', showPopupWrapper);
      map.on('click', 'osm-points-layer', showPopupWrapper);
      
      // Clean up event listeners on unmount
      return () => {
        map.off('draw.create', handlePolygonChangeWrapper);
        map.off('draw.delete', handlePolygonChangeWrapper);
        map.off('draw.update', handlePolygonChangeWrapper);
        map.off('click', 'traffic-signs-layer', showPopupWrapper);
        map.off('click', 'osm-points-layer', showPopupWrapper);
      };
    }
  }, [map, draw, handlePolygonChange, showPopup]);
  
  // Render component
  return (
    <div className="mapbox-polygon-analyzer">
      <div ref={mapContainer} className="map-container" />
      {loading && <div className="loading">Loading...</div>}
      <div className="area-container">
        Area: <span id="area"></span> <span id="area-units">sq meters</span>
      </div>
    </div>
  );
};

export default MapboxPolygonAnalyzer; 