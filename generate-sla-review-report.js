import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load latest metrics file
const dataDir = path.join(__dirname, 'data');
const files = fs.readdirSync(dataDir)
  .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.error('No metrics files found');
  process.exit(1);
}

const latestFile = path.join(dataDir, files[0]);
const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

console.log('='.repeat(80));
console.log('SLA COMPLIANCE & OWNERSHIP REVIEW REPORT');
console.log('Q4 2025 Performance Analysis');
console.log('='.repeat(80));
console.log();

// Period info
console.log(`Report Period: ${data.period.start} to ${data.period.end}`);
console.log(`Generated: ${new Date().toLocaleString()}`);
console.log(`Total Tickets Analyzed: ${data.metrics.length}`);
console.log();

// Calculate SLA Compliance the same way the dashboard does
let onCallHoursTotal = 0, onCallHoursMet = 0;
let afterHoursTotal = 0, afterHoursMet = 0;
let overallTotal = 0, overallMet = 0;

data.metrics.forEach(issue => {
  const whoWasOnCall = issue.whoWasOnCall;
  const isOffHours = whoWasOnCall && (
    whoWasOnCall === '[Weekend]' ||
    whoWasOnCall === '[After Hours]' ||
    whoWasOnCall === '[Before Oct 31]'
  );

  // Check SLA status based on on-call response time (using business hours)
  if (issue.sla && issue.sla.length > 0 && issue.businessHoursToFirstOnCallAction !== null) {
    const firstSla = issue.sla[0];
    const goalMinutes = firstSla.goalDuration ? firstSla.goalDuration / (1000 * 60) : null;

    if (goalMinutes !== null) {
      const breached = issue.businessHoursToFirstOnCallAction > goalMinutes;

      // Overall stats
      overallTotal++;
      if (!breached) overallMet++;

      // Split by on-call vs after-hours
      if (isOffHours) {
        afterHoursTotal++;
        if (!breached) afterHoursMet++;
      } else {
        onCallHoursTotal++;
        if (!breached) onCallHoursMet++;
      }
    }
  }
});

const overallCompliance = overallTotal > 0 ? ((overallMet / overallTotal) * 100).toFixed(1) : 0;
const onCallCompliance = onCallHoursTotal > 0 ? ((onCallHoursMet / onCallHoursTotal) * 100).toFixed(1) : 0;
const afterHoursCompliance = afterHoursTotal > 0 ? ((afterHoursMet / afterHoursTotal) * 100).toFixed(1) : 0;

const target = 90;
const gap = target - parseFloat(overallCompliance);

console.log('─'.repeat(80));
console.log('EXECUTIVE SUMMARY');
console.log('─'.repeat(80));
console.log();
console.log('SLA COMPLIANCE BREAKDOWN:');
console.log(`  Overall Compliance:    ${overallCompliance}% (${overallMet}/${overallTotal} tickets)`);
console.log(`  On-Call Hours SLA:     ${onCallCompliance}% (${onCallHoursMet}/${onCallHoursTotal} during coverage)`);
console.log(`  After-Hours SLA:       ${afterHoursCompliance}% (${afterHoursMet}/${afterHoursTotal} outside coverage)`);
console.log();
console.log(`Target Goal (Q4 2025):   ${target}%`);
console.log(`Gap to Target (Overall): ${gap.toFixed(1)} percentage points`);
console.log();

if (parseFloat(overallCompliance) >= target) {
  console.log('✓ TARGET ACHIEVED: SLA compliance has reached the 90% goal!');
} else {
  console.log(`⚠ IN PROGRESS: Need to improve ${gap.toFixed(1)}% to reach 90% target`);
}
console.log();

// On-call Manager Performance
console.log('─'.repeat(80));
console.log('ON-CALL MANAGER SLA PERFORMANCE');
console.log('─'.repeat(80));
console.log();

