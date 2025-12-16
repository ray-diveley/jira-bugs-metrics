/**
 * KPI Calculator for SLA Performance Metrics
 */

import { calculateBusinessMinutes, isOutsideBusinessHours, getCreatedTimeContext } from './businessHours.js';

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
    'mkuklin': 'Max Kuklin'
  };

  ticketsWithSLA.forEach(ticket => {
    const sla = ticket.sla[0]; // First SLA entry
    const goalHours = sla.goalDuration / (1000 * 60 * 60);
    const goalMinutes = goalHours * 60;

    // Check if ticket was created outside business hours
    const createdOutsideHours = isOutsideBusinessHours(ticket.created);
    const createdContext = getCreatedTimeContext(ticket.created);

    // Track the on-call person (who was actually on-call when ticket was created)
    const whoWasOnCall = ticket.whoWasOnCall;
    if (whoWasOnCall && !whoWasOnCall.startsWith('[')) {
      const onCallPerson = emailToName[whoWasOnCall] || whoWasOnCall;
      if (ON_CALL_MANAGERS.includes(onCallPerson)) {
        const onCallResponseMinutes = ticket.timeToFirstOnCallActionMinutes;
        const shiftStart = ticket.onCallShiftStart ? new Date(ticket.onCallShiftStart) : null;
        const shiftEnd = ticket.onCallShiftEnd ? new Date(ticket.onCallShiftEnd) : null;

        if (onCallResponseMinutes === null) {
          // No response yet - check if still during their shift or if shift has ended
          const createdDate = new Date(ticket.created);
          const now = new Date();

          // Determine when accountability starts: shift start if ticket created before shift, otherwise creation time
          const accountabilityStart = shiftStart && createdDate < shiftStart ? shiftStart : createdDate;

          // If we have shift boundaries, check if response should have happened during shift
          if (shiftEnd && now > shiftEnd) {
            // Shift ended without response - measure time from accountability start to shift end
            const shiftDurationMinutes = (shiftEnd - accountabilityStart) / (1000 * 60);
            slaResults.push({
              ticket: ticket.key,
              manager: onCallPerson,
              role: 'on-call',
              met: false, // No response during shift = breach
              responseMinutes: null,
              businessMinutes: shiftDurationMinutes,
              actualMinutes: (now - createdDate) / (1000 * 60),
              goalMinutes,
              createdOutsideHours,
              createdContext,
              status: 'pending',
              shiftEnded: true,
              createdBeforeShift: createdDate < shiftStart
            });
          } else {
            // Still during shift or no shift data - measure business hours from accountability start
            const businessMinutes = calculateBusinessMinutes(accountabilityStart, now, onCallPerson);
            slaResults.push({
              ticket: ticket.key,
              manager: onCallPerson,
              role: 'on-call',
              met: businessMinutes <= goalMinutes,
              responseMinutes: null,
              businessMinutes,
              actualMinutes: (now - createdDate) / (1000 * 60),
              goalMinutes,
              createdOutsideHours,
              createdContext,
              status: 'pending',
              shiftEnded: false,
              createdBeforeShift: createdDate < shiftStart
            });
          }
        } else {
          // Has response - check if it was during their shift
          const createdDate = new Date(ticket.created);
          const responseDate = new Date(ticket.firstOnCallActionTime);

          // Determine when accountability starts: shift start if ticket created before shift, otherwise creation time
          const accountabilityStart = shiftStart && createdDate < shiftStart ? shiftStart : createdDate;

          // If we have shift boundaries, check if response was during shift
          if (shiftEnd && responseDate > shiftEnd) {
            // Responded after shift ended - breach (passed to next person)
            // Measure time from accountability start to shift end
            const shiftDurationMinutes = (shiftEnd - accountabilityStart) / (1000 * 60);
            slaResults.push({
              ticket: ticket.key,
              manager: onCallPerson,
              role: 'on-call',
              met: false, // Responded after shift = breach
              responseMinutes: onCallResponseMinutes,
              businessMinutes: shiftDurationMinutes,
              actualMinutes: onCallResponseMinutes,
              goalMinutes,
              createdOutsideHours,
              createdContext,
              status: 'responded-after-shift',
              respondedAfterShift: true,
              createdBeforeShift: createdDate < shiftStart
            });
          } else {
            // Responded during shift - calculate business hours from accountability start
            const effectiveResponseTime = shiftEnd && responseDate > shiftEnd ? shiftEnd : responseDate;
            const businessMinutes = calculateBusinessMinutes(accountabilityStart, effectiveResponseTime, onCallPerson);

            slaResults.push({
              ticket: ticket.key,
              manager: onCallPerson,
              role: 'on-call',
              met: businessMinutes <= goalMinutes,
              responseMinutes: onCallResponseMinutes,
              businessMinutes,
              actualMinutes: onCallResponseMinutes,
              goalMinutes,
              createdOutsideHours,
              createdContext,
              status: 'responded',
              respondedDuringShift: true,
              createdBeforeShift: createdDate < shiftStart
            });
          }
        }
      }
    }

    // Track ALL assignee responses (not just on-call managers)
    // This tracks how well developers respond to and resolve tickets after assignment
    if (ticket.assigneeCurrent && ticket.firstAssignmentTime) {
      const assignee = ticket.assigneeCurrent;
      const assigneeResponseMinutes = ticket.timeToFirstAssigneeCommentMinutes;
      const assignmentOutsideHours = isOutsideBusinessHours(ticket.firstAssignmentTime);
      const assignmentContext = getCreatedTimeContext(ticket.firstAssignmentTime);

      if (assigneeResponseMinutes === null) {
        // No comment - check if resolved instead
        if (ticket.resolutionDate) {
          // Resolved without comment - consider it as implicit response
          const assignmentDate = new Date(ticket.firstAssignmentTime);
          const resolutionDate = new Date(ticket.resolutionDate);
          const businessMinutes = calculateBusinessMinutes(assignmentDate, resolutionDate, assignee);
          const actualMinutes = (resolutionDate - assignmentDate) / (1000 * 60);
          slaResults.push({
            ticket: ticket.key,
            manager: assignee,
            role: 'assignee',
            met: businessMinutes <= goalMinutes,
            responseMinutes: actualMinutes,
            businessMinutes,
            actualMinutes,
            goalMinutes,
            createdOutsideHours: assignmentOutsideHours,
            createdContext: assignmentContext,
            status: 'resolved-no-comment',
            hasComment: false
          });
        } else {
          // Not resolved and no comment - needs attention!
          const assignmentDate = new Date(ticket.firstAssignmentTime);
          const now = new Date();
          const businessMinutes = calculateBusinessMinutes(assignmentDate, now, assignee);
          const actualMinutes = (now - assignmentDate) / (1000 * 60);
          slaResults.push({
            ticket: ticket.key,
            manager: assignee,
            role: 'assignee',
            met: businessMinutes <= goalMinutes,
            responseMinutes: null,
            businessMinutes,
            actualMinutes,
            goalMinutes,
            createdOutsideHours: assignmentOutsideHours,
            createdContext: assignmentContext,
            status: 'no-response',
            hasComment: false
          });
        }
      } else {
        // Has comment - check response time
        const assignmentDate = new Date(ticket.firstAssignmentTime);
        const responseDate = new Date(ticket.firstAssigneeCommentTime);
        const businessMinutes = calculateBusinessMinutes(assignmentDate, responseDate, assignee);
        slaResults.push({
          ticket: ticket.key,
          manager: assignee,
          role: 'assignee',
          met: businessMinutes <= goalMinutes,
          responseMinutes: assigneeResponseMinutes,
          businessMinutes,
          actualMinutes: assigneeResponseMinutes,
          goalMinutes,
          createdOutsideHours: assignmentOutsideHours,
          createdContext: assignmentContext,
          status: 'responded',
          hasComment: true
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

  // Manager-level performance (COMBINED - both roles)
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

  // Calculate compliance rate for each manager (combined)
  const managerKPIs = Object.entries(managerPerformance).map(([manager, stats]) => ({
    manager,
    ...stats,
    complianceRate: stats.total > 0 ? ((stats.met / stats.total) * 100).toFixed(1) : 0,
    avgResponseTime: calculateAvgResponseTime(slaResults.filter(r => r.manager === manager))
  })).sort((a, b) => b.complianceRate - a.complianceRate);

  // ON-CALL performance (first response to new tickets)
  const onCallPerformance = {};
  onCallResults.forEach(result => {
    if (!onCallPerformance[result.manager]) {
      onCallPerformance[result.manager] = { met: 0, breached: 0, pending: 0, total: 0 };
    }
    onCallPerformance[result.manager].total++;
    if (result.status === 'pending') {
      onCallPerformance[result.manager].pending++;
    } else if (result.met) {
      onCallPerformance[result.manager].met++;
    } else {
      onCallPerformance[result.manager].breached++;
    }
  });

  const onCallManagerKPIs = Object.entries(onCallPerformance).map(([manager, stats]) => ({
    manager,
    ...stats,
    complianceRate: stats.total > 0 ? ((stats.met / stats.total) * 100).toFixed(1) : 0,
    avgResponseTime: calculateAvgResponseTime(onCallResults.filter(r => r.manager === manager && (r.status === 'responded' || r.status === 'resolved')))
  })).sort((a, b) => b.complianceRate - a.complianceRate);

  // DEVELOPER performance (response and resolution after being assigned)
  const developerPerformance = {};
  const allTicketsByAssignee = {}; // Track ALL tickets (not just SLA ones)
  
  // Build comprehensive assignee stats from all metrics
  metrics.forEach(ticket => {
    if (ticket.assigneeCurrent && ticket.firstAssignmentTime) {
      const assignee = ticket.assigneeCurrent;
      
      if (!allTicketsByAssignee[assignee]) {
        allTicketsByAssignee[assignee] = {
          totalAssigned: 0,
          withComment: 0,
          withoutComment: 0,
          resolved: 0,
          stillOpen: 0,
          responseTimes: [],
          resolutionTimes: []
        };
      }
      
      const stats = allTicketsByAssignee[assignee];
      stats.totalAssigned++;
      
      // Track comment engagement
      if (ticket.firstAssigneeCommentTime) {
        stats.withComment++;
        if (ticket.timeToFirstAssigneeCommentMinutes !== null) {
          stats.responseTimes.push(ticket.timeToFirstAssigneeCommentMinutes);
        }
      } else {
        stats.withoutComment++;
      }
      
      // Track resolution
      if (ticket.resolutionDate) {
        stats.resolved++;
        if (ticket.timeToResolutionMinutes !== null) {
          stats.resolutionTimes.push(ticket.timeToResolutionMinutes);
        }
      } else {
        stats.stillOpen++;
      }
    }
  });
  
  // Calculate SLA compliance for assignees
  assigneeResults.forEach(result => {
    if (!developerPerformance[result.manager]) {
      developerPerformance[result.manager] = { met: 0, breached: 0, noResponse: 0, total: 0 };
    }
    developerPerformance[result.manager].total++;
    if (result.status === 'no-response') {
      developerPerformance[result.manager].noResponse++;
    } else if (result.met) {
      developerPerformance[result.manager].met++;
    } else {
      developerPerformance[result.manager].breached++;
    }
  });

  const developerKPIs = Object.entries(allTicketsByAssignee).map(([developer, stats]) => {
    const slaStats = developerPerformance[developer] || { met: 0, breached: 0, noResponse: 0, total: 0 };
    const avgResponseMinutes = stats.responseTimes.length > 0 
      ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length 
      : null;
    const avgResolutionMinutes = stats.resolutionTimes.length > 0
      ? stats.resolutionTimes.reduce((a, b) => a + b, 0) / stats.resolutionTimes.length
      : null;
    
    return {
      developer,
      totalAssigned: stats.totalAssigned,
      withComment: stats.withComment,
      withoutComment: stats.withoutComment,
      noCommentRate: ((stats.withoutComment / stats.totalAssigned) * 100).toFixed(1),
      resolved: stats.resolved,
      stillOpen: stats.stillOpen,
      resolutionRate: ((stats.resolved / stats.totalAssigned) * 100).toFixed(1),
      slaCompliance: slaStats.total > 0 ? ((slaStats.met / slaStats.total) * 100).toFixed(1) : 'N/A',
      slaMet: slaStats.met,
      slaBreached: slaStats.breached,
      slaNoResponse: slaStats.noResponse,
      avgResponseTime: avgResponseMinutes !== null ? formatMinutes(avgResponseMinutes) : 'N/A',
      avgResolutionTime: avgResolutionMinutes !== null ? formatMinutes(avgResolutionMinutes) : 'N/A'
    };
  }).sort((a, b) => b.totalAssigned - a.totalAssigned);

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
    onCallManagerKPIs,
    developerKPIs,
    timeAnalysis: {
      byDayOfWeek,
      byHourOfDay
    },
    responseTimeDistribution,
    details: slaResults
  };
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else {
    return `${mins}m`;
  }
}

function calculateAvgResponseTime(results) {
  const responded = results.filter(r => r.businessMinutes !== null && r.businessMinutes !== undefined);
  if (responded.length === 0) return 'N/A';
  const avg = responded.reduce((sum, r) => sum + r.businessMinutes, 0) / responded.length;
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

    if (m.sla && m.sla.length > 0 && m.businessHoursToFirstOnCallAction !== null && m.businessHoursToFirstOnCallAction !== undefined) {
      const goalMinutes = m.sla[0].goalDuration / (1000 * 60);
      if (m.businessHoursToFirstOnCallAction <= goalMinutes) {
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

    if (m.sla && m.sla.length > 0 && m.businessHoursToFirstOnCallAction !== null && m.businessHoursToFirstOnCallAction !== undefined) {
      const goalMinutes = (m.sla[0].goalDuration / (1000 * 60));
      if (m.businessHoursToFirstOnCallAction <= goalMinutes) {
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
    const minutes = r.businessMinutes !== null && r.businessMinutes !== undefined ? r.businessMinutes : r.responseMinutes;
    if (minutes === null || minutes === undefined) {
      categories['No response']++;
    } else if (minutes < 60) {
      categories['Under 1 hour']++;
    } else if (minutes < 120) {
      categories['1-2 hours']++;
    } else if (minutes < 240) {
      categories['2-4 hours']++;
    } else if (minutes < 480) {
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

/**
 * Get individual performance trends over time
 * @param {Array} history - Array of KPI snapshots from kpi-history.json
 * @param {string} personName - Name of person to analyze
 * @returns {Object} Performance trends by role
 */
export function getPersonalTrends(history, personName) {
  const trends = {
    person: personName,
    onCallTrends: [],
    developerTrends: [],
    combinedTrends: []
  };

  history.forEach(snapshot => {
    const date = snapshot.timestamp;
    const period = `${snapshot.period.start} to ${snapshot.period.end}`;

    // On-call performance
    const onCallPerf = snapshot.kpis.onCallManagerKPIs?.find(k => k.manager === personName);
    if (onCallPerf) {
      trends.onCallTrends.push({
        date,
        period,
        complianceRate: parseFloat(onCallPerf.complianceRate),
        total: onCallPerf.total,
        met: onCallPerf.met,
        breached: onCallPerf.breached,
        avgResponseTime: onCallPerf.avgResponseTime
      });
    }

    // Developer performance
    const devPerf = snapshot.kpis.developerKPIs?.find(k => k.developer === personName);
    if (devPerf) {
      trends.developerTrends.push({
        date,
        period,
        complianceRate: parseFloat(devPerf.complianceRate),
        total: devPerf.total,
        met: devPerf.met,
        breached: devPerf.breached,
        avgResponseTime: devPerf.avgResponseTime
      });
    }

    // Combined performance
    const combinedPerf = snapshot.kpis.managerKPIs?.find(k => k.manager === personName);
    if (combinedPerf) {
      trends.combinedTrends.push({
        date,
        period,
        complianceRate: parseFloat(combinedPerf.complianceRate),
        total: combinedPerf.total,
        met: combinedPerf.met,
        breached: combinedPerf.breached,
        avgResponseTime: combinedPerf.avgResponseTime
      });
    }
  });

  return trends;
}

/**
 * Compare performance between two periods for all people
 * @param {Object} currentKPIs - Current period KPIs
 * @param {Object} previousKPIs - Previous period KPIs
 * @returns {Object} Detailed comparison by role
 */
export function comparePerformanceByRole(currentKPIs, previousKPIs) {
  const comparison = {
    onCallComparison: [],
    developerComparison: [],
    combinedComparison: []
  };

  // On-call manager comparison
  if (currentKPIs.onCallManagerKPIs && previousKPIs.onCallManagerKPIs) {
    currentKPIs.onCallManagerKPIs.forEach(curr => {
      const prev = previousKPIs.onCallManagerKPIs.find(p => p.manager === curr.manager);
      if (prev) {
        const complianceChange = parseFloat(curr.complianceRate) - parseFloat(prev.complianceRate);
        comparison.onCallComparison.push({
          manager: curr.manager,
          currentRate: curr.complianceRate,
          previousRate: prev.complianceRate,
          change: complianceChange.toFixed(1),
          improved: complianceChange >= 0,
          currentTotal: curr.total,
          previousTotal: prev.total
        });
      }
    });
  }

  // Developer comparison
  if (currentKPIs.developerKPIs && previousKPIs.developerKPIs) {
    currentKPIs.developerKPIs.forEach(curr => {
      const prev = previousKPIs.developerKPIs.find(p => p.developer === curr.developer);
      if (prev) {
        const complianceChange = parseFloat(curr.complianceRate) - parseFloat(prev.complianceRate);
        comparison.developerComparison.push({
          developer: curr.developer,
          currentRate: curr.complianceRate,
          previousRate: prev.complianceRate,
          change: complianceChange.toFixed(1),
          improved: complianceChange >= 0,
          currentTotal: curr.total,
          previousTotal: prev.total
        });
      }
    });
  }

  // Combined comparison
  if (currentKPIs.managerKPIs && previousKPIs.managerKPIs) {
    currentKPIs.managerKPIs.forEach(curr => {
      const prev = previousKPIs.managerKPIs.find(p => p.manager === curr.manager);
      if (prev) {
        const complianceChange = parseFloat(curr.complianceRate) - parseFloat(prev.complianceRate);
        comparison.combinedComparison.push({
          person: curr.manager,
          currentRate: curr.complianceRate,
          previousRate: prev.complianceRate,
          change: complianceChange.toFixed(1),
          improved: complianceChange >= 0,
          currentTotal: curr.total,
          previousTotal: prev.total
        });
      }
    });
  }

  return comparison;
}
