// initialize mapbox map
mapboxgl.accessToken = 'pk.eyJ1Ijoidm0xMTk2MiIsImEiOiJjbTFqbDh4OHcwcGQ2MmxvZHR2OXUyam10In0.TLBFscEgQpdhpSFtM62UHw';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/mapbox/light-v11', // style URL
    zoom: 14, // starting zoom
    center: [-122.30669, 47.658] // starting center
});

async function geojsonFetch() {

  // fetch UW boundary
  let boundaryResponse = await fetch('assets/uw_boundary.geojson')
  let uwBoundary = await boundaryResponse.json();

  // fetch spd crime data
  let response = await fetch('assets/spd_crime_df.geojson');
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
          'line-color': '#FFD700', // Husky Gold
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
          'fill-color': '#FFD700',
          'fill-opacity': 0.3
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
                  'MOTOR VEHICLE THEFT', '#FF5733',
                  'LARCENY-THEFT', '#33A8FF',
                  'DESTRUCTION/DAMAGE/VANDALISM OF PROPERTY', '#33FF57',
                  'FRAUD OFFENSES', '#FF33A8',
                  '#808080' // default
                ],
        }
    });

    // pop-up layers
    map.on('click', 'places-layer', (e) => {
      if (e.features.length > 0) {
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
          
        // spd pop-up content properties
        const popupContent = `
          <div style="max-width: 300px;">
            <h3>Crime Information</h3>
            <strong>Offense:</strong> ${feature.properties['Offense Parent Group'] || 'N/A'}<br>
            <strong>Specific Offense:</strong> ${feature.properties['Offense'] || 'N/A'}<br>
            <strong>Date:</strong> ${feature.properties['Occurred Date'] || 'N/A'}<br>
            <strong>Area:</strong> ${feature.properties['MCPP'] || 'N/A'}
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

  const apiURL = `https://data.seattle.gov/resource/33kz-ixgy.geojson?$$app_token=${APP_TOKEN}`;


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
  }

  // similar function for 911 data
  map.on('click', '911-points', (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
          
      // 911 popup content properties
      const popupContent = `
          <div style="max-width: 300px;">
            <h3>Emergency Call Details</h3>
            <strong>Incident Type:</strong> ${feature.properties.event_clearance_group || 'N/A'}<br>
            <strong>Description:</strong> ${feature.properties.event_clearance_description || 'N/A'}<br>
            <strong>Initial Receipt Time:</strong> ${feature.properties.initial_call_timestamp || 'N/A'}<br>
            <strong>Area:</strong> ${feature.properties.block_address || 'N/A'}
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

// Fetch and display Isochrone Navigation layer
async function loadIsochroneLayer() {
  const profile = 'walking';
  const minutes = 10;
  const isochroneURL = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/-122.30669,47.65529?contours_minutes=${minutes}&polygons=true&access_token=${mapboxgl.accessToken}`;

  let response = await fetch(isochroneURL);
  let isochroneData = await response.json();

  map.addSource('isochrone', { type: 'geojson', data: isochroneData });
  map.addLayer({
      id: 'isochrone-layer',
      type: 'fill',
      source: 'isochrone',
      layout: { visibility: 'none' },
      paint: {
          'fill-color': '#0099FF',
          'fill-opacity': 0.3
      }
  });
}

// Toggle Visibility of Layers
document.getElementById('toggle-isochrone').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('isochrone-layer', 'visibility');
  map.setLayoutProperty('isochrone-layer', 'visibility', visibility === 'visible' ? 'none' : 'visible');
});

document.getElementById('toggle-911').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('911-points', 'visibility');
  map.setLayoutProperty('911-points', 'visibility', visibility === 'visible' ? 'none' : 'visible');
});

document.getElementById('toggle-spd').addEventListener('click', function () {
  let visibility = map.getLayoutProperty('places-layer', 'visibility');
  map.setLayoutProperty('places-layer', 'visibility', visibility === 'visible' ? 'none' : 'visible');
});


geojsonFetch();


// Add Sidebar Info Panel Open and Close Functions
function openNav() {
  // slides sidebar in
  document.getElementById("sidebar").style.width = "500px";
  // pushes main content, map, and features to the right
  document.getElementById("main").style.marginLeft = "500px";
  document.getElementById("features").style.marginLeft = "500px";
  document.getElementById("map").style.marginLeft = "250px";
  document.getElementById("toggleButton").style.display = "none";
}

function closeNav() {
  // pushes sidebar out
  document.getElementById("sidebar").style.width = "0";
  // resets position of main content, map, and features
  document.getElementById("main").style.marginLeft = "0";
  document.getElementById("features").style.marginLeft = "0px";
  document.getElementById("map").style.marginLeft = "0px";
  document.getElementById("toggleButton").style.display = "block";
}
