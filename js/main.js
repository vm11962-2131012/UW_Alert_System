// initialize mapbox map
mapboxgl.accessToken = 'pk.eyJ1Ijoidm0xMTk2MiIsImEiOiJjbTFqbDh4OHcwcGQ2MmxvZHR2OXUyam10In0.TLBFscEgQpdhpSFtM62UHw';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/mapbox/light-v11', // style URL
    zoom: 13.5, // starting zoom
    center: [-122.32248, 47.65813] // starting center
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

    // add osm campus
    map.addSource('osm-campus', {
      type: 'geojson',
      data: osmData
    })

    // get the first label layer id to place the campus layer below it
    const firstLabelLayerId = map.getStyle().layers.find(
      layer => layer.type === 'symbol' && layer.layout['text-field']
    ).id;

    // campus layer, add in the first label layer to keep osm below mapbox labels
    map.addLayer({
      'id': 'osm-campus-layer',
      'type': 'fill',
      'source': 'osm-campus',
      'paint': {
          'fill-color': '#e8e3d3'
      }
    }, firstLabelLayerId);

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
                  'FRAUD OFFENSES','rgb(42, 0, 76)',
                  'MOTOR VEHICLE THEFT', 'rgb(69, 9, 132)',
                  'LARCENY-THEFT', 'rgb(106, 55, 145)',
                  'DESTRUCTION/DAMAGE/VANDALISM OF PROPERTY', 'rgb(134, 103, 154)',
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

const FIRE_911_API = `https://data.seattle.gov/resource/kzjm-xkqj.geojson?$query=
                  SELECT%20*%20
                  WHERE%20(
                    UPPER(type)%20LIKE%20%27%25FIRE%25%27%20
                    OR%20UPPER(type)%20LIKE%20%27%25VIOLENCE%25%27%20
                    OR%20UPPER(type)%20LIKE%20%27%25VEHICLE%25%27
                    OR%20UPPER(type)%20LIKE%20%27%25MVI%25%27
                    OR%20UPPER(type)%20LIKE%20%27%25GAS%20LEAK%25%27
                  )
                  AND%20(
                    UPPER(type)%20NOT%20LIKE%20%27%25AUTO%20FIRE%20ALARM%25%27
                    AND%20UPPER(type)%20NOT%20LIKE%20%27%25AUTOMATIC%20FIRE%20ALARM%25%27
                    AND%20UPPER(type)%20NOT%20LIKE%20%27%25FIRE%20ALARM%25%27
                    AND%20UPPER(type)%20NOT%20LIKE%20%27%25ALARM%25%27
                  )
                  ORDER%20BY%20datetime%20DESC%20
                  LIMIT%201000%20&$$app_token=${APP_TOKEN}`;




