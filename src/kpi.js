/**
 * KPI Calculator for SLA Performance Metrics
 */

export function calculateSLAKPIs(metricsData) {
  const { metrics } = metricsData;
  
  // Define on-call managers
  const ON_CALL_MANAGERS = [
    'Brad Goldberg',
    'Jeff Maciorowski',
    'Akshay Vijay Takkar',
    'Grigoriy Semenenko',
    'Randy Dahl',
    'Evgeniy Suhov',
    'Max Kuklin'
  ];
  
  // Overall SLA Performance
  const totalTickets = metrics.length;
  const ticketsWithSLA = metrics.filter(m => m.sla && m.sla.length > 0);
  
  // Calculate SLA compliance
  // Track BOTH on-call manager response AND assignee response
  const slaResults = [];
  
  // Email to name mapping for whoWasOnCall
  const emailToName = {
    'bgoldberg': 'Brad Goldberg',
    'jmaciorowski': 'Jeff Maciorowski',
    'atakkar': 'Akshay Vijay Takkar',
    'gsemenenko': 'Grigoriy Semenenko',
    'rdahl': 'Randy Dahl',
    'esuhov': 'Evgeniy Suhov',
    'mkulkin': 'Max Kuklin'
  };
  
  ticketsWithSLA.forEach(ticket => {
    const sla = ticket.sla[0]; // First SLA entry
    const goalHours = sla.goalDuration / (1000 * 60 * 60);
    const goalMinutes = goalHours * 60;
    
    // Track the on-call person (who was actually on-call when ticket was created)
    const whoWasOnCall = ticket.whoWasOnCall;
    if (whoWasOnCall && !whoWasOnCall.startsWith('[')) {
      const onCallPerson = emailToName[whoWasOnCall] || whoWasOnCall;
      if (ON_CALL_MANAGERS.includes(onCallPerson)) {
        const onCallResponseMinutes = ticket.timeToFirstOnCallActionMinutes;
        
        if (onCallResponseMinutes === null) {
          const createdDate = new Date(ticket.created);
          const now = new Date();
          const elapsedMinutes = (now - createdDate) / (1000 * 60);
          slaResults.push({
            ticket: ticket.key,
            manager: onCallPerson,
            role: 'on-call',
            met: elapsedMinutes <= goalMinutes,
            responseMinutes: null,
            goalMinutes,
            status: 'pending'
          });
        } else {
          slaResults.push({
            ticket: ticket.key,
            manager: onCallPerson,
            role: 'on-call',
            met: onCallResponseMinutes <= goalMinutes,
            responseMinutes: onCallResponseMinutes,
            goalMinutes,
            status: 'responded'
          });
        }
      }
    }
    
    // Track the assignee response (if different from on-call manager and is also a manager)
    if (ticket.assigneeCurrent && 
        ticket.assigneeCurrent !== ticket.assignedBy &&
        ON_CALL_MANAGERS.includes(ticket.assigneeCurrent) &&
        ticket.firstAssignmentTime) {
      const assigneeResponseMinutes = ticket.timeToFirstAssigneeCommentMinutes;
      
      if (assigneeResponseMinutes === null) {
        // No comment - check if resolved instead
        if (ticket.resolutionDate) {
          const assignmentDate = new Date(ticket.firstAssignmentTime);
          const resolutionDate = new Date(ticket.resolutionDate);
          const resolutionMinutes = (resolutionDate - assignmentDate) / (1000 * 60);
          slaResults.push({
            ticket: ticket.key,
            manager: ticket.assigneeCurrent,
            role: 'assignee',
            met: resolutionMinutes <= goalMinutes,
            responseMinutes: resolutionMinutes,
            goalMinutes,
            status: 'resolved'
          });
        } else {
          // Not resolved either - still pending
          const assignmentDate = new Date(ticket.firstAssignmentTime);
          const now = new Date();
          const elapsedMinutes = (now - assignmentDate) / (1000 * 60);
          slaResults.push({
            ticket: ticket.key,
            manager: ticket.assigneeCurrent,
            role: 'assignee',
            met: elapsedMinutes <= goalMinutes,
            responseMinutes: null,
            goalMinutes,
            status: 'pending'
          });
        }
      } else {
        slaResults.push({
          ticket: ticket.key,
          manager: ticket.assigneeCurrent,
          role: 'assignee',
          met: assigneeResponseMinutes <= goalMinutes,
          responseMinutes: assigneeResponseMinutes,
          goalMinutes,
          status: 'responded'
        });
      }
    }
  });
  
  const metCount = slaResults.filter(r => r.met).length;
  const breachedCount = slaResults.filter(r => !r.met && (r.status === 'responded' || r.status === 'resolved')).length;
  const pendingCount = slaResults.filter(r => r.status === 'pending').length;
  
  const complianceRate = totalTickets > 0 ? (metCount / totalTickets) * 100 : 0;
  
  // Separate on-call and assignee metrics
  const onCallResults = slaResults.filter(r => r.role === 'on-call');
  const assigneeResults = slaResults.filter(r => r.role === 'assignee');
  
  const onCallMet = onCallResults.filter(r => r.met).length;
  const onCallBreached = onCallResults.filter(r => !r.met && (r.status === 'responded' || r.status === 'resolved')).length;
  const onCallPending = onCallResults.filter(r => r.status === 'pending').length;
  const onCallCompliance = onCallResults.length > 0 ? ((onCallMet / onCallResults.length) * 100).toFixed(1) : '0.0';
  
  const assigneeMet = assigneeResults.filter(r => r.met).length;
  const assigneeBreached = assigneeResults.filter(r => !r.met && (r.status === 'responded' || r.status === 'resolved')).length;
  const assigneePending = assigneeResults.filter(r => r.status === 'pending').length;
  const assigneeCompliance = assigneeResults.length > 0 ? ((assigneeMet / assigneeResults.length) * 100).toFixed(1) : '0.0';
  
  // Manager-level performance
  const managerPerformance = {};
  slaResults.forEach(result => {
    if (!managerPerformance[result.manager]) {
      managerPerformance[result.manager] = { met: 0, breached: 0, pending: 0, total: 0 };
    }
    managerPerformance[result.manager].total++;
    if (result.status === 'pending') {
      managerPerformance[result.manager].pending++;
    } else if (result.met) {
      managerPerformance[result.manager].met++;
    } else {
      managerPerformance[result.manager].breached++;
    }
  });
  
  // Calculate compliance rate for each manager
  const managerKPIs = Object.entries(managerPerformance).map(([manager, stats]) => ({
    manager,
    ...stats,
    complianceRate: stats.total > 0 ? ((stats.met / stats.total) * 100).toFixed(1) : 0,
    avgResponseTime: calculateAvgResponseTime(slaResults.filter(r => r.manager === manager))
  })).sort((a, b) => b.complianceRate - a.complianceRate);
  
  // Time-based analysis
  const byDayOfWeek = analyzeByDayOfWeek(metrics);
  const byHourOfDay = analyzeByHourOfDay(metrics);
  
  // Response time distribution
  const responseTimeDistribution = categorizeResponseTimes(slaResults);
  
  return {
    overall: {
      totalTickets,
      metSLA: metCount,
      breachedSLA: breachedCount,
      pendingSLA: pendingCount,
      complianceRate: complianceRate.toFixed(1),
      avgResponseTime: calculateAvgResponseTime(slaResults.filter(r => r.status === 'responded'))
    },
    onCall: {
      totalTickets: onCallResults.length,
      metSLA: onCallMet,
      breachedSLA: onCallBreached,
      pendingSLA: onCallPending,
      complianceRate: onCallCompliance,
      avgResponseTime: calculateAvgResponseTime(onCallResults.filter(r => r.status === 'responded'))
    },
    assignee: {
      totalTickets: assigneeResults.length,
      metSLA: assigneeMet,
      breachedSLA: assigneeBreached,
      pendingSLA: assigneePending,
      complianceRate: assigneeCompliance,
      avgResponseTime: calculateAvgResponseTime(assigneeResults.filter(r => r.status === 'responded' || r.status === 'resolved'))
    },
    managerKPIs,
    timeAnalysis: {
      byDayOfWeek,
      byHourOfDay
    },
    responseTimeDistribution,
    details: slaResults
  };
}

