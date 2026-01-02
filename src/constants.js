/**
 * Shared constants for SLA tracking and on-call management
 */

// Define on-call managers
export const ON_CALL_MANAGERS = [
  'Brad Goldberg',
  'Jeff Maciorowski',
  'Akshay Vijay Takkar',
  'Grigoriy Semenenko',
  'Randy Dahl',
  'Evgeniy Suhov',
  'Max Kuklin'
];

// People whose actions count as SLA response (on-call managers + key engineers)
export const SLA_RESPONDERS = [
  ...ON_CALL_MANAGERS,
  'Manjeet Kumar Mahto',
  'Mitali Goel'
];
