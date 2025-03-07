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

    // fetch and add Isochrone navigation layer
    loadIsochroneLayer();

  })

}

const APP_TOKEN = "j8xvpt9TilXEfJd9DzbQI7Xyg";

// Function to fetch 911 emergency data
async function fetch911Data() {
  console.log("Fetching latest 911 data...");

  const apiURL = `https://data.seattle.gov/resource/33kz-ixgy.geojson?$query=
                  SELECT *
                  ORDER BY cad_event_original_time_queued DESC
                  LIMIT 1000
                  &$$app_token=${APP_TOKEN}`


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


  // If source already exists, update it
  if (map.getSource('911-data')) {
    map.getSource('911-data').setData(geojson);
  } else {
    map.addSource('911-data', { type: 'geojson', data: geojson });

    map.addLayer({
      id: '911-points',
      type: 'circle',
      source: '911-data',
      paint: {
        'circle-radius': 3,
        'circle-color': '#FF0000',
        'circle-opacity': 0.8
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
                  <td><strong>Call Type:</strong></td>
                  <td>${feature.properties['call_type'] || 'N/A'}</td>
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

      // cursor change on hover for 911 data
      map.on('mouseenter', '911-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', '911-points', () => {
        map.getCanvas().style.cursor = '';
      });

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

// function to create 911 calls legend
function create911Legend() {
  const legend = document.getElementById('legend');

  // create 911 calls legend content
  const calls911LegendContent = `
    <div class="legend-section">
      <h3>Live 911 Calls</h3>
      <div class="legend-item"><span class="legend-key" style="background-color: #FF0000;"></span><span>Emergency Calls</span></div>
    </div>
  `;

  // append the content to the legend
  legend.innerHTML += calls911LegendContent;
}

// Toggle Visibility of Layers
document.getElementById('toggle-isochrone').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('isochrone-layer', 'visibility') || 'visible';
  map.setLayoutProperty('isochrone-layer', 'visibility', visibility === 'visible' ? 'none' : 'visible');
  toggleFilter(this, visibility);
});

document.getElementById('toggle-911').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('911-points', 'visibility') || 'visible';
  map.setLayoutProperty('911-points', 'visibility', visibility === 'visible' ? 'none' : 'visible');
  toggleFilter(this, visibility);
});

document.getElementById('toggle-spd').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('places-layer', 'visibility') || 'visible';
  map.setLayoutProperty('places-layer', 'visibility', visibility === 'visible' ? 'none' : 'visible');
  toggleFilter(this, visibility);
});


geojsonFetch();


// Add Sidebar Info Panel Open and Close Functions
function openNav() {
  // slides sidebar in
  document.getElementById("sidebar").style.width = "400px";
  // pushes main content, map, and features to the right
  document.getElementById("main").style.marginLeft = "0px";
  document.getElementById("map").style.marginLeft = "0px";
  document.getElementById("legend").style.marginLeft = "0px";
  document.getElementById("toggleButton").style.display = "none";
}

function closeNav() {
  // pushes sidebar out
  document.getElementById("sidebar").style.width = "0";
  // resets position of main content, map, and features
  document.getElementById("main").style.marginLeft = "-400px";
  document.getElementById("map").style.marginLeft = "-250px";
  document.getElementById("legend").style.marginLeft = "-400px";
  document.getElementById("toggleButton").style.display = "block";
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