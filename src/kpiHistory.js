/**
 * Historical KPI Tracker
 * Stores and compares SLA performance metrics over time
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HISTORY_FILE = join(__dirname, '..', 'data', 'kpi-history.json');

/**
 * Load KPI history
 */
export function loadKPIHistory() {
  if (!existsSync(HISTORY_FILE)) {
    return { snapshots: [] };
  }
  
  try {
    const data = readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading KPI history:', error);
    return { snapshots: [] };
  }
}

/**
 * Save KPI snapshot to history
 */
export function saveKPISnapshot(kpis, period) {
  const history = loadKPIHistory();
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    period: {
      start: period.start,
      end: period.end
    },
    kpis: {
      overall: kpis.overall,
      managerCount: kpis.managerKPIs.length,
      topPerformer: kpis.managerKPIs.length > 0 ? kpis.managerKPIs[0].manager : null,
      topPerformerRate: kpis.managerKPIs.length > 0 ? kpis.managerKPIs[0].complianceRate : null
    }
  };
  
  // Avoid duplicate entries for the same period
  const existing = history.snapshots.findIndex(s => 
    s.period.start === period.start && s.period.end === period.end
  );
  
  if (existing >= 0) {
    history.snapshots[existing] = snapshot;
  } else {
    history.snapshots.push(snapshot);
  }
  
  // Sort by timestamp
  history.snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Keep last 50 snapshots
  if (history.snapshots.length > 50) {
    history.snapshots = history.snapshots.slice(0, 50);
  }
  
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`Saved KPI snapshot for period ${period.start} to ${period.end}`);
  
  return snapshot;
}

/**
 * Get quarterly comparison
 */
export function getQuarterlyComparison() {
  const history = loadKPIHistory();
  
  if (history.snapshots.length < 2) {
    return null;
  }
  
  // Group by quarter
  const quarters = {};
  
  history.snapshots.forEach(snapshot => {
    const date = new Date(snapshot.period.start);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const key = `${year}-Q${quarter}`;
    
    if (!quarters[key]) {
      quarters[key] = [];
    }
    quarters[key].push(snapshot);
  });
  
  // Calculate average for each quarter
  const quarterlyStats = Object.entries(quarters).map(([quarter, snapshots]) => {
    const avgCompliance = snapshots.reduce((sum, s) => 
      sum + parseFloat(s.kpis.overall.complianceRate), 0
    ) / snapshots.length;
    
    const totalTickets = snapshots.reduce((sum, s) => 
      sum + s.kpis.overall.totalTickets, 0
    );
    
    const avgTickets = totalTickets / snapshots.length;
    
    return {
      quarter,
      avgCompliance: avgCompliance.toFixed(1),
      totalTickets,
      avgTickets: avgTickets.toFixed(0),
      snapshotCount: snapshots.length,
      snapshots
    };
  }).sort((a, b) => a.quarter.localeCompare(b.quarter));
  
  // Calculate trends
  const trends = [];
  for (let i = 1; i < quarterlyStats.length; i++) {
    const current = quarterlyStats[i];
    const previous = quarterlyStats[i - 1];
    
    const complianceChange = parseFloat(current.avgCompliance) - parseFloat(previous.avgCompliance);
    const ticketChange = parseFloat(current.avgTickets) - parseFloat(previous.avgTickets);
    
    trends.push({
      from: previous.quarter,
      to: current.quarter,
      complianceChange: complianceChange.toFixed(1),
      improved: complianceChange > 0,
      ticketChange: ticketChange.toFixed(0),
      ticketGrowth: ((ticketChange / parseFloat(previous.avgTickets)) * 100).toFixed(1)
    });
  }
  
  return {
    quarters: quarterlyStats,
    trends
  };
}

/**
 * Get period-over-period comparison
 */
export function comparePeriods(currentPeriod, previousPeriod) {
  const history = loadKPIHistory();
  
  const current = history.snapshots.find(s => 
    s.period.start === currentPeriod.start && s.period.end === currentPeriod.end
  );
  
  const previous = history.snapshots.find(s => 
    s.period.start === previousPeriod.start && s.period.end === previousPeriod.end
  );
  
  if (!current || !previous) {
    return null;
  }
  
  const complianceChange = parseFloat(current.kpis.overall.complianceRate) - 
                           parseFloat(previous.kpis.overall.complianceRate);
  const ticketChange = current.kpis.overall.totalTickets - previous.kpis.overall.totalTickets;
  
  return {
    current: current.kpis.overall,
    previous: previous.kpis.overall,
    complianceChange: complianceChange.toFixed(1),
    improved: complianceChange > 0,
    ticketChange,
    ticketGrowth: previous.kpis.overall.totalTickets > 0 
      ? ((ticketChange / previous.kpis.overall.totalTickets) * 100).toFixed(1) 
      : 0
  };
}

/**
 * Export all snapshots for analysis
 */
export function exportHistory(outputPath) {
  const history = loadKPIHistory();
  
  if (!outputPath) {
    outputPath = join(__dirname, '..', 'data', `kpi-export-${Date.now()}.json`);
  }
  
  writeFileSync(outputPath, JSON.stringify(history, null, 2));
  console.log(`Exported KPI history to ${outputPath}`);
  
  return outputPath;
}

/**
 * Get all available periods from history
 */
export function getAvailablePeriods() {
  const history = loadKPIHistory();
  
  return history.snapshots.map(s => ({
    start: s.period.start,
    end: s.period.end,
    timestamp: s.timestamp,
    complianceRate: s.kpis.overall.complianceRate,
    totalTickets: s.kpis.overall.totalTickets
  }));
}