function calculateAvgResponseTime(results) {
  const responded = results.filter(r => r.responseMinutes !== null);
  if (responded.length === 0) return 'N/A';
  const avg = responded.reduce((sum, r) => sum + r.responseMinutes, 0) / responded.length;
  const hours = Math.floor(avg / 60);
  const minutes = Math.floor(avg % 60);
  return `${hours}h ${minutes}m`;
}

function analyzeByDayOfWeek(metrics) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const analysis = {};
  
  metrics.forEach(m => {
    const created = new Date(m.created);
    const dayName = days[created.getDay()];
    
    if (!analysis[dayName]) {
      analysis[dayName] = { total: 0, met: 0, breached: 0 };
    }
    
    analysis[dayName].total++;
    
    if (m.sla && m.sla.length > 0 && m.timeToFirstOnCallActionMinutes !== null) {
      const goalMinutes = m.sla[0].goalDuration / (1000 * 60);
      if (m.timeToFirstOnCallActionMinutes <= goalMinutes) {
        analysis[dayName].met++;
      } else {
        analysis[dayName].breached++;
      }
    }
  });
  
  return Object.entries(analysis).map(([day, stats]) => ({
    day,
    ...stats,
    complianceRate: stats.total > 0 ? ((stats.met / stats.total) * 100).toFixed(1) : 0
  }));
}

