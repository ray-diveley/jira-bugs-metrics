const key = 'df08ae76-b85f-4c08-bb82-ecf94bf54dbc';

import('./src/opsgenieClient.js').then(m => {
  m.getScheduleId('Engineering Triage', key).then(id => {
    const tests = [
      { time: '2025-12-16T07:30:00-05:00', expected: 'Akshay' },
      { time: '2025-12-16T10:00:00-05:00', expected: 'Evgeniy' },
      { time: '2025-12-16T11:30:00-05:00', expected: 'Max' }
    ];
    
    return Promise.all(tests.map(t => 
      m.getOnCallShiftAtTime(id, t.time, key).then(s => ({ ...t, shift: s }))
    ));
  }).then(results => {
    console.log('\nTesting today\'s schedule (Dec 16, 2025):\n');
    results.forEach(r => {
      const time = new Date(r.time);
      const estTime = time.toLocaleTimeString('en-US', { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const match = r.shift.person.toLowerCase().includes(r.expected.toLowerCase()) ? '✓' : '✗';
      console.log(`${estTime} EST: ${r.shift.person} (expected: ${r.expected}) ${match}`);
    });
  }).catch(e => console.error('Error:', e.message));
});
