import axios from 'axios';
import { loadEnvConfig } from './loadEnv.js';

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_JQL,
  JIRA_PROJECT_KEY,
  JIRA_ISSUE_TYPES,
  JIRA_STATUS_NAMES,
  JIRA_START_DATE,
  JIRA_END_DATE,
  JIRA_MAX_ISSUES,
  LOG_LEVEL
} = loadEnvConfig();

function buildJql() {
  // If explicit JQL provided, use it as-is.
  if (JIRA_JQL && JIRA_JQL.trim().length) return JIRA_JQL.trim();
  const parts = [];
  if (JIRA_PROJECT_KEY) parts.push(`project = "${JIRA_PROJECT_KEY}"`);
  // Optional: Filter by issue types (leave empty to include all types)
  if (JIRA_ISSUE_TYPES && JIRA_ISSUE_TYPES.trim().length > 0) {
    const types = JIRA_ISSUE_TYPES.split(',').map(s => s.trim()).filter(Boolean);
    if (types.length === 1) parts.push(`issuetype = "${types[0]}"`);
    else if (types.length) parts.push(`issuetype in (${types.map(t=>`"${t}"`).join(', ')})`);
  }
  // Optional: Filter by status names (leave empty to include all statuses)
  if (JIRA_STATUS_NAMES && JIRA_STATUS_NAMES.trim().length > 0) {
    const statuses = JIRA_STATUS_NAMES.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) parts.push(`status = "${statuses[0]}"`);
    else if (statuses.length) parts.push(`status in (${statuses.map(s=>`"${s}"`).join(', ')})`);
  }
  if (JIRA_START_DATE) parts.push(`created >= '${JIRA_START_DATE}'`);
  if (JIRA_END_DATE) parts.push(`created <= '${JIRA_END_DATE}'`);
  const jql = parts.join(' AND ');
  return jql + ' ORDER BY created DESC';
}

export async function fetchIssues({ maxIssues = Number(JIRA_MAX_ISSUES) || undefined }) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  const jql = buildJql();

  if (LOG_LEVEL === 'debug') {
    console.log('[debug] Final JQL:', jql);
  }

  const pageSize = 50;
  let all = [];
  let nextPageToken = '';

  while (true) {
    const remaining = maxIssues ? Math.max(0, maxIssues - all.length) : pageSize;
    const maxResults = remaining && remaining < pageSize ? remaining : pageSize;
    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
    const params = {
      jql,
      maxResults,
      expand: 'changelog',
      fields: '*all',
      ...(nextPageToken ? { nextPageToken } : {})
    };

    const { data } = await axios.get(url, { headers, params });

    if (LOG_LEVEL === 'debug') {
      console.log(`[debug] Fetched ${data.issues.length} issues, nextPageToken: ${data.nextPageToken || 'none'}`);
    }

    all = all.concat(data.issues);

    // Stop if no more issues
    if (!data.issues || data.issues.length === 0) break;

    // Stop if reached max limit
    if (maxIssues && all.length >= maxIssues) break;

    // Stop if no next page token (last page)
    if (!data.nextPageToken) break;

    nextPageToken = data.nextPageToken;
  }

  return all;
}

export async function fetchViaProject({ projectKey, maxIssues = 50 }) {
  // Fallback: use /rest/api/3/project/{key}/statuses to enumerate issue keys, then fetch individually
  if (!projectKey) return [];
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  const results = [];
  try {
    // Try paginated issue navigation endpoint
    const navUrl = `${JIRA_BASE_URL}/rest/api/3/issue/picker`;
    const params = { query: projectKey, currentJQL: `project = ${projectKey}`, showSubTasks: true };
    const { data } = await axios.get(navUrl, { headers, params });
    if (LOG_LEVEL === 'debug') console.log('[debug] Issue picker returned', data.sections && data.sections.length, 'sections');
    const keys = [];
    if (data.sections) {
      for (const sec of data.sections) {
        if (sec.issues) {
          for (const iss of sec.issues) {
            if (iss.key) keys.push(iss.key);
            if (keys.length >= maxIssues) break;
          }
        }
        if (keys.length >= maxIssues) break;
      }
    }
    // Fetch each issue individually with changelog expansion and all fields to get SLA
    for (const key of keys.slice(0, maxIssues)) {
      try {
        const issueUrl = `${JIRA_BASE_URL}/rest/api/3/issue/${key}`;
        const issParams = {
          fields: '*all',
          expand: 'changelog'
        };
        const { data: issue } = await axios.get(issueUrl, { headers, params: issParams });
        results.push(issue);
      } catch (e) {
        if (LOG_LEVEL === 'debug') console.log('[debug] Failed fetching', key, e.message);
        // Retry without changelog if it fails
        try {
          const issParams = { fields: '*all' };
          const { data: issue } = await axios.get(issueUrl, { headers, params: issParams });
          results.push(issue);
        } catch (e2) {
          if (LOG_LEVEL === 'debug') console.log('[debug] Retry without changelog also failed for', key);
        }
      }
    }
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('[debug] Project browse fallback error:', e.message);
  }
  return results;
}
