// initialize mapbox map
mapboxgl.accessToken = 'pk.eyJ1Ijoidm0xMTk2MiIsImEiOiJjbTFqbDh4OHcwcGQ2MmxvZHR2OXUyam10In0.TLBFscEgQpdhpSFtM62UHw';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/mapbox/light-v11', // style URL
    zoom: 14, // starting zoom
    center: [-122.315, 47.658] // starting center
});

async function geojsonFetch() {

  // fetch UW boundary
  let boundaryResponse = await fetch('assets/uw_boundary.geojson')
  let uwBoundary = await boundaryResponse.json();

  // fetch spd crime data
  let response = await fetch('assets/clean_spd_crime_df.geojson');
  let places = await response.json();

  // fetch OSM campus data
  let osmResponse = await fetch('assets/uw_osm.geojson');
  let osmData = await osmResponse.json();


  map.on('load', function loadingData() {

    // add uw boundary first
    map.addSource('uw-campus', {
      type: 'geojson',
      data: uwBoundary
    })

    // boundary layer
    map.addLayer({
      'id': 'uw-campus-layer',
      'type': 'line',
      'source': 'uw-campus',
      'paint': {
          'line-color': '#85754d', // Husky Gold
          'line-width': 3
      }
    });

    // add osm campus
    map.addSource('osm-campus', {
      type: 'geojson',
      data: osmData
    })

    // campus layer
    map.addLayer({
      'id': 'osm-campus-layer',
      'type': 'fill',
      'source': 'osm-campus',
      'paint': {
          'fill-color': '#e8e3d3'
      }
    });


    // hover/click for osm data here

    // add spd crime data
    map.addSource('places', {
      type: 'geojson',
      data: places
    });

    map.addLayer({
        'id': 'places-layer',
        'type': 'circle',
        'source': 'places',
        'paint': {
              'circle-radius': 6,
              'circle-color': [
                  'match',
                  ['get', 'Offense Parent Group'],
                  'MOTOR VEHICLE THEFT', 'rgb(42, 0, 76)',
                  'LARCENY-THEFT', 'rgb(69, 9, 132)',
                  'DESTRUCTION/DAMAGE/VANDALISM OF PROPERTY', 'rgb(106, 55, 145)',
                  'FRAUD OFFENSES','rgb(134, 103, 154)',
                  'rgb(187, 150, 246)' // default color
                ],
        }
    });

    initLegend();
    createSPDLegend();
    document.getElementById('legend').style.display = 'block'; // Display the legend

      // pop-up layers
      map.on('click', 'places-layer', (e) => {
        if (e.features.length > 0) {
          const feature = e.features[0];
          const coordinates = feature.geometry.coordinates.slice();

          let dateTimeStr = feature.properties['Report DateTime'] || 'N/A';

          // spd pop-up content properties
          const popupContent = `
              <h3 style="margin-bottom: 10px; color: #333;">Crime Report Details</h3>
              <table style="width: 100%; border-collapse: separate; border-spacing: 0 5px;">
                <tr>
                  <td><strong>Date/Time:</strong></td>
                  <td>${feature.properties['Report DateTime'] || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Offense Group:</strong></td>
                  <td>${feature.properties['Offense Parent Group'] || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Specific Offense:</strong></td>
                  <td>${feature.properties['Offense'] || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Neighborhood:</strong></td>
                  <td>${feature.properties['MCPP'] || 'N/A'}</td>
                </tr>
              </table>
            </div>
          `;

          new mapboxgl.Popup({ offset: [0, -7] })
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
        }
      });

    // cursor change on hover for crime data
    map.on('mouseenter', 'places-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'places-layer', () => {
      map.getCanvas().style.cursor = '';
    });

    // filter to only show points within UW boundary
    map.setFilter('places-layer', ['within', uwBoundary]);

    // fetch live 911 data (inside geojsonFetch)
    fetch911Data();
    setInterval(fetch911Data, 300000); // refresh every 5 minutes

  })

}

const APP_TOKEN = "j8xvpt9TilXEfJd9DzbQI7Xyg";

