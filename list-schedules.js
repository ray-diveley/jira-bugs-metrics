import https from 'https';

const key = 'df08ae76-b85f-4c08-bb82-ecf94bf54dbc';

const options = {
  hostname: 'api.opsgenie.com',
  path: '/v2/schedules',
  method: 'GET',
  headers: {
    'Authorization': `GenieKey ${key}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const response = JSON.parse(data);
    console.log('Available Opsgenie schedules:\n');
    response.data.forEach(s => {
      console.log(`  ${s.name}`);
      console.log(`    ID: ${s.id}`);
      console.log(`    Enabled: ${s.enabled !== false}`);
      console.log('');
    });
  });
});

req.on('error', (error) => console.error('Error:', error));
req.end();
