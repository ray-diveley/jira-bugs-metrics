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
 * Get on-call shift details at a specific time
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string} timestamp - ISO timestamp to check
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<Object>} - Shift details including person, start, end times
 */
export async function getOnCallShiftAtTime(scheduleId, timestamp, apiKey) {
  try {
    const date = new Date(timestamp);
    const dateStr = date.toISOString();
    
    // Check if date is before Oct 31, 2025 (when schedule started)
    const scheduleStartDate = new Date('2025-10-31T00:00:00Z');
    if (date < scheduleStartDate) {
      return { person: '[Before Oct 31]', shiftStart: null, shiftEnd: null };
    }
    
    // Get timeline to find the actual shift boundaries
    // Request a window around the timestamp to get full shift details
    const windowStart = new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 24h before
    const windowEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24h after
    
    const response = await opsgenieRequest(
      `/schedules/${scheduleId}/timeline?date=${dateStr}&interval=1&intervalUnit=days`,
      apiKey
    );
    
    if (response.data && response.data.finalTimeline && response.data.finalTimeline.rotations) {
      const rotations = response.data.finalTimeline.rotations;
      
      // Find the rotation/period that contains our timestamp
      for (const rotation of rotations) {
        if (rotation.periods) {
          for (const period of rotation.periods) {
            const periodStart = new Date(period.startDate);
            const periodEnd = new Date(period.endDate);
            
            if (date >= periodStart && date <= periodEnd && period.recipient) {
              const email = period.recipient.name || '';
              const displayName = email.split('@')[0];
              
              return {
                person: displayName,
                shiftStart: period.startDate,
                shiftEnd: period.endDate,
                type: period.type || 'on-call'
              };
            }
          }
        }
      }
    }
    
    // Fallback to simple on-call check if timeline doesn't work
    const fallbackResponse = await opsgenieRequest(
      `/schedules/${scheduleId}/on-calls?date=${dateStr}`,
      apiKey
    );
    
    if (fallbackResponse.data && fallbackResponse.data.onCallParticipants && 
        fallbackResponse.data.onCallParticipants.length > 0) {
      const participant = fallbackResponse.data.onCallParticipants[0];
      const email = participant.name || '';
      const displayName = email.split('@')[0];
      
      // Without timeline, we don't know exact shift boundaries
      return {
        person: displayName,
        shiftStart: null,
        shiftEnd: null,
        type: 'on-call'
      };
    }
    
    // No on-call participant found - check if it's weekend or after hours
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { person: '[Weekend]', shiftStart: null, shiftEnd: null };
    }
    
    // Check if it's outside coverage hours (23:00-07:00 UTC)
    const hourUTC = date.getUTCHours();
    if (hourUTC >= 23 || hourUTC < 7) {
      return { person: '[After Hours]', shiftStart: null, shiftEnd: null };
    }
    
    // Otherwise, unknown reason for no coverage
    return { person: '[No Coverage]', shiftStart: null, shiftEnd: null };
  } catch (error) {
    console.error(`Error fetching on-call for ${timestamp}:`, error.message);
    return { person: '[Error]', shiftStart: null, shiftEnd: null };
  }
}

/**
 * Get who was on-call at a specific time (backward compatible - returns just the person)
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string} timestamp - ISO timestamp to check
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<string|null>} - Name of person on-call, or explanation string for why no one was on-call
 */
export async function getOnCallAtTime(scheduleId, timestamp, apiKey) {
  const shift = await getOnCallShiftAtTime(scheduleId, timestamp, apiKey);
  return shift.person;
}

/**
 * Get on-call data for multiple timestamps (batched)
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string[]} timestamps - Array of ISO timestamps
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<Map>} - Map of timestamp -> on-call person name
 */