// Function to fetch high threat 911 emergency data
async function fetch911Data() {
  console.log("Fetching latest 911 data...");

  const apiURL = `https://data.seattle.gov/resource/33kz-ixgy.geojson?$query=
                  SELECT%20*%20
                  WHERE%20final_call_type%20LIKE%20%27%25ASSAULT%25%27%20
                  OR%20final_call_type%20LIKE%20%27%25SHOOTING%25%27%20
                  OR%20final_call_type%20LIKE%20%27%25ROBBERY%25%27%20
                  OR%20final_call_type%20LIKE%20%27%25FIRE%25%27%20
                  OR%20final_call_type%20LIKE%20%27%25BOMB%25%27%20
                  ORDER%20BY%20cad_event_original_time_queued%20DESC%20
                  LIMIT%201000%20&$$app_token=${APP_TOKEN}`;

  let response = await fetch(apiURL);
  let geojson = await response.json();

  // Filter out features with null geometry and reconstruct missing ones
  geojson.features = geojson.features
  .filter(feature => feature.properties.dispatch_longitude && feature.properties.dispatch_latitude)
  .map(feature => ({
    ...feature,
    geometry: {
      type: "Point",
      coordinates: [
        parseFloat(feature.properties.dispatch_longitude),
        parseFloat(feature.properties.dispatch_latitude)
      ]
    }
  }));

  let uniquePoints = {};
  geojson.features = geojson.features.filter(feature => {
    let key = `${feature.geometry.coordinates[0]},${feature.geometry.coordinates[1]}`;
    if (uniquePoints[key]) {
      return false; // Skip duplicate points
    }
    uniquePoints[key] = true;
    return true; // Keep unique points
  });


  // create 35m buffers around each point using Turf.js
  let bufferFeatures = geojson.features.map(feature =>
    turf.buffer(feature, 35, { units: "meters" }) // 35m
  );

  // Merge all buffers into a single feature collection
  let bufferGeoJSON = turf.featureCollection(bufferFeatures);

  // Add buffer layer first (to keep it below points)
  if (map.getSource("911-buffers")) {
    map.getSource("911-buffers").setData(bufferGeoJSON);
  } else {
    map.addSource("911-buffers", { type: "geojson", data: bufferGeoJSON });

    map.addLayer({
      id: "911-buffer-layer",
      type: "fill",
      source: "911-buffers",
      layout: {},
      paint: {
        "fill-color": "#FFCC00", // Warning Yellow for Danger Zones
        "fill-opacity": 0.5, // Lower opacity to make points clickable
        "fill-outline-color": "#FF9900" // Orange outline for visibility
      }
    });
  }


  // Add 911 call points to the map
  if (map.getSource("911-data")) {
    map.getSource("911-data").setData(geojson);
  } else {
    map.addSource("911-data", { type: "geojson", data: geojson });

    map.addLayer({
      id: "911-points",
      type: "circle",
      source: "911-data",
      paint: {
        "circle-radius": 2,
        "circle-color": "#FF4500", // Orange-Red for High-Risk Calls
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#8B0000" // Dark Red Outline
      }
    });

    create911Legend();
  }

      // similar function for 911 data
      map.on('click', '911-points', (e) => {
        if (e.features.length > 0) {
          const feature = e.features[0];
          const coordinates = feature.geometry.coordinates.slice();

          // 911 popup content properties
          const popupContent = `
              <h3 style="margin-bottom: 10px; color: #333;">911 Report Details</h3>
              <table style="width: 100%; border-collapse: separate; border-spacing: 0 5px;">
                <tr>
                  <td><strong>Date/Time:</strong></td>
                  <td>${feature.properties['cad_event_original_time_queued'] || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Incident Type:</strong></td>
                  <td>${feature.properties['final_call_type'] || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Dispatch Neighborhood:</strong></td>
                  <td>${feature.properties['dispatch_neighborhood'] || 'N/A'}</td>
                </tr>
              </table>
            </div>
          `;

          new mapboxgl.Popup({ offset: [0, -7] })
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
        }
      });

      // cursor change on hover for 911 data
      map.on('mouseenter', '911-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', '911-points', () => {
        map.getCanvas().style.cursor = '';
      });

}

let startMarker, endMarker;
let navigationActive = false;
let dangerZones = null; // Store 911 buffer danger zones

// Ensure dangerZones is correctly populated from the 911 buffers
function updateDangerZones() {
    const bufferSource = map.getSource("911-buffers");
    if (bufferSource) {
        dangerZones = turf.featureCollection(bufferSource._data.features);
    }
}

