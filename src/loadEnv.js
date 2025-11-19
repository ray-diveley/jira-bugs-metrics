import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

export function loadEnvConfig() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
  return {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
    JIRA_JQL: process.env.JIRA_JQL,
    JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPES: process.env.JIRA_ISSUE_TYPES,
    JIRA_STATUS_NAMES: process.env.JIRA_STATUS_NAMES,
    JIRA_DRY_RUN: (process.env.JIRA_DRY_RUN || 'false').toLowerCase() === 'true',
    JIRA_MAX_ISSUES: process.env.JIRA_MAX_ISSUES,
    JIRA_START_DATE: process.env.JIRA_START_DATE,
    JIRA_END_DATE: process.env.JIRA_END_DATE,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    TZ: process.env.TZ || 'UTC'
  };
}
