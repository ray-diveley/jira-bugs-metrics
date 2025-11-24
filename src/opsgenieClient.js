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
 * @returns {Promise<string|null>} - Name of person on-call, or explanation string for why no one was on-call
 */
export async function getOnCallAtTime(scheduleId, timestamp, apiKey) {
  try {
    const date = new Date(timestamp);
    const dateStr = date.toISOString();
    
    // Check if date is before Oct 31, 2025 (when schedule started)
    const scheduleStartDate = new Date('2025-10-31T00:00:00Z');
    if (date < scheduleStartDate) {
      return '[Before Oct 31]';
    }
    
    const response = await opsgenieRequest(
      `/schedules/${scheduleId}/on-calls?date=${dateStr}`,
      apiKey
    );
    
    if (response.data && response.data.onCallParticipants && response.data.onCallParticipants.length > 0) {
      // Return the first on-call person's email/name
      const participant = response.data.onCallParticipants[0];
      // Convert email to displayable name (e.g., jmaciorowski@m3mr.com -> jmaciorowski)
      const email = participant.name || '';
      const displayName = email.split('@')[0];
      return displayName;
    }
    
    // No on-call participant found - check if it's weekend or after hours
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return '[Weekend]';
    }
    
    // Check if it's outside coverage hours (23:00-07:00 UTC)
    const hourUTC = date.getUTCHours();
    if (hourUTC >= 23 || hourUTC < 7) {
      return '[After Hours]';
    }
    
    // Otherwise, unknown reason for no coverage
    return '[No Coverage]';
  } catch (error) {
    console.error(`Error fetching on-call for ${timestamp}:`, error.message);
    return '[Error]';
  }
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