if (data.kpis?.onCallManagerKPIs && data.kpis.onCallManagerKPIs.length > 0) {
  console.log('Manager                    | Tickets | SLA Met | SLA Breached | Compliance | Avg Response');
  console.log('-'.repeat(95));
  
  const sorted = [...data.kpis.onCallManagerKPIs].sort((a, b) => 
    parseFloat(b.complianceRate) - parseFloat(a.complianceRate)
  );
  
  sorted.forEach(mgr => {
    const name = mgr.manager.padEnd(25);
    const total = String(mgr.totalTickets).padStart(7);
    const met = String(mgr.metSLA).padStart(7);
    const breached = String(mgr.breachedSLA).padStart(12);
    const compliance = (mgr.complianceRate + '%').padStart(10);
    const avgResponse = mgr.avgResponseTime ? (parseFloat(mgr.avgResponseTime).toFixed(1) + 'h').padStart(12) : 'N/A'.padStart(12);
    
    console.log(`${name} | ${total} | ${met} | ${breached} | ${compliance} | ${avgResponse}`);
  });
  console.log();
}

// Developer/Assignee Performance  
console.log('─'.repeat(80));
console.log('ASSIGNEE SLA PERFORMANCE & OWNERSHIP');
console.log('─'.repeat(80));
console.log();

if (data.kpis?.developerKPIs && data.kpis.developerKPIs.length > 0) {
  console.log('Assignee                   | Total | With Response | No Comment | Compliance | Resolution %');
  console.log('-'.repeat(95));
  
  const sorted = [...data.kpis.developerKPIs].sort((a, b) => b.totalTickets - a.totalTickets);
  
  sorted.forEach(dev => {
    const name = dev.developer.padEnd(25);
    const total = String(dev.totalTickets).padStart(5);
    const withResponse = String(dev.ticketsWithComment).padStart(13);
    const noComment = String(dev.ticketsWithoutComment).padStart(10);
    const compliance = dev.complianceRate ? (parseFloat(dev.complianceRate).toFixed(1) + '%').padStart(10) : 'N/A'.padStart(10);
    const resolution = dev.resolutionRate ? (parseFloat(dev.resolutionRate).toFixed(1) + '%').padStart(12) : 'N/A'.padStart(12);
    
    console.log(`${name} | ${total} | ${withResponse} | ${noComment} | ${compliance} | ${resolution}`);
  });
  console.log();
}

// System Lead Assignment Analysis
console.log('─'.repeat(80));
console.log('SYSTEM OWNERSHIP ANALYSIS');
console.log('─'.repeat(80));
console.log();

// Check for unassigned tickets
const unassignedTickets = data.metrics.filter(t => !t.assigneeCurrent || t.assigneeCurrent === 'Unassigned');
console.log(`Unassigned Tickets: ${unassignedTickets.length}`);
console.log(`Assigned Tickets:   ${data.metrics.length - unassignedTickets.length}`);
console.log(`Assignment Rate:    ${(((data.metrics.length - unassignedTickets.length) / data.metrics.length) * 100).toFixed(1)}%`);
console.log();

if (unassignedTickets.length > 0) {
  console.log('⚠ ACTION REQUIRED: Unassigned tickets exist');
  console.log();
  console.log('Sample Unassigned Tickets:');
  unassignedTickets.slice(0, 10).forEach(t => {
    console.log(`  - ${t.key}: ${t.summary.substring(0, 60)}...`);
  });
  console.log();
}

// Key system assignees
const systemLeads = {
  'Jeff Maciorowski': 'MR System',
  'Max Kuklin': 'Bulk Email',
  'Akshay Vijay Takkar': 'QualStage'
};

console.log('Designated System Leads:');
Object.entries(systemLeads).forEach(([lead, system]) => {
  const assignedCount = data.metrics.filter(t => t.assigneeCurrent === lead).length;
  console.log(`  ${lead.padEnd(25)} (${system.padEnd(12)}): ${assignedCount} tickets`);
});
console.log();

// SLA Breach Analysis
console.log('─'.repeat(80));
console.log('SLA BREACH ROOT CAUSE ANALYSIS');
console.log('─'.repeat(80));
console.log();

const breachedTickets = data.metrics.filter(t => {
  if (!t.sla || t.sla.length === 0 || t.businessHoursToFirstOnCallAction === null) return false;
  const goalMinutes = t.sla[0].goalDuration ? t.sla[0].goalDuration / (1000 * 60) : null;
  return goalMinutes && t.businessHoursToFirstOnCallAction > goalMinutes;
});

console.log(`Total SLA Breaches: ${breachedTickets.length} out of ${data.metrics.length} (${((breachedTickets.length / data.metrics.length) * 100).toFixed(1)}%)`);
console.log();

