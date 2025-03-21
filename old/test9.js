// Test5 JavaScript file 

// Enhanced Mapbox Polygon Analysis Tool

// Mapbox token (replace with your own)
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FlZWRrcmEiLCJhIjoiY203OWw3NjQyMDZqYjJrcG9oZ2g4aDlidCJ9.KFDRNLhWPT8jdM7TqyhReg';

// Global variables
let map;
let draw;
let osmFeatures = [];
let trafficSigns = [];
let is3DMode = false;

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
});

function initializeMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12', // Updated style for richer visuals
        center: [-117.75075, 33.65335],
        zoom: 17,
        pitch: 45, // Add 3D tilt
        bearing: 0, // Initial rotation
        projection: 'globe' // Add this line to set the globe projection
    });

    // Initialize drawing controls
    draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            polygon: true,
            trash: true
        },
        defaultMode: 'draw_polygon'
    });

    // Add navigation and fullscreen controls
    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(new mapboxgl.FullscreenControl());

    // Add geocoder for location search
    map.addControl(
        new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl
        }),
        'top-left'
    );

    // Add drawing controls
    map.addControl(draw);

    // Add custom toggle for 3D mode
    add3DToggleControl();

    // Event listeners
    map.on('draw.create', handlePolygonChange);
    map.on('draw.delete', handlePolygonChange);
    map.on('draw.update', handlePolygonChange);

    // Initialize layers
    map.on('load', () => {
        // Add 3D buildings layer
        map.addLayer({
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
        map.addSource('traffic-signs', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'traffic-signs-layer',
            type: 'symbol',
            source: 'traffic-signs',
            layout: {
                'icon-image': 'traffic-sign',
                'icon-size': 0.7,
                'text-field': '{name}',
                'text-offset': [0, 1.5],
                'text-size': 14
            },
            paint: {
                'text-color': '#ff4444'
            }
        });

        map.loadImage('https://cdn-icons-png.flaticon.com/512/3405/3405978.png', (error, image) => {
            if (error) console.error('Error loading icon:', error);
            else map.addImage('traffic-sign', image);
        });

        // OSM data source and layers
        map.addSource('osm-data', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'osm-points-layer',
            type: 'circle',
            source: 'osm-data',
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-radius': 5,
                'circle-color': '#007cbf',
                'circle-opacity': 0.9
            }
        });
        map.addLayer({
            id: 'osm-lines-layer',
            type: 'line',
            source: 'osm-data',
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': '#00cc00',
                'line-width': 3,
                'line-opacity': 0.9
            }
        });
    });

    // Click handlers for popups
    map.on('click', 'traffic-signs-layer', showPopup);
    map.on('click', 'osm-points-layer', showPopup);
}

// Add 3D toggle control
function add3DToggleControl() {
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Toggle 3D';
    toggleButton.className = 'mapboxgl-ctrl-icon';
    toggleButton.style.padding = '5px';
    toggleButton.onclick = () => {
        is3DMode = !is3DMode;
        map.easeTo({
            pitch: is3DMode ? 60 : 0,
            bearing: is3DMode ? 45 : 0,
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
    map.addControl(customControl, 'top-right');
}

// Handle polygon changes
async function handlePolygonChange(e) {
    const data = draw.getAll();
    const loadingElement = document.getElementById('loading');

    loadingElement.style.display = 'block';
    try {
        await Promise.all([
            fetchOSMData(data.features[0].geometry),
            // fetchMapillarySigns(data.features[0].geometry)
        ]);
        zoomToFeatures();
    } catch (error) {
        console.error('Error processing data:', error);
        alert('Error loading data. Please try again.');
    } finally {
        loadingElement.style.display = 'none';
    }
}

// Fetch OSM Data (unchanged from your code)
async function fetchOSMData(polygon) {
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
    osmFeatures = processOSMData(osmData, polygon);
    map.getSource('osm-data').setData({
        type: 'FeatureCollection',
        features: osmFeatures
    });
}

// Process OSM Data (unchanged from your code)
function processOSMData(osmData, polygon) {
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
}

// Fetch Mapillary Signs (unchanged from your code)
async function fetchMapillarySigns(polygon) {
    const mapillaryToken = 'MLY|9147535095358625|2f75f91c82cc4ddab998298871c28579';
    const bbox = turf.bbox(polygon);
    const response = await fetch(
        `https://graph.mapillary.com/images?access_token=${mapillaryToken}&bbox=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}&fields=id,geometry,detections`
    );
    const data = await response.json();

    if (!data?.data) return;

    trafficSigns = data.data
        .filter(img => img.geometry)
        .map(img => {
            const detection = img.detections && img.detections.length > 0 ? img.detections[0].value : 'Unknown';
            const signName = detection ? `${detection.replace('--', ': ')} (${img.id.slice(0, 2)})` : 'Unknown sign';
            return {
                type: 'Feature',
                geometry: img.geometry,
                properties: {
                    id: img.id,
                    name: signName
                }
            };
        })
        .filter(sign => turf.booleanPointInPolygon(sign.geometry.coordinates, polygon));

    map.getSource('traffic-signs').setData({
        type: 'FeatureCollection',
        features: trafficSigns
    });
}

// Show popup for clicked features
function showPopup(e) {
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
}

// Zoom to features
function zoomToFeatures() {
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
}

// Clear data
function clearData() {
    osmFeatures = [];
    trafficSigns = [];
    ['osm-data', 'traffic-signs'].forEach(source => {
        if (map.getSource(source)) {
            map.getSource(source).setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    });
}

// Configuration object for layer styling
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