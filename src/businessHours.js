/**
 * Business Hours Calculator
 * Calculates elapsed time excluding weekends and after-hours
 */

// Default business hours configuration (EST for US/UK customers)
const DEFAULT_BUSINESS_HOURS = {
  start: 13, // 8 AM EST = 13:00 UTC
  end: 22,   // 5 PM EST = 22:00 UTC
  timezone: 'America/New_York'
};

// Manager timezones (for calculating their working hours)
// Note: All managers work synchronized US East Coast hours regardless of physical location
const MANAGER_TIMEZONES = {
  'Brad Goldberg': { timezone: 'America/New_York', utcOffset: -5 },      // EST (UTC-5)
  'Jeff Maciorowski': { timezone: 'America/New_York', utcOffset: -5 },   // EST (UTC-5)
  'Akshay Vijay Takkar': { timezone: 'America/New_York', utcOffset: -5 },  // Works EST hours
  'Grigoriy Semenenko': { timezone: 'America/New_York', utcOffset: -5 },   // Works EST hours
  'Randy Dahl': { timezone: 'America/New_York', utcOffset: -5 },         // EST (UTC-5)
  'Evgeniy Suhov': { timezone: 'America/New_York', utcOffset: -5 },      // Works EST hours
  'Max Kuklin': { timezone: 'America/New_York', utcOffset: -5 }          // Works EST hours
};

// Calculate UTC hour range for a person's 8 AM - 5 PM in their timezone
function getPersonBusinessHours(personName) {
  const tz = MANAGER_TIMEZONES[personName];
  if (!tz) {
    // Default to EST if person not found
    return { start: DEFAULT_BUSINESS_HOURS.start, end: DEFAULT_BUSINESS_HOURS.end };
  }
  
  // 8 AM in their timezone = 8 - utcOffset in UTC
  // 5 PM in their timezone = 17 - utcOffset in UTC
  let start = 8 - tz.utcOffset;
  let end = 17 - tz.utcOffset;
  
  // Normalize to 0-23 range
  start = ((start % 24) + 24) % 24;
  end = ((end % 24) + 24) % 24;
  
  return { start, end };
}

/**
 * Check if a date falls on a weekend
 */
function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Check if a time is within business hours (UTC)
 * @param {Date} date - The date to check
 * @param {string} personName - Optional: person's name to use their timezone
 */
function isBusinessHours(date, personName = null) {
  const hour = date.getUTCHours();
  const hours = personName ? getPersonBusinessHours(personName) : DEFAULT_BUSINESS_HOURS;
  
  // Handle cases where business hours cross midnight UTC
  if (hours.start < hours.end) {
    return hour >= hours.start && hour < hours.end;
  } else {
    // Wraps around midnight (e.g., start=22, end=7 means 10 PM - 7 AM UTC)
    return hour >= hours.start || hour < hours.end;
  }
}

/**
 * Get next business hour from a given date
 * @param {Date} date - The starting date
 * @param {string} personName - Optional: person's name to use their timezone
 */
function getNextBusinessHour(date, personName = null) {
  const result = new Date(date);
  const hours = personName ? getPersonBusinessHours(personName) : DEFAULT_BUSINESS_HOURS;
  
  // If weekend, move to Monday
  while (isWeekend(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(hours.start, 0, 0, 0);
  }
  
  // If after hours, move to next business day start
  if (result.getUTCHours() >= hours.end) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(hours.start, 0, 0, 0);
    // Check if new day is weekend
    return getNextBusinessHour(result, personName);
  }
  
  // If before hours, move to business hours start
  if (result.getUTCHours() < hours.start) {
    result.setUTCHours(hours.start, 0, 0, 0);
  }
  
  return result;
}

/**
 * Calculate business hours between two dates
 * @param {Date|string} start - Start date/time
 * @param {Date|string} end - End date/time
 * @param {string} personName - Optional: person's name to use their timezone
 * @returns {number} Minutes of business hours elapsed
 */
export function calculateBusinessMinutes(start, end, personName = null) {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  const hours = personName ? getPersonBusinessHours(personName) : DEFAULT_BUSINESS_HOURS;
  
  let current = new Date(startDate);
  let businessMinutes = 0;
  
  // Move to next business hour if starting outside business hours
  if (isWeekend(current) || !isBusinessHours(current, personName)) {
    current = getNextBusinessHour(current, personName);
  }
  
  // If end is before first business hour, no business time elapsed
  if (endDate < current) {
    return 0;
  }
  
  // Calculate business hours
  while (current < endDate) {
    // Skip weekends
    if (isWeekend(current)) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(hours.start, 0, 0, 0);
      continue;
    }
    
    // Skip non-business hours
    if (current.getUTCHours() < hours.start) {
      current.setUTCHours(hours.start, 0, 0, 0);
      continue;
    }
    
    if (current.getUTCHours() >= hours.end) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(hours.start, 0, 0, 0);
      continue;
    }
    
    // Calculate how much time until end of business day or end date
    const dayEnd = new Date(current);
    dayEnd.setUTCHours(hours.end, 0, 0, 0);
    
    const segmentEnd = endDate < dayEnd ? endDate : dayEnd;
    const minutesInSegment = (segmentEnd - current) / (1000 * 60);
    
    businessMinutes += minutesInSegment;
    
    // Move to next business day
    current = new Date(segmentEnd);
    if (current.getUTCHours() >= hours.end) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(hours.start, 0, 0, 0);
    }
  }
  
  return Math.round(businessMinutes);
}

/**
 * Check if a ticket was created outside business hours
 * @param {string|Date} dateString - Date to check
 * @param {string} personName - Optional: person's name to use their timezone
 */
export function isOutsideBusinessHours(dateString, personName = null) {
  const date = new Date(dateString);
  return isWeekend(date) || !isBusinessHours(date, personName);
}

/**
 * Get a human-readable description of when ticket was created
 * @param {string|Date} dateString - Date to check
 * @param {string} personName - Optional: person's name to use their timezone
 */
export function getCreatedTimeContext(dateString, personName = null) {
  const date = new Date(dateString);
  const hours = personName ? getPersonBusinessHours(personName) : DEFAULT_BUSINESS_HOURS;
  
  if (isWeekend(date)) {
    const day = date.getUTCDay() === 0 ? 'Sunday' : 'Saturday';
    return `${day} (Weekend)`;
  }
  
  const hour = date.getUTCHours();
  if (hour < hours.start) {
    return personName ? `Before ${personName}'s business hours` : 'Before business hours';
  }
  
  if (hour >= hours.end) {
    return personName ? `After ${personName}'s business hours` : 'After business hours';
  }
  
  return personName ? `During ${personName}'s business hours` : 'During business hours';
}

/**
 * Format business minutes into human-readable string
 */
export function formatBusinessTime(minutes) {
  if (minutes === null || minutes === undefined) {
    return 'N/A';
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours === 0) {
    return `${mins}m`;
  }
  
  return `${hours}h ${mins}m`;
}
