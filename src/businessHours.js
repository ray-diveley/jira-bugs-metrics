/**
 * Business Hours Calculator
 * Calculates elapsed time excluding weekends and after-hours
 */

// Business hours configuration (all times in UTC)
const BUSINESS_HOURS = {
  start: 13, // 8 AM EST = 13:00 UTC
  end: 22,   // 5 PM EST = 22:00 UTC
  timezone: 'America/New_York'
};

/**
 * Check if a date falls on a weekend
 */
function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Check if a time is within business hours (UTC)
 */
function isBusinessHours(date) {
  const hour = date.getUTCHours();
  return hour >= BUSINESS_HOURS.start && hour < BUSINESS_HOURS.end;
}

/**
 * Get next business hour from a given date
 */
function getNextBusinessHour(date) {
  const result = new Date(date);
  
  // If weekend, move to Monday
  while (isWeekend(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
  }
  
  // If after hours, move to next business day start
  if (result.getUTCHours() >= BUSINESS_HOURS.end) {
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
    // Check if new day is weekend
    return getNextBusinessHour(result);
  }
  
  // If before hours, move to business hours start
  if (result.getUTCHours() < BUSINESS_HOURS.start) {
    result.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
  }
  
  return result;
}

/**
 * Calculate business hours between two dates
 * @param {Date|string} start - Start date/time
 * @param {Date|string} end - End date/time
 * @returns {number} Minutes of business hours elapsed
 */
export function calculateBusinessMinutes(start, end) {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  
  let current = new Date(startDate);
  let businessMinutes = 0;
  
  // Move to next business hour if starting outside business hours
  if (isWeekend(current) || !isBusinessHours(current)) {
    current = getNextBusinessHour(current);
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
      current.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
      continue;
    }
    
    // Skip non-business hours
    if (current.getUTCHours() < BUSINESS_HOURS.start) {
      current.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
      continue;
    }
    
    if (current.getUTCHours() >= BUSINESS_HOURS.end) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
      continue;
    }
    
    // Calculate how much time until end of business day or end date
    const dayEnd = new Date(current);
    dayEnd.setUTCHours(BUSINESS_HOURS.end, 0, 0, 0);
    
    const segmentEnd = endDate < dayEnd ? endDate : dayEnd;
    const minutesInSegment = (segmentEnd - current) / (1000 * 60);
    
    businessMinutes += minutesInSegment;
    
    // Move to next business day
    current = new Date(segmentEnd);
    if (current.getUTCHours() >= BUSINESS_HOURS.end) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(BUSINESS_HOURS.start, 0, 0, 0);
    }
  }
  
  return Math.round(businessMinutes);
}

/**
 * Check if a ticket was created outside business hours
 */
export function isOutsideBusinessHours(dateString) {
  const date = new Date(dateString);
  return isWeekend(date) || !isBusinessHours(date);
}

/**
 * Get a human-readable description of when ticket was created
 */
export function getCreatedTimeContext(dateString) {
  const date = new Date(dateString);
  
  if (isWeekend(date)) {
    const day = date.getUTCDay() === 0 ? 'Sunday' : 'Saturday';
    return `${day} (Weekend)`;
  }
  
  const hour = date.getUTCHours();
  if (hour < BUSINESS_HOURS.start) {
    return 'Before business hours';
  }
  
  if (hour >= BUSINESS_HOURS.end) {
    return 'After business hours';
  }
  
  return 'During business hours';
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
