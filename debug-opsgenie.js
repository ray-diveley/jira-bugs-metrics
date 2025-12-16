import https from 'https';

const key = 'df08ae76-b85f-4c08-bb82-ecf94bf54dbc';
const scheduleId = '0e6cf6f3-bdee-4fb4-b067-7b61c9d9587e';

function opsgenieRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.opsgenie.com',
      path: `/v2${path}`,
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Test different times today (Dec 16, 2025)
const testTimes = [
  { time: '2025-12-16T07:00:00-05:00', label: '7:00 AM EST (Akshay shift start)' },
  { time: '2025-12-16T08:00:00-05:00', label: '8:00 AM EST (between Akshay/Evgeniy)' },
  { time: '2025-12-16T09:00:00-05:00', label: '9:00 AM EST (Evgeniy shift start)' },
  { time: '2025-12-16T10:00:00-05:00', label: '10:00 AM EST (between Evgeniy/Max)' },
  { time: '2025-12-16T11:00:00-05:00', label: '11:00 AM EST (Max shift start)' },
];

console.log('='.repeat(80));
console.log('OPSGENIE SCHEDULE DEBUG');
console.log('='.repeat(80));
console.log(`Schedule ID: ${scheduleId}`);
console.log(`Schedule Name: Engineering Triage\n`);

// Test 1: Try the /on-calls endpoint for "now"
console.log('TEST 1: Current on-call using /on-calls endpoint');
console.log('-'.repeat(80));

opsgenieRequest(`/schedules/${scheduleId}/on-calls?flat=true`)
  .then(response => {
    console.log('Current on-call participants:');
    if (response.data.onCallRecipients) {
      response.data.onCallRecipients.forEach(p => {
        console.log(`  ${p.name} (${p.type})`);
      });
    }
    console.log('\n');

    // Test 2: Try timeline for today
    console.log('TEST 2: Timeline for today (Dec 16, 2025)');
    console.log('-'.repeat(80));
    
    const today = '2025-12-16T12:00:00Z';
    return opsgenieRequest(`/schedules/${scheduleId}/timeline?date=${today}&interval=1&intervalUnit=days`);
  })
  .then(response => {
    console.log(`Found ${response.data.finalTimeline.rotations.length} rotations\n`);
    
    response.data.finalTimeline.rotations.forEach((rotation, idx) => {
      console.log(`Rotation ${idx + 1}: ${rotation.name} (order: ${rotation.order})`);
      
      if (rotation.periods && rotation.periods.length > 0) {
        rotation.periods.forEach(period => {
          const start = new Date(period.startDate);
          const end = new Date(period.endDate);
          const startEST = start.toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          const endEST = end.toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          
          console.log(`  ${period.recipient.name}: ${startEST} - ${endEST} EST`);
        });
      }
      console.log('');
    });

    // Test 3: Check specific timestamps
    console.log('\nTEST 3: Timeline lookups for specific times');
    console.log('-'.repeat(80));
    
    const promises = testTimes.map(async (test) => {
      const date = new Date(test.time);
      const dateISO = date.toISOString();
      
      try {
        const resp = await opsgenieRequest(
          `/schedules/${scheduleId}/timeline?date=${dateISO}&interval=1&intervalUnit=hours`
        );
        
        // Find who was on-call at this exact time
        let found = null;
        if (resp.data.finalTimeline && resp.data.finalTimeline.rotations) {
          for (const rotation of resp.data.finalTimeline.rotations) {
            if (rotation.periods) {
              for (const period of rotation.periods) {
                const periodStart = new Date(period.startDate);
                const periodEnd = new Date(period.endDate);
                
                if (date >= periodStart && date <= periodEnd && period.recipient) {
                  found = {
                    person: period.recipient.name,
                    rotation: rotation.name,
                    shiftStart: periodStart,
                    shiftEnd: periodEnd
                  };
                  break;
                }
              }
            }
            if (found) break;
          }
        }
        
        return { test, found };
      } catch (e) {
        return { test, error: e.message };
      }
    });
    
    return Promise.all(promises);
  })
  .then(results => {
    results.forEach(r => {
      console.log(`\n${r.test.label}:`);
      if (r.found) {
        const startEST = r.found.shiftStart.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const endEST = r.found.shiftEnd.toLocaleString('en-US', { timeZone: 'America/New_York' });
        console.log(`  Person: ${r.found.person}`);
        console.log(`  Rotation: ${r.found.rotation}`);
        console.log(`  Shift: ${startEST} to ${endEST}`);
      } else if (r.error) {
        console.log(`  Error: ${r.error}`);
      } else {
        console.log(`  No on-call found`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('EXPECTED vs ACTUAL');
    console.log('='.repeat(80));
    console.log('Expected (from Jira UI):');
    console.log('  7-9 AM: Akshay Vijay Takkar');
    console.log('  9-11 AM: Evgeniy Suhov');
    console.log('  11 AM-1 PM: Max Kuklin');
    console.log('  1-3 PM: Grigoriy Semenenko');
    console.log('  3-5 PM: Brad Goldberg');
    console.log('  5-7 PM: Randy Dahl');
    console.log('  7-11 PM: Jeff Maciorowski');
    console.log('\nActual (from Opsgenie API):');
    console.log('  See results above');
    console.log('='.repeat(80));
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
