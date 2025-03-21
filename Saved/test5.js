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
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        map.addLayer({
            id: 'traffic-signs-layer',
            type: 'symbol',
            source: 'traffic-signs',
            layout: {
                'icon-image': 'traffic-sign',
                'icon-size': 0.5
            }
        });

        // Load traffic sign icon
        map.loadImage('https://cdn-icons-png.flaticon.com/512/3405/3405978.png', (error, image) => {
            if (error) throw error;
            map.addImage('traffic-sign', image);
        });

        // Add OSM data source and layer
        map.addSource('osm-data', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        
        map.addLayer({
            id: 'osm-layer',
            type: 'line',
            source: 'osm-data',
            paint: {
                'line-color': '#00ff00',
                'line-width': 2
            }
        });
    });
}

// Handle polygon changes (create, update, delete)
async function handlePolygonChange(e) {
    const data = draw.getAll();
    const areaElement = document.getElementById('area');
    const areaUnitsElement = document.getElementById('area-units');
    
    // Hide area units initially
    areaUnitsElement.style.display = 'none';
    
    if (data.features.length > 0) {
        const area = turf.area(data);
        const roundedArea = Math.round(area * 100) / 100;
        
        // Update area display
        areaElement.innerHTML = `<strong>${roundedArea}</strong>`;
        areaUnitsElement.style.display = 'block';
        
        const polygon = data.features[0].geometry;
        
        // Fetch OSM data
        await fetchOSMData(polygon);
        
        // Fetch Mapillary traffic signs
        await fetchMapillarySigns(polygon);
    } else {
        // Clear area display
        areaElement.innerHTML = '';
        
        // Clear data
        osmFeatures = [];
        trafficSigns = [];
        
        // Update layers
        if (map.getSource('osm-data')) {
            map.getSource('osm-data').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        
        if (map.getSource('traffic-signs')) {
            map.getSource('traffic-signs').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        
        // Show alert if not a delete event
        if (e.type !== 'draw.delete') {
            alert('Click the map to draw a polygon.');
        }
    }
}

// Fetch OSM data for a given polygon
async function fetchOSMData(polygon) {
    const bbox = turf.bbox(polygon);
    const query = `
        [out:json];
        (
            way(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
            relation(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        );
        out body;
        >;
        out skel qt;
    `;
    
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const osmData = await response.json();
        
        // Process OSM data
        const features = processOSMData(osmData, polygon);
        osmFeatures = features;
        
        // Update OSM layer
        if (map.getSource('osm-data')) {
            map.getSource('osm-data').setData({
                type: 'FeatureCollection',
                features: features
            });
        }
    } catch (error) {
        console.error('Error fetching OSM data:', error);
    }
}

// Process OSM data and filter by polygon
function processOSMData(osmData, polygon) {
    // Create a nodes lookup object
    const nodesById = {};
    osmData.elements
        .filter(el => el.type === 'node')
        .forEach(node => {
            nodesById[node.id] = [node.lon, node.lat];
        });
    
    // Process ways into GeoJSON features
    return osmData.elements
        .filter(el => el.type === 'way')
        .map(way => {
            // Get coordinates for all nodes in the way
            const coordinates = way.nodes
                .map(nodeId => nodesById[nodeId])
                .filter(coord => coord !== undefined);
            
            // Skip ways with insufficient nodes
            if (coordinates.length < 2) return null;
            
            // Create feature
            return {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                },
                properties: way.tags || {}
            };
        })
        .filter(feature => feature !== null)
        .filter(feature => {
            try {
                // Check if feature intersects with polygon
                return turf.booleanIntersects(polygon, feature);
            } catch (e) {
                return false;
            }
        });
}

// Fetch Mapillary traffic signs
async function fetchMapillarySigns(polygon) {
    const bbox = turf.bbox(polygon);
    
    // Mapillary token (replace with your token)
    const mapillaryToken = 'MLY|9147535095358625|2f75f91c82cc4ddab998298871c28579';
    
    try {
        const response = await fetch(
            `https://graph.mapillary.com/images?access_token=${mapillaryToken}&bbox=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}&fields=id,geometry,detections`
        );
        const data = await response.json();
        
        // Process Mapillary data
        if (!data || !data.data) {
            console.error('Invalid Mapillary response:', data);
            return;
        }
        
        // Filter and process signs
        const signs = data.data
            .filter(img => img.detections && img.detections.length > 0)
            .filter(img => img.detections.some(d => d.value && d.value.startsWith('regulatory--')))
            .map(img => ({
                type: 'Feature',
                geometry: img.geometry,
                properties: {
                    id: img.id,
                    detections: img.detections
                }
            }))
            .filter(sign => {
                try {
                    // Check if sign is within polygon
                    return turf.booleanPointInPolygon(sign.geometry.coordinates, polygon);
                } catch (e) {
                    return false;
                }
            });
            
        trafficSigns = signs;
        
        // Update traffic signs layer
        if (map.getSource('traffic-signs')) {
            map.getSource('traffic-signs').setData({
                type: 'FeatureCollection',
                features: signs
            });
        }
    } catch (error) {
        console.error('Error fetching Mapillary data:', error);
    }
} 