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

// Service Desk ID from env
const SERVICE_DESK_ID = process.env.JIRA_SERVICE_DESK_ID || '';

function buildJql() {
  // If explicit JQL provided, use it as-is.
  if (JIRA_JQL && JIRA_JQL.trim().length) return JIRA_JQL.trim();
  const parts = [];
  if (JIRA_PROJECT_KEY) parts.push(`project = ${JIRA_PROJECT_KEY}`);
  if (JIRA_ISSUE_TYPES) {
    const types = JIRA_ISSUE_TYPES.split(',').map(s => s.trim()).filter(Boolean);
    if (types.length === 1) parts.push(`issuetype = "${types[0]}"`);
    else if (types.length) parts.push(`issuetype in (${types.map(t=>`"${t}"`).join(', ')})`);
  }
  if (JIRA_STATUS_NAMES) {
    const statuses = JIRA_STATUS_NAMES.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) parts.push(`status = "${statuses[0]}"`);
    else if (statuses.length) parts.push(`status in (${statuses.map(s=>`"${s}"`).join(', ')})`);
  }
  if (JIRA_START_DATE) parts.push(`created >= '${JIRA_START_DATE}'`);
  if (JIRA_END_DATE) parts.push(`created <= '${JIRA_END_DATE}'`);
  parts.push('ORDER BY created DESC');
  return parts.join(' AND ');
}

export async function fetchIssues({ maxIssues = Number(JIRA_MAX_ISSUES) || undefined }) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  const jql = buildJql();
  if (LOG_LEVEL === 'debug') {
    console.log('[debug] Final JQL:', jql);
  }
  const pageSize = 50;
  let startAt = 0;
  let all = [];
  let useChangelog = true;
  while (true) {
    const remaining = maxIssues ? Math.max(0, maxIssues - all.length) : pageSize;
    const maxResults = remaining && remaining < pageSize ? remaining : pageSize;
    const url = `${JIRA_BASE_URL}/rest/api/3/search`;
    const params = {
      jql,
      startAt,
      maxResults,
      ...(useChangelog ? { expand: 'changelog' } : {}),
      fields: '*all'
    };
    let data;
    try {
      ({ data } = await axios.get(url, { headers, params }));
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 410) {
        console.warn('[warn] 410 on GET search; attempting POST body search fallback.');
        const body = {
          jql,
          startAt,
          maxResults,
          fields: ['summary','status','assignee','created','resolutiondate'],
          expand: useChangelog ? ['changelog'] : []
        };
        try {
          const postResp = await axios.post(url, body, { headers });
          data = postResp.data;
        } catch (postErr) {
          const postStatus = postErr.response && postErr.response.status;
          if (postStatus === 410 && useChangelog) {
            console.warn('[warn] 410 persists with POST + changelog; retrying POST without changelog.');
            useChangelog = false;
            continue;
          }
          if (postStatus === 410) {
            console.warn('[error] 410 after all attempts; returning empty, fallback will be used.');
            return all; // Return empty to trigger fallback
          }
          throw postErr;
        }
      } else if (status && status >= 400 && status < 500 && useChangelog) {
        console.warn(`Warning: ${status} on request with changelog expansion; retrying without changelog.`);
        useChangelog = false;
        continue; // retry this same page without changelog
      } else {
        throw err;
      }
    }
    all = all.concat(data.issues);
    if (maxIssues && all.length >= maxIssues) break;
    if (startAt + maxResults >= data.total) break;
    startAt += maxResults;
  }
  if (all.length === 0) {
    // Attempt Jira Service Management request search fallback (limited fields) if no issues and project key present.
    if (JIRA_PROJECT_KEY) {
      try {
        const fallbackUrl = `${JIRA_BASE_URL}/rest/servicedeskapi/request`;
        const params = { searchTerm: JIRA_PROJECT_KEY, requestStatus: 'ALL', limit: maxIssues || 50 };
        const { data } = await axios.get(fallbackUrl, { headers });
        if (data.values && Array.isArray(data.values)) {
          if (LOG_LEVEL === 'debug') console.log('[debug] JSM fallback returned', data.values.length, 'requests');
          // Map to issue-like objects minimal fields
          return data.values.map(v => ({
            key: v.issueKey || v.key || 'UNKN',
            fields: {
              summary: v.summary,
              status: { name: v.currentStatus && v.currentStatus.status ? v.currentStatus.status : (v.currentStatus && v.currentStatus.name) },
              assignee: v.requestParticipants && v.requestParticipants.length ? { displayName: v.requestParticipants[0].displayName } : null,
              created: v.createdDate || v.created || new Date().toISOString(),
              resolutiondate: null,
              comment: { comments: [] }
            },
            changelog: { histories: [] }
          }));
        }
      } catch (e) {
        if (LOG_LEVEL === 'debug') console.log('[debug] JSM fallback failed:', e.message);
      }
    }
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
