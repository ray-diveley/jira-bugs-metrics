#!/usr/bin/env node
/**
 * CLI tool to generate SLA performance reports
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { calculateSLAKPIs } from './src/kpi.js';
import { 
  generateTextReport, 
  generateCSVReport, 
  generateQuarterlyReport,
  saveReport 
} from './src/reporting.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function loadLatestMetrics() {
  const dataDir = './data';
  const files = readdirSync(dataDir)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.error('No metrics files found. Run "npm start" first.');
    process.exit(1);
  }
  
  const latestFile = join(dataDir, files[0]);
  return JSON.parse(readFileSync(latestFile, 'utf8'));
}

function getPeriodFromMetrics(metrics) {
  // Try to extract from filename or use default
  const envPath = '.env';
  const envContent = readFileSync(envPath, 'utf8');
  const startMatch = envContent.match(/JIRA_START_DATE=(.*)/);
  const endMatch = envContent.match(/JIRA_END_DATE=(.*)/);
  
  return {
    start: startMatch ? startMatch[1].trim() : 'Unknown',
    end: endMatch ? endMatch[1].trim() : 'Unknown'
  };
}

function main() {
  switch (command) {
    case 'summary':
    case 'report': {
      const metricsData = loadLatestMetrics();
      const kpis = calculateSLAKPIs(metricsData);
      const period = getPeriodFromMetrics(metricsData);
      const report = generateTextReport(kpis, period);
      
      console.log(report);
      
      if (args.includes('--save')) {
        const filename = `sla-report-${Date.now()}.txt`;
        saveReport(report, filename);
      }
      break;
    }
    
    case 'csv': {
      const metricsData = loadLatestMetrics();
      const kpis = calculateSLAKPIs(metricsData);
      const period = getPeriodFromMetrics(metricsData);
      const csv = generateCSVReport(kpis, period);
      
      if (args.includes('--save')) {
        const filename = `sla-report-${Date.now()}.csv`;
        saveReport(csv, filename);
      } else {
        console.log(csv);
      }
      break;
    }
    
    case 'quarterly':
    case 'trends': {
      const report = generateQuarterlyReport();
      console.log(report);
      
      if (args.includes('--save')) {
        const filename = `quarterly-report-${Date.now()}.txt`;
        saveReport(report, filename);
      }
      break;
    }
    
    case 'help':
    default: {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║           SLA REPORT GENERATOR                                 ║
╚════════════════════════════════════════════════════════════════╝

USAGE:
  node generate-report.js <command> [options]

COMMANDS:
  summary     Generate executive summary report (default)
  report      Alias for summary
  csv         Generate CSV export for spreadsheets
  quarterly   Generate quarterly comparison report
  trends      Alias for quarterly
  help        Show this help message

OPTIONS:
  --save      Save report to reports/ directory

EXAMPLES:
  # Display summary in console
  node generate-report.js summary

  # Save summary to file
  node generate-report.js summary --save

  # Generate CSV export
  node generate-report.js csv --save

  # View quarterly trends
  node generate-report.js quarterly

NOTES:
  - Reports use the latest metrics collection
  - Run "npm start" to collect fresh metrics first
  - Quarterly reports require multiple collections
  - Saved reports go to reports/ directory

For more information, see docs/KPI-GUIDE.md
      `);
      break;
    }
  }
}

main();