function analyzeByHourOfDay(metrics) {
  const analysis = {};
  
  metrics.forEach(m => {
    const created = new Date(m.created);
    const hour = created.getHours();
    
    if (!analysis[hour]) {
      analysis[hour] = { total: 0, met: 0, breached: 0 };
    }
    
    analysis[hour].total++;
    
    if (m.sla && m.sla.length > 0 && m.timeToFirstOnCallActionMinutes !== null) {
      const goalMinutes = (m.sla[0].goalDuration / (1000 * 60));
      if (m.timeToFirstOnCallActionMinutes <= goalMinutes) {
        analysis[hour].met++;
      } else {
        analysis[hour].breached++;
      }
    }
  });
  
  return Object.entries(analysis).map(([hour, stats]) => ({
    hour: `${hour.padStart(2, '0')}:00`,
    ...stats,
    complianceRate: stats.total > 0 ? ((stats.met / stats.total) * 100).toFixed(1) : 0
  })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
}

function categorizeResponseTimes(results) {
  const categories = {
    'Under 1 hour': 0,
    '1-2 hours': 0,
    '2-4 hours': 0,
    '4-8 hours': 0,
    'Over 8 hours': 0,
    'No response': 0
  };
  
  results.forEach(r => {
    if (r.responseMinutes === null) {
      categories['No response']++;
    } else if (r.responseMinutes < 60) {
      categories['Under 1 hour']++;
    } else if (r.responseMinutes < 120) {
      categories['1-2 hours']++;
    } else if (r.responseMinutes < 240) {
      categories['2-4 hours']++;
    } else if (r.responseMinutes < 480) {
      categories['4-8 hours']++;
    } else {
      categories['Over 8 hours']++;
    }
  });
  
  return categories;
}

/**
 * Compare two periods and calculate trends
 */
export function comparePeriods(currentKPIs, previousKPIs) {
  if (!previousKPIs) {
    return { hasPrevious: false };
  }
  
  const complianceChange = parseFloat(currentKPIs.overall.complianceRate) - parseFloat(previousKPIs.overall.complianceRate);
  const ticketChange = currentKPIs.overall.totalTickets - previousKPIs.overall.totalTickets;
  
  return {
    hasPrevious: true,
    complianceChange: complianceChange.toFixed(1),
    complianceImprovement: complianceChange > 0,
    ticketChange,
    ticketGrowth: ((ticketChange / previousKPIs.overall.totalTickets) * 100).toFixed(1),
    managerComparison: compareManagers(currentKPIs.managerKPIs, previousKPIs.managerKPIs)
  };
}

function compareManagers(current, previous) {
  const comparison = [];
  
  current.forEach(curr => {
    const prev = previous.find(p => p.manager === curr.manager);
    if (prev) {
      const change = parseFloat(curr.complianceRate) - parseFloat(prev.complianceRate);
      comparison.push({
        manager: curr.manager,
        currentRate: curr.complianceRate,
        previousRate: prev.complianceRate,
        change: change.toFixed(1),
        improved: change >= 0
      });
    }
  });
  
  return comparison;
}

/**
 * Store KPI data with timestamp for historical tracking
 */
export function saveKPISnapshot(kpis, filepath) {
  const snapshot = {
    timestamp: new Date().toISOString(),
    period: {
      start: process.env.JIRA_START_DATE,
      end: process.env.JIRA_END_DATE
    },
    kpis
  };
  
  return snapshot;
}
