import fs from 'fs';
import path from 'path';
import { loadEnvConfig } from './loadEnv.js';
import { fetchIssues, fetchViaProject } from './jiraClient.js';
import { computeMetrics, summarize } from './metrics.js';
import { calculateSLAKPIs } from './kpi.js';
import { saveKPISnapshot } from './kpiHistory.js';
import { initializeOpsgenie, getOnCallForTimestamps } from './opsgenieClient.js';

const cfg = loadEnvConfig();

async function main() {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
  
  // Initialize Opsgenie if configured
  let scheduleId = null;
  if (cfg.OPSGENIE_API_KEY) {
    try {
      scheduleId = await initializeOpsgenie(cfg);
    } catch (error) {
      console.warn('Opsgenie initialization failed, continuing without on-call data:', error.message);
    }
  }
  
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
      
      // Compute metrics first to get assignment dates
      const fallbackMetrics = fallback.map(computeMetrics);
      
      // Filter by assignment date OR creation date
      const startDate = cfg.JIRA_START_DATE ? new Date(cfg.JIRA_START_DATE) : null;
      const endDate = cfg.JIRA_END_DATE ? new Date(cfg.JIRA_END_DATE) : null;
      
      const filteredMetrics = fallbackMetrics.filter(metric => {
        // Check if created in range
        const created = metric.created ? new Date(metric.created) : null;
        const createdInRange = created && 
          (!startDate || created >= startDate) && 
          (!endDate || created <= endDate);
        
        // Check if assigned in range
        const assigned = metric.firstAssignmentTime ? new Date(metric.firstAssignmentTime) : null;
        const assignedInRange = assigned && 
          (!startDate || assigned >= startDate) && 
          (!endDate || assigned <= endDate);
        
        // Include if either created OR assigned in range
        return createdInRange || assignedInRange;
      });
      
      // Map back to original issues for further processing
      const filteredKeys = new Set(filteredMetrics.map(m => m.key));
      issues = fallback.filter(issue => filteredKeys.has(issue.key));
      
      console.log(`After date filtering (creation or assignment): ${issues.length} issues.`);
    }
  }
  
  let metrics = issues.map(computeMetrics);
  
  // Enrich metrics with Opsgenie on-call data
  if (scheduleId && cfg.OPSGENIE_API_KEY) {
    console.log('Fetching on-call schedule data from Opsgenie...');
    const timestamps = metrics.map(m => m.created).filter(Boolean);
    const onCallMap = await getOnCallForTimestamps(scheduleId, timestamps, cfg.OPSGENIE_API_KEY);
    
    // Add whoWasOnCall to each metric
    metrics = metrics.map(m => ({
      ...m,
      whoWasOnCall: m.created ? onCallMap.get(m.created) : null
    }));
    
    console.log(`Enriched ${metrics.length} tickets with on-call schedule data`);
  }
  
  const summary = summarize(metrics);
  const out = { generatedAt: new Date().toISOString(), summary, metrics };
  const jsonPath = path.join('data', `metrics-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  writeSummaryCsv(metrics);
  
  // Calculate and save KPI snapshot
  const kpis = calculateSLAKPIs(out);
  const period = {
    start: cfg.JIRA_START_DATE || 'N/A',
    end: cfg.JIRA_END_DATE || 'N/A'
  };
  saveKPISnapshot(kpis, period);
  
  console.log('Summary:', summary);
  console.log('SLA Compliance Rate:', kpis.overall.complianceRate + '%');
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
    'key','summary','status','assigneeCurrent','assignedBy','whoWasOnCall','created','resolutionDate','firstAssignmentTime','firstAssigneeCommentTime','openDurationMinutes','timeToResolutionMinutes','timeToFirstAssigneeCommentMinutes'
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