export async function getOnCallForTimestamps(scheduleId, timestamps, apiKey) {
  const results = new Map();
  
  // Process in batches to avoid rate limiting
  for (const timestamp of timestamps) {
    try {
      const onCall = await getOnCallAtTime(scheduleId, timestamp, apiKey);
      results.set(timestamp, onCall);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to get on-call for ${timestamp}:`, error.message);
      results.set(timestamp, null);
    }
  }
  
  return results;
}

/**
 * Fetch full schedule timeline for a date range (more efficient than per-ticket lookups)
 * @param {string} scheduleId - The Opsgenie schedule ID
 * @param {string} startDate - ISO date string for range start
 * @param {string} endDate - ISO date string for range end
 * @param {string} apiKey - Opsgenie API key
 * @returns {Promise<Array>} - Array of shift objects with person, start, end times
 */
export async function getScheduleTimeline(scheduleId, startDate, endDate, apiKey) {
  try {
    // Calculate the number of days in the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    const response = await opsgenieRequest(
      `/schedules/${scheduleId}/timeline?date=${start.toISOString()}&interval=${days}&intervalUnit=days`,
      apiKey
    );
    
    const shifts = [];
    
    if (response.data && response.data.finalTimeline && response.data.finalTimeline.rotations) {
      for (const rotation of response.data.finalTimeline.rotations) {
        if (rotation.periods) {
          for (const period of rotation.periods) {
            if (period.recipient && period.startDate && period.endDate) {
              const email = period.recipient.name || '';
              const displayName = email.split('@')[0];
              
              // TIMEZONE FIX: Opsgenie schedule is configured in UTC timezone but times represent local EST/EDT
              // The schedule auto-adjusts for Daylight Saving Time:
              // - Before Nov 3, 2025: EDT (UTC-4) - Opsgenie stores "11:00 UTC" for "7:00 AM EDT"
              // - After Nov 3, 2025: EST (UTC-5) - Opsgenie stores "13:00 UTC" for "8:00 AM EST"
              // We need to add the offset so shift times match ticket creation times in UTC
              const startUTC = new Date(period.startDate);
              const endUTC = new Date(period.endDate);
              
              // Determine if date is in DST (EDT = UTC-4) or Standard Time (EST = UTC-5)
              // DST 2025 ended Sunday November 2 at 2:00 AM EST (becomes 1:00 AM)
              // Before Nov 2 at 2 AM EST (Nov 2 at 6:00 UTC): EDT (UTC-4)
              // After Nov 2 at 2 AM EST: EST (UTC-5)
              const isDST = startUTC < new Date('2025-11-02T06:00:00Z'); // Nov 2, 2 AM EDT = 6 AM UTC
              const offset = isDST ? 4 : 5; // EDT needs +4, EST needs +5
              
              const startConverted = new Date(startUTC.getTime() + offset * 60 * 60 * 1000);
              const endConverted = new Date(endUTC.getTime() + offset * 60 * 60 * 1000);
              
              shifts.push({
                person: displayName,
                shiftStart: startConverted.toISOString(),
                shiftEnd: endConverted.toISOString(),
                type: period.type || 'on-call'
              });
            }
          }
        }
      }
    }
    
    return shifts;
  } catch (error) {
    console.error(`Error fetching schedule timeline:`, error.message);
    return [];
  }
}

/**
 * Find who was on-call at a specific time from a cached timeline
 * @param {Array} shifts - Array of shift objects from getScheduleTimeline
 * @param {string} timestamp - ISO timestamp to check
 * @returns {Object} - Shift object with person, start, end times
 */
export function findShiftAtTime(shifts, timestamp) {
  const date = new Date(timestamp);
  
  // Check if date is before Oct 31, 2025 (when schedule started)
  const scheduleStartDate = new Date('2025-10-31T00:00:00Z');
  if (date < scheduleStartDate) {
    return { person: '[Before Oct 31]', shiftStart: null, shiftEnd: null };
  }
  
  for (const shift of shifts) {
    const shiftStart = new Date(shift.shiftStart);
    const shiftEnd = new Date(shift.shiftEnd);
    
    if (date >= shiftStart && date <= shiftEnd) {
      return shift;
    }
  }
  
  // No shift found - check if weekend or after hours
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { person: '[Weekend]', shiftStart: null, shiftEnd: null };
  }
  
  const hourUTC = date.getUTCHours();
  if (hourUTC >= 23 || hourUTC < 7) {
    return { person: '[After Hours]', shiftStart: null, shiftEnd: null };
  }
  
  return { person: '[No Coverage]', shiftStart: null, shiftEnd: null };
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
