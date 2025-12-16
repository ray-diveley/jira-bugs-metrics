import { getScheduleTimeline } from './src/opsgenieClient.js';
import './src/loadEnv.js';

async function checkGrigoriyShifts() {
  console.log('Checking Grigoriy shift times from Opsgenie...\n');
  
  const startDate = new Date('2025-11-01');
  const endDate = new Date('2025-11-07'); // Just check one week
  
  const timeline = await getScheduleTimeline(startDate, endDate);
  
  // Filter for Grigoriy
  const grigoriyShifts = timeline.filter(t => 
    t.recipient && (
      t.recipient.includes('gsemenenko') || 
      t.recipient.toLowerCase().includes('grigoriy')
    )
  );
  
  console.log(`Found ${grigoriyShifts.length} shifts for Grigoriy:\n`);
  
  grigoriyShifts.forEach(shift => {
    const start = new Date(shift.startDate);
    const end = new Date(shift.endDate);
    console.log(`Shift: ${start.toLocaleString('en-US', { timeZone: 'America/New_York' })} - ${end.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    console.log(`  Raw: ${shift.startDate} - ${shift.endDate}`);
    console.log(`  Recipient: ${shift.recipient}`);
    console.log('');
  });
}

checkGrigoriyShifts().catch(console.error);
