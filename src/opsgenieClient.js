/**
 * Opsgenie API Client
 * Fetches on-call schedule data to determine who was on-call at specific times
 */

import https from 'https';

const OPSGENIE_API_BASE = 'https://api.opsgenie.com/v2';

/**
 * Make a request to Opsgenie API
 */
async function opsgenieRequest(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.opsgenie.com',
      path: `/v2${path}`,
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Opsgenie response: ${e.message}`));
          }
        } else {
          reject(new Error(`Opsgenie API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Get schedule ID by name
 */
export async function getScheduleId(scheduleName, apiKey) {
  try {
    const response = await opsgenieRequest('/schedules', apiKey);
    const schedule = response.data.find(s => s.name === scheduleName);

    if (!schedule) {
      throw new Error(`Schedule "${scheduleName}" not found`);
    }

    return schedule.id;
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    throw error;
  }
}

/**
 * Get who was on-call at a specific time
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string} timestamp - ISO timestamp to check
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<object>} - Object with name and shift details
 */
export async function getOnCallAtTime(scheduleId, timestamp, apiKey) {
  try {
    const date = new Date(timestamp);
    const dateStr = date.toISOString();

    // Check if date is before Oct 31, 2025 (when schedule started)
    const scheduleStartDate = new Date('2025-10-31T00:00:00Z');
    if (date < scheduleStartDate) {
      return { name: '[Before Oct 31]', shiftStart: null, shiftEnd: null };
    }

    const response = await opsgenieRequest(
      `/schedules/${scheduleId}/on-calls?date=${dateStr}`,
      apiKey
    );

    if (response.data && response.data.onCallParticipants && response.data.onCallParticipants.length > 0) {
      // Get the on-call participant and their shift details
      const participant = response.data.onCallParticipants[0];
      const email = participant.name || '';
      const displayName = email.split('@')[0];

      // Extract shift times if available
      const shiftStart = participant.startDate || null;
      const shiftEnd = participant.endDate || null;

      return {
        name: displayName,
        shiftStart,
        shiftEnd,
        rawData: participant // Include raw data for debugging
      };
    }

    // No on-call participant found - check if it's weekend or after hours
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { name: '[Weekend]', shiftStart: null, shiftEnd: null };
    }

    // Check if it's outside coverage hours (23:00-07:00 UTC)
    const hourUTC = date.getUTCHours();
    if (hourUTC >= 23 || hourUTC < 7) {
      return { name: '[After Hours]', shiftStart: null, shiftEnd: null };
    }

    // Otherwise, unknown reason for no coverage
    return { name: '[No Coverage]', shiftStart: null, shiftEnd: null };
  } catch (error) {
    console.error(`Error fetching on-call for ${timestamp}:`, error.message);
    return { name: '[Error]', shiftStart: null, shiftEnd: null };
  }
}

/**
 * Fetch schedule timeline for a date range (all shifts at once)
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string} startDate - ISO timestamp for range start
 * @param {string} endDate - ISO timestamp for range end
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<Array>} - Array of shift periods with {startDate, endDate, recipient}
 */
async function getScheduleTimeline(scheduleId, startDate, endDate, apiKey) {
  try {
    // Calculate days between dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    console.log(`[info] Fetching schedule timeline from ${start.toLocaleDateString()} to ${end.toLocaleDateString()} (${days} days)`);

    const response = await opsgenieRequest(
      `/schedules/${scheduleId}/timeline?date=${start.toISOString()}&interval=${days}&intervalUnit=days&expand=base`,
      apiKey
    );

    if (response.data && response.data.finalTimeline && response.data.finalTimeline.rotations) {
      // Extract all periods from all rotations
      const allPeriods = [];
      for (const rotation of response.data.finalTimeline.rotations) {
        if (rotation.periods) {
          for (const period of rotation.periods) {
            allPeriods.push({
              startDate: period.startDate,
              endDate: period.endDate,
              recipient: period.recipient,
              type: period.type
            });
          }
        }
      }

      console.log(`[info] Found ${allPeriods.length} shift periods in timeline\n`);

      // Log all shifts for debugging
      console.log('📅 SHIFTS FROM OPSGENIE TIMELINE:');
      console.log('='.repeat(100));
      for (const period of allPeriods) {
        const start = new Date(period.startDate).toLocaleString();
        const end = new Date(period.endDate).toLocaleString();
        const person = period.recipient.type === 'user'
          ? period.recipient.name.split('@')[0]
          : `[${period.recipient.type}: ${period.recipient.name}]`;
        const type = period.type;
        console.log(`${person.padEnd(20)} | ${start} - ${end} | Type: ${type}`);
      }
      console.log('='.repeat(100) + '\n');

      return allPeriods;
    }

    console.warn('No timeline data returned from Opsgenie');
    return [];
  } catch (error) {
    console.error('Error fetching schedule timeline:', error.message);
    throw error;
  }
}