// Breach reasons
const breachReasons = {};
breachedTickets.forEach(t => {
  const timeToResponse = t.businessHoursToFirstOnCallAction;
  const hours = Math.floor(timeToResponse / 60);
  
  let category;
  if (hours < 6) category = 'Slightly over SLA (4-6h)';
  else if (hours < 12) category = 'Moderate delay (6-12h)';
  else if (hours < 24) category = 'Significant delay (12-24h)';
  else category = 'Critical delay (>24h)';
  
  breachReasons[category] = (breachReasons[category] || 0) + 1;
});

console.log('Breach Severity Distribution:');
Object.entries(breachReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
  console.log(`  ${reason.padEnd(30)}: ${count} tickets`);
});
console.log();

// Top breached assignees
const breachByAssignee = {};
breachedTickets.forEach(t => {
  const assignee = t.assigneeCurrent || 'Unassigned';
  breachByAssignee[assignee] = (breachByAssignee[assignee] || 0) + 1;
});

console.log('Top 5 Assignees with SLA Breaches:');
Object.entries(breachByAssignee)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([assignee, count]) => {
    console.log(`  ${assignee.padEnd(30)}: ${count} breaches`);
  });
console.log();

// Recommendations
console.log('─'.repeat(80));
console.log('RECOMMENDATIONS TO REACH 90% SLA COMPLIANCE');
console.log('─'.repeat(80));
console.log();

const recommendations = [];

if (parseFloat(overallCompliance) < 90) {
  recommendations.push(`1. IMMEDIATE FOCUS: Improve SLA compliance by ${gap.toFixed(1)}% to reach 90% target`);
  recommendations.push('   - Implement weekly SLA compliance review meetings');
  recommendations.push('   - Set up automated alerts for tickets approaching SLA breach');
}

if (unassignedTickets.length > 0) {
  recommendations.push(`2. OWNERSHIP: Assign all ${unassignedTickets.length} unassigned tickets to system leads`);
  recommendations.push('   - MR System tickets → Jeff Maciorowski');
  recommendations.push('   - Bulk Email tickets → Max Kuklin');
  recommendations.push('   - QualStage tickets → Akshay Vijay Takkar');
}

if (breachedTickets.length > 0) {
  const criticalDelays = breachReasons['Critical delay (>24h)'] || 0;
  if (criticalDelays > 0) {
    recommendations.push(`3. CRITICAL DELAYS: Address ${criticalDelays} tickets with >24h response time`);
    recommendations.push('   - Conduct root cause analysis for critical delays');
    recommendations.push('   - Review on-call schedule coverage and escalation procedures');
  }
}

// Check for low performers
if (data.kpis?.developerKPIs) {
  const lowPerformers = data.kpis.developerKPIs.filter(d => 
    d.complianceRate && parseFloat(d.complianceRate) < 80 && d.totalTickets >= 5
  );
  
  if (lowPerformers.length > 0) {
    recommendations.push(`4. INDIVIDUAL SUPPORT: ${lowPerformers.length} assignees below 80% compliance`);
    lowPerformers.forEach(dev => {
      recommendations.push(`   - ${dev.developer}: ${dev.complianceRate}% compliance (${dev.totalTickets} tickets)`);
    });
    recommendations.push('   - Provide additional training and support');
  }
}

recommendations.push('5. MONITORING: Implement weekly SLA compliance tracking dashboard');
recommendations.push('   - Set up automated weekly reports to leadership');
recommendations.push('   - Track progress toward 90% goal with trend analysis');

recommendations.forEach(rec => console.log(rec));
console.log();

console.log('─'.repeat(80));
console.log('PROGRESS TRACKING');
console.log('─'.repeat(80));
console.log();
console.log(`Current Status:     ${overallCompliance}% SLA compliance`);
console.log(`Goal:               90% by end of Q4 2025`);
console.log(`Weekly Improvement: ${(gap / 4).toFixed(1)}% needed per week (assuming 4 weeks remaining)`);
console.log();

const statusSymbol = parseFloat(overallCompliance) >= 90 ? '✓' : 
                     parseFloat(overallCompliance) >= 85 ? '↗' : '⚠';
console.log(`Status: ${statusSymbol} ${parseFloat(overallCompliance) >= 90 ? 'TARGET MET' : 
            parseFloat(overallCompliance) >= 85 ? 'ON TRACK' : 'NEEDS ATTENTION'}`);
console.log();

console.log('='.repeat(80));
console.log('END OF REPORT');
console.log('='.repeat(80));
