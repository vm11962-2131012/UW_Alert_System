// initialize mapbox map
mapboxgl.accessToken = 'pk.eyJ1Ijoidm0xMTk2MiIsImEiOiJjbTFqbDh4OHcwcGQ2MmxvZHR2OXUyam10In0.TLBFscEgQpdhpSFtM62UHw';
const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/mapbox/light-v11', // style URL
    zoom: 14, // starting zoom
    center: [-122.30669, 47.65529] // starting center
});

async function geojsonFetch() {

  // fetch UW boundary
  let boundaryResponse = await fetch('assets/uw_boundary.geojson')
  let uwBoundary = await boundaryResponse.json();

  // fetch spd crime data
  let response = await fetch('assets/spd_crime_df.geojson');
  let places = await response.json();

  map.on('load', function loadingData() {
    // add uw boundary first
    map.addSource('uw-campus', {
      type: 'geojson',
      data: uwBoundary
    })

    map.addLayer({
      'id': 'uw-campus-layer',
      'type': 'line',
      'source': 'uw-campus',
      'paint': {
          'line-color': '#FFD700', // Husky Gold
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
                  'MOTOR VEHICLE THEFT', '#FF5733',
                  'LARCENY-THEFT', '#33A8FF',
                  'DESTRUCTION/DAMAGE/VANDALISM OF PROPERTY', '#33FF57',
                  'FRAUD OFFENSES', '#FF33A8',
                  '#808080' // default
                ],
        }
    });

    // Apply filter to only show points within UW boundary
    map.setFilter('places-layer', ['within', uwBoundary]);

  })

}

geojsonFetch();

// // functiom to load uw campus boundary
// map.on('load', function () {
//     map.addSource('uw-campus', {
//         type: 'geojson',
//         data: 'assets/uw_boundary.geojson'
//     });

//     map.addLayer({
//         id: 'uw-campus-layer',
//         type: 'fill',
//         source: 'uw-campus',
//         paint: {
//             'fill-color': '#FFD700', // yellow boundary (will replace with husky gold)
//             'fill-opacity': 0.3
//         }
//     });

//     // SPD crime data
//     map.addSource('places', {
//         type: 'geojson',
//         data: 'spd_crime_df.geojson'
//     });

//     map.addLayer({
//         id: 'places-layer',
//         type: 'circle',
//         source: 'places',
//         paint: {
//             'circle-radius': 6,
//             'circle-color': [
//                 'match',
//                 ['get', 'Offense Parent Group'],
//                 'MOTOR VEHICLE THEFT', '#FF5733',
//                 'LARCENY-THEFT', '#33A8FF',
//                 'DESTRUCTION/DAMAGE/VANDALISM OF PROPERTY', '#33FF57',
//                 'FRAUD OFFENSES', '#FF33A8',
//                 '#808080' // default
//             ],
//         }
//     });
// });