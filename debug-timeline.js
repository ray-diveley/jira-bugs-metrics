import https from 'https';

const apiKey = 'df08ae76-b85f-4c08-bb82-ecf94bf54dbc';
const scheduleId = '0e6cf6f3-bdee-4fb4-b067-7b61c9d9587e';
const testTime = '2025-12-16T07:30:00-05:00';

const date = new Date(testTime);
const dateStr = date.toISOString();

console.log(`\nQuerying Opsgenie timeline for: ${testTime}`);
console.log(`ISO format: ${dateStr}\n`);

const options = {
  hostname: 'api.opsgenie.com',
  path: `/v2/schedules/${scheduleId}/timeline?date=${dateStr}&interval=1&intervalUnit=days`,
  method: 'GET',
  headers: {
    'Authorization': `GenieKey ${apiKey}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const response = JSON.parse(data);
    
    if (response.data && response.data.finalTimeline && response.data.finalTimeline.rotations) {
      console.log(`Found ${response.data.finalTimeline.rotations.length} rotations\n`);
      
      response.data.finalTimeline.rotations.forEach((rotation, rotIdx) => {
        console.log(`\n=== ROTATION ${rotIdx + 1} ===`);
        console.log(`Name: ${rotation.name || 'Unnamed'}`);
        console.log(`Order: ${rotation.order}`);
        
        if (rotation.periods) {
          console.log(`Periods: ${rotation.periods.length}`);
          rotation.periods.forEach((period, pIdx) => {
            const start = new Date(period.startDate);
            const end = new Date(period.endDate);
            const matches = date >= start && date <= end;
            
            const startEST = start.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const endEST = end.toLocaleString('en-US', { timeZone: 'America/New_York' });
            
            console.log(`  Period ${pIdx + 1}: ${period.recipient?.name || 'N/A'} ${matches ? '✓ MATCH' : ''}`);
            console.log(`    ${startEST} to ${endEST}`);
          });
        }
      });
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