/**
 * Get on-call data for multiple timestamps (using timeline cache)
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string[]} timestamps - Array of ISO timestamps
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<Map>} - Map of timestamp -> on-call person name
 */
export async function getOnCallForTimestamps(scheduleId, timestamps, apiKey) {
  const results = new Map();

  console.log(`\n[info] Fetching on-call data for ${timestamps.length} timestamps`);
  console.log('='.repeat(100));

  // Find date range from timestamps
  const dates = timestamps.map(ts => new Date(ts));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Fetch entire schedule timeline in ONE API call
  const shifts = await getScheduleTimeline(scheduleId, minDate.toISOString(), maxDate.toISOString(), apiKey);

  // Track stats per shift
  const shiftStats = [];

  // Match each timestamp to a shift offline (no more API calls!)
  for (const timestamp of timestamps) {
    const ts = new Date(timestamp).getTime();

    // Find the shift that covers this timestamp
    let matchedShift = null;
    for (const shift of shifts) {
      const start = new Date(shift.startDate).getTime();
      const end = new Date(shift.endDate).getTime();

      if (ts >= start && ts <= end) {
        matchedShift = shift;
        break;
      }
    }

    // Determine on-call person
    let onCallName;
    let shiftStart;
    let shiftEnd;

    if (matchedShift) {
      // Extract person name from recipient
      const recipient = matchedShift.recipient;
      if (recipient.type === 'user') {
        onCallName = recipient.name.split('@')[0]; // Extract username before @
      } else {
        onCallName = `[${recipient.type}: ${recipient.name}]`;
      }
      shiftStart = matchedShift.startDate;
      shiftEnd = matchedShift.endDate;
    } else {
      // No shift found - check if it's before schedule start, weekend, or after hours
      const date = new Date(timestamp);
      const scheduleStartDate = new Date('2025-10-31T00:00:00Z');

      if (date < scheduleStartDate) {
        onCallName = '[Before Oct 31]';
      } else {
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          onCallName = '[Weekend]';
        } else {
          const hourUTC = date.getUTCHours();
          if (hourUTC >= 23 || hourUTC < 7) {
            onCallName = '[After Hours]';
          } else {
            onCallName = '[No Coverage]';
          }
        }
      }
      shiftStart = null;
      shiftEnd = null;
    }

    results.set(timestamp, { name: onCallName, shiftStart, shiftEnd });

    // Track shift stats
    let existingShift = shiftStats.find(s =>
      s.person === onCallName &&
      s.shiftStart === shiftStart &&
      s.shiftEnd === shiftEnd
    );

    if (!existingShift) {
      existingShift = {
        person: onCallName,
        shiftStart: shiftStart,
        shiftEnd: shiftEnd,
        tickets: [],
        ticketCount: 0
      };
      shiftStats.push(existingShift);
    }

    existingShift.tickets.push(timestamp);
    existingShift.ticketCount++;

    // Log each ticket's on-call assignment
    const tsStr = new Date(timestamp).toLocaleString();
    const shiftInfo = shiftStart && shiftEnd
      ? `${new Date(shiftStart).toLocaleString()} - ${new Date(shiftEnd).toLocaleString()}`
      : 'N/A';
    console.log(`✓ ${tsStr.padEnd(25)} | ${String(onCallName).padEnd(20)} | Shift: ${shiftInfo}`);
  }

  // Print summary by shift
  console.log('='.repeat(100));
  console.log('\n📊 ON-CALL SUMMARY BY SHIFT:');
  console.log('='.repeat(100));

  // Sort by shift start time
  shiftStats.sort((a, b) => {
    if (!a.shiftStart || !b.shiftStart) return 0;
    return new Date(a.shiftStart).getTime() - new Date(b.shiftStart).getTime();
  });

  for (const shift of shiftStats) {
    const shiftTime = shift.shiftStart && shift.shiftEnd
      ? `${new Date(shift.shiftStart).toLocaleString()} - ${new Date(shift.shiftEnd).toLocaleString()}`
      : 'N/A';
    console.log(`${String(shift.person).padEnd(20)} | ${shift.ticketCount.toString().padStart(3)} tickets | ${shiftTime}`);
  }

  console.log('='.repeat(100));
  console.log(`[info] Made 1 API request (timeline), 0 individual lookups (${timestamps.length} total matched)\n`);

  return results;
}

/**
 * Initialize Opsgenie and get schedule ID
 */
export async function initializeOpsgenie(config) {
  if (!config.OPSGENIE_API_KEY) {
    console.warn('Opsgenie API key not configured, skipping on-call schedule lookup');
    return null;
  }

  try {
    const scheduleId = await getScheduleId(
      config.OPSGENIE_SCHEDULE_NAME || 'Engineering Triage',
      config.OPSGENIE_API_KEY
    );

    console.log(`Found Opsgenie schedule: ${config.OPSGENIE_SCHEDULE_NAME} (ID: ${scheduleId})`);
    return scheduleId;
  } catch (error) {
    console.error('Failed to initialize Opsgenie:', error.message);
    return null;
  }
}