// 🔹 Function to Get Directions & Display Warning if Route Passes Danger Zones
async function getRoute(start, end) {
    updateDangerZones(); // Ensure latest buffer zones

    const directionsURL = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&steps=true&access_token=${mapboxgl.accessToken}`;

    let response = await fetch(directionsURL);
    let data = await response.json();
    let route = data.routes[0].geometry;
    let steps = data.routes[0].legs[0].steps;

    let routeLine = turf.lineString(route.coordinates);

    // **Check if Route Intersects Any Danger Zones**
    let intersects = false;
    if (dangerZones) {
        for (let buffer of dangerZones.features) {
            if (turf.booleanIntersects(routeLine, buffer)) {
                intersects = true;
                break;
            }
        }
    }

    // 🔹 If danger zone detected, show a warning alert
    if (intersects) {
        alert("⚠ Caution: This route goes through a high-risk area. Stay aware of your surroundings and consider an alternate route if possible.");
    }

    // If source exists, update it; otherwise, create new
    if (map.getSource("route")) {
        map.getSource("route").setData({ type: "Feature", geometry: route });
    } else {
        map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: route } });
        map.addLayer({
            id: "route-layer",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": intersects ? "#FF4500" : "#007AFF", "line-width": 4 }
        });
    }

    // 🔹 Display Turn Instructions
    const instructions = document.getElementById('instructions');
    instructions.style.display = "block"; // Show instructions panel
    let tripInstructions = `<p><strong>Trip duration: ${Math.floor(data.routes[0].duration / 60)} min 🚶</strong></p><ol>`;

    for (const step of steps) {
        tripInstructions += `<li>${step.maneuver.instruction}</li>`;
    }

    instructions.innerHTML = tripInstructions + "</ol>";
}

// 🔹 Click Event to Set Start & End Points
map.on("click", (e) => {
    if (!navigationActive) return; // Prevent setting points unless navigation is active

    if (!startMarker) {
        startMarker = new mapboxgl.Marker({ color: "green" }).setLngLat(e.lngLat).addTo(map);
    } else if (!endMarker) {
        endMarker = new mapboxgl.Marker({ color: "red" }).setLngLat(e.lngLat).addTo(map);
        getRoute(startMarker.getLngLat().toArray(), endMarker.getLngLat().toArray());
    } else {
        resetNavigation();
    }
});

// 🔹 Reset Navigation Function
function resetNavigation() {
    if (startMarker) startMarker.remove();
    if (endMarker) endMarker.remove();
    startMarker = endMarker = null;
    navigationActive = false;

    document.getElementById("instructions").style.display = "none"; // Hide instructions panel

    if (map.getSource("route")) {
        map.removeLayer("route-layer");
        map.removeSource("route");
    }
}


// initialize the single legend container
function initLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '<div class="legend-title">Map Legend</div>';
  legend.style.display = 'block';
}

// function to create SPD crime legend
function createSPDLegend() {
  const legend = document.getElementById('legend');

  // create SPD crime legend content
  const spdLegendContent = `
    <div class="legend-section">
      <h3>SPD Crime Data</h3>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(42, 0, 76);"></span><span>Motor Vehicle Theft</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(69, 9, 132);"></span><span>Larceny-Theft</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(106, 55, 145);"></span><span>Destruction/Damage/Vandalism</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(134, 103, 154);"></span><span>Fraud Offenses</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(187, 150, 246);"></span><span>Other</span></div>
    </div>
  `;

  legend.innerHTML += spdLegendContent;
}

function create911Legend() {
  const legend = document.getElementById('legend');

  // Double circle style
  const calls911LegendContent = `
    <div class="legend-section">
      <h3>Live 911 Calls</h3>
      <div class="legend-item" style="height: 22px;">
        <div style="position: relative; width: 22px; height: 22px; margin-right: 10px;">
          <span style="
            position: absolute;
            width: 22px;
            height: 22px;
            background-color: #FFCC00;
            opacity: 0.5;
            border-radius: 50%;
          "></span>
          <span style="
            position: absolute;
            top: 8px;
            left: 8px;
            width: 6px;
            height: 6px;
            background-color: #FF0000;
            border-radius: 50%;
          "></span>
        </div>
        <span>Emergency Calls</span>
      </div>
    </div>
  `;

  // append the content to the legend
  legend.innerHTML += calls911LegendContent;
}


// Toggle Visibility of Layers
document.getElementById('toggle-911').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('911-points', 'visibility') || 'visible';
  let newVisibility = visibility === 'visible' ? 'none' : 'visible';

  // Toggle both the 911 call points and the buffer layer
  map.setLayoutProperty('911-points', 'visibility', newVisibility);
  map.setLayoutProperty('911-buffer-layer', 'visibility', newVisibility);
  map.setLayoutProperty('911-buffer-outline', 'visibility', newVisibility);

  toggleFilter(this, visibility);
});

document.getElementById('toggle-spd').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('places-layer', 'visibility') || 'visible';
  map.setLayoutProperty('places-layer', 'visibility', visibility === 'visible' ? 'none' : 'visible');
  toggleFilter(this, visibility);
});

// 🔹 Toggle Navigation on "Navigate Me" Click
document.getElementById("navigateMe").addEventListener("click", () => {
  resetNavigation();
  navigationActive = true;
  alert("Click on the map to set start and end points.");
});


geojsonFetch();



function openNav() {
  document.getElementById("sidebar").style.width = "400px"; 
  document.getElementById("main").classList.remove("sidebar-closed"); 

  // Added: Resize the map when the sidebar opens
  setTimeout(() => {
      map.resize();
  }, 300);
}

function closeNav() {
  document.getElementById("sidebar").style.width = "0"; 
  document.getElementById("main").classList.add("sidebar-closed"); 

  // Resize the map when the sidebar closes
  setTimeout(() => {
      map.resize();
  }, 300);
}


function toggleFilter(button, visibility) {
  const icon = button.querySelector('i');
  if (visibility === 'visible') {
    icon.classList.remove('fa-toggle-on');
    icon.classList.add('fa-toggle-off');
  } else {
    icon.classList.remove('fa-toggle-off');
    icon.classList.add('fa-toggle-on');
  }
}