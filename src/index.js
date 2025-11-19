import fs from 'fs';
import path from 'path';
import { loadEnvConfig } from './loadEnv.js';
import { fetchIssues, fetchViaProject } from './jiraClient.js';
import { computeMetrics, summarize } from './metrics.js';

const cfg = loadEnvConfig();

async function main() {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
  let issues;
  if (cfg.JIRA_DRY_RUN) {
    issues = loadSampleIssues();
    console.log('Dry run: using sample issues');
  } else {
    issues = await fetchIssues({});
    console.log(`Fetched ${issues.length} issues from Jira search.`);
    if (issues.length === 0 && cfg.JIRA_PROJECT_KEY) {
      const fallback = await fetchViaProject({ projectKey: cfg.JIRA_PROJECT_KEY, maxIssues: Number(cfg.JIRA_MAX_ISSUES) || 50 });
      console.log(`Project browse fallback returned ${fallback.length} issues.`);
      issues = fallback;
    }
  }
  const metrics = issues.map(computeMetrics);
  const summary = summarize(metrics);
  const out = { generatedAt: new Date().toISOString(), summary, metrics };
  const jsonPath = path.join('data', `metrics-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  writeSummaryCsv(metrics);
  console.log('Summary:', summary);
  console.log('Wrote metrics file:', jsonPath);
}

function loadSampleIssues() {
  const p = path.join('data','sample_issues.json');
  return JSON.parse(fs.readFileSync(p,'utf8')).issues;
}

function ensureDataDir() {
  if (!fs.existsSync('data')) fs.mkdirSync('data');
}

function writeSummaryCsv(metrics) {
  const headers = [
    'key','summary','status','assigneeCurrent','created','resolutionDate','firstAssignmentTime','firstAssigneeCommentTime','openDurationMinutes','timeToResolutionMinutes','timeToFirstAssigneeCommentMinutes'
  ];
  const rows = [headers.join(',')].concat(metrics.map(m => headers.map(h => escapeCsv(m[h])).join(',')));
  fs.writeFileSync(path.join('data','latest-summary.csv'), rows.join('\n'));
}

function escapeCsv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

main().catch(err => {
  console.error('Error running metrics:', err.message);
  process.exitCode = 1;
});
