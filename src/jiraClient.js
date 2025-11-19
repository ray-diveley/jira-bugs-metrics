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
      fields: [
        'summary','status','assignee','created','resolutiondate','comment'
      ]
    };
    let data;
    try {
      ({ data } = await axios.get(url, { headers, params }));
    } catch (err) {
      const status = err.response && err.response.status;
      if (status && status >= 400 && status < 500 && useChangelog) {
        console.warn(`Warning: ${status} on request with changelog expansion; retrying without changelog.`);
        useChangelog = false;
        continue; // retry this same page without changelog
      }
      throw err;
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