async function fetch911Data() {
  console.log("Fetching latest 911 data...");

  let response = await fetch(FIRE_911_API);
  let geojson = await response.json();

  console.log("Received 911 data:", geojson);

  if (!geojson.features || geojson.features.length === 0) {
    console.error("No features found in 911 data!");
    return;
  }

  // Filter out features with null geometry
  geojson.features = geojson.features
    .filter(feature => feature.geometry && feature.geometry.coordinates)
    .map(feature => ({
      ...feature,
      geometry: {
        type: "Point",
        coordinates: feature.geometry.coordinates
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

  // Create 35m buffers around each point using Turf.js
  let bufferFeatures = geojson.features.map(feature =>
    turf.buffer(feature, 35, { units: "meters" }) // 35m buffer
  );

  // Merge all buffers into a single feature collection
  let bufferGeoJSON = turf.featureCollection(bufferFeatures);

  // Update or add buffer source
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
        "fill-opacity": 0.30,
        "fill-outline-color": "#FF9900" // Orange outline for visibility
      }
    });
  }

  // Update or add the 911 call points to the map
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
        "circle-color": "#FF4500", // Orange-Red for Fire Calls
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#8B0000"
      }
    });

    console.log("✅ 911 data added to the map.");

    create911Legend();
  }

  // Add popups for 911 incidents
  map.on("click", "911-points", (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();

      // Create popup content
      const popupContent = `
          <h3 style="margin-bottom: 10px; color: #333;">911 Report Details</h3>
          <table style="width: 100%; border-collapse: separate; border-spacing: 0 5px;">
            <tr>
              <td><strong>Date/Time:</strong></td>
              <td>${feature.properties.datetime || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Incident Type:</strong></td>
              <td>${feature.properties.type || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Address:</strong></td>
              <td>${feature.properties.address || 'N/A'}</td>
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

  // Change cursor on hover for 911 data
  map.on("mouseenter", "911-points", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "911-points", () => {
    map.getCanvas().style.cursor = "";
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
    let tripInstructions = `<p style="color: white; font-weight: bold;"><strong>Trip duration: ${Math.floor(data.routes[0].duration / 60)} min 🚶</strong></p><ol>`;

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
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(42, 0, 76);"></span><span>Fraud Offenses</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(69, 9, 132);"></span><span>Motor Vehicle Theft</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(106, 55, 145);"></span><span>Larceny-Theft</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(142, 107, 164);"></span><span>Destruction / Damage <br>/ Vandalism</span></div>
      <div class="legend-item"><span class="legend-key" style="background-color:rgb(187, 150, 246);"></span><span>Other</span></div>
    </div>
  `;

  legend.innerHTML += spdLegendContent;
}

// function to create 911 calls legend
function create911Legend() {
  const legend = document.getElementById('legend');

  // create 911 calls legend content
  const calls911LegendContent = `
    <div class="legend-section">
      <h3>Live 911 Calls</h3>
      <div class="legend-item">
        <span class="legend-key emergency-call" style="background-color:#FF4500;"></span>
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


// tracks visibility of sidebar - automatically loads with map
let sidebarState = 'open';

// Wait for the page to fully load before opening sidebar
window.addEventListener('load', function() {
    setTimeout(function() {
        if (window.innerWidth > 768) {
            openPanel();
            sidebarState = 'open';
        }
    }, 300); // Small delay to ensure everything is loaded
});

// function for sidebar toggle buttons to open and close it
function togglePanel() {
  let screenWidth = window.innerWidth;
  // opens sidebar if it was closed before
  if (sidebarState === 'closed') {
    // updates visibility depending on screen size
    sidebarState = 'open';
    if (screenWidth < 768) {
      openPanelSmall();
    } else {
      openPanel();
      // slightly moves map with sidebar for better visibility
      const currentCenter = map.getCenter();
      const offsetLongitude = currentCenter.lng - 0.01;
      const offsetLatitude = currentCenter.lat;

      map.flyTo({
        center: [offsetLongitude, offsetLatitude],
        zoom: map.getZoom(),
        speed: 0.5,
        curve: 0.75,
        easing: (t) => t
        });
    }
  } else {
    // closes sidebar if it was open before
    // updates visibility depending on screen size
    sidebarState = 'closed';
    if (screenWidth < 768) {
      closePanelSmall();
    } else {
      closePanel();
      // moves map slightly back to original placement
      const currentCenter = map.getCenter();
      const offsetLongitude = currentCenter.lng + 0.01;
      const offsetLatitude = currentCenter.lat;

      map.flyTo({
        center: [offsetLongitude, offsetLatitude],
        zoom: map.getZoom(),
        speed: 0.5,
        curve: 0.75,
        easing: (t) => t
      });
    }
  }
}

// moves sidebar and contents when window resizes, keeping sidebar visibility the same
window.addEventListener('resize', function() {
  let screenWidth = window.innerWidth;
  if (screenWidth < 768 && sidebarState === 'open') {
    openPanelSmall();
  } else if (screenWidth < 768 && sidebarState === 'closed') {
    closePanelSmall();
  } else if (screenWidth > 768 && sidebarState === 'open') {
    openPanel();
  } else if (screenWidth > 768 && sidebarState === 'closed') {
    closePanel();
  }
});

// opens sidebar and moves content
function openPanel() {
  document.getElementById("sidebar").style.width = "400px";
  document.getElementById("legend").style.marginLeft = "0px";
  document.getElementById("toggleButton").style.display = "none";
}

// closes sidebar and moves content
function closePanel() {
  document.getElementById("sidebar").style.width = "0px";
  document.getElementById("legend").style.marginLeft = "-400px";
  document.getElementById("toggleButton").style.display = "block";
}

// opens sidebar/moves content on small screens
function openPanelSmall() {
  let screenWidth = window.innerWidth;
  let sidebar = document.getElementById("sidebar");
  let legend = document.getElementById("legend");
  let toggleButton = document.getElementById("toggleButton");
  if (screenWidth <= 480) {
    sidebar.style.width = "175px";
    legend.style.marginLeft = "-265px";
    toggleButton.style.display = "none";
  } else {
    sidebar.style.width = "250px";
    legend.style.marginLeft = "-175px";
    toggleButton.style.display = "none";
  }
}

// closes sidebar/moves content on small screens
function closePanelSmall() {
  let screenWidth = window.innerWidth;
  let sidebar = document.getElementById("sidebar");
  let legend = document.getElementById("legend");
  let toggleButton = document.getElementById("toggleButton");
  if (screenWidth <= 480) {
    sidebar.style.width = "0px";
    legend.style.marginLeft = "-440px";
    toggleButton.style.display = "block";
  } else {
    sidebar.style.width = "0px";
    legend.style.marginLeft = "-425px";
    toggleButton.style.display = "block";
  }
}

// changes icon of filter toggle buttons when clicked
function toggleFilter(button) {
  // Get the current button if not provided directly
  if (!button) button = this;

  // Get visibility from map if available, or toggle based on current class
  let visibility;
  const icon = button.querySelector('i');

  if (icon.classList.contains('fa-toggle-on')) {
      icon.classList.remove('fa-toggle-on');
      icon.classList.add('fa-toggle-off');
      visibility = 'visible';
  } else {
      icon.classList.remove('fa-toggle-off');
      icon.classList.add('fa-toggle-on');
      visibility = 'none';
  }

  return visibility;
}

// Wait for the DOM to be fully loaded before adding event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Get the element with the class "icon"
  let icon = document.getElementsByClassName("icon")[0];

  // Add an event listener for the 'click' event on the icon element
  if (icon) {
      icon.addEventListener('click', responsive_control);
  } else {
      console.error("Navigation icon not found!");
  }
});

let icon = document.getElementsByClassName("icon")[0];

icon.addEventListener('click', responsive_control);

function responsive_control() {
  let x = document.getElementById("myTopnav");
  if (x.className === "topnav") {
    x.className += " responsive";
  } else {
    x.className = "topnav";
  }
}