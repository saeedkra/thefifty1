// Test5 JavaScript file 

// Mapbox Polygon Analysis Tool

// Initialize Mapbox token (replace with your token)
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FlZWRrcmEiLCJhIjoiY203OWw3NjQyMDZqYjJrcG9oZ2g4aDlidCJ9.KFDRNLhWPT8jdM7TqyhReg';

// Global variables
let map;
let draw;
let osmFeatures = [];
let trafficSigns = [];

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
});

function initializeMap() {
    // Create new map instance
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-117.75075, 33.65335],
        zoom: 17
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
    
    // Add fullscreen control
    map.addControl(new mapboxgl.FullscreenControl());

    // Add geocoder for location search
    map.addControl(
        new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl
        }),
        'top-left'
    );

    // Add drawing controls to map
    map.addControl(draw);

    // Add event listeners for polygon drawing
    map.on('draw.create', handlePolygonChange);
    map.on('draw.delete', handlePolygonChange);
    map.on('draw.update', handlePolygonChange);

    // Initialize layers when map loads
    map.on('load', () => {
        // Add traffic signs source and layer
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
                'icon-size': 0.5,
                'text-field': '{name}',
                'text-offset': [0, 1],
                'text-size': 12
            },
            paint: {
                'text-color': '#ff0000'
            }
        });

        // Load traffic sign icon
        map.loadImage('https://cdn-icons-png.flaticon.com/512/3405/3405978.png', (error, image) => {
            if (error) console.error('Error loading icon:', error);
            else map.addImage('traffic-sign', image);
        });

        // Add OSM data source and layer
        map.addSource('osm-data', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        
        // Layer for OSM points
        map.addLayer({
            id: 'osm-points-layer',
            type: 'circle',
            source: 'osm-data',
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-radius': 4,
                'circle-color': '#0000ff',
                'circle-opacity': 0.8
            }
        });

        // Layer for OSM lines
        map.addLayer({
            id: 'osm-lines-layer',
            type: 'line',
            source: 'osm-data',
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': '#00ff00',
                'line-width': 2,
                'line-opacity': 0.8
            }
        });
    });

    // Add click handler for traffic sign details
    map.on('click', 'traffic-signs-layer', (e) => {
        const features = e.features;
        if (features.length) {
            const feature = features[0];
            const popup = new mapboxgl.Popup()
                .setLngLat(feature.geometry.coordinates)
                .setHTML(`<h3>Traffic Sign</h3><p>${feature.properties.name || 'Unknown sign'}</p>`)
                .addTo(map);
        }
    });

    // Add click handler for OSM points
    map.on('click', 'osm-points-layer', (e) => {
        const features = e.features;
        if (features.length) {
            const feature = features[0];
            const popup = new mapboxgl.Popup()
                .setLngLat(feature.geometry.coordinates)
                .setHTML(`<h3>OSM Node</h3><pre>${JSON.stringify(feature.properties, null, 2)}</pre>`)
                .addTo(map);
        }
    });
}

// Handle polygon changes (create, update, delete)
async function handlePolygonChange(e) {
    const data = draw.getAll();
    const areaElement = document.getElementById('area');
    const areaUnitsElement = document.getElementById('area-units');
    const loadingElement = document.getElementById('loading');
    
    areaUnitsElement.style.display = 'none';
    
    if (data.features.length > 0) {
        const area = turf.area(data);
        const roundedArea = Math.round(area * 100) / 100;
        areaElement.innerHTML = `<strong>${roundedArea}</strong>`;
        areaUnitsElement.style.display = 'block';
        
        const polygon = data.features[0].geometry;
        
        loadingElement.style.display = 'block';
        try {
            await Promise.all([
                fetchOSMData(polygon),
                fetchMapillarySigns(polygon)
            ]);
            zoomToFeatures();
        } catch (error) {
            console.error('Error processing data:', error);
            alert('Error loading data. Please check your API tokens and try again.');
        } finally {
            loadingElement.style.display = 'none';
        }
    } else {
        clearData();
    }
}

// Fetch OSM data for a given polygon
async function fetchOSMData(polygon) {
    if (!mapboxgl.accessToken) {
        throw new Error('Mapbox token is missing');
    }
    
    const bbox = turf.bbox(polygon);
    // Modified query to fetch all OSM elements (nodes, ways, relations)
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

// Process OSM data and filter by polygon
function processOSMData(osmData, polygon) {
    const nodesById = {};
    osmData.elements
        .filter(el => el.type === 'node')
        .forEach(node => {
            nodesById[node.id] = [node.lon, node.lat];
        });
    
    const features = [];

    // Process nodes
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

    // Process ways
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

    // Note: Relations could be added here if needed, but they require more complex processing
    // For simplicity, this example includes only nodes and ways

    return features;
}

// Fetch Mapillary traffic signs
async function fetchMapillarySigns(polygon) {
    const mapillaryToken = 'MLY|9147535095358625|2f75f91c82cc4ddab998298871c28579';
    if (!mapillaryToken) {
        throw new Error('Mapillary token is missing');
    }
    
    const bbox = turf.bbox(polygon);
    const response = await fetch(
        `https://graph.mapillary.com/images?access_token=${mapillaryToken}&bbox=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}&fields=id,geometry,detections`
    );
    const data = await response.json();
    
    if (!data?.data) {
        console.error('Invalid Mapillary response:', data);
        return;
    }
    
    trafficSigns = data.data
        .filter(img => img.geometry)
        .map(img => {
            // Get the first detection value or default to 'Unknown'
            const detection = img.detections && img.detections.length > 0 
                ? img.detections[0].value 
                : 'Unknown';
            // Format the name by replacing double hyphens with colon and adding parentheses
            const signName = detection
                ? `${detection.replace('--', ': ').replace(/^(\w+)/, '$1')} (${img.id.slice(0, 2)})`
                : 'Unknown sign';
            
            return {
                type: 'Feature',
                geometry: img.geometry,
                properties: {
                    id: img.id,
                    name: signName // Store formatted name for display
                }
            };
        })
        .filter(sign => turf.booleanPointInPolygon(sign.geometry.coordinates, polygon));
    
    map.getSource('traffic-signs').setData({
        type: 'FeatureCollection',
        features: trafficSigns
    });
}

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
        map.fitBounds(bounds, { padding: 50 });
    }
}

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
    document.getElementById('area').innerHTML = '';
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