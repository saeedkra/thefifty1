document.addEventListener('DOMContentLoaded', function() {
    // Initialize Mapbox
    mapboxgl.accessToken = 'pk.eyJ1Ijoic2FlZWRrcmEiLCJhIjoiY203OWw3NjQyMDZqYjJrcG9oZ2g4aDlidCJ9.KFDRNLhWPT8jdM7TqyhReg';
    const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-117.82, 33.66],
        zoom: 14
    });

    // Mapillary configuration
    const MAPILLARY_ACCESS_TOKEN = 'MLY|9147535095358625|2f75f91c82cc4ddab998298871c28579';

    // Initialize Mapbox GL Draw
    const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            polygon: true,
            trash: true
        }
    });
    
    // Add drawing controls to the map
    map.addControl(draw);

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Variables to store data
    let trafficSigns = [];
    let markers = []; // Store markers to clear them later

    // Handle drawing events
    map.on('draw.create', (e) => {
        updateArea(e);
        const drawnFeature = e.features[0];
        fetchOSMRoadData(drawnFeature.geometry.coordinates)
            .then(osmData => {
                console.log('OSM Road Data:', osmData);
                displayOSMRoadData(osmData);
            })
            .catch(error => {
                console.error('Error fetching OSM data:', error);
            });
    });

    map.on('draw.update', updateArea);
    map.on('draw.delete', updateArea);

    function updateArea(e) {
        const data = draw.getAll();
        if (data.features.length > 0) {
            // Get the drawn line
            const line = data.features[0];
            
            // Create a buffer around the line
            const buffered = turf.buffer(line, 0.01, { units: 'kilometers' }); // 10 meters buffer
            
            // Get the bounding box of the buffered line
            const bounds = getBoundingBox(buffered);
            
            // Fetch traffic signs within the buffered line
            fetchTrafficSignsAlongLine(bounds, buffered, line);
        } else {
            clearMarkers();
            updateSignCount(0);
            document.getElementById('restart-btn').disabled = true;
        }
    }

    function getBoundingBox(geometry) {
        const bbox = turf.bbox(geometry);
        return {
            minLon: bbox[0],
            minLat: bbox[1],
            maxLon: bbox[2],
            maxLat: bbox[3]
        };
    }

    async function fetchTrafficSignsAlongLine(bounds, buffer, line) {
        const bbox = `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`;
        
        try {
            // Use Mapillary API to get traffic signs within the bounding box
            const url = `https://graph.mapillary.com/map_features?access_token=${MAPILLARY_ACCESS_TOKEN}&fields=id,value,geometry,first_seen_at&bbox=${bbox}&object_type=traffic_sign`;
            
            console.log("API URL:", url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error(`API Error: ${response.status} ${response.statusText}`);
                const text = await response.text();
                console.error("Response text:", text);
                return;
            }
            
            const data = await response.json();
            
            if (data && data.data) {
                // Filter signs to only those within the buffer
                const signsNearLine = data.data.filter(sign => {
                    const point = {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: sign.geometry.coordinates
                        }
                    };
                    return turf.booleanPointInPolygon(point, buffer);
                });
                
                // Display the filtered signs
                await displayTrafficSigns(signsNearLine);
                updateSignCount(signsNearLine.length);

                // Add buffer visualization
                if (map.getSource('line-buffer')) {
                    map.removeLayer('line-buffer-fill');
                    map.removeSource('line-buffer');
                }
                
                map.addSource('line-buffer', {
                    'type': 'geojson',
                    'data': buffer
                });
                
                map.addLayer({
                    'id': 'line-buffer-fill',
                    'type': 'fill',
                    'source': 'line-buffer',
                    'paint': {
                        'fill-color': '#3887be',
                        'fill-opacity': 0.2
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching traffic signs along line:', error);
            updateSignCount(0);
        }
    }

    // Function to fetch OSM road data
    async function fetchOSMRoadData(coordinates) {
        // Create a bounding box around the line with some padding
        const bbox = calculateBoundingBox(coordinates, 0.001); // Add 100m padding
        
        // Construct the Overpass API query
        const query = `
            [out:json][timeout:25];
            (
                way["highway"]
                    (${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
                way["footway"]
                    (${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
                way["cycleway"]
                    (${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
            );
            out body;
            >;
            out skel qt;
        `;

        // Use Overpass API to fetch the data
        const overpassUrl = `https://overpass-api.de/api/interpreter`;
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return processOSMData(data);
    }

    // Function to calculate bounding box with padding
    function calculateBoundingBox(coordinates, padding) {
        const lons = coordinates.map(coord => coord[0]);
        const lats = coordinates.map(coord => coord[1]);
        
        return {
            minLon: Math.min(...lons) - padding,
            minLat: Math.min(...lats) - padding,
            maxLon: Math.max(...lons) + padding,
            maxLat: Math.max(...lats) + padding
        };
    }

    // Function to process OSM data
    function processOSMData(osmData) {
        const roads = [];
        const nodes = new Map();

        // First, store all nodes
        osmData.elements.forEach(element => {
            if (element.type === 'node') {
                nodes.set(element.id, {
                    lat: element.lat,
                    lon: element.lon
                });
            }
        });

        // Then process ways
        osmData.elements.forEach(element => {
            if (element.type === 'way' && element.tags) {
                const coordinates = element.nodes
                    .map(nodeId => {
                        const node = nodes.get(nodeId);
                        return node ? [node.lon, node.lat] : null;
                    })
                    .filter(coord => coord !== null);

                if (coordinates.length > 0) {
                    roads.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coordinates
                        },
                        properties: {
                            ...element.tags,
                            id: element.id
                        }
                    });
                }
            }
        });

        return {
            type: 'FeatureCollection',
            features: roads
        };
    }

    // Function to display OSM road data
    function displayOSMRoadData(osmData) {
        // Remove existing OSM layers if they exist
        if (map.getSource('osm-roads')) {
            map.removeLayer('osm-roads-layer');
            map.removeSource('osm-roads');
        }

        // Add the OSM data as a new source
        map.addSource('osm-roads', {
            type: 'geojson',
            data: osmData
        });

        // Add a new layer to display the OSM roads
        map.addLayer({
            id: 'osm-roads-layer',
            type: 'line',
            source: 'osm-roads',
            paint: {
                'line-color': [
                    'match',
                    ['get', 'highway'],
                    'motorway', '#ff0000',
                    'trunk', '#ff6600',
                    'primary', '#ffd700',
                    'secondary', '#ffff00',
                    'tertiary', '#ffffff',
                    'residential', '#c0c0c0',
                    'footway', '#00ff00',
                    'cycleway', '#0000ff',
                    '#808080' // default color
                ],
                'line-width': [
                    'match',
                    ['get', 'highway'],
                    'motorway', 4,
                    'trunk', 3.5,
                    'primary', 3,
                    'secondary', 2.5,
                    'tertiary', 2,
                    1.5 // default width
                ],
                'line-opacity': 0.7
            }
        });

        // Update the inventory to include road information
        updateInventoryWithRoads(osmData.features);
    }

    // Function to update inventory with road information
    function updateInventoryWithRoads(roads) {
        const inventoryContent = document.getElementById('inventory-content');
        let roadHtml = '<h3>Nearby Roads</h3>';
        roadHtml += '<table style="width:100%; border-collapse: collapse;">';
        roadHtml += '<thead><tr><th style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">Road Type</th><th style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">Name</th></tr></thead>';
        roadHtml += '<tbody>';
        
        roads.forEach(road => {
            const roadType = road.properties.highway || 'unknown';
            const roadName = road.properties.name || 'unnamed';
            
            roadHtml += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${roadType}</td>
                    <td style="padding:8px;">${roadName}</td>
                </tr>
            `;
        });
        
        roadHtml += '</tbody></table>';
        
        // Append road information to the existing inventory content
        inventoryContent.innerHTML += roadHtml;
    }

    // Initialize event listeners
    document.getElementById('inventory-btn').addEventListener('click', () => {
        const inventoryPanel = document.getElementById('inventory');
        if (inventoryPanel.style.display === 'none' || !inventoryPanel.style.display) {
            inventoryPanel.style.display = 'block';
        } else {
            inventoryPanel.style.display = 'none';
        }
    });

    document.getElementById('close-inventory').addEventListener('click', () => {
        document.getElementById('inventory').style.display = 'none';
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        // Clear the drawn lines and signs
        draw.deleteAll();
        clearMarkers();
        document.getElementById('inventory').style.display = 'none';
        document.getElementById('restart-btn').disabled = true;
        updateSignCount(0);
        
        // Remove buffer visualization
        if (map.getSource('line-buffer')) {
            map.removeLayer('line-buffer-fill');
            map.removeSource('line-buffer');
        }
        
        // Clear OSM road data
        if (map.getSource('osm-roads')) {
            map.removeLayer('osm-roads-layer');
            map.removeSource('osm-roads');
        }
    });

    // Function to clear markers
    function clearMarkers() {
        markers.forEach(marker => marker.remove());
        markers = [];
    }

    // Function to update sign count
    function updateSignCount(count) {
        document.getElementById('sign-count').textContent = `${count} signs found`;
    }

    // Function to display traffic signs
    async function displayTrafficSigns(signs) {
        clearMarkers();
        trafficSigns = signs;
        
        // Update the inventory panel
        updateInventory(signs);
        
        // Enable the restart button
        document.getElementById('restart-btn').disabled = false;
    }

    // Function to update inventory
    function updateInventory(signs) {
        const inventoryContent = document.getElementById('inventory-content');
        
        if (!signs || signs.length === 0) {
            inventoryContent.innerHTML = '<p>No traffic signs found in the selected area.</p>';
            return;
        }
        
        let html = '<table style="width:100%; border-collapse: collapse;">';
        html += '<thead><tr><th style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">Sign Type</th><th style="text-align:left; padding:8px; border-bottom:1px solid #ddd;">Location</th></tr></thead>';
        html += '<tbody>';
        
        signs.forEach(sign => {
            const coords = sign.geometry.coordinates;
            const signType = sign.value.replace(/-/g, ' ').replace(/--/g, '-');
            
            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${signType}</td>
                    <td style="padding:8px;">${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        inventoryContent.innerHTML = html;
    }
}); 