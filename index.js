

function fetch911Data() {
  console.log("Fetching latest 911 data...");

  fetch('https://data.seattle.gov/resource/33kz-ixgy.json?$limit=1000&$order=cad_event_original_time_queued DESC&$where=final_call_type LIKE \'%ASSAULT%\' OR final_call_type LIKE \'%ROBBERY%\' OR final_call_type LIKE \'%FIRE%\' OR final_call_type LIKE \'%SHOOTING%\'')
  .then(response => response.json())
  .then(data => {
      const geojson = {
          "type": "FeatureCollection",
          "features": data.map(row => ({
              "type": "Feature",
              "geometry": {
                  "type": "Point",
                  "coordinates": [parseFloat(row.dispatch_longitude), parseFloat(row.dispatch_latitude)]
              },
              "properties": {
                  "cad_event_number": row.cad_event_number || '',
                  "final_call_type": row.final_call_type || '',
                  "description": row.cad_event_clearance_description || ''
              }
          }))
      };

      // If source already exists, update it, otherwise create a new source
      if (map.getSource('911-data')) {
          map.getSource('911-data').setData(geojson);
      } else {
          map.addSource('911-data', {
              type: 'geojson',
              data: geojson
          });

          map.addLayer({
              id: '911-points',
              type: 'circle',
              source: '911-data',
              paint: {
                  'circle-radius': 6,
                  'circle-color': '#FF0000',
                  'circle-opacity': 0.8
              }
          });
      }
  })
  .catch(error => {
      console.error('Error fetching 911 call data:', error);
  });
}

// Initial fetch when the map loads
map.on('load', function () {
  fetch911Data();

  // Set up periodic data fetch every 5 minutes (300,000 ms)
  setInterval(fetch911Data, 300000); // 5 minutes
});
